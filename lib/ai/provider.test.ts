import { afterEach, describe, expect, it, vi } from "vitest";
import { parseArticleContent } from "../article-parser";
import cancelFixture from "../../tests/fixtures/ai/cancel-response.json";
import injectionFixture from "../../tests/fixtures/ai/injection-response.json";
import invalidJsonFixture from "../../tests/fixtures/ai/invalid-json-response.json";
import invalidFixture from "../../tests/fixtures/ai/invalid-response.json";
import rateLimitFixture from "../../tests/fixtures/ai/rate-limit-response.json";
import timeoutFixture from "../../tests/fixtures/ai/timeout-response.json";
import validFixture from "../../tests/fixtures/ai/valid-response.json";
import {
  OpenAICompatibleProvider,
  buildFallbackPlatformVersions,
  generatePlatformVersions,
  validateGeneratedFacts,
} from "./provider";
import type { GeneratePlatformVersionsResult } from "./provider";

const source = parseArticleContent(`知识库重构

资料散落在不同地方。
改造目标：整理成可复用知识库。`, { mode: "business" });

const baseProviderConfig = {
  baseUrl: "https://api.example.test/v1",
  apiKey: "test-api-token",
  model: "fixture-model",
};

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json", ...init?.headers },
    status: init?.status ?? 200,
    statusText: init?.statusText,
  });
}

function expectOk(result: GeneratePlatformVersionsResult): asserts result is Extract<GeneratePlatformVersionsResult, { ok: true }> {
  expect(result.ok).toBe(true);
}

function expectFailure(result: GeneratePlatformVersionsResult): asserts result is Extract<GeneratePlatformVersionsResult, { ok: false }> {
  expect(result.ok).toBe(false);
}

describe("OpenAICompatibleProvider", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("TEST-007 generates validated platform versions without exposing secrets in diagnostics", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(validFixture));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generatePlatformVersions({
      provider: new OpenAICompatibleProvider(baseProviderConfig),
      source,
      sourceVersionId: "source-v1",
      platforms: ["wechat", "xiaohongshu", "douyinImage", "douyinLongform"],
      now: () => "2026-08-21T00:00:00.000Z",
    });

    expectOk(result);
    expect(result.versions.wechat).toMatchObject({
      platform: "wechat",
      status: "generated",
      title: "知识库重构的关键判断",
      summary: "把散落资料整理成可复用知识库，先解决查找和复用问题。",
      highlights: ["资料散落会拖慢复用", "知识库需要稳定结构", "先做可编辑版本"],
      tags: ["知识库", "效率", "方法论"],
      updatedAt: "2026-08-21T00:00:00.000Z",
    });
    expect(Object.keys(result.versions)).toEqual(["wechat", "xiaohongshu", "douyinImage", "douyinLongform"]);
    expect(result.diagnostics).toMatchObject({
      provider: "openai-compatible",
      model: "fixture-model",
      sourceVersionId: "source-v1",
    });
    expect(JSON.stringify(result.diagnostics)).not.toContain(baseProviderConfig.apiKey);

    const [, init] = fetchMock.mock.calls[0];
    expect(fetchMock).toHaveBeenCalledWith("https://api.example.test/v1/chat/completions", expect.any(Object));
    expect(JSON.stringify(init)).toContain("Bearer test-api-token");
  });

  it("TEST-008 keeps existing content on schema errors and returns fallback versions", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(invalidFixture)));
    const existing = buildFallbackPlatformVersions(source, ["wechat"], "2026-08-20T00:00:00.000Z");

    const result = await generatePlatformVersions({
      provider: new OpenAICompatibleProvider(baseProviderConfig),
      source,
      sourceVersionId: "source-v1",
      platforms: ["wechat"],
      existingVersions: existing,
      now: () => "2026-08-21T00:00:00.000Z",
    });

    expectFailure(result);
    expect(result.error.code).toBe("schema");
    expect(result.versions).toBe(existing);
    expect(result.fallbackVersions.wechat).toMatchObject({
      status: "draft",
      title: "知识库重构",
      updatedAt: "2026-08-21T00:00:00.000Z",
    });
  });

  it("TEST-008 classifies invalid assistant JSON as a schema error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(invalidJsonFixture)));

    const result = await generatePlatformVersions({
      provider: new OpenAICompatibleProvider(baseProviderConfig),
      source,
      sourceVersionId: "source-v1",
      platforms: ["wechat"],
    });

    expectFailure(result);
    expect(result.error).toMatchObject({
      code: "schema",
      retryable: false,
    });
  });

  it("TEST-008 classifies 429 responses without retrying", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(rateLimitFixture, { status: 429, statusText: "Too Many Requests" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generatePlatformVersions({
      provider: new OpenAICompatibleProvider(baseProviderConfig),
      source,
      sourceVersionId: "source-v1",
      platforms: ["wechat"],
    });

    expectFailure(result);
    expect(result.error.code).toBe("rate_limit");
    expect(result.error.retryable).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("TEST-008 classifies non-429 HTTP failures as transport errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: { message: "server failed" } }, { status: 500 })));

    const result = await generatePlatformVersions({
      provider: new OpenAICompatibleProvider(baseProviderConfig),
      source,
      sourceVersionId: "source-v1",
      platforms: ["wechat"],
    });

    expectFailure(result);
    expect(result.error).toMatchObject({
      code: "transport",
      retryable: true,
    });
  });

  it("TEST-008 classifies timeout and caller cancellation separately", async () => {
    expect(timeoutFixture.scenario).toBe("timeout");
    expect(cancelFixture.scenario).toBe("cancel");
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    })));

    const timeoutPromise = generatePlatformVersions({
      provider: new OpenAICompatibleProvider({ ...baseProviderConfig, timeoutMs: 25 }),
      source,
      sourceVersionId: "source-v1",
      platforms: ["wechat"],
    });
    await vi.advanceTimersByTimeAsync(26);
    await expect(timeoutPromise).resolves.toMatchObject({ ok: false, error: { code: "timeout" } });

    const controller = new AbortController();
    const cancelPromise = generatePlatformVersions({
      provider: new OpenAICompatibleProvider({ ...baseProviderConfig, timeoutMs: 1000 }),
      source,
      sourceVersionId: "source-v1",
      platforms: ["wechat"],
      signal: controller.signal,
    });
    controller.abort();
    await expect(cancelPromise).resolves.toMatchObject({ ok: false, error: { code: "cancelled" } });
  });

  it("TEST-009 rejects generated numbers that are not supported by source text", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      jsonResponse({
        ...validFixture,
        choices: [
          {
            ...validFixture.choices[0],
            message: {
              role: "assistant",
              content: String(validFixture.choices[0].message.content).replace(
                "把散落资料整理成可复用知识库，先解决查找和复用问题。",
                "把散落资料整理成可复用知识库，效率提升 300%。"
              ),
            },
          },
        ],
      })
    ));

    const result = await generatePlatformVersions({
      provider: new OpenAICompatibleProvider(baseProviderConfig),
      source,
      sourceVersionId: "source-v1",
      platforms: ["wechat"],
    });

    expect(validateGeneratedFacts("效率提升 300%。", source).unsupportedNumbers).toEqual(["300"]);
    expect(result).toMatchObject({ ok: false, error: { code: "schema" } });
  });

  it("TEST-021 keeps diagnostics compact and excludes body, key, and full model response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(invalidFixture)));

    const result = await generatePlatformVersions({
      provider: new OpenAICompatibleProvider(baseProviderConfig),
      source,
      sourceVersionId: "source-v1",
      platforms: ["wechat"],
    });

    expectFailure(result);
    const diagnostics = JSON.stringify(result.error.diagnostics);
    expect(diagnostics).toContain("schema");
    expect(diagnostics).not.toContain(baseProviderConfig.apiKey);
    expect(diagnostics).not.toContain("资料散落在不同地方");
    expect(diagnostics).not.toContain(String(invalidFixture.choices[0].message.content));
  });

  it("TEST-022 treats AI content as data and strips script, event attributes, and dangerous URLs", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(injectionFixture)));

    const result = await generatePlatformVersions({
      provider: new OpenAICompatibleProvider(baseProviderConfig),
      source,
      sourceVersionId: "source-v1",
      platforms: ["wechat"],
    });

    expectOk(result);
    const version = result.versions.wechat;
    expect(version?.title).toBe("知识库重构");
    expect(version?.summary).toBe("普通文字");
    expect(version?.highlights).toEqual(["有效重点"]);
    expect(version?.tags).toEqual(["知识库"]);
    expect(version?.cover?.title).toBe("封面");
    expect(version?.content.blocks[0]?.text).toBe("普通文字");
    expect(JSON.stringify(version)).not.toMatch(/script|onclick|javascript:|onerror|alert|evil/i);
  });
});
