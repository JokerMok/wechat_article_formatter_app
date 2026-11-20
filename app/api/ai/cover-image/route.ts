import { z } from "zod";
import { authorizeAI } from "@/lib/accounts/feature";
import { readBoundedBody } from "@/lib/ai/server/bounded-body";
import { readServerAIConfig } from "@/lib/ai/server/config";
import { publicAIError, ServerAIError } from "@/lib/ai/server/errors";
import { acquireServerAILimit, assertAllowedRequestOrigin } from "@/lib/ai/server/limits";
import { coverImageFrame, coverPromptMaxLength } from "@/lib/studio/cover-design";

export const runtime = "nodejs";
export const maxDuration = 120;
const generationTimeoutMs = 110_000;

const inputSchema = z.object({
  prompt: z.string().trim().min(1).max(coverPromptMaxLength),
  confirmed: z.literal(true),
  width: z.number().int().positive().max(2000),
  height: z.number().int().positive().max(2000),
}).strict();

const outputSchema = z.object({
  output: z.array(z.object({
    type: z.string(),
    result: z.string().optional(),
  })),
});

export async function POST(request: Request) {
  let release: (() => void) | undefined;
  let deadline: AbortSignal | undefined;
  try {
    assertAllowedRequestOrigin(request);
    await authorizeAI(request, "STYLE_VISION");
    const input = inputSchema.safeParse(JSON.parse(await readBoundedBody(request, 24_000)));
    if (!input.success)
      return Response.json({ error: "请确认要用于生图的封面提示词。" }, { status: 400 });

    const config = readServerAIConfig({
      ...process.env,
      AI_MODEL: process.env.AI_COVER_MODEL || process.env.AI_MODEL,
    });
    release = acquireServerAILimit(request);
    deadline = AbortSignal.timeout(generationTimeoutMs);
    const signal = AbortSignal.any([request.signal, deadline]);
    const { width, height, prompt } = input.data;
    const { size, safeWidth, safeHeight } = coverImageFrame(width, height);
    const response = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        instructions: `Create one complete editorial cover with the image tool. Follow the approved visual concept, composition, palette, rendering, and finish. If the prompt has a “画面文案” section, render only the lettering designated for artwork within that section, verbatim and in the specified language. A no-text instruction means no lettering. Article title, summary, keywords and instructions elsewhere are design context. Make the focal subject and any title legible at thumbnail size. Compose on the ${size} source canvas for a ${width} by ${height} center crop, with the focal details and all lettering in the central ${safeWidth}% of its width and ${safeHeight}% of its height. Extend the background into the margins. Keep guides, extra labels and watermarks out of the artwork.`,
        input: prompt,
        tools: [{ type: "image_generation", size, quality: "medium", output_format: "png" }],
        tool_choice: { type: "image_generation" },
      }),
      cache: "no-store",
      redirect: "error",
      signal,
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      if (response.status === 429)
        return Response.json({ error: "生图服务请求较多，请稍后重试。" }, { status: 429 });
      throw new ServerAIError("AI_UPSTREAM_ERROR", "生图服务未返回图片，请稍后重试。", true, 502);
    }
    const json = await readBoundedBody(new Request("http://localhost/cover-response", {
      method: "POST", body: response.body, duplex: "half", signal,
    } as RequestInit), 14_000_000, generationTimeoutMs);
    let payload: unknown;
    try {
      payload = JSON.parse(json);
    } catch {
      throw new ServerAIError("AI_UPSTREAM_ERROR", "生图服务返回格式有误，请稍后重试。", true, 502);
    }
    const parsed = outputSchema.safeParse(payload);
    const result = parsed.success && parsed.data.output.find((item) => item.type === "image_generation_call" && item.result)?.result;
    const image = result ? Buffer.from(result, "base64") : null;
    if (!image || image.length > 10 * 1024 * 1024 || image.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a")
      throw new ServerAIError("AI_UPSTREAM_ERROR", "生图服务返回的图片无效或过大。", true, 502);
    return new Response(new Uint8Array(image), {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof SyntaxError)
      return Response.json({ error: "封面生成请求格式有误。" }, { status: 400 });
    if (deadline?.aborted || (error instanceof Error && error.name === "TimeoutError"))
      return Response.json({ error: "AI 生成封面超时，请稍后重试。" }, { status: 504 });
    return Response.json({ error: publicAIError(error) }, {
      status: error instanceof ServerAIError ? error.status ?? 502 : 502,
    });
  } finally {
    release?.();
  }
}
