import {
  AIProviderError,
  OpenAICompatibleProvider,
  type OpenAICompatibleProviderConfig,
  type ProviderSemanticAnalyzeOptions,
  type ProviderSemanticAnalyzeResult,
} from "./provider";
import { contentBlueprintSchema } from "../design-plan";

export interface SemanticAnalyzer {
  analyze(options: ProviderSemanticAnalyzeOptions): Promise<ProviderSemanticAnalyzeResult>;
}

type HostedSemanticResponse =
  | { ok: true; data: ProviderSemanticAnalyzeResult }
  | { ok: false; error: { code: string; message: string; retryable: boolean } };

const HOSTED_ENDPOINT = "/api/ai/analyze";

export class HostedSemanticAnalyzer implements SemanticAnalyzer {
  readonly model = "server-configured";
  private readonly fetchImpl: typeof fetch;

  constructor(fetchImpl?: typeof fetch) {
    this.fetchImpl = fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async analyze(options: ProviderSemanticAnalyzeOptions): Promise<ProviderSemanticAnalyzeResult> {
    if (options.signal?.aborted) throw this.cancelled(options);

    let requestBody: string;
    try {
      requestBody = JSON.stringify({
        sourceRevision: options.sourceVersionId,
        source: options.source,
        generationMode: options.generationMode,
      });
    } catch (error) {
      throw this.error("invalid_request", "当前文章内容无法发送，请检查文章数据后重试。", false, { errorType: errorType(error) });
    }

    if (options.signal?.aborted) throw this.cancelled(options);

    let response: Response;
    try {
      response = await this.fetchImpl(HOSTED_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: requestBody,
        signal: options.signal,
      });
    } catch (error) {
      if (options.signal?.aborted) throw this.cancelled(options);
      this.logDevelopmentError("fetch", error);
      throw this.error("transport", "服务端 AI 分析请求失败，可能是网络或 API 地址不可达，请重试。", true, { errorType: errorType(error) });
    }

    let payload: HostedSemanticResponse | undefined;
    try {
      payload = (await response.json()) as HostedSemanticResponse;
    } catch (error) {
      this.logDevelopmentError("response-json", error);
      throw this.error(response.ok ? "schema" : "upstream", "服务端返回格式无效，请稍后重试。", response.status >= 500, {
        status: response.status,
        errorType: errorType(error),
      });
    }

    if (!payload || !payload.ok) {
      const error = payload && "error" in payload ? payload.error : undefined;
      const code = hostedErrorCode(error?.code);
      throw new AIProviderError({
        code,
        message: error?.message ?? "服务端返回了无效的 AI 分析错误。",
        retryable: error?.retryable ?? response.status >= 500,
        diagnostics: {
          provider: "openai-compatible",
          model: this.model,
          sourceVersionId: options.sourceVersionId,
          endpoint: HOSTED_ENDPOINT,
          status: response.status,
          errorCode: code,
        },
      });
    }

    if (!isProviderSemanticAnalyzeResult(payload.data)) {
      throw this.error("schema", "服务端返回的语义分析结构无效，请稍后重试。", false, { status: response.status });
    }

    const blueprint = contentBlueprintSchema.safeParse(payload.data.blueprint);
    if (!blueprint.success) {
      throw this.error("schema", "服务端返回的语义分析结构无效，请稍后重试。", false, { status: response.status });
    }

    return { ...payload.data, blueprint: blueprint.data };
  }

  private cancelled(options: ProviderSemanticAnalyzeOptions) {
    return new AIProviderError({
      code: "cancelled",
      message: "AI 分析已取消。",
      retryable: false,
      diagnostics: {
        provider: "openai-compatible",
        model: this.model,
        sourceVersionId: options.sourceVersionId,
        endpoint: HOSTED_ENDPOINT,
        errorCode: "cancelled",
      },
    });
  }

  private error(
    code: Extract<AIProviderError["code"], "invalid_request" | "transport" | "schema" | "upstream">,
    message: string,
    retryable: boolean,
    extra: { status?: number; errorType?: string } = {},
  ) {
    return new AIProviderError({
      code,
      message,
      retryable,
      diagnostics: {
        provider: "openai-compatible",
        model: this.model,
        endpoint: HOSTED_ENDPOINT,
        errorCode: code,
        ...extra,
      },
    });
  }

  private logDevelopmentError(stage: string, error: unknown) {
    if (typeof process !== "undefined" && process.env.NODE_ENV === "production") return;
    console.warn("[HostedSemanticAnalyzer] request diagnostic", { stage, errorType: errorType(error) });
  }
}

export class OpenAICompatibleSemanticAnalyzer implements SemanticAnalyzer {
  private readonly provider: OpenAICompatibleProvider;

  constructor(config: OpenAICompatibleProviderConfig) {
    this.provider = new OpenAICompatibleProvider(config);
  }

  analyze(options: ProviderSemanticAnalyzeOptions) {
    return this.provider.analyzeSemantic(options);
  }
}

function hostedErrorCode(code?: string): "timeout" | "rate_limit" | "cancelled" | "transport" | "schema" | "not_configured" | "invalid_request" | "unauthorized" | "upstream" | "internal" {
  if (code === "AI_NOT_CONFIGURED") return "not_configured";
  if (code === "AI_INVALID_REQUEST") return "invalid_request";
  if (code === "AI_UNAUTHORIZED_UPSTREAM") return "unauthorized";
  if (code === "AI_FORBIDDEN") return "unauthorized";
  if (code === "AI_TIMEOUT") return "timeout";
  if (code === "AI_RATE_LIMITED") return "rate_limit";
  if (code === "AI_ABORTED") return "cancelled";
  if (code === "AI_INVALID_RESPONSE") return "schema";
  if (code === "AI_UPSTREAM_ERROR") return "upstream";
  if (code === "AI_INTERNAL_ERROR") return "internal";
  return "transport";
}

function errorType(error: unknown) {
  if (error instanceof Error && error.name) return error.name;
  return typeof error;
}

function isProviderSemanticAnalyzeResult(value: unknown): value is ProviderSemanticAnalyzeResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<ProviderSemanticAnalyzeResult>;
  return Boolean(result.blueprint && typeof result.blueprint === "object" && result.diagnostics && typeof result.diagnostics === "object");
}
