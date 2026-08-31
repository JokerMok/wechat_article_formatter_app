import { z } from "zod";
import { CONTENT_LAYOUT_IDS, DESIGN_SCHEME_IDS, VISUAL_THEME_IDS } from "../design-schemes";
import { CONTENT_TYPE_IDS, GENERATION_MODE_IDS, PAGE_PLAN_KINDS } from "./types";

const platformIdSchema = z.enum(["wechat", "xiaohongshu", "douyinImage", "douyinLongform"]);
const schemeIdSchema = z.enum(DESIGN_SCHEME_IDS);
const visualThemeIdSchema = z.enum(VISUAL_THEME_IDS);
const contentLayoutIdSchema = z.enum(CONTENT_LAYOUT_IDS);
const contentTypeSchema = z.enum(CONTENT_TYPE_IDS);
const generationModeSchema = z.enum(GENERATION_MODE_IDS);

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
  role: z.enum(["title", "subtitle", "heading", "body", "focus", "list", "media"]),
  text: z.string(),
  sourceBlockIds: z.array(z.string().min(1)),
  provenance: z.enum(["source", "expressionOptimization"]),
});

const pagePlanSchema = z.strictObject({
  id: z.string().min(1),
  kind: z.enum(PAGE_PLAN_KINDS),
  title: z.string().optional(),
  sourceBlockIds: z.array(z.string().min(1)),
  blocks: z.array(plannedContentBlockSchema),
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
  pages: z.array(pagePlanSchema).min(1),
  exportSpec: z.strictObject({
    format: z.enum(["html", "png", "text"]),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    aspectRatio: z.enum(["3:4", "9:16"]).optional(),
  }),
});

const contentBlueprintSchema = z.strictObject({
  schemaVersion: z.literal(1),
  generationMode: generationModeSchema,
  contentType: contentTypeSchema,
  targetAudience: z.string().min(1).max(120).optional(),
  sourceFacts: z.array(z.strictObject({
    id: z.string().min(1),
    text: z.string().min(1),
    sourceBlockIds: z.array(z.string().min(1)).min(1),
  })),
  coreMessage: z.string().min(1).max(500),
  titleCandidates: z.array(z.string().min(1).max(80)).min(1).max(3),
  openingHook: z.string().min(1).max(300).optional(),
  sections: z.array(z.strictObject({
    id: z.string().min(1),
    title: z.string().optional(),
    purpose: z.enum(["opening", "context", "argument", "step", "evidence", "conflict", "turning", "conclusion"]),
    sourceBlockIds: z.array(z.string().min(1)),
  })),
  conclusion: z.string().min(1).max(500).optional(),
  callToAction: z.string().min(1).max(240).optional(),
  modificationSummary: z.array(z.string().min(1).max(180)).max(8),
});

export const designPlanSchema = z.strictObject({
  schemaVersion: z.literal(1),
  sourceRevision: z.string().min(1),
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
