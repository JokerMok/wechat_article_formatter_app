import type { UnifiedArticleBlock, UnifiedArticleContent } from "../content";
import type { PlatformId } from "../platforms/types";
import type { DesignPlan } from "./types";

export function buildPlatformArticle(source: UnifiedArticleContent, platform: PlatformId, plan: DesignPlan): UnifiedArticleContent {
  const titleBlock = source.blocks.find((block) => block.type === "title");
  const leadBlock = source.blocks.find((block) => block.type === "lead");
  const title = plan.recommendedTitle || source.title || "未命名文章";
  const titleNode = titleBlock ? updateTextBlock(titleBlock, title) : createTextBlock(source, "title", title, "plan-title");

  if (platform === "wechat") {
    const blocks = source.blocks.map((block) => (block.type === "title" ? titleNode : cloneBlock(block)));
    return { ...source, title, blocks: titleBlock ? blocks : [titleNode, ...blocks] };
  }

  if (platform === "douyinLongform") {
    const body = source.blocks.filter((block) => block.type !== "title").map(cloneBlock);
    const withLead = leadBlock ? body : [createTextBlock(source, "lead", plan.hook, "plan-hook"), ...body];
    return { ...source, title, blocks: [titleNode, ...withLead] };
  }

  const withoutFraming = source.blocks
    .filter((block) => block.type !== "title" && block.type !== "lead" && block.type !== "pageBreak")
    .map(cloneBlock);
  const coverLead = leadBlock ? updateTextBlock(leadBlock, plan.hook) : createTextBlock(source, "lead", plan.hook, "plan-hook");
  const body = withoutFraming.filter((block) => block.type !== "summary" && block.type !== "cta");
  const existingSummary = withoutFraming.find((block) => block.type === "summary");
  const existingCta = withoutFraming.find((block) => block.type === "cta");
  const conclusion = existingSummary ?? createTextBlock(source, "summary", plan.summary, "plan-summary");
  const action = existingCta ?? createTextBlock(source, "cta", plan.callToAction, "plan-action");

  const blocks: UnifiedArticleBlock[] = [
    titleNode,
    coverLead,
    ...body,
  ];

  if (body.length > 0) blocks.push(createPageBreak(source, "plan-summary-break"));
  blocks.push(conclusion, action);

  return { ...source, title, blocks };
}

function createTextBlock(
  source: UnifiedArticleContent,
  type: "title" | "lead" | "summary" | "cta",
  text: string,
  id: string,
): UnifiedArticleBlock {
  const reference = source.blocks[0]?.source ?? {
    startLine: 1,
    endLine: 1,
    startOffset: 0,
    endOffset: text.length,
    sourceText: text,
  };
  return {
    id,
    type,
    text,
    plainText: text,
    markdown: type === "title" ? `# ${text}` : text,
    source: { ...reference },
  };
}

function createPageBreak(source: UnifiedArticleContent, id: string): UnifiedArticleBlock {
  const reference = source.blocks[0]?.source ?? {
    startLine: 1,
    endLine: 1,
    startOffset: 0,
    endOffset: 0,
    sourceText: "",
  };
  return {
    id,
    type: "pageBreak",
    text: "",
    plainText: "",
    markdown: "---",
    source: { ...reference },
  };
}

function updateTextBlock(block: UnifiedArticleBlock, text: string): UnifiedArticleBlock {
  if (block.type === "list" || block.type === "card" || block.type === "divider" || block.type === "pageBreak") return cloneBlock(block);
  return { ...block, text, plainText: text, markdown: block.type === "title" ? `# ${text}` : text, source: { ...block.source } };
}

function cloneBlock(block: UnifiedArticleBlock): UnifiedArticleBlock {
  if (block.type === "list") return { ...block, items: [...block.items], source: { ...block.source } };
  return { ...block, source: { ...block.source } };
}
