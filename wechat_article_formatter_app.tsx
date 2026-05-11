"use client";

import React, { useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Copy, Code2, FileDown, Image as ImageIcon, RefreshCcw, Upload, Wand2 } from "lucide-react";
import { parseArticle } from "@/lib/article-parser";
import { copyRichText } from "@/lib/copy-rich-text";
import type { TemplateKey } from "@/lib/article-types";
import { renderWechatHtml } from "@/lib/wechat-renderer";
import { styleTemplates, templateList } from "@/lib/style-templates";

const defaultArticle = `【项目实战】GPT Image 2深度测评：它不再是一个画图工具

说到底，AI生图正在经历一场认知革命。
当GPT Image 2开始"思考"的时候，画图这件事的本质变了。

不是工具升级，是范式转移。

为什么这次不一样？
OpenAI这次放出的GPT Image 2，本质上在验证一个判断：下一代图像生成模型的核心竞争力，不再是"画得像不像"，而是"想得对不对"。

一、人像一致性突破：终于能"讲完一个故事"了
核心突破：多图场景下保持同一个人脸特征

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

export default function WechatArticleFormatterApp() {
  const [input, setInput] = useState(defaultArticle);
  const [templateKey, setTemplateKey] = useState<TemplateKey>("baoyuDefaultBlue");
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
    setTemplateKey("baoyuDefaultBlue");
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">微信公众号文章自动排版器</h1>
            <p className="mt-2 text-sm text-slate-600">纯前端排版工具：输入文章，选择风格，复制富文本到公众号编辑器。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleCopyRichText} className="rounded-xl">
              <Copy className="mr-2 h-4 w-4" />
              {copiedRich ? "已复制富文本" : "复制富文本"}
            </Button>
            <Button onClick={handleCopyHtml} variant="outline" className="rounded-xl">
              <Code2 className="mr-2 h-4 w-4" />
              {copiedHtml ? "已复制源码" : "复制HTML"}
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
