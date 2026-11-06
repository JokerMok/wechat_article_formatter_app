import { z } from "zod";

export const editorialComponents = [
  "subtitle",
  "intro",
  "chapter",
  "point",
  "case",
  "data",
  "conclusion",
  "steps",
] as const;
export const plannedComponents = [
  "original",
  "title",
  ...editorialComponents,
] as const;
export const semanticRoles = [
  "title",
  "subtitle",
  "lead",
  "chapter",
  "body",
  "claim",
  "case",
  "evidence",
  "data",
  "quote",
  "list",
  "steps",
  "image",
  "table",
  "caption",
  "summary",
  "divider",
  "code",
] as const;
export const articleTypes = [
  "case-study",
  "tutorial",
  "analysis",
  "opinion",
  "report",
  "narrative",
  "other",
] as const;
export const layoutDensity = ["restrained", "standard", "rich"] as const;
export const sourceKinds = [
  "title",
  "heading",
  "subheading",
  "paragraph",
  "quote",
  "list",
  "image",
  "divider",
  "code",
  "table",
  "callout",
  "caption",
] as const;
export const layoutSettingsSchema = z.strictObject({
  density: z.enum(layoutDensity),
  preserveSource: z.boolean(),
});
const reasonSchema = z
  .string()
  .trim()
  .min(2)
  .max(140)
  .regex(/^[^<>\u0000-\u001f]+$/u);
export const layoutSourceSchema = z.strictObject({
  id: z.string().min(1).max(100),
  kind: z.enum(sourceKinds),
  level: z.number().int().min(1).max(6).optional(),
  text: z.string().max(120000),
  fingerprint: z.string().regex(/^[0-9a-f]{8}$/),
  ordered: z.boolean().optional(),
});
export const layoutRequestSchema = z
  .strictObject({
    nodes: z.array(layoutSourceSchema).min(1).max(1800),
    settings: layoutSettingsSchema,
    theme: z.strictObject({
      id: z.string().max(100),
      measured: z.array(z.string().max(50)).max(30),
      components: z.array(z.string().max(40)).max(35),
      width: z.number().min(280).max(900),
      rhythm: z.array(z.string().max(100)).max(30),
    }),
  })
  .refine(
    ({ nodes }) =>
      new Set(nodes.map((n) => n.id)).size === nodes.length &&
      nodes.reduce((total, n) => total + n.text.length, 0) <= 120000,
  );
export const modelDecisionSchema = z.strictObject({
  at: z.number().int().min(1).max(1800),
  role: z.enum([
    "title",
    "subtitle",
    "lead",
    "chapter",
    "claim",
    "case",
    "evidence",
    "data",
    "summary",
  ]),
  priority: z.number().int().min(1).max(3),
  reason: reasonSchema,
  level: z.number().int().min(2).max(6).optional(),
});
export const modelLayoutSchema = z.strictObject({
  articleType: z.enum(articleTypes),
  decisions: z.array(modelDecisionSchema).max(12),
});
export type LayoutSettings = z.infer<typeof layoutSettingsSchema>;
export type LayoutSource = z.infer<typeof layoutSourceSchema>;
export type LayoutRequest = z.infer<typeof layoutRequestSchema>;
export type ModelLayout = z.infer<typeof modelLayoutSchema>;
export type ModelDecision = ModelLayout["decisions"][number];
export type SemanticRole = (typeof semanticRoles)[number];
export type PlannedComponent = (typeof plannedComponents)[number];
export type EditorialComponent = (typeof editorialComponents)[number];
export type ArticleType = (typeof articleTypes)[number];
export type SourceLocation = {
  blockId: string;
  ordinal: number;
  start: number;
  end: number;
  fingerprint: string;
};
export type StructureNode = {
  source: SourceLocation;
  sourceKind: LayoutSource["kind"];
  role: SemanticRole;
  sectionId?: string;
  relatedBlockId?: string;
  level?: number;
  recognizedBy: "source" | "rules" | "ai";
};
export type ArticleStructure = {
  version: 1;
  fingerprint: string;
  articleType: ArticleType;
  nodes: StructureNode[];
  sections: {
    blockId: string;
    level: number;
    parentId?: string;
    endOrdinal: number;
  }[];
  thesisIds: string[];
};
export type LayoutStep = {
  blockId: string;
  component: PlannedComponent;
  reason: string;
  level?: number;
  sourceFingerprint: string;
};
export type LayoutPlan = {
  version: 1;
  structureFingerprint: string;
  analyzedWith: LayoutRequest["theme"];
  origin: "rules" | "ai";
  engine?: string;
  windows?: number;
  failedWindows?: number;
  fallbackReason?: string;
  steps: LayoutStep[];
  imageSuggestion?: { afterBlockId: string; reason: string };
};
export type LayoutAnalysis = {
  engine: string;
  articleType: ArticleType;
  theme?: LayoutRequest["theme"];
  windows?: number;
  failedWindows?: number;
  fallbackReason?: string;
  decisions: (Omit<ModelDecision, "at"> & {
    blockId: string;
    sourceFingerprint: string;
  })[];
};
export type ArticleLayout = {
  enabled: boolean;
  automatic: boolean;
  settings: LayoutSettings;
  structure: ArticleStructure;
  plan: LayoutPlan;
  analysis?: LayoutAnalysis;
  requestId?: string;
  manual?: Record<string, { component: PlannedComponent; level?: number }>;
};
export const defaultLayoutSettings: LayoutSettings = {
  density: "standard",
  preserveSource: false,
};

export const roleLabels: Record<SemanticRole, string> = {
  title: "主标题",
  subtitle: "副标题",
  lead: "导语",
  chapter: "章节",
  body: "正文",
  claim: "核心观点",
  case: "案例",
  evidence: "论据",
  data: "重要数据",
  quote: "引用",
  list: "列表",
  steps: "步骤",
  image: "图片",
  table: "表格",
  caption: "图注",
  summary: "总结",
  divider: "分隔线",
  code: "代码",
};
export const layoutLabels: Record<PlannedComponent, string> = {
  original: "原组件",
  title: "主标题",
  subtitle: "副标题",
  intro: "导语",
  chapter: "章节标题",
  point: "观点强调",
  case: "案例提示",
  data: "数据强调",
  conclusion: "总结",
  steps: "步骤",
};
export const articleTypeLabels: Record<ArticleType, string> = {
  "case-study": "案例复盘",
  tutorial: "教程",
  analysis: "分析",
  opinion: "观点",
  report: "报告",
  narrative: "叙事",
  other: "综合文章",
};
