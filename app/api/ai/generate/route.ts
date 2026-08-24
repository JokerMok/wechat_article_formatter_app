import { z } from "zod";
import { aiPlatformIds, type ProviderGenerateOptions } from "../../../../lib/ai/provider";
import { unifiedArticleContentSchema } from "../../../../lib/content";
import { assertServerAIRequest, generateWithServerAI } from "../../../../lib/ai/server/gateway";
import { normalizeServerAIError, publicAIError, ServerAIError } from "../../../../lib/ai/server/errors";

export const runtime = "nodejs";

const requestSchema = z.strictObject({
  task: z.literal("generate-platform-variant"),
  sourceRevision: z.union([z.string(), z.number()]).optional(),
  source: unifiedArticleContentSchema,
  platforms: z.array(z.enum(aiPlatformIds)).min(1).max(aiPlatformIds.length),
});

const MAX_BODY_BYTES = 1_000_000;

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      throw new ServerAIError("AI_INVALID_REQUEST", "请求内容过大，请拆分后再生成。", false);
    }

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
    return Response.json({ ok: false, error: publicAIError(normalized) }, { status: statusForError(normalized.code) });
  }
}

function statusForError(code: ReturnType<typeof normalizeServerAIError>["code"]) {
  if (code === "AI_INVALID_REQUEST") return 400;
  if (code === "AI_NOT_CONFIGURED") return 503;
  if (code === "AI_UNAUTHORIZED_UPSTREAM") return 502;
  if (code === "AI_RATE_LIMITED") return 429;
  if (code === "AI_TIMEOUT") return 504;
  return 502;
}
