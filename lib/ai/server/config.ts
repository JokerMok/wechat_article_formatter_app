import { readFileSync } from "node:fs";
import { ServerAIError } from "./errors";
import type { OpenAICompatibleProviderConfig } from "../provider";

export type ServerAIConfig = {
  provider: "openai-compatible";
  apiKey: string;
  baseUrl: string;
  model: string;
  chatCompletionsPath: string;
  timeoutMs: number;
  maxRetries: number;
  tokenLimitField?: OpenAICompatibleProviderConfig["tokenLimitField"];
  temperature?: null;
  reasoningEffort?: OpenAICompatibleProviderConfig["reasoningEffort"];
};

export type ServerAIEnv = Record<string, string | undefined>;

export function readServerAIConfig(env: ServerAIEnv = process.env): ServerAIConfig {
  const provider = env.AI_PROVIDER?.trim() || "openai-compatible";
  if (provider !== "openai-compatible") {
    throw new ServerAIError("AI_NOT_CONFIGURED", "当前服务端 AI Provider 尚未配置。", false);
  }

  const apiKey = readAPIKey(env);
  const baseUrl = env.AI_BASE_URL?.trim();
  const model = env.AI_MODEL?.trim();
  if (!apiKey || !baseUrl || !model) {
    throw new ServerAIError("AI_NOT_CONFIGURED", "服务端 AI 尚未配置完整。", false);
  }

  const chatCompletionsPath = normalizePath(env.AI_CHAT_COMPLETIONS_PATH || "/chat/completions");
  const timeoutMs = readTimeout(env.AI_TIMEOUT_MS);
  const maxRetries = readInteger(env.AI_MAX_RETRIES, 1, 0, 2);
  const reasoningEffort = readReasoningEffort(env.AI_REASONING_EFFORT);
  const tokenLimitField = env.AI_CHAT_TOKEN_LIMIT_FIELD?.trim();
  if (tokenLimitField && tokenLimitField !== "max_tokens" && tokenLimitField !== "max_completion_tokens") {
    throw new ServerAIError("AI_NOT_CONFIGURED", "服务端 AI 输出上限字段无效。", false);
  }

  return {
    provider, apiKey, baseUrl, model, chatCompletionsPath, timeoutMs, maxRetries,
    ...(reasoningEffort ? { reasoningEffort } : {}),
    ...(tokenLimitField === "max_tokens" || tokenLimitField === "max_completion_tokens" ? { tokenLimitField } : {}),
    ...(env.AI_CHAT_TEMPERATURE?.trim() === "default" ? { temperature: null } : {}),
  };
}

function readAPIKey(env: ServerAIEnv) {
  const file = env.AI_API_KEY_FILE?.trim();
  if (!file) return env.AI_API_KEY?.trim();
  try {
    return readFileSync(file, "utf8").trim();
  } catch {
    throw new ServerAIError("AI_NOT_CONFIGURED", "无法读取服务端 AI 密钥文件。", false);
  }
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

function readTimeout(value: string | undefined) {
  if (!value?.trim()) return 30000;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1000) {
    throw new ServerAIError("AI_NOT_CONFIGURED", "服务端 AI 数值配置无效。", false);
  }
  return Math.min(parsed, 110000);
}

function readReasoningEffort(value: string | undefined): OpenAICompatibleProviderConfig["reasoningEffort"] {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized !== "minimal" && normalized !== "low" && normalized !== "medium" && normalized !== "high") {
    throw new ServerAIError("AI_NOT_CONFIGURED", "服务端 AI 推理程度配置无效。", false);
  }
  return normalized;
}
