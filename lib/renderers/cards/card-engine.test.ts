import { describe, expect, it } from "vitest";

import type { UnifiedArticleBlock, UnifiedArticleContent } from "../../content";
import {
  collectLayoutText,
  createApproximateTextMeasurer,
  detectPageOverflow,
  drawCardImagePage,
  layoutCardPages,
  lockCardImagePage,
  mergeAdjacentCardPages,
  moveCardImagePage,
  splitCardImagePageAfterElement,
  type CardImageCanvasContext,
  type CardLayoutPage,
  type TextMeasurer,
  type TextStyle,
} from "./index";

function source(sourceText: string) {
  return {
    startLine: 1,
    endLine: 1,
    startOffset: 0,
    endOffset: sourceText.length,
    sourceText,
  };
}

function textBlock(id: string, type: Exclude<UnifiedArticleBlock["type"], "list" | "card">, text: string): UnifiedArticleBlock {
  return {
    id,
    type,
    text,
    plainText: text,
    markdown: text,
    source: source(text),
  } as UnifiedArticleBlock;
}

function article(blocks: UnifiedArticleBlock[]): UnifiedArticleContent {
  return {
    schemaVersion: 1,
    sourceText: blocks.map((block) => ("plainText" in block ? block.plainText : "")).join("\n"),
    sourceFormat: "plainText",
    parseMode: "knowledge",
    blocks,
    warnings: [],
  };
}

function expectedText(blocks: UnifiedArticleBlock[]) {
  return blocks
    .flatMap((block) => {
      if (block.type === "pageBreak") return [];
      if (block.type === "list") return block.items;
      if (block.type === "card") return [block.title, block.body].filter(Boolean) as string[];
      if (block.type === "image") return [block.text];
      return "text" in block ? [block.text] : [];
    })
    .join("");
}

function measuringSpy(base: TextMeasurer) {
  const calls: Array<{ text: string; style: TextStyle }> = [];
  return {
    calls,
    measurer: {
      measureText(text: string, style: TextStyle) {
        calls.push({ text, style });
        return base.measureText(text, style);
      },
    } satisfies TextMeasurer,
  };
}

describe("card image layout engine", () => {
  it("keeps ordinary reading pages at the top without shrinking typography", () => {
    const blocks = [
      textBlock("xiaohongshu:page:conflict:3:block:title", "section", "第一次汇报后，方向变了"),
      textBlock("xiaohongshu:page:conflict:3:block:body", "paragraph", "短页仍要保留清楚的上下阅读节奏。"),
    ];

    const result = layoutCardPages(article(blocks), createApproximateTextMeasurer(), { aspectRatio: "3:4" });
    const page = result.pages[0];
    const firstNode = page.nodes[0];

    expect(page.pageKind).toBe("conflict");
    expect(firstNode.y).toBe(page.safeArea.y);
    expect(firstNode.style?.fontSize).toBe(42);
    expect(result.overflow).toEqual([]);
  });

  it("TEST-013 remeasures and reflows every affected page when font and spacing change", () => {
    const blocks = [
      textBlock("title", "title", "字号变化必须触发完整重排"),
      ...Array.from({ length: 55 }, (_, index) =>
        textBlock(
          `p${index}`,
          "paragraph",
          `第${index + 1}段内容用于制造多页图文。调整字号、行距、段距和边距以后，所有受影响页面都要重新测量并重新分页，不能沿用旧位置。`,
        ),
      ),
    ];
    const content = article(blocks);

    const firstSpy = measuringSpy(createApproximateTextMeasurer());
    const first = layoutCardPages(content, firstSpy.measurer, {
      aspectRatio: "3:4",
      typography: { bodyFontSize: 30, lineSpacing: 1.2, paragraphSpacing: 24 },
    });

    const secondSpy = measuringSpy(createApproximateTextMeasurer());
    const second = layoutCardPages(content, secondSpy.measurer, {
      aspectRatio: "3:4",
      typography: { bodyFontSize: 42, lineSpacing: 1.55, paragraphSpacing: 46 },
    });

    expect(first.pages.length).toBeGreaterThanOrEqual(5);
    expect(second.pages.length).toBeGreaterThan(first.pages.length);
    expect(secondSpy.calls.length).toBeGreaterThan(firstSpy.calls.length);
    expect(secondSpy.calls.some((call) => call.style.fontSize === 42)).toBe(true);
    expect(collectLayoutText(first)).toBe(expectedText(blocks));
    expect(collectLayoutText(second)).toBe(expectedText(blocks));
    expect(second.overflow).toEqual([]);
  });

  it("keeps normal article paragraphs in a readable column instead of creating artificial pages", () => {
    const blocks = [
      textBlock("title", "title", "普通文章不应该被拆成很多张图"),
      ...Array.from({ length: 5 }, (_, index) =>
        textBlock(`p${index}`, "paragraph", `第${index + 1}段内容用于验证连续排版。文字应该使用画布的可读宽度自然换行，而不是被限制在狭窄列中。`),
      ),
    ];

    const result = layoutCardPages(article(blocks), createApproximateTextMeasurer(), { aspectRatio: "3:4" });
    const body = result.pages[0]?.nodes.find((node) => node.kind === "body");

    expect(result.pages).toHaveLength(1);
    expect(body?.width).toBe(result.pages[0]?.safeArea.width);
    expect(collectLayoutText(result)).toBe(expectedText(blocks));
  });

  it("TEST-014 preserves manual page order, locked page layout, and image placement metadata", () => {
    const blocks = [
      textBlock("p1", "paragraph", "第一页自动内容。"),
      textBlock("p2", "paragraph", "这一页稍后会被锁定，修改字号时不能改动它的布局坐标。"),
      textBlock("img1", "image", "配图：锁定页上的图。"),
      textBlock("p3", "paragraph", "锁定页之后的自动内容。"),
    ];
    const content = article(blocks);
    const measurer = createApproximateTextMeasurer();

    const initial = layoutCardPages(content, measurer, {
      aspectRatio: "3:4",
      manualPages: [{ id: "locked-middle", blockIds: ["p2", "img1"], locked: true }],
      imagePlacements: {
        img1: { x: 120, y: 620, width: 420, height: 260, rotation: 7, opacity: 0.82 },
      },
    });
    const locked = initial.pages.find((page) => page.id === "locked-middle") as CardLayoutPage;

    const changed = layoutCardPages(content, measurer, {
      aspectRatio: "3:4",
      typography: { bodyFontSize: 44, lineSpacing: 1.5 },
      lockedPages: [locked],
    });
    const preserved = changed.pages.find((page) => page.id === "locked-middle");

    expect(preserved?.locked).toBe(true);
    expect(preserved?.nodes).toEqual(locked.nodes);
    expect(preserved?.nodes.find((node) => node.kind === "image")?.image).toMatchObject({
      x: 120,
      y: 620,
      width: 420,
      height: 260,
      rotation: 7,
      opacity: 0.82,
    });
    expect(collectLayoutText(changed)).toBe(expectedText(blocks));

    const editable = layoutCardPages(
      article([
        textBlock("s1", "paragraph", "第一段可拆分内容。"),
        textBlock("s2", "paragraph", "第二段可拆分内容。"),
        textBlock("s3", "paragraph", "第三段可拆分内容。"),
      ]),
      measurer,
      { aspectRatio: "3:4" },
    );
    const splitTarget = editable.pages.find((page) => page.nodes.length > 1) as CardLayoutPage;
    const split = splitCardImagePageAfterElement(editable, splitTarget.id, splitTarget.nodes[0].id);
    expect(split.pages.length).toBe(editable.pages.length + 1);
    expect(split.pages.find((page) => page.id === splitTarget.id)?.manual).toBe(true);
    expect(collectLayoutText(split)).toBe("第一段可拆分内容。第二段可拆分内容。第三段可拆分内容。");

    const moved = moveCardImagePage(split, split.pages[1].id, 0);
    expect(moved.pages[0].id).toBe(split.pages[1].id);

    const merged = mergeAdjacentCardPages(split, splitTarget.id);
    expect(merged.pages.length).toBe(editable.pages.length);
    expect(collectLayoutText(merged)).toBe("第一段可拆分内容。第二段可拆分内容。第三段可拆分内容。");

    const relocked = lockCardImagePage(initial, "locked-middle", {
      images: [{ imageId: "img1", x: 220, y: 720, width: 360, height: 200, rotation: -4, opacity: 0.6 }],
    });
    expect(relocked.pages.find((page) => page.id === "locked-middle")?.locked).toBe(true);
    expect(relocked.pages.find((page) => page.id === "locked-middle")?.nodes.find((node) => node.kind === "image")?.image).toMatchObject({
      x: 220,
      y: 720,
      width: 360,
      height: 200,
      rotation: -4,
      opacity: 0.6,
    });
  });

  it("preserves the remaining fragments when a page containing only the first fragment is locked", () => {
    const text = "锁定页只保存长段落的首个片段，后续片段仍然必须继续流入可编辑页面。".repeat(120);
    const content = article([textBlock("long", "paragraph", text)]);
    const initial = layoutCardPages(content, createApproximateTextMeasurer(), { aspectRatio: "3:4" });
    const lockedFirstPage = initial.pages[0];

    expect(initial.pages.length).toBeGreaterThan(1);
    expect(lockedFirstPage.nodes.some((node) => node.continuesOnNextPage)).toBe(true);

    const reflowed = layoutCardPages(content, createApproximateTextMeasurer(), {
      aspectRatio: "3:4",
      typography: { bodyFontSize: 42, paragraphSpacing: 46 },
      lockedPages: [lockedFirstPage],
    });

    expect(collectLayoutText(reflowed)).toBe(text);
    expect(reflowed.pages.slice(1).some((page) => page.nodes.some((node) => node.entryId === "long"))).toBe(true);
  });

  it("preserves text once when a locked page reserves a middle fragment of a split paragraph", () => {
    const lead = "前段内容必须保留在锁定片段之前。".repeat(60);
    const middle = "【锁定中段唯一片段】中间这一页来自长段落，重排后不能复制，也不能丢失。".repeat(42);
    const tail = "后段内容必须继续流入锁定片段之后。".repeat(60);
    const text = `${lead}${middle}${tail}`;
    const content = article([textBlock("long-middle", "paragraph", text)]);
    const initial = layoutCardPages(content, createApproximateTextMeasurer(), {
      aspectRatio: "3:4",
      typography: { bodyFontSize: 34, lineSpacing: 1.25, paragraphSpacing: 28 },
    });
    const lockedMiddlePage = initial.pages.find((page) =>
      page.nodes.some((node) => node.entryId === "long-middle" && node.text.includes("【锁定中段唯一片段】")),
    ) as CardLayoutPage;
    const lockedFragment = lockedMiddlePage.nodes.find((node) => node.entryId === "long-middle")?.text ?? "";

    expect(initial.pages.length).toBeGreaterThan(2);
    expect(lockedMiddlePage.pageNumber).toBeGreaterThan(1);
    expect(lockedFragment).toContain("【锁定中段唯一片段】");

    const reflowed = layoutCardPages(content, createApproximateTextMeasurer(), {
      aspectRatio: "3:4",
      typography: { bodyFontSize: 42, lineSpacing: 1.45, paragraphSpacing: 44 },
      lockedPages: [lockedMiddlePage],
    });

    expect(collectLayoutText(reflowed)).toBe(text);
    expect(
      reflowed.pages
        .flatMap((page) => page.nodes)
        .filter((node) => node.entryId === "long-middle" && node.text === lockedFragment),
    ).toHaveLength(1);
  });

  it("uses updated locked image geometry for overflow detection after image placement changes", () => {
    const content = article([
      textBlock("body", "paragraph", "移动图片后，溢出检测必须使用新的图片坐标。"),
      textBlock("img-moved", "image", "移动后的图片"),
    ]);
    const initial = layoutCardPages(content, createApproximateTextMeasurer(), {
      aspectRatio: "3:4",
      manualPages: [{ id: "image-page", blockIds: ["img-moved"], locked: true }],
      imagePlacements: { "img-moved": { x: 180, y: 560, width: 320, height: 180 } },
    });
    const relocked = lockCardImagePage(initial, "image-page", {
      images: [{ imageId: "img-moved", x: 760, y: 1190, width: 360, height: 220 }],
    });
    const imagePage = relocked.pages.find((page) => page.id === "image-page") as CardLayoutPage;
    const movedImage = imagePage.nodes.find((node) => node.kind === "image") as CardLayoutPage["nodes"][number];
    const overflow = detectPageOverflow(imagePage);

    expect(movedImage).toMatchObject({ x: 760, y: 1190, width: 360, height: 220 });
    expect(relocked.overflow).toEqual(expect.arrayContaining(overflow));
    expect(overflow).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeId: movedImage.id, type: "horizontal", edge: "right" }),
        expect.objectContaining({ nodeId: movedImage.id, type: "vertical", edge: "bottom" }),
      ]),
    );
  });

  it("reports top and left clipping for both image placements and layout entries", () => {
    const result = layoutCardPages(
      article([
        textBlock("body", "paragraph", "普通布局节点也必须参与安全区溢出检测。"),
        textBlock("image", "image", "安全区外的图片"),
      ]),
      createApproximateTextMeasurer(),
      {
        aspectRatio: "3:4",
        imagePlacements: { image: { x: 32, y: 76, width: 240, height: 180 } },
      },
    );
    const page = result.pages[0];
    const body = page.nodes.find((node) => node.blockId === "body") as CardLayoutPage["nodes"][number];
    const image = page.nodes.find((node) => node.blockId === "image") as CardLayoutPage["nodes"][number];
    const clippedBody = { ...body, id: "body-clipped", x: page.safeArea.x - 18, y: page.safeArea.y - 22 };
    const rightBottomBody = {
      ...body,
      id: "body-right-bottom",
      x: page.safeArea.x + page.safeArea.width - 10,
      y: page.safeArea.y + page.safeArea.height - 10,
      width: 20,
      height: 20,
    };
    const overflow = detectPageOverflow({ ...page, nodes: [clippedBody, image, rightBottomBody] });

    expect(overflow).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeId: "body-clipped", type: "horizontal", edge: "left" }),
        expect.objectContaining({ nodeId: "body-clipped", type: "vertical", edge: "top" }),
        expect.objectContaining({ nodeId: image.id, type: "horizontal", edge: "left" }),
        expect.objectContaining({ nodeId: image.id, type: "vertical", edge: "top" }),
        expect.objectContaining({ nodeId: "body-right-bottom", type: "horizontal", edge: "right" }),
        expect.objectContaining({ nodeId: "body-right-bottom", type: "vertical", edge: "bottom" }),
      ]),
    );
  });

  it("keeps reflowed locked and manual page IDs unique and targets the locked page in operations", () => {
    const blocks = [
      textBlock("before", "paragraph", "锁定页前的内容。"),
      textBlock("locked", "paragraph", "锁定页内容。"),
      textBlock("after", "paragraph", "手动页内容。"),
    ];
    const content = article(blocks);
    const initial = layoutCardPages(content, createApproximateTextMeasurer(), { aspectRatio: "3:4" });
    const lockedPage = initial.pages[0];
    const reflowed = layoutCardPages(content, createApproximateTextMeasurer(), {
      aspectRatio: "3:4",
      lockedPages: [lockedPage],
      manualPages: [{ id: "page-1", blockIds: ["after"], locked: false }],
    });
    const ids = reflowed.pages.map((page) => page.id);
    const locked = reflowed.pages.find((page) => page.locked);
    const manual = reflowed.pages.find((page) => page.manual && !page.locked);

    expect(new Set(ids).size).toBe(ids.length);
    expect(locked?.id).toBe("page-1");
    expect(manual?.id).not.toBe("page-1");

    const moved = moveCardImagePage(reflowed, "page-1", reflowed.pages.length - 1);
    expect(moved.pages.at(-1)?.locked).toBe(true);
    expect(collectLayoutText(moved)).toBe(expectedText(blocks));
  });

  it("keeps section titles with following content instead of creating orphan title pages", () => {
    const intro = "前置内容填充页面，直到下一节标题接近页底。";
    const blocks = [
      textBlock("title", "title", "标题孤页保护"),
      ...Array.from({ length: 4 }, (_, index) => textBlock(`intro-${index}`, "paragraph", intro.repeat(8))),
      textBlock("heading", "section", "不能单独留在上一页的小标题"),
      textBlock("after-heading", "paragraph", "标题后面的正文至少要和标题一起进入同一页。"),
    ];

    const result = layoutCardPages(article(blocks), createApproximateTextMeasurer(), {
      aspectRatio: "3:4",
      typography: { bodyFontSize: 34, headingFontSize: 40, lineSpacing: 1.35, paragraphSpacing: 34 },
    });
    const headingPageIndex = result.pages.findIndex((page) => page.nodes.some((node) => node.blockId === "heading"));
    const headingPage = result.pages[headingPageIndex];

    expect(headingPage?.nodes.some((node) => node.blockId === "after-heading")).toBe(true);
    expect(headingPage?.nodes.at(-1)?.blockId).not.toBe("heading");
    expect(collectLayoutText(result)).toBe(expectedText(blocks));
  });

  it("TEST-015 reflows independently for 3:4 and 9:16 without mutating source content", () => {
    const blocks = [
      textBlock("title", "title", "比例切换"),
      ...Array.from({ length: 16 }, (_, index) =>
        textBlock(`p${index}`, "paragraph", `长文第${index + 1}段。图文比例切换只能影响图文页布局，不能污染统一内容或其他平台长文。`),
      ),
    ];
    const content = article(blocks);
    const snapshot = JSON.stringify(content);
    const measurer = createApproximateTextMeasurer();

    const portrait34 = layoutCardPages(content, measurer, { aspectRatio: "3:4" });
    const portrait916 = layoutCardPages(content, measurer, { aspectRatio: "9:16" });

    expect(portrait34.pages[0]?.canvas.height).toBe(1440);
    expect(portrait916.pages[0]?.canvas.height).toBe(1920);
    expect(portrait916.pages.length).toBeLessThanOrEqual(portrait34.pages.length);
    expect(collectLayoutText(portrait34)).toBe(expectedText(blocks));
    expect(collectLayoutText(portrait916)).toBe(expectedText(blocks));
    expect(JSON.stringify(content)).toBe(snapshot);
  });

  it("TEST-023 handles empty, very long text, long words, and many images without truncation or infinite loops", () => {
    const longChinese = "极端输入仍然必须完整保留。".repeat(520);
    const longWord = "Supercalifragilisticexpialidocious".repeat(38);
    const imageBlocks = Array.from({ length: 50 }, (_, index) => textBlock(`img${index}`, "image", `图片 ${index + 1}`));
    const blocks = [
      textBlock("title", "title", "极端边界"),
      textBlock("long-zh", "paragraph", longChinese),
      textBlock("long-word", "paragraph", longWord),
      ...imageBlocks,
    ];

    const start = performance.now();
    const result = layoutCardPages(article(blocks), createApproximateTextMeasurer(), {
      aspectRatio: "9:16",
      defaultImageBox: { width: 360, height: 140 },
      maxPages: 500,
    });
    const elapsed = performance.now() - start;
    const empty = layoutCardPages(article([]), createApproximateTextMeasurer());

    expect(elapsed).toBeLessThan(1000);
    expect(result.pages.length).toBeGreaterThan(1);
    expect(result.pages.length).toBeLessThan(500);
    expect(result.overflow).toEqual([]);
    expect(collectLayoutText(result)).toBe(expectedText(blocks));
    expect(empty.pages).toHaveLength(1);
    expect(empty.overflow).toEqual([]);
  });

  it("TEST-024 keeps unified block content in order across title, list, card, quote, and CTA blocks", () => {
    const blocks: UnifiedArticleBlock[] = [
      textBlock("title", "title", "现有能力回归"),
      {
        id: "list",
        type: "list",
        items: ["第一条", "第二条"],
        text: "第一条\n第二条",
        plainText: "第一条\n第二条",
        markdown: "- 第一条\n- 第二条",
        source: source("第一条\n第二条"),
      },
      {
        id: "card",
        type: "card",
        title: "核心判断",
        body: "不要丢失卡片正文。",
        text: "核心判断：不要丢失卡片正文。",
        plainText: "核心判断：不要丢失卡片正文。",
        markdown: "核心判断：不要丢失卡片正文。",
        source: source("核心判断：不要丢失卡片正文。"),
      },
      textBlock("quote", "quote", "引用也要保留。"),
      textBlock("cta", "cta", "最后是行动建议。"),
    ];

    const result = layoutCardPages(article(blocks), createApproximateTextMeasurer(), { aspectRatio: "3:4" });

    expect(collectLayoutText(result)).toBe(expectedText(blocks));
    expect(result.pages.flatMap((page) => page.nodes).map((node) => node.blockId)).toEqual([
      "title",
      "list",
      "list",
      "card",
      "card",
      "quote",
      "cta",
    ]);
    expect(result.overflow).toEqual([]);
  });

  it("draws all layout text nodes to canvas without clipping overflow away", () => {
    const blocks = [
      textBlock("title", "title", "画布绘制回归"),
      textBlock("focus", "quote", "绘制层只能消费布局树。"),
      textBlock("body", "paragraph", "正文必须进入 fillText，不能在 Canvas 阶段 break 截断。"),
      textBlock("picture", "image", "横向图片"),
    ];
    const result = layoutCardPages(article(blocks), createApproximateTextMeasurer(), { aspectRatio: "3:4" });
    const calls: string[] = [];
    const ctx: CardImageCanvasContext = {
      fillStyle: "",
      font: "",
      textBaseline: "top",
      textAlign: "left",
      globalAlpha: 1,
      beginPath: () => calls.push("beginPath"),
      moveTo: () => calls.push("moveTo"),
      arcTo: () => calls.push("arcTo"),
      closePath: () => calls.push("closePath"),
      fill: () => calls.push("fill"),
      fillRect: (...args) => calls.push(`fillRect:${args.join(",")}`),
      fillText: (text) => calls.push(`fillText:${text}`),
      arc: () => calls.push("arc"),
      save: () => calls.push("save"),
      restore: () => calls.push("restore"),
      translate: () => calls.push("translate"),
      rotate: () => calls.push("rotate"),
      drawImage: (_image, _x, _y, width, height) => calls.push(`drawImage:${width / height}`),
      setLineDash: () => calls.push("setLineDash"),
      strokeRect: () => calls.push("strokeRect"),
      measureText: (text) => ({ width: text.length * 18 }) as TextMetrics,
    };

    for (const page of result.pages) drawCardImagePage(ctx, page, { images: { picture: { naturalWidth: 800, naturalHeight: 400 } as HTMLImageElement } });

    const drawnText = calls
      .filter((call) => call.startsWith("fillText:"))
      .map((call) => call.slice("fillText:".length))
      .join("");
    expect(drawnText).toContain("画布绘制回归");
    expect(drawnText).toContain("绘制层只能消费布局树。");
    expect(drawnText).toContain("正文必须进入 fillText，不能在 Canvas 阶段 break 截断。");
    expect(calls).not.toContain("clip");
    expect(calls).toContain("drawImage:2");
  });
});
