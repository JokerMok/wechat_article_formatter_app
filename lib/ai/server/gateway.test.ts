import { describe, expect, it, vi } from "vitest";
import { parseArticleContent } from "../../article-parser";
import { AIProviderError, type ProviderGenerateOptions } from "../provider";
import { generateWithServerAI } from "./gateway";
import { ServerAIError } from "./errors";

const source = parseArticleContent("# 标题\n\n正文。", { mode: "knowledge" });
const env = {
  AI_PROVIDER: "openai-compatible",
  AI_API_KEY: "server-secret",
  AI_BASE_URL: "https://example.test/v1",
  AI_MODEL: "fixture-model",
  AI_MAX_RETRIES: "1",
};

describe("generateWithServerAI", () => {
  it("retries a retryable upstream failure within the configured bound", async () => {
    const provider = {
      model: "fixture-model",
      generate: vi
        .fn()
        .mockRejectedValueOnce(
          new AIProviderError({
            code: "transport",
            message: "upstream failed",
            retryable: true,
            diagnostics: { provider: "openai-compatible", model: "fixture-model", status: 503, errorCode: "transport" },
          }),
        )
        .mockResolvedValue({ response: { schemaVersion: 1, drafts: [] }, diagnostics: { provider: "openai-compatible", model: "fixture-model" } }),
    };

    await expect(
      generateWithServerAI(
        { source, sourceVersionId: "v1", platforms: ["wechat"] },
        { env, createProvider: () => provider },
      ),
    ).resolves.toMatchObject({ diagnostics: { model: "fixture-model" } });
    expect(provider.generate).toHaveBeenCalledTimes(2);
  });

  it("maps upstream authentication errors without exposing the secret", async () => {
    const provider = {
      model: "fixture-model",
      generate: vi.fn().mockRejectedValue(
        new AIProviderError({
          code: "transport",
          message: "provider failed with secret server-secret",
          retryable: false,
          diagnostics: { provider: "openai-compatible", model: "fixture-model", status: 401, errorCode: "transport" },
        }),
      ),
    };

    const error = await generateWithServerAI(
      { source, sourceVersionId: "v1", platforms: ["wechat"] },
      { env, createProvider: () => provider },
    ).catch((value) => value);

    expect(error).toBeInstanceOf(ServerAIError);
    expect(error).toMatchObject({ code: "AI_UNAUTHORIZED_UPSTREAM", retryable: false });
    expect(String(error)).not.toContain("server-secret");
  });

  it("maps a missing Volcengine model or endpoint to a configuration error", async () => {
    const provider = {
      model: "missing-model",
      generate: vi.fn().mockRejectedValue(
        new AIProviderError({
          code: "transport",
          message: "provider returned 404",
          retryable: true,
          diagnostics: { provider: "openai-compatible", model: "missing-model", status: 404, errorCode: "transport" },
        }),
      ),
    };

    const error = await generateWithServerAI(
      { source, sourceVersionId: "v1", platforms: ["wechat"] },
      { env, createProvider: () => provider },
    ).catch((value) => value);

    expect(error).toMatchObject({ code: "AI_NOT_CONFIGURED", retryable: false });
    expect(String(error)).toContain("AI_MODEL");
    expect(provider.generate).toHaveBeenCalledOnce();
  });

  it("splits multi-platform server requests before calling the model", async () => {
    const provider = {
      model: "fixture-model",
      generate: vi.fn(async (input: ProviderGenerateOptions) => {
        void input;
        return {
          response: { schemaVersion: 1 as const, drafts: [] },
          diagnostics: { provider: "openai-compatible" as const, model: "fixture-model" },
        };
      }),
    };

    await expect(
      generateWithServerAI(
        { source, sourceVersionId: "v1", platforms: ["wechat", "xiaohongshu", "douyinImage", "douyinLongform"] },
        { env, createProvider: () => provider },
      ),
    ).resolves.toMatchObject({ diagnostics: { details: ["split_platform_requests:4"] } });

    expect(provider.generate).toHaveBeenCalledTimes(4);
    const calls = provider.generate.mock.calls as Array<[ProviderGenerateOptions]>;
    expect(calls.map(([input]) => input.platforms)).toEqual([["wechat"], ["xiaohongshu"], ["douyinImage"], ["douyinLongform"]]);
  });

  it("retries one invalid structured response", async () => {
    const provider = {
      model: "fixture-model",
      generate: vi
        .fn()
        .mockRejectedValueOnce(new ServerAIError("AI_INVALID_RESPONSE", "invalid response", false))
        .mockResolvedValue({ response: { schemaVersion: 1 as const, drafts: [] }, diagnostics: { provider: "openai-compatible" as const, model: "fixture-model" } }),
    };

    await expect(
      generateWithServerAI(
        { source, sourceVersionId: "v1", platforms: ["wechat"] },
        { env, createProvider: () => provider },
      ),
    ).resolves.toMatchObject({ diagnostics: { model: "fixture-model" } });
    expect(provider.generate).toHaveBeenCalledTimes(2);
  });
});
