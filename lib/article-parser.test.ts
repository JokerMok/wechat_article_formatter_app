import { describe, expect, it } from "vitest";
import type { Mock } from "@vitest/spy";
import { articleContentToBlocks, parseArticle, parseArticleContent, parseSourceDocument } from "./article-parser";
import type { PlatformVersion } from "./platforms/types";

declare module "@vitest/spy" {
  function fn<TImplementation extends (...args: unknown[]) => unknown>(
    originalImplementation: TImplementation
  ): Mock<(...args: [unknown[], ...unknown[]]) => ReturnType<TImplementation>>;
}

describe("parseArticle", () => {
  it("parses markdown headings, paragraphs, lists, images, and CTA blocks", () => {
    const blocks = parseArticle(`# 主标题

这是未来趋势的一个关键判断。

## 一、核心变化

> 关键判断：排版应该服务阅读。

- 标题层级清楚
- 正文节奏稳定

配图：结构示意图

留言领取模板`);

    expect(blocks.map((block) => block.type)).toEqual(["title", "lead", "section", "quote", "list", "image", "cta"]);
  });

  it("keeps consecutive ordered markdown items as one list instead of section titles", () => {
    const content = parseArticleContent(`# 项目复盘

## 内容结构

1. 区分中间产物和正式交付。
2. 检查平台接口和运行环境。
3. 保留设备验证边界。`, { mode: "knowledge" });
    const list = content.blocks.find((block) => block.type === "list");

    expect(content.blocks.filter((block) => block.type === "section")).toHaveLength(1);
    expect(list?.type).toBe("list");
    if (list?.type === "list") {
      expect(list.items).toEqual([
        "区分中间产物和正式交付。",
        "检查平台接口和运行环境。",
        "保留设备验证边界。",
      ]);
    }
  });

  it("keeps empty lines from breaking paragraph and section recognition", () => {
    const blocks = parseArticle(`深度文章标题


第一段内容很长，用来测试普通段落识别，不应该因为空行被错误分类。

总结
这意味着排版系统需要稳定输出。`);

    expect(blocks[0]).toEqual({ type: "title", text: "深度文章标题" });
    expect(blocks.some((block) => block.type === "section" && block.text === "总结")).toBe(true);
    expect(blocks.some((block) => block.type === "summary")).toBe(true);
  });

  it("keeps colon sentences as paragraphs in narrative mode", () => {
    const blocks = parseArticle(`文章主标题

一、为什么要重构
核心价值：让模板可以持续扩展`);

    expect(blocks.map((block) => block.type)).toEqual(["title", "section", "paragraph"]);
  });

  it("detects explicit cards in business mode", () => {
    const blocks = parseArticle(
      `文章主标题

一、为什么要重构
当前问题：资料散落在不同地方。
改造目标：整理成可复用知识库。`,
      { mode: "business" }
    );

    expect(blocks.map((block) => block.type)).toEqual(["title", "section", "card", "card"]);
  });

  it("does not classify reply-related headings or risk notes as CTA", () => {
    const blocks = parseArticle(
      `文章主标题

三、不要一开始就追求自动回复
关键风险：如果知识库没有经过审核，自动回复会把错误答案放大。

留言回复「SOP」，我把检查表发你。`,
      { mode: "business" }
    );

    expect(blocks.map((block) => block.type)).toEqual(["title", "section", "card", "cta"]);
  });

  it("strips broken bold style fragments from pasted content", () => {
    const blocks = parseArticle(`文章主标题

font-weight: 800;">你把逻辑解释清楚，不代表老板会觉得够。`);

    expect(blocks[1]).toEqual({ type: "paragraph", text: "你把逻辑解释清楚，不代表老板会觉得够。" });
  });

  it("strips encoded broken style markers before preserving regular angle brackets", () => {
    const blocks = parseArticle(`文章主标题

font-weight: 800;&quot;&gt;正文内容
Promise<string>、Promise<s> 和 3 < 5 > 2 都要保留。`);

    expect(blocks[1]).toEqual({
      type: "paragraph",
      text: "正文内容Promise<string>、Promise<s> 和 3 < 5 > 2 都要保留。",
    });
  });

  it("drops empty quote markers", () => {
    const blocks = parseArticle(`文章主标题

>
> 
＞ 
&gt;

正文内容`);

    expect(blocks).toEqual([
      { type: "title", text: "文章主标题" },
      { type: "paragraph", text: "正文内容" },
    ]);
  });

  it("creates unified content with source positions and compatible ArticleBlock conversion", () => {
    const raw = `# 主标题

## 一、核心变化

正文第一行
正文第二行

---

<!-- pagebreak -->

> 关键判断：排版应该服务阅读。`;

    const content = parseArticleContent(raw);

    expect(content.sourceFormat).toBe("markdown");
    expect(content.blocks.map((block) => block.type)).toEqual(["title", "section", "paragraph", "divider", "pageBreak", "quote"]);
    expect(content.blocks[2]).toMatchObject({
      type: "paragraph",
      text: "正文第一行正文第二行",
      plainText: "正文第一行正文第二行",
      markdown: "正文第一行\n正文第二行",
      source: {
        startLine: 5,
        endLine: 6,
      },
    });
    expect(articleContentToBlocks(content)).toEqual(parseArticle(raw));
  });

  it("normalizes damaged rich text without dropping valid body text", () => {
    const content = parseArticleContent(
      [
        "文章主标题",
        "",
        "##   ",
        ">",
        '<span style="font-weight: 800;" onclick="evil()">有效文字</span>',
        '<script>alert("x")</script>普通文字',
      ].join("\n")
    );

    expect(content.blocks.map((block) => block.type)).toEqual(["title", "paragraph"]);
    expect(content.blocks[1]).toMatchObject({
      type: "paragraph",
      text: "有效文字普通文字",
    });
    expect(content.sourceText).toContain("onclick");
    expect(content.blocks[1]?.text).not.toMatch(/onclick|script|font-weight|evil|alert/);
  });

  it("keeps the source document syntax-only and fingerprints the exact source", () => {
    const raw = `# 文章标题

真正关键：先把业务边界讲清楚。再把结果说明白。

关键判断：能演示，不代表能处理全量业务。

留言领取检查表

> 这是原文明确引用的判断。`;
    const document = parseSourceDocument(raw, { mode: "business" });

    expect(document.blocks.map((block) => block.type)).toEqual(["title", "paragraph", "paragraph", "paragraph", "quote"]);
    expect(document.blocks.filter((block) => ["lead", "summary", "card", "cta", "golden"].includes(block.type))).toHaveLength(0);
    expect(document.sourceRevision).toMatch(/^src-[0-9a-f]{8}$/);
    expect(document.segments.length).toBe(document.blocks.length);
    expect(document.segments.every((segment) => raw.slice(segment.sourceRange.startOffset, segment.sourceRange.endOffset) === segment.sourceRange.sourceText)).toBe(true);
    expect(document.segments.every((segment) => document.blocks.some((block) => block.id === segment.blockId))).toBe(true);
    expect(parseSourceDocument(raw, { mode: "business" }).sourceRevision).toBe(document.sourceRevision);
    expect(parseSourceDocument(`${raw}!`, { mode: "business" }).sourceRevision).not.toBe(document.sourceRevision);
  });

  it("keeps plain text source format and platform version type contract", () => {
    const content = parseArticleContent(`普通文章标题

第一段正文，不应该丢失。`);
    const platformVersion: PlatformVersion = {
      platform: "wechat",
      status: "draft",
      title: "普通文章标题",
      content,
      updatedAt: "2026-08-21T00:00:00.000Z",
    };

    expect(content.sourceFormat).toBe("plainText");
    expect(content.blocks[1]).toMatchObject({
      type: "paragraph",
      source: {
        startLine: 3,
        endLine: 3,
      },
    });
    expect(platformVersion.platform).toBe("wechat");
  });

  it("does not strip generic types or comparison expressions as HTML tags", () => {
    const content = parseArticleContent(`技术文章标题

Promise<string> 表示异步字符串，表达式 3 < 5 > 2 不应该被删除。
Promise<s> 这种短泛型参数也要保留。
<span style="font-weight: 800;" onclick="evil()">真实 HTML 只保留正文</span>`);

    expect(content.blocks[1]).toMatchObject({
      type: "paragraph",
      text: "Promise<string> 表示异步字符串，表达式 3 < 5 > 2 不应该被删除。Promise<s> 这种短泛型参数也要保留。真实 HTML 只保留正文",
    });
    expect(content.blocks[1]?.text).not.toMatch(/onclick|font-weight|evil/);
  });

  it("preserves fenced code blocks in unified content and compatible blocks", () => {
    const raw = `技术文章标题

\`\`\`ts
const value: Promise<string> = fetchText();
if (3 < 5 && 5 > 2) return value;
\`\`\`

正文继续。`;
    const content = parseArticleContent(raw);

    expect(content.blocks.map((block) => block.type)).toEqual(["title", "code", "paragraph"]);
    expect(content.blocks[1]).toMatchObject({
      type: "code",
      text: "const value: Promise<string> = fetchText();\nif (3 < 5 && 5 > 2) return value;",
      language: "ts",
      source: {
        startLine: 3,
        endLine: 6,
      },
    });
    expect(articleContentToBlocks(content)[1]).toEqual({
      type: "paragraph",
      text: "const value: Promise<string> = fetchText();\nif (3 < 5 && 5 > 2) return value;",
    });
  });
});
