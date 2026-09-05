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
import { buildLocalEditorialPlan } from "./editorial-plan";
import { analyzeSourceDocument, summarizeSemanticSignals } from "./semantic-analyzer";
import type {
  ContentBlockRole,
  ContentBlueprint,
  ContentTone,
  ContentType,
  DesignPlan,
  DesignPlanBlock,
  GenerationMode,
} from "./types";

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
  const sourceRevision = content.sourceRevision ?? stableChecksum(content.sourceText);
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
  const tone = detectTone(content, contentType);
  const textLength = publishableContent.blocks.reduce((total, block) => total + (renderBlockText(block)?.length ?? 0), 0);
  const publishableText = publishableContent.blocks.map((block) => renderBlockText(block) ?? "").join("\n");
  const targetAudience = detectAudience(publishableText);
  const semanticBlueprint = analyzeSourceDocument(content, { generationMode, contentType, targetAudience, tone });
  const coreMessage = cleanLine(semanticBlueprint.centralThesis || title, 280);
  const keyPoints = uniqueText([...semanticBlueprint.keyPoints, ...collectKeyPoints(publishableContent, coreMessage)]).slice(0, 5);
  const openingHook = cleanLine(semanticBlueprint.openingHook || semanticBlueprint.narrativeArc.opening || title, 220);
  const conclusion = cleanLine(semanticBlueprint.conclusion || lastMeaningfulText(publishableContent, ["summary", "paragraph"]) || coreMessage, 360);
  const highlights = uniqueText([...semanticBlueprint.goldenSentences.map((unit) => unit.text), ...collectHighlights(publishableContent, keyPoints)]).slice(0, 5);
  const tags = semanticBlueprint.topicTags.length ? semanticBlueprint.topicTags : collectTags(publishableContent, 8);
  const titleCandidates = generationMode === "layoutOnly" ? [title] : uniqueText([...semanticBlueprint.titleCandidates, ...buildTitleCandidates(title, contentType, keyPoints.length)]).slice(0, 3);
  const sourceCallToAction = cleanLine(firstMeaningfulText(content, ["cta"]), 180);
  const callToAction = generationMode === "layoutOnly" ? sourceCallToAction : sourceCallToAction || defaultCallToAction(contentType);
  const recommendedTitle = titleCandidates[0] ?? title;
  const modificationSummary = generationMode === "layoutOnly"
    ? []
    : ["提供标题候选并保留原题", "提炼开头钩子和核心信息", "按平台阅读习惯调整内容顺序", "保留原文事实、限定条件和人工编辑"];
  const blueprint: ContentBlueprint = {
    ...semanticBlueprint,
    coreMessage,
    centralThesis: semanticBlueprint.centralThesis || coreMessage,
    titleCandidates,
    ...(openingHook ? { openingHook } : {}),
    conclusion,
    ...(callToAction ? { callToAction } : {}),
    modificationSummary,
  };
  const editorialPlans = buildEditorialPlans(content, blueprint);
  const platformPlans = buildPlatformDesignPlans(content, blueprint, scheme, { themeId, contentLayoutId, editorialPlans });
  const analysisRevision = `analysis-${stableChecksum(JSON.stringify({ sourceRevision, generationMode, contentType, blueprint }))}`;

  return {
    schemaVersion: 1,
    sourceRevision,
    analysisRevision,
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

export function applySemanticBlueprint(
  content: UnifiedArticleContent,
  semanticBlueprint: ContentBlueprint,
  options: Pick<AnalyzeArticleDesignOptions, "generationMode" | "recommendedThemeId" | "recommendedLayoutId" | "recommendedScheme"> = {},
): DesignPlan {
  const base = analyzeArticleDesign(content, {
    generationMode: options.generationMode ?? semanticBlueprint.generationMode,
    recommendedScheme: options.recommendedScheme,
    recommendedThemeId: options.recommendedThemeId,
    recommendedLayoutId: options.recommendedLayoutId,
  });
  const themeId = options.recommendedThemeId ?? CONTENT_TYPE_THEME[semanticBlueprint.primaryContentType] ?? base.recommendedThemeId ?? getDesignScheme(base.recommendedScheme).themeId;
  const contentLayoutId = options.recommendedLayoutId ?? CONTENT_TYPE_LAYOUT[semanticBlueprint.primaryContentType] ?? base.contentLayoutId ?? getDesignScheme(base.recommendedScheme).contentLayoutId;
  const recommendedScheme = schemeIdForVisualThemeAndLayout(themeId, contentLayoutId);
  const scheme = getDesignScheme(recommendedScheme);
  const theme = getVisualTheme(themeId);
  const blueprint: ContentBlueprint = {
    ...base.blueprint,
    ...semanticBlueprint,
    generationMode: options.generationMode ?? semanticBlueprint.generationMode,
    contentType: semanticBlueprint.primaryContentType,
    coreMessage: semanticBlueprint.centralThesis,
    sourceFacts: semanticBlueprint.facts.map((fact) => ({ id: fact.id, text: fact.text, sourceBlockIds: [...fact.sourceBlockIds] })),
    titleCandidates: base.titleCandidates,
    openingHook: semanticBlueprint.narrativeArc.opening || base.openingHook,
    callToAction: base.callToAction,
    modificationSummary: base.modificationSummary,
  };
  const editorialPlans = buildEditorialPlans(content, blueprint);
  const platformPlans = buildPlatformDesignPlans(content, blueprint, scheme, { themeId, contentLayoutId, editorialPlans });

  return {
    ...base,
    generationMode: blueprint.generationMode,
    analysisRevision: `analysis-${stableChecksum(JSON.stringify({ sourceRevision: base.sourceRevision, blueprint: semanticBlueprint }))}`,
    contentType: blueprint.primaryContentType,
    targetAudience: blueprint.targetAudience,
    coreMessage: blueprint.centralThesis,
    tone: blueprint.tone,
    recommendedScheme,
    recommendedThemeId: themeId,
    contentLayoutId,
    contentLayout: getContentLayout(contentLayoutId),
    visualStyle: theme.name,
    palette: { primary: theme.colors.primary, secondary: theme.colors.secondary, background: theme.colors.background, text: theme.colors.text },
    typography: { ...scheme.typography, titleFamily: theme.typography.titleFamily, bodyFamily: theme.typography.bodyFamily, focusFamily: theme.typography.focusFamily },
    density: scheme.density,
    keyPoints: blueprint.keyPoints,
    openingHook: blueprint.narrativeArc.opening || base.openingHook,
    conclusion: blueprint.conclusion || base.conclusion,
    tags: blueprint.topicTags,
    blueprint,
    platformPlans,
  };
}

function buildEditorialPlans(content: UnifiedArticleContent, blueprint: ContentBlueprint) {
  return {
    wechat: buildLocalEditorialPlan(content, blueprint, "wechat"),
    xiaohongshu: buildLocalEditorialPlan(content, blueprint, "xiaohongshu"),
    douyinImage: buildLocalEditorialPlan(content, blueprint, "douyinImage"),
    douyinLongform: buildLocalEditorialPlan(content, blueprint, "douyinLongform"),
  };
}

export function detectContentType(content: UnifiedArticleContent): ContentType {
  const summary = summarizeSemanticSignals(content);
  const searchableText = [content.title, ...summary.headingTexts, ...publicationBlocks(content).map((block) => renderBlockText(block) ?? "")].join("\n");
  const signals = summary.signalCounts;
  const hasList = summary.listCount > 0;
  const hasDataLanguage = /数据显示|数据表明|数据分析|数据解读|数据复盘|报告|趋势|增长|下降|同比|环比|调查|比例|统计|样本/u.test(searchableText);
  const hasCaseTitle = /案例|客户项目|业务复盘/u.test(content.title ?? "");
  // "项目/复盘" describe a topic, not necessarily a case. Require a concrete
  // delivery event before selecting the case layout.
  const concreteCaseTokens = ["客户", "实施", "上线", "解决方案", "验收"].filter((token) => searchableText.includes(token)).length;
  const hasCaseEvidence = signals.result > 0 && (
    (hasCaseTitle && concreteCaseTokens >= 1) || concreteCaseTokens >= 2
  );
  const hasStoryTitle = /那天|故事|经历|转折|第一次|一天|某次|某个晚上/u.test(content.title ?? "");
  const hasExperienceTitle = /体验|体会|感受|分享|踩坑|心得/u.test(content.title ?? "");
  const hasProductTitle = /产品说明|产品介绍|产品功能|产品能力|适用场景|选型|配置建议|服务方案|版本说明/u.test(content.title ?? "")
    && /产品|能力|场景|配置|版本|方案/u.test(searchableText);
  const hasChecklistShape = hasList || /清单|攻略|检查项|注意事项|步骤|要点/u.test(content.title ?? "");
  const hasTutorialShape = /教程|入门|指南|怎么做|如何|操作|配置|使用方法|实操|流程/u.test(content.title ?? "");
  const methodSignal = Math.min(signals.method, 3);

  // Content type is inferred from the shape of the article first. Parse mode is
  // an import hint and must not turn a first-person analysis into a story.
  const scores: Array<[ContentType, number]> = [
    ["checklistGuide", (hasList ? 8 : 0) + (hasChecklistShape ? 5 : 0) + methodSignal],
    ["knowledgeTutorial", methodSignal + (hasTutorialShape ? 6 : 0)],
    ["dataInsight", (hasDataLanguage ? 7 : 0) + Math.min(signals.fact, 3) * 2],
    ["productIntroduction", hasProductTitle ? 8 : 0],
    ["caseReview", (hasCaseTitle && hasCaseEvidence ? 5 : 0) + (hasCaseEvidence ? 7 : 0) + (hasCaseEvidence ? Math.min(signals.result, 3) * 2 : 0)],
    ["experienceSharing", (hasExperienceTitle ? 8 : 0) + Math.min(summary.personalVoiceBlockCount, 3) + (signals.example > 0 ? 2 : 0)],
    ["storyNarrative", hasStoryTitle ? 10 : (signals.narrative >= 3 && signals.example >= 2 && summary.personalVoiceBlockCount >= 2 ? 8 : 0)],
    ["opinionAnalysis", 3 + signals.opinion * 4 + signals.counter * 2 + Math.min(signals.boundary, 2) + Math.min(signals.conclusion, 2)],
  ];

  const opinionScore = scores.find(([id]) => id === "opinionAnalysis")?.[1] ?? 0;
  const storyScore = scores.find(([id]) => id === "storyNarrative")?.[1] ?? 0;
  const narrativeEvidence = signals.narrative >= 3 && signals.example >= 2 && summary.personalVoiceBlockCount >= 2;
  if (!narrativeEvidence && !hasStoryTitle) {
    scores.splice(scores.findIndex(([id]) => id === "storyNarrative"), 1);
  } else if (opinionScore >= storyScore && !hasStoryTitle) {
    scores.splice(scores.findIndex(([id]) => id === "storyNarrative"), 1);
  }

  // A clearly labelled personal experience should keep its narrative theme
  // even when the article also contains strong opinions or recommendations.
  // This uses title shape plus first-person evidence, rather than a lone
  // keyword, so an opinion article written in the first person stays editorial.
  if (hasExperienceTitle && summary.personalVoiceBlockCount >= 2 && !hasList && !hasTutorialShape) {
    return "experienceSharing";
  }

  return scores.sort((left, right) => right[1] - left[1])[0]?.[0] ?? "opinionAnalysis";
}

function detectTone(content: UnifiedArticleContent, contentType: ContentType): ContentTone {
  if (contentType === "storyNarrative" || contentType === "caseReview") return "叙事";
  if (contentType === "experienceSharing") return "轻松";
  if (contentType === "checklistGuide" || contentType === "knowledgeTutorial") return "实用";
  return "理性";
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
