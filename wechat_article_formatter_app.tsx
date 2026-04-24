"use client";

import React, { useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, FileDown, Image as ImageIcon, RefreshCcw, Upload, Wand2 } from "lucide-react";

function escapeHtml(str: string) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatInline(text: string) {
  let out = escapeHtml(text.trim());
  out = out.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/__(.*?)__/g, '<strong>$1</strong>');
  out = out.replace(/`([^`]+)`/g, '<span style="font-family: Menlo, Monaco, Consolas, monospace; background-color: #f3f4f6; padding: 1px 4px; border-radius: 4px;">$1</span>');
  out = out.replace(/"([^"]{2,})"/g, '"<strong>$1</strong>"');
  return out;
}

type StyleConfig = {
  name: string;
  h1Size: number;
  h2Size: number;
  h3Size: number;
  bodySize: number;
  lineHeight: number;
  headingColor: string;
  bodyColor: string;
  accent: string;
  softBg: string;
  quoteBg: string;
  summaryBg: string;
  summaryColor: string;
  pillBg: string;
  pillColor: string;
};

type TemplateKey = "tech" | "business" | "emotion" | "minimal";

const templateMap: Record<TemplateKey, StyleConfig> = {
  tech: {
    name: "科技感",
    h1Size: 30,
    h2Size: 23,
    h3Size: 18,
    bodySize: 16,
    lineHeight: 2,
    headingColor: "#121826",
    bodyColor: "#2f3a4a",
    accent: "#4f7cff",
    softBg: "#f6f8ff",
    quoteBg: "#f7f9ff",
    summaryBg: "#182233",
    summaryColor: "#ffffff",
    pillBg: "#edf2ff",
    pillColor: "#3f67e8",
  },
  business: {
    name: "商业感",
    h1Size: 30,
    h2Size: 23,
    h3Size: 18,
    bodySize: 16,
    lineHeight: 2,
    headingColor: "#2a2118",
    bodyColor: "#4b4035",
    accent: "#b07b3f",
    softBg: "#fbf7f1",
    quoteBg: "#fcf8f2",
    summaryBg: "#34291f",
    summaryColor: "#fffdf8",
    pillBg: "#f6ecdf",
    pillColor: "#9a6b2f",
  },
  emotion: {
    name: "情绪风",
    h1Size: 31,
    h2Size: 23,
    h3Size: 18,
    bodySize: 16,
    lineHeight: 2.05,
    headingColor: "#3b3034",
    bodyColor: "#5b4c50",
    accent: "#df7b90",
    softBg: "#fff7f8",
    quoteBg: "#fff7f8",
    summaryBg: "#5a4349",
    summaryColor: "#ffffff",
    pillBg: "#ffeef2",
    pillColor: "#cc617a",
  },
  minimal: {
    name: "极简专栏",
    h1Size: 30,
    h2Size: 22,
    h3Size: 18,
    bodySize: 16,
    lineHeight: 2,
    headingColor: "#171717",
    bodyColor: "#3a3a3a",
    accent: "#222222",
    softBg: "#fafafa",
    quoteBg: "#f7f7f7",
    summaryBg: "#1f1f1f",
    summaryColor: "#ffffff",
    pillBg: "#f2f2f2",
    pillColor: "#333333",
  },
};

type Block =
  | { type: "title"; text: string }
  | { type: "lead"; text: string }
  | { type: "section"; text: string }
  | { type: "subsection"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "quote"; text: string }
  | { type: "golden"; text: string }
  | { type: "summary"; text: string }
  | { type: "cta"; text: string }
  | { type: "image"; text: string }
  | { type: "list"; items: string[] }
  | { type: "card"; title?: string; body: string };

function looksLikeLead(text: string) {
  return text.length <= 80 && /革命|变化|本质|趋势|判断|范式|时代|未来/.test(text);
}

function isLikelyMainTitle(line: string, index: number) {
  if (index !== 0) return false;
  const t = line.trim();
  return t.length > 8 && t.length < 68;
}

function isSectionTitle(line: string) {
  const t = line.trim();
  if (!t) return false;
  return (
    /^([一二三四五六七八九十]+[、，.．])/.test(t) ||
    /^第[一二三四五六七八九十]+部分/.test(t) ||
    /^\d+[、.．]/.test(t) ||
    /^写在最后$/.test(t) ||
    /^总结$/.test(t) ||
    /^结语$/.test(t)
  );
}

function isSubTitle(line: string) {
  const t = line.trim();
  return !!t && t.length <= 30 && /[:：]$/.test(t);
}

function isBullet(line: string) {
  return /^\s*([-*•]|\d+[.)）])\s+/.test(line);
}

function normalizeBullet(line: string) {
  return line.replace(/^\s*([-*•]|\d+[.)）])\s+/, "").trim();
}

function isImagePlaceholder(line: string) {
  return /^(图片|配图|图示|插图|此处插入|image)[:：\s]/i.test(line.trim()) || /^\[[^\]]*(图片|配图|image)[^\]]*\]$/i.test(line.trim());
}

function normalizeImagePlaceholder(line: string) {
  const t = line.trim();
  if (/^\[[^\]]+\]$/.test(t)) {
    return t.replace(/^\[/, "").replace(/\]$/, "");
  }
  return t.replace(/^(图片|配图|图示|插图|此处插入|image)[:：\s]*/i, "此处插入：");
}

function isGoldenSentence(line: string) {
  const t = line.trim();
  return t.length >= 10 && t.length <= 40 && /不是|而是|已经|正在|终究|本质|变成|过去了/.test(t);
}

function isSummaryIntro(line: string) {
  return /对普通人来说，这意味着|这意味着|总结来看|归根到底|写在最后/.test(line.trim());
}

function isCTA(line: string) {
  return /私信|回复|留言|关注|领取|获取|发你|我发你|评论区/.test(line.trim()) || /^(💡|✨|🔥|✅|📌|📍)/.test(line.trim());
}

function markdownToPlain(md: string) {
  return md
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/!\[[^\]]*\]\(([^)]+)\)/g, "图片：$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/^[-*+]\s+/gm, "- ")
    .replace(/^\d+\.\s+/gm, "1. ")
    .trim();
}

function parseBlocks(raw: string): Block[] {
  const normalized = markdownToPlain(raw).replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  const lines = normalized.split("\n");
  const blocks: Block[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i += 1;
      continue;
    }

    if (isLikelyMainTitle(line, i)) {
      blocks.push({ type: "title", text: line });
      i += 1;
      continue;
    }

    if (isCTA(line)) {
      blocks.push({ type: "cta", text: line });
      i += 1;
      continue;
    }

    if (isImagePlaceholder(line)) {
      blocks.push({ type: "image", text: normalizeImagePlaceholder(line) });
      i += 1;
      continue;
    }

    if (isSectionTitle(line)) {
      blocks.push({ type: "section", text: line });
      i += 1;
      continue;
    }

    if (isSubTitle(line)) {
      blocks.push({ type: "subsection", text: line });
      i += 1;
      continue;
    }

    if (/^(核心突破|关键判断|为什么这次不一样|对普通人的价值|当然，挑战也在|关键在于|核心就是)[:：]?/.test(line)) {
      blocks.push({ type: "quote", text: line });
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

    const paragraphLines = [line];
    let j = i + 1;
    while (
      j < lines.length &&
      lines[j].trim() &&
      !isSectionTitle(lines[j]) &&
      !isSubTitle(lines[j]) &&
      !isBullet(lines[j]) &&
      !isCTA(lines[j]) &&
      !isImagePlaceholder(lines[j])
    ) {
      paragraphLines.push(lines[j].trim());
      j += 1;
    }

    const paragraph = paragraphLines.join("");

    if (blocks.length === 1 && blocks[0].type === "title" && looksLikeLead(paragraph)) {
      blocks.push({ type: "lead", text: paragraph });
    } else if (isGoldenSentence(paragraph)) {
      blocks.push({ type: "golden", text: paragraph });
    } else if (isSummaryIntro(paragraph)) {
      blocks.push({ type: "summary", text: paragraph });
    } else if (/^(.{4,18})[:：](.+)$/.test(paragraph) && paragraph.length <= 80) {
      const matched = paragraph.match(/^(.{4,18})[:：](.+)$/);
      blocks.push({ type: "card", title: matched?.[1]?.trim(), body: matched?.[2]?.trim() || "" });
    } else {
      blocks.push({ type: "paragraph", text: paragraph });
    }

    i = j;
  }

  return blocks;
}

function renderBlock(block: Block, style: StyleConfig) {
  switch (block.type) {
    case "title":
      return `<section style="margin: 0 0 30px;"><p style="margin: 0 0 14px; font-size: ${style.h1Size + 2}px; line-height: 1.4; font-weight: 800; letter-spacing: 0.5px; color: ${style.headingColor};">${formatInline(block.text)}</p><div style="width: 56px; height: 4px; background: linear-gradient(90deg, ${style.accent}, transparent); border-radius: 999px;"></div></section>`;

    case "lead":
      return `<section style="margin: 0 0 26px; padding: 18px 18px; background: linear-gradient(135deg, ${style.softBg}, #ffffff); border-radius: 16px;"><p style="margin: 0; font-size: ${style.bodySize + 1}px; line-height: ${style.lineHeight}; color: ${style.bodyColor}; font-weight: 500;">${formatInline(block.text)}</p></section>`;

    case "section":
      return `<section style="margin: 38px 0 18px;"><p style="margin: 0; font-size: ${style.h2Size + 1}px; line-height: 1.5; font-weight: 800; color: ${style.headingColor};">${formatInline(block.text)}</p><div style="margin-top: 10px; width: 36px; height: 3px; background-color: ${style.accent}; border-radius: 999px;"></div></section>`;

    case "subsection":
      return `<p style="margin: 24px 0 12px; font-size: ${style.h3Size}px; line-height: 1.6; font-weight: 700; color: ${style.headingColor};">${formatInline(block.text)}</p>`;

    case "paragraph":
      return `<p style="margin: 0 0 20px; font-size: ${style.bodySize}px; line-height: ${style.lineHeight}; color: ${style.bodyColor}; text-align: justify;">${formatInline(block.text)}</p>`;

    case "quote":
      return `<section style="margin: 22px 0; padding: 16px 18px; background: linear-gradient(135deg, ${style.quoteBg}, #ffffff); border-radius: 14px; border-left: 4px solid ${style.accent};"><p style="margin: 0; font-size: ${style.bodySize}px; line-height: ${style.lineHeight}; color: ${style.bodyColor}; font-weight: 500;">${formatInline(block.text)}</p></section>`;

    case "golden":
      return `<section style="margin: 28px 0; text-align: center;"><p style="display: inline-block; margin: 0; padding: 12px 18px; background: linear-gradient(135deg, ${style.accent}, #6aa0ff); color: #ffffff; font-size: ${style.bodySize + 1}px; line-height: 1.8; font-weight: 800; border-radius: 999px; box-shadow: 0 6px 16px rgba(0,0,0,0.08);">${formatInline(block.text)}</p></section>`;

    case "summary":
      return `<section style="margin: 30px 0 22px; padding: 22px 20px; background: linear-gradient(135deg, ${style.summaryBg}, #000000); color: ${style.summaryColor}; border-radius: 18px;"><p style="margin: 0; font-size: ${style.bodySize + 1}px; line-height: ${style.lineHeight}; font-weight: 600;">${formatInline(block.text)}</p></section>`;

    case "cta":
      return `<section style="margin: 32px 0 0; padding: 20px 18px; background: linear-gradient(135deg, ${style.softBg}, #ffffff); border-radius: 18px; text-align: center;"><p style="margin: 0; font-size: ${style.bodySize + 2}px; line-height: ${style.lineHeight}; color: ${style.headingColor}; font-weight: 800;">${formatInline(block.text)}</p></section>`;

    case "image":
      return `<section style="margin: 24px 0;"><div style="padding: 16px; background-color: #fbfbfb; border: 1px solid #ececec; border-radius: 14px; text-align: center;"><p style="margin: 0; color: #7d8795; font-size: 14px; line-height: 1.8;">${formatInline(block.text)}</p></div><p style="margin: 10px 0 0; text-align: center; font-size: 13px; line-height: 1.8; color: #a0a0a0;">点击替换图片</p></section>`;

    case "list":
      return `<section style="margin: 20px 0; padding: 18px 18px; background: linear-gradient(135deg, ${style.softBg}, #ffffff); border-radius: 16px;">${block.items.map((item) => {
        const matched = item.match(/^([^：:]{2,20})[:：](.+)$/);
        if (matched) {
          return `<p style="margin: 0 0 14px; font-size: ${style.bodySize}px; line-height: ${style.lineHeight}; color: ${style.bodyColor};"><span style="color: ${style.headingColor}; font-weight: 800;">${formatInline(matched[1])}：</span>${formatInline(matched[2])}</p>`;
        }
        return `<p style="margin: 0 0 14px; font-size: ${style.bodySize}px; line-height: ${style.lineHeight}; color: ${style.bodyColor};">🔥 ${formatInline(item)}</p>`;
      }).join("")}</section>`;

    case "card":
      return `<section style="margin: 18px 0; padding: 18px 18px; background: linear-gradient(135deg, ${style.softBg}, #ffffff); border-radius: 16px;"><p style="margin: 0 0 8px; font-size: ${style.bodySize}px; line-height: 1.8; color: ${style.headingColor}; font-weight: 800;">${formatInline(block.title || "")}</p><p style="margin: 0; font-size: ${style.bodySize}px; line-height: ${style.lineHeight}; color: ${style.bodyColor};">${formatInline(block.body)}</p></section>`;

    default:
      return "";
  }
}

function buildWechatHtml(raw: string, style: StyleConfig) {
  const blocks = parseBlocks(raw);
  return `<section style="max-width: 100%; font-size: ${style.bodySize}px; line-height: ${style.lineHeight}; color: ${style.bodyColor};">\n${blocks.map((b) => renderBlock(b, style)).join("\n\n")}\n</section>`;
}

const defaultArticle = `【项目实战】GPT Image 2深度测评：它不再是一个画图工具

说到底，AI生图正在经历一场认知革命。
当GPT Image 2开始"思考"的时候，画图这件事的本质变了。

不是工具升级，是范式转移。

为什么这次不一样？
OpenAI这次放出的GPT Image 2，本质上在验证一个判断：下一代图像生成模型的核心竞争力，不再是"画得像不像"，而是"想得对不对"。

一、人像一致性突破：终于能"讲完一个故事"了
核心突破：多图场景下保持同一个人脸特征

韩国创作者做的"偶像九宫格"是教科书级案例——同一个韩国偶像在不同场景下，九张图面部特征完全一致。

配图：偶像九宫格案例图片

以前的AI生图，每次生成都是独立事件。一张图里的人是"A"，下一张图里的人可能是"A的亲戚"。
GPT Image 2不一样。它能理解你需要一个"连续叙事"，然后主动去维持视觉一致性。

二、叙事能力进化：12格分镜，一个角色的故事线
如果说九宫格是"同一时刻的不同切片"，那12格分镜就是"同一角色的不同时刻"。

- 入门门槛降低：你不需要学会写Prompt的技术语言
- 应用场景拓宽：从个人创作到商业应用，边界在消融
- 效率革命：概念到视觉的转化周期，从天缩短到小时

写在最后
AI生图正在从"执行者"变成"协作者"。

💡 我整理了一些优秀的GPT Image 2玩法案例，私信"GPT"我发你。`;



export default function WechatArticleFormatterApp() {
  const [input, setInput] = useState(defaultArticle);
  const [template, setTemplate] = useState<TemplateKey>("tech");
  const [style, setStyle] = useState<StyleConfig>(templateMap.tech);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const html = useMemo(() => buildWechatHtml(input, style), [input, style]);
  const blocks = useMemo(() => parseBlocks(input), [input]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(html);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error(e);
    }
  };

  const handleTemplateChange = (value: TemplateKey) => {
    setTemplate(value);
    setStyle(templateMap[value]);
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
    setTemplate("tech");
    setStyle(templateMap.tech);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">微信公众号文章自动排版器</h1>
          <p className="mt-2 text-sm text-slate-600">
            支持多模板切换、Markdown 导入、HTML 导出、图片占位识别，以及更强的文章结构分析。
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-1 rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">排版设置</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>模板风格</Label>
                <Select value={template} onValueChange={handleTemplateChange}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tech">科技感</SelectItem>
                    <SelectItem value="business">商业感</SelectItem>
                    <SelectItem value="emotion">情绪风</SelectItem>
                    <SelectItem value="minimal">极简专栏</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>主标题字号</Label>
                  <Input type="number" value={style.h1Size} onChange={(e) => setStyle({ ...style, h1Size: Number(e.target.value) || style.h1Size })} />
                </div>
                <div className="space-y-2">
                  <Label>正文字号</Label>
                  <Input type="number" value={style.bodySize} onChange={(e) => setStyle({ ...style, bodySize: Number(e.target.value) || style.bodySize })} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>强调色</Label>
                  <Input value={style.accent} onChange={(e) => setStyle({ ...style, accent: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>浅色背景</Label>
                  <Input value={style.softBg} onChange={(e) => setStyle({ ...style, softBg: e.target.value, quoteBg: e.target.value })} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="rounded-xl">
                  <Upload className="mr-2 h-4 w-4" />导入 Markdown
                </Button>
                <Button onClick={handleExportHtml} variant="outline" className="rounded-xl">
                  <FileDown className="mr-2 h-4 w-4" />导出 .html
                </Button>
              </div>

              <input ref={fileInputRef} type="file" accept=".md,.markdown,.txt" className="hidden" onChange={handleImportMarkdown} />

              <div className="flex gap-3 pt-2">
                <Button onClick={reset} variant="outline" className="flex-1 rounded-xl">
                  <RefreshCcw className="mr-2 h-4 w-4" />重置
                </Button>
                <Button onClick={handleCopy} className="flex-1 rounded-xl">
                  <Copy className="mr-2 h-4 w-4" />{copied ? "已复制" : "复制HTML"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="xl:col-span-2 rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Wand2 className="h-5 w-5" /> 内容输入与生成结果
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="input" className="w-full">
                <TabsList className="mb-4 grid w-full grid-cols-4 rounded-xl">
                  <TabsTrigger value="input">输入文章</TabsTrigger>
                  <TabsTrigger value="preview">效果预览</TabsTrigger>
                  <TabsTrigger value="html">HTML源码</TabsTrigger>
                  <TabsTrigger value="structure">结构识别</TabsTrigger>
                </TabsList>

                <TabsContent value="input" className="space-y-3">
                  <Textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    className="min-h-[620px] rounded-2xl font-mono text-sm"
                    placeholder="把你的文章内容或 Markdown 粘贴到这里"
                  />
                </TabsContent>

                <TabsContent value="preview">
                  <div className="min-h-[620px] rounded-2xl border bg-white p-6">
                    <div dangerouslySetInnerHTML={{ __html: html }} />
                  </div>
                </TabsContent>

                <TabsContent value="html">
                  <Textarea readOnly value={html} className="min-h-[620px] rounded-2xl font-mono text-xs" />
                </TabsContent>

                <TabsContent value="structure">
                  <div className="min-h-[620px] rounded-2xl border bg-white p-4">
                    <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <div className="text-xs text-slate-500">识别到的小节</div>
                        <div className="mt-1 text-2xl font-bold text-slate-900">{blocks.filter((b) => b.type === "section").length}</div>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <div className="text-xs text-slate-500">图片占位</div>
                        <div className="mt-1 text-2xl font-bold text-slate-900">{blocks.filter((b) => b.type === "image").length}</div>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <div className="text-xs text-slate-500">列表模块</div>
                        <div className="mt-1 text-2xl font-bold text-slate-900">{blocks.filter((b) => b.type === "list").length}</div>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <div className="text-xs text-slate-500">金句/CTA</div>
                        <div className="mt-1 text-2xl font-bold text-slate-900">{blocks.filter((b) => b.type === "golden" || b.type === "cta").length}</div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {blocks.map((block, idx) => (
                        <div key={idx} className="rounded-2xl border border-slate-200 p-4">
                          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500">
                            {block.type === "image" && <ImageIcon className="h-4 w-4" />}
                            <span>{block.type}</span>
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
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          {Object.entries(templateMap).map(([key, tpl]) => (
            <button
              key={key}
              onClick={() => handleTemplateChange(key as TemplateKey)}
              className={`rounded-2xl border p-4 text-left transition ${template === key ? "border-slate-900 bg-white shadow-sm" : "border-slate-200 bg-slate-50"}`}
            >
              <div className="mb-3 text-sm font-semibold text-slate-900">{tpl.name}</div>
              <div className="flex gap-2">
                <span className="h-4 w-10 rounded-full" style={{ backgroundColor: tpl.accent }} />
                <span className="h-4 w-10 rounded-full" style={{ backgroundColor: tpl.softBg }} />
                <span className="h-4 w-10 rounded-full" style={{ backgroundColor: tpl.summaryBg }} />
              </div>
              <div className="mt-3 text-xs leading-6 text-slate-500">适合 {tpl.name === "科技感" ? "AI、产品、趋势分析" : tpl.name === "商业感" ? "案例拆解、品牌、增长内容" : tpl.name === "情绪风" ? "故事、文案、生活方式" : "专栏、深度文章、知识表达"}</div>
            </button>
          ))}
        </div>

        <div className="mt-6 rounded-2xl border bg-white p-5 text-sm leading-7 text-slate-600 shadow-sm">
          <p className="font-semibold text-slate-900">已增强的能力</p>
          <p>1. 多模板切换：科技感、商业感、情绪风、极简专栏。</p>
          <p>2. 图片占位自动识别：支持"配图：""图片：""此处插入："等写法。</p>
          <p>3. 导入 Markdown / 导出 .html 文件。</p>
          <p>4. 更强的结构识别：自动识别导语、总结、金句、卡片模块、CTA 与列表。</p>
          <p>5. 纯前端使用：支持本地预览、复制 HTML 与下载 .html 文件。</p>
        </div>
      </div>
    </div>
  );
}
