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
