import { ServerAIError } from "./errors";

export type ServerAIConfig = {
  provider: "openai-compatible";
  apiKey: string;
  baseUrl: string;
  model: string;
  chatCompletionsPath: string;
  timeoutMs: number;
  maxRetries: number;
};

export type ServerAIEnv = Record<string, string | undefined>;

export function readServerAIConfig(env: ServerAIEnv = process.env): ServerAIConfig {
  const provider = env.AI_PROVIDER?.trim() || "openai-compatible";
  if (provider !== "openai-compatible") {
    throw new ServerAIError("AI_NOT_CONFIGURED", "当前服务端 AI Provider 尚未配置。", false);
  }

  const apiKey = env.AI_API_KEY?.trim();
  const baseUrl = env.AI_BASE_URL?.trim();
  const model = env.AI_MODEL?.trim();
  if (!apiKey || !baseUrl || !model) {
    throw new ServerAIError("AI_NOT_CONFIGURED", "服务端 AI 尚未配置完整。", false);
  }

  const chatCompletionsPath = normalizePath(env.AI_CHAT_COMPLETIONS_PATH || "/chat/completions");
  const timeoutMs = readInteger(env.AI_TIMEOUT_MS, 60000, 1000, 120000);
  const maxRetries = readInteger(env.AI_MAX_RETRIES, 1, 0, 2);

  return { provider, apiKey, baseUrl, model, chatCompletionsPath, timeoutMs, maxRetries };
}

function normalizePath(value: string) {
  const path = value.trim();
  if (!path.startsWith("/") || path.includes("..") || path.includes("://") || path.includes("\\")) {
    throw new ServerAIError("AI_NOT_CONFIGURED", "服务端 AI 接口路径配置无效。", false);
  }
  return `/${path.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

function readInteger(value: string | undefined, fallback: number, min: number, max: number) {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new ServerAIError("AI_NOT_CONFIGURED", "服务端 AI 数值配置无效。", false);
  }
  return parsed;
}
