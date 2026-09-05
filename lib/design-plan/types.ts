import type { UnifiedArticleBlock, UnifiedArticleContent } from "../content";
import type { PlatformId } from "../platforms/types";
import type { BrandOverride, ContentLayout, ContentLayoutId, DesignDensity, DesignSchemeId, VisualThemeId } from "../design-schemes";

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

export const EDITORIAL_SECTION_ROLES = [
  "context",
  "claim",
  "evidence",
  "example",
  "comparison",
  "method",
  "warning",
  "conclusion",
] as const;

export type EditorialSectionRole = (typeof EDITORIAL_SECTION_ROLES)[number];

export type EditorialSection = {
  id: string;
  role: EditorialSectionRole;
  heading?: string;
  body?: string;
  bullets?: string[];
  sourceBlockIds: string[];
};

/**
 * The smallest model-facing content contract. It carries editorial intent and
 * source traceability, while page geometry and renderable blocks stay local.
 */
export type EditorialPlan = {
  schemaVersion: 1;
  platform: PlatformId;
  contentType: ContentType;
  title: string;
  hook?: string;
  sections: EditorialSection[];
  summary?: string;
  tags?: string[];
};

export type ContentProvenance = "source" | "structuralSummary" | "expressionOptimization";

export type SourceFact = {
  id: string;
  text: string;
  sourceBlockIds: string[];
};

export type ContentSectionPurpose = "opening" | "context" | "argument" | "step" | "evidence" | "conflict" | "turning" | "conclusion";

export const SEMANTIC_SECTION_ROLES = [
  "hook",
  "background",
  "problem",
  "conflict",
  "argument",
  "evidence",
  "example",
  "method",
  "result",
  "counterArgument",
  "boundary",
  "conclusion",
  "callToAction",
] as const;

export type SemanticSectionRole = (typeof SEMANTIC_SECTION_ROLES)[number];
export type SemanticCertainty = "certain" | "uncertain";

export type DisplayHeading = {
  text: string;
  provenance: ContentProvenance;
  confidence: number;
};

export type SemanticUnit = {
  id: string;
  text: string;
  sourceBlockIds: string[];
  certainty: SemanticCertainty;
  confidence: number;
};

export type NarrativeArc = {
  opening: string;
  development: string;
  turningPoint?: string;
  resolution?: string;
};

export type ContentSection = {
  id: string;
  /** Legacy internal label. It is never rendered unless displayHeading is present. */
  title: string;
  role: SemanticSectionRole;
  summary: string;
  sourceBlockIds: string[];
  keyMessage: string;
  importance: number;
  canSplit: boolean;
  recommendedPageRole: PagePlanKind;
  titleProvenance?: Exclude<ContentProvenance, "expressionOptimization">;
  displayHeading?: DisplayHeading;
  /** Legacy alias retained for persisted projects and older integrations. */
  purpose?: ContentSectionPurpose;
};

export type ContentBlueprint = {
  schemaVersion: 1;
  generationMode: GenerationMode;
  primaryContentType: ContentType;
  secondaryContentTypes: ContentType[];
  centralThesis: string;
  targetAudience: string;
  tone: ContentTone;
  narrativeArc: NarrativeArc;
  sections: ContentSection[];
  keyPoints: string[];
  facts: SemanticUnit[];
  quantifiedDetails: SemanticUnit[];
  opinions: SemanticUnit[];
  examples: SemanticUnit[];
  methods: SemanticUnit[];
  results: SemanticUnit[];
  counterArguments: SemanticUnit[];
  boundaries: SemanticUnit[];
  goldenSentences: SemanticUnit[];
  conclusion: string;
  topicTags: string[];
  confidence: number;
  warnings: string[];
  /** Backward-compatible fields used by older saved plans and renderers. */
  contentType: ContentType;
  sourceFacts: SourceFact[];
  coreMessage: string;
  titleCandidates: string[];
  openingHook?: string;
  callToAction?: string;
  modificationSummary: string[];
};

/** SemanticArticle is the named contract between analysis and platform planning. */
export type SemanticArticle = ContentBlueprint;

export const PAGE_PLAN_KINDS = [
  "cover",
  "intro",
  "opening",
  "section",
  "argument",
  "point",
  "quote",
  "objective",
  "step",
  "checklist",
  "warning",
  "action",
  "callToAction",
  "keyMetric",
  "evidence",
  "comparison",
  "interpretation",
  "boundary",
  "conflict",
  "turning",
  "transition",
  "chapter",
  "summary",
  "conclusion",
  "epilogue",
  "ending",
] as const;

export type PagePlanKind = (typeof PAGE_PLAN_KINDS)[number];
export type PlannedBlockRole = "title" | "subtitle" | "heading" | "body" | "focus" | "list" | "media";

/**
 * Source references explain where a unit came from. They must not be used as
 * a consumption key because the same source block may be referenced by a
 * cover teaser, a quote, and the body independently.
 */
export type ContentUnitUsage = "reference" | "body";

export type PlannedSourceUnit = {
  unitId: string;
  role: PlannedBlockRole;
  text: string;
  sourceBlockIds: string[];
  sourceType: UnifiedArticleBlock["type"];
  usage: ContentUnitUsage;
};

export type PlannedContentBlock = {
  id: string;
  /** Stable identity for deduplication within one platform output. */
  unitId?: string;
  role: PlannedBlockRole;
  text: string;
  sourceBlockIds: string[];
  provenance: ContentProvenance;
  /** Optional for backwards-compatible persisted plans. New plans always set it. */
  usage?: ContentUnitUsage;
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
  titleFamily?: string;
  bodyFamily?: string;
  focusFamily?: string;
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
  themeId?: VisualThemeId;
  layoutId?: ContentLayoutId;
  title: string;
  publishCopy: string;
  palette: DesignPalette;
  typography: TypographyTokens;
  brandOverride?: BrandOverride;
  editorialPlan?: EditorialPlan;
  integrity?: ContentIntegrityResult;
  pages: PagePlan[];
  exportSpec: ExportSpec;
};

export type ContentIntegrityResult = {
  sourceCoverage: number;
  missingSourceBlockIds: string[];
  duplicatedBodyUnitIds: string[];
  unresolvedEditorialUnits: string[];
};

export type RenderValidationResult = {
  valid: boolean;
  issues: string[];
};

export type PlatformRenderer<TOutput = unknown> = {
  platform: PlatformId;
  render: (source: UnifiedArticleContent, plan: PlatformDesignPlan) => TOutput;
  validate: (result: TOutput) => RenderValidationResult;
};

export type DesignPlanBlock = {
  blockId: string;
  role: ContentBlockRole;
  priority: 1 | 2 | 3;
};

export type DesignPlan = {
  schemaVersion: 1;
  sourceRevision: string;
  /** Stable identity of the semantic analysis used to build platform plans. */
  analysisRevision?: string;
  generationMode: GenerationMode;
  contentType: ContentType;
  targetAudience: string;
  coreMessage: string;
  tone: ContentTone;
  recommendedPlatforms: PlatformId[];
  recommendedScheme: DesignSchemeId;
  recommendedThemeId?: VisualThemeId;
  contentLayoutId?: ContentLayoutId;
  contentLayout?: ContentLayout;
  brandOverride?: BrandOverride;
  visualStyle: string;
  palette: {
    primary: string;
    secondary: string;
    background: string;
    text: string;
  };
  typography: TypographyTokens;
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
