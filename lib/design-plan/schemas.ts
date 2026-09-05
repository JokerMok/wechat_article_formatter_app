import { z } from "zod";
import { CONTENT_LAYOUT_IDS, DESIGN_SCHEME_IDS, VISUAL_THEME_IDS } from "../design-schemes";
import { CONTENT_TYPE_IDS, EDITORIAL_SECTION_ROLES, GENERATION_MODE_IDS, PAGE_PLAN_KINDS, SEMANTIC_SECTION_ROLES } from "./types";

const platformIdSchema = z.enum(["wechat", "xiaohongshu", "douyinImage", "douyinLongform"]);
const schemeIdSchema = z.enum(DESIGN_SCHEME_IDS);
const visualThemeIdSchema = z.enum(VISUAL_THEME_IDS);
const contentLayoutIdSchema = z.enum(CONTENT_LAYOUT_IDS);
const contentTypeSchema = z.enum(CONTENT_TYPE_IDS);
const generationModeSchema = z.enum(GENERATION_MODE_IDS);
const editorialSectionRoleSchema = z.enum(EDITORIAL_SECTION_ROLES);

const paletteSchema = z.strictObject({
  primary: z.string().min(4).max(32),
  secondary: z.string().min(4).max(32),
  background: z.string().min(4).max(32),
  text: z.string().min(4).max(32),
});

const typographySchema = z.strictObject({
  titleScale: z.number().min(0.7).max(1.4),
  headingScale: z.number().min(0.7).max(1.4),
  bodyScale: z.number().min(0.7).max(1.4),
  lineHeight: z.number().min(1.2).max(2.2),
  titleFamily: z.string().max(240).optional(),
  bodyFamily: z.string().max(240).optional(),
  focusFamily: z.string().max(240).optional(),
});

const brandOverrideSchema = z.strictObject({
  primaryColor: z.string().max(32).optional(),
  logoAssetId: z.string().max(160).optional(),
  fontFamily: z.string().max(240).optional(),
  authorName: z.string().max(120).optional(),
  footer: z.string().max(240).optional(),
  watermark: z.string().max(120).optional(),
});

const plannedContentBlockSchema = z.strictObject({
  id: z.string().min(1),
  // Optional keeps saved projects from older schema versions readable. New
  // plans always persist both fields so page generation can deduplicate units
  // without confusing source references with consumed content.
  unitId: z.string().min(1).optional(),
  role: z.enum(["title", "subtitle", "heading", "body", "focus", "list", "media"]),
  text: z.string(),
  sourceBlockIds: z.array(z.string().min(1)),
  provenance: z.enum(["source", "structuralSummary", "expressionOptimization"]),
  usage: z.enum(["reference", "body"]).optional(),
});

export const editorialPlanSchema = z.strictObject({
  schemaVersion: z.literal(1),
  platform: platformIdSchema,
  contentType: contentTypeSchema,
  title: z.string().min(1).max(120),
  hook: z.string().min(1).max(500).optional(),
  sections: z.array(z.strictObject({
    id: z.string().min(1).max(160),
    role: editorialSectionRoleSchema,
    heading: z.string().min(1).max(160).optional(),
    body: z.string().min(1).max(12000).optional(),
    bullets: z.array(z.string().min(1).max(500)).max(12).optional(),
    sourceBlockIds: z.array(z.string().min(1)).min(1),
  })).min(1).max(16),
  summary: z.string().min(1).max(500).optional(),
  tags: z.array(z.string().min(1).max(32)).max(8).optional(),
});

const pagePlanSchema = z.strictObject({
  id: z.string().min(1),
  kind: z.enum(PAGE_PLAN_KINDS),
  title: z.string().optional(),
  sourceBlockIds: z.array(z.string().min(1)),
  blocks: z.array(plannedContentBlockSchema),
});

const contentIntegritySchema = z.strictObject({
  sourceCoverage: z.number().min(0).max(1),
  missingSourceBlockIds: z.array(z.string()),
  duplicatedBodyUnitIds: z.array(z.string()),
  unresolvedEditorialUnits: z.array(z.string()),
});

const platformDesignPlanSchema = z.strictObject({
  schemaVersion: z.literal(1),
  platform: platformIdSchema,
  visualPresetId: schemeIdSchema,
  themeId: visualThemeIdSchema.optional(),
  layoutId: contentLayoutIdSchema.optional(),
  title: z.string().min(1).max(120),
  publishCopy: z.string(),
  palette: paletteSchema,
  typography: typographySchema,
  brandOverride: brandOverrideSchema.optional(),
  editorialPlan: editorialPlanSchema.optional(),
  integrity: contentIntegritySchema.optional(),
  pages: z.array(pagePlanSchema).min(1),
  exportSpec: z.strictObject({
    format: z.enum(["html", "png", "text"]),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    aspectRatio: z.enum(["3:4", "9:16"]).optional(),
  }),
});

const semanticUnitSchema = z.strictObject({
  id: z.string().min(1).max(160),
  text: z.string().min(1).max(1000),
  sourceBlockIds: z.array(z.string().min(1)).min(1),
  certainty: z.enum(["certain", "uncertain"]),
  confidence: z.number().min(0).max(1),
});

const narrativeArcSchema = z.strictObject({
  opening: z.string().max(500),
  development: z.string().max(500),
  turningPoint: z.string().max(500).optional(),
  resolution: z.string().max(500).optional(),
});

const semanticSectionSchema = z.strictObject({
  id: z.string().min(1).max(160),
  title: z.string().max(160),
  role: z.enum(SEMANTIC_SECTION_ROLES),
  summary: z.string().max(500),
  sourceBlockIds: z.array(z.string().min(1)),
  keyMessage: z.string().max(500),
  importance: z.number().min(0).max(1),
  canSplit: z.boolean(),
  recommendedPageRole: z.enum(PAGE_PLAN_KINDS),
  titleProvenance: z.enum(["source", "structuralSummary"]).optional(),
  displayHeading: z.strictObject({
    text: z.string().min(1).max(160),
    provenance: z.enum(["source", "structuralSummary", "expressionOptimization"]),
    confidence: z.number().min(0).max(1),
  }).optional(),
  purpose: z.enum(["opening", "context", "argument", "step", "evidence", "conflict", "turning", "conclusion"]).optional(),
});

export const semanticBlueprintSchema = z.strictObject({
  schemaVersion: z.literal(1),
  generationMode: generationModeSchema,
  primaryContentType: contentTypeSchema,
  secondaryContentTypes: z.array(contentTypeSchema).max(CONTENT_TYPE_IDS.length),
  centralThesis: z.string().min(1).max(500),
  targetAudience: z.string().min(1).max(160),
  tone: z.enum(["理性", "叙事", "实用", "轻松"]),
  narrativeArc: narrativeArcSchema,
  sections: z.array(semanticSectionSchema).min(1).max(32),
  keyPoints: z.array(z.string().min(1).max(500)).max(8),
  facts: z.array(semanticUnitSchema).max(64),
  quantifiedDetails: z.array(semanticUnitSchema).max(64).default([]),
  opinions: z.array(semanticUnitSchema).max(64),
  examples: z.array(semanticUnitSchema).max(64),
  methods: z.array(semanticUnitSchema).max(64),
  results: z.array(semanticUnitSchema).max(64),
  counterArguments: z.array(semanticUnitSchema).max(64),
  boundaries: z.array(semanticUnitSchema).max(64),
  goldenSentences: z.array(semanticUnitSchema).max(16),
  conclusion: z.string().max(500),
  topicTags: z.array(z.string().min(1).max(32)).max(12),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string().min(1).max(240)).max(16),
});

export const contentBlueprintSchema = z.strictObject({
  schemaVersion: z.literal(1),
  generationMode: generationModeSchema,
  primaryContentType: contentTypeSchema,
  secondaryContentTypes: z.array(contentTypeSchema),
  centralThesis: z.string().min(1).max(500),
  targetAudience: z.string().min(1).max(160),
  tone: z.enum(["理性", "叙事", "实用", "轻松"]),
  narrativeArc: narrativeArcSchema,
  keyPoints: z.array(z.string().min(1).max(500)).max(8),
  facts: z.array(semanticUnitSchema).max(64),
  quantifiedDetails: z.array(semanticUnitSchema).max(64).default([]),
  opinions: z.array(semanticUnitSchema).max(64),
  examples: z.array(semanticUnitSchema).max(64),
  methods: z.array(semanticUnitSchema).max(64),
  results: z.array(semanticUnitSchema).max(64),
  counterArguments: z.array(semanticUnitSchema).max(64),
  boundaries: z.array(semanticUnitSchema).max(64),
  goldenSentences: z.array(semanticUnitSchema).max(16),
  topicTags: z.array(z.string().min(1).max(32)).max(12),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string().min(1).max(240)).max(16),
  contentType: contentTypeSchema,
  sourceFacts: z.array(z.strictObject({
    id: z.string().min(1),
    text: z.string().min(1),
    sourceBlockIds: z.array(z.string().min(1)).min(1),
  })),
  coreMessage: z.string().min(1).max(500),
  titleCandidates: z.array(z.string().min(1).max(80)).min(1).max(3),
  openingHook: z.string().min(1).max(300).optional(),
  sections: z.array(semanticSectionSchema),
  conclusion: z.string().min(1).max(500),
  callToAction: z.string().min(1).max(240).optional(),
  modificationSummary: z.array(z.string().min(1).max(180)).max(8),
});

export const designPlanSchema = z.strictObject({
  schemaVersion: z.literal(1),
  sourceRevision: z.string().min(1),
  analysisRevision: z.string().min(1).optional(),
  generationMode: generationModeSchema,
  contentType: contentTypeSchema,
  targetAudience: z.string().min(1).max(120),
  coreMessage: z.string().min(1).max(500),
  tone: z.enum(["理性", "叙事", "实用", "轻松"]),
  recommendedPlatforms: z.array(platformIdSchema).min(1).max(4),
  recommendedScheme: schemeIdSchema,
  recommendedThemeId: visualThemeIdSchema.optional(),
  contentLayoutId: contentLayoutIdSchema.optional(),
  contentLayout: z.strictObject({
    id: contentLayoutIdSchema,
    name: z.string(),
    contentTypes: z.array(z.string()),
    density: z.enum(["low", "medium", "high"]),
    pageSequence: z.array(z.string()),
    blockRules: z.array(z.strictObject({ role: z.string(), maxChars: z.number().int().positive(), maxBlocks: z.number().int().positive() })),
    paginationRules: z.strictObject({
      longformCharacterBudget: z.strictObject({ wechat: z.number().int().positive(), douyinLongform: z.number().int().positive() }),
      cardCharacterBudget: z.strictObject({ xiaohongshu: z.number().int().positive(), douyinImage: z.number().int().positive() }),
      cardMaxUnits: z.strictObject({ xiaohongshu: z.number().int().positive(), douyinImage: z.number().int().positive() }),
      shortPageThreshold: z.number().min(0).max(1),
      allowSplitLongParagraphs: z.boolean(),
    }),
  }).optional(),
  brandOverride: brandOverrideSchema.optional(),
  visualStyle: z.string().min(1).max(80),
  palette: paletteSchema,
  typography: typographySchema,
  density: z.enum(["舒展", "均衡", "紧凑"]),
  coverStrategy: z.string().min(1).max(240),
  blockOrder: z.array(
    z.strictObject({
      blockId: z.string().min(1),
      role: z.enum(["cover", "hook", "heading", "body", "highlight", "conclusion", "action", "media"]),
      priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    }),
  ),
  highlights: z.array(z.string().min(1).max(300)).max(8),
  pagination: z.strictObject({
    xiaohongshuTargetPages: z.number().int().min(1).max(12),
    douyinImageTargetPages: z.number().int().min(1).max(10),
  }),
  callToAction: z.string().max(240),
  recommendationReason: z.string().min(1).max(300),
  titleCandidates: z.array(z.string().min(1).max(80)).min(1).max(3),
  recommendedTitle: z.string().min(1).max(80),
  openingHook: z.string().min(1).max(300),
  keyPoints: z.array(z.string().min(1).max(300)).min(1).max(5),
  conclusion: z.string().min(1).max(500),
  tags: z.array(z.string().min(1).max(20)).max(8),
  blueprint: contentBlueprintSchema,
  platformPlans: z.strictObject({
    wechat: platformDesignPlanSchema,
    xiaohongshu: platformDesignPlanSchema,
    douyinImage: platformDesignPlanSchema,
    douyinLongform: platformDesignPlanSchema,
  }),
  modificationSummary: z.array(z.string().min(1).max(180)).max(8),
});
