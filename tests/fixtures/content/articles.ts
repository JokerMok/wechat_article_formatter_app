export type FixedArticle = {
  id: string;
  title: string;
  category:
    | "plain"
    | "markdown"
    | "long"
    | "list"
    | "quote"
    | "image"
    | "brokenMarkdown"
    | "isolatedQuote"
    | "styleResidue"
    | "longParagraph"
    | "longEnglish"
    | "empty";
  source: string;
};

const longBody = Array.from({ length: 34 }, (_, index) => {
  const n = index + 1;
  return `第 ${n} 段：内容排版系统需要在真实容量内分页，不能因为段落多就丢掉后半部分。这里保留不同长度的句子，用来检查重排、页码和导出顺序。`;
}).join("\n\n");

const longSingleParagraph = Array.from({ length: 42 }, (_, index) => `单段压力片段${index + 1}需要连续保留并自动换行`).join("，");

export const fixedArticles: FixedArticle[] = [
  {
    id: "plain-text",
    title: "普通文本：客服流程改造",
    category: "plain",
    source: `普通文本客服流程改造

客服团队每天重复回答价格、交付和售后问题。第一版不追求自动回复，只把高频问题整理成标准答案。

验收方式很简单：同类问题的回复更稳定，升级人工的边界更清楚。`,
  },
  {
    id: "markdown-headings",
    title: "Markdown 标题段落：内容资产盘点",
    category: "markdown",
    source: `# 内容资产盘点

这篇文章用 Markdown 标题和段落检查结构识别。

## 为什么先盘点

资料散在笔记、表格和聊天记录里，团队很难复用。

## 第一版怎么做

先列出最近一个月被反复询问的问题，再给每条资料补上来源和更新时间。`,
  },
  {
    id: "long-article",
    title: "长文：岗位 AI 提效复盘",
    category: "long",
    source: `# 岗位 AI 提效复盘

这是一篇用于分页压力测试的长文。

${longBody}

总结：长文验收的重点不是页数少，而是每一页都没有裁切和顺序错乱。`,
  },
  {
    id: "list-heavy",
    title: "列表：发布前检查清单",
    category: "list",
    source: `# 发布前检查清单

- 标题是否保留原文判断
- 图片是否能在预览和导出中出现
- 标签是否没有虚构事实
- 微信复制是否需要人工复核
- 项目包是否能导出并重新导入

列表后还要保留普通段落，防止列表吞掉后续正文。`,
  },
  {
    id: "quote-heavy",
    title: "引用：排版边界判断",
    category: "quote",
    source: `# 排版边界判断

> 不要用裁切制造稳定，也不要用截图更新掩盖回归。

引用之后是正文。系统应该保留引用语义，同时让公众号和图文版本都能继续编辑。`,
  },
  {
    id: "image-placeholder",
    title: "图片占位：本地素材",
    category: "image",
    source: `# 本地图片素材测试

配图：工作台截图

正文需要说明图片应该进入统一内容结构，并在图文预览里出现占位或真实图片。

![流程图](asset:e2e-placeholder-image)`,
  },
  {
    id: "broken-markdown",
    title: "异常 Markdown：损坏结构",
    category: "brokenMarkdown",
    source: `#

###

[坏掉的链接](https://example.com

**没有闭合的强调文本

正文仍然应该保留，不应该因为 Markdown 损坏而崩溃。`,
  },
  {
    id: "isolated-quote",
    title: "独立大于号：过滤空引用",
    category: "isolatedQuote",
    source: `# 空引用过滤

>
>
＞
&gt;

有效正文不能被前面的空引用影响。`,
  },
  {
    id: "font-weight-residue",
    title: "残留样式：font-weight 清理",
    category: "styleResidue",
    source: `# 粘贴残留清理

font-weight: 800;">这句来自富文本粘贴，应该只留下正文。

<span style="font-weight: 700;" onclick="evil()">保留文字，去掉事件和样式风险</span>`,
  },
  {
    id: "very-long-paragraph",
    title: "超长单段：连续换行压力",
    category: "longParagraph",
    source: `# 超长单段

${longSingleParagraph}。`,
  },
  {
    id: "extreme-english",
    title: "极端英文长度：长单词",
    category: "longEnglish",
    source: `# Extreme English Width

PneumonoultramicroscopicsilicovolcanoconiosisSupercalifragilisticexpialidociousAntidisestablishmentarianismNeedsToWrapWithoutHorizontalOverflow.

This paragraph mixes English and Chinese，用来检查窄屏和图文画布的换行边界。`,
  },
  {
    id: "empty-article",
    title: "空文章",
    category: "empty",
    source: "",
  },
];

export function articleById(id: FixedArticle["id"]) {
  const article = fixedArticles.find((candidate) => candidate.id === id);
  if (!article) throw new Error(`Unknown fixed article: ${id}`);
  return article;
}
