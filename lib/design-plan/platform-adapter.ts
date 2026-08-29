import type { UnifiedArticleBlock, UnifiedArticleContent } from "../content";
import { getDesignScheme } from "../design-schemes";
import type { PlatformId } from "../platforms/types";
import { cleanPublishingText, isGenericStructureHeading, publicationBlocks } from "./content-filter";
import type { DesignPlan } from "./types";

type CardPlatform = "xiaohongshu" | "douyinImage";
type SemanticGroup = { title: string; body: string[]; kind: "section" | "point" | "sentence" };

const NON_BODY_TYPES = new Set<UnifiedArticleBlock["type"]>(["title", "lead", "summary", "cta", "pageBreak", "divider"]);

export function buildPlatformArticle(source: UnifiedArticleContent, platform: PlatformId, plan: DesignPlan): UnifiedArticleContent {
  if (platform === "wechat") return buildWechatArticle(source, plan);
  if (platform === "douyinLongform") return buildDouyinLongformArticle(source, plan);
  return buildCardArticle(source, platform, plan);
}

function buildWechatArticle(source: UnifiedArticleContent, plan: DesignPlan): UnifiedArticleContent {
  const title = plan.recommendedTitle || source.title || "未命名文章";
  const titleNode = createTextBlock(source, "title", title, "plan-wechat-title");
  const body = normalizedSourceBody(source, 168, plan);
  const lead = createTextBlock(source, "lead", plan.openingHook, "plan-wechat-lead");
  const blocks: UnifiedArticleBlock[] = [titleNode];

  if (!sameMeaning(plan.openingHook, firstBodyText(body))) blocks.push(lead);
  blocks.push(...body);

  if (
    !body.some((block) => block.type === "summary")
    && !sameMeaning(plan.conclusion, lastBodyText(body))
    && !sameMeaning(plan.conclusion, plan.openingHook)
  ) {
    blocks.push(createTextBlock(source, "summary", plan.conclusion, "plan-wechat-summary"));
  }
  if (plan.callToAction) blocks.push(createTextBlock(source, "cta", plan.callToAction, "plan-wechat-action"));

  return { ...source, title, blocks };
}

function buildDouyinLongformArticle(source: UnifiedArticleContent, plan: DesignPlan): UnifiedArticleContent {
  const title = plan.recommendedTitle || source.title || "未命名文章";
  const openingHook = clipAtBoundary(plan.openingHook, 48);
  const body = removeOpeningOverlap(normalizedSourceBody(source, 118, plan), openingHook).filter((block) => block.type !== "image");
  const blocks: UnifiedArticleBlock[] = [
    createTextBlock(source, "title", title, "plan-douyin-long-title"),
    createTextBlock(source, "lead", openingHook, "plan-douyin-long-lead"),
  ];

  if (!body.some((block) => block.type === "section" || block.type === "subsection") && body.length > 3) {
    blocks.push(createTextBlock(source, "section", sectionLeadFor(plan), "plan-douyin-long-section"));
  }
  blocks.push(...body);
  if (!sameMeaning(plan.conclusion, lastBodyText(body))) {
    blocks.push(createTextBlock(source, "summary", plan.conclusion, "plan-douyin-long-summary"));
  }
  if (plan.callToAction) blocks.push(createTextBlock(source, "cta", plan.callToAction, "plan-douyin-long-action"));

  return { ...source, title, blocks };
}

function buildCardArticle(source: UnifiedArticleContent, platform: CardPlatform, plan: DesignPlan): UnifiedArticleContent {
  const isXiaohongshu = platform === "xiaohongshu";
  const variant = getDesignScheme(plan.recommendedScheme).layoutVariant;
  const targetPages = isXiaohongshu ? plan.pagination.xiaohongshuTargetPages : plan.pagination.douyinImageTargetPages;
  const title = plan.recommendedTitle || source.title || "未命名文章";
  const coverTitle = compactCoverTitle(title, isXiaohongshu ? 16 : 14);
  const middleCount = Math.max(2, targetPages - 4);
  const middlePages = buildMiddlePages(source, plan, middleCount);
  const pageCopy = cardPageCopy(variant);
  const pages: UnifiedArticleBlock[][] = [
    [
      createTextBlock(source, "title", coverTitle, `${platform}-cover-title`),
      createTextBlock(source, "lead", clipAtBoundary(plan.openingHook, isXiaohongshu ? 58 : 42), `${platform}-cover-hook`),
    ],
    [
      createTextBlock(source, "section", pageCopy.coreHeading, `${platform}-core-heading`),
      createTextBlock(source, "golden", clipAtBoundary(plan.coreMessage, isXiaohongshu ? 120 : 76), `${platform}-core-message`),
    ],
    ...middlePages.map((page, index) => [
      createTextBlock(
        source,
        "section",
        middlePageHeading(variant, page.title, index, isXiaohongshu ? 26 : 20),
        `${platform}-point-${index + 1}-heading`,
      ),
      ...page.body.slice(0, isXiaohongshu ? 2 : 1).map((text, bodyIndex) =>
        createTextBlock(source, "paragraph", clipAtBoundary(text, isXiaohongshu ? 145 : 88), `${platform}-point-${index + 1}-body-${bodyIndex + 1}`),
      ),
    ]),
    [
      createTextBlock(source, "section", pageCopy.summaryHeading, `${platform}-summary-heading`),
      createListBlock(source, plan.keyPoints.slice(0, isXiaohongshu ? 4 : 3).map((point) => clipAtBoundary(point, isXiaohongshu ? 54 : 36)), `${platform}-summary-list`),
    ],
    [
      createTextBlock(source, "summary", clipAtBoundary(plan.conclusion, isXiaohongshu ? 110 : 70), `${platform}-ending-summary`),
      ...(plan.callToAction ? [createTextBlock(source, "cta", clipAtBoundary(plan.callToAction, 48), `${platform}-ending-action`)] : []),
    ],
  ];

  return {
    ...source,
    title,
    blocks: pages.flatMap((page, index) => index === pages.length - 1 ? page : [...page, createPageBreak(source, `${platform}-break-${index + 1}`)]),
  };
}

function buildMiddlePages(source: UnifiedArticleContent, plan: DesignPlan, count: number): SemanticGroup[] {
  const groups = collectSemanticGroups(source)
    .map((group) => removeFramingOverlap(group, plan))
    .filter((group): group is SemanticGroup => Boolean(group));
  // A key point is already a publishable fact. Do not guess a supporting
  // paragraph from nearby source blocks: weak keyword matches can bind the
  // same unrelated paragraph to several cards.
  const pointFallback: SemanticGroup[] = plan.keyPoints.map((point) => ({ title: point, body: [point], kind: "point" }));
  const sentenceFallback = publicationBlocks(source)
    .filter((block) => block.type === "paragraph" || block.type === "quote" || block.type === "golden")
    .flatMap((block) => splitSentences(blockText(block)))
    .filter((text) => text.length >= 12)
    .map((text) => ({
      title: compactHeading(text, 22),
      body: [text],
      kind: "sentence" as const,
    }));
  const sectionGroups = groups.filter((group) => group.kind === "section");
  const detailGroups = groups.filter((group) => group.kind !== "section");
  const candidates = uniqueGroups([...sectionGroups, ...detailGroups, ...pointFallback, ...sentenceFallback]);
  return candidates.slice(0, count);
}

function removeFramingOverlap(group: SemanticGroup, plan: DesignPlan): SemanticGroup | null {
  const body = group.body.filter((text) => !sameMeaning(text, plan.coreMessage) && !sameMeaning(text, plan.openingHook));
  if (!body.length) return null;
  const titleOverlapsFraming = sameMeaning(group.title, plan.coreMessage) || sameMeaning(group.title, plan.openingHook);
  return {
    ...group,
    title: titleOverlapsFraming ? compactHeading(body[0], 28) : group.title,
    body,
  };
}

function cardPageCopy(variant: ReturnType<typeof getDesignScheme>["layoutVariant"]) {
  if (variant === "checklist") return { coreHeading: "先明确要完成什么", summaryHeading: "执行前再核对" };
  if (variant === "data") return { coreHeading: "先看结论", summaryHeading: "结论与依据" };
  if (variant === "story") return { coreHeading: "故事的起点", summaryHeading: "这段经历留下什么" };
  return { coreHeading: "先看核心判断", summaryHeading: "带走这几点" };
}

function middlePageHeading(
  variant: ReturnType<typeof getDesignScheme>["layoutVariant"],
  title: string,
  index: number,
  maxLength: number,
) {
  const compact = compactHeading(title, Math.max(6, maxLength - 5));
  const number = String(index + 1).padStart(2, "0");
  if (variant === "checklist") return clipAtBoundary(`步骤 ${number}｜${compact}`, maxLength);
  if (variant === "data") return clipAtBoundary(`证据 ${number}｜${compact}`, maxLength);
  if (variant === "story") return clipAtBoundary(`第 ${index + 1} 章｜${compact}`, maxLength);
  return compactHeading(title, maxLength);
}

function collectSemanticGroups(source: UnifiedArticleContent): SemanticGroup[] {
  const groups: SemanticGroup[] = [];
  let current: SemanticGroup | undefined;

  for (const block of publicationBlocks(source)) {
    if (NON_BODY_TYPES.has(block.type) || block.type === "code" || block.type === "image") continue;
    if (block.type === "section" || block.type === "subsection") {
      current = { title: publishingHeadingText(block.text), body: [], kind: "section" };
      groups.push(current);
      continue;
    }
    if (block.type === "list") {
      current = undefined;
      for (const item of block.items.map(cleanPublishingText).filter(Boolean)) {
        groups.push({ title: item, body: [item], kind: "point" });
      }
      continue;
    }
    const text = blockText(block).trim();
    if (!text) continue;
    if (!current) {
      current = { title: compactHeading(text, 22), body: [], kind: "sentence" };
      groups.push(current);
    }
    current.body.push(text);
    if (current.body.length >= 2) current = undefined;
  }

  return groups
    .filter((group) => group.title && group.body.length > 0)
    .map((group) => ({
      ...group,
      title: isGenericStructureHeading(group.title) ? compactHeading(group.body[0] ?? group.title, 22) : group.title,
    }));
}

function normalizedSourceBody(source: UnifiedArticleContent, paragraphLimit: number, plan: DesignPlan): UnifiedArticleBlock[] {
  return publicationBlocks(source).flatMap((block) => {
    if (NON_BODY_TYPES.has(block.type)) return [];
    const cleaned = cleanBlock(block);
    if (!blockText(cleaned)) return [];
    if ((cleaned.type === "section" || cleaned.type === "subsection") && isGenericStructureHeading(cleaned.text)) {
      return [updateTextBlock(cleaned, publishingHeadingFor(cleaned.text, plan), `${cleaned.id}:publishing-heading`)];
    }
    if (cleaned.type !== "paragraph" || cleaned.text.length <= paragraphLimit) return [cleaned];
    return splitParagraph(cleaned.text, paragraphLimit).map((text, index) => updateTextBlock(cleaned, text, `${cleaned.id}:part:${index + 1}`));
  });
}

function publishingHeadingFor(value: string, plan: DesignPlan) {
  if (/^核心信息$/u.test(value)) return sectionLeadFor(plan);
  if (/^(内容结构|文章结构|主要内容|正文)$/u.test(value)) {
    const count = Math.max(3, Math.min(5, plan.keyPoints.length));
    if (plan.contentType === "checklistGuide" || plan.contentType === "knowledgeTutorial") return `${count}个关键步骤`;
    if (plan.contentType === "caseReview" || plan.contentType === "storyNarrative") return `${count}个关键环节`;
    return `${count}个核心判断`;
  }
  if (/^背景$/u.test(value)) return "事情从哪里开始";
  if (/^目标$/u.test(value)) return "先明确目标";
  if (/^(总结|结语)$/u.test(value)) return "最后的判断";
  return value;
}

function removeOpeningOverlap(blocks: UnifiedArticleBlock[], openingHook: string) {
  const hook = cleanPublishingText(openingHook).replace(/[…]+$/u, "").trim();
  let checkedFirstBody = false;

  return blocks.flatMap((block) => {
    if (checkedFirstBody || block.type === "section" || block.type === "subsection") return [block];
    if (block.type !== "paragraph" && block.type !== "quote" && block.type !== "golden") return [block];
    checkedFirstBody = true;

    const text = blockText(block);
    if (!hook || !text) return [block];
    if (hook === text) return [];
    if (!text.startsWith(hook)) return [block];

    const remainder = text.slice(hook.length).replace(/^[，。！？；：、\s]+/u, "").trim();
    return remainder ? [updateTextBlock(block, remainder, `${block.id}:after-hook`)] : [];
  });
}

function splitParagraph(text: string, maxLength: number) {
  const sentences = text.split(/(?<=[。！？；])/u).map((part) => part.trim()).filter(Boolean);
  if (sentences.length <= 1) return splitByLength(text, maxLength);
  const parts: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > maxLength) {
      parts.push(current);
      current = "";
    }
    if (sentence.length > maxLength) {
      if (current) parts.push(current);
      parts.push(...splitByLength(sentence, maxLength));
      current = "";
    } else {
      current += sentence;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function splitByLength(text: string, maxLength: number) {
  const parts: string[] = [];
  for (let start = 0; start < text.length; start += maxLength) parts.push(text.slice(start, start + maxLength));
  return parts;
}

function splitSentences(text: string) {
  return text
    .split(/(?<=[。！？；])/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function sectionLeadFor(plan: DesignPlan) {
  const labels: Record<DesignPlan["contentType"], string> = {
    knowledgeTutorial: "先看方法",
    checklistGuide: "先明确任务",
    opinionAnalysis: "先看核心判断",
    dataInsight: "先看数据结论",
    caseReview: "问题从这里开始",
    storyNarrative: "故事从这里开始",
    productIntroduction: "先看它解决什么",
    experienceSharing: "先说真实体会",
  };
  return labels[plan.contentType];
}

function compactCoverTitle(title: string, maxLength: number) {
  const firstClause = title.split(/[：:｜|。！？]/)[0]?.trim();
  if (firstClause && firstClause.length >= 8 && firstClause.length <= maxLength) return firstClause;
  const action = firstClause?.match(/用\s*([A-Za-z0-9.+-]{2,16})\s*(拆解|复盘|整理|分析|搭建|优化)(.+)$/u);
  if (action) {
    const actionTitle = `${action[1]}${action[2]}${action[3]}`.replace(/\s+/g, "");
    if (actionTitle.length <= maxLength) return actionTitle;
  }
  return clipAtBoundary(title, maxLength);
}

function compactHeading(value: string, maxLength: number) {
  const firstClause = value.split(/[：:。！？；，]/)[0]?.trim() || value;
  return clipAtBoundary(firstClause, maxLength);
}

function clipAtBoundary(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").replace(/^#+\s*/, "").replace(/^>\s*/, "").trim();
  if (normalized.length <= maxLength) return normalized;
  const candidate = normalized.slice(0, Math.max(1, maxLength - 1));
  const sentenceBoundary = Math.max(candidate.lastIndexOf("。"), candidate.lastIndexOf("！"), candidate.lastIndexOf("？"), candidate.lastIndexOf("；"));
  if (sentenceBoundary >= Math.floor(maxLength * 0.5)) return candidate.slice(0, sentenceBoundary + 1).trim();
  const clauseBoundary = Math.max(candidate.lastIndexOf("，"), candidate.lastIndexOf("、"), candidate.lastIndexOf("："));
  const clipped = clauseBoundary >= Math.floor(maxLength * 0.72) ? candidate.slice(0, clauseBoundary) : candidate;
  return `${clipped.trim()}…`;
}

function publishingHeadingText(value: string) {
  return cleanPublishingText(value).replace(/^\d{4}-\d{2}-\d{2}\s+延伸素材[:：]\s*/u, "");
}

function uniqueGroups(groups: SemanticGroup[]) {
  const seen = new Set<string>();
  return groups.filter((group) => {
    const key = `${group.title}:${group.body.join("")}`.replace(/\s+/g, "").slice(0, 80);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function blockText(block: UnifiedArticleBlock) {
  if (block.type === "list") return cleanPublishingText(block.items.join("\n"));
  if (block.type === "card") return cleanPublishingText([block.title, block.body].filter(Boolean).join("："));
  return cleanPublishingText(block.text);
}

function cleanBlock(block: UnifiedArticleBlock): UnifiedArticleBlock {
  if (block.type === "list") {
    return { ...block, items: block.items.map(cleanPublishingText).filter(Boolean), source: { ...block.source } };
  }
  if (block.type === "card") {
    return {
      ...block,
      title: block.title ? cleanPublishingText(block.title) : undefined,
      body: cleanPublishingText(block.body),
      plainText: cleanPublishingText(block.plainText),
      markdown: cleanPublishingText(block.markdown),
      source: { ...block.source },
    };
  }
  if (block.type === "divider" || block.type === "pageBreak") return cloneBlock(block);
  const text = block.type === "section" || block.type === "subsection"
    ? publishingHeadingText(block.text)
    : cleanPublishingText(block.text);
  return { ...block, text, plainText: text, markdown: text, source: { ...block.source } };
}

function firstBodyText(blocks: UnifiedArticleBlock[]) {
  return blocks
    .filter((block) => block.type !== "section" && block.type !== "subsection")
    .map(blockText)
    .find(Boolean) ?? "";
}

function lastBodyText(blocks: UnifiedArticleBlock[]) {
  return [...blocks].reverse().map(blockText).find(Boolean) ?? "";
}

function sameMeaning(left: string, right: string) {
  const normalize = (value: string) => value.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 40);
  const a = normalize(left);
  const b = normalize(right);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

function createTextBlock(
  source: UnifiedArticleContent,
  type: "title" | "lead" | "section" | "paragraph" | "golden" | "summary" | "cta",
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
  const markdownPrefix = type === "title" ? "# " : type === "section" ? "## " : type === "golden" ? "> " : "";
  return { id, type, text, plainText: text, markdown: `${markdownPrefix}${text}`, source: { ...reference } };
}

function createListBlock(source: UnifiedArticleContent, items: string[], id: string): UnifiedArticleBlock {
  const reference = source.blocks[0]?.source ?? {
    startLine: 1,
    endLine: 1,
    startOffset: 0,
    endOffset: items.join("").length,
    sourceText: items.join("\n"),
  };
  return {
    id,
    type: "list",
    items,
    text: items.join(""),
    plainText: items.join("\n"),
    markdown: items.map((item) => `- ${item}`).join("\n"),
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
  return { id, type: "pageBreak", text: "", plainText: "", markdown: "---", source: { ...reference } };
}

function updateTextBlock(block: UnifiedArticleBlock, text: string, id: string): UnifiedArticleBlock {
  if (block.type === "list" || block.type === "card" || block.type === "divider" || block.type === "pageBreak") return cloneBlock(block);
  return { ...block, id, text, plainText: text, markdown: text, source: { ...block.source } };
}

function cloneBlock(block: UnifiedArticleBlock): UnifiedArticleBlock {
  if (block.type === "list") return { ...block, items: [...block.items], source: { ...block.source } };
  return { ...block, source: { ...block.source } };
}
