import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import {
  createArticleLayout,
  layoutIndex,
  layoutRequest,
  layoutStepFor,
  replan,
} from "./article-layout";
import { defaultLayoutSettings } from "./layout-contract";
import { wechatHTML } from "./renderer";
import { builtInStyles } from "./styles";
import type { ArticleDocument } from "./types";

const dom = new JSDOM("");
const doc = dom.window.document;
const article: ArticleDocument = {
  id: "source",
  name: "案例",
  styleId: builtInStyles[0].id,
  styleVersion: builtInStyles[0].version,
  updatedAt: "",
  blocks: [
    { id: "title", kind: "title", html: "一次排障的记录" },
    {
      id: "opening",
      kind: "paragraph",
      html: "我们发现，只有先把可重现的故障说清楚，才有机会逐步缩小排查范围。",
    },
    { id: "chapter", kind: "heading", html: "一、对照实验" },
    {
      id: "case",
      kind: "paragraph",
      html: "我们保留同一视频源，只替换推理容器，观察重试后的错误出现位置。",
      overrides: { fontSize: 21 },
    },
    {
      id: "img",
      kind: "image",
      html: "",
      src: "https://example.com/actual.png",
      alt: "现场原图",
    },
    { id: "caption", kind: "caption", html: "原图图注" },
    {
      id: "end",
      kind: "paragraph",
      html: "这段经历说明，排查时每次只改变一项输入，才能让测试结果支持判断。",
    },
  ],
};
describe("source-anchored layout", () => {
  it("retains declared headings and assets, with thematic decisions attached to verified source", () => {
    const input = layoutRequest(
      article,
      defaultLayoutSettings,
      builtInStyles[0],
      doc,
    );
    const result = createArticleLayout(input, {
      engine: "test-model",
      articleType: "case-study",
      decisions: [
        { at: 2, role: "lead", priority: 3, reason: "开头引出排障方法。" },
        { at: 3, role: "summary", priority: 3, reason: "不能改已有章节。" },
        {
          at: 4,
          role: "case",
          priority: 3,
          reason: "用控制变量解释实际处理过程。",
        },
        { at: 5, role: "chapter", priority: 3, reason: "不能将图片改成章节。" },
        {
          at: 7,
          role: "summary",
          priority: 3,
          reason: "总结可复用的排查方法。",
        },
        {
          at: 999,
          role: "claim",
          priority: 3,
          reason: "不能引用不存在的原文。",
        },
      ],
    });
    expect(result.structure.nodes.map((node) => node.role)).toEqual([
      "title",
      "lead",
      "chapter",
      "case",
      "image",
      "caption",
      "summary",
    ]);
    expect(result.structure.nodes[4].relatedBlockId).toBe("case");
    expect(result.structure.nodes[5].relatedBlockId).toBe("img");
    expect(result.plan.steps.map((step) => step.blockId)).toEqual(
      article.blocks.map((block) => block.id),
    );
    const full = {
      ...article,
      layout: {
        ...result,
        settings: defaultLayoutSettings,
        automatic: true,
        enabled: true,
      },
    };
    const original = JSON.stringify(full.blocks);
    for (const theme of builtInStyles) {
      const output = wechatHTML(full, theme, {}, doc).html;
      const node = doc.createElement("template");
      node.innerHTML = output;
      expect(node.content.querySelectorAll("h2")).toHaveLength(1);
      expect(node.content.querySelector("img")?.src).toBe(
        article.blocks[4].src,
      );
      expect(node.content.querySelector("p[style*='21px']")).not.toBeNull();
      expect(JSON.stringify(full.blocks)).toBe(original);
    }
    const edited = { ...article.blocks[3], html: "替换后只影响这一块。" };
    expect(
      layoutStepFor(edited, full.layout, layoutIndex(full.layout)),
    ).toBeUndefined();
    expect(replan(input, result.analysis).plan.steps[3].component).toBe("case");
  });
});
