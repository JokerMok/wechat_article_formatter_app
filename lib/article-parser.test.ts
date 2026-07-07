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
});
