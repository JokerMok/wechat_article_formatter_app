import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { wechatHTML } from "./renderer";
import { builtInStyles } from "./styles";
import { parseArticle } from "./import";
import type { ArticleDocument } from "./types";
const dom = new JSDOM("");
const doc = dom.window.document;
const article = (text: string): ArticleDocument => ({
  id: "a",
  name: "稿件",
  blocks: parseArticle(text, "markdown", doc),
  styleId: "builtin-forest",
  styleVersion: 1,
  updatedAt: "",
});
describe("WeChat studio renderer", () => {
  it("reuses each profile across different articles without touching content or overrides", () => {
    for (const input of [
      "# 观察\n\nAcme 2026 年增长 **42%**。\n\n## 结论\n\n保持原文。",
      "> 这是原样引用。\n\n- 甲\n- 乙\n\n---",
      "# 图片顺序\n\n前文\n\n![自有图片](https://example.com/own.png)\n\n后文",
    ]) {
      const source = article(input);
      source.blocks[0].overrides = { fontSize: 21, color: "#123456" };
      const saved = JSON.stringify(source);
      for (const style of builtInStyles) {
        const output = wechatHTML(source, style, {}, doc);
        const wrapper = doc.createElement("div");
        wrapper.innerHTML = output.html;
        expect(output.html).not.toMatch(/class=|data-|<script|<style/);
        expect(wrapper.firstElementChild?.getAttribute("style")).toContain(
          "line-height",
        );
        expect(
          wrapper.firstElementChild?.firstElementChild?.getAttribute("style"),
        ).toContain("font-size: 21px");
        expect(JSON.stringify(source)).toBe(saved);
        if (input.includes("42%")) expect(wrapper.textContent).toContain("42%");
        if (input.includes("自有图片"))
          expect(wrapper.querySelector("img")?.src).toBe(
            "https://example.com/own.png",
          );
      }
    }
  });
  it("strips hostile markup and refuses missing local image assets", () => {
    const source = article("原文");
    source.blocks[0].html =
      '<strong onclick="alert(1)">42%</strong><script>alert(1)</script><a href="javascript:x()">链接</a>';
    const result = wechatHTML(source, builtInStyles[0], {}, doc);
    expect(result.html).not.toMatch(/onclick|script|javascript/);
    expect(result.html).toContain("42%");
    source.blocks.push({
      id: "i",
      kind: "image",
      html: "",
      src: "asset:missing",
    });
    expect(() => wechatHTML(source, builtInStyles[0], {}, doc)).toThrow("缺失");
  });
});
