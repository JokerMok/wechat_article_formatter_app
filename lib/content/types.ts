import type { ArticleBlock, ArticleParseMode, BlockType } from "../article-types";

export type ArticleSourceFormat = "markdown" | "plainText";

export type StructuralContentBlockType = "divider" | "pageBreak" | "code";

export type UnifiedContentBlockType = BlockType | StructuralContentBlockType;

export type SourcePosition = {
  startLine: number;
  endLine: number;
  startOffset: number;
  endOffset: number;
  sourceText: string;
};

type UnifiedBlockBase<TType extends UnifiedContentBlockType> = {
  id: string;
  type: TType;
  source: SourcePosition;
};

type UnifiedTextBlockBase<TType extends Exclude<BlockType, "list" | "card">> = UnifiedBlockBase<TType> & {
  text: string;
  plainText: string;
  markdown: string;
};

export type UnifiedListBlock = UnifiedBlockBase<"list"> & {
  items: string[];
  text: string;
  plainText: string;
  markdown: string;
};

export type UnifiedCardBlock = UnifiedBlockBase<"card"> & {
  title?: string;
  body: string;
  text: string;
  plainText: string;
  markdown: string;
};

export type UnifiedStructuralBlock = UnifiedBlockBase<StructuralContentBlockType> & {
  text: string;
  plainText: string;
  markdown: string;
  language?: string;
};

export type UnifiedTextBlock =
  | UnifiedTextBlockBase<"title">
  | UnifiedTextBlockBase<"lead">
  | UnifiedTextBlockBase<"section">
  | UnifiedTextBlockBase<"subsection">
  | UnifiedTextBlockBase<"paragraph">
  | UnifiedTextBlockBase<"quote">
  | UnifiedTextBlockBase<"golden">
  | UnifiedTextBlockBase<"summary">
  | UnifiedTextBlockBase<"cta">
  | UnifiedTextBlockBase<"image">;

export type UnifiedArticleBlock = UnifiedTextBlock | UnifiedListBlock | UnifiedCardBlock | UnifiedStructuralBlock;

export type ContentWarningCode = "empty_input" | "sanitized_rich_text" | "unsupported_block";

export type ContentWarning = {
  code: ContentWarningCode;
  message: string;
  source?: SourcePosition;
};

export type UnifiedArticleContent = {
  schemaVersion: 1;
  sourceText: string;
  sourceFormat: ArticleSourceFormat;
  parseMode: ArticleParseMode;
  title?: string;
  blocks: UnifiedArticleBlock[];
  warnings: ContentWarning[];
};

export type ArticleContentParseOptions = {
  mode?: ArticleParseMode;
};

export type ArticleBlockCompatible = ArticleBlock;
