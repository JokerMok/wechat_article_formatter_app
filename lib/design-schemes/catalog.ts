import type { PlatformId } from "../platforms/types";
import type {
  ContentLayout,
  ContentLayoutId,
  DesignScheme,
  DesignSchemeId,
  VisualTheme,
  VisualThemeId,
} from "./types";

const ALL_PLATFORMS: PlatformId[] = ["wechat", "xiaohongshu", "douyinImage", "douyinLongform"];

const SYSTEM_FONT = "-apple-system, BlinkMacSystemFont, Helvetica Neue, PingFang SC, Hiragino Sans GB, Microsoft YaHei, Arial, sans-serif";
const SERIF_FONT = "STSong, Songti SC, SimSun, serif";

export const VISUAL_THEMES: Record<VisualThemeId, VisualTheme> = {
  editorial: {
    id: "editorial",
    name: "A 编辑部简约",
    description: "适合知识、观点和行业分析。用编辑网格、发丝线和留白承载完整论证。",
    colors: {
      primary: "#8E302B",
      secondary: "#C9BBB0",
      accent: "#A33A35",
      background: "#FBF9F5",
      surface: "#FFFDF9",
      text: "#20201E",
      muted: "#6B6660",
      highlight: "#F0E8E0",
    },
    typography: { titleFamily: SYSTEM_FONT, bodyFamily: SYSTEM_FONT, focusFamily: SERIF_FONT, titleScale: 1.06, headingScale: 1, bodyScale: 1, lineHeight: 1.78 },
    spacing: { pageMargin: 84, titleGap: 54, sectionGap: 42, paragraphGap: 34 },
    decoration: { radius: 4, borderWidth: 1, shadow: "none", ruleStyle: "hairline" },
    blockVariants: { title: "editorial", heading: "numbered", focus: "underline", quote: "rail" },
  },
  informationCard: {
    id: "informationCard",
    name: "B 高能信息卡",
    description: "适合教程、清单、工具推荐和避坑。用大数字、单结论和信号黄建立扫读节奏。",
    colors: {
      primary: "#111111",
      secondary: "#F4C542",
      accent: "#F4C542",
      background: "#F8F8F4",
      surface: "#FFFFFF",
      text: "#171717",
      muted: "#5D5D58",
      highlight: "#FFF2B8",
    },
    typography: { titleFamily: SYSTEM_FONT, bodyFamily: SYSTEM_FONT, focusFamily: SYSTEM_FONT, titleScale: 1.08, headingScale: 1.04, bodyScale: 0.96, lineHeight: 1.64 },
    spacing: { pageMargin: 76, titleGap: 42, sectionGap: 30, paragraphGap: 26 },
    decoration: { radius: 6, borderWidth: 2, shadow: "0 8px 0 rgba(17,17,17,0.06)", ruleStyle: "block" },
    blockVariants: { title: "stacked", heading: "bar", focus: "card", quote: "signal" },
  },
  storyMagazine: {
    id: "storyMagazine",
    name: "C 故事杂志",
    description: "适合案例、个人经历和品牌故事。用章节、转折、对照和尾声形成舒展叙事。",
    colors: {
      primary: "#7A3E4B",
      secondary: "#93A39A",
      accent: "#7A3E4B",
      background: "#F5F0EA",
      surface: "#FBF8F4",
      text: "#2F292B",
      muted: "#716A68",
      highlight: "#E4ECE7",
    },
    typography: { titleFamily: SERIF_FONT, bodyFamily: SYSTEM_FONT, focusFamily: SERIF_FONT, titleScale: 1.08, headingScale: 1, bodyScale: 1, lineHeight: 1.86 },
    spacing: { pageMargin: 86, titleGap: 64, sectionGap: 52, paragraphGap: 38 },
    decoration: { radius: 0, borderWidth: 1, shadow: "none", ruleStyle: "solid" },
    blockVariants: { title: "display", heading: "chapter", focus: "pullQuote", quote: "editorial" },
  },
};

export const CONTENT_LAYOUTS: Record<ContentLayoutId, ContentLayout> = {
  editorial: {
    id: "editorial",
    name: "章节论证",
    contentTypes: ["opinionAnalysis", "productIntroduction"],
    density: "medium",
    pageSequence: ["cover", "intro", "argument", "quote", "summary", "callToAction"],
    blockRules: [
      { role: "intro", maxChars: 220, maxBlocks: 2 },
      { role: "argument", maxChars: 360, maxBlocks: 3 },
      { role: "quote", maxChars: 150, maxBlocks: 1 },
    ],
    paginationRules: { longformCharacterBudget: { wechat: 188, douyinLongform: 132 }, cardCharacterBudget: { xiaohongshu: 340, douyinImage: 250 }, cardMaxUnits: { xiaohongshu: 5, douyinImage: 6 }, shortPageThreshold: 0.34, allowSplitLongParagraphs: true },
  },
  checklist: {
    id: "checklist",
    name: "问题—步骤—行动",
    contentTypes: ["checklistGuide", "knowledgeTutorial"],
    density: "high",
    pageSequence: ["cover", "intro", "step", "checklist", "warning", "summary", "callToAction"],
    blockRules: [
      { role: "step", maxChars: 250, maxBlocks: 2 },
      { role: "checklist", maxChars: 280, maxBlocks: 4 },
      { role: "warning", maxChars: 180, maxBlocks: 1 },
    ],
    paginationRules: { longformCharacterBudget: { wechat: 176, douyinLongform: 124 }, cardCharacterBudget: { xiaohongshu: 300, douyinImage: 220 }, cardMaxUnits: { xiaohongshu: 4, douyinImage: 5 }, shortPageThreshold: 0.3, allowSplitLongParagraphs: true },
  },
  data: {
    id: "data",
    name: "结论—依据—边界",
    contentTypes: ["dataInsight"],
    density: "high",
    pageSequence: ["cover", "argument", "evidence", "comparison", "transition", "conclusion"],
    blockRules: [
      { role: "evidence", maxChars: 260, maxBlocks: 3 },
      { role: "comparison", maxChars: 240, maxBlocks: 2 },
      { role: "conclusion", maxChars: 180, maxBlocks: 1 },
    ],
    paginationRules: { longformCharacterBudget: { wechat: 172, douyinLongform: 120 }, cardCharacterBudget: { xiaohongshu: 310, douyinImage: 225 }, cardMaxUnits: { xiaohongshu: 2, douyinImage: 2 }, shortPageThreshold: 0.32, allowSplitLongParagraphs: true },
  },
  story: {
    id: "story",
    name: "冲突—经过—转折—尾声",
    contentTypes: ["caseReview", "storyNarrative", "experienceSharing"],
    density: "low",
    pageSequence: ["cover", "intro", "conflict", "chapter", "transition", "comparison", "epilogue"],
    blockRules: [
      { role: "conflict", maxChars: 230, maxBlocks: 2 },
      { role: "transition", maxChars: 180, maxBlocks: 1 },
      { role: "epilogue", maxChars: 240, maxBlocks: 2 },
    ],
    paginationRules: { longformCharacterBudget: { wechat: 204, douyinLongform: 142 }, cardCharacterBudget: { xiaohongshu: 360, douyinImage: 225 }, cardMaxUnits: { xiaohongshu: 4, douyinImage: 6 }, shortPageThreshold: 0.28, allowSplitLongParagraphs: true },
  },
};

const EDITORIAL_PALETTE = { primary: VISUAL_THEMES.editorial.colors.primary, secondary: VISUAL_THEMES.editorial.colors.secondary, background: VISUAL_THEMES.editorial.colors.background, text: VISUAL_THEMES.editorial.colors.text } as const;
const CARD_PALETTE = { primary: VISUAL_THEMES.informationCard.colors.primary, secondary: VISUAL_THEMES.informationCard.colors.secondary, background: VISUAL_THEMES.informationCard.colors.background, text: VISUAL_THEMES.informationCard.colors.text } as const;
const STORY_PALETTE = { primary: VISUAL_THEMES.storyMagazine.colors.primary, secondary: VISUAL_THEMES.storyMagazine.colors.secondary, background: VISUAL_THEMES.storyMagazine.colors.background, text: VISUAL_THEMES.storyMagazine.colors.text } as const;

export const DESIGN_SCHEMES: Record<DesignSchemeId, DesignScheme> = {
  knowledgeMinimal: {
    id: "knowledgeMinimal",
    name: "编辑部简约",
    description: "像专业专栏一样组织长文，以标题层级、留白和少量强调承载观点。",
    contentTypes: ["knowledgeTutorial", "opinionAnalysis", "productIntroduction"],
    platforms: ALL_PLATFORMS,
    density: "均衡",
    layoutVariant: "editorial",
    themeId: "editorial",
    contentLayoutId: "editorial",
    palette: { ...EDITORIAL_PALETTE },
    typography: { titleScale: 1.06, headingScale: 1, bodyScale: 1, lineHeight: 1.78 },
    structure: ["编辑导语", "章节论证", "独立重点句", "结论回收"],
    platformRules: {
      wechat: { purpose: "完整阅读", structure: ["导语", "章节", "重点句", "总结"], maxContentBlocks: 36 },
      xiaohongshu: { purpose: "连续拆读", structure: ["封面", "问题", "观点", "解释", "总结"], maxContentBlocks: 3 },
      douyinImage: { purpose: "结论冲击", structure: ["封面", "判断", "依据", "结尾"], maxContentBlocks: 2 },
      douyinLongform: { purpose: "轻装饰长文", structure: ["矛盾", "短章节", "重点句", "结论"], maxContentBlocks: 30 },
    },
    templateKey: "zhenyiKnowledgeMinimal",
  },
  dataInsight: {
    id: "dataInsight",
    name: "数据编辑部",
    description: "沿用编辑部网格，以关键数字、证据、对比和边界构成独立的数据骨架。",
    contentTypes: ["dataInsight"],
    platforms: ALL_PLATFORMS,
    density: "紧凑",
    layoutVariant: "data",
    themeId: "editorial",
    contentLayoutId: "data",
    palette: { ...EDITORIAL_PALETTE },
    typography: { titleScale: 1.02, headingScale: 1, bodyScale: 0.96, lineHeight: 1.68 },
    structure: ["数据结论", "证据网格", "对比解释", "判断边界"],
    platformRules: {
      wechat: { purpose: "可信解读", structure: ["结论", "数据", "解释", "边界"], maxContentBlocks: 36 },
      xiaohongshu: { purpose: "图表式扫读", structure: ["封面", "关键数字", "对比", "解释", "总结"], maxContentBlocks: 3 },
      douyinImage: { purpose: "单页单结论", structure: ["封面", "数字", "对比", "判断"], maxContentBlocks: 2 },
      douyinLongform: { purpose: "结构化解读", structure: ["结论前置", "证据", "解释", "边界"], maxContentBlocks: 30 },
    },
    templateKey: "zhenyiTechCards",
  },
  checklistGuide: {
    id: "checklistGuide",
    name: "B 高能信息卡",
    description: "用大数字、单结论页、步骤页和动作页组织教程与清单，黑白底色配信号黄。",
    contentTypes: ["checklistGuide", "knowledgeTutorial"],
    platforms: ALL_PLATFORMS,
    density: "均衡",
    layoutVariant: "checklist",
    themeId: "informationCard",
    contentLayoutId: "checklist",
    palette: { ...CARD_PALETTE },
    typography: { titleScale: 1.08, headingScale: 1.04, bodyScale: 0.96, lineHeight: 1.64 },
    structure: ["任务定义", "编号步骤", "风险提醒", "执行清单"],
    platformRules: {
      wechat: { purpose: "可执行教程", structure: ["目标", "步骤", "提醒", "清单"], maxContentBlocks: 36 },
      xiaohongshu: { purpose: "逐步跟做", structure: ["封面", "问题", "步骤页", "避坑", "检查"], maxContentBlocks: 3 },
      douyinImage: { purpose: "动作指令", structure: ["封面", "一步一页", "避坑", "行动"], maxContentBlocks: 2 },
      douyinLongform: { purpose: "操作说明", structure: ["结果前置", "编号步骤", "提醒", "总结"], maxContentBlocks: 30 },
    },
    templateKey: "zhenyiChecklist",
  },
  storyNarrative: {
    id: "storyNarrative",
    name: "C 故事杂志",
    description: "以章节、冲突、转折、对照和尾声页承载案例与个人经历，保留舒展叙事。",
    contentTypes: ["storyNarrative", "caseReview", "experienceSharing", "productIntroduction"],
    platforms: ALL_PLATFORMS,
    density: "舒展",
    layoutVariant: "story",
    themeId: "storyMagazine",
    contentLayoutId: "story",
    palette: { ...STORY_PALETTE },
    typography: { titleScale: 1.08, headingScale: 1, bodyScale: 1, lineHeight: 1.86 },
    structure: ["场景封面", "冲突出现", "关键转折", "结果回收"],
    platformRules: {
      wechat: { purpose: "沉浸叙事", structure: ["场景", "冲突", "过程", "回收"], maxContentBlocks: 36 },
      xiaohongshu: { purpose: "章节轮播", structure: ["封面", "起因", "转折", "过程", "结尾"], maxContentBlocks: 3 },
      douyinImage: { purpose: "转折驱动", structure: ["封面", "冲突", "转折", "结果"], maxContentBlocks: 2 },
      douyinLongform: { purpose: "自然口述", structure: ["矛盾", "经过", "转折", "体会"], maxContentBlocks: 30 },
    },
    templateKey: "zhenyiStoryMagazine",
  },
};

export const DESIGN_SCHEME_LIST = Object.values(DESIGN_SCHEMES);

export function getDesignScheme(id: DesignSchemeId) {
  return DESIGN_SCHEMES[id];
}

export const VISUAL_THEME_LIST = Object.values(VISUAL_THEMES);

export function getVisualTheme(id: VisualThemeId) {
  return VISUAL_THEMES[id];
}

export function getContentLayout(id: ContentLayoutId) {
  return CONTENT_LAYOUTS[id];
}

export function schemeIdForVisualTheme(id: VisualThemeId): DesignSchemeId {
  if (id === "informationCard") return "checklistGuide";
  if (id === "storyMagazine") return "storyNarrative";
  return "knowledgeMinimal";
}

export function schemeIdForVisualThemeAndLayout(themeId: VisualThemeId, layoutId: ContentLayoutId): DesignSchemeId {
  if (themeId === "editorial" && layoutId === "data") return "dataInsight";
  return schemeIdForVisualTheme(themeId);
}

export function getAlternativeSchemes(id: DesignSchemeId, count = 2, contentType?: string) {
  return DESIGN_SCHEME_LIST
    .filter((scheme) => scheme.id !== id)
    .sort((left, right) => Number(right.contentTypes.includes(contentType ?? "")) - Number(left.contentTypes.includes(contentType ?? "")))
    .slice(0, count);
}

export function createCardPreset({ themeId, layoutId }: { themeId: VisualThemeId; layoutId: ContentLayoutId }) {
  const theme = VISUAL_THEMES[themeId];
  return {
    variant: layoutId,
    background: theme.colors.background,
    title: theme.colors.primary,
    body: theme.colors.text,
    rule: theme.colors.secondary,
    highlight: theme.colors.highlight,
    dots: `${theme.colors.primary}38`,
    surface: theme.colors.surface,
    muted: `${theme.colors.muted}A3`,
    fontFamily: theme.typography.bodyFamily,
    focusFontFamily: theme.typography.focusFamily,
    radius: theme.decoration.radius,
  };
}

// Compatibility wrapper for persisted callers that still only have a scheme id.
export function cardPresetForScheme(id: DesignSchemeId, layoutId?: ContentLayoutId) {
  const scheme = DESIGN_SCHEMES[id];
  return createCardPreset({ themeId: scheme.themeId, layoutId: layoutId ?? scheme.contentLayoutId });
}
