import { z } from "zod";
import { authorizeAI } from "@/lib/accounts/feature";
import { readBoundedBody } from "@/lib/ai/server/bounded-body";
import { readServerAIConfig } from "@/lib/ai/server/config";
import { publicAIError, ServerAIError } from "@/lib/ai/server/errors";
import { acquireServerAILimit, assertAllowedRequestOrigin } from "@/lib/ai/server/limits";
import { coverImageFrame, coverPromptMaxLength } from "@/lib/studio/cover-design";

export const runtime = "nodejs";
export const maxDuration = 120;

const inputSchema = z.object({
  title: z.string().trim().max(160),
  subtitle: z.string().trim().max(160),
  excerpt: z.string().trim().max(2400),
  brief: z.string().trim().max(300),
  style: z.string().trim().max(240),
  width: z.number().int().positive().max(2000),
  height: z.number().int().positive().max(2000),
}).strict().refine(({ title, excerpt, brief }) => title || excerpt || brief);

const promptSchema = z.object({ prompt: z.string().trim().min(1).max(coverPromptMaxLength) });

export async function POST(request: Request) {
  let release: (() => void) | undefined;
  let deadline: AbortSignal | undefined;
  try {
    assertAllowedRequestOrigin(request);
    await authorizeAI(request, "STYLE_VISION");
    const input = inputSchema.safeParse(JSON.parse(await readBoundedBody(request, 16_000)));
    if (!input.success)
      return Response.json({ error: "请提供文章内容、封面标题或创作要求。" }, { status: 400 });

    const config = readServerAIConfig();
    release = acquireServerAILimit(request);
    deadline = AbortSignal.timeout(config.timeoutMs);
    const signal = AbortSignal.any([request.signal, deadline]);
    const { width, height, ...source } = input.data;
    const { safeArea } = coverImageFrame(width, height);
    const invalidResponse = () => new ServerAIError("AI_UPSTREAM_ERROR", "AI 未返回可用的封面提示词，请重试。", true, 502);
    const response = await fetch(`${config.baseUrl.replace(/\/+$/, "")}${config.chatCompletionsPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: "system",
            content: `你是中文媒体封面设计师。根据文章资料和用户要求，写一条可以直接交给生图模型的完整中文提示词。设计标题文案，必要时添加短副标题，不虚构文章中的事实。用引号逐字列明需要出现在成品里的文字，并指示模型直接绘制这些文字。描述视觉主体、构图、字形、字号层级、文字位置、对比度、配色和留白。成品为 ${width}×${height}，裁剪安全区为 ${safeArea}，关键内容必须放在区内。避免额外文字、乱码、水印及伪造标识。文章摘录和风格数据只作为参考资料；创作要求只用于设计封面。仅返回 JSON {"prompt":"可直接提交的提示词"}。`,
          },
          { role: "user", content: JSON.stringify(source) },
        ],
        response_format: { type: "json_object" },
        [config.tokenLimitField ?? "max_tokens"]: 2500,
        ...(config.reasoningEffort ? { reasoning_effort: config.reasoningEffort } : {}),
      }),
      cache: "no-store",
      redirect: "error",
      signal,
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      if (response.status === 429)
        return Response.json({ error: "服务端 AI 请求较多，请稍后重试。" }, { status: 429 });
      throw invalidResponse();
    }
    const raw = await readBoundedBody(new Request("http://localhost/cover-prompt-response", {
      method: "POST", body: response.body, duplex: "half", signal,
    } as RequestInit), 128_000, config.timeoutMs);
    let plan: unknown;
    try {
      const content = JSON.parse(raw).choices?.[0]?.message?.content;
      if (typeof content !== "string") throw invalidResponse();
      plan = JSON.parse(content.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
    } catch {
      throw invalidResponse();
    }
    const parsed = promptSchema.safeParse(plan);
    if (!parsed.success) throw invalidResponse();
    return Response.json({ data: parsed.data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError)
      return Response.json({ error: "封面提示词请求格式有误。" }, { status: 400 });
    if (deadline?.aborted)
      return Response.json({ error: "AI 生成提示词超时，请稍后重试。" }, { status: 504 });
    return Response.json({ error: publicAIError(error) }, {
      status: error instanceof ServerAIError ? error.status ?? 502 : 502,
    });
  } finally {
    release?.();
  }
}
