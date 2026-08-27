import type { TemplateKey } from "../article-types";
import type { PlatformId } from "../platforms/types";

export const DESIGN_SCHEME_IDS = [
  "knowledgeMinimal",
  "dataInsight",
  "checklistGuide",
  "storyNarrative",
  "productCase",
  "lightRecommendation",
] as const;

export type DesignSchemeId = (typeof DESIGN_SCHEME_IDS)[number];

export type DesignDensity = "舒展" | "均衡" | "紧凑";

export type DesignScheme = {
  id: DesignSchemeId;
  name: string;
  description: string;
  contentTypes: DesignSchemeId[];
  platforms: PlatformId[];
  density: DesignDensity;
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
  templateKey: TemplateKey;
};
