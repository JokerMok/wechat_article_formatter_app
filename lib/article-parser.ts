import type { ArticleBlock } from "./article-types";

type SourceLine = {
  text: string;
  headingLevel?: number;
  quoted?: boolean;
};

function stripInlineMarkdown(text: string) {
  return text
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => `图片：${alt || url}`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .trim();
}

function normalizeInput(raw: string): SourceLine[] {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/```[\s\S]*?```/g, "")
    .split("\n")
    .map((rawLine) => {
      const trimmed = rawLine.trim();
      if (!trimmed) return { text: "" };

      const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        return {
          text: stripInlineMarkdown(heading[2]),
          headingLevel: heading[1].length,
        };
      }

      const quote = trimmed.match(/^>\s?(.+)$/);
      if (quote) {
        return {
          text: stripInlineMarkdown(quote[1]),
          quoted: true,
        };
      }

      return { text: stripInlineMarkdown(trimmed) };
    });
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
    /^\d+[、.．]/.test(t) ||
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
  return /^(图片|配图|图示|插图|此处插入|image)[:：\s]/i.test(t) || /^\[[^\]]*(图片|配图|image)[^\]]*\]$/i.test(t);
}

function normalizeImagePlaceholder(line: SourceLine) {
  const t = line.text.trim();
  if (/^\[[^\]]+\]$/.test(t)) {
    return t.replace(/^\[/, "").replace(/\]$/, "");
  }
  return t.replace(/^(图片|配图|图示|插图|此处插入|image)[:：\s]*/i, "此处插入：");
}

function isGoldenSentence(text: string) {
  const t = text.trim();
  return t.length >= 10 && t.length <= 46 && /不是|而是|已经|正在|终究|本质|变成|过去了|真正/.test(t);
}

function isSummaryIntro(text: string) {
  return /对普通人来说，这意味着|这意味着|总结来看|归根到底|写在最后|最后想说/.test(text.trim());
}

function isCTA(text: string) {
  return /私信|回复|留言|关注|领取|获取|发你|我发你|评论区|扫码|点击/.test(text.trim()) || /^(💡|✨|🔥|✅|📌|📍)/.test(text.trim());
}

function isQuoteLine(line: SourceLine) {
  return line.quoted || /^(核心突破|关键判断|为什么这次不一样|对普通人的价值|当然，挑战也在|关键在于|核心就是)[:：]?/.test(line.text);
}

export function parseArticle(raw: string): ArticleBlock[] {
  const lines = normalizeInput(raw);
  const blocks: ArticleBlock[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.text) {
      i += 1;
      continue;
    }

    if (isLikelyMainTitle(line, blocks.length)) {
      blocks.push({ type: "title", text: line.text });
      i += 1;
      continue;
    }

    if (isCTA(line.text)) {
      blocks.push({ type: "cta", text: line.text });
      i += 1;
      continue;
    }

    if (isImagePlaceholder(line)) {
      blocks.push({ type: "image", text: normalizeImagePlaceholder(line) });
      i += 1;
      continue;
    }

    if (isSectionTitle(line)) {
      blocks.push({ type: "section", text: line.text });
      i += 1;
      continue;
    }

    if (isSubTitle(line)) {
      blocks.push({ type: "subsection", text: line.text });
      i += 1;
      continue;
    }

    if (isQuoteLine(line)) {
      blocks.push({ type: "quote", text: line.text });
      i += 1;
      continue;
    }

    if (isBullet(line)) {
      const items: string[] = [];
      while (i < lines.length && isBullet(lines[i])) {
        items.push(normalizeBullet(lines[i]));
        i += 1;
      }
      blocks.push({ type: "list", items });
      continue;
    }

    const paragraphLines = [line.text];
    let j = i + 1;
    while (
      j < lines.length &&
      lines[j].text &&
      !isSectionTitle(lines[j]) &&
      !isSubTitle(lines[j]) &&
      !isBullet(lines[j]) &&
      !isCTA(lines[j].text) &&
      !isImagePlaceholder(lines[j]) &&
      !isQuoteLine(lines[j])
    ) {
      paragraphLines.push(lines[j].text);
      j += 1;
    }

    const paragraph = paragraphLines.join("");
    if (blocks.length === 1 && blocks[0].type === "title" && looksLikeLead(paragraph)) {
      blocks.push({ type: "lead", text: paragraph });
    } else if (isGoldenSentence(paragraph)) {
      blocks.push({ type: "golden", text: paragraph });
    } else if (isSummaryIntro(paragraph)) {
      blocks.push({ type: "summary", text: paragraph });
    } else if (/^(.{4,18})[:：](.+)$/.test(paragraph) && paragraph.length <= 90) {
      const matched = paragraph.match(/^(.{4,18})[:：](.+)$/);
      blocks.push({ type: "card", title: matched?.[1]?.trim(), body: matched?.[2]?.trim() || "" });
    } else {
      blocks.push({ type: "paragraph", text: paragraph });
    }

    i = j;
  }

  return blocks;
}
