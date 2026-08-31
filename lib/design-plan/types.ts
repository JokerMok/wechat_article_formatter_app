import type { PlatformId } from "../platforms/types";
import type { DesignDensity, DesignSchemeId } from "../design-schemes";

export const CONTENT_TYPE_IDS = [
  "knowledgeTutorial",
  "checklistGuide",
  "opinionAnalysis",
  "dataInsight",
  "caseReview",
  "storyNarrative",
  "productIntroduction",
  "experienceSharing",
] as const;

export type ContentType = (typeof CONTENT_TYPE_IDS)[number];
export type ContentTone = "理性" | "叙事" | "实用" | "轻松";
export type ContentBlockRole = "cover" | "hook" | "heading" | "body" | "highlight" | "conclusion" | "action" | "media";

export const GENERATION_MODE_IDS = ["layoutOnly", "reachOptimized"] as const;
export type GenerationMode = (typeof GENERATION_MODE_IDS)[number];

export type ContentProvenance = "source" | "expressionOptimization";

export type SourceFact = {
  id: string;
  text: string;
  sourceBlockIds: string[];
};

export type ContentSectionPurpose = "opening" | "context" | "argument" | "step" | "evidence" | "conflict" | "turning" | "conclusion";

export type ContentSection = {
  id: string;
  title?: string;
  purpose: ContentSectionPurpose;
  sourceBlockIds: string[];
};

export type ContentBlueprint = {
  schemaVersion: 1;
  generationMode: GenerationMode;
  contentType: ContentType;
  targetAudience?: string;
  sourceFacts: SourceFact[];
  coreMessage: string;
  titleCandidates: string[];
  openingHook?: string;
  sections: ContentSection[];
  conclusion?: string;
  callToAction?: string;
  modificationSummary: string[];
};

export const PAGE_PLAN_KINDS = [
  "cover",
  "opening",
  "section",
  "point",
  "quote",
  "objective",
  "step",
  "warning",
  "action",
  "keyMetric",
  "evidence",
  "comparison",
  "interpretation",
  "boundary",
  "conflict",
  "turning",
  "chapter",
  "summary",
  "ending",
] as const;

export type PagePlanKind = (typeof PAGE_PLAN_KINDS)[number];
export type PlannedBlockRole = "title" | "subtitle" | "heading" | "body" | "focus" | "list" | "media";

export type PlannedContentBlock = {
  id: string;
  role: PlannedBlockRole;
  text: string;
  sourceBlockIds: string[];
  provenance: ContentProvenance;
};

export type PagePlan = {
  id: string;
  kind: PagePlanKind;
  title?: string;
  sourceBlockIds: string[];
  blocks: PlannedContentBlock[];
};

export type DesignPalette = {
  primary: string;
  secondary: string;
  background: string;
  text: string;
};

export type TypographyTokens = {
  titleScale: number;
  headingScale: number;
  bodyScale: number;
  lineHeight: number;
};

export type ExportSpec = {
  format: "html" | "png" | "text";
  width?: number;
  height?: number;
  aspectRatio?: "3:4" | "9:16";
};

export type PlatformDesignPlan = {
  schemaVersion: 1;
  platform: PlatformId;
  visualPresetId: DesignSchemeId;
  title: string;
  publishCopy: string;
  palette: DesignPalette;
  typography: TypographyTokens;
  pages: PagePlan[];
  exportSpec: ExportSpec;
};

export type DesignPlanBlock = {
  blockId: string;
  role: ContentBlockRole;
  priority: 1 | 2 | 3;
};

export type DesignPlan = {
  schemaVersion: 1;
  sourceRevision: string;
  generationMode: GenerationMode;
  contentType: ContentType;
  targetAudience: string;
  coreMessage: string;
  tone: ContentTone;
  recommendedPlatforms: PlatformId[];
  recommendedScheme: DesignSchemeId;
  visualStyle: string;
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
  density: DesignDensity;
  coverStrategy: string;
  blockOrder: DesignPlanBlock[];
  highlights: string[];
  pagination: {
    xiaohongshuTargetPages: number;
    douyinImageTargetPages: number;
  };
  callToAction: string;
  recommendationReason: string;
  titleCandidates: string[];
  recommendedTitle: string;
  openingHook: string;
  keyPoints: string[];
  conclusion: string;
  tags: string[];
  blueprint: ContentBlueprint;
  platformPlans: Record<PlatformId, PlatformDesignPlan>;
  modificationSummary: string[];
};
