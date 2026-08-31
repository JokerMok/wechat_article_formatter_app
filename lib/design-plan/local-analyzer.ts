import type { UnifiedArticleBlock, UnifiedArticleContent } from "../content";
import {
  getContentLayout,
  getDesignScheme,
  getVisualTheme,
  schemeIdForVisualThemeAndLayout,
  type ContentLayoutId,
  type DesignSchemeId,
  type VisualThemeId,
} from "../design-schemes";
import { collectTags, renderBlockText, stableChecksum } from "../platforms/platform-profiles";
import type { PlatformId } from "../platforms/types";
import { cleanPublishingText, isGenericStructureHeading, isWeakPublishingText, publicationBlocks } from "./content-filter";
import { buildPlatformDesignPlans } from "./platform-planner";
import type {
  ContentBlockRole,
  ContentBlueprint,
  ContentSection,
  ContentSectionPurpose,
  ContentTone,
  ContentType,
  DesignPlan,
  DesignPlanBlock,
  GenerationMode,
  SourceFact,
} from "./types";

type ContentRule = { id: ContentType; pattern: RegExp; weight: number };

const CONTENT_RULES: ContentRule[] = [
  { id: "knowledgeTutorial", pattern: /教程|入门|指南|怎么做|如何|操作|配置|使用方法|实操|流程/, weight: 3 },
  { id: "checklistGuide", pattern: /清单|攻略|避坑|检查项|注意事项|步骤|工具推荐|要点/, weight: 4 },
  { id: "opinionAnalysis", pattern: /我认为|真正关键|本质|不是.+而是|观点|判断|为什么|反常识|核心问题/, weight: 3 },
  { id: "dataInsight", pattern: /数据显示|数据表明|数据分析|数据解读|数据复盘|报告|趋势|增长|下降|同比|环比|调查|比例|统计|样本|\d+(?:\.\d+)?\s*(?:%|％|倍|万|亿|元|人|次|个|项|条|类|月|年|天)/, weight: 4 },
  { id: "caseReview", pattern: /案例|复盘|项目复盘|业务复盘|客户交付|交付|实施|上线|解决方案|验收/, weight: 4 },
  { id: "storyNarrative", pattern: /那天|后来|第一次|当时|直到|没想到|故事|经历|转折|回头看|这几个月/, weight: 3 },
  { id: "productIntroduction", pattern: /产品说明|产品介绍|产品功能|产品能力|适用场景|选型|配置建议|服务方案|版本说明/, weight: 3 },
  { id: "experienceSharing", pattern: /体验|体会|感受|分享|踩坑|我用|这几个月|建议|心得/, weight: 3 },
];

const CONTENT_TYPE_THEME: Record<ContentType, VisualThemeId> = {
  knowledgeTutorial: "informationCard",
  checklistGuide: "informationCard",
  opinionAnalysis: "editorial",
  dataInsight: "editorial",
  caseReview: "storyMagazine",
  storyNarrative: "storyMagazine",
  productIntroduction: "editorial",
  experienceSharing: "storyMagazine",
};

const CONTENT_TYPE_LAYOUT: Record<ContentType, ContentLayoutId> = {
  knowledgeTutorial: "checklist",
  checklistGuide: "checklist",
  opinionAnalysis: "editorial",
  dataInsight: "data",
  caseReview: "story",
  storyNarrative: "story",
  productIntroduction: "editorial",
  experienceSharing: "story",
};

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  knowledgeTutorial: "知识教程",
  checklistGuide: "清单攻略",
  opinionAnalysis: "观点分析",
  dataInsight: "数据洞察",
  caseReview: "案例复盘",
  storyNarrative: "故事叙事",
  productIntroduction: "产品介绍",
  experienceSharing: "经验分享",
};

export type AnalyzeArticleDesignOptions = {
  generationMode?: GenerationMode;
  recommendedScheme?: DesignSchemeId;
  recommendedThemeId?: VisualThemeId;
  recommendedLayoutId?: ContentLayoutId;
};

export function analyzeArticleDesign(content: UnifiedArticleContent, options: AnalyzeArticleDesignOptions = {}): DesignPlan {
  const sourceRevision = stableChecksum(content.sourceText);
  const publishableContent = { ...content, blocks: publicationBlocks(content) };
  const contentType = detectContentType(content);
  const generationMode = options.generationMode ?? "layoutOnly";
  const legacyScheme = options.recommendedScheme ? getDesignScheme(options.recommendedScheme) : undefined;
  const themeId = options.recommendedThemeId ?? legacyScheme?.themeId ?? CONTENT_TYPE_THEME[contentType];
  const contentLayoutId = options.recommendedLayoutId ?? legacyScheme?.contentLayoutId ?? CONTENT_TYPE_LAYOUT[contentType];
  const recommendedScheme = options.recommendedScheme && !options.recommendedThemeId && !options.recommendedLayoutId
    ? options.recommendedScheme
    : schemeIdForVisualThemeAndLayout(themeId, contentLayoutId);
  const scheme = getDesignScheme(recommendedScheme);
  const theme = getVisualTheme(themeId);
  const contentLayout = getContentLayout(contentLayoutId);
  const title = cleanTitle(content.title || firstMeaningfulText(publishableContent, ["title", "section", "paragraph"]) || "未命名文章", 72);
  const coreMessage = cleanLine(firstMeaningfulText(publishableContent, ["summary", "golden", "quote", "lead", "paragraph"]) || title, 280);
  const keyPoints = collectKeyPoints(publishableContent, coreMessage);
  const openingHook = cleanLine(firstMeaningfulText(publishableContent, ["lead", "quote", "paragraph"]) || coreMessage, 220);
  const conclusion = cleanLine(lastMeaningfulText(publishableContent, ["summary", "golden", "paragraph"]) || coreMessage, 360);
  const highlights = collectHighlights(publishableContent, keyPoints);
  const tone = detectTone(content, contentType);
  const textLength = publishableContent.blocks.reduce((total, block) => total + (renderBlockText(block)?.length ?? 0), 0);
  const publishableText = publishableContent.blocks.map((block) => renderBlockText(block) ?? "").join("\n");
  const targetAudience = detectAudience(publishableText);
  const tags = collectTags(publishableContent, 8);
  const titleCandidates = generationMode === "layoutOnly" ? [title] : buildTitleCandidates(title, contentType, keyPoints.length);
  const sourceCallToAction = cleanLine(firstMeaningfulText(content, ["cta"]), 180);
  const callToAction = generationMode === "layoutOnly" ? sourceCallToAction : sourceCallToAction || defaultCallToAction(contentType);
  const recommendedTitle = titleCandidates[0] ?? title;
  const modificationSummary = generationMode === "layoutOnly"
    ? []
    : ["提供标题候选并保留原题", "提炼开头钩子和核心信息", "按平台阅读习惯调整内容顺序", "保留原文事实、限定条件和人工编辑"];
  const blueprint: ContentBlueprint = {
    schemaVersion: 1,
    generationMode,
    contentType,
    targetAudience,
    sourceFacts: buildSourceFacts(publishableContent),
    coreMessage,
    titleCandidates,
    openingHook,
    sections: buildContentSections(publishableContent, contentType),
    conclusion,
    ...(callToAction ? { callToAction } : {}),
    modificationSummary,
  };
  const platformPlans = buildPlatformDesignPlans(content, blueprint, scheme, { themeId, contentLayoutId });

  return {
    schemaVersion: 1,
    sourceRevision,
    generationMode,
    contentType,
    targetAudience,
    coreMessage,
    tone,
    recommendedPlatforms: recommendPlatforms(contentType),
    recommendedScheme,
    recommendedThemeId: themeId,
    contentLayoutId,
    contentLayout,
    visualStyle: theme.name,
    palette: { primary: theme.colors.primary, secondary: theme.colors.secondary, background: theme.colors.background, text: theme.colors.text },
    typography: { ...scheme.typography, titleFamily: theme.typography.titleFamily, bodyFamily: theme.typography.bodyFamily, focusFamily: theme.typography.focusFamily },
    density: scheme.density,
    coverStrategy: coverStrategyFor(contentType),
    blockOrder: publishableContent.blocks.map(toPlanBlock),
    highlights,
    pagination: {
      xiaohongshuTargetPages: clamp(4 + Math.min(keyPoints.length, 5) + (textLength > 1600 ? 1 : 0), 6, 10),
      douyinImageTargetPages: clamp(3 + Math.min(keyPoints.length, 4) + (textLength > 2200 ? 1 : 0), 4, 8),
    },
    callToAction,
    recommendationReason: recommendationReasonFor(contentType, theme.name, contentLayout.name),
    titleCandidates,
    recommendedTitle,
    openingHook,
    keyPoints,
    conclusion,
    tags,
    blueprint,
    platformPlans,
    modificationSummary,
  };
}

function buildSourceFacts(content: UnifiedArticleContent): SourceFact[] {
  return content.blocks.flatMap((block, index) => {
    if (block.type === "pageBreak" || block.type === "divider" || block.type === "code" || block.type === "image") return [];
    const values = block.type === "list"
      ? block.items
      : block.type === "card"
        ? [[block.title, block.body].filter(Boolean).join("：")]
        : [block.text];
    return values.map(cleanPublishingText).filter(Boolean).map((text, valueIndex) => ({
      id: `fact-${index + 1}-${valueIndex + 1}`,
      text,
      sourceBlockIds: [block.id],
    }));
  });
}

function buildContentSections(content: UnifiedArticleContent, contentType: ContentType): ContentSection[] {
  const sections: ContentSection[] = [];
  let current: ContentSection | undefined;
  for (const block of content.blocks) {
    if (block.type === "title" || block.type === "pageBreak" || block.type === "divider" || block.type === "code") continue;
    if (block.type === "section" || block.type === "subsection") {
      current = {
        id: `section-${sections.length + 1}`,
        title: cleanPublishingText(block.text),
        purpose: sectionPurpose(contentType, sections.length),
        sourceBlockIds: [block.id],
      };
      sections.push(current);
      continue;
    }
    if (!current) {
      current = {
        id: "section-1",
        purpose: "opening",
        sourceBlockIds: [],
      };
      sections.push(current);
    }
    current.sourceBlockIds.push(block.id);
  }
  if (sections.length > 1) sections[sections.length - 1]!.purpose = "conclusion";
  return sections;
}

function sectionPurpose(contentType: ContentType, index: number): ContentSectionPurpose {
  if (index === 0) return "opening";
  if (contentType === "checklistGuide" || contentType === "knowledgeTutorial") return "step";
  if (contentType === "dataInsight") return "evidence";
  if (contentType === "caseReview" || contentType === "storyNarrative" || contentType === "experienceSharing") {
    return index === 1 ? "conflict" : "turning";
  }
  return "argument";
}

export function detectContentType(content: UnifiedArticleContent): ContentType {
  const analysisText = publicationBlocks(content).map((block) => renderBlockText(block) ?? "").join("\n");
  const scores = new Map<ContentType, number>([
    ["knowledgeTutorial", 0],
    ["checklistGuide", content.blocks.some((block) => block.type === "list") ? 5 : 0],
    ["opinionAnalysis", 2],
    ["dataInsight", 0],
    ["caseReview", content.parseMode === "business" ? 4 : 0],
    ["storyNarrative", content.parseMode === "narrative" ? 4 : 0],
    ["productIntroduction", content.parseMode === "business" ? 2 : 0],
    ["experienceSharing", 0],
  ]);

  for (const rule of CONTENT_RULES) {
    const flags = rule.pattern.flags.includes("g") ? rule.pattern.flags : `${rule.pattern.flags}g`;
    const matches = analysisText.match(new RegExp(rule.pattern.source, flags));
    scores.set(rule.id, (scores.get(rule.id) ?? 0) + Math.min(matches?.length ?? 0, 6) * rule.weight);
  }

  // Generic words such as "项目" or "最后" are common in explanatory prose.
  // Case and story layouts need multiple narrative signals before they can win.
  const dataSignalCount = countMatches(analysisText, /数据显示|数据表明|数据分析|数据解读|数据复盘|报告|趋势|增长|下降|同比|环比|调查|比例|统计|样本|\d+(?:\.\d+)?\s*(?:%|％|倍|万|亿|元|人|次|个|项|条|类|月|年|天)/g);
  const caseSignalCount = countMatches(analysisText, /案例|复盘|项目复盘|业务复盘|客户交付|交付|实施|上线|解决方案|验收/g);
  const storySignalCount = countMatches(analysisText, /那天|后来|第一次|当时|直到|没想到|故事|经历|转折|回头看|这几个月/g);
  if (content.parseMode !== "business" && caseSignalCount < 2) scores.set("caseReview", 0);
  if (content.parseMode !== "narrative" && storySignalCount < 2) scores.set("storyNarrative", 0);
  if (dataSignalCount < 2) scores.set("dataInsight", 0);

  return [...scores.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? "opinionAnalysis";
}

function countMatches(text: string, pattern: RegExp) {
  return text.match(pattern)?.length ?? 0;
}

function detectTone(content: UnifiedArticleContent, contentType: ContentType): ContentTone {
  if (contentType === "storyNarrative" || contentType === "caseReview") return "叙事";
  if (contentType === "experienceSharing") return "轻松";
  if (contentType === "checklistGuide" || contentType === "knowledgeTutorial") return "实用";
  return content.parseMode === "narrative" ? "叙事" : "理性";
}

function detectAudience(text: string) {
  if (/企业|客户|业务|产品|管理|团队|项目/.test(text)) return "关注业务落地、产品与团队实践的从业者";
  if (/教程|方法|步骤|工具|学习|入门/.test(text)) return "希望快速掌握方法并直接实践的读者";
  if (/生活|体验|推荐|购买|旅行|穿搭/.test(text)) return "关注真实体验和选择建议的读者";
  return "关注该主题并希望获得清晰判断的读者";
}

function collectKeyPoints(content: UnifiedArticleContent, fallback: string) {
  const preferred = content.blocks
    .filter((block) => block.type === "section" || block.type === "subsection" || block.type === "list" || block.type === "golden" || block.type === "card")
    .flatMap((block) => {
      if ((block.type === "section" || block.type === "subsection") && isGenericStructureHeading(block.text)) return [];
      return block.type === "list" ? block.items : block.type === "card" ? [block.title ?? "", block.body] : [block.text];
    })
    .map((value) => cleanLine(value, 220))
    .filter((value) => value && !isWeakPublishingText(value));
  const paragraphFallback = content.blocks
    .filter((block) => block.type === "paragraph")
    .map((block) => cleanLine(firstSentence(block.text), 220))
    .filter((value) => value && !isWeakPublishingText(value));
  return uniqueText([...preferred, ...paragraphFallback, fallback]).slice(0, 5);
}

function collectHighlights(content: UnifiedArticleContent, keyPoints: string[]) {
  const preferred = content.blocks
    .filter((block) => block.type === "golden" || block.type === "quote" || block.type === "summary")
    .map((block) => cleanLine(block.text, 260))
    .filter((value) => value && !isWeakPublishingText(value));
  return uniqueText([...preferred, ...keyPoints]).slice(0, 5);
}

function firstMeaningfulText(content: UnifiedArticleContent, types: UnifiedArticleBlock["type"][]) {
  for (const type of types) {
    for (const block of content.blocks.filter((candidate) => candidate.type === type)) {
      const text = renderBlockText(block)?.trim();
      if (text && !isWeakPublishingText(text)) return text;
    }
  }
  return "";
}

function lastMeaningfulText(content: UnifiedArticleContent, types: UnifiedArticleBlock["type"][]) {
  for (const type of types) {
    const blocks = content.blocks.filter((candidate) => candidate.type === type).reverse();
    for (const block of blocks) {
      const text = renderBlockText(block)?.trim();
      if (text && !isWeakPublishingText(text)) return text;
    }
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

function buildTitleCandidates(title: string, contentType: ContentType, pointCount: number) {
  const topic = title.split(/[：:｜|。！？]/)[0]?.trim() || title;
  const count = clamp(pointCount, 3, 5);
  const candidates: Record<ContentType, string[]> = {
    knowledgeTutorial: [`${topic}：一套可以直接照做的方法`, title, `先把${topic}讲清楚`],
    checklistGuide: [`${topic}：${count}个关键步骤`, title, `${topic}，先避开这${count}个问题`],
    opinionAnalysis: [`${topic}：真正关键的是什么`, title, `关于${topic}，我更在意这${count}个判断`],
    dataInsight: [`${topic}：数据背后的${count}个判断`, title, `${topic}，先看结论再看原因`],
    caseReview: [`${topic}：问题、行动与边界复盘`, title, `${topic}，这次项目留下的${count}个判断`],
    storyNarrative: [`${topic}：这件事后来怎么了`, title, `${topic}，转折发生在这里`],
    productIntroduction: [`${topic}：能力、边界和适用场景`, title, `什么情况下适合用${topic}`],
    experienceSharing: [`${topic}：一次真实使用后的${count}个体会`, title, `${topic}，我最后留下了什么`],
  };
  return uniqueText(candidates[contentType]).map((value) => cleanTitle(value, 72)).slice(0, 3);
}

function recommendPlatforms(contentType: ContentType): PlatformId[] {
  if (contentType === "experienceSharing" || contentType === "checklistGuide") return ["xiaohongshu", "douyinImage", "douyinLongform", "wechat"];
  if (contentType === "dataInsight" || contentType === "caseReview" || contentType === "opinionAnalysis") return ["wechat", "douyinLongform", "xiaohongshu", "douyinImage"];
  return ["wechat", "xiaohongshu", "douyinImage", "douyinLongform"];
}

function coverStrategyFor(contentType: ContentType) {
  const strategies: Record<ContentType, string> = {
    knowledgeTutorial: "用主题和读者可获得的方法组成两级标题，封面不堆正文。",
    checklistGuide: "突出真实步骤数量和执行结果，内页逐项展开。",
    opinionAnalysis: "用原文核心判断建立认知落差，不制造虚假冲突。",
    dataInsight: "突出一个有来源的数据或趋势结论，没有数字时改用判断。",
    caseReview: "先呈现具体问题，再说明行动、边界和结果。",
    storyNarrative: "用真实场景或转折开场，保留叙事悬念。",
    productIntroduction: "先讲适用问题，再讲能力、边界和使用场景。",
    experienceSharing: "以真实体验结论为标题，补充适用对象。",
  };
  return strategies[contentType];
}

function recommendationReasonFor(contentType: ContentType, themeName: string, layoutName: string) {
  const reasons: Record<ContentType, string> = {
    knowledgeTutorial: "文章以方法和解释为主，需要清晰章节和足够正文阅读空间。",
    checklistGuide: "文章包含步骤或检查点，大数字清单更便于快速扫读和执行。",
    opinionAnalysis: "文章依赖观点推进，编辑部式层级能突出判断而不过度装饰。",
    dataInsight: "文章包含数据、对比或趋势判断，需要先展示证据再解释结论。",
    caseReview: "文章围绕问题、行动和结果展开，章节式叙事更能保留上下文。",
    storyNarrative: "文章包含时间推进与转折，杂志式章节更适合连续阅读。",
    productIntroduction: "文章需要同时交代能力与边界，克制的编辑结构更可信。",
    experienceSharing: "文章以个人体会和选择建议为主，舒展的故事节奏更自然。",
  };
  return `推荐“${themeName}”和“${layoutName}”骨架：${reasons[contentType]}`;
}

function defaultCallToAction(contentType: ContentType) {
  if (contentType === "checklistGuide" || contentType === "knowledgeTutorial") return "你准备先从哪一步开始？";
  if (contentType === "productIntroduction") return "先对照自己的场景，判断它是否真的适用。";
  if (contentType === "storyNarrative" || contentType === "experienceSharing") return "你遇到过类似的情况吗？";
  return "你更认同其中哪一个判断？";
}

function firstSentence(value: string) {
  return value.split(/(?<=[。！？；])/u).find((part) => part.trim())?.trim() ?? value;
}

function cleanTitle(value: string, maxLength: number) {
  return cleanLine(value, maxLength).replace(/[。；，、]+$/u, "");
}

function cleanLine(value: string, maxLength: number) {
  return cleanPublishingText(value)
    .replace(/^#+\s*/, "")
    .replace(/^>\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function uniqueText(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
