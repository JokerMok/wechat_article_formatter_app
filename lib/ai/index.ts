export {
  AIProviderError,
  OpenAICompatibleProvider,
  aiPlatformIds,
  buildFallbackPlatformVersions,
  buildPlatformChangeRecords,
  generatePlatformVersions,
  sanitizeGeneratedText,
  validateGeneratedFacts,
} from "./provider";

export { HostedAIProvider } from "./hosted-provider";
export { HostedSemanticAnalyzer, OpenAICompatibleSemanticAnalyzer } from "./semantic-provider";
export type { SemanticAnalyzer } from "./semantic-provider";

export type {
  AIDiagnostics,
  AIProvider,
  AIChangeField,
  AIChangeKind,
  AIChangeMetadata,
  AIChangeRecord,
  AIErrorCode,
  AIProviderErrorInfo,
  GeneratePlatformVersionsOptions,
  GeneratePlatformVersionsResult,
  GeneratedPlatformDraft,
  GeneratedPlatformResponse,
  OpenAICompatibleProviderConfig,
  ProviderGenerateOptions,
  ProviderGenerateResult,
  ProviderSemanticAnalyzeOptions,
  ProviderSemanticAnalyzeResult,
} from "./provider";
