import { z } from "zod";
import {
  editorialComponents,
  sourceKinds,
  type ArticleLayout,
} from "./layout-contract";

export const blockKinds = sourceKinds;
export type BlockKind = (typeof blockKinds)[number];
export const rightsSchema = z.enum([
  "unknown",
  "owned",
  "licensed",
  "reference-only",
]);
export type Rights = z.infer<typeof rightsSchema>;
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
export const componentSchema = z.object({
  color: color.optional(),
  backgroundColor: color.optional(),
  fontSize: z.number().min(10).max(64).optional(),
  lineHeight: z.number().min(1).max(3).optional(),
  marginTop: z.number().min(0).max(100).optional(),
  marginBottom: z.number().min(0).max(100).optional(),
  padding: z.number().min(0).max(64).optional(),
  borderColor: color.optional(),
  borderWidth: z.number().min(0).max(8).optional(),
  borderRadius: z.number().min(0).max(48).optional(),
  fontWeight: z.number().min(300).max(900).optional(),
  textAlign: z.enum(["left", "center", "right", "justify"]).optional(),
  letterSpacing: z.number().min(0).max(8).optional(),
  paddingInline: z.number().min(0).max(80).optional(),
  textIndent: z.number().min(0).max(64).optional(),
  borderLeftWidth: z.number().min(0).max(12).optional(),
  widthPercent: z.number().min(10).max(100).optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  fontFamily: z.enum(["sans", "serif"]).optional(),
});
export type ComponentStyle = z.infer<typeof componentSchema>;
export const tokensSchema = z.object({
  accent: color,
  text: color,
  muted: color,
  background: color,
  bodySize: z.number().min(12).max(24),
  titleSize: z.number().min(20).max(48),
  headingSize: z.number().min(16).max(36),
  lineHeight: z.number().min(1.2).max(2.8),
  paragraphGap: z.number().min(4).max(48),
  padding: z.number().min(0).max(80),
  radius: z.number().min(0).max(32),
  fontFamily: z.enum(["sans", "serif"]),
});
export type StyleTokens = z.infer<typeof tokensSchema>;
export const styleProfileSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(80),
  version: z.number().int().positive(),
  source: z.object({
    type: z.enum(["builtin", "url", "html", "text", "screenshot"]),
    url: z.string().max(2000).optional(),
    capturedAt: z.string(),
    title: z.string().max(300).optional(),
    imageId: z.string().optional(),
    rights: rightsSchema,
  }),
  tokens: tokensSchema,
  components: z
    .partialRecord(z.enum(blockKinds), componentSchema.partial())
    .default({}),
  layoutRules: z.object({
    articleWidth: z.number().min(280).max(900),
    sectionRhythm: z.array(z.string().max(100)).max(30),
    imagePolicy: z.enum(["full", "inset"]),
    paddingInline: z.number().min(0).max(80).optional(),
    paddingBlock: z.number().min(0).max(80).optional(),
    borderColor: color.optional(),
    borderWidth: z.number().min(0).max(8).optional(),
  }),
  details: z
    .object({
      measured: z.array(z.string().max(50)).max(30).optional(),
      emphasis: componentSchema.optional(),
      listIndent: z.number().min(0).max(64).optional(),
      listGap: z.number().min(0).max(48).optional(),
      listMarker: z
        .enum([
          "disc",
          "circle",
          "square",
          "decimal",
          "lower-alpha",
          "upper-alpha",
          "lower-roman",
          "upper-roman",
          "none",
        ])
        .optional(),
    })
    .optional(),
  editorial: z
    .object({
      components: z.partialRecord(z.enum(editorialComponents), componentSchema),
      measured: z.array(z.enum(editorialComponents)).max(8).optional(),
    })
    .optional(),
  platformOverrides: z.object({ wechat: z.object({}).default({}) }),
  assetsPolicy: z.object({ reuseThirdPartyAssets: z.literal(false) }),
  confidence: z.object({
    mode: z.enum(["builtin", "dom", "vision", "manual"]),
    uncertainKeys: z.array(z.string().max(200)).max(40),
    notes: z.array(z.string().max(500)).max(30),
  }),
  tags: z.array(z.string().max(30)).max(20),
  favorite: z.boolean(),
  lastUsedAt: z.string().optional(),
});
export type StyleProfile = z.infer<typeof styleProfileSchema>;
export type ArticleBlock = {
  id: string;
  kind: BlockKind;
  html: string;
  headingLevel?: 4 | 5 | 6;
  src?: string;
  alt?: string;
  caption?: string;
  captionStyle?: ComponentStyle;
  overrides?: ComponentStyle;
};
export type ArticleDocument = {
  id: string;
  name: string;
  blocks: ArticleBlock[];
  styleId: string;
  styleVersion: number;
  styleSnapshot?: StyleProfile;
  layout?: ArticleLayout;
  deletedAt?: string;
  theme?: StyleTokens;
  updatedAt: string;
  coverId?: string;
};
export type ArticleRevision = {
  id: string;
  articleId: string;
  savedAt: string;
  document: ArticleDocument;
};
export type StudioAsset = {
  id: string;
  name: string;
  dataUrl: string;
  rights: Rights;
  createdAt: string;
  source?: string;
  referenceHTML?: string;
};
export const coverStyleSchema = z.object({
  id: z.string(),
  name: z.string().max(80),
  background: color,
  foreground: color,
  accent: color,
  composition: z.enum(["left", "center", "bottom"]),
  fontFamily: z.enum(["sans", "serif"]),
  sourceImageId: z.string().optional(),
  rights: rightsSchema,
  confidence: z.enum(["vision", "manual", "theme"]),
  notes: z.array(z.string().max(300)).max(20),
});
export type CoverStyle = z.infer<typeof coverStyleSchema>;
export type CoverDocument = {
  id: string;
  articleId: string;
  title: string;
  subtitle: string;
  style: CoverStyle;
  candidate: number;
  width: number;
  height: number;
  fontSize: number;
  x: number;
  y: number;
  textWidth: number;
  imageId?: string;
  textColor?: string;
  textColors?: Record<number, string>;
  imageScale: number;
  imageX: number;
  imageY: number;
  updatedAt: string;
};
export type CaptureResult = {
  profile: StyleProfile;
  screenshot?: string;
  referenceHTML?: string;
  referenceDocument?: string;
  title: string;
  warnings: string[];
  wechat?: {
    account: string;
    format: "dom" | "embedded";
    requestProfile: "desktop" | "mobile";
    textLength: number;
    inlineStyleCount: number;
    images: Array<{ url: string; loaded: boolean }>;
  };
};
export const kindLabels: Record<BlockKind, string> = {
  title: "文章标题",
  heading: "一级标题",
  subheading: "二级标题",
  paragraph: "正文",
  quote: "引用",
  list: "列表",
  image: "图片",
  divider: "分隔线",
  code: "代码",
  table: "表格",
  callout: "重点卡片",
  caption: "图注",
};
export function uid(prefix = "id") {
  return `${prefix}_${crypto.randomUUID()}`;
}
