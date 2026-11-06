import type { LayoutStep } from "./layout-contract";
import type {
  ComponentStyle,
  StyleProfile,
  StyleTokens,
  ArticleBlock,
} from "./types";

export const fontStacks = {
  sans: '-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif',
  serif: '"Songti SC","Noto Serif CJK SC",SimSun,serif',
};
const base: StyleTokens = {
  accent: "#21634a",
  text: "#263b32",
  muted: "#68766e",
  background: "#ffffff",
  bodySize: 16,
  titleSize: 30,
  headingSize: 22,
  lineHeight: 1.85,
  paragraphGap: 20,
  padding: 24,
  radius: 4,
  fontFamily: "sans",
};
const originalBuiltInStyles: StyleProfile[] = [
  {
    id: "builtin-forest",
    name: "林间来信",
    tokens: { ...base },
    tags: ["清爽", "知识分享"],
    components: {
      heading: { color: "#21634a", marginTop: 34 },
      quote: { backgroundColor: "#eff5f1", padding: 20, color: "#496455" },
    },
  },
  {
    id: "builtin-ink",
    name: "墨色书页",
    tokens: {
      ...base,
      accent: "#333333",
      text: "#333333",
      muted: "#76716a",
      background: "#faf9f6",
      fontFamily: "serif",
      titleSize: 32,
      lineHeight: 2,
      paragraphGap: 24,
      radius: 0,
    },
    tags: ["人文", "长文"],
    components: {
      title: { textAlign: "center", marginBottom: 36 },
      heading: { fontWeight: 600 },
      quote: { backgroundColor: "#f0eeea", padding: 22 },
    },
  },
  {
    id: "builtin-blue",
    name: "蓝调观察",
    tokens: {
      ...base,
      accent: "#2859a3",
      text: "#243149",
      muted: "#65738a",
      headingSize: 23,
      radius: 8,
    },
    tags: ["科技", "行业观察"],
    components: {
      heading: {
        color: "#2859a3",
        backgroundColor: "#eef3fb",
        padding: 14,
        borderRadius: 4,
      },
      quote: { backgroundColor: "#f1f5fb", padding: 20 },
    },
  },
].map((item) => ({
  ...item,
  version: 1,
  source: { type: "builtin", capturedAt: "2026-11-05", rights: "owned" },
  layoutRules: {
    articleWidth: 640,
    sectionRhythm: ["heading", "paragraph", "image"],
    imagePolicy: "full",
  },
  platformOverrides: { wechat: {} },
  assetsPolicy: { reuseThirdPartyAssets: false },
  confidence: { mode: "builtin", uncertainKeys: [], notes: [] },
  favorite: false,
})) as StyleProfile[];
const builtinLayouts: Array<
  Pick<StyleProfile, "layoutRules" | "details" | "components">
> = [
  {
    layoutRules: {
      articleWidth: 660,
      sectionRhythm: ["heading", "paragraph", "image"],
      imagePolicy: "full",
      paddingInline: 26,
      paddingBlock: 34,
    },
    components: {
      heading: {
        marginTop: 38,
        marginBottom: 17,
        padding: 8,
        paddingInline: 14,
        borderLeftWidth: 4,
        borderColor: "#21634a",
        backgroundColor: "#eef5f0",
      },
      quote: {
        backgroundColor: "#eff5f1",
        padding: 20,
        color: "#496455",
        borderLeftWidth: 3,
        borderColor: "#76a58e",
      },
      image: { borderRadius: 9, marginTop: 12, marginBottom: 23 },
    },
    details: {
      emphasis: {
        color: "#21634a",
        backgroundColor: "#eaf3ec",
        fontWeight: 700,
      },
      listIndent: 22,
      listGap: 7,
      listMarker: "disc",
    },
  },
  {
    layoutRules: {
      articleWidth: 540,
      sectionRhythm: ["heading", "paragraph", "quote"],
      imagePolicy: "inset",
      paddingInline: 33,
      paddingBlock: 44,
      borderWidth: 1,
      borderColor: "#ded7cb",
    },
    components: {
      title: {
        textAlign: "center",
        marginBottom: 38,
        letterSpacing: 2,
        fontWeight: 600,
      },
      heading: {
        textAlign: "center",
        fontWeight: 600,
        marginTop: 40,
        marginBottom: 24,
      },
      paragraph: { textIndent: 32, textAlign: "justify" },
      quote: {
        backgroundColor: "#f0eeea",
        padding: 23,
        textAlign: "center",
        borderWidth: 1,
        borderColor: "#d4cbbd",
        widthPercent: 90,
        align: "center",
      },
      image: {
        widthPercent: 86,
        align: "center",
        marginTop: 18,
        marginBottom: 25,
      },
      divider: { widthPercent: 34, align: "center", borderColor: "#a59b8c" },
    },
    details: {
      emphasis: { color: "#333333", fontWeight: 700 },
      listIndent: 26,
      listGap: 10,
      listMarker: "circle",
    },
  },
  {
    layoutRules: {
      articleWidth: 720,
      sectionRhythm: ["heading", "list", "quote"],
      imagePolicy: "full",
      paddingInline: 19,
      paddingBlock: 27,
    },
    components: {
      title: {
        padding: 19,
        backgroundColor: "#edf3ff",
        borderLeftWidth: 5,
        borderColor: "#2859a3",
        marginBottom: 23,
      },
      heading: {
        color: "#ffffff",
        backgroundColor: "#244a82",
        padding: 13,
        paddingInline: 16,
        borderRadius: 4,
        marginTop: 26,
      },
      quote: {
        backgroundColor: "#f1f5fb",
        padding: 17,
        borderWidth: 1,
        borderColor: "#c4d6ef",
      },
      list: { backgroundColor: "#f4f7fc", padding: 14, borderRadius: 5 },
      image: {
        borderWidth: 1,
        borderColor: "#c4d6ef",
        borderRadius: 8,
        marginBottom: 16,
      },
    },
    details: {
      emphasis: {
        color: "#244a82",
        backgroundColor: "#e6efff",
        fontWeight: 800,
      },
      listIndent: 20,
      listGap: 5,
      listMarker: "square",
    },
  },
];
export const builtInStyles = originalBuiltInStyles.map((profile, index) => ({
  ...profile,
  ...builtinLayouts[index],
  tokens: {
    ...profile.tokens,
    padding:
      builtinLayouts[index].layoutRules.paddingInline ?? profile.tokens.padding,
  },
  version: 2,
}));
export const allBuiltInStyles = [...originalBuiltInStyles, ...builtInStyles];
export function effectiveTokens(
  article: { theme?: StyleTokens },
  style: StyleProfile,
) {
  return article.theme ?? style.tokens;
}
export function blockStyle(
  block: ArticleBlock,
  profile: StyleProfile,
  tokens = profile.tokens,
  step?: LayoutStep,
): ComponentStyle {
  const t = tokens;
  const kind =
    step?.component === "title"
      ? "title"
      : step?.component === "chapter"
        ? (step.level ?? 2) > 2
          ? "subheading"
          : "heading"
        : block.kind;
  const defaults: ComponentStyle = {
    fontSize: t.bodySize,
    color: t.text,
    lineHeight: t.lineHeight,
    marginTop: 0,
    marginBottom: t.paragraphGap,
    textAlign: "left",
  };
  const role: Partial<Record<ArticleBlock["kind"], ComponentStyle>> = {
    title: {
      fontSize: t.titleSize,
      fontWeight: 700,
      lineHeight: 1.4,
      marginBottom: 28,
    },
    heading: {
      fontSize: t.headingSize,
      fontWeight: 700,
      color: t.accent,
      marginTop: 32,
      marginBottom: 16,
      lineHeight: 1.5,
    },
    subheading: {
      fontSize: Math.max(t.bodySize + 2, t.headingSize - 3),
      fontWeight: 600,
      marginTop: 24,
      marginBottom: 12,
    },
    quote: {
      padding: 18,
      color: t.muted,
      backgroundColor: "#f4f6f5",
      borderRadius: t.radius,
    },
    callout: {
      padding: 20,
      backgroundColor: "#f3f5f4",
      borderColor: t.accent,
      borderWidth: 1,
      borderRadius: t.radius,
    },
    image: { borderRadius: t.radius },
    caption: {
      fontSize: 12,
      color: t.muted,
      textAlign: "center",
      marginTop: 8,
      marginBottom: 0,
    },
    code: { padding: 16, backgroundColor: "#f3f5f4", fontSize: 13 },
    divider: {
      borderColor: t.muted,
      borderWidth: 1,
      marginTop: 28,
      marginBottom: 28,
    },
  };
  const component = { ...profile.components[kind] };
  if (component.color === profile.tokens.accent) component.color = t.accent;
  if (component.color === profile.tokens.text) component.color = t.text;
  if (kind === "heading" && t.headingSize !== profile.tokens.headingSize)
    component.fontSize = t.headingSize;
  if (kind === "title" && t.titleSize !== profile.tokens.titleSize)
    component.fontSize = t.titleSize;
  if (kind === "paragraph" && t.paragraphGap !== profile.tokens.paragraphGap)
    component.marginBottom = t.paragraphGap;
  if (component.borderRadius === profile.tokens.radius)
    component.borderRadius = t.radius;
  const emphasis = profile.components.callout;
  const quiet = profile.components.quote?.backgroundColor ?? "#f3f5f4";
  const serif = t.fontFamily === "serif";
  const editorial: Partial<Record<LayoutStep["component"], ComponentStyle>> =
    step
      ? {
          subtitle: {
            color: t.muted,
            fontSize: Math.min(24, t.bodySize + 2),
            marginBottom: t.paragraphGap + 6,
          },
          intro: {
            color: t.text,
            fontSize: t.bodySize + 1,
            lineHeight: t.lineHeight,
            marginBottom: t.paragraphGap + 8,
            padding: serif ? 14 : 11,
            paddingInline: serif ? 16 : 14,
            borderLeftWidth: serif ? 0 : 3,
            borderColor: t.accent,
          },
          point: {
            backgroundColor: quiet,
            padding: 14,
            paddingInline: 18,
            borderLeftWidth: serif ? 0 : 3,
            borderWidth: serif ? 1 : 0,
            borderColor: t.accent,
            borderRadius: t.radius,
            marginTop: 8,
            marginBottom: t.paragraphGap + 7,
            ...emphasis,
          },
          case: {
            backgroundColor: quiet,
            padding: 12,
            paddingInline: 16,
            borderLeftWidth: serif ? 0 : 2,
            borderColor: t.muted,
            borderRadius: t.radius,
            marginTop: 7,
            marginBottom: t.paragraphGap + 4,
          },
          data: {
            backgroundColor: quiet,
            padding: 12,
            paddingInline: 16,
            borderColor: t.accent,
            borderLeftWidth: serif ? 0 : 3,
            borderRadius: t.radius,
            marginTop: 6,
            marginBottom: t.paragraphGap + 3,
          },
          conclusion: {
            backgroundColor: quiet,
            padding: serif ? 21 : 16,
            borderRadius: t.radius,
            borderLeftWidth: serif ? 0 : 3,
            borderColor: t.accent,
            marginTop: t.paragraphGap + 8,
            marginBottom: t.paragraphGap + 5,
          },
          steps: { marginTop: 6, marginBottom: t.paragraphGap + 4 },
        }
      : {};
  const observed =
    step &&
    step.component !== "original" &&
    step.component !== "title" &&
    (step.component !== "chapter" || kind === "heading")
      ? profile.editorial?.components[step.component]
      : undefined;
  return {
    ...defaults,
    ...role[kind],
    ...component,
    ...(step ? editorial[step.component] : {}),
    ...observed,
    ...block.overrides,
  };
}
