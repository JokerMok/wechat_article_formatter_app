import type { UnifiedArticleContent } from "../../content";

export type CardAspectRatio = "3:4" | "9:16";

export type CardCanvasSize = {
  width: number;
  height: number;
};

export type CardInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type TextStyle = {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
};

export type TextMeasurement = {
  width: number;
};

export type TextMeasurer = {
  measureText(text: string, style: TextStyle): TextMeasurement;
};

export type CardTypography = {
  fontFamily: string;
  titleFontSize: number;
  headingFontSize: number;
  bodyFontSize: number;
  focusFontSize: number;
  lineSpacing: number;
  paragraphSpacing: number;
  titleSpacing: number;
};

export type CardImagePlacement = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  opacity?: number;
  mode?: "inline" | "absolute";
};

export type CardManualPageSpec = {
  id: string;
  blockIds?: string[];
  entryIds?: string[];
  locked?: boolean;
  layout?: CardLayoutPage;
};

export type CardLayoutOptions = {
  aspectRatio?: CardAspectRatio;
  safeArea?: Partial<CardInsets>;
  typography?: Partial<CardTypography>;
  imagePlacements?: Record<string, CardImagePlacement>;
  defaultImageBox?: {
    width: number;
    height: number;
  };
  manualPages?: CardManualPageSpec[];
  lockedPages?: CardLayoutPage[];
  maxPages?: number;
};

export type CardLayoutNodeKind = "title" | "heading" | "body" | "focus" | "image";

export type CardLayoutLine = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CardLayoutNode = {
  id: string;
  entryId: string;
  blockId: string;
  kind: CardLayoutNodeKind;
  sourceIndex: number;
  text: string;
  lines: CardLayoutLine[];
  x: number;
  y: number;
  width: number;
  height: number;
  style?: TextStyle;
  continuedFromPreviousPage?: boolean;
  continuesOnNextPage?: boolean;
  image?: CardImagePlacement & { alt: string };
};

export type CardSafeArea = CardInsets & {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CardOverflowIssue = {
  pageId: string;
  nodeId: string;
  type: "vertical" | "horizontal";
  edge?: "top" | "right" | "bottom" | "left";
  amount: number;
};

export type CardLayoutPage = {
  id: string;
  pageNumber: number;
  totalPages: number;
  aspectRatio: CardAspectRatio;
  canvas: CardCanvasSize;
  safeArea: CardSafeArea;
  nodes: CardLayoutNode[];
  manual?: boolean;
  locked?: boolean;
  overflow: CardOverflowIssue[];
};

export type CardLayoutResult = {
  source: UnifiedArticleContent;
  pages: CardLayoutPage[];
  overflow: CardOverflowIssue[];
};

export type FlowEntryKind = CardLayoutNodeKind | "pageBreak";

export type FlowEntry = {
  id: string;
  blockId: string;
  kind: FlowEntryKind;
  text: string;
  sourceIndex: number;
  sourceOffset?: number;
  sourceLength?: number;
  fragmentIndex?: number;
  keepWithNext?: boolean;
};
