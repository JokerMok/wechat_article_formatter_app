import { describe, expect, it } from "vitest";
import { parseArticleContent } from "../article-parser";
import type { UnifiedArticleBlock, UnifiedArticleContent } from "../content";
import { toDouyinImageText } from "../platforms/douyin";
import { toXiaohongshuImageText } from "../platforms/xiaohongshu";
import { analyzeArticleDesign } from "./local-analyzer";
import { buildPlatformArticle } from "./platform-adapter";

describe("buildPlatformArticle", () => {
  const source = parseArticleContent(`# 企业 AI 落地清单

先选择一个高频流程，不要一开始铺开全部业务。

## 再补知识基础

整理标准答案和升级规则，让团队先跑通一个可以验收的小闭环。

## 最后检查边界

- 能回答什么
- 什么时候转人工
- 哪些数据不能使用

总结：先做小闭环，再逐步扩大范围。`, { mode: "knowledge" });
  const plan = analyzeArticleDesign(source);

  it("keeps WeChat reasoning in source order without adding an unsolicited CTA", () => {
    const result = buildPlatformArticle(source, "wechat", plan);
    const text = result.blocks.map(blockText).join("\n");
    expect(text.indexOf("先选择一个高频流程")).toBeLessThan(text.indexOf("再补知识基础"));
    expect(text.indexOf("再补知识基础")).toBeLessThan(text.indexOf("最后检查边界"));
    expect(result.blocks.some((block) => block.type === "cta")).toBe(false);
  });

  it("keeps source image blocks in the generated WeChat content", () => {
    const article = parseArticleContent(`# 图片保留测试

正文需要和图片一起进入公众号成稿。

![流程图](asset:asset-1)`, { mode: "knowledge" });
    const result = buildPlatformArticle(article, "wechat", analyzeArticleDesign(article));

    expect(result.blocks.some((block) => block.type === "image")).toBe(true);
  });

  it("does not repeat the opening paragraph or rewrite source headings in layout-only mode", () => {
    const article = parseArticleContent(`# 项目复盘

## 核心信息

先确认现场问题，再整理证据和行动边界。

## 内容结构

1. 核对事实。
2. 记录行动。
3. 保留边界。`, { mode: "business" });
    const result = buildPlatformArticle(article, "wechat", analyzeArticleDesign(article));
    const texts = result.blocks.map(blockText);

    expect(texts.filter((text) => text === "先确认现场问题，再整理证据和行动边界。")).toHaveLength(1);
    expect(texts).toContain("核心信息");
    expect(texts).toContain("内容结构");
    expect(result.blocks.some((block) => block.type === "list")).toBe(true);
  });

  it("splits long WeChat paragraphs without losing their text", () => {
    const paragraph = "这是用于验证公众号长段拆分的完整句子。".repeat(28);
    const article = parseArticleContent(`# 长段测试\n\n${paragraph}`, { mode: "knowledge" });
    const result = buildPlatformArticle(article, "wechat", analyzeArticleDesign(article));
    const paragraphs = result.blocks.filter((block) => block.type === "paragraph");
    expect(paragraphs.length).toBeGreaterThan(1);
    expect(paragraphs.map((block) => block.text).join("")).toBe(paragraph);
  });

  it("builds a compact Xiaohongshu sequence with explicit page roles", () => {
    const result = buildPlatformArticle(source, "xiaohongshu", plan);
    const pages = splitPages(result);
    const output = toXiaohongshuImageText(result);
    expect(pages.length).toBeGreaterThanOrEqual(3);
    expect(pages.length).toBeLessThanOrEqual(10);
    expect(output.pages).toHaveLength(pages.length);
    expect(pages[0]?.map((block) => block.type)).toEqual(["title"]);
    expect(result.blocks.some((block) => block.id.includes(":page:callToAction:"))).toBe(true);
  });

  it("builds a lower-density 4-8 page Douyin image sequence", () => {
    const result = buildPlatformArticle(source, "douyinImage", plan);
    const pages = splitPages(result);
    const output = toDouyinImageText(result, { ratio: "9:16" });
    expect(pages.length).toBeGreaterThanOrEqual(3);
    expect(pages.length).toBeLessThanOrEqual(8);
    expect(output.pages).toHaveLength(pages.length);
    expect(Math.max(...pages.map((page) => page.length))).toBeLessThanOrEqual(6);
    expect(pages.slice(1).every((page) => page.reduce((count, block) => count + blockText(block).length, 0) <= 240)).toBe(true);
  });

  it("keeps cover titles compact for long source titles", () => {
    const article = parseArticleContent(`# 这是一个非常非常长而且包含许多限定条件的企业人工智能项目落地标题用于验证封面不会溢出

正文说明真实边界。`, { mode: "knowledge" });
    const articlePlan = analyzeArticleDesign(article);
    const xhs = buildPlatformArticle(article, "xiaohongshu", articlePlan);
    const douyin = buildPlatformArticle(article, "douyinImage", articlePlan);
    expect(xhs.blocks.find((block) => block.type === "title")?.text).not.toContain("…");
    expect(douyin.blocks.find((block) => block.type === "title")?.text).not.toContain("…");
    expect(xhs.blocks.find((block) => block.type === "title")?.text).toBeTruthy();
    expect(douyin.blocks.find((block) => block.type === "title")?.text).toBeTruthy();
  });

  it("does not bind unrelated fallback paragraphs to checklist points", () => {
    const article = parseArticleContent(`# 技术项目复盘

## 核心信息

先把陌生技术资料整理成可验证问题，再带着证据推进协作。

## 内容结构

1. 区分中间产物和正式交付。
2. 检查平台接口和运行环境。
3. 保留设备验证边界。

## 延伸素材

旧模型输出不能直接当作训练真值，必须经过人工复核。`, { mode: "knowledge" });
    const result = buildPlatformArticle(article, "xiaohongshu", analyzeArticleDesign(article));
    const pageBodies = splitPages(result)
      .slice(1)
      .flatMap((page) => page.filter((block) => block.type !== "section" && block.type !== "title").map(blockText));
    const counts = new Map(pageBodies.map((text) => [text, pageBodies.filter((candidate) => candidate === text).length]));
    expect(Math.max(...counts.values())).toBe(1);
    expect(pageBodies.filter((text) => text.includes("旧模型输出"))).toHaveLength(1);
  });

  it("filters publishing metadata sections and internal wiki links", () => {
    const article = parseArticleContent(`# 项目复盘

## 素材类型

公众号案例草稿，状态为待核验。

## 核心信息

先整理事实，再形成判断。关联方法见 [[internal/method]]。

## 发布边界

不得公开内部资料。`, { mode: "knowledge" });
    const result = buildPlatformArticle(article, "wechat", analyzeArticleDesign(article));
    const text = result.blocks.map(blockText).join("\n");
    expect(text).toContain("先整理事实，再形成判断");
    expect(text).not.toMatch(/公众号案例草稿|待核验|发布边界|internal\/method/);
  });
});

function splitPages(content: UnifiedArticleContent) {
  const pages: UnifiedArticleBlock[][] = [[]];
  for (const block of content.blocks) {
    if (block.type === "pageBreak") pages.push([]);
    else pages.at(-1)?.push(block);
  }
  return pages.filter((page) => page.length > 0);
}

function blockText(block: UnifiedArticleBlock) {
  if (block.type === "list") return block.items.join("\n");
  if (block.type === "card") return `${block.title ?? ""}${block.body}`;
  return block.text;
}
