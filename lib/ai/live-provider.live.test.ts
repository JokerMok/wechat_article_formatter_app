import { expect, it } from "vitest";
import { loadEnvConfig } from "@next/env";
import { parseSourceDocument } from "../article-parser";
import { productArticle } from "../../tests/fixtures/content/product-article";
import { OpenAICompatibleAdapter } from "./server/providers/openai-compatible";
import { readServerAIConfig } from "./server/config";
import { AIProviderError } from "./provider";
import type { PlatformId } from "../platforms/types";

// Opt-in only: uses the operator's local configuration and consumes real inference.
it.skipIf(process.env.RUN_LIVE_AI !== "1")("real configured model returns a publishable editorial protocol", async () => {
  const environment = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: "development" });
  loadEnvConfig(process.cwd(), true);
  Object.assign(process.env, { NODE_ENV: environment });
  const source = parseSourceDocument(productArticle);
  const provider = new OpenAICompatibleAdapter(readServerAIConfig());
  try {
    const platform = (process.env.LIVE_AI_PLATFORM || "wechat") as PlatformId;
    const result = await provider.generate({ source, platforms: [platform], generationMode: "reachOptimized" });
    expect("editorialPlans" in result.response).toBe(true);
  } catch (error) {
    if (error instanceof AIProviderError) console.error("Live model validation", error.code, error.diagnostics.details);
    throw new Error(error instanceof AIProviderError ? `Live model failed: ${error.code}` : "Live model unavailable");
  }
}, 120_000);
