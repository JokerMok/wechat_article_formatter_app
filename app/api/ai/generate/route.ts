import { z } from "zod";
import { aiPlatformIds, type ProviderGenerateOptions } from "../../../../lib/ai/provider";
import { unifiedArticleContentSchema } from "../../../../lib/content";
import { assertServerAIRequest, generateWithServerAI } from "../../../../lib/ai/server/gateway";
import { normalizeServerAIError, publicAIError, ServerAIError } from "../../../../lib/ai/server/errors";
import { acquireServerAILimit, assertAllowedRequestOrigin } from "../../../../lib/ai/server/limits";

export const runtime = "nodejs";
export const maxDuration = 120;

const requestSchema = z.strictObject({
  task: z.literal("generate-platform-variant"),
  sourceRevision: z.union([z.string(), z.number()]).optional(),
  source: unifiedArticleContentSchema,
  platforms: z.array(z.enum(aiPlatformIds)).min(1).max(aiPlatformIds.length).refine((platforms) => new Set(platforms).size === platforms.length),
});

const MAX_BODY_BYTES = 1_000_000;

export async function POST(request: Request) {
  let releaseLimit: (() => void) | undefined;
  try {
    assertAllowedRequestOrigin(request);
    releaseLimit = acquireServerAILimit(request);
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      throw new ServerAIError("AI_INVALID_REQUEST", "请求内容过大，请拆分后再生成。", false, 413);
    }

    const rawBody = await readBodyWithLimit(request, MAX_BODY_BYTES);

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      throw new ServerAIError("AI_INVALID_REQUEST", "请求格式无效。", false);
    }

    const parsed = requestSchema.safeParse(parsedBody);
    if (!parsed.success) {
      throw new ServerAIError("AI_INVALID_REQUEST", "请求内容无效，请检查文章和平台参数。", false);
    }

    const input: ProviderGenerateOptions = {
      source: parsed.data.source,
      sourceVersionId: parsed.data.sourceRevision === undefined ? undefined : String(parsed.data.sourceRevision),
      platforms: parsed.data.platforms,
      signal: request.signal,
    };
    assertServerAIRequest(input);
    const data = await generateWithServerAI(input);
    return Response.json({ ok: true, data });
  } catch (error) {
    const normalized = normalizeServerAIError(error);
    return Response.json({ ok: false, error: publicAIError(normalized) }, { status: statusForError(normalized) });
  } finally {
    releaseLimit?.();
  }
}

function statusForError(error: ReturnType<typeof normalizeServerAIError>) {
  if (error.code === "AI_INVALID_REQUEST") return error.status === 413 ? 413 : 400;
  if (error.code === "AI_NOT_CONFIGURED") return 503;
  if (error.code === "AI_UNAUTHORIZED_UPSTREAM") return 502;
  if (error.code === "AI_FORBIDDEN") return 403;
  if (error.code === "AI_RATE_LIMITED") return 429;
  if (error.code === "AI_TIMEOUT") return 504;
  if (error.code === "AI_INTERNAL_ERROR") return 500;
  return 502;
}

async function readBodyWithLimit(request: Request, maxBytes: number) {
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let byteLength = 0;

  while (true) {
    const next = await reader.read();
    if (next.done) break;
    byteLength += next.value.byteLength;
    if (byteLength > maxBytes) {
      await reader.cancel();
      throw new ServerAIError("AI_INVALID_REQUEST", "请求内容过大，请拆分后再生成。", false, 413);
    }
    chunks.push(decoder.decode(next.value, { stream: true }));
  }

  chunks.push(decoder.decode());
  return chunks.join("");
}
