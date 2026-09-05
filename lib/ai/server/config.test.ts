import { describe, expect, it } from "vitest";
import { readServerAIConfig } from "./config";

describe("readServerAIConfig", () => {
  it("reads generic OpenAI-compatible environment variables", () => {
    expect(
      readServerAIConfig({
        AI_PROVIDER: "openai-compatible",
        AI_API_KEY: "server-secret",
        AI_BASE_URL: "https://ark.cn-beijing.volces.com/api/v3",
        AI_MODEL: "doubao-seed-1-6-251015",
        AI_CHAT_COMPLETIONS_PATH: "/chat/completions",
        AI_TIMEOUT_MS: "45000",
        AI_MAX_RETRIES: "2",
      }),
    ).toEqual({
      provider: "openai-compatible",
      apiKey: "server-secret",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      model: "doubao-seed-1-6-251015",
      chatCompletionsPath: "/chat/completions",
      timeoutMs: 45000,
      maxRetries: 2,
    });
  });

  it("enforces the 30 second upstream deadline", () => {
    expect(
      readServerAIConfig({
        AI_API_KEY: "server-secret",
        AI_BASE_URL: "https://example.test",
        AI_MODEL: "model",
        AI_TIMEOUT_MS: "120000",
      }).timeoutMs,
    ).toBe(110000);
  });

  it("fails closed when credentials or endpoint are missing", () => {
    expect(() => readServerAIConfig({})).toThrow("服务端 AI 尚未配置完整");
    expect(() => readServerAIConfig({ AI_API_KEY: "secret", AI_BASE_URL: "https://example.test", AI_MODEL: "model", AI_CHAT_COMPLETIONS_PATH: "https://evil.test" })).toThrow(
      "服务端 AI 接口路径配置无效",
    );
  });
});
