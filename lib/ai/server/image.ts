import { z } from "zod";
import { readBoundedBody } from "./bounded-body";
import { readServerAIConfig } from "./config";
import { ServerAIError } from "./errors";
import { acquireServerAILimit } from "./limits";

const imageTimeoutMs = 110_000;
const imageOutput = z.object({
  output: z.array(z.object({ type: z.string(), result: z.string().optional() })),
});

export async function generateServerImage(
  request: Request,
  { instructions, input, size }: { instructions: string; input: string; size: string },
) {
  const config = readServerAIConfig({
    ...process.env,
    AI_MODEL: process.env.AI_COVER_MODEL || process.env.AI_MODEL,
  });
  const release = acquireServerAILimit(request);
  const deadline = AbortSignal.timeout(imageTimeoutMs);
  const signal = AbortSignal.any([request.signal, deadline]);
  try {
    const response = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        instructions,
        input,
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
        throw new ServerAIError("AI_RATE_LIMITED", "生图服务请求较多，请稍后重试。", true, 429);
      throw new ServerAIError("AI_UPSTREAM_ERROR", "生图服务未返回图片，请稍后重试。", true, 502);
    }
    const json = await readBoundedBody(new Request("http://localhost/image-response", {
      method: "POST", body: response.body, duplex: "half", signal,
    } as RequestInit), 14_000_000, imageTimeoutMs);
    let payload: unknown;
    try {
      payload = JSON.parse(json);
    } catch {
      throw new ServerAIError("AI_UPSTREAM_ERROR", "生图服务返回格式有误，请稍后重试。", true, 502);
    }
    const parsed = imageOutput.safeParse(payload);
    const result = parsed.success && parsed.data.output.find((item) => item.type === "image_generation_call" && item.result)?.result;
    const image = result ? Buffer.from(result, "base64") : null;
    if (!image || image.length > 10 * 1024 * 1024 || image.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a")
      throw new ServerAIError("AI_UPSTREAM_ERROR", "生图服务返回的图片无效或过大。", true, 502);
    return new Response(new Uint8Array(image), {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (deadline.aborted || (error instanceof Error && error.name === "TimeoutError"))
      throw new ServerAIError("AI_TIMEOUT", "AI 生成图片超时，请稍后重试。", true, 504);
    throw error;
  } finally {
    release();
  }
}
