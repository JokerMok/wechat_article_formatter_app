import { afterEach, describe, expect, it, vi } from "vitest";
import { parseArticleContent } from "../article-parser";
import cancelFixture from "../../tests/fixtures/ai/cancel-response.json";
import diffFixture from "../../tests/fixtures/ai/diff-response.json";
import injectionFixture from "../../tests/fixtures/ai/injection-response.json";
import invalidJsonFixture from "../../tests/fixtures/ai/invalid-json-response.json";
import invalidFixture from "../../tests/fixtures/ai/invalid-response.json";
import rateLimitFixture from "../../tests/fixtures/ai/rate-limit-response.json";
import timeoutFixture from "../../tests/fixtures/ai/timeout-response.json";
import validFixture from "../../tests/fixtures/ai/valid-response.json";
import {
  OpenAICompatibleProvider,
  buildFallbackPlatformVersions,
  buildPlatformChangeRecords,
  generatePlatformVersions,
  validateGeneratedFacts,
} from "./provider";
import type { GeneratePlatformVersionsResult } from "./provider";
import type { PlatformVersionMap } from "../platforms/types";

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

function delayedRejectingJsonResponse(init?: ResponseInit) {
  const response = new Response("", {
    headers: { "content-type": "application/json", ...init?.headers },
    status: init?.status ?? 200,
    statusText: init?.statusText,
  });
  response.json = () => new Promise((_, reject) => {
    setTimeout(() => reject(new Error("body read aborted")), 50);
  });
  return response;
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
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input;
      void init;
      return jsonResponse(validFixture);
    });
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
    const requestBody = JSON.parse(String((init as RequestInit | undefined)?.body)) as { messages: Array<{ content: string }> };
    expect(requestBody.messages[1]?.content).toContain('"sourceText"');
    expect(requestBody.messages[1]?.content).not.toContain('"startLine"');
  });

  it("keeps source wording when layout-only mode is selected even if the model rewrites it", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input;
      void init;
      return jsonResponse(validFixture);
    });
    const result = await generatePlatformVersions({
      provider: new OpenAICompatibleProvider({ ...baseProviderConfig, fetchImpl: fetchMock }),
      source,
      sourceVersionId: "source-layout-only",
      generationMode: "layoutOnly",
      platforms: ["wechat", "xiaohongshu"],
      now: () => "2026-08-21T00:00:00.000Z",
    });

    expectOk(result);
    expect(result.designPlan.generationMode).toBe("layoutOnly");
    expect(result.versions.wechat?.title).toBe("知识库重构");
    expect(result.versions.wechat?.content.blocks.map((block) => block.plainText).join("\n")).toContain("资料散落在不同地方。");
    expect(result.versions.wechat?.content.blocks.map((block) => block.plainText).join("\n")).not.toContain("先做可编辑版本");
    expect(result.changes.some((change) => change.field === "title")).toBe(false);
  });

  it("materializes the minimal editorial plan response into local platform pages", async () => {
    const sourceParagraph = source.blocks.find((block) => block.type === "paragraph");
    expect(sourceParagraph).toBeDefined();
    const response = {
      id: "chatcmpl-editorial-plan",
      choices: [{
        message: {
          content: JSON.stringify({
            schemaVersion: 1,
            editorialPlans: [{
              schemaVersion: 1,
              platform: "xiaohongshu",
              contentType: "knowledgeTutorial",
              title: "知识库重构",
              sections: [{
                id: "section-1",
                role: "claim",
                body: sourceParagraph!.text,
                sourceBlockIds: [sourceParagraph!.id],
              }],
              tags: ["知识库"],
            }],
          }),
        },
      }],
    };
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input;
      void init;
      return jsonResponse(response);
    });
    const provider = new OpenAICompatibleProvider({
      ...baseProviderConfig,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const result = await generatePlatformVersions({
      provider,
      source,
      sourceVersionId: "source-editorial-plan",
      generationMode: "reachOptimized",
      platforms: ["xiaohongshu"],
    });

    expectOk(result);
    expect(result.designPlan.platformPlans.xiaohongshu.editorialPlan).toMatchObject({
      platform: "xiaohongshu",
      sections: [{ id: "section-1", role: "claim", sourceBlockIds: [sourceParagraph!.id] }],
    });
    expect(result.versions.xiaohongshu?.content.blocks.some((block) => block.type === "pageBreak")).toBe(true);
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const requestBody = JSON.parse(String(requestInit?.body)) as { messages: Array<{ content: string }> };
    expect(requestBody.messages[0]?.content).toContain("editorialPlans");
    expect(requestBody.messages[0]?.content).toContain("Do not return designPlan, drafts, UnifiedArticleContent");
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

  it("keeps fallback platform content isolated from source and sibling versions", () => {
    const fallback = buildFallbackPlatformVersions(source, ["wechat", "xiaohongshu", "douyinImage"], "2026-08-21T00:00:00.000Z");
    const wechat = fallback.wechat!;
    const xiaohongshu = fallback.xiaohongshu!;
    const douyinImage = fallback.douyinImage!;
    const wechatContent = fallback.wechat!.content;
    const xiaohongshuContent = fallback.xiaohongshu!.content;
    const douyinImageContent = fallback.douyinImage!.content;
    const originalBlockCount = source.blocks.length;
    const originalWechatHighlights = [...wechat.highlights!];
    const originalXiaohongshuTags = [...xiaohongshu.tags!];
    const originalDouyinImageCover = { ...douyinImage.cover };

    wechat.highlights!.push("mutated highlight");
    wechat.tags!.push("mutated tag");
    douyinImage.cover!.title = "mutated cover title";
    wechatContent.blocks[0]!.plainText = "mutated fallback title";
    wechatContent.blocks[0]!.source.sourceText = "mutated source text";
    wechatContent.blocks.push({
      id: "mutated-block",
      type: "paragraph",
      text: "mutated block",
      plainText: "mutated block",
      markdown: "mutated block",
      source: {
        startLine: 1,
        endLine: 1,
        startOffset: 0,
        endOffset: 1,
        sourceText: "mutated block source",
      },
    });
    wechatContent.warnings.push({
      code: "unsupported_block",
      message: "mutated warning",
      source: {
        startLine: 1,
        endLine: 1,
        startOffset: 0,
        endOffset: 1,
        sourceText: "mutated warning source",
      },
    });

    expect(wechat.highlights).toEqual([...originalWechatHighlights, "mutated highlight"]);
    expect(xiaohongshu.highlights).toEqual(originalWechatHighlights);
    expect(douyinImage.highlights).toEqual(originalWechatHighlights);
    expect(xiaohongshu.tags).toEqual(originalXiaohongshuTags);
    expect(douyinImage.cover).toEqual({ ...originalDouyinImageCover, title: "mutated cover title" });
    expect(source.blocks[0]!.plainText).toBe("知识库重构");
    expect(source.blocks[0]!.source.sourceText).toBe("知识库重构");
    expect(source.blocks).toHaveLength(originalBlockCount);
    expect(source.warnings).toEqual([]);
    expect(xiaohongshuContent.blocks[0]!.plainText).toBe("知识库重构");
    expect(xiaohongshuContent.blocks[0]!.source.sourceText).toBe("知识库重构");
    expect(xiaohongshuContent.blocks).toHaveLength(originalBlockCount);
    expect(xiaohongshuContent.warnings).toEqual([]);
    expect(xiaohongshuContent.blocks[0]!.source).toEqual(source.blocks[0]!.source);
    expect(douyinImageContent.blocks[0]!.plainText).toBe("知识库重构");
    expect(douyinImageContent.warnings).toEqual([]);
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

  it("accepts Volcengine's null value for the optional cover field", async () => {
    const response = {
      id: "chatcmpl-xiaohongshu-null-cover",
      object: "chat.completion",
      model: "fixture-model",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: JSON.stringify({
              schemaVersion: 1,
              drafts: [
                {
                  platform: "xiaohongshu",
                  title: "资料太散？先搭一个知识库",
                  summary: "把散落资料整理成可复用内容。",
                  highlights: ["先整理资料"],
                  tags: ["知识库"],
                  cover: null,
                  content: "把散落资料整理成可复用内容。",
                },
              ],
            }),
          },
        },
      ],
    };
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(response)));

    const result = await generatePlatformVersions({
      provider: new OpenAICompatibleProvider(baseProviderConfig),
      source,
      sourceVersionId: "source-v1",
      platforms: ["xiaohongshu"],
    });

    expectOk(result);
    expect(result.versions.xiaohongshu).toMatchObject({
      platform: "xiaohongshu",
      title: "资料太散？先搭一个知识库",
      cover: undefined,
    });
  });

  it("normalizes a string cover description into supported cover metadata", async () => {
    const response = {
      id: "chatcmpl-xiaohongshu-string-cover",
      object: "chat.completion",
      model: "fixture-model",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: JSON.stringify({
              schemaVersion: 1,
              drafts: [
                {
                  platform: "xiaohongshu",
                  title: "资料太散？先搭一个知识库",
                  summary: "把散落资料整理成可复用内容。",
                  highlights: ["先整理资料"],
                  tags: ["知识库"],
                  cover: "封面突出资料散落和整理方法",
                  content: "把散落资料整理成可复用内容。",
                },
              ],
            }),
          },
        },
      ],
    };
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(response)));

    const result = await generatePlatformVersions({
      provider: new OpenAICompatibleProvider(baseProviderConfig),
      source,
      sourceVersionId: "source-v1",
      platforms: ["xiaohongshu"],
    });

    expectOk(result);
    expect(result.versions.xiaohongshu?.cover).toEqual({ subtitle: "封面突出资料散落和整理方法" });
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

  it("TEST-008 keeps delayed caller cancellation from being reclassified as timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        setTimeout(() => reject(init.signal?.reason), 50);
      }, { once: true });
    })));

    const controller = new AbortController();
    const cancelPromise = generatePlatformVersions({
      provider: new OpenAICompatibleProvider({ ...baseProviderConfig, timeoutMs: 25 }),
      source,
      sourceVersionId: "source-v1",
      platforms: ["wechat"],
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 10);

    await vi.advanceTimersByTimeAsync(100);
    await expect(cancelPromise).resolves.toMatchObject({ ok: false, error: { code: "cancelled" } });
  });

  it("TEST-008 keeps caller cancellation during response body parsing from being reclassified as transport", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => delayedRejectingJsonResponse()));

    const controller = new AbortController();
    const cancelPromise = generatePlatformVersions({
      provider: new OpenAICompatibleProvider({ ...baseProviderConfig, timeoutMs: 25 }),
      source,
      sourceVersionId: "source-v1",
      platforms: ["wechat"],
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 10);

    await vi.advanceTimersByTimeAsync(100);
    await expect(cancelPromise).resolves.toMatchObject({ ok: false, error: { code: "cancelled" } });
  });

  it("TEST-008 keeps timeout during response body parsing from being reclassified as transport", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => delayedRejectingJsonResponse()));

    const timeoutPromise = generatePlatformVersions({
      provider: new OpenAICompatibleProvider({ ...baseProviderConfig, timeoutMs: 25 }),
      source,
      sourceVersionId: "source-v1",
      platforms: ["wechat"],
    });

    await vi.advanceTimersByTimeAsync(100);
    await expect(timeoutPromise).resolves.toMatchObject({ ok: false, error: { code: "timeout" } });
  });

  it("TEST-008 preserves timeout when caller aborts after timeout but before body rejection settles", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => delayedRejectingJsonResponse()));

    const controller = new AbortController();
    const timeoutPromise = generatePlatformVersions({
      provider: new OpenAICompatibleProvider({ ...baseProviderConfig, timeoutMs: 25 }),
      source,
      sourceVersionId: "source-v1",
      platforms: ["wechat"],
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 30);

    await vi.advanceTimersByTimeAsync(100);
    await expect(timeoutPromise).resolves.toMatchObject({ ok: false, error: { code: "timeout" } });
  });

  it("TEST-008 keeps caller cancellation during 429 body parsing from being reclassified as rate_limit", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => delayedRejectingJsonResponse({ status: 429, statusText: "Too Many Requests" })));

    const controller = new AbortController();
    const cancelPromise = generatePlatformVersions({
      provider: new OpenAICompatibleProvider({ ...baseProviderConfig, timeoutMs: 25 }),
      source,
      sourceVersionId: "source-v1",
      platforms: ["wechat"],
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 10);

    await vi.advanceTimersByTimeAsync(100);
    await expect(cancelPromise).resolves.toMatchObject({ ok: false, error: { code: "cancelled" } });
  });

  it("TEST-007 exposes compact added, removed, and rewritten field changes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(diffFixture)));
    const existing = buildFallbackPlatformVersions(source, ["wechat", "xiaohongshu"], "2026-08-20T00:00:00.000Z");
    existing.xiaohongshu!.cover = { title: "旧封面", subtitle: "旧副标题" };

    const result = await generatePlatformVersions({
      provider: new OpenAICompatibleProvider(baseProviderConfig),
      source,
      sourceVersionId: "source-v1",
      platforms: ["wechat", "xiaohongshu"],
      existingVersions: existing,
      now: () => "2026-08-21T00:00:00.000Z",
    });

    expectOk(result);
    expect(result.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ platform: "wechat", field: "cover", kind: "added" }),
      expect.objectContaining({ platform: "wechat", field: "title", kind: "rewritten" }),
      expect.objectContaining({ platform: "xiaohongshu", field: "cover", kind: "removed" }),
      expect.objectContaining({ platform: "xiaohongshu", field: "summary", kind: "rewritten" }),
    ]));

    const changes = JSON.stringify(result.changes);
    expect(changes).not.toContain("资料散落在不同地方");
    expect(changes).not.toContain(baseProviderConfig.apiKey);
    expect(changes).not.toContain("chatcmpl-diff");
    expect(result.changes.every((change) => change.before || change.after)).toBe(true);
  });

  it("builds safe change records for existing WeChat platform block content", () => {
    const previous = {
      wechat: {
        platform: "wechat",
        status: "edited",
        title: "旧微信版本",
        summary: "旧摘要",
        content: {
          blocks: [
            { id: "wx-1", type: "richText", html: "<p>旧正文</p>", text: "旧正文" },
            { id: "wx-2", type: "image", imageId: "cover-1", alt: "封面" },
          ],
          html: "<section><p>旧正文</p></section>",
        },
        updatedAt: "2026-08-20T00:00:00.000Z",
      },
    } satisfies PlatformVersionMap<unknown>;
    const next = buildFallbackPlatformVersions(source, ["wechat"], "2026-08-21T00:00:00.000Z");

    const changes = buildPlatformChangeRecords(["wechat"], previous, next);

    expect(changes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        platform: "wechat",
        field: "content",
        kind: "rewritten",
        before: { blockCount: 2, textLength: 5 },
        after: { blockCount: source.blocks.length, textLength: 30 },
      }),
    ]));
    expect(JSON.stringify(changes)).not.toContain("旧正文");
    expect(JSON.stringify(changes)).not.toContain("<section>");
    expect(JSON.stringify(changes)).not.toContain("资料散落在不同地方");
  });

  it("TEST-009 keeps generated content available and records unsupported numbers as a warning", async () => {
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
    expect(result).toMatchObject({ ok: true, diagnostics: { details: ["wechat:fact_check_warning:unsupported_number_count:1"] } });
  });

  it("TEST-021 keeps unsupported quoted claims out of diagnostics", async () => {
    const unsupportedQuote = "内部客户密钥需要保密不能出现在诊断里";
    const assistantContent = JSON.parse(String(validFixture.choices[0].message.content)) as {
      drafts: Array<{ summary: string }>;
    };
    assistantContent.drafts[0]!.summary = `把散落资料整理成可复用知识库，"${unsupportedQuote}"。`;

    vi.stubGlobal("fetch", vi.fn(async () =>
      jsonResponse({
        ...validFixture,
        choices: [
          {
            ...validFixture.choices[0],
            message: {
              role: "assistant",
              content: JSON.stringify(assistantContent),
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

    expectOk(result);
    const diagnostics = JSON.stringify(result.diagnostics);
    expect(diagnostics).toContain("wechat:fact_check_warning:unsupported_quote_count:1");
    expect(diagnostics).not.toContain(unsupportedQuote);
    expect(diagnostics).not.toContain(unsupportedQuote.slice(0, 20));
    expect(diagnostics).not.toContain("资料散落在不同地方");
    expect(diagnostics).not.toContain(String(validFixture.choices[0].message.content));
    expect(diagnostics).not.toContain(baseProviderConfig.apiKey);
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

  it("normalizes a plain-text draft content into the unified article structure", async () => {
    const plainTextFixture = {
      ...validFixture,
      choices: [
        {
          ...validFixture.choices[0],
          message: {
            role: "assistant",
            content: JSON.stringify({
              schemaVersion: 1,
              drafts: [
                {
                  platform: "wechat",
                  title: "知识库重构的关键判断",
                  summary: "先把散落资料整理成可复用知识库。",
                  highlights: [],
                  tags: ["知识库", "企业AI"],
                  content: "先把散落资料整理成可复用知识库。\n\n再基于稳定资料接入业务应用。",
                },
              ],
            }),
          },
        },
      ],
    };
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(plainTextFixture)));

    const result = await generatePlatformVersions({
      provider: new OpenAICompatibleProvider(baseProviderConfig),
      source,
      sourceVersionId: "source-v1",
      platforms: ["wechat"],
    });

    expectOk(result);
    expect(result.versions.wechat?.content.schemaVersion).toBe(1);
    expect(result.versions.wechat?.content.title).toBe("知识库重构的关键判断");
    expect(result.versions.wechat?.content.blocks[0]).toMatchObject({ type: "title", text: "知识库重构的关键判断" });
    expect(result.versions.wechat?.content.blocks.some((block) => block.type === "paragraph" && block.text.includes("散落资料"))).toBe(true);
    expect(result.versions.wechat?.highlights).toEqual(["知识库重构的关键判断", "先把散落资料整理成可复用知识库。", "再基于稳定资料接入业务应用。"]);
  });

  it("accepts a constrained AI design plan and hydrates controlled visual tokens", async () => {
    const assistantContent = JSON.parse(String(validFixture.choices[0].message.content)) as Record<string, unknown>;
    assistantContent.designPlan = {
      contentType: "checklistGuide",
      targetAudience: "需要整理企业知识的项目负责人",
      coreMessage: "先统一资料，再接入业务应用。",
      recommendedTitle: "企业知识库整理清单",
      titleCandidates: ["企业知识库整理清单", "先整理资料，再接 AI", "知识库落地的三个动作"],
      openingHook: "资料没有整理好，模型能力再强也难以稳定复用。",
      keyPoints: ["收集资料", "统一口径", "建立更新机制"],
      conclusion: "知识库首先是一套可持续维护的资料流程。",
      callToAction: "先检查现有资料缺在哪一步。",
      recommendedScheme: "checklistGuide",
      recommendationReason: "文章包含可执行动作，适合清单结构。",
    };
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
      ...validFixture,
      choices: [{ ...validFixture.choices[0], message: { role: "assistant", content: JSON.stringify(assistantContent) } }],
    })));

    const result = await generatePlatformVersions({
      provider: new OpenAICompatibleProvider(baseProviderConfig),
      source,
      platforms: ["wechat"],
    });

    expectOk(result);
    expect(result.designPlan).toMatchObject({
      contentType: "checklistGuide",
      recommendedScheme: "checklistGuide",
      visualStyle: "B 高能信息卡",
      recommendedTitle: "企业知识库整理清单",
    });
    expect(result.designPlan.palette.primary).toBe("#111111");
  });

  it("falls back to the local design plan when AI design fields are illegal", async () => {
    const assistantContent = JSON.parse(String(validFixture.choices[0].message.content)) as Record<string, unknown>;
    assistantContent.designPlan = {
      contentType: "viralMagic",
      recommendedScheme: "<script>alert(1)</script>",
      recommendedTitle: "<style>body{display:none}</style>",
      html: "<iframe src='evil'></iframe>",
    };
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
      ...validFixture,
      choices: [{ ...validFixture.choices[0], message: { role: "assistant", content: JSON.stringify(assistantContent) } }],
    })));

    const result = await generatePlatformVersions({
      provider: new OpenAICompatibleProvider(baseProviderConfig),
      source,
      platforms: ["wechat"],
    });

    expectOk(result);
    expect(result.designPlan.contentType).not.toBe("viralMagic");
    expect(result.designPlan.recommendedScheme).not.toContain("script");
    expect(JSON.stringify(result.designPlan)).not.toMatch(/script|iframe|display:none/i);
  });
});
