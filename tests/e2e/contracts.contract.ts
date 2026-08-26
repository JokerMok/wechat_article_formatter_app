import { expect, test } from "@playwright/test";
import validFixture from "../fixtures/ai/valid-response.json";
import invalidFixture from "../fixtures/ai/invalid-response.json";
import injectionFixture from "../fixtures/ai/injection-response.json";
import { fixedArticles } from "../fixtures/content/articles";
import { parseArticleContent } from "../../lib/article-parser";
import { OpenAICompatibleProvider, buildFallbackPlatformVersions, generatePlatformVersions, validateGeneratedFacts } from "../../lib/ai/provider";
import {
  createPlatformDraft,
  createWorkspaceState,
  readPersistedWorkspace,
  sanitizeWechatHtml,
  serializeWorkspace,
  updatePlatformBlock,
} from "../../components/workspace/state";
import { collectLayoutText, createApproximateTextMeasurer, layoutCardPages } from "../../lib/renderers/cards";
import { createProjectBackupPayload, readProjectBackupPayload } from "../../lib/storage/backup";
import { createEmptyProject } from "../../lib/storage/project-repository";
import type { PlatformId } from "../../lib/platforms/types";

const platforms: PlatformId[] = ["wechat", "xiaohongshu", "douyinImage", "douyinLongform"];

function response(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: init?.status ?? 200,
    statusText: init?.statusText,
  });
}

test("TEST-003/004 fixed articles parse without leaked broken markers", () => {
  expect(fixedArticles).toHaveLength(12);
  expect(new Set(fixedArticles.map((article) => article.category))).toEqual(
    new Set(["plain", "markdown", "long", "list", "quote", "image", "brokenMarkdown", "isolatedQuote", "styleResidue", "longParagraph", "longEnglish", "empty"]),
  );

  for (const article of fixedArticles) {
    const parsed = parseArticleContent(article.source);
    if (article.category === "empty") {
      expect(parsed.blocks).toHaveLength(0);
      continue;
    }
    const parsedText = parsed.blocks.map((block) => block.plainText).join("\n");
    expect(parsed.blocks.length, article.id).toBeGreaterThan(0);
    expect(parsedText).not.toMatch(/font-weight|onclick|<script|<\/script>/i);
    expect(parsed.blocks.some((block) => block.type === "quote" && block.plainText.trim() === ">")).toBe(false);
  }

  const aggregate = parseArticleContent(fixedArticles.map((article) => article.source).join("\n\n"));
  expect(aggregate.blocks.some((block) => block.type === "list")).toBe(true);
  expect(aggregate.blocks.some((block) => block.type === "quote")).toBe(true);
  expect(aggregate.blocks.some((block) => block.type === "image")).toBe(true);
});

test("TEST-005 platform drafts are independent across four platforms", () => {
  const article = parseArticleContent(fixedArticles[1]!.source);
  const drafts = Object.fromEntries(platforms.map((platform) => [platform, createPlatformDraft(platform, article)])) as Record<
    PlatformId,
    ReturnType<typeof createPlatformDraft>
  >;
  const editedWechat = updatePlatformBlock(drafts.wechat, drafts.wechat.content.blocks[0]!.id, "公众号独立标题");

  expect(Object.keys(drafts)).toEqual(platforms);
  expect(editedWechat.status).toBe("edited");
  expect(drafts.xiaohongshu.content.blocks[0]!.plainText).not.toBe("公众号独立标题");
  expect(article.blocks[0]!.plainText).not.toBe("公众号独立标题");
});

test("TEST-007/008 AI fixtures validate success and schema failure without leaking secrets", async () => {
  const source = parseArticleContent("知识库重构\n\n资料散落在不同地方。\n改造目标：整理成可复用知识库。", { mode: "business" });
  const ok = await generatePlatformVersions({
    provider: new OpenAICompatibleProvider({
      baseUrl: "https://api.example.test/v1",
      apiKey: "secret-token",
      model: "fixture-model",
      fetchImpl: async () => response(validFixture),
    }),
    source,
    sourceVersionId: "source-v1",
    platforms,
  });

  expect(ok.ok).toBe(true);
  if (ok.ok) {
    expect(Object.keys(ok.versions)).toEqual(platforms);
    expect(JSON.stringify(ok.diagnostics)).not.toContain("secret-token");
  }

  const existing = buildFallbackPlatformVersions(source, ["wechat"], "2026-08-21T00:00:00.000Z");
  const bad = await generatePlatformVersions({
    provider: new OpenAICompatibleProvider({
      baseUrl: "https://api.example.test/v1",
      apiKey: "secret-token",
      model: "fixture-model",
      fetchImpl: async () => response(invalidFixture),
    }),
    source,
    platforms: ["wechat"],
    existingVersions: existing,
  });

  expect(bad.ok).toBe(false);
  if (!bad.ok) {
    expect(bad.error.code).toBe("schema");
    expect(bad.versions).toBe(existing);
    expect(bad.fallbackVersions.wechat?.status).toBe("draft");
  }
});

test("TEST-009 generated fact checker rejects unsupported concrete facts", () => {
  const source = parseArticleContent("知识库重构\n\n资料散落在不同地方。\n改造目标：整理成可复用知识库。", { mode: "business" });

  expect(validateGeneratedFacts("资料散落在不同地方，改造目标是整理成可复用知识库。", source)).toMatchObject({ ok: true });
  expect(validateGeneratedFacts("2026 年新增 99 个客户案例，收入增长 300%。", source)).toMatchObject({ ok: false });
});

test("TEST-017 backup migration preserves unknown records and restores current workspace payloads", () => {
  const workspace = createWorkspaceState(fixedArticles[0]!.source);
  const project = createEmptyProject({
    id: "fixture-project",
    title: "固定文章项目",
    article: parseArticleContent(fixedArticles[0]!.source),
  });
  const payload = createProjectBackupPayload({
    projects: [{ ...project, platformVersions: serializeWorkspace(workspace) }],
    unknownProjects: [{ state: "unknownVersion", id: "future", schemaVersion: 99, rawData: { schemaVersion: 99, encrypted: true } }],
    assets: [],
    exportedAt: "2026-08-21T00:00:00.000Z",
  });
  const read = readProjectBackupPayload(payload);

  expect(read.unknownProjects[0]?.rawData).toEqual({ schemaVersion: 99, encrypted: true });
  expect(readPersistedWorkspace(read.projects[0]?.platformVersions)).toMatchObject({ schemaVersion: 1, sourceMarkdown: fixedArticles[0]!.source });
});

test("TEST-021/022 sanitizer and AI injection fixture remove executable content", async () => {
  const cleaned = sanitizeWechatHtml(
    '<section onclick="evil()"><script>alert(1)</script><p style="font-weight: 700; background:url(javascript:evil)">正文</p><a href="javascript:evil()">链接</a><img src="data:text/html;base64,abc" onerror="evil()" /></section>',
  );

  expect(cleaned).not.toMatch(/script|onclick|onerror|javascript:|data:text\/html|url\(/i);
  expect(cleaned).toContain("正文");

  const result = await generatePlatformVersions({
    provider: new OpenAICompatibleProvider({
      baseUrl: "https://api.example.test/v1",
      apiKey: "secret-token",
      model: "fixture-model",
      fetchImpl: async () => response(injectionFixture),
    }),
    source: parseArticleContent("知识库重构"),
    platforms: ["wechat"],
  });

  expect(result.ok).toBe(true);
  if (result.ok) {
    const serialized = JSON.stringify(result.versions.wechat);
    expect(serialized).not.toMatch(/<script|onclick|onerror|javascript:/i);
    expect(serialized).toContain("普通文字");
  }
});

test("TEST-023 extreme content lays out with real canvas dimensions and no horizontal overflow reports", () => {
  const measurer = createApproximateTextMeasurer();
  for (const article of fixedArticles.filter((candidate) => candidate.category !== "empty")) {
    const parsed = parseArticleContent(article.source);
    const layout34 = layoutCardPages(parsed, measurer, { aspectRatio: "3:4", maxPages: 80 });
    const layout916 = layoutCardPages(parsed, measurer, { aspectRatio: "9:16", maxPages: 80 });

    expect(layout34.pages.length, article.id).toBeGreaterThan(0);
    expect(layout34.pages[0]?.canvas).toEqual({ width: 1080, height: 1440 });
    expect(layout916.pages[0]?.canvas).toEqual({ width: 1080, height: 1920 });
    expect(layout34.overflow.filter((issue) => issue.type === "horizontal")).toEqual([]);
    expect(layout916.overflow.filter((issue) => issue.type === "horizontal")).toEqual([]);
    expect(collectLayoutText(layout34).length, article.id).toBeGreaterThan(0);
  }

  const emptyLayout = layoutCardPages(parseArticleContent(""), measurer, { aspectRatio: "3:4", maxPages: 5 });
  expect(emptyLayout.pages[0]?.nodes).toHaveLength(0);
  expect(emptyLayout.overflow).toHaveLength(0);
});
