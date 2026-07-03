"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Copy, Code2, FileDown, Image as ImageIcon, RefreshCcw, Upload, Wand2 } from "lucide-react";
import { parseArticle } from "@/lib/article-parser";
import { copyRichText } from "@/lib/copy-rich-text";
import type { TemplateKey } from "@/lib/article-types";
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

const textImageFontFamily = "-apple-system, BlinkMacSystemFont, Helvetica Neue, PingFang SC, Hiragino Sans GB, Microsoft YaHei, Arial, sans-serif";

const textImageRatios = {
  portrait34: {
    name: "3:4 图文",
    width: 1080,
    height: 1440,
    bodyLimit: 520,
  },
  portrait916: {
    name: "9:16 竖版",
    width: 1080,
    height: 1920,
    bodyLimit: 760,
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

type TextImagePage = {
  title: string;
  body: string;
  pageNumber: number;
  totalPages: number;
};

function font(weight: number, size: number) {
  return `${weight} ${size}px ${textImageFontFamily}`;
}

function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  let line = "";

  for (const char of Array.from(text.trim())) {
    const nextLine = line + char;
    if (line && ctx.measureText(nextLine).width > maxWidth) {
      lines.push(line);
      line = char.trimStart();
    } else {
      line = nextLine;
    }
  }

  if (line) lines.push(line);
  return lines;
}

function blockToCarouselText(block: ReturnType<typeof parseArticle>[number]) {
  switch (block.type) {
    case "list":
      return block.items.map((item) => `- ${item}`).join("\n");
    case "card":
      return `${block.title ? `${block.title}：` : ""}${block.body}`;
    case "image":
      return "";
    default:
      return "text" in block ? block.text : "";
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

function splitBodyForPages(body: string, maxChars: number) {
  const paragraphs = body
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const paragraphChunks = paragraph.length > maxChars ? splitLongParagraph(paragraph, maxChars) : [paragraph];

    for (const chunk of paragraphChunks) {
      if (current && current.length + chunk.length + 2 > maxChars) {
        chunks.push(current);
        current = chunk;
      } else {
        current = current ? `${current}\n\n${chunk}` : chunk;
      }
    }
  }

  if (current) chunks.push(current);
  return chunks.length ? chunks : [""];
}

function pageTextLength(page: Omit<TextImagePage, "pageNumber" | "totalPages">) {
  return page.title.length * 1.15 + page.body.length;
}

function createCarouselPages(sourceText: string, ratioKey: TextImageRatioKey): TextImagePage[] {
  const blocks = parseArticle(sourceText);
  const ratio = textImageRatios[ratioKey];
  const titleBlock = blocks.find((block) => block.type === "title");
  const articleTitle = titleBlock && "text" in titleBlock ? titleBlock.text : "文字轮播图";
  const sections: Omit<TextImagePage, "pageNumber" | "totalPages">[] = [];
  let currentSectionTitle = articleTitle;
  let currentParts: string[] = [];

  const flushSection = () => {
    const body = currentParts.filter(Boolean).join("\n\n").trim();
    if (!body && sections.length > 0) return;
    sections.push({ title: currentSectionTitle, body });
    currentParts = [];
  };

  for (const block of blocks) {
    if (block.type === "title" || block.type === "image") continue;

    if (block.type === "section") {
      flushSection();
      currentSectionTitle = block.text;
      currentParts = [];
      continue;
    }

    const text = blockToCarouselText(block);
    if (text) currentParts.push(text);
  }

  flushSection();

  const usefulSections = sections.filter((section) => section.title.trim() || section.body.trim());
  const pagesDraft: Omit<TextImagePage, "pageNumber" | "totalPages">[] = [];
  let currentPage: Omit<TextImagePage, "pageNumber" | "totalPages"> | null = null;

  const pushPage = () => {
    if (!currentPage) return;
    if (currentPage.body.trim() || currentPage.title.trim()) pagesDraft.push(currentPage);
    currentPage = null;
  };

  for (const section of usefulSections) {
    const sectionChunks = splitBodyForPages(section.body, ratio.bodyLimit);

    for (const chunk of sectionChunks) {
      const pageChunk: Omit<TextImagePage, "pageNumber" | "totalPages"> = { title: section.title, body: chunk };
      if (!currentPage) {
        currentPage = pageChunk;
        continue;
      }

      const mergedPage: Omit<TextImagePage, "pageNumber" | "totalPages"> = {
        title: currentPage.title,
        body: `${currentPage.body}\n\n${pageChunk.title}\n${pageChunk.body}`.trim(),
      };

      if (pageTextLength(mergedPage) <= ratio.bodyLimit * 1.08) {
        currentPage = mergedPage;
      } else {
        pushPage();
        currentPage = pageChunk;
      }
    }
  }

  pushPage();

  if (pagesDraft.length === 0) {
    pagesDraft.push({ title: articleTitle, body: sourceText.replace(articleTitle, "").trim() });
  }

  const totalPages = pagesDraft.length;
  return pagesDraft.map((page, index) => ({
    ...page,
    pageNumber: index + 1,
    totalPages,
  }));
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
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvas.width = ratio.width;
  canvas.height = ratio.height;

  ctx.fillStyle = preset.background;
  ctx.fillRect(0, 0, ratio.width, ratio.height);

  const left = 84;
  const maxWidth = ratio.width - left * 2;
  let y = 148;

  ctx.fillStyle = preset.rule;
  ctx.fillRect(left, y, maxWidth, 4);

  y += 74;
  ctx.textBaseline = "top";
  ctx.font = font(800, 72);
  const titleLines = page.title
    .split("\n")
    .flatMap((line) => wrapCanvasText(ctx, line, maxWidth))
    .slice(0, 4);

  for (const line of titleLines) {
    const textWidth = Math.min(ctx.measureText(line).width + 16, maxWidth);
    ctx.fillStyle = preset.highlight;
    ctx.fillRect(left - 4, y + 54, textWidth, 24);
    ctx.fillStyle = preset.title;
    ctx.fillText(line, left, y);
    y += 88;
  }

  y += 54;
  const paragraphs = page.body
    .split(/\n\s*\n/g)
    .map((item) => item.replace(/\n/g, "").trim())
    .filter(Boolean);

  for (const paragraph of paragraphs) {
    const isHeading = paragraph.length <= 18 && !/[。？！.!?，,；;：:]/.test(paragraph);
    ctx.font = isHeading ? font(700, 40) : font(500, 36);
    ctx.fillStyle = preset.body;
    const lines = wrapCanvasText(ctx, paragraph, maxWidth);
    const lineHeight = isHeading ? 60 : 64;

    if (y + lines.length * lineHeight > ratio.height - 150) break;

    for (const line of lines) {
      ctx.fillText(line, left, y);
      y += lineHeight;
    }

    y += isHeading ? 34 : 38;
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
    <Card className="mt-6 rounded-2xl shadow-sm">
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

export default function WechatArticleFormatterApp() {
  const [input, setInput] = useState(defaultArticle);
  const [templateKey, setTemplateKey] = useState<TemplateKey>("zhenyiKnowledgeMinimal");
  const [copiedRich, setCopiedRich] = useState(false);
  const [copiedHtml, setCopiedHtml] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const template = styleTemplates[templateKey];
  const blocks = useMemo(() => parseArticle(input), [input]);
  const html = useMemo(() => renderWechatHtml(blocks, template), [blocks, template]);

  const handleCopyRichText = async () => {
    try {
      await copyRichText(html);
      setCopiedRich(true);
      setTimeout(() => setCopiedRich(false), 1500);
    } catch (error) {
      console.error(error);
    }
  };

  const handleCopyHtml = async () => {
    try {
      await navigator.clipboard.writeText(html);
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
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
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

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card className="rounded-2xl shadow-sm xl:col-span-1">
            <CardHeader>
              <CardTitle className="text-lg">排版设置</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>模板风格</Label>
                <Select value={templateKey} onValueChange={(value) => setTemplateKey(value as TemplateKey)}>
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
                <div className="text-sm font-semibold text-slate-900">{template.name}</div>
                <div className="mt-3 flex gap-2">
                  {template.palette.map((color) => (
                    <span key={color} className="h-5 w-12 rounded-full border border-slate-200" style={{ backgroundColor: color }} />
                  ))}
                </div>
                <div className="mt-3 text-xs leading-6 text-slate-500">适合：{template.audience}</div>
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
                  <div className="min-h-[620px] rounded-2xl border bg-white p-5 md:p-7">
                    <div dangerouslySetInnerHTML={{ __html: html }} />
                  </div>
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
                  <Textarea readOnly value={html} className="min-h-[620px] rounded-2xl font-mono text-xs" />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <TextImageGenerator articleText={input} />

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templateList.map((item) => (
            <button
              key={item.key}
              onClick={() => setTemplateKey(item.key)}
              className={`rounded-2xl border p-4 text-left transition ${
                templateKey === item.key ? "border-slate-900 bg-white shadow-sm" : "border-slate-200 bg-slate-50 hover:bg-white"
              }`}
            >
              <div className="text-sm font-semibold text-slate-900">{item.name}</div>
              <div className="mt-2 text-xs leading-6 text-slate-500">{item.description}</div>
              <div className="mt-3 flex gap-2">
                {item.palette.map((color) => (
                  <span key={color} className="h-4 w-10 rounded-full border border-slate-200" style={{ backgroundColor: color }} />
                ))}
              </div>
            </button>
          ))}
        </div>
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
