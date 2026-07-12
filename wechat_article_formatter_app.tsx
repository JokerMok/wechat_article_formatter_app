"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { ChevronDown, Copy, Code2, FileDown, Image as ImageIcon, RefreshCcw, Upload, Wand2 } from "lucide-react";
import { parseArticle } from "@/lib/article-parser";
import { copyRichText } from "@/lib/copy-rich-text";
import type { ArticleParseMode, TemplateKey } from "@/lib/article-types";
import { renderWechatHtml } from "@/lib/wechat-renderer";
import { styleTemplates, templateList } from "@/lib/style-templates";

const defaultArticle = `中小企业岗位 AI 提效 SOP：先改造客服，而不是全公司上 AI

很多老板第一次想用 AI，都会从“全公司都要用起来”开始。
这一步通常是错的。

真正可落地的 AI 提效，不是买一批工具，而是先选一个高频、重复、容易验收的岗位，把流程拆成 SOP。

核心判断：AI 提效不是工具问题，而是流程产品化问题。

一、为什么先从客服岗位开始
当前问题：客服每天都在重复回答相同问题，但知识散落在聊天记录、表格、老员工经验里。
改造目标：把高频问题、标准答案、升级规则、禁用话术整理成一个可复制的响应系统。

配图：客服工单流转前后对比图

客服岗位的好处是边界清楚。问题有没有答对，响应有没有变快，客户有没有继续追问，都能被记录。

二、第一版只做三个动作
- 高频问题归类：把最近 30 天咨询记录按问题类型聚类
- 标准答案生成：为每类问题生成可审核、可复制的回复
- 升级规则设定：遇到价格、投诉、合同、售后争议时转人工

三、不要一开始就追求自动回复
关键风险：如果知识库没有经过审核，自动回复会把错误答案放大。

第一阶段更适合做“AI 辅助客服”。让 AI 先起草，人工确认后发送。等命中率、满意度和风险边界稳定，再逐步自动化。

总结来看，中小企业落地 AI，不需要先追大模型能力，而要先找到一个能被验收的岗位流程。

留言回复「SOP」，我把岗位 AI 提效检查表发你。`;

const blockName: Record<string, string> = {
  title: "主标题",
  lead: "导语",
  section: "小节标题",
  subsection: "次级标题",
  paragraph: "正文段落",
  quote: "引用强调",
  golden: "金句",
  summary: "总结",
  cta: "行动引导",
  image: "图片占位",
  list: "列表",
  card: "信息卡片",
};

const parseModeOptions: Record<ArticleParseMode, { name: string; description: string }> = {
  narrative: {
    name: "叙事长文",
    description: "适合复盘、观点、故事类文章：只识别标题、正文、引用、列表和 CTA，不把冒号句自动转卡片。",
  },
  knowledge: {
    name: "知识干货",
    description: "适合方法论、教程类文章：显式识别核心判断、关键风险、标准动作等知识卡片。",
  },
  business: {
    name: "商务案例",
    description: "适合客户案例、方案文：显式识别当前问题、改造目标、方案、案例、行动建议等卡片。",
  },
};

const textImageFontFamily = "-apple-system, BlinkMacSystemFont, Helvetica Neue, PingFang SC, Hiragino Sans GB, Microsoft YaHei, Arial, sans-serif";

const textImageRatios = {
  portrait34: {
    name: "3:4 图文",
    width: 1080,
    height: 1440,
  },
  portrait916: {
    name: "9:16 竖版",
    width: 1080,
    height: 1920,
  },
} as const;

const textImagePresets = {
  warmBrown: {
    name: "暖棕文字卡",
    background: "#FFFBF6",
    title: "#8A430E",
    body: "#6B3A16",
    rule: "#D8C5B1",
    highlight: "#F1E7DC",
    dots: "#E9E0D7",
  },
  ink: {
    name: "黑白长文卡",
    background: "#FBFBF8",
    title: "#111827",
    body: "#333333",
    rule: "#D6D3D1",
    highlight: "#ECEBE7",
    dots: "#D6D3D1",
  },
  teal: {
    name: "青绿知识卡",
    background: "#F7FFFC",
    title: "#0F766E",
    body: "#24413D",
    rule: "#B7E4DC",
    highlight: "#E0F7F2",
    dots: "#CDEDE7",
  },
} as const;

type TextImagePresetKey = keyof typeof textImagePresets;
type TextImageRatioKey = keyof typeof textImageRatios;
type TextImageDensity = "regular" | "compact" | "dense";

type TextImagePage = {
  title: string;
  focus?: string;
  body: string;
  density: TextImageDensity;
  pageNumber: number;
  totalPages: number;
};

type TextImagePageDraft = Omit<TextImagePage, "pageNumber" | "totalPages" | "density"> & { density?: TextImageDensity };

type CarouselChunk = {
  text: string;
  role: "body" | "focus" | "heading" | "list";
};

const textImageLayout = {
  left: 84,
  top: 148,
  bottomPadding: 150,
};

const noLineStartPunctuation = /^[。！？；，、：,.!?;）】」』》〉%％]$/;

const textImageDensityProfiles: Record<
  TextImageDensity,
  {
    titleSize: number;
    titleLine: number;
    titleHighlightY: number;
    titleHighlightHeight: number;
    titleFocusGap: number;
    titleBodyGap: number;
    focusSize: number;
    focusLine: number;
    focusPaddingY: number;
    focusAfterGap: number;
    headingSize: number;
    headingLine: number;
    headingAfterGap: number;
    bodySize: number;
    bodyLine: number;
    bodyAfterGap: number;
  }
> = {
  regular: {
    titleSize: 72,
    titleLine: 88,
    titleHighlightY: 54,
    titleHighlightHeight: 24,
    titleFocusGap: 42,
    titleBodyGap: 54,
    focusSize: 34,
    focusLine: 54,
    focusPaddingY: 26,
    focusAfterGap: 42,
    headingSize: 42,
    headingLine: 60,
    headingAfterGap: 18,
    bodySize: 36,
    bodyLine: 64,
    bodyAfterGap: 38,
  },
  compact: {
    titleSize: 66,
    titleLine: 78,
    titleHighlightY: 49,
    titleHighlightHeight: 20,
    titleFocusGap: 30,
    titleBodyGap: 38,
    focusSize: 31,
    focusLine: 46,
    focusPaddingY: 22,
    focusAfterGap: 30,
    headingSize: 37,
    headingLine: 50,
    headingAfterGap: 12,
    bodySize: 33,
    bodyLine: 55,
    bodyAfterGap: 28,
  },
  dense: {
    titleSize: 60,
    titleLine: 70,
    titleHighlightY: 44,
    titleHighlightHeight: 18,
    titleFocusGap: 24,
    titleBodyGap: 30,
    focusSize: 29,
    focusLine: 42,
    focusPaddingY: 18,
    focusAfterGap: 24,
    headingSize: 34,
    headingLine: 46,
    headingAfterGap: 10,
    bodySize: 30,
    bodyLine: 49,
    bodyAfterGap: 22,
  },
};

function font(weight: number, size: number) {
  return `${weight} ${size}px ${textImageFontFamily}`;
}

function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  let line = "";

  for (const char of Array.from(text.trim())) {
    const nextLine = line + char;
    if (line && ctx.measureText(nextLine).width > maxWidth) {
      if (noLineStartPunctuation.test(char)) {
        line = nextLine;
        continue;
      }
      lines.push(line);
      line = char.trimStart();
    } else {
      line = nextLine;
    }
  }

  if (line) lines.push(line);
  return lines;
}

function cleanCarouselText(text: string) {
  return text
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s{0,3}>\s*/gm, "")
    .replace(/^\s{0,3}(?:&gt;|＞)\s*/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+([。！？；，、：,.!?;])/g, "$1")
    .replace(/([。！？；，、：,.!?;])\s+/g, "$1")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function cleanCarouselParagraph(text: string) {
  return cleanCarouselText(text)
    .replace(/\n+/g, "")
    .replace(/^[。！？；，、：,.!?;]+/, "")
    .replace(/[。！？；，、：,.!?;]+$/, (match) => (match.length > 1 ? match.slice(0, 1) : match))
    .trim();
}

function isMeaningfulCarouselText(text: string) {
  const cleaned = cleanCarouselParagraph(text);
  return cleaned.length > 0 && !/^[。！？；，、：,.!?;]+$/.test(cleaned);
}

function isCarouselKeyText(text: string) {
  const t = cleanCarouselText(text);
  if (!t) return false;
  return (
    t.length <= 120 &&
    (/^(核心判断|关键判断|关键风险|核心问题|关键结论|当前问题|改造目标|解决方案|边界|行动建议|下一步|结果)[:：]/.test(t) ||
      /不是.+而是|最怕|必须|关键|核心|本质|真正|不要.+而要/.test(t))
  );
}

function blockToCarouselChunk(block: ReturnType<typeof parseArticle>[number]): CarouselChunk | null {
  switch (block.type) {
    case "list":
      return { role: "list", text: block.items.map((item) => `- ${cleanCarouselParagraph(item)}`).join("\n") };
    case "card":
      return { role: "focus", text: cleanCarouselText(`${block.title ? `${block.title}：` : ""}${block.body}`) };
    case "quote":
    case "golden":
    case "lead":
    case "summary":
      return "text" in block ? { role: "focus", text: cleanCarouselText(block.text) } : null;
    case "subsection":
      return { role: "heading", text: cleanCarouselText(block.text) };
    case "image":
      return null;
    default:
      if (!("text" in block)) return null;
      return { role: isCarouselKeyText(block.text) ? "focus" : "body", text: cleanCarouselText(block.text) };
  }
}

function splitLongParagraph(text: string, maxChars: number) {
  const sentences = text.match(/[^。！？!?；;]+[。！？!?；;]?/g) ?? [text];
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      for (let index = 0; index < sentence.length; index += maxChars) {
        chunks.push(sentence.slice(index, index + maxChars));
      }
      continue;
    }

    if (current && current.length + sentence.length > maxChars) {
      chunks.push(current);
      current = sentence;
    } else {
      current += sentence;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function getBodyParagraphs(body: string) {
  return body
    .split(/\n\s*\n/g)
    .map((item) => cleanCarouselParagraph(item))
    .filter(isMeaningfulCarouselText);
}

function getParagraphKind(paragraph: string) {
  const focusText = paragraph.replace(/^重点[:：]\s*/, "");
  const isFocus = paragraph !== focusText || isCarouselKeyText(paragraph);
  const isHeading =
    !isFocus &&
    paragraph.length <= 28 &&
    (/^([0-9]{1,2}\s|[0-9]{1,2}[、.．]|[一二三四五六七八九十]+[、.．])/.test(paragraph) || !/[。？！.!?，,；;：:]/.test(paragraph));

  return {
    displayText: isFocus ? focusText : paragraph,
    isFocus,
    isHeading,
  };
}

function chunkToParagraph(chunk: CarouselChunk) {
  const text = cleanCarouselText(chunk.text);
  if (chunk.role === "focus") return `重点：${text}`;
  return text;
}

function appendParagraph(body: string, paragraph: string) {
  const trimmed = paragraph.trim();
  if (!trimmed) return body;
  return body ? `${body}\n\n${trimmed}` : trimmed;
}

function measureParagraphHeight(ctx: CanvasRenderingContext2D, paragraph: string, maxWidth: number, density: TextImageDensity) {
  const profile = textImageDensityProfiles[density];
  const { displayText, isFocus, isHeading } = getParagraphKind(paragraph);
  ctx.font = isHeading ? font(700, profile.headingSize) : isFocus ? font(700, profile.focusSize) : font(500, profile.bodySize);
  const textWidth = isFocus ? maxWidth - 46 : isHeading ? maxWidth - 24 : maxWidth;
  const lines = wrapCanvasText(ctx, displayText, textWidth);

  if (isHeading) return { height: lines.length * profile.headingLine + profile.headingAfterGap, lines, displayText, isFocus, isHeading };
  if (isFocus) return { height: lines.length * profile.focusLine + profile.focusPaddingY * 2 + profile.focusAfterGap, lines, displayText, isFocus, isHeading };
  return { height: lines.length * profile.bodyLine + profile.bodyAfterGap, lines, displayText, isFocus, isHeading };
}

function measurePageBodyStart(ctx: CanvasRenderingContext2D, page: TextImagePageDraft, ratioKey: TextImageRatioKey) {
  const density = page.density ?? "regular";
  const profile = textImageDensityProfiles[density];
  const ratio = textImageRatios[ratioKey];
  const left = textImageLayout.left;
  const maxWidth = ratio.width - left * 2;
  let y = textImageLayout.top + 74;

  ctx.textBaseline = "top";
  ctx.font = font(800, profile.titleSize);
  const titleLines = page.title
    .split("\n")
    .flatMap((line) => wrapCanvasText(ctx, line, maxWidth))
    .slice(0, page.focus ? 3 : 4);

  y += titleLines.length * profile.titleLine;

  if (page.focus) {
    y += profile.titleFocusGap;
    ctx.font = font(700, profile.focusSize);
    const focusLines = wrapCanvasText(ctx, page.focus, maxWidth - 56).slice(0, ratioKey === "portrait916" ? 5 : 4);
    y += focusLines.length * profile.focusLine + profile.focusPaddingY * 2 + profile.focusAfterGap;
  } else {
    y += profile.titleBodyGap;
  }

  return y;
}

function measureTextImagePage(ctx: CanvasRenderingContext2D, page: TextImagePageDraft, ratioKey: TextImageRatioKey) {
  const density = page.density ?? "regular";
  const ratio = textImageRatios[ratioKey];
  const maxWidth = ratio.width - textImageLayout.left * 2;
  let y = measurePageBodyStart(ctx, page, ratioKey);

  for (const paragraph of getBodyParagraphs(page.body)) {
    y += measureParagraphHeight(ctx, paragraph, maxWidth, density).height;
  }

  return y;
}

function createMeasureContext(ratioKey: TextImageRatioKey) {
  if (typeof document === "undefined") return null;
  const ratio = textImageRatios[ratioKey];
  const canvas = document.createElement("canvas");
  canvas.width = ratio.width;
  canvas.height = ratio.height;
  return canvas.getContext("2d");
}

function pageFitsCanvas(ctx: CanvasRenderingContext2D, page: TextImagePageDraft, ratioKey: TextImageRatioKey) {
  const ratio = textImageRatios[ratioKey];
  return measureTextImagePage(ctx, page, ratioKey) <= ratio.height - textImageLayout.bottomPadding;
}

function fitPageDensity(ctx: CanvasRenderingContext2D, page: TextImagePageDraft, ratioKey: TextImageRatioKey) {
  const densities: TextImageDensity[] = ["regular", "compact", "dense"];
  for (const density of densities) {
    const candidate = { ...page, density };
    if (pageFitsCanvas(ctx, candidate, ratioKey)) return candidate;
  }
  return { ...page, density: "dense" as const };
}

function splitParagraphForCanvas(paragraph: string, ratioKey: TextImageRatioKey) {
  const chunkSize = ratioKey === "portrait916" ? 170 : 120;
  return splitLongParagraph(paragraph, chunkSize);
}

function createPageFromChunks(title: string, chunks: CarouselChunk[]): TextImagePageDraft {
  const hasContentAfter = (index: number) =>
    chunks.some((otherChunk, otherIndex) => otherIndex !== index && (otherChunk.role === "body" || otherChunk.role === "list" || otherChunk.role === "focus"));
  const explicitFocusIndex = chunks.findIndex((chunk, index) => chunk.role === "focus" && index <= 1 && hasContentAfter(index));
  const fallbackFocusIndex = chunks.findIndex(
    (chunk, index) =>
      chunk.role === "body" &&
      chunk.text.length <= 120 &&
      index <= 1 &&
      hasContentAfter(index)
  );
  const focusIndex = explicitFocusIndex >= 0 ? explicitFocusIndex : fallbackFocusIndex;
  const focus = focusIndex >= 0 ? chunks[focusIndex].text : undefined;
  const body = chunks
    .filter((_, index) => index !== focusIndex)
    .map(chunkToParagraph)
    .reduce((current, paragraph) => appendParagraph(current, paragraph), "");

  return { title, focus, body };
}

function getPageSummaryTitle(page: TextImagePageDraft) {
  const firstHeading = getBodyParagraphs(page.body).find((paragraph) => getParagraphKind(paragraph).isHeading);
  if (firstHeading) return firstHeading;
  if (page.focus) return page.focus;
  const firstParagraph = getBodyParagraphs(page.body)[0];
  if (firstParagraph) return firstParagraph.length > 28 ? `${firstParagraph.slice(0, 28)}...` : firstParagraph;
  return page.title;
}

function removeFirstMatchingHeading(body: string, title: string) {
  const paragraphs = getBodyParagraphs(body);
  const index = paragraphs.findIndex((paragraph) => paragraph === title && getParagraphKind(paragraph).isHeading);
  if (index < 0) return body;
  return paragraphs.filter((_, paragraphIndex) => paragraphIndex !== index).join("\n\n");
}

function createCarouselChunks(blocks: ReturnType<typeof parseArticle>) {
  const chunks: CarouselChunk[] = [];
  for (const block of blocks) {
    if (block.type === "title" || block.type === "image") continue;
    if (block.type === "section") {
      const text = cleanCarouselText(block.text);
      if (text) chunks.push({ role: "heading", text });
      continue;
    }

    const chunk = blockToCarouselChunk(block);
    if (chunk?.text.trim() && isMeaningfulCarouselText(chunk.text)) chunks.push(chunk);
  }

  return chunks;
}

function paginateCarouselChunks(title: string, chunks: CarouselChunk[], ratioKey: TextImageRatioKey) {
  const ctx = createMeasureContext(ratioKey);
  if (!ctx) return [createPageFromChunks(title, chunks)];

  const pages: TextImagePageDraft[] = [];
  let currentChunks: CarouselChunk[] = [];

  const pushCurrent = () => {
    if (!currentChunks.length) return;
    const page = createPageFromChunks(title, currentChunks);
    pages.push(fitPageDensity(ctx, page, ratioKey));
    currentChunks = [];
  };

  const appendChunk = (chunk: CarouselChunk) => {
    const candidateChunks = [...currentChunks, chunk];
    const candidatePage = fitPageDensity(ctx, createPageFromChunks(title, candidateChunks), ratioKey);
    if (pageFitsCanvas(ctx, candidatePage, ratioKey)) {
      currentChunks = candidateChunks;
      return;
    }

    pushCurrent();
    const singlePage = fitPageDensity(ctx, createPageFromChunks(title, [chunk]), ratioKey);
    if (pageFitsCanvas(ctx, singlePage, ratioKey)) {
      currentChunks = [chunk];
      return;
    }

    const parts = splitParagraphForCanvas(chunk.text, ratioKey);
    if (parts.length <= 1 && parts[0] === chunk.text) {
      const hardSize = ratioKey === "portrait916" ? 90 : 64;
      if (chunk.text.length <= hardSize) {
        currentChunks = [chunk];
        return;
      }

      for (let index = 0; index < chunk.text.length; index += hardSize) {
        appendChunk({ ...chunk, text: chunk.text.slice(index, index + hardSize) });
      }
      return;
    }

    for (const part of parts) {
      appendChunk({ ...chunk, text: part });
    }
  };

  for (const chunk of chunks) {
    appendChunk(chunk);
  }

  pushCurrent();
  return pages;
}

function createCarouselPages(sourceText: string, ratioKey: TextImageRatioKey): TextImagePage[] {
  const blocks = parseArticle(sourceText, { mode: "knowledge" });
  const titleBlock = blocks.find((block) => block.type === "title");
  const articleTitle = titleBlock && "text" in titleBlock ? titleBlock.text : "文字轮播图";
  const chunks = createCarouselChunks(blocks);
  const pagesDraft = paginateCarouselChunks(articleTitle, chunks, ratioKey);

  if (pagesDraft.length === 0) {
    pagesDraft.push({ title: articleTitle, body: sourceText.replace(articleTitle, "").trim(), density: "regular" });
  }

  const totalPages = pagesDraft.length;
  const ctx = createMeasureContext(ratioKey);
  return pagesDraft.map((page, index) => {
    const pageTitle = index === 0 ? page.title : getPageSummaryTitle(page);
    const adjustedPage = {
      ...page,
      title: pageTitle,
      body: index === 0 ? page.body : removeFirstMatchingHeading(page.body, pageTitle),
    };
    const fittedPage = ctx ? fitPageDensity(ctx, adjustedPage, ratioKey) : adjustedPage;
    return {
      ...fittedPage,
      density: fittedPage.density ?? "regular",
      pageNumber: index + 1,
      totalPages,
    };
  });
}

function drawPageIndicator(ctx: CanvasRenderingContext2D, pageNumber: number, totalPages: number, width: number, height: number, color: string) {
  if (totalPages > 12) {
    ctx.font = font(600, 28);
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.fillText(`${String(pageNumber).padStart(2, "0")} / ${String(totalPages).padStart(2, "0")}`, width / 2, height - 72);
    ctx.textAlign = "left";
    return;
  }

  const dotGap = 24;
  const startX = width / 2 - ((totalPages - 1) * dotGap) / 2;
  const dotY = height - 62;
  for (let index = 0; index < totalPages; index += 1) {
    ctx.beginPath();
    ctx.fillStyle = index + 1 === pageNumber ? "#FFFFFF" : color;
    ctx.arc(startX + index * dotGap, dotY, 7, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTextImage(canvas: HTMLCanvasElement, page: TextImagePage, presetKey: TextImagePresetKey, ratioKey: TextImageRatioKey) {
  const preset = textImagePresets[presetKey];
  const ratio = textImageRatios[ratioKey];
  const density = page.density ?? "regular";
  const profile = textImageDensityProfiles[density];
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvas.width = ratio.width;
  canvas.height = ratio.height;

  ctx.fillStyle = preset.background;
  ctx.fillRect(0, 0, ratio.width, ratio.height);

  const left = textImageLayout.left;
  const maxWidth = ratio.width - left * 2;
  let y = textImageLayout.top;

  ctx.fillStyle = preset.rule;
  ctx.fillRect(left, y, maxWidth, 4);

  y += 74;
  ctx.textBaseline = "top";
  ctx.font = font(800, profile.titleSize);
  const titleLines = page.title
    .split("\n")
    .flatMap((line) => wrapCanvasText(ctx, line, maxWidth))
    .slice(0, page.focus ? 3 : 4);

  for (const line of titleLines) {
    const textWidth = Math.min(ctx.measureText(line).width + 16, maxWidth);
    ctx.fillStyle = preset.highlight;
    ctx.fillRect(left - 4, y + profile.titleHighlightY, textWidth, profile.titleHighlightHeight);
    ctx.fillStyle = preset.title;
    ctx.fillText(line, left, y);
    y += profile.titleLine;
  }

  if (page.focus) {
    y += profile.titleFocusGap;
    ctx.font = font(700, profile.focusSize);
    const focusLines = wrapCanvasText(ctx, page.focus, maxWidth - 56).slice(0, ratioKey === "portrait916" ? 5 : 4);
    const focusBoxHeight = focusLines.length * profile.focusLine + profile.focusPaddingY * 2;
    drawRoundRect(ctx, left, y, maxWidth, focusBoxHeight, 18);
    ctx.fillStyle = preset.highlight;
    ctx.fill();
    ctx.fillStyle = preset.title;
    ctx.fillRect(left + 24, y + profile.focusPaddingY, 7, Math.max(34, focusBoxHeight - profile.focusPaddingY * 2));

    let focusY = y + profile.focusPaddingY;
    for (const line of focusLines) {
      ctx.fillText(line, left + 52, focusY);
      focusY += profile.focusLine;
    }

    y += focusBoxHeight + profile.focusAfterGap;
  } else {
    y += profile.titleBodyGap;
  }

  const paragraphs = getBodyParagraphs(page.body);

  for (const paragraph of paragraphs) {
    const measured = measureParagraphHeight(ctx, paragraph, maxWidth, density);
    const lineHeight = measured.isHeading ? profile.headingLine : measured.isFocus ? profile.focusLine : profile.bodyLine;

    if (y + measured.height > ratio.height - textImageLayout.bottomPadding) break;

    if (measured.isHeading) {
      ctx.fillStyle = preset.title;
      ctx.fillRect(left, y + 5, 7, Math.max(46, measured.lines.length * lineHeight - 12));
      for (const line of measured.lines) {
        ctx.fillText(line, left + 24, y);
        y += lineHeight;
      }
      y += profile.headingAfterGap;
      continue;
    }

    if (measured.isFocus) {
      const boxHeight = measured.height - profile.focusAfterGap;
      drawRoundRect(ctx, left, y, maxWidth, boxHeight, 16);
      ctx.fillStyle = preset.highlight;
      ctx.fill();
      ctx.fillStyle = preset.title;
      ctx.fillRect(left + 22, y + 22, 6, Math.max(34, boxHeight - 44));
      y += profile.focusPaddingY;
      for (const line of measured.lines) {
        ctx.fillText(line, left + 44, y);
        y += lineHeight;
      }
      y += profile.focusAfterGap;
      continue;
    }

    ctx.fillStyle = preset.body;
    for (const line of measured.lines) {
      ctx.fillText(line, left, y);
      y += lineHeight;
    }

    y += profile.bodyAfterGap;
  }

  drawPageIndicator(ctx, page.pageNumber, page.totalPages, ratio.width, ratio.height, preset.dots);
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("图片生成失败"));
    }, "image/png");
  });
}

function TextImageGenerator({ articleText }: { articleText: string }) {
  const [sourceText, setSourceText] = useState(articleText);
  const [presetKey, setPresetKey] = useState<TextImagePresetKey>("warmBrown");
  const [ratioKey, setRatioKey] = useState<TextImageRatioKey>("portrait34");
  const [selectedPageIndex, setSelectedPageIndex] = useState(0);
  const [fileName, setFileName] = useState("文字卡片");
  const [copiedImage, setCopiedImage] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pages = useMemo(() => createCarouselPages(sourceText, ratioKey), [ratioKey, sourceText]);
  const safeSelectedPageIndex = Math.min(selectedPageIndex, Math.max(pages.length - 1, 0));
  const selectedPage = pages[safeSelectedPageIndex] ?? pages[0];

  const renderImage = useCallback(() => {
    if (!canvasRef.current || !selectedPage) return;
    drawTextImage(canvasRef.current, selectedPage, presetKey, ratioKey);
  }, [presetKey, ratioKey, selectedPage]);

  useEffect(() => {
    renderImage();
  }, [renderImage]);

  const createPageBlob = useCallback(
    async (page: TextImagePage) => {
      const canvas = document.createElement("canvas");
      drawTextImage(canvas, page, presetKey, ratioKey);
      return canvasToBlob(canvas);
    },
    [presetKey, ratioKey]
  );

  const handleDownloadImage = useCallback(async () => {
    if (!selectedPage) return;

    renderImage();
    const blob = await createPageBlob(selectedPage);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName.trim() || "text-image"}-${String(selectedPage.pageNumber).padStart(2, "0")}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, [createPageBlob, fileName, renderImage, selectedPage]);

  const handleDownloadAllImages = useCallback(async () => {
    for (const page of pages) {
      const blob = await createPageBlob(page);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileName.trim() || "text-image"}-${String(page.pageNumber).padStart(2, "0")}.png`;
      a.click();
      URL.revokeObjectURL(url);
      await new Promise((resolve) => window.setTimeout(resolve, 80));
    }
  }, [createPageBlob, fileName, pages]);

  const handleCopyImage = useCallback(async () => {
    if (!selectedPage) return;

    renderImage();
    const blob = await createPageBlob(selectedPage);
    if ("ClipboardItem" in window && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "image/png": blob,
        }),
      ]);
      setCopiedImage(true);
      setTimeout(() => setCopiedImage(false), 1500);
      return;
    }

    await handleDownloadImage();
  }, [createPageBlob, handleDownloadImage, renderImage, selectedPage]);

  const resetTextImage = () => {
    setSourceText(articleText);
    setPresetKey("warmBrown");
    setRatioKey("portrait34");
    setSelectedPageIndex(0);
    setFileName("文字卡片");
  };

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ImageIcon className="h-5 w-5" />
          文章轮播图生成
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label>轮播图源文案</Label>
                <Button onClick={() => setSourceText(articleText)} variant="outline" className="h-8 rounded-xl px-3 text-xs">
                  使用当前文章
                </Button>
              </div>
              <Textarea value={sourceText} onChange={(event) => setSourceText(event.target.value)} className="min-h-80 rounded-2xl text-sm leading-7" />
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>视觉风格</Label>
                <Select value={presetKey} onValueChange={(value) => setPresetKey(value as TextImagePresetKey)}>
                  <SelectTrigger className="rounded-xl">
                    <span>{textImagePresets[presetKey].name}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(textImagePresets).map(([key, preset]) => (
                      <SelectItem key={key} value={key}>
                        {preset.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>图片比例</Label>
                <Select value={ratioKey} onValueChange={(value) => setRatioKey(value as TextImageRatioKey)}>
                  <SelectTrigger className="rounded-xl">
                    <span>{textImageRatios[ratioKey].name}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(textImageRatios).map(([key, ratio]) => (
                      <SelectItem key={key} value={key}>
                        {ratio.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>文件名</Label>
                <Input value={fileName} onChange={(event) => setFileName(event.target.value)} className="rounded-xl" />
              </div>

              <div className="rounded-2xl bg-slate-100 p-4 text-xs leading-6 text-slate-600">
                已自动拆成 <span className="font-semibold text-slate-900">{pages.length}</span> 张，短小节会合并，超长内容才继续分页。
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleCopyImage} className="rounded-xl">
                <Copy className="mr-2 h-4 w-4" />
                {copiedImage ? "已复制图片" : "复制PNG"}
              </Button>
              <Button onClick={handleDownloadImage} variant="outline" className="rounded-xl">
                <FileDown className="mr-2 h-4 w-4" />
                下载当前页
              </Button>
              <Button onClick={handleDownloadAllImages} variant="outline" className="rounded-xl">
                <FileDown className="mr-2 h-4 w-4" />
                下载全部
              </Button>
              <Button onClick={() => setSelectedPageIndex(0)} variant="outline" className="rounded-xl">
                第1页
              </Button>
              <Button onClick={resetTextImage} variant="outline" className="rounded-xl">
                <RefreshCcw className="mr-2 h-4 w-4" />
                重置轮播图
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {pages.map((page, index) => (
                <button
                  key={`${page.pageNumber}-${page.title}`}
                  onClick={() => setSelectedPageIndex(index)}
                  className={`rounded-xl border p-3 text-left text-xs leading-5 transition ${
                    safeSelectedPageIndex === index ? "border-slate-900 bg-white shadow-sm" : "border-slate-200 bg-slate-50 hover:bg-white"
                  }`}
                >
                  <div className="font-semibold text-slate-900">{String(page.pageNumber).padStart(2, "0")}</div>
                  <div className="mt-1 line-clamp-2 text-slate-600">{page.title}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col items-center gap-3 rounded-2xl border bg-slate-100 p-4">
            <canvas ref={canvasRef} className="h-auto w-full max-w-[360px] rounded-2xl bg-white shadow-sm" />
            <div className="text-xs text-slate-500">
              {selectedPage ? `${selectedPage.pageNumber} / ${selectedPage.totalPages}` : "0 / 0"} · {textImageRatios[ratioKey].width}×{textImageRatios[ratioKey].height}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EditablePreview({ html, onHtmlChange }: { html: string; onHtmlChange: (html: string) => void }) {
  const editableRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = editableRef.current;
    if (!element) return;
    if (element.innerHTML !== html) {
      element.innerHTML = html;
    }
  }, [html]);

  const syncHtml = useCallback(() => {
    onHtmlChange(editableRef.current?.innerHTML ?? html);
  }, [html, onHtmlChange]);

  return (
    <div className="min-h-[620px] rounded-2xl border border-slate-200 bg-white p-5 md:p-7">
      <div className="mb-4 flex items-center justify-between rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        <span>可直接点击正文修改；复制和导出会使用修改后的内容。</span>
        <span className="rounded-full bg-white px-2 py-1 font-medium text-slate-700">编辑中</span>
      </div>
      <div
        ref={editableRef}
        contentEditable="true"
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        tabIndex={0}
        spellCheck={false}
        onInput={syncHtml}
        onBlur={syncHtml}
        className="min-h-[560px] cursor-text rounded-xl outline-none focus:ring-2 focus:ring-slate-900/10"
      />
    </div>
  );
}

export default function WechatArticleFormatterApp() {
  const [input, setInput] = useState(defaultArticle);
  const [templateKey, setTemplateKey] = useState<TemplateKey>("zhenyiKnowledgeMinimal");
  const [parseMode, setParseMode] = useState<ArticleParseMode>("narrative");
  const [stylePanelOpen, setStylePanelOpen] = useState(true);
  const [copiedRich, setCopiedRich] = useState(false);
  const [copiedHtml, setCopiedHtml] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const template = styleTemplates[templateKey];
  const blocks = useMemo(() => parseArticle(input, { mode: parseMode }), [input, parseMode]);
  const html = useMemo(() => renderWechatHtml(blocks, template), [blocks, template]);
  const [editableHtmlState, setEditableHtmlState] = useState({ sourceHtml: html, outputHtml: html });
  const editableHtml = editableHtmlState.sourceHtml === html ? editableHtmlState.outputHtml : html;

  const handlePreviewHtmlChange = useCallback((nextHtml: string) => {
    setEditableHtmlState({ sourceHtml: html, outputHtml: nextHtml });
  }, [html]);

  const handleTemplateChange = (value: string) => {
    const nextTemplateKey = value as TemplateKey;
    setTemplateKey(nextTemplateKey);
    setParseMode(styleTemplates[nextTemplateKey].visual.defaultParseMode ?? "narrative");
  };

  const handleCopyRichText = async () => {
    try {
      await copyRichText(editableHtml);
      setCopiedRich(true);
      setTimeout(() => setCopiedRich(false), 1500);
    } catch (error) {
      console.error(error);
    }
  };

  const handleCopyHtml = async () => {
    try {
      await navigator.clipboard.writeText(editableHtml);
      setCopiedHtml(true);
      setTimeout(() => setCopiedHtml(false), 1500);
    } catch (error) {
      console.error(error);
    }
  };

  const handleImportMarkdown = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setInput(text);
    event.target.value = "";
  };

  const handleExportHtml = () => {
    const blob = new Blob([editableHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "wechat-article.html";
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setInput(defaultArticle);
    setTemplateKey("zhenyiKnowledgeMinimal");
    setParseMode("narrative");
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">微信公众号文章自动排版器</h1>
            <p className="mt-2 text-sm text-slate-600">纯前端排版工具：输入文章，选择风格，一键复制到公众号编辑器。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleCopyRichText} className="rounded-xl">
              <Copy className="mr-2 h-4 w-4" />
              {copiedRich ? "已复制，可粘贴" : "复制到公众号编辑器"}
            </Button>
            <Button onClick={handleCopyHtml} variant="outline" className="rounded-xl">
              <Code2 className="mr-2 h-4 w-4" />
              {copiedHtml ? "已复制源码" : "复制HTML源码"}
            </Button>
          </div>
        </div>

        <Tabs defaultValue="formatter" className="w-full">
          <TabsList className="mb-6 grid h-auto w-full grid-cols-2 rounded-2xl bg-slate-200/70 p-1 md:w-[420px]">
            <TabsTrigger value="formatter" className="rounded-xl">
              公众号排版
            </TabsTrigger>
            <TabsTrigger value="carousel" className="rounded-xl">
              轮播图生成
            </TabsTrigger>
          </TabsList>

          <TabsContent value="formatter" className="space-y-6">
            <Card className="rounded-2xl shadow-sm">
              <CardHeader className="gap-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle className="text-lg">风格选择</CardTitle>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>当前：{template.name}</span>
                      <span>适合：{template.audience}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="hidden gap-2 md:flex">
                      {template.palette.map((color) => (
                        <span key={color} className="h-4 w-10 rounded-full border border-slate-200" style={{ backgroundColor: color }} />
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl"
                      aria-expanded={stylePanelOpen}
                      onClick={() => setStylePanelOpen((open) => !open)}
                    >
                      <ChevronDown className={`mr-2 h-4 w-4 transition-transform ${stylePanelOpen ? "rotate-180" : ""}`} />
                      {stylePanelOpen ? "收起" : "展开"}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {stylePanelOpen && (
                <CardContent className="space-y-5">
                  <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
                    <div className="space-y-2">
                      <Label>模板风格</Label>
                      <Select value={templateKey} onValueChange={handleTemplateChange}>
                        <SelectTrigger className="rounded-xl">
                          <span>{template.name}</span>
                        </SelectTrigger>
                        <SelectContent>
                          {templateList.map((item) => (
                            <SelectItem key={item.key} value={item.key}>
                              {item.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs leading-6 text-slate-500">{template.description}</p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{template.name}</div>
                          <div className="mt-1 text-xs leading-6 text-slate-500">适合：{template.audience}</div>
                        </div>
                        <div className="flex gap-2">
                          {template.palette.map((color) => (
                            <span key={color} className="h-5 w-12 rounded-full border border-slate-200" style={{ backgroundColor: color }} />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {templateList.map((item) => (
                      <button
                        key={item.key}
                        onClick={() => handleTemplateChange(item.key)}
                        className={`rounded-2xl border p-4 text-left transition ${
                          templateKey === item.key ? "border-slate-900 bg-white shadow-sm" : "border-slate-200 bg-slate-50 hover:bg-white"
                        }`}
                      >
                        <div className="text-sm font-semibold text-slate-900">{item.name}</div>
                        <div className="mt-2 line-clamp-2 text-xs leading-6 text-slate-500">{item.description}</div>
                        <div className="mt-3 flex gap-2">
                          {item.palette.map((color) => (
                            <span key={color} className="h-4 w-10 rounded-full border border-slate-200" style={{ backgroundColor: color }} />
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <Card className="rounded-2xl shadow-sm xl:col-span-1">
                <CardHeader>
                  <CardTitle className="text-lg">排版设置</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <Label>内容分层</Label>
                    <Select value={parseMode} onValueChange={(value) => setParseMode(value as ArticleParseMode)}>
                      <SelectTrigger className="rounded-xl">
                        <span>{parseModeOptions[parseMode].name}</span>
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(parseModeOptions).map(([key, item]) => (
                          <SelectItem key={key} value={key}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs leading-6 text-slate-500">{parseModeOptions[parseMode].description}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="rounded-xl">
                      <Upload className="mr-2 h-4 w-4" />
                      导入
                    </Button>
                    <Button onClick={handleExportHtml} variant="outline" className="rounded-xl">
                      <FileDown className="mr-2 h-4 w-4" />
                      导出
                    </Button>
                  </div>

                  <input ref={fileInputRef} type="file" accept=".md,.markdown,.txt" className="hidden" onChange={handleImportMarkdown} />

                  <Button onClick={reset} variant="outline" className="w-full rounded-xl">
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    重置示例
                  </Button>

                  <div className="rounded-2xl bg-slate-100 p-4 text-xs leading-6 text-slate-600">
                    图片仅做占位排版；识别“配图：”“图片：”“此处插入：”等写法，不做图片生成。
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl shadow-sm xl:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Wand2 className="h-5 w-5" />
                    内容输入与生成结果
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="preview" className="w-full">
                    <TabsList className="mb-4 grid h-auto w-full grid-cols-2 rounded-xl md:grid-cols-4">
                      <TabsTrigger value="preview">效果预览</TabsTrigger>
                      <TabsTrigger value="input">输入文章</TabsTrigger>
                      <TabsTrigger value="structure">结构识别</TabsTrigger>
                      <TabsTrigger value="html">HTML源码</TabsTrigger>
                    </TabsList>

                    <TabsContent value="preview">
                      <EditablePreview html={html} onHtmlChange={handlePreviewHtmlChange} />
                    </TabsContent>

                    <TabsContent value="input" className="space-y-3">
                      <Textarea
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        className="min-h-[620px] rounded-2xl font-mono text-sm"
                        placeholder="把你的文章内容或 Markdown 粘贴到这里"
                      />
                    </TabsContent>

                    <TabsContent value="structure">
                      <div className="min-h-[620px] rounded-2xl border bg-white p-4">
                        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                          <Metric label="小节" value={blocks.filter((block) => block.type === "section").length} />
                          <Metric label="图片占位" value={blocks.filter((block) => block.type === "image").length} />
                          <Metric label="列表" value={blocks.filter((block) => block.type === "list").length} />
                          <Metric label="金句/CTA" value={blocks.filter((block) => block.type === "golden" || block.type === "cta").length} />
                        </div>

                        <div className="space-y-3">
                          {blocks.map((block, index) => (
                            <div key={`${block.type}-${index}`} className="rounded-2xl border border-slate-200 p-4">
                              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500">
                                {block.type === "image" && <ImageIcon className="h-4 w-4" />}
                                <span>{blockName[block.type]}</span>
                              </div>
                              <div className="text-sm leading-7 text-slate-800">
                                {block.type === "list"
                                  ? block.items.join(" / ")
                                  : block.type === "card"
                                    ? `${block.title || ""} ${block.body}`
                                    : "text" in block
                                      ? block.text
                                      : ""}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="html">
                      <Textarea readOnly value={editableHtml} className="min-h-[620px] rounded-2xl font-mono text-xs" />
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="carousel">
            <TextImageGenerator articleText={input} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
    </div>
  );
}
