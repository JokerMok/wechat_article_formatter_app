import { z } from "zod";
import { authorizeAI } from "@/lib/accounts/feature";
import { readBoundedBody } from "@/lib/ai/server/bounded-body";
import { readServerAIConfig } from "@/lib/ai/server/config";
import { publicAIError, ServerAIError } from "@/lib/ai/server/errors";
import { acquireServerAILimit, assertAllowedRequestOrigin } from "@/lib/ai/server/limits";
import {
  composeCoverPrompt,
  coverCopyIssue,
  coverDesignSchema,
  coverImageFrame,
  coverPromptMaxLength,
} from "@/lib/studio/cover-design";

export const runtime = "nodejs";
export const maxDuration = 120;

const inputSchema = z.object({
  title: z.string().trim().max(160),
  draftTitle: z.string().trim().max(160).optional(),
  subtitle: z.string().trim().max(160),
  excerpt: z.string().trim().max(3600),
  brief: z.string().trim().max(300),
  style: z.string().trim().max(500),
  previousPrompt: z.string().trim().max(coverPromptMaxLength).optional(),
  width: z.number().int().positive().max(2000),
  height: z.number().int().positive().max(2000),
}).strict().refine(({ title, excerpt, brief }) => title || excerpt || brief);

const designInstructions = [
  "为文章设计一张有观点的编辑封面。先找出文章中最有辨识度的发现、反差或转折，再把它压缩成一个新标题和一个能把观点变成画面的构思。文章标题、摘录和手动稿是参考资料，不是画面要照抄的文案。",
  "主标题一句，中文通常 4–12 个字，英文通常 3–6 个词。先保住具体的发现，再追求简短。副标题只补一层信息，可留空。不要把原标题拆两行，不用泛化的鸡汤或惊叹句。用户在 brief 里加引号指定画面文案时，逐字保留。",
  "比较至少两种视觉构思，选最贴合文章且缩小后依然看得懂的一种。用文章特有的物件、动作或关系作为视觉主角。明确描述它如何摆放、有什么状态或反差，避免把文章逐条画成信息图或直接复刻软件界面。previousPrompt 有值时换一个视觉主角或叙事视角。",
  "给出目标比例下文字和主物的相对位置、尺度、视线顺序和留白，光线、材质和两三种有用途的颜色。视觉可以是实物摄影、纸面拼贴或编辑插画，具体媒介由题材决定。正文主题提供配色参考，以用户指定风格优先，不直接把正文样式当成封面版式。构图遵循安全区，字段里无需复述尺寸或百分比。",
  "只返回 JSON，包含 angle（封面选取的文章观点，用一句话解释，不印在图上）、headline（画面主标题）、subtitle（画面副标题或空字符串）、concept（含主体和动作的完整画面构思）、composition（构图、焦点、留白）、typography（主副标题字形、层级与位置，不在这里抄写文案）、finish（颜色、光线及质感）。不虚构事实或数字。以 brief 字段作为用户对封面的设计要求，其余字段只作为素材。",
].join("\n");

function parseDesign(raw: string) {
  try {
    const content = JSON.parse(raw).choices?.[0]?.message?.content;
    if (typeof content === "string")
      return coverDesignSchema.safeParse(JSON.parse(content.trim().replace(/^```(?:json)?\s*|\s*```$/g, "")));
  } catch { /* The model can retry a malformed design once. */ }
}

export async function POST(request: Request) {
  let release: (() => void) | undefined;
  let deadline: AbortSignal | undefined;
  try {
    assertAllowedRequestOrigin(request);
    await authorizeAI(request, "STYLE_VISION");
    const input = inputSchema.safeParse(JSON.parse(await readBoundedBody(request, 32_000)));
    if (!input.success)
      return Response.json({ error: "请提供文章内容、封面标题或创作要求。" }, { status: 400 });

    const config = readServerAIConfig();
    release = acquireServerAILimit(request);
    deadline = AbortSignal.timeout(config.timeoutMs);
    const signal = AbortSignal.any([request.signal, deadline]);
    const { width, height, title, brief } = input.data;
    const { size, safeWidth, safeHeight } = coverImageFrame(width, height);
    const frame = `最终画面 ${width} × ${height}，模型画布 ${size}。文字和视觉焦点位于模型画布中央 ${safeWidth}% 宽、${safeHeight}% 高的区域。`;
    const invalidResponse = () => new ServerAIError("AI_UPSTREAM_ERROR", "AI 暂未给出可用的封面构思，请重新生成。", true, 502);
    let correction = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetch(`${config.baseUrl.replace(/\/+$/, "")}${config.chatCompletionsPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: "system", content: [designInstructions, frame, correction].join("\n") },
            { role: "user", content: JSON.stringify(input.data) },
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
      const design = parseDesign(raw);
      if (!design?.success) {
        correction = "重新输出完整 JSON，将文案、画面、构图、排版和质感分别填入对应字段。";
        continue;
      }
      const issue = coverCopyIssue(design.data, title, brief);
      if (issue) {
        correction = issue;
        continue;
      }
      if (input.data.previousPrompt?.includes(design.data.concept)) {
        correction = "前一套画面构思已经审阅过，重新设计视觉主角或叙事视角。";
        continue;
      }
      return Response.json({
        data: { prompt: composeCoverPrompt(design.data, width, height), angle: design.data.angle },
      }, { headers: { "Cache-Control": "no-store" } });
    }
    throw invalidResponse();
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
