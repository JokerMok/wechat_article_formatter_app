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
