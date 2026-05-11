export type BlockType =
  | "title"
  | "lead"
  | "section"
  | "subsection"
  | "paragraph"
  | "quote"
  | "golden"
  | "summary"
  | "cta"
  | "image"
  | "list"
  | "card";

export type ArticleBlock =
  | { type: "title"; text: string }
  | { type: "lead"; text: string }
  | { type: "section"; text: string }
  | { type: "subsection"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "quote"; text: string }
  | { type: "golden"; text: string }
  | { type: "summary"; text: string }
  | { type: "cta"; text: string }
  | { type: "image"; text: string }
  | { type: "list"; items: string[] }
  | { type: "card"; title?: string; body: string };

export type TemplateKey =
  | "baoyuDefaultBlue"
  | "baoyuDefaultGreen"
  | "baoyuGracePurple"
  | "baoyuGraceRose"
  | "baoyuSimpleGreen"
  | "baoyuSimpleSky"
  | "baoyuModernOrange"
  | "baoyuModernRed"
  | "baoyuDefaultBlack"
  | "baoyuModernBlack";

export type InlineStyle = Record<string, string | number>;

export type StyleTemplate = {
  key: TemplateKey;
  name: string;
  description: string;
  audience: string;
  palette: string[];
  fontFamily: string;
  visual: {
    theme: "default" | "grace" | "simple" | "modern";
    primary: string;
    accent: string;
    softBg: string;
    border: string;
    muted: string;
    listSymbol: string;
    quoteSymbol: string;
    ctaPrefix: string;
  };
  container: InlineStyle;
  body: {
    fontSize: number;
    lineHeight: number;
    color: string;
  };
  blocks: Record<BlockType, InlineStyle>;
  marker: {
    section: InlineStyle;
    listBullet: InlineStyle;
    imageLabel: InlineStyle;
  };
};
