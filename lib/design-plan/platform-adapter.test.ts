import { describe, expect, it } from "vitest";
import { parseArticleContent } from "../article-parser";
import { analyzeArticleDesign } from "./local-analyzer";
import { buildPlatformArticle } from "./platform-adapter";

describe("buildPlatformArticle", () => {
  const source = parseArticleContent(`# 企业 AI 落地

先选择一个高频流程。

## 再补知识基础

整理标准答案和升级规则。

总结：先做小闭环。`, { mode: "knowledge" });
  const plan = analyzeArticleDesign(source);

  it("keeps WeChat reasoning in source order", () => {
    const result = buildPlatformArticle(source, "wechat", plan);
    const originalBodyIds = source.blocks.filter((block) => block.type !== "title").map((block) => block.id);
    const resultBodyIds = result.blocks.filter((block) => block.type !== "title").map((block) => block.id);
    expect(resultBodyIds).toEqual(originalBodyIds);
  });

  it("keeps the cover hierarchy in the flowing body and reserves a conclusion page", () => {
    const result = buildPlatformArticle(source, "xiaohongshu", plan);
    const pageBreaks = result.blocks.filter((block) => block.type === "pageBreak");
    expect(result.blocks[0]?.type).toBe("title");
    expect(result.blocks[1]?.type).toBe("lead");
    expect(pageBreaks).toHaveLength(1);
    expect(result.blocks.some((block) => block.type === "summary")).toBe(true);
    expect(result.blocks.some((block) => block.type === "cta")).toBe(true);
  });
});
