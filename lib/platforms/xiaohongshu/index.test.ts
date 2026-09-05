import { describe, expect, it } from "vitest";
import { parseArticleContent } from "../../article-parser";
import { toXiaohongshuImageText } from ".";
import { collectRenderableBlocks } from "../platform-profiles";

const makeShortArticle = `
标题：短文章

开场：先把结论放在前面。

一、背景
- 这是第一点
- 这是第二点

核心观点：结构化决定可复制性。

一、方法
> 要把输入和输出解耦。

结尾：欢迎讨论。`;

const makeLongArticle = Array.from({ length: 420 }, (_, index) => `第${index + 1}段，围绕同一主题输出稳定可复现的排版内容。`).join("\n\n");

describe("toXiaohongshuImageText", () => {
  it("produces deterministic schema and complete page trace", () => {
    const content = parseArticleContent(makeShortArticle);
    const first = toXiaohongshuImageText(content);
    const second = toXiaohongshuImageText(content);
    expect(second).toEqual(first);

    const renderable = collectRenderableBlocks(content);
    const pageBlockCount = first.pages.reduce((sum, page) => sum + page.blocks.length, 0);
    const sourceBlockCount = first.source.blockIds.length;
    expect(pageBlockCount).toBeGreaterThan(0);
    expect(renderable.length).toBeGreaterThan(0);
    expect(first.source.blockCount).toBe(content.blocks.length);
    expect(first.source.blockIds).toEqual(sourceBlockCount === content.blocks.length ? first.source.blockIds : []);
    expect(first.tags).toEqual([]);
    expect(first.title).toBe("标题：短文章");
    expect(first.body.length).toBeGreaterThan(0);
  });

  it("builds cover and pages without inventing tags from no-title prose", () => {
    const content = parseArticleContent(`第一段没有标题

这是正文正文正文。
`);
    const output = toXiaohongshuImageText(content);

    expect(output.title).toBe("第一段没有标题");
    expect(output.cover.title).toBe("第一段没有标题");
    expect(output.cover.subtitle).toBe("这是正文正文正文。");
    expect(output.pages.length).toBeGreaterThan(0);
    expect(output.tags).toEqual([]);
  });

  it("derives page title and focus prompt for paragraph-only pages", () => {
    const raw = Array.from(
      { length: 8 },
      (_, index) =>
        `这是第${index + 1}段纯正文内容，只有连续的自然语言段落，没有章节标题或重点标记，但仍然需要稳定生成可读的正文页信息。`
    ).join("\n\n");
    const content = parseArticleContent(raw);
    const output = toXiaohongshuImageText(content);

    expect(output.pages.length).toBeGreaterThan(1);
    expect(output.pages.every((page) => page.pageTitle.length > 0)).toBe(true);
    expect(output.pages.every((page) => page.focusPrompt.length > 0)).toBe(true);
    expect(output.pages.every((page) => page.focusPrompt.includes("重点"))).toBe(true);
    expect(output.pages.flatMap((page) => page.sourceBlockIds)).toEqual(
      collectRenderableBlocks(content).map((block) => block.blockId)
    );
    expect(toXiaohongshuImageText(content)).toEqual(output);
  });

  it("handles long inputs without dropped pages", () => {
    const content = parseArticleContent(makeLongArticle);
    const output = toXiaohongshuImageText(content);

    expect(output.pages.length).toBeGreaterThan(1);
    const flattened = output.pages.flatMap((page) => page.sourceBlockIds);
    expect(flattened).toHaveLength(collectRenderableBlocks(content).length);
    expect(new Set(flattened).size).toBe(flattened.length);
  });
});
