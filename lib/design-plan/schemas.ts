import { z } from "zod";
import { DESIGN_SCHEME_IDS } from "../design-schemes";

const platformIdSchema = z.enum(["wechat", "xiaohongshu", "douyinImage", "douyinLongform"]);
const schemeIdSchema = z.enum(DESIGN_SCHEME_IDS);

export const designPlanSchema = z.strictObject({
  schemaVersion: z.literal(1),
  sourceRevision: z.string().min(1),
  contentType: schemeIdSchema,
  audience: z.string().min(1).max(120),
  coreThesis: z.string().min(1).max(500),
  tone: z.enum(["理性", "叙事", "实用", "轻松"]),
  recommendedPlatforms: z.array(platformIdSchema).min(1).max(4),
  recommendedScheme: schemeIdSchema,
  palette: z.strictObject({
    primary: z.string().min(4).max(32),
    secondary: z.string().min(4).max(32),
    background: z.string().min(4).max(32),
    text: z.string().min(4).max(32),
  }),
  typography: z.strictObject({
    titleScale: z.number().min(0.7).max(1.4),
    headingScale: z.number().min(0.7).max(1.4),
    bodyScale: z.number().min(0.7).max(1.4),
    lineHeight: z.number().min(1.2).max(2.2),
  }),
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
  callToAction: z.string().min(1).max(240),
  recommendationReason: z.string().min(1).max(300),
  titleCandidates: z.array(z.string().min(1).max(80)).min(1).max(3),
  recommendedTitle: z.string().min(1).max(80),
  hook: z.string().min(1).max(300),
  keyPoints: z.array(z.string().min(1).max(300)).min(1).max(5),
  summary: z.string().min(1).max(500),
  tags: z.array(z.string().min(1).max(20)).max(8),
});
