import type { PlatformId } from "../platforms/types";
import type { DesignScheme, DesignSchemeId } from "./types";

const ALL_PLATFORMS: PlatformId[] = ["wechat", "xiaohongshu", "douyinImage", "douyinLongform"];

export const DESIGN_SCHEMES: Record<DesignSchemeId, DesignScheme> = {
  knowledgeMinimal: {
    id: "knowledgeMinimal",
    name: "编辑部简约",
    description: "像专业专栏一样组织长文，以标题层级、留白和少量强调承载观点。",
    contentTypes: ["knowledgeTutorial", "opinionAnalysis", "productIntroduction"],
    platforms: ALL_PLATFORMS,
    density: "均衡",
    layoutVariant: "editorial",
    palette: { primary: "#B23A32", secondary: "#E8D8D1", background: "#FCFBF8", text: "#1E1E1C" },
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
    name: "数据洞察",
    description: "先呈现有来源的数据与结论，再用规整网格说明对比、依据和判断。",
    contentTypes: ["dataInsight"],
    platforms: ALL_PLATFORMS,
    density: "紧凑",
    layoutVariant: "data",
    palette: { primary: "#155E75", secondary: "#D4A72C", background: "#F6FAFA", text: "#153238" },
    typography: { titleScale: 1, headingScale: 0.98, bodyScale: 0.95, lineHeight: 1.66 },
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
    name: "高能清单",
    description: "用大数字和明确动作拆解步骤、工具与避坑点，方便快速扫读和执行。",
    contentTypes: ["checklistGuide", "knowledgeTutorial"],
    platforms: ALL_PLATFORMS,
    density: "均衡",
    layoutVariant: "checklist",
    palette: { primary: "#0E5B4B", secondary: "#E8C547", background: "#F8F8F2", text: "#172B25" },
    typography: { titleScale: 1, headingScale: 1.08, bodyScale: 0.96, lineHeight: 1.68 },
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
    name: "故事杂志",
    description: "用强封面、章节转折和更舒展的图文节奏承载经历、案例与复盘。",
    contentTypes: ["storyNarrative", "caseReview", "experienceSharing", "productIntroduction"],
    platforms: ALL_PLATFORMS,
    density: "舒展",
    layoutVariant: "story",
    palette: { primary: "#7B3F4A", secondary: "#D5B88E", background: "#FCF8F3", text: "#33282A" },
    typography: { titleScale: 1.08, headingScale: 1, bodyScale: 1, lineHeight: 1.84 },
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

export function getAlternativeSchemes(id: DesignSchemeId, count = 2, contentType?: string) {
  return DESIGN_SCHEME_LIST
    .filter((scheme) => scheme.id !== id)
    .sort((left, right) => Number(right.contentTypes.includes(contentType ?? "")) - Number(left.contentTypes.includes(contentType ?? "")))
    .slice(0, count);
}

export function cardPresetForScheme(id: DesignSchemeId) {
  const scheme = DESIGN_SCHEMES[id];
  return {
    variant: scheme.layoutVariant,
    background: scheme.palette.background,
    title: scheme.palette.primary,
    body: scheme.palette.text,
    rule: scheme.palette.secondary,
    highlight: scheme.palette.secondary,
    dots: `${scheme.palette.primary}38`,
    surface: "#FFFFFF",
    muted: `${scheme.palette.text}A3`,
  };
}
