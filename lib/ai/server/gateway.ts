import { AIProviderError, type ProviderGenerateOptions, type ProviderGenerateResult, type ProviderSemanticAnalyzeOptions, type ProviderSemanticAnalyzeResult } from "../provider";
import { readServerAIConfig, type ServerAIConfig, type ServerAIEnv } from "./config";
import { normalizeServerAIError, ServerAIError } from "./errors";
import { OpenAICompatibleAdapter } from "./providers/openai-compatible";
import type { ServerAIProvider, ServerSemanticAnalyzer } from "./providers/types";

export async function generateWithServerAI(
  input: ProviderGenerateOptions,
  dependencies: {
    env?: ServerAIEnv;
    fetchImpl?: typeof fetch;
    createProvider?: (config: ServerAIConfig, fetchImpl?: typeof fetch) => ServerAIProvider;
  } = {},
): Promise<ProviderGenerateResult> {
  const config = readServerAIConfig(dependencies.env);
  const createProvider = dependencies.createProvider ?? ((serverConfig, fetchImpl) => new OpenAICompatibleAdapter(serverConfig, fetchImpl));
  const provider = createProvider(config, dependencies.fetchImpl);

  return withHardTimeout(async (signal, assertActive) => {
    const boundedInput = { ...input, signal };
    if (input.platforms.length <= 1) {
      return generateWithRetry(provider, boundedInput, config.maxRetries, assertActive);
    }
    const results: ProviderGenerateResult[] = [];
    for (const platform of input.platforms) {
      results.push(await generateWithRetry(provider, { ...boundedInput, platforms: [platform] }, config.maxRetries, assertActive));
    }
    const first = results[0];
    const editorialPlans = results.flatMap((result) => "editorialPlans" in result.response ? result.response.editorialPlans : []);
    if (editorialPlans.length > 0) {
      return {
        response: {
          schemaVersion: 1,
          editorialPlans,
        },
        diagnostics: {
          ...first.diagnostics,
          details: [...(first.diagnostics.details ?? []), `split_platform_requests:${results.length}`],
        },
      };
    }
    return {
      response: {
        schemaVersion: 1,
        ...("designPlan" in first.response && first.response.designPlan ? { designPlan: first.response.designPlan } : {}),
        drafts: results.flatMap((result) => "drafts" in result.response ? result.response.drafts : []),
      },
      diagnostics: {
        ...first.diagnostics,
        details: [...(first.diagnostics.details ?? []), `split_platform_requests:${results.length}`],
      },
    };
  }, config.timeoutMs, input.signal);
}

export async function analyzeWithServerAI(
  input: ProviderSemanticAnalyzeOptions,
  dependencies: {
    env?: ServerAIEnv;
    fetchImpl?: typeof fetch;
    createAnalyzer?: (config: ServerAIConfig, fetchImpl?: typeof fetch) => ServerSemanticAnalyzer;
  } = {},
): Promise<ProviderSemanticAnalyzeResult> {
  assertServerAISemanticRequest(input);
  const config = readServerAIConfig(dependencies.env);
  const createAnalyzer = dependencies.createAnalyzer ?? ((serverConfig, fetchImpl) => new OpenAICompatibleAdapter(serverConfig, fetchImpl));
  const analyzer = createAnalyzer(config, dependencies.fetchImpl);
  return withHardTimeout(
    (signal, assertActive) => analyzeWithRetry(analyzer, { ...input, signal }, config.maxRetries, assertActive),
    config.timeoutMs,
    input.signal,
  );
}

async function withHardTimeout<T>(
  operation: (signal: AbortSignal, assertActive: () => void) => Promise<T>,
  timeoutMs: number,
  callerSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const expiresAt = Date.now() + timeoutMs;
  let rejectBoundary!: (error: ServerAIError) => void;
  const boundary = new Promise<never>((_, reject) => {
    rejectBoundary = reject;
  });
  const stop = (error: ServerAIError) => {
    if (controller.signal.aborted) return;
    controller.abort(error);
    rejectBoundary(error);
  };
  const timeout = () => stop(new ServerAIError("AI_TIMEOUT", "AI 服务响应超时，请稍后重试。", true, 504));
  const cancel = () => stop(new ServerAIError("AI_ABORTED", "AI 请求已取消。", false));
  const assertActive = () => {
    if (callerSignal?.aborted) cancel();
    // Check wall time as well: immediately rejected retries can starve timers.
    if (Date.now() >= expiresAt) timeout();
    controller.signal.throwIfAborted();
  };
  const timeoutId = setTimeout(timeout, timeoutMs);
  callerSignal?.addEventListener("abort", cancel, { once: true });

  try {
    const task = Promise.resolve().then(() => {
      assertActive();
      return operation(controller.signal, assertActive);
    }).then((result) => {
      assertActive();
      return result;
    });
    return await Promise.race([task, boundary]);
  } finally {
    clearTimeout(timeoutId);
    callerSignal?.removeEventListener("abort", cancel);
  }
}

async function generateWithRetry(provider: ServerAIProvider, input: ProviderGenerateOptions, maxRetries: number, assertActive: () => void): Promise<ProviderGenerateResult> {
  let attempt = 0;
  let validationFeedback: string[] | undefined;
  while (true) {
    assertActive();
    try {
      const result = await provider.generate({ ...input, ...(validationFeedback ? { validationFeedback } : {}) });
      assertActive();
      return result;
    } catch (error) {
      assertActive();
      const normalized = normalizeServerAIError(error);
      const retryableSchemaResponse = normalized.code === "AI_INVALID_RESPONSE";
      if ((!normalized.retryable && !retryableSchemaResponse) || normalized.code === "AI_TIMEOUT" || attempt >= maxRetries) {
        throw normalized;
      }
      if (retryableSchemaResponse) {
        const fields = error instanceof AIProviderError ? error.diagnostics.details?.filter((detail) => /^schema_issue path=[A-Za-z0-9_.-]+ code=[a-z_]+(?: keys=[A-Za-z0-9_,.-]+)?$/.test(detail)).slice(0, 5) : undefined;
        validationFeedback = fields?.length ? fields : ["Output failed source or structure validation. Use only valid source references, verbatim numeric quantities and quotes, and the exact response schema."];
      }
      attempt += 1;
    }
  }
}

async function analyzeWithRetry(analyzer: ServerSemanticAnalyzer, input: ProviderSemanticAnalyzeOptions, maxRetries: number, assertActive: () => void) {
  let attempt = 0;
  while (true) {
    assertActive();
    try {
      const result = await analyzer.analyzeSemantic(input);
      assertActive();
      return result;
    } catch (error) {
      assertActive();
      const normalized = normalizeServerAIError(error);
      const retryableSchemaResponse = normalized.code === "AI_INVALID_RESPONSE";
      if ((!normalized.retryable && !retryableSchemaResponse) || normalized.code === "AI_TIMEOUT" || attempt >= maxRetries) {
        throw normalized;
      }
      attempt += 1;
    }
  }
}

export function assertServerAIRequest(input: ProviderGenerateOptions) {
  if (!input.source || !Array.isArray(input.source.blocks) || !input.platforms.length || !input.source.sourceText.trim()) {
    throw new ServerAIError("AI_INVALID_REQUEST", "AI 请求内容无效。", false);
  }
  if (input.source.sourceText.length > 120000) {
    throw new ServerAIError("AI_INVALID_REQUEST", "文章内容过长，请拆分后再生成。", false, 413);
  }
}

export function assertServerAISemanticRequest(input: ProviderSemanticAnalyzeOptions) {
  if (!input.source || !Array.isArray(input.source.blocks) || !input.source.sourceText.trim()) {
    throw new ServerAIError("AI_INVALID_REQUEST", "AI 请求内容无效。", false);
  }
  if (input.source.sourceText.length > 120000) {
    throw new ServerAIError("AI_INVALID_REQUEST", "文章内容过长，请拆分后再分析。", false, 413);
  }
}
