import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { clipboardArticle, parseArticle, sanitizeHTML } from "./import";
import { builtInStyles, blockStyle } from "./styles";
import { styleProfileSchema } from "./types";
const dom = new JSDOM("");
const doc = dom.window.document;
describe("studio lossless imports", () => {
  it("keeps hard-wrapped text together without guessing headings", () => {
    const text = "简短开头\r\n接着补充句子。\r\n下一段已经开始。";
    const blocks = parseArticle(text, "text", doc);
    expect(blocks.map(({ kind, html }) => [kind, html])).toEqual([
      ["paragraph", "简短开头<br>接着补充句子。"],
      ["paragraph", "下一段已经开始。"],
    ]);
    expect(clipboardArticle("<span>简短开头</span>", text, "")).toEqual({
      input: text,
      format: "text",
    });
  });
  it("keeps Word and web structure around images while dropping fixed styles", () => {
    const blocks = parseArticle(
      '<section><h4 style="color:red">细节</h4><p><strong>图前<img alt="懒加载原图" data-src="//example.com/img.png">图后</strong></p><ul><li><a href="https://example.com"><img src="https://example.com/linked.png"></a>保留列表</li></ul></section>',
      "html",
      doc,
    );
    expect(blocks.map((block) => block.kind)).toEqual([
      "subheading",
      "paragraph",
      "image",
      "paragraph",
      "list",
    ]);
    expect(blocks[0]).toMatchObject({ headingLevel: 4, html: "细节" });
    expect(blocks[1].html).toBe("<strong>图前</strong>");
    expect(blocks[2].src).toBe("https://example.com/img.png");
    expect(blocks[3].html).toBe("<strong>图后</strong>");
    expect(blocks[4].html).toContain('<a href="https://example.com"><img');
  });
  it("preserves text, numbers, inline images and order in Markdown", () => {
    const blocks = parseArticle(
      "# 原文标题\n\n营收 **42%**，Acme 2026。![原图](https://example.com/a.png)后半段。\n\n> 原样引用\n\n- 第一项\n- 第二项",
      "markdown",
      doc,
    );
    expect(blocks.map((b) => b.kind)).toEqual([
      "title",
      "paragraph",
      "image",
      "paragraph",
      "quote",
      "list",
    ]);
    expect(blocks[1].html).toContain("42%");
    expect(blocks[2].src).toBe("https://example.com/a.png");
    expect(blocks[3].html).toContain("后半段");
    expect(blocks[5].html).toContain("第二项");
  });
  it("sanitizes untrusted rich text without running scripts", () => {
    const blocks = parseArticle(
      '<h2 onclick="x()">标题</h2><p>文字<img src="https://example.com/1.jpg" onerror="x()">结尾</p><script>alert(1)</script><iframe src="http://localhost"></iframe>',
      "html",
      doc,
    );
    expect(blocks.map((b) => b.kind)).toEqual([
      "heading",
      "paragraph",
      "image",
      "paragraph",
    ]);
    expect(JSON.stringify(blocks)).not.toMatch(/onclick|onerror|script|iframe/);
    expect(blocks[3].html).toBe("结尾");
    expect(
      sanitizeHTML(
        '<a href="javascript:alert(1)">a</a>',
        dom.window as unknown as Window,
      ),
    ).not.toContain("javascript");
  });
  it("keeps local overrides when changing themes", () => {
    for (const profile of builtInStyles) {
      expect(styleProfileSchema.safeParse(profile).success).toBe(true);
      expect(
        blockStyle(
          {
            id: "a",
            kind: "paragraph",
            html: "42%",
            overrides: { color: "#123456", fontSize: 21 },
          },
          profile,
        ),
      ).toMatchObject({ color: "#123456", fontSize: 21 });
    }
  });
});
