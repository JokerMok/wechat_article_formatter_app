import type { ProviderGenerateOptions, ProviderGenerateResult } from "../provider";
import { readServerAIConfig, type ServerAIConfig, type ServerAIEnv } from "./config";
import { normalizeServerAIError, ServerAIError } from "./errors";
import { OpenAICompatibleAdapter } from "./providers/openai-compatible";
import type { ServerAIProvider } from "./providers/types";

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

  let attempt = 0;
  while (true) {
    try {
      return await provider.generate(input);
    } catch (error) {
      const normalized = normalizeServerAIError(error);
      if (!normalized.retryable || attempt >= config.maxRetries) {
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
    throw new ServerAIError("AI_INVALID_REQUEST", "文章内容过长，请拆分后再生成。", false);
  }
}
