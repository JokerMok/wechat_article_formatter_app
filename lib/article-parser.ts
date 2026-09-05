import type { ArticleBlock, ArticleParseMode } from "./article-types";
import { parseSyntaxDocument } from "./content/source-document";
import type {
  ArticleContentParseOptions,
  ArticleSourceFormat,
  SourcePosition,
  SourceDocument,
  UnifiedArticleBlock,
  UnifiedArticleContent,
} from "./content";

type SourceLine = {
  text: string;
  markdown: string;
  sourceText: string;
  lineNumber: number;
  endLine?: number;
  startOffset: number;
  endOffset: number;
  headingLevel?: number;
  quoted?: boolean;
  divider?: boolean;
  pageBreak?: boolean;
  code?: boolean;
  language?: string;
  sanitized?: boolean;
};

type NormalizedText = {
  text: string;
  sanitized: boolean;
};

type ParseOptions = ArticleContentParseOptions;

const explicitHtmlTagNames =
  "a|abbr|address|article|aside|blockquote|br|button|caption|cite|code|col|colgroup|dd|del|details|div|dl|dt|em|figcaption|figure|footer|h[1-6]|header|hr|img|li|main|mark|ol|p|pre|section|small|span|strong|sub|summary|sup|table|tbody|td|tfoot|th|thead|tr|ul";
const explicitHtmlTagPattern = new RegExp(`</?(?:${explicitHtmlTagNames})(?:\\s+[^<>]*)?/?>`, "gi");
const pairedSingleLetterHtmlTagPattern = /<([bisu])(?:\s+[^<>]*)?>([\s\S]*?)<\/\1>/gi;

function decodeStyleMarkerEntities(text: string) {
  return text.replace(/&quot;|&#34;|&#x22;/gi, '"').replace(/&gt;|&#62;|&#x3e;/gi, ">");
}

function normalizeInlineText(text: string): NormalizedText {
  const original = text;
  const normalized = text
    .replace(/&quot;|&#34;|&#x22;|&gt;|&#62;|&#x3e;/gi, (entity) => decodeStyleMarkerEntities(entity))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(pairedSingleLetterHtmlTagPattern, "$2")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(?:href|src)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s>]+)/gi, "")
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => `图片：${alt || url}`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(explicitHtmlTagPattern, "")
    .replace(/(?:^|\s)(?:style\s*=\s*)?["“”']?[^<>]*(?:font-weight|font-size|line-height|text-align|color|background|margin|padding)\s*:[^>]*>/gi, "")
    .trim();

  return {
    text: normalized,
    sanitized: normalized !== original.trim(),
  };
}

function detectSourceFormat(raw: string): ArticleSourceFormat {
  return /(^|\n)\s{0,3}(#{1,6}\s+\S|(?:>|&gt;|＞)\s*\S|[-*+•]\s+\S|\d+[.)）]\s+\S|!\[[^\]]*]\([^)]+\)|\[.+]\(.+\)|-{3,}|<!--\s*pagebreak\s*-->)/i.test(raw)
    ? "markdown"
    : "plainText";
}

function normalizeInput(raw: string): SourceLine[] {
  const normalizedRaw = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rawLines = normalizedRaw.split("\n");
  const lines: SourceLine[] = [];
  let offset = 0;

  for (let index = 0; index < rawLines.length; index += 1) {
    const rawLine = rawLines[index];
    const lineNumber = index + 1;
    const startOffset = offset;
    const endOffset = startOffset + rawLine.length;
    offset = endOffset + 1;

    const trimmed = rawLine.trim();
    const base = {
      sourceText: rawLine,
      lineNumber,
      startOffset,
      endOffset,
    };

    const fenceStart = trimmed.match(/^```([A-Za-z0-9_-]+)?\s*$/);
    if (fenceStart) {
      const fenceLines = [rawLine];
      const codeLines: string[] = [];
      let fenceEndOffset = endOffset;
      let endLine = lineNumber;

      while (index + 1 < rawLines.length) {
        index += 1;
        const codeRawLine = rawLines[index];
        const codeStartOffset = offset;
        const codeEndOffset = codeStartOffset + codeRawLine.length;
        offset = codeEndOffset + 1;
        fenceLines.push(codeRawLine);
        fenceEndOffset = codeEndOffset;
        endLine = index + 1;

        if (/^```\s*$/.test(codeRawLine.trim())) break;
        codeLines.push(codeRawLine);
      }

      lines.push({
        ...base,
        text: codeLines.join("\n"),
        markdown: fenceLines.join("\n"),
        sourceText: fenceLines.join("\n"),
        endLine,
        endOffset: fenceEndOffset,
        code: true,
        language: fenceStart[1],
      });
      continue;
    }

    if (!trimmed) {
      lines.push({ ...base, text: "", markdown: rawLine });
      continue;
    }
    if (/^(>|&gt;|＞)$/.test(trimmed)) {
      lines.push({ ...base, text: "", markdown: rawLine });
      continue;
    }

    if (/^<!--\s*(pagebreak|分页)\s*-->$/i.test(trimmed) || /^\[(pagebreak|分页)]$/i.test(trimmed)) {
      lines.push({ ...base, text: "pageBreak", markdown: trimmed, pageBreak: true });
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      lines.push({ ...base, text: "divider", markdown: trimmed, divider: true });
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s*(.*)$/);
    if (heading) {
      const headingText = normalizeInlineText(heading[2]);
      if (!headingText.text) {
        lines.push({ ...base, text: "", markdown: rawLine, sanitized: headingText.sanitized });
        continue;
      }
      lines.push({
        ...base,
        text: headingText.text,
        markdown: headingText.text,
        headingLevel: heading[1].length,
        sanitized: headingText.sanitized,
      });
      continue;
    }

    const quote = trimmed.match(/^(?:>|&gt;|＞)\s*(.*)$/);
    if (quote) {
      const quoteText = normalizeInlineText(quote[1]);
      if (!quoteText.text) {
        lines.push({ ...base, text: "", markdown: rawLine, sanitized: quoteText.sanitized });
        continue;
      }
      lines.push({
        ...base,
        text: quoteText.text,
        markdown: `> ${quoteText.text}`,
        quoted: true,
        sanitized: quoteText.sanitized,
      });
      continue;
    }

    const normalizedText = normalizeInlineText(trimmed);
    lines.push({
      ...base,
      text: normalizedText.text,
      markdown: normalizedText.text,
      sanitized: normalizedText.sanitized,
    });
  }

  return lines;
}

function looksLikeLead(text: string) {
  return text.length <= 90 && /革命|变化|本质|趋势|判断|范式|时代|未来|关键|核心|机会|问题/.test(text);
}

function isLikelyMainTitle(line: SourceLine, index: number) {
  if (line.headingLevel === 1) return true;
  if (index !== 0 && line.headingLevel !== 1) return false;
  const t = line.text.trim();
  return !!t && t.length > 4 && t.length < 72;
}

function isSectionTitle(line: SourceLine) {
  const t = line.text.trim();
  if (!t) return false;
  return (
    line.headingLevel === 2 ||
    /^([一二三四五六七八九十]+[、，.．])/.test(t) ||
    /^第[一二三四五六七八九十]+部分/.test(t) ||
    /^\d+、/.test(t) ||
    /^(写在最后|总结|结语)$/.test(t)
  );
}

function isSubTitle(line: SourceLine) {
  const t = line.text.trim();
  return line.headingLevel === 3 || (!!t && t.length <= 32 && /[:：]$/.test(t));
}

function isBullet(line: SourceLine) {
  return /^\s*([-*+•]|\d+[.)）])\s+/.test(line.text);
}

function normalizeBullet(line: SourceLine) {
  return line.text.replace(/^\s*([-*+•]|\d+[.)）])\s+/, "").trim();
}

function isImagePlaceholder(line: SourceLine) {
  const t = line.text.trim();
  return /^(图片|配图|图示|插图|此处插入|image)[:：\s]/i.test(t) || /^\[[^\]]*(图片|配图|image)[^\]]*]$/i.test(t);
}

function normalizeImagePlaceholder(line: SourceLine) {
  const t = line.text.trim();
  if (/^\[[^\]]+]$/.test(t)) {
    return t.replace(/^\[/, "").replace(/]$/, "");
  }
  return t.replace(/^(图片|配图|图示|插图|此处插入|image)[:：\s]*/i, "此处插入：");
}

function isSummaryIntro(text: string) {
  return /对普通人来说，这意味着|这意味着|总结来看|归根到底|写在最后|最后想说/.test(text.trim());
}

function isCTA(text: string) {
  return /私信|回复|留言|关注|领取|获取|发你|我发你|评论区|扫码|点击/.test(text.trim()) || /^(💡|✨|🔥|✅|📌|📍)/.test(text.trim());
}

function isQuoteLine(line: SourceLine) {
  return line.quoted || /^(核心突破|关键判断|关键风险|为什么这次不一样|对普通人的价值|当然，挑战也在|关键在于|核心就是)[:：]?/.test(line.text);
}

const explicitCardPrefixes: Record<ArticleParseMode, string[]> = {
  narrative: [],
  knowledge: ["核心判断", "关键判断", "关键风险", "核心问题", "关键结论", "注意事项", "边界说明", "使用建议", "标准动作", "实操方法"],
  business: ["当前问题", "改造目标", "解决方案", "方案", "案例", "客户反馈", "关键风险", "边界", "行动建议", "下一步", "结果"],
};

function parseExplicitCard(text: string, mode: ArticleParseMode) {
  const matched = text.match(/^([^：:]{2,20})[:：](.+)$/);
  if (!matched) return null;

  const title = matched[1].trim();
  const body = matched[2].trim();
  const prefixes = explicitCardPrefixes[mode];
  if (!prefixes.includes(title)) return null;

  return { title, body };
}

function shouldPromoteQuote(line: SourceLine, mode: ArticleParseMode) {
  if (line.quoted) return true;
  if (mode === "narrative") return false;
  return isQuoteLine(line);
}

function makeSourcePosition(lines: SourceLine[]): SourcePosition {
  const first = lines[0];
  const last = lines[lines.length - 1];

  return {
    startLine: first.lineNumber,
    endLine: last.endLine ?? last.lineNumber,
    startOffset: first.startOffset,
    endOffset: last.endOffset,
    sourceText: lines.map((line) => line.sourceText).join("\n"),
  };
}

function makeTextBlock(
  id: string,
  type: Exclude<ArticleBlock["type"], "list" | "card">,
  text: string,
  lines: SourceLine[],
  markdown = lines.map((line) => line.markdown).join("\n")
): UnifiedArticleBlock {
  return {
    id,
    type,
    text,
    plainText: text,
    markdown,
    source: makeSourcePosition(lines),
  };
}

function makeStructuralBlock(id: string, type: "divider" | "pageBreak" | "code", line: SourceLine): UnifiedArticleBlock {
  return {
    id,
    type,
    text: line.code ? line.text : type,
    plainText: line.code ? line.text : type,
    markdown: line.markdown,
    source: makeSourcePosition([line]),
    language: line.language,
  };
}

function hasSanitizedText(lines: SourceLine[]) {
  return lines.some((line) => line.sanitized);
}

function isStructuralLine(line: SourceLine) {
  return line.divider || line.pageBreak || line.code;
}

export function parseArticleContent(raw: string, options: ParseOptions = {}): UnifiedArticleContent {
  return parseArticleContentInternal(raw, options, true);
}

function parseArticleContentInternal(raw: string, options: ParseOptions, legacyPresentationBlocks: boolean): UnifiedArticleContent {
  const mode = options.mode ?? "narrative";
  const lines = normalizeInput(raw);
  const blocks: UnifiedArticleBlock[] = [];
  const warnings: UnifiedArticleContent["warnings"] = [];

  const pushBlock = (block: UnifiedArticleBlock, sourceLines: SourceLine[]) => {
    blocks.push(block);
    if (hasSanitizedText(sourceLines)) {
      warnings.push({
        code: "sanitized_rich_text",
        message: "Removed pasted style or unsafe rich-text fragments.",
        source: block.source,
      });
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.text) {
      i += 1;
      continue;
    }

    const id = `block-${blocks.length + 1}`;

    if (line.divider) {
      pushBlock(makeStructuralBlock(id, "divider", line), [line]);
      i += 1;
      continue;
    }

    if (line.pageBreak) {
      pushBlock(makeStructuralBlock(id, "pageBreak", line), [line]);
      i += 1;
      continue;
    }

    if (line.code) {
      pushBlock(makeStructuralBlock(id, "code", line), [line]);
      i += 1;
      continue;
    }

    if (isLikelyMainTitle(line, blocks.length)) {
      pushBlock(makeTextBlock(id, "title", line.text, [line]), [line]);
      i += 1;
      continue;
    }

    if (isImagePlaceholder(line)) {
      pushBlock(makeTextBlock(id, "image", normalizeImagePlaceholder(line), [line]), [line]);
      i += 1;
      continue;
    }

    if (isSectionTitle(line)) {
      pushBlock(makeTextBlock(id, "section", line.text, [line]), [line]);
      i += 1;
      continue;
    }

    if (isSubTitle(line)) {
      pushBlock(makeTextBlock(id, "subsection", line.text, [line]), [line]);
      i += 1;
      continue;
    }

    const lineCard = legacyPresentationBlocks ? parseExplicitCard(line.text, mode) : null;
    if (lineCard && !line.quoted) {
      pushBlock(
        {
          id,
          type: "card",
          title: lineCard.title,
          body: lineCard.body,
          text: `${lineCard.title}：${lineCard.body}`,
          plainText: `${lineCard.title}：${lineCard.body}`,
          markdown: line.markdown,
          source: makeSourcePosition([line]),
        },
        [line]
      );
      i += 1;
      continue;
    }

    if (isQuoteBoundary(line, mode, legacyPresentationBlocks)) {
      pushBlock(makeTextBlock(id, "quote", line.text, [line]), [line]);
      i += 1;
      continue;
    }

    if (legacyPresentationBlocks && isCTA(line.text)) {
      pushBlock(makeTextBlock(id, "cta", line.text, [line]), [line]);
      i += 1;
      continue;
    }

    if (isBullet(line)) {
      const itemLines: SourceLine[] = [];
      const items: string[] = [];
      while (i < lines.length && isBullet(lines[i])) {
        itemLines.push(lines[i]);
        items.push(normalizeBullet(lines[i]));
        i += 1;
      }
      pushBlock(
        {
          id,
          type: "list",
          items,
          text: items.join(""),
          plainText: items.join("\n"),
          markdown: itemLines.map((item) => item.markdown).join("\n"),
          source: makeSourcePosition(itemLines),
        },
        itemLines
      );
      continue;
    }

    const paragraphLines = [line];
    let j = i + 1;
    while (
      j < lines.length &&
      lines[j].text &&
      !isStructuralLine(lines[j]) &&
      !isSectionTitle(lines[j]) &&
      !isSubTitle(lines[j]) &&
      !isBullet(lines[j]) &&
      !(legacyPresentationBlocks && isCTA(lines[j].text)) &&
      !isImagePlaceholder(lines[j]) &&
      !isQuoteBoundary(lines[j], mode, legacyPresentationBlocks) &&
      !(legacyPresentationBlocks && parseExplicitCard(lines[j].text, mode))
    ) {
      paragraphLines.push(lines[j]);
      j += 1;
    }

    const paragraph = paragraphLines.map((paragraphLine) => paragraphLine.text).join("");
    const markdown = paragraphLines.map((paragraphLine) => paragraphLine.markdown).join("\n");
    if (legacyPresentationBlocks && blocks.length === 1 && blocks[0].type === "title" && looksLikeLead(paragraph)) {
      pushBlock(makeTextBlock(id, "lead", paragraph, paragraphLines, markdown), paragraphLines);
    } else if (legacyPresentationBlocks && isSummaryIntro(paragraph)) {
      pushBlock(makeTextBlock(id, "summary", paragraph, paragraphLines, markdown), paragraphLines);
    } else {
      const explicitCard = legacyPresentationBlocks ? parseExplicitCard(paragraph, mode) : null;
      if (explicitCard) {
        pushBlock(
          {
            id,
            type: "card",
            title: explicitCard.title,
            body: explicitCard.body,
            text: `${explicitCard.title}：${explicitCard.body}`,
            plainText: `${explicitCard.title}：${explicitCard.body}`,
            markdown,
            source: makeSourcePosition(paragraphLines),
          },
          paragraphLines
        );
      } else {
        pushBlock(makeTextBlock(id, "paragraph", paragraph, paragraphLines, markdown), paragraphLines);
      }
    }

    i = j;
  }

  if (!blocks.length && raw.trim()) {
    warnings.push({
      code: "empty_input",
      message: "No supported article blocks were produced from non-empty input.",
    });
  }

  const title = blocks.find((block) => block.type === "title" && "text" in block)?.text;

  return {
    schemaVersion: 1,
    sourceText: raw,
    sourceFormat: detectSourceFormat(raw),
    parseMode: mode,
    title,
    blocks,
    warnings,
  };
}

export function articleContentToBlocks(content: UnifiedArticleContent): ArticleBlock[] {
  return content.blocks.flatMap((block): ArticleBlock[] => {
    switch (block.type) {
      case "title":
      case "lead":
      case "section":
      case "subsection":
      case "paragraph":
      case "quote":
      case "golden":
      case "summary":
      case "cta":
      case "image":
        return [{ type: block.type, text: block.text }];
      case "list":
        return [{ type: "list", items: block.items }];
      case "card":
        return [{ type: "card", title: block.title, body: block.body }];
      case "divider":
      case "pageBreak":
        return [];
      case "code":
      case "table":
        return block.text ? [{ type: "paragraph", text: block.text }] : [];
    }
  });
}

export function parseArticle(raw: string, options: ParseOptions = {}): ArticleBlock[] {
  return articleContentToBlocks(parseArticleContent(raw, options));
}

/**
 * Adds only source identity to the syntax parser output. This deliberately does
 * not infer semantic roles; that belongs to the semantic analyzer stage.
 */
export function parseSourceDocument(raw: string, options: ParseOptions = {}): SourceDocument {
  return parseSyntaxDocument(raw, options);
}

function isQuoteBoundary(line: SourceLine, mode: ArticleParseMode, legacyPresentationBlocks: boolean) {
  if (line.quoted) return true;
  return legacyPresentationBlocks && shouldPromoteQuote(line, mode);
}
