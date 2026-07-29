"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Bold,
  Check,
  ChevronDown,
  Copy,
  Code2,
  FileDown,
  Image as ImageIcon,
  ImagePlus,
  Italic,
  Layers,
  Pencil,
  Redo2,
  RefreshCcw,
  Replace,
  SendToBack,
  BringToFront,
  Trash2,
  Underline,
  Undo2,
  Upload,
  Wand2,
} from "lucide-react";
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
  dark: {
    name: "黑底白字卡",
    background: "#0B0B0C",
    title: "#FFFFFF",
    body: "#E5E7EB",
    rule: "#3F3F46",
    highlight: "#242427",
    dots: "#52525B",
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

type TextImageLayoutSettings = {
  lineSpacing: number;
  paragraphSpacing: number;
  titleSpacing: number;
  verticalPadding: number;
};

type TextImageSticker = {
  id: string;
  name: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
};

const textImageDensityOptions: Record<TextImageDensity, string> = {
  regular: "舒展",
  compact: "紧凑",
  dense: "密集",
};

const defaultTextImageLayoutSettings: TextImageLayoutSettings = {
  lineSpacing: 100,
  paragraphSpacing: 100,
  titleSpacing: 100,
  verticalPadding: 100,
};

type TextImagePage = {
  title: string;
  focus?: string;
  body: string;
  density: TextImageDensity;
  fontScale?: number;
  layout?: TextImageLayoutSettings;
  stickers?: TextImageSticker[];
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

const supportedImageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const subscribeToClientReady = () => () => undefined;
const getClientReadySnapshot = () => true;
const getServerReadySnapshot = () => false;

function createLocalImageId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function readImageFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    if (!supportedImageTypes.has(file.type)) {
      reject(new Error("仅支持 PNG、JPG 和 WebP 图片"));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      reject(new Error("单张图片不能超过 10MB"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}

const localImageCache = new Map<string, Promise<HTMLImageElement>>();

function loadLocalImage(src: string) {
  const cached = localImageCache.get(src);
  if (cached) return cached;

  const pending = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片加载失败"));
    image.src = src;
  });
  localImageCache.set(src, pending);
  return pending;
}

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

function scaleTextImageSpacing(value: number, percentage: number) {
  return Math.round((value * percentage) / 100);
}

function getTextImageLayoutSettings(page: TextImagePageDraft | TextImagePage) {
  return { ...defaultTextImageLayoutSettings, ...page.layout };
}

function getTextImageProfile(page: TextImagePageDraft | TextImagePage) {
  const base = textImageDensityProfiles[page.density ?? "regular"];
  const layout = getTextImageLayoutSettings(page);
  const fontScale = page.fontScale ?? 1;
  const scaleFont = (value: number) => Math.max(1, Math.round(value * fontScale));
  const scaleLine = (value: number) => scaleTextImageSpacing(scaleFont(value), layout.lineSpacing);
  const scaleGap = (value: number, spacing: number) => scaleTextImageSpacing(scaleFont(value), spacing);
  return {
    ...base,
    titleSize: scaleFont(base.titleSize),
    titleLine: scaleLine(base.titleLine),
    titleHighlightY: scaleFont(base.titleHighlightY),
    titleHighlightHeight: scaleFont(base.titleHighlightHeight),
    titleFocusGap: scaleGap(base.titleFocusGap, layout.titleSpacing),
    titleBodyGap: scaleGap(base.titleBodyGap, layout.titleSpacing),
    focusSize: scaleFont(base.focusSize),
    focusLine: scaleLine(base.focusLine),
    focusPaddingY: scaleFont(base.focusPaddingY),
    focusAfterGap: scaleGap(base.focusAfterGap, layout.paragraphSpacing),
    headingSize: scaleFont(base.headingSize),
    headingLine: scaleLine(base.headingLine),
    headingAfterGap: scaleGap(base.headingAfterGap, layout.paragraphSpacing),
    bodySize: scaleFont(base.bodySize),
    bodyLine: scaleLine(base.bodyLine),
    bodyAfterGap: scaleGap(base.bodyAfterGap, layout.paragraphSpacing),
  };
}

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
  const sourceLines = text.trim().split("\n");

  for (const sourceLine of sourceLines) {
    let line = "";
    for (const char of Array.from(sourceLine.trim())) {
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
  }

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
    t.length <= 90 &&
    (/^(核心判断|关键判断|关键风险|核心问题|关键结论|当前问题|改造目标|解决方案|边界|行动建议|下一步|结果)[:：]/.test(t) ||
      /不是.+而是|最怕的是|必须先|本质是|真正的.+是|不要.+而要/.test(t))
  );
}

function blockToCarouselChunk(block: ReturnType<typeof parseArticle>[number]): CarouselChunk | null {
  switch (block.type) {
    case "list":
      return { role: "list", text: block.items.map((item) => `- ${cleanCarouselParagraph(item)}`).join("\n\n") };
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
      return { role: "body", text: cleanCarouselText(block.text) };
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
  const isFocus = paragraph !== focusText;
  const isHeading =
    !isFocus &&
    !/^[-•]\s*/.test(paragraph) &&
    paragraph.length <= 28 &&
    (/^([0-9]{1,2}\s|[0-9]{1,2}[、.．]|[一二三四五六七八九十]+[、.．])/.test(paragraph) || !/[。？！.!?，,；;：:]/.test(paragraph));

  return {
    displayText: isFocus ? focusText : paragraph,
    isFocus,
    isHeading,
  };
}

function chunkToParagraph(chunk: CarouselChunk) {
  return cleanCarouselText(chunk.text);
}

function appendParagraph(body: string, paragraph: string) {
  const trimmed = paragraph.trim();
  if (!trimmed) return body;
  return body ? `${body}\n\n${trimmed}` : trimmed;
}

function measureParagraphHeight(ctx: CanvasRenderingContext2D, paragraph: string, maxWidth: number, page: TextImagePageDraft | TextImagePage) {
  const profile = getTextImageProfile(page);
  const { displayText, isFocus, isHeading } = getParagraphKind(paragraph);
  ctx.font = isHeading ? font(700, profile.headingSize) : isFocus ? font(700, profile.focusSize) : font(500, profile.bodySize);
  const textWidth = isFocus ? maxWidth - 46 : isHeading ? maxWidth - 24 : maxWidth;
  const lines = wrapCanvasText(ctx, displayText, textWidth);

  if (isHeading) return { height: lines.length * profile.headingLine + profile.headingAfterGap, lines, displayText, isFocus, isHeading };
  if (isFocus) return { height: lines.length * profile.focusLine + profile.focusPaddingY * 2 + profile.focusAfterGap, lines, displayText, isFocus, isHeading };
  return { height: lines.length * profile.bodyLine + profile.bodyAfterGap, lines, displayText, isFocus, isHeading };
}

function measurePageBodyStart(ctx: CanvasRenderingContext2D, page: TextImagePageDraft, ratioKey: TextImageRatioKey) {
  const profile = getTextImageProfile(page);
  const layout = getTextImageLayoutSettings(page);
  const ratio = textImageRatios[ratioKey];
  const left = textImageLayout.left;
  const maxWidth = ratio.width - left * 2;
  let y = scaleTextImageSpacing(textImageLayout.top, layout.verticalPadding) + 74;

  ctx.textBaseline = "top";
  ctx.font = font(800, profile.titleSize);
  const titleLines = page.title
    .split("\n")
    .flatMap((line) => wrapCanvasText(ctx, line, maxWidth));

  y += titleLines.length * profile.titleLine;

  if (page.focus) {
    y += profile.titleFocusGap;
    ctx.font = font(700, profile.focusSize);
    const focusLines = wrapCanvasText(ctx, page.focus, maxWidth - 56);
    y += focusLines.length * profile.focusLine + profile.focusPaddingY * 2 + profile.focusAfterGap;
  } else {
    y += profile.titleBodyGap;
  }

  return y;
}

function measureTextImagePage(ctx: CanvasRenderingContext2D, page: TextImagePageDraft, ratioKey: TextImageRatioKey) {
  const ratio = textImageRatios[ratioKey];
  const maxWidth = ratio.width - textImageLayout.left * 2;
  let y = measurePageBodyStart(ctx, page, ratioKey);

  for (const paragraph of getBodyParagraphs(page.body)) {
    y += measureParagraphHeight(ctx, paragraph, maxWidth, page).height;
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
  const layout = getTextImageLayoutSettings(page);
  const bottomPadding = scaleTextImageSpacing(textImageLayout.bottomPadding, layout.verticalPadding);
  return measureTextImagePage(ctx, page, ratioKey) <= ratio.height - bottomPadding;
}

function fitPageFontScale(ctx: CanvasRenderingContext2D, page: TextImagePageDraft, ratioKey: TextImageRatioKey) {
  const basePage = { ...page, fontScale: 1 };
  if (pageFitsCanvas(ctx, basePage, ratioKey)) return basePage;

  const minimumScale = 0.62;
  const smallestPage = { ...basePage, fontScale: minimumScale };
  if (!pageFitsCanvas(ctx, smallestPage, ratioKey)) return smallestPage;

  let low = minimumScale;
  let high = 1;
  for (let index = 0; index < 16; index += 1) {
    const middle = (low + high) / 2;
    if (pageFitsCanvas(ctx, { ...basePage, fontScale: middle }, ratioKey)) low = middle;
    else high = middle;
  }

  return { ...basePage, fontScale: Math.round(low * 100) / 100 };
}

function fitPageDensity(ctx: CanvasRenderingContext2D, page: TextImagePageDraft, ratioKey: TextImageRatioKey) {
  const densities: TextImageDensity[] = page.density ? [page.density] : ["regular", "compact", "dense"];
  for (const density of densities) {
    const candidate = { ...page, density };
    const fitted = fitPageFontScale(ctx, candidate, ratioKey);
    if (fitted.fontScale === 1 || density === densities[densities.length - 1]) return fitted;
  }
  return fitPageFontScale(ctx, { ...page, density: "dense" }, ratioKey);
}

function splitParagraphForCanvas(paragraph: string, ratioKey: TextImageRatioKey) {
  const chunkSize = ratioKey === "portrait916" ? 170 : 120;
  return splitLongParagraph(paragraph, chunkSize);
}

function createPageFromChunks(title: string, chunks: CarouselChunk[]): TextImagePageDraft {
  const normalizedTitle = cleanCarouselParagraph(title).replace(/[…。！？!?：:，,；;\s]/g, "");
  const duplicatesTitle = (text: string) => {
    const normalizedText = cleanCarouselParagraph(text).replace(/[…。！？!?：:，,；;\s]/g, "");
    return normalizedText.startsWith(normalizedTitle) || normalizedTitle.startsWith(normalizedText);
  };
  const explicitFocusIndex = chunks.findIndex((chunk) => chunk.role === "focus" && !duplicatesTitle(chunk.text));
  const keyTextIndex = chunks.findIndex((chunk) => {
    if (chunk.role !== "body" || !isCarouselKeyText(chunk.text)) return false;
    return !duplicatesTitle(chunk.text);
  });
  const focusIndex = explicitFocusIndex >= 0 ? explicitFocusIndex : keyTextIndex;
  const focus = focusIndex >= 0 ? chunks[focusIndex].text : undefined;
  const body = chunks
    .filter((_, index) => index !== focusIndex)
    .map(chunkToParagraph)
    .reduce((current, paragraph) => appendParagraph(current, paragraph), "");

  return { title, focus, body };
}

function deriveCarouselTitle(text: string, keyText?: string) {
  const firstLine = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => cleanCarouselText(line))
    .find(Boolean);

  if (!firstLine) return "文章重点整理";
  if (/^(上一篇|上一次|前面|这件事|最近)/.test(firstLine) && keyText) return derivePageTitle(keyText);
  const clause = firstLine.split(/[：:。！？!?]/)[0]?.trim() || firstLine;
  if (clause.length <= 32) return clause;
  return `${clause.slice(0, 30)}…`;
}

function derivePageTitle(text: string) {
  const cleaned = cleanCarouselParagraph(text).replace(/^(所以|但是|同时|然后|后来|更现实的是|这件事做完以后)[，,：:]?/, "");
  const colonParts = cleaned.split(/[：:]/);
  const titleSource = colonParts.length > 1 && /问题|发现|想法|判断|结论|体会/.test(colonParts[0]) ? colonParts.slice(1).join("：") : cleaned;
  const contrast = titleSource.match(/^(.{2,18}?)不是.+而是(.+?)[。！？!?]?$/);
  if (contrast) {
    const subject = contrast[1].trim();
    const conclusion = contrast[2].trim();
    const summary = /件事$/.test(subject) ? `${subject}应该先${conclusion}` : `${subject}真正的问题是${conclusion}`;
    return summary.length <= 36 ? summary : `${summary.slice(0, 34)}…`;
  }
  const clause = titleSource.split(/[。！？!?；;，,]/)[0]?.trim() || titleSource;
  if (clause.length <= 24) return clause;
  return `${clause.slice(0, 22)}…`;
}

function getExplicitCarouselTitle(sourceText: string, blocks: ReturnType<typeof parseArticle>) {
  const firstRawLine = sourceText
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstRawLine) return undefined;

  const markdownTitle = firstRawLine.match(/^#\s+(.+)$/);
  if (markdownTitle) return cleanCarouselText(markdownTitle[1]);

  const titleBlock = blocks.find((block) => block.type === "title");
  if (!titleBlock || !("text" in titleBlock)) return undefined;
  const cleaned = cleanCarouselText(titleBlock.text);
  const sentenceMarks = cleaned.match(/[。！？!?；;]/g)?.length ?? 0;
  return sentenceMarks === 0 && cleaned.length <= 64 ? cleaned : undefined;
}

function getPageSummaryTitle(page: TextImagePageDraft) {
  const firstHeading = getBodyParagraphs(page.body).find((paragraph) => getParagraphKind(paragraph).isHeading);
  if (firstHeading) return firstHeading;
  const firstParagraph = getBodyParagraphs(page.body)[0];
  if (firstParagraph) return derivePageTitle(firstParagraph);
  if (page.focus) return derivePageTitle(page.focus);
  return page.title;
}

function removeFirstMatchingHeading(body: string, title: string) {
  const paragraphs = getBodyParagraphs(body);
  const index = paragraphs.findIndex((paragraph) => paragraph === title && getParagraphKind(paragraph).isHeading);
  if (index < 0) return body;
  return paragraphs.filter((_, paragraphIndex) => paragraphIndex !== index).join("\n\n");
}

function createCarouselChunks(blocks: ReturnType<typeof parseArticle>, includeParsedTitleAsBody = false) {
  const chunks: CarouselChunk[] = [];
  for (const block of blocks) {
    if (block.type === "title") {
      if (includeParsedTitleAsBody) chunks.push({ role: "body", text: cleanCarouselText(block.text) });
      continue;
    }
    if (block.type === "image") continue;
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
    const candidatePage = { ...createPageFromChunks(title, candidateChunks), density: "compact" as const };
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
  const explicitTitle = getExplicitCarouselTitle(sourceText, blocks);
  const chunks = createCarouselChunks(blocks, !explicitTitle);
  const keyText = chunks.find(
    (chunk) =>
      (chunk.role === "focus" || (chunk.role === "body" && isCarouselKeyText(chunk.text))) &&
      !/^(上一篇|上一次|前面|最近)/.test(cleanCarouselParagraph(chunk.text)),
  )?.text;
  const articleTitle = explicitTitle ?? deriveCarouselTitle(sourceText, keyText);
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

function drawPageIndicator(
  ctx: CanvasRenderingContext2D,
  pageNumber: number,
  totalPages: number,
  width: number,
  height: number,
  activeColor: string,
  inactiveColor: string,
) {
  if (totalPages > 12) {
    ctx.font = font(600, 28);
    ctx.fillStyle = activeColor;
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
    ctx.fillStyle = index + 1 === pageNumber ? activeColor : inactiveColor;
    ctx.arc(startX + index * dotGap, dotY, 7, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSticker(
  ctx: CanvasRenderingContext2D,
  sticker: TextImageSticker,
  image: HTMLImageElement,
  selected: boolean,
) {
  const centerX = sticker.x + sticker.width / 2;
  const centerY = sticker.y + sticker.height / 2;
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate((sticker.rotation * Math.PI) / 180);
  ctx.globalAlpha = sticker.opacity / 100;
  ctx.drawImage(image, -sticker.width / 2, -sticker.height / 2, sticker.width, sticker.height);
  ctx.globalAlpha = 1;

  if (selected) {
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 4;
    ctx.setLineDash([12, 8]);
    ctx.strokeRect(-sticker.width / 2, -sticker.height / 2, sticker.width, sticker.height);
    ctx.setLineDash([]);
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#0f172a";
    for (const [x, y] of [
      [-sticker.width / 2, -sticker.height / 2],
      [sticker.width / 2, -sticker.height / 2],
      [-sticker.width / 2, sticker.height / 2],
      [sticker.width / 2, sticker.height / 2],
    ]) {
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}

async function drawTextImage(
  canvas: HTMLCanvasElement,
  page: TextImagePage,
  presetKey: TextImagePresetKey,
  ratioKey: TextImageRatioKey,
  selectedStickerId?: string,
  shouldDraw?: () => boolean,
) {
  const stickers = page.stickers ?? [];
  const stickerImages = await Promise.all(stickers.map(async (sticker) => [sticker.id, await loadLocalImage(sticker.src)] as const));
  if (shouldDraw && !shouldDraw()) return;
  const stickerImageMap = new Map(stickerImages);
  const preset = textImagePresets[presetKey];
  const ratio = textImageRatios[ratioKey];
  const profile = getTextImageProfile(page);
  const layout = getTextImageLayoutSettings(page);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvas.width = ratio.width;
  canvas.height = ratio.height;

  ctx.fillStyle = preset.background;
  ctx.fillRect(0, 0, ratio.width, ratio.height);

  const left = textImageLayout.left;
  const maxWidth = ratio.width - left * 2;
  let y = scaleTextImageSpacing(textImageLayout.top, layout.verticalPadding);
  const bottomPadding = scaleTextImageSpacing(textImageLayout.bottomPadding, layout.verticalPadding);

  ctx.fillStyle = preset.rule;
  ctx.fillRect(left, y, maxWidth, 4);

  y += 74;
  ctx.textBaseline = "top";
  ctx.font = font(800, profile.titleSize);
  const titleLines = page.title
    .split("\n")
    .flatMap((line) => wrapCanvasText(ctx, line, maxWidth));

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
    const focusLines = wrapCanvasText(ctx, page.focus, maxWidth - 56);
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
    const measured = measureParagraphHeight(ctx, paragraph, maxWidth, page);
    const lineHeight = measured.isHeading ? profile.headingLine : measured.isFocus ? profile.focusLine : profile.bodyLine;

    if (y + measured.height > ratio.height - bottomPadding) break;

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

  for (const sticker of stickers) {
    const image = stickerImageMap.get(sticker.id);
    if (image) drawSticker(ctx, sticker, image, sticker.id === selectedStickerId);
  }

  drawPageIndicator(ctx, page.pageNumber, page.totalPages, ratio.width, ratio.height, preset.title, preset.dots);
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("图片生成失败"));
    }, "image/png");
  });
}

function TextImageSpacingControl({
  label,
  value,
  min,
  max,
  step,
  suffix = "%",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-xs">
        <Label>{label}</Label>
        <span className="tabular-nums text-slate-500">{value}{suffix}</span>
      </div>
      <input
        type="range"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full cursor-pointer accent-slate-900"
      />
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function isPointInsideSticker(x: number, y: number, sticker: TextImageSticker) {
  const centerX = sticker.x + sticker.width / 2;
  const centerY = sticker.y + sticker.height / 2;
  const angle = (-sticker.rotation * Math.PI) / 180;
  const translatedX = x - centerX;
  const translatedY = y - centerY;
  const localX = translatedX * Math.cos(angle) - translatedY * Math.sin(angle);
  const localY = translatedX * Math.sin(angle) + translatedY * Math.cos(angle);
  return Math.abs(localX) <= sticker.width / 2 && Math.abs(localY) <= sticker.height / 2;
}

function TextImageGenerator({ articleText }: { articleText: string }) {
  const isClientReady = useSyncExternalStore(subscribeToClientReady, getClientReadySnapshot, getServerReadySnapshot);
  const [sourceText, setSourceText] = useState(articleText);
  const [presetKey, setPresetKey] = useState<TextImagePresetKey>("warmBrown");
  const [ratioKey, setRatioKey] = useState<TextImageRatioKey>("portrait34");
  const [selectedPageIndex, setSelectedPageIndex] = useState(0);
  const [fileName, setFileName] = useState("文字卡片");
  const [copiedImage, setCopiedImage] = useState(false);
  const [selectedStickerId, setSelectedStickerId] = useState<string>();
  const [imageError, setImageError] = useState("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stickerInputRef = useRef<HTMLInputElement | null>(null);
  const previewRenderIdRef = useRef(0);
  const stickerDragRef = useRef<{
    pointerId: number;
    stickerId: string;
    offsetX: number;
    offsetY: number;
  } | undefined>(undefined);
  const generatedPages = useMemo(
    () => (isClientReady ? createCarouselPages(sourceText, ratioKey) : []),
    [isClientReady, ratioKey, sourceText],
  );
  const generationKey = isClientReady ? `${ratioKey}\u0000${sourceText}` : "__pending__";
  const [editedPagesState, setEditedPagesState] = useState<{
    generationKey: string;
    pages: TextImagePage[];
    changedPageIndexes: number[];
  }>(() => ({ generationKey, pages: generatedPages, changedPageIndexes: [] }));
  const pages = useMemo(
    () => (editedPagesState.generationKey === generationKey ? editedPagesState.pages : generatedPages),
    [editedPagesState.generationKey, editedPagesState.pages, generatedPages, generationKey],
  );
  const changedPageIndexes = useMemo(
    () => (editedPagesState.generationKey === generationKey ? editedPagesState.changedPageIndexes : []),
    [editedPagesState.changedPageIndexes, editedPagesState.generationKey, generationKey],
  );
  const safeSelectedPageIndex = Math.min(selectedPageIndex, Math.max(pages.length - 1, 0));
  const selectedPage = pages[safeSelectedPageIndex] ?? pages[0];
  const selectedSticker = selectedPage?.stickers?.find((sticker) => sticker.id === selectedStickerId);
  const selectedStickerWidthPercent = selectedSticker
    ? Math.round((selectedSticker.width / textImageRatios[ratioKey].width) * 100)
    : 30;
  const selectedPageChanged = changedPageIndexes.includes(safeSelectedPageIndex);
  const selectedPageLayout = selectedPage ? getTextImageLayoutSettings(selectedPage) : defaultTextImageLayoutSettings;
  const selectedPageFits = useMemo(() => {
    if (!selectedPage) return true;
    const ctx = createMeasureContext(ratioKey);
    return ctx ? pageFitsCanvas(ctx, selectedPage, ratioKey) : true;
  }, [ratioKey, selectedPage]);

  const updateSelectedPage = useCallback(
    (patch: Partial<Pick<TextImagePage, "title" | "focus" | "body" | "density" | "layout" | "stickers">>) => {
      if (!selectedPage) return;
      setEditedPagesState((current) => {
        const currentPages = current.generationKey === generationKey ? current.pages : generatedPages;
        const currentChangedIndexes = current.generationKey === generationKey ? current.changedPageIndexes : [];
        const nextPages = currentPages.map((page, index) =>
          index === safeSelectedPageIndex ? { ...page, ...patch, focus: patch.focus === "" ? undefined : patch.focus ?? page.focus } : page,
        );
        const measureContext = createMeasureContext(ratioKey);
        const fittedPage = measureContext
          ? fitPageDensity(measureContext, nextPages[safeSelectedPageIndex], ratioKey)
          : nextPages[safeSelectedPageIndex];
        nextPages[safeSelectedPageIndex] = { ...nextPages[safeSelectedPageIndex], ...fittedPage };
        return {
          generationKey,
          pages: nextPages,
          changedPageIndexes: Array.from(new Set([...currentChangedIndexes, safeSelectedPageIndex])),
        };
      });
    },
    [generatedPages, generationKey, ratioKey, safeSelectedPageIndex, selectedPage],
  );

  const updateSelectedPageSpacing = useCallback(
    (key: keyof TextImageLayoutSettings, value: number) => {
      if (!selectedPage) return;
      updateSelectedPage({ layout: { ...getTextImageLayoutSettings(selectedPage), [key]: value } });
    },
    [selectedPage, updateSelectedPage],
  );

  const updateSelectedSticker = useCallback(
    (stickerId: string, patch: Partial<TextImageSticker>) => {
      setEditedPagesState((current) => {
        const currentPages = current.generationKey === generationKey ? current.pages : generatedPages;
        const currentChangedIndexes = current.generationKey === generationKey ? current.changedPageIndexes : [];
        return {
          generationKey,
          pages: currentPages.map((page, index) =>
            index === safeSelectedPageIndex
              ? {
                  ...page,
                  stickers: (page.stickers ?? []).map((sticker) =>
                    sticker.id === stickerId ? { ...sticker, ...patch } : sticker,
                  ),
                }
              : page,
          ),
          changedPageIndexes: Array.from(new Set([...currentChangedIndexes, safeSelectedPageIndex])),
        };
      });
    },
    [generatedPages, generationKey, safeSelectedPageIndex],
  );

  const handleStickerUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file || !selectedPage) return;

      try {
        setImageError("");
        const src = await readImageFile(file);
        const image = await loadLocalImage(src);
        const ratio = textImageRatios[ratioKey];
        const sourceRatio = image.naturalWidth / Math.max(image.naturalHeight, 1);
        let width = clamp(image.naturalWidth, 160, 360);
        let height = width / sourceRatio;
        if (height > ratio.height * 0.45) {
          height = ratio.height * 0.45;
          width = height * sourceRatio;
        }
        const sticker: TextImageSticker = {
          id: createLocalImageId("sticker"),
          name: file.name,
          src,
          x: (ratio.width - width) / 2,
          y: (ratio.height - height) / 2,
          width,
          height,
          rotation: 0,
          opacity: 100,
        };
        updateSelectedPage({ stickers: [...(selectedPage.stickers ?? []), sticker] });
        setSelectedStickerId(sticker.id);
      } catch (error) {
        setImageError(error instanceof Error ? error.message : "图片添加失败");
      }
    },
    [ratioKey, selectedPage, updateSelectedPage],
  );

  const removeSelectedSticker = useCallback(() => {
    if (!selectedStickerId || !selectedPage) return;
    updateSelectedPage({ stickers: (selectedPage.stickers ?? []).filter((sticker) => sticker.id !== selectedStickerId) });
    setSelectedStickerId(undefined);
  }, [selectedPage, selectedStickerId, updateSelectedPage]);

  const moveSelectedStickerLayer = useCallback(
    (direction: "front" | "back") => {
      if (!selectedStickerId || !selectedPage) return;
      const stickers = [...(selectedPage.stickers ?? [])];
      const index = stickers.findIndex((sticker) => sticker.id === selectedStickerId);
      if (index < 0) return;
      const [sticker] = stickers.splice(index, 1);
      if (direction === "front") stickers.push(sticker);
      else stickers.unshift(sticker);
      updateSelectedPage({ stickers });
    },
    [selectedPage, selectedStickerId, updateSelectedPage],
  );

  const getCanvasPoint = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }, []);

  const handleCanvasPointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const point = getCanvasPoint(event);
      if (!point || !selectedPage) return;
      const sticker = [...(selectedPage.stickers ?? [])].reverse().find((item) => isPointInsideSticker(point.x, point.y, item));
      if (!sticker) {
        setSelectedStickerId(undefined);
        return;
      }
      setSelectedStickerId(sticker.id);
      stickerDragRef.current = {
        pointerId: event.pointerId,
        stickerId: sticker.id,
        offsetX: point.x - sticker.x,
        offsetY: point.y - sticker.y,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [getCanvasPoint, selectedPage],
  );

  const handleCanvasPointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const drag = stickerDragRef.current;
      const point = getCanvasPoint(event);
      const pageSticker = selectedPage?.stickers?.find((sticker) => sticker.id === drag?.stickerId);
      if (!drag || drag.pointerId !== event.pointerId || !point || !pageSticker) return;
      const ratio = textImageRatios[ratioKey];
      updateSelectedSticker(drag.stickerId, {
        x: clamp(point.x - drag.offsetX, -pageSticker.width * 0.8, ratio.width - pageSticker.width * 0.2),
        y: clamp(point.y - drag.offsetY, -pageSticker.height * 0.8, ratio.height - pageSticker.height * 0.2),
      });
    },
    [getCanvasPoint, ratioKey, selectedPage, updateSelectedSticker],
  );

  const handleCanvasPointerUp = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (stickerDragRef.current?.pointerId !== event.pointerId) return;
    stickerDragRef.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  const restoreSelectedPage = useCallback(() => {
    const generatedPage = generatedPages[safeSelectedPageIndex];
    if (!generatedPage) return;
    setEditedPagesState({
      generationKey,
      pages: pages.map((page, index) => (index === safeSelectedPageIndex ? generatedPage : page)),
      changedPageIndexes: changedPageIndexes.filter((index) => index !== safeSelectedPageIndex),
    });
    setSelectedStickerId(undefined);
  }, [changedPageIndexes, generatedPages, generationKey, pages, safeSelectedPageIndex]);

  const regeneratePages = useCallback(() => {
    setEditedPagesState({ generationKey, pages: generatedPages, changedPageIndexes: [] });
    setSelectedStickerId(undefined);
  }, [generatedPages, generationKey]);

  const renderImage = useCallback(async () => {
    if (!canvasRef.current || !selectedPage) return;
    const renderId = previewRenderIdRef.current + 1;
    previewRenderIdRef.current = renderId;
    await drawTextImage(
      canvasRef.current,
      selectedPage,
      presetKey,
      ratioKey,
      selectedStickerId,
      () => previewRenderIdRef.current === renderId,
    );
  }, [presetKey, ratioKey, selectedPage, selectedStickerId]);

  useEffect(() => {
    renderImage();
  }, [renderImage]);

  const createPageBlob = useCallback(
    async (page: TextImagePage) => {
      const canvas = document.createElement("canvas");
      await drawTextImage(canvas, page, presetKey, ratioKey);
      return canvasToBlob(canvas);
    },
    [presetKey, ratioKey]
  );

  const handleDownloadImage = useCallback(async () => {
    if (!selectedPage) return;

    await renderImage();
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

    await renderImage();
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
    const nextRatioKey: TextImageRatioKey = "portrait34";
    const nextPages = createCarouselPages(articleText, nextRatioKey);
    const nextGenerationKey = `${nextRatioKey}\u0000${articleText}`;
    setSourceText(articleText);
    setPresetKey("warmBrown");
    setRatioKey(nextRatioKey);
    setSelectedPageIndex(0);
    setFileName("文字卡片");
    setSelectedStickerId(undefined);
    setImageError("");
    setEditedPagesState({ generationKey: nextGenerationKey, pages: nextPages, changedPageIndexes: [] });
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
                <Button
                  onClick={() => {
                    const nextPages = createCarouselPages(articleText, ratioKey);
                    const nextGenerationKey = `${ratioKey}\u0000${articleText}`;
                    setSourceText(articleText);
                    setEditedPagesState({ generationKey: nextGenerationKey, pages: nextPages, changedPageIndexes: [] });
                    setSelectedPageIndex(0);
                  }}
                  variant="outline"
                  className="h-8 rounded-xl px-3 text-xs"
                >
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

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label>页面</Label>
                <span className="text-xs text-slate-500">共 {pages.length} 页</span>
              </div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {pages.map((page, index) => (
                  <button
                    key={`${page.pageNumber}-${index}`}
                    onClick={() => {
                      setSelectedPageIndex(index);
                      setSelectedStickerId(undefined);
                    }}
                    className={`min-h-20 rounded-xl border p-3 text-left text-xs leading-5 transition ${
                      safeSelectedPageIndex === index ? "border-slate-900 bg-white shadow-sm" : "border-slate-200 bg-slate-50 hover:bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 font-semibold text-slate-900">
                      <span>{String(page.pageNumber).padStart(2, "0")}</span>
                      {changedPageIndexes.includes(index) && <span className="text-[10px] font-medium text-amber-700">已修改</span>}
                    </div>
                    <div className="mt-1 line-clamp-2 text-slate-600">{page.title}</div>
                  </button>
                ))}
              </div>
            </div>

            {selectedPage && (
              <div className="space-y-4 border-y border-slate-200 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">第 {selectedPage.pageNumber} 页内容</div>
                  </div>
                  <div className="flex gap-2">
                    {selectedPageChanged && (
                      <Button type="button" variant="ghost" size="sm" className="h-8 rounded-lg px-2 text-xs" onClick={restoreSelectedPage}>
                        <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
                        恢复本页
                      </Button>
                    )}
                    {changedPageIndexes.length > 0 && (
                      <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg px-2 text-xs" onClick={regeneratePages}>
                        重新生成全部
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_160px]">
                  <div className="space-y-2">
                    <Label htmlFor="carousel-page-title">标题</Label>
                    <Input
                      id="carousel-page-title"
                      value={selectedPage.title}
                      onChange={(event) => updateSelectedPage({ title: event.target.value })}
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>文字密度</Label>
                    <Select value={selectedPage.density} onValueChange={(value) => updateSelectedPage({ density: value as TextImageDensity })}>
                      <SelectTrigger className="rounded-xl">
                        <span>{textImageDensityOptions[selectedPage.density]}</span>
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(textImageDensityOptions).map(([key, name]) => (
                          <SelectItem key={key} value={key}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-3 rounded-xl bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <Label>间距</Label>
                    {selectedPage.layout && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 rounded-lg px-2 text-xs"
                        onClick={() => updateSelectedPage({ layout: { ...defaultTextImageLayoutSettings } })}
                      >
                        恢复默认
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                    <TextImageSpacingControl
                      label="文字行距"
                      value={selectedPageLayout.lineSpacing}
                      min={75}
                      max={150}
                      step={5}
                      onChange={(value) => updateSelectedPageSpacing("lineSpacing", value)}
                    />
                    <TextImageSpacingControl
                      label="段落空行"
                      value={selectedPageLayout.paragraphSpacing}
                      min={0}
                      max={200}
                      step={10}
                      onChange={(value) => updateSelectedPageSpacing("paragraphSpacing", value)}
                    />
                    <TextImageSpacingControl
                      label="标题后间距"
                      value={selectedPageLayout.titleSpacing}
                      min={0}
                      max={200}
                      step={10}
                      onChange={(value) => updateSelectedPageSpacing("titleSpacing", value)}
                    />
                    <TextImageSpacingControl
                      label="上下留白"
                      value={selectedPageLayout.verticalPadding}
                      min={60}
                      max={140}
                      step={5}
                      onChange={(value) => updateSelectedPageSpacing("verticalPadding", value)}
                    />
                  </div>
                </div>

                <div className="space-y-3 border-t border-slate-200 pt-4">
                  <input
                    id="carousel-sticker-upload"
                    ref={stickerInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={handleStickerUpload}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label className="flex items-center gap-2">
                      <Layers className="h-4 w-4" />
                      贴图图层
                    </Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-lg px-3 text-xs"
                      onClick={() => stickerInputRef.current?.click()}
                    >
                      <ImagePlus className="mr-1.5 h-4 w-4" />
                      添加贴图
                    </Button>
                  </div>

                  {imageError && <div className="text-xs text-red-600">{imageError}</div>}

                  {(selectedPage.stickers?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {selectedPage.stickers?.map((sticker, index) => (
                        <button
                          type="button"
                          key={sticker.id}
                          onClick={() => setSelectedStickerId(sticker.id)}
                          className={`flex h-10 max-w-48 items-center gap-2 rounded-lg border px-2 text-xs ${
                            sticker.id === selectedStickerId
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                          }`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={sticker.src} alt="" className="h-6 w-6 shrink-0 object-contain" />
                          <span className="truncate">{index + 1}. {sticker.name}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {selectedSticker && selectedStickerId && (
                    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-xs font-medium text-slate-700">{selectedSticker.name}</span>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-lg"
                            title="置于顶层"
                            aria-label="置于顶层"
                            onClick={() => moveSelectedStickerLayer("front")}
                          >
                            <BringToFront className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-lg"
                            title="置于底层"
                            aria-label="置于底层"
                            onClick={() => moveSelectedStickerLayer("back")}
                          >
                            <SendToBack className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-lg text-red-600 hover:text-red-700"
                            title="删除贴图"
                            aria-label="删除贴图"
                            onClick={removeSelectedSticker}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-3">
                        <TextImageSpacingControl
                          label="大小"
                          value={selectedStickerWidthPercent}
                          min={10}
                          max={80}
                          step={1}
                          onChange={(value) => {
                            const width = (textImageRatios[ratioKey].width * value) / 100;
                            updateSelectedSticker(selectedStickerId, {
                              width,
                              height: width * (selectedSticker.height / selectedSticker.width),
                            });
                          }}
                        />
                        <TextImageSpacingControl
                          label="旋转"
                          value={selectedSticker.rotation}
                          min={-180}
                          max={180}
                          step={1}
                          suffix="°"
                          onChange={(value) => updateSelectedSticker(selectedStickerId, { rotation: value })}
                        />
                        <TextImageSpacingControl
                          label="透明度"
                          value={selectedSticker.opacity}
                          min={10}
                          max={100}
                          step={5}
                          onChange={(value) => updateSelectedSticker(selectedStickerId, { opacity: value })}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="carousel-page-focus">重点</Label>
                  <Textarea
                    id="carousel-page-focus"
                    value={selectedPage.focus ?? ""}
                    onChange={(event) => updateSelectedPage({ focus: event.target.value })}
                    placeholder="留空则不显示重点框"
                    className="min-h-24 rounded-xl text-sm leading-6"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="carousel-page-body">正文</Label>
                  <Textarea
                    id="carousel-page-body"
                    value={selectedPage.body}
                    onChange={(event) => updateSelectedPage({ body: event.target.value })}
                    className="min-h-52 rounded-xl text-sm leading-7"
                  />
                </div>

                {!selectedPageFits && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                    当前内容超出画布。请删减文字，或把文字密度调为“紧凑”“密集”。
                  </div>
                )}
              </div>
            )}

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
          </div>

          <div className="flex flex-col items-center gap-3 rounded-2xl border bg-slate-100 p-4 lg:sticky lg:top-4 lg:self-start">
            <canvas
              ref={canvasRef}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              onPointerCancel={handleCanvasPointerUp}
              className={`h-auto w-full max-w-[360px] touch-none rounded-2xl bg-white shadow-sm ${
                (selectedPage?.stickers?.length ?? 0) > 0 ? "cursor-move" : "cursor-default"
              }`}
            />
            <div className="text-xs text-slate-500">
              {selectedPage ? `${selectedPage.pageNumber} / ${selectedPage.totalPages}` : "0 / 0"} · {textImageRatios[ratioKey].width}×{textImageRatios[ratioKey].height}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type EditablePreviewProps = {
  html: string;
  hasChanges: boolean;
  onHtmlChange: (html: string) => void;
  onReset: () => void;
};

const editorCommands = [
  { command: "bold", label: "加粗", icon: Bold },
  { command: "italic", label: "斜体", icon: Italic },
  { command: "underline", label: "下划线", icon: Underline },
  { command: "undo", label: "撤销", icon: Undo2 },
  { command: "redo", label: "重做", icon: Redo2 },
] as const;

type ArticleImageAlign = "left" | "center" | "right";

function serializeEditablePreview(element: HTMLDivElement) {
  const clone = element.cloneNode(true) as HTMLDivElement;
  clone.querySelectorAll("[data-editor-selected], [data-editor-dragging], [data-editor-drop-position]").forEach((node) => {
    node.removeAttribute("data-editor-selected");
    node.removeAttribute("data-editor-dragging");
    node.removeAttribute("data-editor-drop-position");
  });
  clone.removeAttribute("data-image-dragging");
  clone.querySelectorAll<HTMLElement>("[data-local-image-block]").forEach((block) => {
    block.removeAttribute("contenteditable");
    block.removeAttribute("draggable");
  });
  clone.querySelectorAll<HTMLImageElement>("img[data-local-image-id]").forEach((image) => {
    image.removeAttribute("draggable");
    image.style.removeProperty("cursor");
  });
  return clone.innerHTML;
}

function enableEditablePreviewImages(element: HTMLDivElement) {
  element.querySelectorAll<HTMLElement>("[data-local-image-block]").forEach((block) => {
    block.contentEditable = "false";
    block.draggable = true;
    const image = block.querySelector<HTMLImageElement>("img[data-local-image-id]");
    if (image) {
      image.draggable = true;
      image.style.cursor = "grab";
    }
  });
}

function getArticleContentRoot(editor: HTMLDivElement) {
  const firstChild = editor.firstElementChild;
  if (firstChild instanceof HTMLElement && firstChild.tagName === "SECTION" && !firstChild.hasAttribute("data-local-image-block")) {
    return firstChild;
  }
  return editor;
}

function createArticleImageBlock(src: string, name: string) {
  const block = document.createElement("section");
  block.setAttribute("data-local-image-block", "true");
  block.contentEditable = "false";
  block.draggable = true;
  block.style.margin = "20px 0";
  block.style.textAlign = "center";

  const image = document.createElement("img");
  image.src = src;
  image.alt = name.replace(/\.[^.]+$/, "");
  image.setAttribute("data-local-image-id", createLocalImageId("article-image"));
  image.draggable = true;
  image.style.display = "inline-block";
  image.style.width = "100%";
  image.style.maxWidth = "100%";
  image.style.height = "auto";
  image.style.verticalAlign = "top";
  image.style.cursor = "grab";
  block.appendChild(image);
  return { block, image };
}

function EditablePreview({ html, hasChanges, onHtmlChange, onReset }: EditablePreviewProps) {
  const editableRef = useRef<HTMLDivElement | null>(null);
  const articleImageInputRef = useRef<HTMLInputElement | null>(null);
  const savedRangeRef = useRef<Range | undefined>(undefined);
  const imageUploadModeRef = useRef<"insert" | "replace">("insert");
  const lastSyncedHtmlRef = useRef<string | undefined>(undefined);
  const draggedArticleImageIdRef = useRef<string | undefined>(undefined);
  const imageDropTargetRef = useRef<
    { element: HTMLElement; position: "before" | "after" } | { append: true } | undefined
  >(undefined);
  const [isEditing, setIsEditing] = useState(true);
  const [selectedImageId, setSelectedImageId] = useState<string>();
  const [selectedImageWidth, setSelectedImageWidth] = useState(100);
  const [selectedImageAlign, setSelectedImageAlign] = useState<ArticleImageAlign>("center");
  const [imageError, setImageError] = useState("");

  useEffect(() => {
    const element = editableRef.current;
    if (!element) return;
    if (lastSyncedHtmlRef.current === html) {
      enableEditablePreviewImages(element);
      return;
    }
    if (serializeEditablePreview(element) !== html) {
      element.innerHTML = html;
      setSelectedImageId(undefined);
    }
    enableEditablePreviewImages(element);
    lastSyncedHtmlRef.current = html;
  }, [html]);

  const syncHtml = useCallback(() => {
    const editor = editableRef.current;
    const nextHtml = editor ? serializeEditablePreview(editor) : html;
    lastSyncedHtmlRef.current = nextHtml;
    onHtmlChange(nextHtml);
  }, [html, onHtmlChange]);

  const captureSelection = useCallback(() => {
    const editor = editableRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) savedRangeRef.current = range.cloneRange();
  }, []);

  const getSelectedImage = useCallback(() => {
    if (!selectedImageId) return;
    return editableRef.current?.querySelector<HTMLImageElement>(`img[data-local-image-id="${selectedImageId}"]`) ?? undefined;
  }, [selectedImageId]);

  const selectArticleImage = useCallback((image: HTMLImageElement) => {
    const editor = editableRef.current;
    if (!editor) return;
    editor.querySelectorAll("img[data-editor-selected]").forEach((node) => node.removeAttribute("data-editor-selected"));
    const id = image.dataset.localImageId ?? createLocalImageId("article-image");
    image.dataset.localImageId = id;
    image.dataset.editorSelected = "true";
    setSelectedImageId(id);
    setSelectedImageWidth(Number.parseInt(image.style.width, 10) || 100);
    const block = image.closest<HTMLElement>("[data-local-image-block]");
    setSelectedImageAlign((block?.style.textAlign as ArticleImageAlign) || "center");
  }, []);

  const runCommand = useCallback(
    (command: (typeof editorCommands)[number]["command"]) => {
      const editor = editableRef.current;
      if (!editor) return;
      editor.focus();
      document.execCommand(command, false);
      syncHtml();
    },
    [syncHtml],
  );

  const insertArticleImage = useCallback(
    (src: string, name: string) => {
      const editor = editableRef.current;
      if (!editor) return;
      const contentRoot = getArticleContentRoot(editor);
      const { block, image } = createArticleImageBlock(src, name);
      const range = savedRangeRef.current;

      if (range && contentRoot.contains(range.commonAncestorContainer)) {
        let insertionPoint: Node = range.startContainer;
        if (insertionPoint.nodeType === Node.TEXT_NODE && insertionPoint.parentNode) insertionPoint = insertionPoint.parentNode;
        while (insertionPoint.parentNode && insertionPoint.parentNode !== contentRoot) insertionPoint = insertionPoint.parentNode;
        if (insertionPoint.parentNode === contentRoot) contentRoot.insertBefore(block, insertionPoint.nextSibling);
        else contentRoot.appendChild(block);
      } else {
        contentRoot.appendChild(block);
      }

      let trailingParagraph = block.nextElementSibling as HTMLElement | null;
      if (!trailingParagraph) {
        trailingParagraph = document.createElement("p");
        trailingParagraph.innerHTML = "<br>";
        block.after(trailingParagraph);
      }
      const nextRange = document.createRange();
      nextRange.selectNodeContents(trailingParagraph);
      nextRange.collapse(true);
      savedRangeRef.current = nextRange;
      selectArticleImage(image);
      syncHtml();
    },
    [selectArticleImage, syncHtml],
  );

  const handleArticleImageUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;

      try {
        setImageError("");
        const src = await readImageFile(file);
        if (imageUploadModeRef.current === "replace") {
          const image = getSelectedImage();
          if (!image) return;
          image.src = src;
          image.alt = file.name.replace(/\.[^.]+$/, "");
          selectArticleImage(image);
          syncHtml();
          return;
        }
        insertArticleImage(src, file.name);
      } catch (error) {
        setImageError(error instanceof Error ? error.message : "图片添加失败");
      }
    },
    [getSelectedImage, insertArticleImage, selectArticleImage, syncHtml],
  );

  const setArticleImageWidth = useCallback(
    (width: number) => {
      const image = getSelectedImage();
      if (!image) return;
      image.style.width = `${width}%`;
      setSelectedImageWidth(width);
      selectArticleImage(image);
      syncHtml();
    },
    [getSelectedImage, selectArticleImage, syncHtml],
  );

  const setArticleImageAlign = useCallback(
    (align: ArticleImageAlign) => {
      const image = getSelectedImage();
      const block = image?.closest<HTMLElement>("[data-local-image-block]");
      if (!image || !block) return;
      block.style.textAlign = align;
      setSelectedImageAlign(align);
      selectArticleImage(image);
      syncHtml();
    },
    [getSelectedImage, selectArticleImage, syncHtml],
  );

  const moveArticleImage = useCallback(
    (direction: "up" | "down") => {
      const image = getSelectedImage();
      const block = image?.closest<HTMLElement>("[data-local-image-block]");
      if (!image || !block) return;
      const sibling = direction === "up" ? block.previousElementSibling : block.nextElementSibling;
      if (!sibling) return;
      if (direction === "up") sibling.before(block);
      else sibling.after(block);
      selectArticleImage(image);
      syncHtml();
    },
    [getSelectedImage, selectArticleImage, syncHtml],
  );

  const removeArticleImage = useCallback(() => {
    const image = getSelectedImage();
    const block = image?.closest<HTMLElement>("[data-local-image-block]");
    if (!block) return;
    block.remove();
    setSelectedImageId(undefined);
    syncHtml();
  }, [getSelectedImage, syncHtml]);

  const clearArticleImageDragState = useCallback(() => {
    const editor = editableRef.current;
    editor?.removeAttribute("data-image-dragging");
    editor?.querySelectorAll("[data-editor-dragging], [data-editor-drop-position]").forEach((node) => {
      node.removeAttribute("data-editor-dragging");
      node.removeAttribute("data-editor-drop-position");
    });
    draggedArticleImageIdRef.current = undefined;
    imageDropTargetRef.current = undefined;
  }, []);

  const handleArticleImageDragStart = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      const target = event.target instanceof HTMLElement ? event.target : undefined;
      const block = target?.closest<HTMLElement>("[data-local-image-block]");
      const image = block?.querySelector<HTMLImageElement>("img[data-local-image-id]");
      if (!block || !image) return;
      const id = image.dataset.localImageId;
      if (!id) return;
      draggedArticleImageIdRef.current = id;
      block.dataset.editorDragging = "true";
      editableRef.current?.setAttribute("data-image-dragging", "true");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", id);
      selectArticleImage(image);
    },
    [selectArticleImage],
  );

  const handleArticleImageDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    const editor = editableRef.current;
    const draggedId = draggedArticleImageIdRef.current;
    if (!editor || !draggedId) return;
    const contentRoot = getArticleContentRoot(editor);
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    editor.querySelectorAll("[data-editor-drop-position]").forEach((node) => node.removeAttribute("data-editor-drop-position"));

    let target = event.target instanceof HTMLElement ? event.target : undefined;
    if (!target || target === editor || target === contentRoot) {
      imageDropTargetRef.current = { append: true };
      return;
    }
    while (target.parentElement && target.parentElement !== contentRoot) target = target.parentElement;
    if (target.parentElement !== contentRoot) {
      imageDropTargetRef.current = { append: true };
      return;
    }
    if (target.querySelector(`img[data-local-image-id="${draggedId}"]`)) {
      imageDropTargetRef.current = undefined;
      return;
    }

    const rect = target.getBoundingClientRect();
    const position = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    target.dataset.editorDropPosition = position;
    imageDropTargetRef.current = { element: target, position };
  }, []);

  const handleArticleImageDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      const editor = editableRef.current;
      const draggedId = draggedArticleImageIdRef.current;
      const dropTarget = imageDropTargetRef.current;
      if (!editor || !draggedId) return;
      const contentRoot = getArticleContentRoot(editor);
      event.preventDefault();
      const image = editor.querySelector<HTMLImageElement>(`img[data-local-image-id="${draggedId}"]`);
      const block = image?.closest<HTMLElement>("[data-local-image-block]");
      if (!image || !block || !dropTarget) {
        clearArticleImageDragState();
        return;
      }

      if ("append" in dropTarget) contentRoot.appendChild(block);
      else if (dropTarget.position === "before") dropTarget.element.before(block);
      else dropTarget.element.after(block);

      clearArticleImageDragState();
      selectArticleImage(image);
      syncHtml();
    },
    [clearArticleImageDragState, selectArticleImage, syncHtml],
  );

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      const imageFiles = Array.from(event.clipboardData.files).filter((file) => supportedImageTypes.has(file.type));
      if (imageFiles.length > 0) {
        event.preventDefault();
        captureSelection();
        void (async () => {
          for (const file of imageFiles) {
            try {
              insertArticleImage(await readImageFile(file), file.name || "粘贴图片");
            } catch (error) {
              setImageError(error instanceof Error ? error.message : "图片粘贴失败");
            }
          }
        })();
        return;
      }
      event.preventDefault();
      document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
      syncHtml();
    },
    [captureSelection, insertArticleImage, syncHtml],
  );

  return (
    <div className="min-h-[620px] rounded-2xl border border-slate-200 bg-white p-5 md:p-7">
      <input
        id="article-image-upload"
        ref={articleImageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleArticleImageUpload}
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
        <div className="flex flex-wrap items-center gap-1">
          <Button
            type="button"
            variant={isEditing ? "default" : "outline"}
            size="sm"
            className="h-8 rounded-lg px-3"
            onClick={() => {
              setIsEditing((current) => !current);
              requestAnimationFrame(() => editableRef.current?.focus());
            }}
          >
            {isEditing ? <Check className="mr-1.5 h-4 w-4" /> : <Pencil className="mr-1.5 h-4 w-4" />}
            {isEditing ? "完成编辑" : "编辑正文"}
          </Button>

          {isEditing && (
            <>
              <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
              {editorCommands.map(({ command, label, icon: Icon }) => (
                <Button
                  key={command}
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  title={label}
                  aria-label={label}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => runCommand(command)}
                >
                  <Icon className="h-4 w-4" />
                </Button>
              ))}
              <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 rounded-lg px-3"
                onMouseDown={(event) => {
                  event.preventDefault();
                  captureSelection();
                }}
                onClick={() => {
                  imageUploadModeRef.current = "insert";
                  articleImageInputRef.current?.click();
                }}
              >
                <ImagePlus className="mr-1.5 h-4 w-4" />
                插入图片
              </Button>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>{isEditing ? "点击正文即可修改，支持选中文字后设置格式" : hasChanges ? "修改已保留" : "预览模式"}</span>
          {hasChanges && (
            <Button type="button" variant="ghost" size="sm" className="h-8 rounded-lg px-2 text-xs" onClick={onReset}>
              <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
              恢复生成版本
            </Button>
          )}
        </div>
      </div>
      {imageError && <div className="mb-3 text-xs text-red-600">{imageError}</div>}
      {isEditing && selectedImageId && (
        <div className="mb-3 flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
          <div className="mr-2 flex items-center gap-1">
            {[25, 50, 75, 100].map((width) => (
              <Button
                key={width}
                type="button"
                variant={selectedImageWidth === width ? "default" : "ghost"}
                size="sm"
                className="h-8 rounded-lg px-2 text-xs"
                onClick={() => setArticleImageWidth(width)}
              >
                {width}%
              </Button>
            ))}
          </div>
          {([
            ["left", "左对齐", AlignLeft],
            ["center", "居中", AlignCenter],
            ["right", "右对齐", AlignRight],
          ] as const).map(([align, label, Icon]) => (
            <Button
              key={align}
              type="button"
              variant={selectedImageAlign === align ? "default" : "ghost"}
              size="icon"
              className="h-8 w-8 rounded-lg"
              title={label}
              aria-label={label}
              onClick={() => setArticleImageAlign(align)}
            >
              <Icon className="h-4 w-4" />
            </Button>
          ))}
          <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg"
            title="上移图片"
            aria-label="上移图片"
            onClick={() => moveArticleImage("up")}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg"
            title="下移图片"
            aria-label="下移图片"
            onClick={() => moveArticleImage("down")}
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg"
            title="替换图片"
            aria-label="替换图片"
            onClick={() => {
              imageUploadModeRef.current = "replace";
              articleImageInputRef.current?.click();
            }}
          >
            <Replace className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg text-red-600 hover:text-red-700"
            title="删除图片"
            aria-label="删除图片"
            onClick={removeArticleImage}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )}
      <div
        ref={editableRef}
        contentEditable={isEditing}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="文章效果编辑区"
        tabIndex={0}
        spellCheck={false}
        onInput={() => {
          captureSelection();
          syncHtml();
        }}
        onBlur={syncHtml}
        onPaste={handlePaste}
        onDragStart={handleArticleImageDragStart}
        onDragOver={handleArticleImageDragOver}
        onDrop={handleArticleImageDrop}
        onDragEnd={clearArticleImageDragState}
        onKeyUp={captureSelection}
        onMouseUp={captureSelection}
        onClick={(event) => {
          if (isEditing && event.target instanceof HTMLAnchorElement) event.preventDefault();
          if (!isEditing) return;
          if (event.target instanceof HTMLImageElement) {
            selectArticleImage(event.target);
            return;
          }
          editableRef.current?.querySelectorAll("img[data-editor-selected]").forEach((node) => node.removeAttribute("data-editor-selected"));
          setSelectedImageId(undefined);
        }}
        className={`preview-editor min-h-[560px] rounded-xl outline-none transition ${
          isEditing
            ? "cursor-text border border-dashed border-slate-300 bg-white p-3 focus:border-slate-500 focus:ring-2 focus:ring-slate-900/10"
            : "cursor-default border border-transparent p-3"
        }`}
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

  const handlePreviewReset = useCallback(() => {
    setEditableHtmlState({ sourceHtml: html, outputHtml: html });
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
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">自媒体内容排版器</h1>
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
                      <EditablePreview
                        html={editableHtml}
                        hasChanges={editableHtml !== html}
                        onHtmlChange={handlePreviewHtmlChange}
                        onReset={handlePreviewReset}
                      />
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
