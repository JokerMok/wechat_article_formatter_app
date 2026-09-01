import type { AIProvider, ProviderSemanticAnalyzeOptions, ProviderSemanticAnalyzeResult } from "../../provider";

export type ServerAIProvider = AIProvider;

export type ServerSemanticAnalyzer = {
  readonly model: string;
  analyzeSemantic(options: ProviderSemanticAnalyzeOptions): Promise<ProviderSemanticAnalyzeResult>;
};
