import { describe, expect, it } from "vitest";
import { parseSourceDocument } from "../article-parser";
import { markdownPublicationParts, renderMarkdown } from "../content/markdown";
import { layoutCardPages } from "./cards/layout";
import { renderLongformHtml } from "./longform";

describe("mixed media publishing", () => {
  const data = "data:image/png;base64,aGVsbG8=";
  const markdown = `# 图片混排\n\n> 引用前文\n>\n> ![引用配图](${data})\n>\n> 引用后文\n\n- 清单前文 ![清单配图](https://example.com/a.png) 清单后文\n\n##### 五级标题`;
  it("preserves nested images and surrounding text in card layout", () => {
    const source = parseSourceDocument(markdown);
    const pages = layoutCardPages(source).pages;
    const nodes = pages.flatMap((page) => page.nodes);
    expect(nodes.filter((node) => node.kind === "image")).toHaveLength(2);
    expect(nodes.map((node) => node.text).join("")).toContain("引用后文");
    expect(nodes.map((node) => node.text).join("")).toContain("清单后文");
    expect(nodes.filter((node) => node.kind === "image").every((node) => node.blockId.includes(":inline-image:"))).toBe(true);
  });
  it("uses the same ordered media parts for image URL resolution", () => {
    const parts = markdownPublicationParts(markdown);
    expect(parts.filter((part) => part.kind === "image").map((part) => part.url)).toEqual([data, "https://example.com/a.png"]);
    expect(renderMarkdown(markdown)).toContain(`src="${data}"`);
    expect(renderMarkdown('![unsafe](javascript:alert)')).not.toContain("<img");
  });
  it("preserves heading depth and nested media in longform HTML", () => {
    const html = renderLongformHtml(parseSourceDocument(markdown));
    expect(html.match(/<img /g)).toHaveLength(2);
    expect(html).toContain("<h5 ");
    expect(html).toContain("引用后文");
  });
});
