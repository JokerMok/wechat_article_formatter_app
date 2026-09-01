import type { ProviderGenerateOptions, ProviderGenerateResult, ProviderSemanticAnalyzeOptions, ProviderSemanticAnalyzeResult } from "../provider";
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

  if (input.platforms.length > 1) {
    const results: ProviderGenerateResult[] = [];
    for (const platform of input.platforms) {
      results.push(await generateWithRetry(provider, { ...input, platforms: [platform] }, config.maxRetries));
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
  }

  return generateWithRetry(provider, input, config.maxRetries);
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
  return analyzeWithRetry(analyzer, input, config.maxRetries);
}

async function generateWithRetry(provider: ServerAIProvider, input: ProviderGenerateOptions, maxRetries: number): Promise<ProviderGenerateResult> {
  let attempt = 0;
  while (true) {
    try {
      return await provider.generate(input);
    } catch (error) {
      const normalized = normalizeServerAIError(error);
      const retryableSchemaResponse = normalized.code === "AI_INVALID_RESPONSE";
      if ((!normalized.retryable && !retryableSchemaResponse) || normalized.code === "AI_TIMEOUT" || attempt >= maxRetries) {
        throw normalized;
      }
      attempt += 1;
    }
  }
}

async function analyzeWithRetry(analyzer: ServerSemanticAnalyzer, input: ProviderSemanticAnalyzeOptions, maxRetries: number) {
  let attempt = 0;
  while (true) {
    try {
      return await analyzer.analyzeSemantic(input);
    } catch (error) {
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
