// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { parseSourceDocument } from "../article-parser";
import { analyzeArticleDesign, buildPlatformArticle } from "../design-plan";
import { renderWechatContentHtml } from "../renderers/wechat";
import { layoutCardPages, collectLayoutText } from "../renderers/cards";
import { sanitizeWechatHtml, createPlatformDraft, updatePlatformBlock, updatePlatformTitle } from "../../components/workspace/state";
import { fixedArticles } from "../../tests/fixtures/content/articles";
import { checkSourceIntegrity } from "./integrity";
import { markdownPublicationText } from "./markdown";
import { unifiedArticleContentSchema } from "./schemas";

const MIXED = `# 保留原意与格式

引言中有 **重点**、*条件*、[出处](https://example.com/source?a=1&b=2) 和 97.5%。

## 明确问题

### 判断条件

#### 更细的边界

> 先确认问题。
> 再选择工具。

3. 第一项。
4. 第二项。
   - 嵌套条目。
   - 不要扁平化。
5. 第三项。

![图一](https://example.com/a.png)

| 项目 | 数值 |
| --- | --- |
| 准确率 | 97.5% |

\`\`\`ts
const threshold = 0.975;
if (score < threshold) review();
\`\`\`

## 来源

这个章节属于正文，不能被自动删除。

A < B，x >= 2，①、②、® 和 😀。

![图二][figure]

[figure]: https://example.com/b.png
`;

describe("publishing integrity gate", () => {
  for (const fixture of [...fixedArticles, { id: "mixed-rich-structure", source: MIXED }]) {
    it(`preserves actual output across all four platforms: ${fixture.id}`, () => {
      const source = parseSourceDocument(fixture.source);
      const before = structuredClone(source);
      const plan = analyzeArticleDesign(source, { generationMode: "layoutOnly" });
      for (const platform of ["wechat", "xiaohongshu", "douyinImage", "douyinLongform"] as const) {
        const output = buildPlatformArticle(source, platform, plan);
        expect(checkSourceIntegrity(source, output)).toMatchObject({ ok: true });
        expect(unifiedArticleContentSchema.safeParse(output).success).toBe(true);
      }
      expect(source).toEqual(before);
    });
  }

  it("renders heading depths, links, tables, nested numbering and code after sanitizing", () => {
    const source = parseSourceDocument(MIXED);
    const output = buildPlatformArticle(source, "wechat", analyzeArticleDesign(source));
    const root = document.createElement("div");
    root.innerHTML = sanitizeWechatHtml(renderWechatContentHtml(output));
    expect(root.querySelector("h4")?.textContent).toBe("更细的边界");
    expect(root.querySelector("a")?.getAttribute("href")).toBe("https://example.com/source?a=1&b=2");
    expect(root.querySelector("strong")?.textContent).toBe("重点");
    expect(root.querySelector("ol")?.getAttribute("start")).toBe("3");
    expect(root.querySelectorAll("ol > li")).toHaveLength(3);
    expect(root.querySelectorAll("ol ul > li")).toHaveLength(2);
    expect(root.querySelectorAll("table tr")).toHaveLength(2);
    expect(root.querySelector("pre")?.textContent).toContain("if (score < threshold) review();");
    expect([...root.querySelectorAll("img")].map((image) => image.getAttribute("src"))).toEqual(["https://example.com/a.png", "https://example.com/b.png"]);
    expect(root.textContent).toContain("这个章节属于正文，不能被自动删除。");
    expect(root.textContent).toContain("A < B，x >= 2，①、②、® 和 😀。");
  });

  it("keeps every long paragraph character after measured card pagination", () => {
    const source = parseSourceDocument(`# 连续长文\n\n${"这是不能丢失的段落，包含 97.5% 与边界条件。".repeat(600)}`);
    const plan = analyzeArticleDesign(source);
    for (const platform of ["xiaohongshu", "douyinImage"] as const) {
      const output = buildPlatformArticle(source, platform, plan);
      const layout = layoutCardPages(output, undefined, { aspectRatio: platform === "xiaohongshu" ? "3:4" : "9:16" });
      expect(layout.overflow).toEqual([]);
      expect(collectLayoutText(layout)).toBe(source.blocks.map((block) => block.plainText).join(""));
      expect(layout.pages.every((page) => page.nodes.length > 0)).toBe(true);
    }
  });

  it("consumes newline offsets exactly and retains nested markers and link destinations", () => {
    const source = parseSourceDocument("# 换行回归\n\n> 第一行。\n> 第二行。\n\n1. 第一项。\n2. 第二项。\n   - 子项目甲。\n   - 子项目乙。\n\n[出处](https://example.com/source)");
    const expected = source.blocks.map((block) => markdownPublicationText(block.markdown)).join("");
    const layout = layoutCardPages(source);
    expect(collectLayoutText(layout)).toBe(expected);
    expect(collectLayoutText(layout)).toContain("    • 子项目甲。");
    expect(collectLayoutText(layout)).toContain("https://example.com/source");
    expect(layout.pages.flatMap((page) => page.nodes).some((node) => node.text === "。" || node.text === "乙。")).toBe(false);
  });

  it("does not force a mostly empty page for a short spill before the next chapter", () => {
    const source = parseSourceDocument("# 标题\n\n很短的导语。\n\n## 第一章\n\n完整保留正文。\n\n## 第二章\n\n继续保留正文。");
    const output = buildPlatformArticle(source, "xiaohongshu", analyzeArticleDesign(source));
    const layout = layoutCardPages(output);
    expect(layout.pages).toHaveLength(2);
    expect(collectLayoutText(layout)).toBe(source.blocks.map((block) => block.plainText).join(""));
  });

  it("detects loss, duplication, altered numbers and order in actual content", () => {
    const source = parseSourceDocument(MIXED);
    expect(checkSourceIntegrity(source, { ...source, blocks: source.blocks.slice(1) }).missing).toHaveLength(1);
    expect(checkSourceIntegrity(source, { ...source, blocks: [...source.blocks, source.blocks[1]] }).duplicated).toHaveLength(1);
    const changed = structuredClone(source);
    changed.blocks[1].text = changed.blocks[1].text.replace("97.5", "99.9");
    expect(checkSourceIntegrity(source, changed).changed).toEqual([source.blocks[1].id]);
    expect(checkSourceIntegrity(source, { ...source, blocks: [...source.blocks].reverse() }).reordered).toBe(true);
  });

  it("edits nested lists and the displayed title without stripping markup or changing other platforms", () => {
    const source = parseSourceDocument(MIXED);
    const original = createPlatformDraft("wechat", source);
    const list = original.content.blocks.find((block) => block.type === "list")!;
    const edited = updatePlatformBlock(original, list.id, list.markdown.replace("第一项", "修改后的第一项"));
    const updated = updatePlatformTitle(edited, "人工修改的标题");
    const root = document.createElement("div");
    root.innerHTML = renderWechatContentHtml(updated.content);
    expect(root.querySelector("h1")?.textContent).toBe("人工修改的标题");
    expect(root.querySelectorAll("ol ul li")).toHaveLength(2);
    expect(root.textContent).toContain("修改后的第一项");
    expect(checkSourceIntegrity(source, original.content).ok).toBe(true);
  });
});
