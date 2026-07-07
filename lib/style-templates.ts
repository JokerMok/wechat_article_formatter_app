import type { BlockType, InlineStyle, StyleTemplate, TemplateKey } from "./article-types";

const baoyuFont = "-apple-system-font, BlinkMacSystemFont, Helvetica Neue, PingFang SC, Hiragino Sans GB, Microsoft YaHei UI, Microsoft YaHei, Arial, sans-serif";

const colorPresets = {
  blue: "#0F4C81",
  green: "#009874",
  purple: "#92617E",
  rose: "#B76E79",
  sky: "#55C9EA",
  orange: "#D97757",
  red: "#A93226",
  black: "#333333",
};

type BaoyuTheme = "default" | "grace" | "simple" | "modern";

const baseBlockStyles: Record<BlockType, InlineStyle> = {
  title: {},
  lead: {},
  section: {},
  subsection: {},
  paragraph: {},
  quote: {},
  golden: {},
  summary: {},
  cta: {},
  image: {},
  list: {},
  card: {},
};

function createBaoyuTemplate(options: {
  key: TemplateKey;
  name: string;
  theme: BaoyuTheme;
  primary: string;
  accent?: string;
  description: string;
  audience: string;
  containerBg?: string;
  fontSize?: number;
}): StyleTemplate {
  const fontSize = options.fontSize ?? 16;
  const primary = options.primary;
  const accent = options.accent ?? "#6B7280";
  const foreground = "#111111";
  const muted = "#666666";
  const softBg = tint(primary, options.theme === "modern" ? 0.9 : 0.92);
  const borderSoft = tint(primary, options.theme === "modern" ? 0.72 : 0.78);

  const shared = {
    container: {
      "max-width": "100%",
      "box-sizing": "border-box",
      "font-size": `${fontSize}px`,
      "line-height": options.theme === "modern" ? "2" : "1.9",
      "letter-spacing": options.theme === "modern" ? "0" : "0.06em",
      color: foreground,
      "background-color": options.containerBg ?? "transparent",
      padding: options.theme === "modern" ? "18px 14px" : "0",
      "border-radius": options.theme === "modern" ? "24px" : "0",
    },
    body: { fontSize, lineHeight: options.theme === "modern" ? 2 : 1.9, color: foreground },
  };

  const blocks: Record<BlockType, InlineStyle> = { ...baseBlockStyles };

  blocks.title = {
    display: "table",
    margin: options.theme === "modern" ? "20px auto 26px" : "32px auto 22px",
    padding: options.theme === "modern" ? "6px 22px" : options.theme === "simple" ? "8px 10px" : "10px 22px",
    color: options.theme === "modern" ? "#FFFFFF" : foreground,
    "background-color": options.theme === "modern" ? primary : "transparent",
    "border-bottom": options.theme === "default" || options.theme === "grace" ? `2px solid ${primary}` : "none",
    "border-radius": options.theme === "modern" ? "999px" : options.theme === "simple" ? "8px 24px 8px 24px" : "0",
    "font-size": `${options.theme === "modern" ? 28 : Math.round(fontSize * 1.4)}px`,
    "font-weight": 800,
    "line-height": "1.45",
    "text-align": "center",
    "letter-spacing": "0.02em",
    "text-shadow": options.theme === "grace" || options.theme === "simple" ? "1px 1px 3px rgba(0,0,0,0.08)" : "none",
  };

  blocks.section = sectionStyle(options.theme, primary, accent, fontSize);
  blocks.subsection = subsectionStyle(options.theme, primary, fontSize, softBg, borderSoft);
  blocks.paragraph = {
    margin: options.theme === "modern" ? "20px 0" : "22px 8px",
    color: foreground,
    "font-size": `${options.theme === "modern" ? 15 : fontSize}px`,
    "font-weight": 400,
    "line-height": options.theme === "modern" ? "2" : "1.9",
    "letter-spacing": options.theme === "modern" ? "0" : "0.06em",
    "text-align": "justify",
    "word-break": "break-word",
  };
  blocks.lead = {
    margin: "22px 8px",
    padding: options.theme === "modern" ? "15px 16px" : "16px",
    "background-color": options.theme === "modern" ? "rgba(255,255,255,0.68)" : softBg,
    "border-left": `${options.theme === "modern" ? 7 : 4}px solid ${options.theme === "modern" ? accent : primary}`,
    "border-radius": options.theme === "modern" ? "10px" : "6px",
    color: foreground,
    "font-size": `${fontSize}px`,
    "line-height": options.theme === "modern" ? "2" : "1.9",
    "letter-spacing": options.theme === "modern" ? "0" : "0.06em",
  };
  blocks.quote = {
    margin: options.theme === "modern" ? "12px 0" : "18px 8px",
    padding: options.theme === "modern" ? "15px 16px" : "16px",
    "background-color": options.theme === "modern" ? "rgba(255,255,255,0.6)" : "#F7F7F7",
    "border-left": `${options.theme === "modern" ? 7 : 4}px solid ${options.theme === "modern" ? accent : primary}`,
    "border-radius": options.theme === "grace" || options.theme === "modern" ? "8px" : "6px",
    color: options.theme === "grace" || options.theme === "simple" ? "rgba(0,0,0,0.68)" : foreground,
    "box-shadow": options.theme === "grace" ? "0 8px 18px rgba(0,0,0,0.06)" : options.theme === "modern" ? "0 6px 16px rgba(0,0,0,0.05)" : "none",
    "font-style": options.theme === "grace" || options.theme === "simple" ? "italic" : "normal",
    "font-size": `${fontSize}px`,
    "line-height": options.theme === "modern" ? "2" : "1.9",
    "letter-spacing": options.theme === "modern" ? "0" : "0.06em",
  };
  blocks.golden = {
    display: "table",
    margin: "30px auto",
    padding: "10px 18px",
    color: "#FFFFFF",
    "background-color": primary,
    "border-radius": options.theme === "modern" ? "999px" : "8px",
    "font-size": `${fontSize + 1}px`,
    "line-height": "1.8",
    "font-weight": 800,
    "text-align": "center",
    "letter-spacing": "0.03em",
  };
  blocks.summary = {
    margin: "28px 8px",
    padding: "20px 18px",
    color: "#FFFFFF",
    "background-color": primary,
    "border-radius": options.theme === "modern" ? "16px" : "8px",
    "font-size": `${fontSize + 1}px`,
    "line-height": "1.9",
    "font-weight": 600,
    "letter-spacing": options.theme === "modern" ? "0" : "0.04em",
  };
  blocks.cta = {
    margin: "32px 8px 0",
    padding: "18px",
    color: options.theme === "modern" ? "#FFFFFF" : primary,
    "background-color": options.theme === "modern" ? primary : softBg,
    border: options.theme === "modern" ? "none" : `1px solid ${borderSoft}`,
    "border-radius": options.theme === "modern" ? "20px" : options.theme === "simple" ? "8px 24px 8px 24px" : "8px",
    "font-size": `${fontSize + 1}px`,
    "line-height": "1.9",
    "font-weight": 800,
    "text-align": "center",
  };
  blocks.image = {
    margin: "24px 8px",
    padding: "16px",
    color: muted,
    "background-color": options.theme === "modern" ? "rgba(255,255,255,0.72)" : "#FAFAFA",
    border: `1px solid ${borderSoft}`,
    "border-radius": options.theme === "modern" ? "18px" : options.theme === "simple" ? "8px 24px 8px 24px" : "8px",
    "font-size": "14px",
    "line-height": "1.8",
    "text-align": "center",
  };
  blocks.list = {
    margin: "20px 8px",
    padding: options.theme === "modern" ? "18px 18px" : "16px 18px",
    color: foreground,
    "background-color": options.theme === "modern" ? "rgba(255,255,255,0.72)" : softBg,
    border: options.theme === "simple" ? `1px solid ${borderSoft}` : "none",
    "border-radius": options.theme === "modern" ? "18px" : options.theme === "simple" ? "8px 24px 8px 24px" : "6px",
    "font-size": `${fontSize}px`,
    "line-height": options.theme === "modern" ? "2" : "1.9",
  };
  blocks.card = {
    margin: "20px 8px",
    padding: options.theme === "modern" ? "18px 18px" : "16px 18px",
    color: foreground,
    "background-color": options.theme === "modern" ? "rgba(255,255,255,0.72)" : softBg,
    border: `1px solid ${borderSoft}`,
    "border-radius": options.theme === "modern" ? "18px" : options.theme === "simple" ? "8px 24px 8px 24px" : "8px",
    "font-size": `${fontSize}px`,
    "line-height": options.theme === "modern" ? "2" : "1.9",
  };

  return {
    key: options.key,
    name: options.name,
    description: options.description,
    audience: options.audience,
    palette: [primary, softBg, options.containerBg ?? "#FFFFFF"],
    fontFamily: baoyuFont,
    visual: {
      theme: options.theme,
      primary,
      accent,
      softBg,
      border: borderSoft,
      muted,
      listSymbol: options.theme === "default" ? "◆" : options.theme === "grace" ? "✦" : options.theme === "simple" ? "●" : "✓",
      quoteSymbol: options.theme === "grace" ? "❝" : options.theme === "simple" ? "“" : options.theme === "modern" ? "｜" : "※",
      ctaPrefix: options.theme === "modern" ? "ACTION" : options.theme === "grace" ? "Editor's Note" : options.theme === "simple" ? "Next Step" : "写在最后",
    },
    container: shared.container,
    body: shared.body,
    blocks,
    marker: {
      section: { display: "none" },
      listBullet: { color: primary, "font-weight": 800 },
      imageLabel: { color: primary, "font-weight": 700 },
    },
  };
}

function sectionStyle(theme: BaoyuTheme, primary: string, accent: string, fontSize: number): InlineStyle {
  if (theme === "modern") {
    return {
      display: "block",
      width: "100%",
      margin: "34px auto 20px",
      padding: "0 0 4px",
      color: primary,
      "border-bottom": `2px solid ${accent}`,
      "font-size": "20px",
      "font-weight": 800,
      "line-height": "1.7",
      "text-align": "left",
      "letter-spacing": "0",
    };
  }

  if (theme === "simple") {
    return {
      display: "table",
      margin: "56px auto 28px",
      padding: "5px 20px",
      color: "#FFFFFF",
      "background-color": primary,
      "border-radius": "8px 24px 8px 24px",
      "box-shadow": "0 2px 6px rgba(0,0,0,0.06)",
      "font-size": `${Math.round(fontSize * 1.3)}px`,
      "font-weight": 800,
      "text-align": "center",
    };
  }

  return {
    display: "table",
    margin: "56px auto 28px",
    padding: theme === "grace" ? "5px 18px" : "3px 10px",
    color: "#FFFFFF",
    "background-color": primary,
    "border-radius": theme === "grace" ? "8px" : "0",
    "box-shadow": theme === "grace" ? "0 4px 6px rgba(0,0,0,0.1)" : "none",
    "font-size": `${Math.round(fontSize * 1.25)}px`,
    "font-weight": 800,
    "text-align": "center",
  };
}

function subsectionStyle(theme: BaoyuTheme, primary: string, fontSize: number, softBg: string, borderSoft: string): InlineStyle {
  if (theme === "simple") {
    return {
      margin: "32px 8px 14px",
      padding: "0 12px",
      color: "#111111",
      "background-color": softBg,
      border: `1px solid ${borderSoft}`,
      "border-left": `4px solid ${primary}`,
      "border-radius": "6px",
      "font-size": `${Math.round(fontSize * 1.15)}px`,
      "font-weight": 800,
      "line-height": "2.4",
    };
  }

  return {
    margin: theme === "modern" ? "26px 8px 14px" : "32px 8px 14px",
    padding: "0 0 0 10px",
    color: "#111111",
    "border-left": `${theme === "modern" ? 4 : theme === "grace" ? 4 : 3}px solid ${primary}`,
    "border-bottom": theme === "grace" ? `1px dashed ${primary}` : "none",
    "border-radius": theme === "modern" ? "2px" : "0",
    "font-size": `${theme === "modern" ? 20 : Math.round(fontSize * 1.15)}px`,
    "font-weight": 800,
    "line-height": theme === "modern" ? "1.35" : "1.55",
  };
}

function tint(hex: string, amount: number) {
  const value = hex.replace("#", "");
  const number = Number.parseInt(value, 16);
  const r = Math.round(((number >> 16) & 255) + (255 - ((number >> 16) & 255)) * amount);
  const g = Math.round(((number >> 8) & 255) + (255 - ((number >> 8) & 255)) * amount);
  const b = Math.round((number & 255) + (255 - (number & 255)) * amount);
  return `rgb(${r}, ${g}, ${b})`;
}

function createRecommendedTemplate(options: {
  key: TemplateKey;
  name: string;
  variant: "knowledge" | "business" | "tech";
  primary: string;
  accent: string;
  softBg: string;
  border: string;
  muted: string;
  containerBg?: string;
  description: string;
  audience: string;
}): StyleTemplate {
  const fontSize = 15;
  const foreground = "#3F3F3F";
  const strong = "#111827";
  const isBusiness = options.variant === "business";
  const isTech = options.variant === "tech";

  const blocks: Record<BlockType, InlineStyle> = { ...baseBlockStyles };

  blocks.title = {
    margin: "20px 0 24px",
    padding: isBusiness ? "16px 18px" : isTech ? "18px 18px" : "0 0 12px",
    color: isTech ? "#FFFFFF" : strong,
    "background-color": isBusiness ? "#F8FAFC" : isTech ? "#111827" : "transparent",
    border: isBusiness ? `1px solid ${options.border}` : "none",
    "border-left": isBusiness || isTech ? `5px solid ${options.primary}` : "none",
    "border-bottom": options.variant === "knowledge" ? `2px solid ${options.border}` : "none",
    "border-radius": isBusiness || isTech ? "8px" : "0",
    "font-size": "22px",
    "font-weight": 800,
    "line-height": "1.45",
    "letter-spacing": "0",
    "text-align": "left",
  };
  blocks.section = {
    margin: "34px 0 16px",
    padding: isBusiness ? "8px 12px" : isTech ? "10px 12px" : "0 0 6px 10px",
    color: isBusiness || isTech ? "#FFFFFF" : strong,
    "background-color": isBusiness ? options.primary : isTech ? "#0F172A" : "transparent",
    "border-left": options.variant === "knowledge" ? `4px solid ${options.primary}` : "none",
    "border-bottom": isTech ? `2px solid ${options.accent}` : options.variant === "knowledge" ? `1px solid ${options.border}` : "none",
    "border-radius": isBusiness || isTech ? "6px" : "0",
    "font-size": "18px",
    "font-weight": 800,
    "line-height": "1.65",
    "letter-spacing": "0",
    "text-align": "left",
  };
  blocks.subsection = {
    margin: "24px 0 10px",
    padding: "0 0 0 10px",
    color: isTech ? "#0F172A" : options.primary,
    "border-left": `3px solid ${options.accent}`,
    "font-size": "16px",
    "font-weight": 800,
    "line-height": "1.65",
  };
  blocks.paragraph = {
    margin: "15px 0",
    color: foreground,
    "font-size": `${fontSize}px`,
    "font-weight": 400,
    "line-height": "1.75",
    "letter-spacing": "0",
    "text-align": "justify",
    "word-break": "break-word",
  };
  blocks.lead = {
    margin: "18px 0 22px",
    padding: "14px 16px",
    color: foreground,
    "background-color": options.softBg,
    border: isBusiness ? `1px solid ${options.border}` : "none",
    "border-left": `4px solid ${options.primary}`,
    "border-radius": "8px",
    "font-size": `${fontSize}px`,
    "line-height": "1.75",
    "letter-spacing": "0",
  };
  blocks.quote = {
    margin: "22px 0",
    padding: "15px 16px",
    color: isTech ? "#1F2937" : foreground,
    "background-color": isTech ? "#F8FAFC" : options.softBg,
    border: isBusiness ? `1px solid ${options.border}` : "none",
    "border-left": `4px solid ${options.primary}`,
    "border-radius": "8px",
    "font-size": `${fontSize}px`,
    "line-height": "1.75",
  };
  blocks.golden = {
    display: "block",
    margin: "26px 0",
    padding: "14px 16px",
    color: isTech ? "#FFFFFF" : strong,
    "background-color": isTech ? "#111827" : options.softBg,
    border: isTech ? "none" : `1px solid ${options.border}`,
    "border-radius": "8px",
    "font-size": "16px",
    "font-weight": 800,
    "line-height": "1.75",
    "letter-spacing": "0",
    "text-align": "left",
  };
  blocks.summary = {
    margin: "28px 0",
    padding: "18px",
    color: isTech ? "#FFFFFF" : strong,
    "background-color": isTech ? "#0F172A" : options.softBg,
    border: isTech ? "none" : `1px solid ${options.border}`,
    "border-radius": "8px",
    "font-size": "16px",
    "font-weight": 700,
    "line-height": "1.8",
  };
  blocks.cta = {
    margin: "32px 0 0",
    padding: "16px 18px",
    color: isTech ? "#FFFFFF" : options.primary,
    "background-color": isTech ? "#111827" : options.softBg,
    border: isTech ? "none" : `1px solid ${options.border}`,
    "border-radius": "8px",
    "font-size": "16px",
    "font-weight": 800,
    "line-height": "1.75",
    "text-align": "left",
  };
  blocks.image = {
    margin: "24px 0",
    padding: "16px",
    color: options.muted,
    "background-color": "#FAFAFA",
    border: `1px solid ${options.border}`,
    "border-radius": "8px",
    "font-size": "14px",
    "line-height": "1.75",
    "text-align": "center",
  };
  blocks.list = {
    margin: "20px 0",
    padding: "16px 18px",
    color: foreground,
    "background-color": options.softBg,
    border: isBusiness || isTech ? `1px solid ${options.border}` : "none",
    "border-radius": "8px",
    "font-size": `${fontSize}px`,
    "line-height": "1.75",
  };
  blocks.card = {
    margin: "20px 0",
    padding: "16px 18px",
    color: foreground,
    "background-color": isTech ? "#FFFFFF" : "#FFFFFF",
    border: `1px solid ${options.border}`,
    "border-left": isBusiness ? `4px solid ${options.primary}` : isTech ? `4px solid ${options.accent}` : `4px solid ${options.primary}`,
    "border-radius": "8px",
    "font-size": `${fontSize}px`,
    "line-height": "1.75",
  };

  return {
    key: options.key,
    name: options.name,
    description: options.description,
    audience: options.audience,
    palette: [options.primary, options.softBg, options.containerBg ?? "#FFFFFF"],
    fontFamily: baoyuFont,
    visual: {
      theme: isTech ? "modern" : isBusiness ? "simple" : "default",
      variant: options.variant,
      defaultParseMode: options.variant === "business" ? "business" : "knowledge",
      primary: options.primary,
      accent: options.accent,
      softBg: options.softBg,
      border: options.border,
      muted: options.muted,
      listSymbol: isBusiness ? "01" : isTech ? ">" : "-",
      quoteSymbol: isTech ? "NOTE" : "｜",
      ctaPrefix: isBusiness ? "行动建议" : isTech ? "NEXT" : "下一步",
    },
    container: {
      "max-width": "100%",
      "box-sizing": "border-box",
      "font-size": `${fontSize}px`,
      "line-height": "1.75",
      "letter-spacing": "0",
      color: foreground,
      "background-color": options.containerBg ?? "transparent",
      padding: "12px 10px",
      "border-radius": options.containerBg ? "8px" : "0",
    },
    body: { fontSize, lineHeight: 1.75, color: foreground },
    blocks,
    marker: {
      section: { display: "none" },
      listBullet: { color: options.primary, "font-weight": 800 },
      imageLabel: { color: options.primary, "font-weight": 700 },
    },
  };
}

export const styleTemplates: Record<TemplateKey, StyleTemplate> = {
  zhenyiKnowledgeMinimal: createRecommendedTemplate({
    key: "zhenyiKnowledgeMinimal",
    name: "臻一 知识简约",
    variant: "knowledge",
    primary: "#0F766E",
    accent: "#99F6E4",
    softBg: "#F0FDFA",
    border: "#CCFBF1",
    muted: "#64748B",
    description: "低阅读压力的知识长文样式：白底、短段落、细边框、重点克制。",
    audience: "AI 提效方法论、深度文章、教程复盘",
  }),
  zhenyiBusinessCase: createRecommendedTemplate({
    key: "zhenyiBusinessCase",
    name: "臻一 商务案例",
    variant: "business",
    primary: "#1F5EFF",
    accent: "#F59E0B",
    softBg: "#F8FAFC",
    border: "#DBE4F0",
    muted: "#64748B",
    description: "案例和转化型文章样式：蓝色标题、诊断卡片、方案卡片、结尾 CTA。",
    audience: "企业服务、客户案例、SOP 样板包",
  }),
  zhenyiTechCards: createRecommendedTemplate({
    key: "zhenyiTechCards",
    name: "臻一 科技卡片",
    variant: "tech",
    primary: "#111827",
    accent: "#38BDF8",
    softBg: "#F1F5F9",
    border: "#CBD5E1",
    muted: "#64748B",
    containerBg: "#F8FAFC",
    description: "科技解读样式：深色标题、浅灰信息卡、适合参数和趋势拆解。",
    audience: "产品测评、AI 工具解读、技术趋势文章",
  }),
  baoyuDefaultBlue: createBaoyuTemplate({
    key: "baoyuDefaultBlue",
    name: "Baoyu 经典蓝",
    theme: "default",
    primary: colorPresets.blue,
    description: "对应 baoyu default：居中标题、色块小节、经典公众号样式。",
    audience: "通用文章、教程、正式发布",
  }),
  baoyuDefaultGreen: createBaoyuTemplate({
    key: "baoyuDefaultGreen",
    name: "Baoyu 经典绿",
    theme: "default",
    primary: colorPresets.green,
    description: "default + green：经典结构配绿色主色，适合知识和工具类文章。",
    audience: "教程、工具、知识普及",
  }),
  baoyuGracePurple: createBaoyuTemplate({
    key: "baoyuGracePurple",
    name: "Baoyu 优雅紫",
    theme: "grace",
    primary: colorPresets.purple,
    description: "对应 baoyu grace：阴影、圆角、柔和引用，视觉更精致。",
    audience: "随笔、品牌内容、轻商业文章",
  }),
  baoyuGraceRose: createBaoyuTemplate({
    key: "baoyuGraceRose",
    name: "Baoyu 优雅玫瑰",
    theme: "grace",
    primary: colorPresets.rose,
    description: "grace + rose：更柔和的优雅模板，适合人物、品牌和情绪内容。",
    audience: "人物稿、品牌稿、生活方式",
  }),
  baoyuSimpleGreen: createBaoyuTemplate({
    key: "baoyuSimpleGreen",
    name: "Baoyu 简洁绿",
    theme: "simple",
    primary: colorPresets.green,
    description: "对应 baoyu simple：现代简洁、非对称圆角、模块边界清楚。",
    audience: "知识卡片、方法论、干货整理",
  }),
  baoyuSimpleSky: createBaoyuTemplate({
    key: "baoyuSimpleSky",
    name: "Baoyu 简洁天蓝",
    theme: "simple",
    primary: colorPresets.sky,
    description: "simple + sky：清爽轻量，适合产品更新、清单和说明文。",
    audience: "产品说明、清单、轻教程",
  }),
  baoyuModernOrange: createBaoyuTemplate({
    key: "baoyuModernOrange",
    name: "Baoyu 现代橙",
    theme: "modern",
    primary: colorPresets.orange,
    accent: "#E4B1A0",
    containerBg: "rgba(250, 249, 245, 1)",
    fontSize: 15,
    description: "对应 baoyu modern：大圆角、药丸标题、宽松行距。",
    audience: "轻松内容、产品解读、生活方式",
  }),
  baoyuModernRed: createBaoyuTemplate({
    key: "baoyuModernRed",
    name: "Baoyu 现代红金",
    theme: "modern",
    primary: colorPresets.red,
    accent: "#D6A156",
    containerBg: "rgba(253, 248, 240, 1)",
    fontSize: 15,
    description: "modern + red：适合传统红金风、节日、正式活动。",
    audience: "活动推文、节日内容、正式通知",
  }),
  baoyuDefaultBlack: createBaoyuTemplate({
    key: "baoyuDefaultBlack",
    name: "Baoyu 经典黑",
    theme: "default",
    primary: colorPresets.black,
    description: "default + black：更克制的经典排版，适合长文和观点。",
    audience: "观点长文、深度分析、专栏",
  }),
  baoyuModernBlack: createBaoyuTemplate({
    key: "baoyuModernBlack",
    name: "Baoyu 现代石墨",
    theme: "modern",
    primary: colorPresets.black,
    accent: "#A9A9A9",
    containerBg: "rgba(248, 248, 248, 1)",
    fontSize: 15,
    description: "modern + black：现代结构但更克制，适合科技和深度内容。",
    audience: "科技评论、深度分析、研究笔记",
  }),
};

export const templateList = Object.values(styleTemplates);
