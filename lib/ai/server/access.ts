import { createHmac, timingSafeEqual } from "node:crypto";
import { ServerAIError } from "./errors";

export const AI_SESSION_COOKIE = "formatter_ai_session";
export const MAX_ACCESS_CODE_LENGTH = 256;
const SESSION_MS = 24 * 60 * 60 * 1000;

function accessCode() {
  const code = process.env.AI_ACCESS_CODE?.trim();
  if (!code && process.env.NODE_ENV !== "production") return undefined;
  if (!code || code.length < 16 || code.length > MAX_ACCESS_CODE_LENGTH) throw new ServerAIError("AI_NOT_CONFIGURED", "服务端 AI 尚未配置完整：请设置 16 至 256 位的 AI_ACCESS_CODE 访问口令。", false, 503);
  return code;
}

function sign(payload: string, code: string) {
  return createHmac("sha256", code).update(`formatter-ai-session:${payload}`).digest("hex");
}

function equal(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createAISession(candidate: string, now = Date.now()) {
  const code = accessCode();
  if (!code) return "local";
  if (!equal(candidate, code)) throw new ServerAIError("AI_FORBIDDEN", "访问口令不正确。", false, 403);
  const expires = String(now + SESSION_MS);
  return `${expires}.${sign(expires, code)}`;
}

export function assertServerAIAccess(request: Request, now = Date.now()) {
  const code = accessCode();
  if (!code) return;
  const cookies = request.headers.get("cookie")?.split(";").map((part) => part.trim()).filter((part) => part.startsWith(`${AI_SESSION_COOKIE}=`)) ?? [];
  const cookie = cookies.length === 1 ? cookies[0].slice(AI_SESSION_COOKIE.length + 1) : "";
  const match = /^(\d{1,16})\.([a-f0-9]{64})$/.exec(cookie);
  const expires = match?.[1];
  const signature = match?.[2];
  const expiresAt = Number(expires);
  if (!expires || !signature || !Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + SESSION_MS || !equal(signature, sign(expires, code))) {
    throw new ServerAIError("AI_FORBIDDEN", "请先输入服务端 AI 访问口令，验证后重试。", false, 403);
  }
}
