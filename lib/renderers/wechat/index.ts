import type { ArticleBlock, InlineStyle, StyleTemplate } from "../../article-types";
import type { UnifiedArticleBlock, UnifiedArticleContent } from "../../content";
import { styleTemplates } from "../../style-templates";

export type WechatImageNode = {
  id?: string;
  blockId?: string;
  src: string;
  alt?: string;
  caption?: string;
  width?: number;
  align?: "left" | "center" | "right";
};

export type WechatRenderOptions = {
  template?: StyleTemplate;
  imageNodes?: WechatImageNode[];
};

export type WechatRenderResult = {
  platform: "wechat";
  rendererVersion: 1;
  templateKey: StyleTemplate["key"];
  title?: string;
  html: string;
  blocks: UnifiedArticleBlock[];
  imageNodes: WechatImageNode[];
  warnings: UnifiedArticleContent["warnings"];
};

type RenderableBlock = ArticleBlock | UnifiedArticleBlock;

const inlineCodeStyle: InlineStyle = {
  "font-family": "Menlo, Monaco, Consolas, monospace",
  "background-color": "#f3f4f6",
  padding: "1px 4px",
  "border-radius": "3px",
};

const dividerStyle: InlineStyle = {
  margin: "28px 0",
  height: "1px",
  "background-color": "rgba(0,0,0,0.08)",
};

const codeBlockStyle: InlineStyle = {
  margin: "20px 0",
  padding: "14px 16px",
  color: "#1F2937",
  "background-color": "#F8FAFC",
  border: "1px solid #E5E7EB",
  "border-radius": "8px",
  "font-size": "13px",
  "line-height": "1.7",
  "white-space": "pre-wrap",
  "word-break": "break-word",
  "font-family": "Menlo, Monaco, Consolas, monospace",
};

const explicitHtmlTagNames =
  "a|abbr|address|article|aside|blockquote|br|button|caption|cite|code|col|colgroup|dd|del|details|div|dl|dt|em|figcaption|figure|footer|h[1-6]|header|hr|iframe|img|li|main|mark|math|object|ol|p|pre|script|section|small|span|strong|style|sub|summary|sup|svg|table|tbody|td|template|tfoot|th|thead|tr|ul";
const explicitHtmlTagPattern = new RegExp(`</?(?:${explicitHtmlTagNames})(?:\\s+[^<>]*)?/?>`, "gi");

function escapeHtml(str: string) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(str: string) {
  return escapeHtml(str).replace(/`/g, "&#96;");
}

export function toWechatStyle(style: InlineStyle) {
  return Object.entries(style)
    .filter(([, value]) => value !== "")
    .map(([key, value]) => `${key}: ${value}`)
    .join("; ");
}

function stripUnsafeRichText(input: string) {
  return input
    .replace(/<(script|style|iframe|object|embed|svg|math|template)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(?:script|style|iframe|object|embed|svg|math|template)\b[^>]*\/?>/gi, "")
    .replace(/<(strong|b)(?:\s+[^<>]*)?>([\s\S]*?)<\/\1>/gi, "**$2**")
    .replace(/<(em|i)(?:\s+[^<>]*)?>([\s\S]*?)<\/\1>/gi, "_$2_")
    .replace(/<code(?:\s+[^<>]*)?>([\s\S]*?)<\/code>/gi, "`$1`")
    .replace(/<br(?:\s+[^<>]*)?\/?>/gi, "\n")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(?:href|src)\s*=\s*(?:"\s*(?:javascript|vbscript|data:text\/html)[^"]*"|'\s*(?:javascript|vbscript|data:text\/html)[^']*'|\s*(?:javascript|vbscript|data:text\/html)[^\s>]+)/gi, "")
    .replace(explicitHtmlTagPattern, "")
    .replace(/(?:^|\s)(?:style\s*=\s*)?["“”']?[^<>]*(?:font-weight|font-size|line-height|text-align|color|background|margin|padding)\s*:[^>]*>/gi, "")
    .trim();
}

function formatInline(text: string) {
  let out = escapeHtml(stripUnsafeRichText(text));
  out = out.replace(/`([^`]+)`/g, `<span style="${toWechatStyle(inlineCodeStyle)}">$1</span>`);
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  out = out.replace(/(^|[\s([{（])_([^_\n]+)_/g, "$1<em>$2</em>");
  out = out.replace(/(^|[\s([{（])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  out = out.replace(/"([^"]{2,})"/g, '"<strong>$1</strong>"');
  return out;
}

function paragraph(style: InlineStyle, content: string) {
  return `<p style="${toWechatStyle(style)}">${content}</p>`;
}

function span(style: InlineStyle, content = "") {
  return `<span style="${toWechatStyle(style)}">${content}</span>`;
}

function getBlockText(block: RenderableBlock) {
  if ("items" in block) {
    return block.items.join("\n");
  }
  if ("body" in block) {
    return block.body;
  }
  return block.text;
}

function getBlockId(block: RenderableBlock, index: number) {
  return "id" in block ? block.id : `legacy-${index + 1}`;
}

function getBlockMarkdown(block: RenderableBlock) {
  return "markdown" in block ? block.markdown : getBlockText(block);
}

function getBlockSourceText(block: RenderableBlock) {
  return "source" in block ? block.source.sourceText : getBlockText(block);
}

function isSafeImageSrc(src: string) {
  return /^(https?:\/\/|blob:|data:image\/(?:png|jpe?g|gif|webp);base64,)/i.test(src.trim());
}

function parseMarkdownImage(block: RenderableBlock) {
  const candidates = [getBlockSourceText(block), getBlockMarkdown(block), getBlockText(block)];

  for (const candidate of candidates) {
    const match = candidate.match(/!\[([^\]]*)]\(([^)\s]+)(?:\s+"[^"]*")?\)/);
    if (match) {
      return {
        alt: stripUnsafeRichText(match[1]),
        src: match[2].trim(),
      };
    }
  }

  return undefined;
}

function findImageNode(block: RenderableBlock, index: number, imageNodes: WechatImageNode[] = [], imageOrdinal = index) {
  const blockId = getBlockId(block, index);
  return imageNodes.find((node) => node.blockId === blockId || node.id === blockId) ?? imageNodes[imageOrdinal];
}

function imageWidth(width?: number) {
  if (!width || !Number.isFinite(width)) {
    return "100%";
  }
  if (width > 0 && width <= 100) {
    return `${Math.round(width)}%`;
  }
  return `${Math.round(Math.max(1, width))}px`;
}

function imageMargin(align?: WechatImageNode["align"]) {
  if (align === "left") {
    return "0 auto 0 0";
  }
  if (align === "right") {
    return "0 0 0 auto";
  }
  return "0 auto";
}

function renderImage(block: RenderableBlock, template: StyleTemplate, index: number, options: WechatRenderOptions, imageOrdinal: number) {
  const visual = template.visual;
  const explicitNode = findImageNode(block, index, options.imageNodes, imageOrdinal);
  const parsedImage = parseMarkdownImage(block);
  const src = explicitNode?.src ?? parsedImage?.src;
  const alt = stripUnsafeRichText(explicitNode?.alt ?? parsedImage?.alt ?? getBlockText(block));
  const caption = stripUnsafeRichText(explicitNode?.caption ?? alt ?? getBlockText(block));

  if (src && isSafeImageSrc(src)) {
    const imageStyle = toWechatStyle({
      display: "block",
      width: imageWidth(explicitNode?.width),
      "max-width": "100%",
      height: "auto",
      margin: imageMargin(explicitNode?.align),
      border: "0",
      "border-radius": "6px",
    });
    const captionHtml = caption ? paragraph({ margin: "8px 0 0", color: visual.muted, "font-size": "13px", "line-height": "1.6", "text-align": "center" }, formatInline(caption)) : "";

    return `<section data-wechat-block-type="image" style="${toWechatStyle(template.blocks.image)}"><img src="${escapeAttribute(src.trim())}" alt="${escapeAttribute(alt)}" style="${imageStyle}" />${captionHtml}</section>`;
  }

  return `<section data-wechat-block-type="image" style="${toWechatStyle(template.blocks.image)}">${span({ display: "inline-block", padding: "2px 10px", border: `1px solid ${visual.border}`, color: visual.primary, "font-size": "13px", "font-weight": 700, "border-radius": "999px", margin: "0 0 8px" }, "图片占位")}<br />${formatInline(caption || getBlockText(block))}</section>`;
}

function renderTitle(block: RenderableBlock, template: StyleTemplate) {
  const visual = template.visual;
  const title = paragraph(template.blocks.title, formatInline(getBlockText(block)));

  if (visual.variant === "knowledge") {
    return `<section style="margin: 0 0 28px;">${span({ display: "block", width: "36px", height: "4px", "background-color": visual.primary, "border-radius": "999px", margin: "0 0 14px" })}${title}</section>`;
  }

  if (visual.variant === "business") {
    return `<section style="margin: 0 0 30px;">${title}${span({ display: "block", width: "100%", height: "1px", "background-color": visual.border, margin: "10px 0 0" })}</section>`;
  }

  if (visual.variant === "tech") {
    return `<section style="margin: 0 0 30px;">${title}${span({ display: "block", width: "88px", height: "3px", "background-color": visual.accent, "border-radius": "999px", margin: "10px 0 0" })}</section>`;
  }

  if (visual.theme === "modern") {
    return `<section style="margin: 0 0 30px; text-align: center;">${span({ display: "inline-block", width: "42px", height: "4px", "background-color": visual.accent, "border-radius": "999px", margin: "0 0 12px" })}${title}${span({ display: "inline-block", width: "78px", height: "2px", "background-color": visual.border, "border-radius": "999px", margin: "6px 0 0" })}</section>`;
  }

  if (visual.theme === "grace") {
    return `<section style="margin: 0 0 34px; text-align: center;">${span({ display: "inline-block", width: "52px", height: "1px", "background-color": visual.border, margin: "0 0 12px" })}${title}${span({ display: "inline-block", width: "88px", height: "3px", "background-color": visual.primary, "border-radius": "999px", margin: "10px 0 0" })}</section>`;
  }

  if (visual.theme === "simple") {
    return `<section style="margin: 0 0 32px; text-align: left;">${span({ display: "block", width: "34px", height: "4px", "background-color": visual.primary, "border-radius": "8px 24px 8px 24px", margin: "0 0 12px 8px" })}${title}</section>`;
  }

  return `<section style="margin: 0 0 32px; text-align: center;">${span({ display: "inline-block", width: "28px", height: "2px", "background-color": visual.primary, "vertical-align": "middle", margin: "0 10px 0 0" })}${span({ display: "inline-block", width: "8px", height: "8px", "background-color": visual.primary, "border-radius": "50%", "vertical-align": "middle" })}${title}${span({ display: "inline-block", width: "96px", height: "2px", "background-color": visual.primary, margin: "8px auto 0" })}</section>`;
}

function renderSection(block: RenderableBlock, template: StyleTemplate) {
  const visual = template.visual;
  const text = formatInline(getBlockText(block));

  if (visual.variant) {
    return paragraph(template.blocks.section, text);
  }

  if (visual.theme === "modern") {
    return `<section style="margin: 36px 0 20px;">${paragraph(template.blocks.section, text)}${span({ display: "block", width: "100%", height: "1px", "background-color": visual.border, margin: "8px 0 0" })}</section>`;
  }

  if (visual.theme === "simple") {
    return `<section style="margin: 44px 0 24px; text-align: center;">${span({ display: "inline-block", padding: "0 10px", color: visual.primary, "font-size": "13px", "font-weight": 700, "letter-spacing": "0.08em" }, "SECTION")}${paragraph(template.blocks.section, text)}</section>`;
  }

  if (visual.theme === "grace") {
    return `<section style="margin: 48px 0 26px; text-align: center;">${paragraph(template.blocks.section, text)}${span({ display: "inline-block", width: "68px", height: "2px", "background-color": visual.border, margin: "10px 0 0" })}</section>`;
  }

  return `<section style="margin: 48px 0 26px; text-align: center;">${span({ display: "inline-block", width: "16px", height: "16px", "border-radius": "50%", "background-color": visual.softBg, border: `1px solid ${visual.primary}`, "vertical-align": "middle", margin: "0 8px 0 0" })}${paragraph(template.blocks.section, text)}</section>`;
}

export function renderWechatBlockHtml(block: RenderableBlock, template: StyleTemplate, index = 0, options: WechatRenderOptions = {}, imageOrdinal = index) {
  const styles = template.blocks;
  const visual = template.visual;

  switch (block.type) {
    case "title":
      return renderTitle(block, template);
    case "lead":
      return `<section style="${toWechatStyle(styles.lead)}">${span({ color: visual.primary, "font-weight": 800 }, "导语")}${span({ color: visual.border, margin: "0 8px" }, "/")}${formatInline(block.text)}</section>`;
    case "section":
      return renderSection(block, template);
    case "subsection":
      return paragraph(styles.subsection, formatInline(block.text));
    case "paragraph":
      return paragraph(styles.paragraph, formatInline(block.text));
    case "quote":
      return `<section style="${toWechatStyle(styles.quote)}">${span({ color: visual.primary, "font-size": "22px", "font-weight": 800, "line-height": "1", margin: "0 8px 0 0" }, visual.quoteSymbol)}${formatInline(block.text)}</section>`;
    case "golden":
      return `<section style="${toWechatStyle(styles.golden)}">${formatInline(block.text)}</section>`;
    case "summary":
      return `<section style="${toWechatStyle(styles.summary)}">${formatInline(block.text)}</section>`;
    case "cta":
      if (visual.variant) {
        return `<section style="${toWechatStyle(styles.cta)}">${formatInline(block.text)}</section>`;
      }
      return `<section style="${toWechatStyle(styles.cta)}">${span({ display: "block", "font-size": "13px", "font-weight": 700, opacity: 0.82, margin: "0 0 6px" }, visual.ctaPrefix)}${formatInline(block.text)}</section>`;
    case "image":
      return renderImage(block, template, index, options, imageOrdinal);
    case "list":
      return `<section style="${toWechatStyle(styles.list)}">${block.items
        .map((item, itemIndex) => {
          const matched = stripUnsafeRichText(item).match(/^([^：:]{2,20})[:：](.+)$/);
          const bullet = visual.variant === "business" ? String(itemIndex + 1).padStart(2, "0") : visual.variant === "tech" ? ">" : visual.listSymbol;
          if (matched) {
            return paragraph(
              { margin: "0 0 12px", "font-size": `${template.body.fontSize}px`, "line-height": template.body.lineHeight },
              `<span style="${toWechatStyle(template.marker.listBullet)}">${formatInline(matched[1])}：</span>${formatInline(matched[2])}`
            );
          }
          return paragraph(
            { margin: "0 0 12px", "font-size": `${template.body.fontSize}px`, "line-height": template.body.lineHeight },
            `<span style="${toWechatStyle(template.marker.listBullet)}">${bullet}</span> ${formatInline(item)}`
          );
        })
        .join("")}</section>`;
    case "card":
      return `<section style="${toWechatStyle(styles.card)}">${
        block.title
          ? paragraph({ margin: "0 0 10px", "font-weight": 800, color: visual.primary, "font-size": `${template.body.fontSize}px`, "line-height": "1.8" }, `${span({ display: "inline-block", width: "6px", height: "6px", "background-color": visual.primary, "border-radius": "50%", margin: "0 8px 2px 0" })}${formatInline(block.title)}`)
          : ""
      }${paragraph({ margin: "0", "font-size": `${template.body.fontSize}px`, "line-height": template.body.lineHeight }, formatInline(block.body))}</section>`;
    case "divider":
      return `<section data-wechat-block-type="divider" style="${toWechatStyle(dividerStyle)}"></section>`;
    case "pageBreak":
      return `<section data-wechat-block-type="page-break" style="${toWechatStyle({ margin: "30px 0", color: visual.muted, "font-size": "13px", "text-align": "center" })}">分页</section>`;
    case "code":
      return `<section data-wechat-block-type="code" style="${toWechatStyle(codeBlockStyle)}">${escapeHtml(block.text)}</section>`;
    default:
      return "";
  }
}

export function renderWechatBlocksHtml(blocks: RenderableBlock[], options: WechatRenderOptions = {}) {
  const template = options.template ?? styleTemplates.zhenyiKnowledgeMinimal;
  let imageOrdinal = 0;
  const renderedBlocks = blocks.map((block, index) => {
    const currentImageOrdinal = imageOrdinal;
    if (block.type === "image") {
      imageOrdinal += 1;
    }
    return renderWechatBlockHtml(block, template, index, options, currentImageOrdinal);
  });

  return `<section style="${toWechatStyle({ ...template.container, "font-family": template.fontFamily })}">\n${renderedBlocks.join("\n\n")}\n</section>`;
}

export function renderWechatContentHtml(content: UnifiedArticleContent, options: WechatRenderOptions = {}) {
  return renderWechatBlocksHtml(content.blocks, options);
}

export function renderWechatContent(content: UnifiedArticleContent, options: WechatRenderOptions = {}): WechatRenderResult {
  const template = options.template ?? styleTemplates.zhenyiKnowledgeMinimal;
  const renderOptions = { template, imageNodes: options.imageNodes };

  return {
    platform: "wechat",
    rendererVersion: 1,
    templateKey: template.key,
    title: content.title,
    html: renderWechatContentHtml(content, renderOptions),
    blocks: content.blocks.map((block) => ({
      ...block,
      source: { ...block.source },
      ...(block.type === "list" ? { items: [...block.items] } : {}),
    })),
    imageNodes: collectWechatImageNodes(content.blocks, options.imageNodes),
    warnings: content.warnings.map((warning) => ({ ...warning, source: warning.source ? { ...warning.source } : undefined })),
  };
}

export function renderUnifiedWechatHtml(content: UnifiedArticleContent, template: StyleTemplate) {
  return renderWechatContentHtml(content, { template });
}

export function collectWechatImageNodes(blocks: RenderableBlock[], imageNodes: WechatImageNode[] = []) {
  let imageOrdinal = 0;
  return blocks.flatMap((block, index): WechatImageNode[] => {
    if (block.type !== "image") {
      return [];
    }

    const explicitNode = findImageNode(block, index, imageNodes, imageOrdinal);
    imageOrdinal += 1;
    const parsedImage = parseMarkdownImage(block);
    const src = explicitNode?.src ?? parsedImage?.src;

    if (!src || !isSafeImageSrc(src)) {
      return [];
    }

    return [
      {
        id: explicitNode?.id ?? getBlockId(block, index),
        blockId: explicitNode?.blockId ?? getBlockId(block, index),
        src: src.trim(),
        alt: stripUnsafeRichText(explicitNode?.alt ?? parsedImage?.alt ?? getBlockText(block)),
        caption: stripUnsafeRichText(explicitNode?.caption ?? parsedImage?.alt ?? getBlockText(block)),
        width: explicitNode?.width,
        align: explicitNode?.align,
      },
    ];
  });
}
