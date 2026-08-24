import type { AIErrorCode, AIDiagnostics, ProviderGenerateResult } from "../provider";

export const serverAIErrorCodes = [
  "AI_NOT_CONFIGURED",
  "AI_INVALID_REQUEST",
  "AI_UNAUTHORIZED_UPSTREAM",
  "AI_RATE_LIMITED",
  "AI_TIMEOUT",
  "AI_UPSTREAM_ERROR",
  "AI_INVALID_RESPONSE",
  "AI_ABORTED",
  "AI_INTERNAL_ERROR",
] as const;

export type ServerAIErrorCode = (typeof serverAIErrorCodes)[number];

export type PublicAIError = {
  code: ServerAIErrorCode;
  message: string;
  retryable: boolean;
};

export class ServerAIError extends Error {
  readonly code: ServerAIErrorCode;
  readonly retryable: boolean;
  readonly status?: number;

  constructor(code: ServerAIErrorCode, message: string, retryable: boolean, status?: number) {
    super(message);
    this.name = "ServerAIError";
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

export function publicAIError(error: unknown): PublicAIError {
  const normalized = normalizeServerAIError(error);
  return {
    code: normalized.code,
    message: normalized.message,
    retryable: normalized.retryable,
  };
}

export function normalizeServerAIError(error: unknown): ServerAIError {
  if (error instanceof ServerAIError) return error;

  if (isProviderError(error)) {
    if (error.code === "cancelled") return new ServerAIError("AI_ABORTED", "AI 生成已取消。", false);
    if (error.code === "timeout") return new ServerAIError("AI_TIMEOUT", "AI 服务响应超时，请稍后重试。", true);
    if (error.code === "rate_limit") return new ServerAIError("AI_RATE_LIMITED", "AI 服务请求过于频繁，请稍后重试。", true, error.diagnostics.status);
    if (error.code === "schema") return new ServerAIError("AI_INVALID_RESPONSE", "AI 服务返回的数据格式无效。", false, error.diagnostics.status);
    if (error.diagnostics.status === 401 || error.diagnostics.status === 403) {
      return new ServerAIError("AI_UNAUTHORIZED_UPSTREAM", "AI 服务认证失败，请检查服务端配置。", false, error.diagnostics.status);
    }
    return new ServerAIError("AI_UPSTREAM_ERROR", "AI 服务暂时不可用，请稍后重试。", error.retryable, error.diagnostics.status);
  }

  return new ServerAIError("AI_INTERNAL_ERROR", "AI 服务暂时不可用，请稍后重试。", true);
}

function isProviderError(error: unknown): error is {
  code: AIErrorCode;
  message: string;
  retryable: boolean;
  diagnostics: AIDiagnostics;
} {
  if (!error || typeof error !== "object") return false;
  const value = error as Partial<ProviderGenerateResult> & { code?: unknown; message?: unknown; retryable?: unknown; diagnostics?: unknown };
  return (
    typeof value.code === "string" &&
    typeof value.message === "string" &&
    typeof value.retryable === "boolean" &&
    Boolean(value.diagnostics) &&
    typeof value.diagnostics === "object"
  );
}
