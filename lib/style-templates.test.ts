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
});
