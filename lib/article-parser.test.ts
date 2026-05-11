import { describe, expect, it } from "vitest";
import { parseArticle } from "./article-parser";

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

  it("keeps empty lines from breaking paragraph and section recognition", () => {
    const blocks = parseArticle(`深度文章标题


第一段内容很长，用来测试普通段落识别，不应该因为空行被错误分类。

总结
这意味着排版系统需要稳定输出。`);

    expect(blocks[0]).toEqual({ type: "title", text: "深度文章标题" });
    expect(blocks.some((block) => block.type === "section" && block.text === "总结")).toBe(true);
    expect(blocks.some((block) => block.type === "summary")).toBe(true);
  });

  it("detects cards and Chinese numbered sections", () => {
    const blocks = parseArticle(`文章主标题

一、为什么要重构
核心价值：让模板可以持续扩展`);

    expect(blocks.map((block) => block.type)).toEqual(["title", "section", "card"]);
  });
});
