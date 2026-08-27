import type { UnifiedArticleBlock, UnifiedArticleContent } from "../content";
import { getDesignScheme, type DesignSchemeId } from "../design-schemes";
import { collectTags, renderBlockText, stableChecksum } from "../platforms/platform-profiles";
import type { PlatformId } from "../platforms/types";
import type { ContentBlockRole, ContentTone, DesignPlan, DesignPlanBlock } from "./types";

const CONTENT_RULES: Array<{ id: DesignSchemeId; pattern: RegExp; weight: number }> = [
  { id: "checklistGuide", pattern: /步骤|清单|攻略|避坑|注意事项|怎么做|如何|工具|方法/, weight: 3 },
  { id: "dataInsight", pattern: /数据|报告|趋势|增长|下降|同比|环比|调查|比例|统计|\d+(?:\.\d+)?%/, weight: 3 },
  { id: "storyNarrative", pattern: /我|我们|当时|后来|第一次|经历|复盘|故事|几个月|那天/, weight: 2 },
  { id: "productCase", pattern: /产品|客户|方案|案例|业务|功能|交付|实施|SOP|企业/, weight: 2 },
  { id: "lightRecommendation", pattern: /推荐|体验|好用|种草|生活|穿搭|护肤|旅行|适合谁|购买/, weight: 3 },
];

export function analyzeArticleDesign(content: UnifiedArticleContent): DesignPlan {
  const sourceRevision = stableChecksum(content.sourceText);
  const contentType = detectContentType(content);
  const scheme = getDesignScheme(contentType);
  const title = cleanLine(content.title || firstText(content, ["title", "section", "paragraph"]) || "未命名文章", 72);
  const coreThesis = cleanLine(firstText(content, ["summary", "golden", "quote", "lead", "paragraph"]) || title, 280);
  const hook = cleanLine(firstText(content, ["lead", "quote", "paragraph"]) || coreThesis, 220);
  const keyPoints = collectKeyPoints(content, coreThesis);
  const highlights = collectHighlights(content, keyPoints);
  const tone = detectTone(content, contentType);
  const textLength = content.blocks.reduce((total, block) => total + (renderBlockText(block)?.length ?? 0), 0);
  const audience = detectAudience(content.sourceText);
  const tags = collectTags(content, 8);
  const titleCandidates = buildTitleCandidates(title, contentType);

  return {
    schemaVersion: 1,
    sourceRevision,
    contentType,
    audience,
    coreThesis,
    tone,
    recommendedPlatforms: recommendPlatforms(contentType),
    recommendedScheme: scheme.id,
    palette: { ...scheme.palette },
    typography: { ...scheme.typography },
    density: scheme.density,
    coverStrategy: coverStrategyFor(contentType),
    blockOrder: content.blocks.map(toPlanBlock),
    highlights,
    pagination: {
      xiaohongshuTargetPages: clamp(Math.ceil(textLength / 360) + 2, textLength > 700 ? 6 : 3, 10),
      douyinImageTargetPages: clamp(Math.ceil(textLength / 480) + 1, textLength > 700 ? 4 : 2, 8),
    },
    callToAction: cleanLine(firstText(content, ["cta"]) || "结合你的场景，先选择一个最容易验证的动作。", 180),
    recommendationReason: recommendationReasonFor(contentType),
    titleCandidates,
    recommendedTitle: titleCandidates[0],
    hook,
    keyPoints,
    summary: cleanLine(firstText(content, ["summary"]) || coreThesis, 360),
    tags,
  };
}

function detectContentType(content: UnifiedArticleContent): DesignSchemeId {
  const text = content.sourceText;
  const scores = new Map<DesignSchemeId, number>([
    ["knowledgeMinimal", 1],
    ["dataInsight", 0],
    ["checklistGuide", content.blocks.some((block) => block.type === "list") ? 4 : 0],
    ["storyNarrative", content.parseMode === "narrative" ? 3 : 0],
    ["productCase", content.parseMode === "business" ? 3 : 0],
    ["lightRecommendation", 0],
  ]);

  for (const rule of CONTENT_RULES) {
    const matches = text.match(new RegExp(rule.pattern.source, `${rule.pattern.flags.includes("g") ? rule.pattern.flags : `${rule.pattern.flags}g`}`));
    scores.set(rule.id, (scores.get(rule.id) ?? 0) + Math.min(matches?.length ?? 0, 5) * rule.weight);
  }

  return [...scores.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? "knowledgeMinimal";
}

function detectTone(content: UnifiedArticleContent, contentType: DesignSchemeId): ContentTone {
  if (contentType === "storyNarrative") return "叙事";
  if (contentType === "lightRecommendation") return "轻松";
  if (contentType === "checklistGuide") return "实用";
  return content.parseMode === "narrative" ? "叙事" : "理性";
}

function detectAudience(text: string) {
  if (/企业|客户|业务|产品|管理|团队/.test(text)) return "关注业务落地与团队实践的从业者";
  if (/教程|方法|步骤|工具|学习/.test(text)) return "希望快速掌握方法并直接实践的读者";
  if (/生活|体验|推荐|购买/.test(text)) return "关注真实体验和选择建议的读者";
  return "关注该主题并希望获得清晰判断的读者";
}

function collectKeyPoints(content: UnifiedArticleContent, fallback: string) {
  const preferred = content.blocks
    .filter((block) => block.type === "section" || block.type === "subsection" || block.type === "list" || block.type === "golden")
    .flatMap((block) => (block.type === "list" ? block.items : [block.text]))
    .map((value) => cleanLine(value, 220))
    .filter(Boolean);
  const paragraphFallback = content.blocks
    .filter((block) => block.type === "paragraph")
    .map((block) => cleanLine(block.text.split(/[。！？]/)[0] || block.text, 220));
  return uniqueText([...preferred, ...paragraphFallback, fallback]).slice(0, 5);
}

function collectHighlights(content: UnifiedArticleContent, keyPoints: string[]) {
  const preferred = content.blocks
    .filter((block) => block.type === "golden" || block.type === "quote" || block.type === "summary")
    .map((block) => cleanLine(block.text, 260));
  return uniqueText([...preferred, ...keyPoints]).slice(0, 5);
}

function firstText(content: UnifiedArticleContent, types: UnifiedArticleBlock["type"][]) {
  for (const type of types) {
    const block = content.blocks.find((candidate) => candidate.type === type);
    const text = block ? renderBlockText(block) : undefined;
    if (text?.trim()) return text;
  }
  return "";
}

function toPlanBlock(block: UnifiedArticleBlock): DesignPlanBlock {
  const role: ContentBlockRole =
    block.type === "title" ? "cover"
      : block.type === "lead" ? "hook"
        : block.type === "section" || block.type === "subsection" ? "heading"
          : block.type === "golden" || block.type === "quote" ? "highlight"
            : block.type === "summary" ? "conclusion"
              : block.type === "cta" ? "action"
                : block.type === "image" ? "media"
                  : "body";
  return { blockId: block.id, role, priority: role === "cover" || role === "highlight" ? 1 : role === "heading" || role === "conclusion" ? 2 : 3 };
}

function buildTitleCandidates(title: string, contentType: DesignSchemeId) {
  const suffix = contentType === "checklistGuide" ? "实操清单" : contentType === "dataInsight" ? "关键判断" : contentType === "storyNarrative" ? "一次真实复盘" : contentType === "productCase" ? "问题与解法" : contentType === "lightRecommendation" ? "真实体验" : "核心方法";
  return uniqueText([title, `${title}：${suffix}`, `关于「${title}」的几个关键判断`]).map((value) => cleanLine(value, 72)).slice(0, 3);
}

function recommendPlatforms(contentType: DesignSchemeId): PlatformId[] {
  if (contentType === "lightRecommendation") return ["xiaohongshu", "douyinImage", "douyinLongform", "wechat"];
  if (contentType === "dataInsight" || contentType === "productCase") return ["wechat", "douyinLongform", "xiaohongshu", "douyinImage"];
  return ["wechat", "xiaohongshu", "douyinImage", "douyinLongform"];
}

function coverStrategyFor(contentType: DesignSchemeId) {
  const strategies: Record<DesignSchemeId, string> = {
    knowledgeMinimal: "用主题与核心收益组成两级标题，封面不堆叠正文。",
    dataInsight: "突出一个有来源的关键数据或趋势结论，不补造数字。",
    checklistGuide: "使用明确问题和步骤数量，正文页逐项展开。",
    storyNarrative: "用具体场景或转折开场，保留叙事悬念。",
    productCase: "先呈现业务问题，再说明方案边界和结果。",
    lightRecommendation: "以真实体验结论为主标题，补充适用场景。",
  };
  return strategies[contentType];
}

function recommendationReasonFor(contentType: DesignSchemeId) {
  const reasons: Record<DesignSchemeId, string> = {
    knowledgeMinimal: "文章以观点和方法为主，清晰层级比装饰更重要。",
    dataInsight: "文章包含数据、对比或趋势判断，适合先突出证据再解释原因。",
    checklistGuide: "文章包含步骤、工具或避坑点，清单结构更方便扫读和执行。",
    storyNarrative: "文章包含经历、时间推进或转折，叙事结构更能保留上下文。",
    productCase: "文章围绕业务、产品或客户问题展开，问题到方案的结构更清楚。",
    lightRecommendation: "文章以体验和选择建议为主，适合轻量、留白更多的图文结构。",
  };
  return reasons[contentType];
}

function cleanLine(value: string, maxLength: number) {
  return value.replace(/^#+\s*/, "").replace(/^>\s*/, "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function uniqueText(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
