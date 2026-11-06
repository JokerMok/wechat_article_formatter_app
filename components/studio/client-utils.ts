import { accountFetch } from "@/lib/accounts/browser";
import type { ComponentStyle, StyleTokens } from "@/lib/studio/types";
export type VisionResult = {
  name: string;
  tokens: StyleTokens;
  components: Record<string, ComponentStyle>;
  uncertainKeys: string[];
  notes: string[];
  composition: "left" | "center" | "bottom";
};
export async function postJSON<T>(url: string, data: unknown): Promise<T> {
  let response: Response;
  try {
    response = await accountFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(115_000),
    });
  } catch {
    throw new Error(
      "网络中断或请求超时，请重试；参考图会保留，也可以手动调整风格。",
    );
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error("服务器返回不可读取的结果，请重试或使用手动输入。");
  }
  if (!response.ok || body.error)
    throw new Error(
      typeof body.error === "string"
        ? body.error
        : (body.error?.message ?? "请求失败，请稍后重试。"),
    );
  return body.data as T;
}
export async function visionImage(src: string) {
  const image = new Image();
  image.src = src;
  await image.decode();
  const scale = Math.min(1, 1600 / image.width, 6000 / image.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("当前浏览器无法处理截图。");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const data = canvas.toDataURL("image/jpeg", 0.72);
  if (data.length > 4_000_000)
    throw new Error("截图仍然过大，请裁剪到主要内容后上传。");
  return data;
}
