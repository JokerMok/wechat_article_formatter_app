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

  it("keeps the four Baoyu markdown theme families available", () => {
    const baoyuThemes = new Set(templateList.filter((template) => template.key.startsWith("baoyu")).map((template) => template.visual.theme));

    expect(baoyuThemes).toEqual(new Set(["default", "grace", "simple", "modern"]));
    expect(styleTemplates.baoyuDefaultVermilion.visual.primary).toBe("#FA5151");
    expect(styleTemplates.baoyuGracePink.visual.primary).toBe("#FFB7C5");
    expect(styleTemplates.baoyuSimpleOlive.visual.primary).toBe("#556B2F");
  });

  it("renders Baoyu markdown theme signatures as WeChat inline styles", () => {
    const blocks = parseArticle(`# 文章标题

导语内容

## 小节标题

### 小标题

正文内容

> 引用内容`);

    const defaultHtml = renderWechatHtml(blocks, styleTemplates.baoyuDefaultBlue);
    expect(defaultHtml).toContain("border-bottom: 2px solid #0F4C81");
    expect(defaultHtml).toContain("background-color: #0F4C81");
    expect(defaultHtml).toContain("letter-spacing: 0.1em");

    const graceHtml = renderWechatHtml(blocks, styleTemplates.baoyuGracePurple);
    expect(graceHtml).toContain("text-shadow: 2px 2px 4px rgba(0,0,0,0.1)");
    expect(graceHtml).toContain("box-shadow: 0 4px 6px rgba(0,0,0,0.05)");
    expect(graceHtml).toContain("font-style: italic");

    const simpleHtml = renderWechatHtml(blocks, styleTemplates.baoyuSimpleGreen);
    expect(simpleHtml).toContain("border-radius: 8px 24px 8px 24px");
    expect(simpleHtml).toContain("line-height: 2.4");
    expect(simpleHtml).toContain("border-top: 1px solid rgba(0,0,0,0.04)");

    const modernHtml = renderWechatHtml(blocks, styleTemplates.baoyuModernOrange);
    expect(modernHtml).toContain("line-height: 2");
    expect(modernHtml).toContain("border-radius: 25px");
    expect(modernHtml).toContain("font-size: 28px");
    expect(modernHtml).toContain("word-break: break-all");
  });
});
