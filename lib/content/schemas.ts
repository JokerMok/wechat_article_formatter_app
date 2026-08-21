import { z } from "zod";

export const sourcePositionSchema = z.object({
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative(),
  sourceText: z.string(),
});

const baseBlockSchema = z.object({
  id: z.string().min(1),
  source: sourcePositionSchema,
  text: z.string(),
  plainText: z.string(),
  markdown: z.string(),
});

export const unifiedArticleBlockSchema = z.discriminatedUnion("type", [
  baseBlockSchema.extend({ type: z.literal("title") }),
  baseBlockSchema.extend({ type: z.literal("lead") }),
  baseBlockSchema.extend({ type: z.literal("section") }),
  baseBlockSchema.extend({ type: z.literal("subsection") }),
  baseBlockSchema.extend({ type: z.literal("paragraph") }),
  baseBlockSchema.extend({ type: z.literal("quote") }),
  baseBlockSchema.extend({ type: z.literal("golden") }),
  baseBlockSchema.extend({ type: z.literal("summary") }),
  baseBlockSchema.extend({ type: z.literal("cta") }),
  baseBlockSchema.extend({ type: z.literal("image") }),
  baseBlockSchema.extend({ type: z.literal("divider") }),
  baseBlockSchema.extend({ type: z.literal("pageBreak") }),
  baseBlockSchema.extend({
    type: z.literal("code"),
    language: z.string().optional(),
  }),
  baseBlockSchema.extend({
    type: z.literal("list"),
    items: z.array(z.string().min(1)),
  }),
  baseBlockSchema.extend({
    type: z.literal("card"),
    title: z.string().optional(),
    body: z.string().min(1),
  }),
]);

export const unifiedArticleContentSchema = z.object({
  schemaVersion: z.literal(1),
  sourceText: z.string(),
  sourceFormat: z.union([z.literal("markdown"), z.literal("plainText")]),
  parseMode: z.union([z.literal("narrative"), z.literal("knowledge"), z.literal("business")]),
  title: z.string().optional(),
  blocks: z.array(unifiedArticleBlockSchema),
  warnings: z.array(
    z.object({
      code: z.union([z.literal("empty_input"), z.literal("sanitized_rich_text"), z.literal("unsupported_block")]),
      message: z.string(),
      source: sourcePositionSchema.optional(),
    })
  ),
});
