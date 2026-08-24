import { OpenAICompatibleProvider, type OpenAICompatibleProviderConfig } from "../../provider";
import type { ServerAIConfig } from "../config";
import type { ServerAIProvider } from "./types";

export class OpenAICompatibleAdapter implements ServerAIProvider {
  private readonly provider: OpenAICompatibleProvider;
  readonly model: string;

  constructor(config: ServerAIConfig, fetchImpl?: typeof fetch) {
    const providerConfig: OpenAICompatibleProviderConfig = {
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
      chatCompletionsPath: config.chatCompletionsPath,
      timeoutMs: config.timeoutMs,
      maxOutputTokens: 12000,
      fetchImpl,
    };
    this.provider = new OpenAICompatibleProvider(providerConfig);
    this.model = this.provider.model;
  }

  generate(options: Parameters<ServerAIProvider["generate"]>[0]) {
    return this.provider.generate(options);
  }
}
