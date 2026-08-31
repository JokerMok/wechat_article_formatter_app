import type { TemplateKey } from "../article-types";
import type { PlatformId } from "../platforms/types";

export const DESIGN_SCHEME_IDS = [
  "knowledgeMinimal",
  "dataInsight",
  "checklistGuide",
  "storyNarrative",
] as const;

export type DesignSchemeId = (typeof DESIGN_SCHEME_IDS)[number];

export const LEGACY_DESIGN_SCHEME_IDS = ["productCase", "lightRecommendation"] as const;
export type LegacyDesignSchemeId = (typeof LEGACY_DESIGN_SCHEME_IDS)[number];

export type DesignDensity = "舒展" | "均衡" | "紧凑";
export type DesignLayoutVariant = "editorial" | "checklist" | "data" | "story";

export const VISUAL_THEME_IDS = ["editorial", "informationCard", "storyMagazine"] as const;
export type VisualThemeId = (typeof VISUAL_THEME_IDS)[number];

export type ThemeColors = {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
  highlight: string;
};

export type SpacingTokens = {
  pageMargin: number;
  titleGap: number;
  sectionGap: number;
  paragraphGap: number;
};

export type DecorationTokens = {
  radius: number;
  borderWidth: number;
  shadow: string;
  ruleStyle: "hairline" | "solid" | "block";
};

export type BlockVariantTokens = {
  title: "editorial" | "stacked" | "display";
  heading: "numbered" | "bar" | "chapter";
  focus: "underline" | "card" | "pullQuote";
  quote: "rail" | "signal" | "editorial";
};

export type VisualTheme = {
  id: VisualThemeId;
  name: string;
  description: string;
  colors: ThemeColors;
  typography: {
    titleFamily: string;
    bodyFamily: string;
    focusFamily: string;
    titleScale: number;
    headingScale: number;
    bodyScale: number;
    lineHeight: number;
  };
  spacing: SpacingTokens;
  decoration: DecorationTokens;
  blockVariants: BlockVariantTokens;
};

// Reserved for future brand controls; theme tokens remain the source of truth
// until a user override can be contrast-checked and applied consistently.
export type BrandOverride = {
  primaryColor?: string;
  logoAssetId?: string;
  fontFamily?: string;
  authorName?: string;
  footer?: string;
  watermark?: string;
};

export const CONTENT_LAYOUT_IDS = ["editorial", "checklist", "data", "story"] as const;
export type ContentLayoutId = (typeof CONTENT_LAYOUT_IDS)[number];

export type ContentLayout = {
  id: ContentLayoutId;
  name: string;
  contentTypes: string[];
  density: "low" | "medium" | "high";
  pageSequence: string[];
  blockRules: Array<{ role: string; maxChars: number; maxBlocks: number }>;
  paginationRules: {
    longformCharacterBudget: { wechat: number; douyinLongform: number };
    cardCharacterBudget: { xiaohongshu: number; douyinImage: number };
    cardMaxUnits: { xiaohongshu: number; douyinImage: number };
    shortPageThreshold: number;
    allowSplitLongParagraphs: boolean;
  };
};

export type PlatformDesignRule = {
  purpose: string;
  structure: string[];
  maxContentBlocks: number;
};

export type DesignScheme = {
  id: DesignSchemeId;
  name: string;
  description: string;
  contentTypes: string[];
  platforms: PlatformId[];
  density: DesignDensity;
  layoutVariant: DesignLayoutVariant;
  themeId: VisualThemeId;
  contentLayoutId: ContentLayoutId;
  palette: {
    primary: string;
    secondary: string;
    background: string;
    text: string;
  };
  typography: {
    titleScale: number;
    headingScale: number;
    bodyScale: number;
    lineHeight: number;
  };
  structure: string[];
  platformRules: Record<PlatformId, PlatformDesignRule>;
  templateKey: TemplateKey;
};

export function normalizeDesignSchemeId(value: unknown): DesignSchemeId {
  if (typeof value === "string" && (DESIGN_SCHEME_IDS as readonly string[]).includes(value)) {
    return value as DesignSchemeId;
  }
  if (value === "productCase") return "knowledgeMinimal";
  if (value === "lightRecommendation") return "storyNarrative";
  return "knowledgeMinimal";
}
