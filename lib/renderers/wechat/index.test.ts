import { describe, expect, it } from "vitest";
import { parseArticleContent } from "../../article-parser";
import type { UnifiedArticleContent } from "../../content";
import { styleTemplates } from "../../style-templates";
import { renderWechatContent, renderWechatContentHtml } from "./index";

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

  it("keeps supplied image nodes in image order after non-image blocks", () => {
    const content = parseArticleContent(`前置说明

![原始图片一](https://source.example/one.png)

中间说明

![原始图片二](https://source.example/two.png)`);

    const imageNodes = [
      { src: "https://cdn.example/first.png", alt: "第一张" },
      { src: "https://cdn.example/second.png", alt: "第二张" },
    ];
    const options = {
      template: styleTemplates.zhenyiKnowledgeMinimal,
      imageNodes,
    };
    const html = renderWechatContentHtml(content, options);
    const result = renderWechatContent(content, options);

    expect(html).toContain('<img src="https://cdn.example/first.png" alt="第一张"');
    expect(html).toContain('<img src="https://cdn.example/second.png" alt="第二张"');
    expect(html.indexOf("https://cdn.example/first.png")).toBeLessThan(html.indexOf("https://cdn.example/second.png"));
    expect(result.imageNodes.map((node) => node.src)).toEqual(imageNodes.map((node) => node.src));
  });

  it("deep-copies nested block fields in the render result", () => {
    const content = parseArticleContent(`- 第一项
- 第二项`);
    const result = renderWechatContent(content, { template: styleTemplates.zhenyiKnowledgeMinimal });
    const sourceList = content.blocks.find((block) => block.type === "list");
    const resultList = result.blocks.find((block) => block.type === "list");

    if (!sourceList || sourceList.type !== "list" || !resultList || resultList.type !== "list") {
      throw new Error("expected list blocks");
    }

    const originalItems = [...sourceList.items];
    resultList.items[0] = "已修改结果";
    resultList.source.sourceText = "已修改来源";

    expect(sourceList.items).toEqual(originalItems);
    expect(sourceList.source.sourceText).not.toBe("已修改来源");
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
