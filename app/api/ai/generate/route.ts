import { z } from "zod";
import { aiPlatformIds, generationAnalysisSchema, type ProviderGenerateOptions } from "../../../../lib/ai/provider";
import { unifiedArticleContentSchema } from "../../../../lib/content";
import { assertServerAIRequest, generateWithServerAI } from "../../../../lib/ai/server/gateway";
import { normalizeServerAIError, publicAIError, ServerAIError } from "../../../../lib/ai/server/errors";
import { acquireServerAILimit, assertAllowedRequestOrigin } from "../../../../lib/ai/server/limits";
import { readBoundedBody } from "../../../../lib/ai/server/bounded-body";
import { assertServerAIAccess } from "../../../../lib/ai/server/access";

export const runtime = "nodejs";
export const maxDuration = 120;

const requestSchema = z.strictObject({
  // Layout-only generation is local and must never turn this route into a
  // model proxy. The route is reserved for explicit content optimization.
  task: z.enum(["generate-platform-variant", "optimize-platform-variant"]),
  sourceRevision: z.union([z.string(), z.number()]).optional(),
  source: unifiedArticleContentSchema,
  analysis: generationAnalysisSchema.optional(),
  platforms: z.array(z.enum(aiPlatformIds)).min(1).max(aiPlatformIds.length).refine((platforms) => new Set(platforms).size === platforms.length),
});

const MAX_BODY_BYTES = 1_000_000;

export async function POST(request: Request) {
  let releaseLimit: (() => void) | undefined;
  try {
    assertAllowedRequestOrigin(request);
    assertServerAIAccess(request);
    const rawBody = await readBoundedBody(request, MAX_BODY_BYTES);

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
      generationMode: "reachOptimized",
      platforms: parsed.data.platforms,
      analysis: parsed.data.analysis,
      signal: request.signal,
    };
    const sourceIds = new Set(input.source.blocks.map((block) => block.id));
    if (input.analysis?.sections.some((section) => section.sourceBlockIds.some((id) => !sourceIds.has(id)))) {
      throw new ServerAIError("AI_INVALID_REQUEST", "分析结果与源文版本不一致，请重新分析。", false);
    }
    assertServerAIRequest(input);
    releaseLimit = acquireServerAILimit(request);
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
