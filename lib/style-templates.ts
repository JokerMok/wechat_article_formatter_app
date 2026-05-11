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

export const styleTemplates: Record<TemplateKey, StyleTemplate> = {
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
