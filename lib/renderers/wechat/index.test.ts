import { describe, expect, it } from "vitest";
import { parseArticleContent } from "../../article-parser";
import type { UnifiedArticleContent } from "../../content";
import { styleTemplates } from "../../style-templates";
import { renderWechatContentHtml } from "./index";

describe("renderWechatContentHtml", () => {
  it("TEST-010 renders editable inline-compatible HTML without losing rich article blocks", () => {
    const content = parseArticleContent(`# 标题

导语段落，带有 **重点** 和 _强调_。

## 小节

正文段落

> 引用内容

- 清单一
- 清单二

---

\`\`\`ts
const n = 1 < 2 ? 3 : 4;
\`\`\``, { mode: "knowledge" });

    const html = renderWechatContentHtml(content, { template: styleTemplates.zhenyiKnowledgeMinimal });

    expect(html).toContain("<strong>重点</strong>");
    expect(html).toContain("<em>强调</em>");
    expect(html).toContain("小节");
    expect(html).toContain("引用内容");
    expect(html).toContain("清单一");
    expect(html).toContain("清单二");
    expect(html).toContain("const n = 1 &lt; 2 ? 3 : 4;");
    expect(html).toContain('data-wechat-block-type="divider"');
    expect(html).not.toContain('class="');
  });

  it("TEST-011 renders image nodes with safe inline attributes", () => {
    const content = parseArticleContent(`图片稿

![产品截图](data:image/png;base64,abc123)`);

    const html = renderWechatContentHtml(content, { template: styleTemplates.zhenyiKnowledgeMinimal });

    expect(html).toContain('<img src="data:image/png;base64,abc123"');
    expect(html).toContain('alt="产品截图"');
    expect(html).toContain("max-width: 100%");
    expect(html).toContain("产品截图");
  });

  it("TEST-022 removes scripts, event attributes, dangerous URLs and forged markup", () => {
    const content: UnifiedArticleContent = {
      schemaVersion: 1,
      sourceText: "",
      sourceFormat: "markdown",
      parseMode: "knowledge",
      title: "安全测试",
      warnings: [],
      blocks: [
        {
          id: "block-1",
          type: "title",
          text: '<img src=x onerror="evil()">安全测试<script>alert(1)</script>',
          plainText: "",
          markdown: "",
          source: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 0, sourceText: "" },
        },
        {
          id: "block-2",
          type: "image",
          text: "危险图片",
          plainText: "",
          markdown: "![危险图片](javascript:alert(1))",
          source: { startLine: 2, endLine: 2, startOffset: 0, endOffset: 0, sourceText: "![危险图片](javascript:alert(1))" },
        },
      ],
    };

    const html = renderWechatContentHtml(content, { template: styleTemplates.zhenyiKnowledgeMinimal });

    expect(html).toContain("安全测试");
    expect(html).toContain("危险图片");
    expect(html).not.toMatch(/<script|<\/script|onerror|onclick|javascript:/i);
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<img src=\"javascript:");
  });
});
