export {
  OpenAICompatibleProvider,
  aiPlatformIds,
  buildFallbackPlatformVersions,
  buildPlatformChangeRecords,
  generatePlatformVersions,
  sanitizeGeneratedText,
  validateGeneratedFacts,
} from "./provider";

export type {
  AIDiagnostics,
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
} from "./provider";
