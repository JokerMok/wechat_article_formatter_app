import createDOMPurify from "dompurify";
import { parseSyntaxDocument } from "../content/source-document";
import { escapeMarkup, renderMarkdown } from "../content/markdown";
import type { ArticleDocument, ArticleBlock, BlockKind } from "./types";
import { uid } from "./types";

type DOMWindow = Parameters<typeof createDOMPurify>[0];
export function safeImage(src: string) {
  return (
    /^(?:https?:\/\/|asset:|data:image\/(?:png|jpeg|webp|gif);base64,)/i.test(
      src,
    ) && !/[\u0000-\u001f]/.test(src)
  );
}
export function sanitizeHTML(
  html: string,
  domWindow?: DOMWindow | Window,
  keepLazyImages = false,
): string {
  const purifier = createDOMPurify((domWindow ?? window) as DOMWindow);
  return purifier.sanitize(html, {
    ALLOWED_TAGS: [
      "p",
      "div",
      "section",
      "article",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "blockquote",
      "ul",
      "ol",
      "li",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "del",
      "a",
      "span",
      "img",
      "figure",
      "figcaption",
      "hr",
      "pre",
      "code",
      "table",
      "thead",
      "tbody",
      "tfoot",
      "tr",
      "th",
      "td",
      "sup",
      "sub",
    ],
    ALLOWED_ATTR: [
      "href",
      "src",
      "alt",
      "title",
      "start",
      "value",
      "colspan",
      "rowspan",
      ...(keepLazyImages ? ["data-src", "data-original"] : []),
    ],
    ALLOW_DATA_ATTR: false,
    // The import parser validates these inert URLs before promoting them to src.
    ADD_URI_SAFE_ATTR: keepLazyImages ? ["data-src", "data-original"] : [],
  });
}
export type ArticleFormat = "text" | "markdown" | "html";

export function detectTextFormat(text: string): "text" | "markdown" {
  return /^(?: {0,3}(?:#{1,6}[ \t]+\S|[-+*][ \t]+\S|>[ \t]+\S|`{3,}|~{3,})|[^\n]+\n {0,3}(?:={2,}|-{3,})[ \t]*$)/m.test(
    text,
  ) ||
    /!?\[[^\]\n]+\]\([^)\n]+\)|^\s*\|?\s*:?-{3,}:?\s*\|\s*:?-{3,}/m.test(
      text,
    ) ||
    /(?:^|\n)\s*\d+[.)][ \t]+[^\n]+\n\s*\d+[.)][ \t]+\S/.test(text)
    ? "markdown"
    : "text";
}

export function clipboardArticle(html: string, text: string, markdown: string) {
  const structured = /<(?:h[1-6]|blockquote|ul|ol|img|table|a|pre)\b/i.test(
    html,
  );
  if (structured) return { input: html, format: "html" as const };
  if (markdown.trim()) return { input: markdown, format: "markdown" as const };
  const format = detectTextFormat(text);
  if (format === "text" && /<(?:b|strong|em|i|u)\b/i.test(html))
    return { input: html, format: "html" as const };
  if (
    html.trim() &&
    (!text.trim() ||
      (format === "text" && /<(?:p|br)\b|<\/div>\s*<div\b/i.test(html)))
  )
    return { input: html, format: "html" as const };
  return { input: text, format };
}

const htmlKinds: Record<string, BlockKind> = {
  H1: "title",
  H2: "heading",
  H3: "subheading",
  H4: "subheading",
  H5: "subheading",
  H6: "subheading",
  BLOCKQUOTE: "quote",
  UL: "list",
  OL: "list",
  PRE: "code",
  TABLE: "table",
  FIGCAPTION: "caption",
};
const flowTags =
  "p,div,section,article,figure,figcaption,h1,h2,h3,h4,h5,h6,blockquote,ul,ol,pre,table,hr,img";
const meaningful = (node: ParentNode) =>
  Boolean(node.textContent?.trim() || node.querySelector("img"));

export function plainHTML(html: string, doc: Document = document) {
  const el = doc.createElement("div");
  el.innerHTML = sanitizeHTML(html, doc.defaultView as DOMWindow);
  return el.textContent ?? "";
}
export function repairLegacyArticle(article: ArticleDocument) {
  const block = article.blocks[0];
  if (
    article.blocks.length !== 1 ||
    block?.kind !== "paragraph" ||
    !/^#\s+/.test(article.name) ||
    !/^\s*<h1[ >]/i.test(block.html) ||
    /<img\b/i.test(block.html)
  )
    return article;
  try {
    const repaired = parseArticle(block.html, "html");
    const first = repaired[0];
    if (first?.kind !== "title" || repaired.length < 2) return article;
    const name = plainHTML(first.html).trim();
    const comparable = (text: string) => text.replace(/\s+/g, "");
    if (
      !name ||
      !article.name.replace(/^#\s+/, "").startsWith(name) ||
      comparable(plainHTML(block.html)) !==
        comparable(repaired.map((entry) => plainHTML(entry.html)).join(""))
    )
      return article;
    return {
      ...article,
      name: name.slice(0, 80),
      blocks: repaired.map((entry) => ({
        ...entry,
        overrides: block.overrides,
      })),
      updatedAt: new Date().toISOString(),
    };
  } catch {
    return article;
  }
}

export function parseArticle(
  input: string,
  format: ArticleFormat,
  doc: Document = document,
  warnings: string[] = [],
): ArticleBlock[] {
  if (!input.trim()) return [];
  if (
    input.length > 35_000_000 ||
    input.replace(
      /data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+/gi,
      "",
    ).length > 500_000
  )
    throw new Error("文章超过 50 万字符，请拆分后导入。");
  if (format === "text") {
    const text = input.replace(/\r\n?/g, "\n");
    const blankLines = /\n[^\S\n]*\n/.test(text);
    return text
      .split(
        blankLines
          ? /\n[^\S\n]*\n(?:[^\S\n]*\n)*|\n(?=　{2}| {4}\S)/
          : /\n(?=　{2}| {4}\S)|(?<=[。！？.!?])[ \t]*\n(?=\S)/,
      )
      .filter((paragraph) => paragraph.trim())
      .map((t) => ({
        id: uid("block"),
        kind: "paragraph",
        html: escapeMarkup(t).replace(/\n/g, "<br>"),
      }));
  }
  if (format === "markdown") {
    const map: Record<string, BlockKind> = {
      title: "title",
      section: "heading",
      subsection: "subheading",
      quote: "quote",
      list: "list",
      code: "code",
      table: "table",
      divider: "divider",
      image: "image",
    };
    const container = doc.createElement("div");
    return parseSyntaxDocument(input).blocks.flatMap((b): ArticleBlock[] => {
      const html = sanitizeHTML(
        renderMarkdown(b.markdown, "#21634a", true),
        doc.defaultView as DOMWindow,
      );
      container.innerHTML = html;
      const image = container.querySelector("img");
      if (b.type === "image" && !image) {
        if (b.markdown.startsWith("![")) warnImage(b.text);
        return [
          {
            id: uid("block"),
            kind: "paragraph",
            html: html || escapeMarkup(b.text),
          },
        ];
      }
      const kind = map[b.type] ?? "paragraph";
      if (kind !== "image") normalizeImages(container);
      const src = image && usableImage(image);
      if (kind === "image" && !src) {
        warnImage(image?.alt);
        return image?.alt
          ? [
              {
                id: uid("block"),
                kind: "paragraph",
                html: escapeMarkup(image.alt),
              },
            ]
          : [];
      }
      return [
        {
          id: uid("block"),
          kind,
          html: kind === "image" ? "" : container.innerHTML,
          ...(b.headingDepth === 4 ||
          b.headingDepth === 5 ||
          b.headingDepth === 6
            ? { headingLevel: b.headingDepth }
            : {}),
          ...(kind === "image" && src && image ? { src, alt: image.alt } : {}),
        },
      ];
    });
  }

  function warnImage(alt?: string) {
    warnings.push(`图片${alt ? `「${alt}」` : ""}缺少可用地址或格式不受支持`);
  }
  function usableImage(image: HTMLImageElement) {
    return ["data-src", "data-original", "src"]
      .map((attr) =>
        (image.getAttribute(attr) ?? "").trim().replace(/^\/\//, "https://"),
      )
      .find((src) => safeImage(src) && !src.startsWith("asset:"));
  }
  function normalizeImages(container: HTMLElement) {
    for (const image of container.querySelectorAll("img")) {
      const src = usableImage(image);
      image.removeAttribute("data-src");
      image.removeAttribute("data-original");
      if (src) image.setAttribute("src", src);
      else {
        warnImage(image.alt);
        image.replaceWith(doc.createTextNode(image.alt));
      }
    }
  }

  const root = doc.createElement("div");
  root.innerHTML = sanitizeHTML(input, doc.defaultView as DOMWindow, true);
  normalizeImages(root);
  const result: ArticleBlock[] = [];
  const add = (
    kind: BlockKind,
    html: string,
    extra: Partial<ArticleBlock> = {},
  ) => result.push({ id: uid("block"), kind, html, ...extra });
  const addImage = (img: HTMLImageElement, caption?: string) =>
    add("image", "", {
      src: img.getAttribute("src")!,
      alt: img.alt,
      ...(caption ? { caption } : {}),
    });
  const emitInline = (el: HTMLElement, kind: BlockKind) => {
    const level = Number(el.tagName[1]);
    const extra: Partial<ArticleBlock> =
      kind === "subheading" && (level === 4 || level === 5 || level === 6)
        ? { headingLevel: level }
        : {};
    const range = doc.createRange();
    range.selectNodeContents(el);
    const flush = () => {
      const fragment = range.cloneContents();
      if (!meaningful(fragment)) return;
      const html = doc.createElement("div");
      html.append(fragment);
      add(kind, html.innerHTML, extra);
    };
    // Images wrapped in a link stay inline so their link is preserved.
    for (const boundary of el.querySelectorAll("img:not(a img),br + br")) {
      range.setEndBefore(boundary);
      flush();
      if (boundary.tagName === "IMG") addImage(boundary as HTMLImageElement);
      range.setStartAfter(boundary);
    }
    range.setEnd(el, el.childNodes.length);
    flush();
  };
  const visitFlow = (parent: HTMLElement) => {
    const inline = doc.createElement("div");
    const flush = () => {
      emitInline(inline, "paragraph");
      inline.replaceChildren();
    };
    for (const node of Array.from(parent.childNodes)) {
      const el = node.nodeType === 1 ? (node as HTMLElement) : undefined;
      if (
        !el?.matches(flowTags) &&
        !el?.querySelector(flowTags.replace(",img", ""))
      ) {
        inline.append(node);
        continue;
      }
      flush();
      const tag = el.tagName;
      const kind = htmlKinds[tag];
      if (tag === "IMG") addImage(el as HTMLImageElement);
      else if (tag === "HR") add("divider", "");
      else if (
        tag === "FIGURE" &&
        el.children.length === 2 &&
        el.firstElementChild?.matches("img") &&
        el.lastElementChild?.matches("figcaption")
      ) {
        addImage(
          el.firstElementChild as HTMLImageElement,
          el.lastElementChild.textContent?.trim(),
        );
      } else if (
        kind === "list" ||
        kind === "table" ||
        kind === "quote" ||
        kind === "code"
      ) {
        if (meaningful(el))
          add(
            kind,
            kind === "list" || kind === "table" ? el.outerHTML : el.innerHTML,
          );
      } else if (kind || tag === "P") emitInline(el, kind ?? "paragraph");
      else visitFlow(el);
    }
    flush();
  };
  visitFlow(root);
  return result;
}
