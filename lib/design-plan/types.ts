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

export type DesignPlanBlock = {
  blockId: string;
  role: ContentBlockRole;
  priority: 1 | 2 | 3;
};

export type DesignPlan = {
  schemaVersion: 1;
  sourceRevision: string;
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
};
