import type { PlatformId } from "../platforms/types";
import type { DesignScheme, DesignSchemeId } from "./types";

const ALL_PLATFORMS: PlatformId[] = ["wechat", "xiaohongshu", "douyinImage", "douyinLongform"];

export const DESIGN_SCHEMES: Record<DesignSchemeId, DesignScheme> = {
  knowledgeMinimal: {
    id: "knowledgeMinimal",
    name: "知识简约",
    description: "用清晰层级承载教程、方法论和行业分析。",
    contentTypes: ["knowledgeMinimal"],
    platforms: ALL_PLATFORMS,
    density: "均衡",
    palette: { primary: "#17633D", secondary: "#DCEFE3", background: "#FBFCFA", text: "#17231F" },
    typography: { titleScale: 1, headingScale: 1, bodyScale: 1, lineHeight: 1.78 },
    structure: ["核心判断", "分层论证", "重点结论", "自然行动"],
    templateKey: "zhenyiKnowledgeMinimal",
  },
  dataInsight: {
    id: "dataInsight",
    name: "数据洞察",
    description: "突出数据、对比和趋势结论，适合报告与观点内容。",
    contentTypes: ["dataInsight"],
    platforms: ALL_PLATFORMS,
    density: "紧凑",
    palette: { primary: "#155E75", secondary: "#DDF3F7", background: "#F8FBFC", text: "#163238" },
    typography: { titleScale: 1.02, headingScale: 0.98, bodyScale: 0.96, lineHeight: 1.68 },
    structure: ["关键数据", "变化对比", "原因判断", "结论"],
    templateKey: "zhenyiTechCards",
  },
  checklistGuide: {
    id: "checklistGuide",
    name: "清单攻略",
    description: "把步骤、工具和避坑点整理为可快速执行的清单。",
    contentTypes: ["checklistGuide"],
    platforms: ALL_PLATFORMS,
    density: "均衡",
    palette: { primary: "#315C43", secondary: "#E7F0E9", background: "#FCFDFC", text: "#1F2D24" },
    typography: { titleScale: 0.98, headingScale: 1, bodyScale: 0.98, lineHeight: 1.72 },
    structure: ["问题", "步骤清单", "风险提醒", "执行建议"],
    templateKey: "baoyuSimpleGreen",
  },
  storyNarrative: {
    id: "storyNarrative",
    name: "故事叙事",
    description: "按时间和转折组织经历、复盘与品牌故事。",
    contentTypes: ["storyNarrative"],
    platforms: ALL_PLATFORMS,
    density: "舒展",
    palette: { primary: "#8A4E5C", secondary: "#F3E5E8", background: "#FEFBFC", text: "#34282B" },
    typography: { titleScale: 1.02, headingScale: 0.96, bodyScale: 1, lineHeight: 1.86 },
    structure: ["场景开场", "冲突变化", "行动过程", "复盘结论"],
    templateKey: "baoyuGraceRose",
  },
  productCase: {
    id: "productCase",
    name: "产品案例",
    description: "围绕问题、方案和结果组织产品介绍与客户案例。",
    contentTypes: ["productCase"],
    platforms: ALL_PLATFORMS,
    density: "均衡",
    palette: { primary: "#2456A6", secondary: "#E5EDF9", background: "#FAFBFD", text: "#17233A" },
    typography: { titleScale: 1, headingScale: 1, bodyScale: 0.98, lineHeight: 1.72 },
    structure: ["业务问题", "解决方案", "实施边界", "结果与下一步"],
    templateKey: "zhenyiBusinessCase",
  },
  lightRecommendation: {
    id: "lightRecommendation",
    name: "轻量种草",
    description: "以体验和选择理由组织生活方式与经验分享。",
    contentTypes: ["lightRecommendation"],
    platforms: ["xiaohongshu", "douyinImage", "douyinLongform", "wechat"],
    density: "舒展",
    palette: { primary: "#A34F61", secondary: "#F8E7EB", background: "#FFFDFD", text: "#3B292D" },
    typography: { titleScale: 1.04, headingScale: 0.96, bodyScale: 1, lineHeight: 1.8 },
    structure: ["体验结论", "适用场景", "选择理由", "注意事项"],
    templateKey: "baoyuGracePink",
  },
};

export const DESIGN_SCHEME_LIST = Object.values(DESIGN_SCHEMES);

export function getDesignScheme(id: DesignSchemeId) {
  return DESIGN_SCHEMES[id];
}

export function getAlternativeSchemes(id: DesignSchemeId, count = 2) {
  return DESIGN_SCHEME_LIST.filter((scheme) => scheme.id !== id).slice(0, count);
}

export function cardPresetForScheme(id: DesignSchemeId) {
  const scheme = DESIGN_SCHEMES[id];
  return {
    background: scheme.palette.background,
    title: scheme.palette.primary,
    body: scheme.palette.text,
    rule: scheme.palette.secondary,
    highlight: scheme.palette.secondary,
    dots: `${scheme.palette.primary}38`,
  };
}
