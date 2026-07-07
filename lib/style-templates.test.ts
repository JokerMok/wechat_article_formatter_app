import { describe, expect, it } from "vitest";
import { parseArticle } from "./article-parser";
import { styleTemplates, templateList } from "./style-templates";
import { renderWechatHtml } from "./wechat-renderer";

describe("styleTemplates", () => {
  it("surfaces the recommended WeChat templates first", () => {
    expect(templateList.slice(0, 3).map((template) => template.key)).toEqual([
      "zhenyiKnowledgeMinimal",
      "zhenyiBusinessCase",
      "zhenyiTechCards",
    ]);
  });

  it("renders recommended templates with their own inline styles", () => {
    const blocks = parseArticle(`文章标题

这是一个关键判断。

一、核心变化
- 第一项
- 第二项

留言领取模板`);

    const keys = ["zhenyiKnowledgeMinimal", "zhenyiBusinessCase", "zhenyiTechCards"] as const;

    for (const key of keys) {
      const template = styleTemplates[key];
      const html = renderWechatHtml(blocks, template);

      expect(html).toContain(template.visual.primary);
      expect(html).toContain("line-height: 1.75");
      expect(html).not.toContain(">SECTION<");
      expect(html).not.toContain("下一步");
    }
  });

  it("renders markdown strong without inline style fragments", () => {
    const blocks = parseArticle(`文章标题

你把逻辑解释清楚，不代表老板会觉得够。**重点内容**`);
    const html = renderWechatHtml(blocks, styleTemplates.zhenyiKnowledgeMinimal);

    expect(html).toContain("<strong>重点内容</strong>");
    expect(html).not.toContain('<strong style="font-weight: 800;">重点内容</strong>');
  });

  it("keeps blockquotes as quotes in business visual templates", () => {
    const blocks = parseArticle(`文章标题

> 内容还是少了。`);
    const html = renderWechatHtml(blocks, styleTemplates.zhenyiBusinessCase);

    expect(html).toContain("内容还是少了。");
    expect(html).not.toContain("CASE");
  });
});
