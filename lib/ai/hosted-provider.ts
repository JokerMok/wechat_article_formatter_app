import { AIProviderError, type AIProvider, type ProviderGenerateOptions, type ProviderGenerateResult } from "./provider";

type HostedAIResponse =
  | { ok: true; data: ProviderGenerateResult }
  | { ok: false; error: { code: string; message: string; retryable: boolean } };

export class HostedAIProvider implements AIProvider {
  readonly model = "server-configured";
  private readonly fetchImpl: typeof fetch;

  constructor(fetchImpl: typeof fetch = fetch) {
    this.fetchImpl = fetchImpl;
  }

  async generate(options: ProviderGenerateOptions): Promise<ProviderGenerateResult> {
    if (options.signal?.aborted) {
      throw new AIProviderError({
        code: "cancelled",
        message: "AI request was cancelled.",
        retryable: false,
        diagnostics: { provider: "openai-compatible", model: this.model, sourceVersionId: options.sourceVersionId, errorCode: "cancelled" },
      });
    }

    let response: Response;
    try {
      response = await this.fetchImpl("/api/ai/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          task: "generate-platform-variant",
          sourceRevision: options.sourceVersionId,
          source: options.source,
          platforms: options.platforms,
        }),
        signal: options.signal,
      });
    } catch {
      if (options.signal?.aborted) {
        throw new AIProviderError({
          code: "cancelled",
          message: "AI request was cancelled.",
          retryable: false,
          diagnostics: { provider: "openai-compatible", model: this.model, sourceVersionId: options.sourceVersionId, errorCode: "cancelled" },
        });
      }
      throw new AIProviderError({
        code: "transport",
        message: "AI 服务暂时不可用，请稍后重试。",
        retryable: true,
        diagnostics: { provider: "openai-compatible", model: this.model, sourceVersionId: options.sourceVersionId, endpoint: "/api/ai/generate", errorCode: "transport" },
      });
    }

    const payload = (await response.json().catch(() => undefined)) as HostedAIResponse | undefined;
    if (!payload || !payload.ok) {
      const error = payload && "error" in payload ? payload.error : undefined;
      throw new AIProviderError({
        code: hostedErrorCode(error?.code),
        message: error?.message ?? "AI 服务暂时不可用，请稍后重试。",
        retryable: error?.retryable ?? response.status >= 500,
        diagnostics: {
          provider: "openai-compatible",
          model: this.model,
          sourceVersionId: options.sourceVersionId,
          endpoint: "/api/ai/generate",
          status: response.status,
          errorCode: hostedErrorCode(error?.code),
        },
      });
    }
    return payload.data;
  }
}

function hostedErrorCode(code?: string): "timeout" | "rate_limit" | "cancelled" | "transport" | "schema" {
  if (code === "AI_TIMEOUT") return "timeout";
  if (code === "AI_RATE_LIMITED") return "rate_limit";
  if (code === "AI_ABORTED") return "cancelled";
  if (code === "AI_INVALID_RESPONSE") return "schema";
  return "transport";
}
