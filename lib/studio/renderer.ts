import type {
  ArticleDocument,
  ArticleBlock,
  StyleProfile,
  StudioAsset,
  ComponentStyle,
  StyleTokens,
} from "./types";
import { layoutIndex, layoutStepFor } from "./article-layout";
import type { LayoutStep } from "./layout-contract";
import { blockStyle, effectiveTokens, fontStacks } from "./styles";
import { sanitizeHTML, safeImage } from "./import";

export type AssetMap = Record<string, StudioAsset>;
export function imageSource(src: string | undefined, assets: AssetMap) {
  return src?.startsWith("asset:") ? assets[src.slice(6)]?.dataUrl : src;
}
type CSSValues = Record<string, string | number>;
function setCSS(element: HTMLElement, styles: CSSValues) {
  for (const [key, value] of Object.entries(styles))
    element.style.setProperty(
      key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`),
      typeof value === "number" && !["fontWeight", "lineHeight"].includes(key)
        ? `${value}px`
        : String(value),
    );
}
export function cssStyle(style: ComponentStyle): CSSValues {
  const {
    padding,
    paddingInline,
    borderWidth,
    borderLeftWidth,
    widthPercent,
    align,
    fontFamily,
    ...css
  } = style;
  return {
    ...css,
    ...(fontFamily ? { fontFamily: fontStacks[fontFamily] } : {}),
    ...(padding !== undefined
      ? { paddingTop: padding, paddingBottom: padding }
      : {}),
    ...(paddingInline !== undefined || padding !== undefined
      ? {
          paddingLeft: paddingInline ?? padding!,
          paddingRight: paddingInline ?? padding!,
        }
      : {}),
    ...(borderWidth !== undefined
      ? {
          borderTopWidth: borderWidth,
          borderRightWidth: borderWidth,
          borderBottomWidth: borderWidth,
          borderLeftWidth: borderWidth,
          borderStyle: "solid",
        }
      : {}),
    ...(borderLeftWidth !== undefined
      ? { borderLeftWidth, borderLeftStyle: "solid" }
      : {}),
    ...(widthPercent ? { width: `${widthPercent}%` } : {}),
    ...(align
      ? {
          marginLeft: align === "left" ? 0 : "auto",
          marginRight: align === "right" ? 0 : "auto",
        }
      : {}),
  };
}
export function articleCSS(
  article: Pick<ArticleDocument, "theme">,
  profile: StyleProfile,
): CSSValues {
  const t = effectiveTokens(article, profile);
  const rules = profile.layoutRules;
  const inline =
    article.theme && article.theme.padding !== profile.tokens.padding
      ? t.padding
      : (rules.paddingInline ?? t.padding);
  const block =
    article.theme && article.theme.padding !== profile.tokens.padding
      ? t.padding
      : (rules.paddingBlock ?? t.padding);
  return {
    boxSizing: "border-box",
    width: "100%",
    maxWidth: rules.articleWidth,
    margin: "0 auto",
    padding: `${block}px ${inline}px`,
    color: t.text,
    backgroundColor: t.background,
    fontFamily: fontStacks[t.fontFamily],
    fontSize: t.bodySize,
    lineHeight: t.lineHeight,
    overflowWrap: "break-word",
    ...(rules.borderWidth
      ? {
          borderWidth: rules.borderWidth,
          borderStyle: "solid",
          borderColor: rules.borderColor ?? t.muted,
        }
      : {}),
  };
}
export function blockCSS(
  block: ArticleBlock,
  profile: StyleProfile,
  tokens: StyleTokens,
  step?: LayoutStep,
): CSSValues {
  const style = blockStyle(block, profile, tokens, step);
  const separator =
    step?.component === "chapter" &&
    step.level === 2 &&
    (tokens.fontFamily === "serif" ||
      profile.layoutRules.sectionRhythm.some(
        (role) => role === "hr" || role === "divider",
      ));
  return {
    marginLeft: 0,
    marginRight: 0,
    boxSizing: "border-box",
    maxWidth: "100%",
    ...cssStyle(style),
    ...(separator
      ? {
          borderTopWidth: Math.max(
            1,
            profile.components.divider?.borderWidth ?? 1,
          ),
          borderTopStyle: "solid",
          borderTopColor:
            profile.components.divider?.borderColor ?? tokens.muted,
          paddingTop: Math.max(9, style.padding ?? 0),
        }
      : {}),
    ...(block.kind === "image" &&
    profile.layoutRules.imagePolicy === "inset" &&
    style.paddingInline === undefined
      ? { paddingLeft: 12, paddingRight: 12 }
      : {}),
    ...(block.kind === "code"
      ? { whiteSpace: "pre-wrap", fontFamily: "monospace" }
      : {}),
    ...(block.kind === "divider"
      ? {
          borderStyle: "solid",
          borderTopWidth: style.borderWidth ?? 1,
          borderRightWidth: 0,
          borderBottomWidth: 0,
          borderLeftWidth: 0,
          borderColor: style.borderColor ?? tokens.muted,
        }
      : {}),
  };
}
export function imageCSS(borderRadius?: string | number): CSSValues {
  return {
    display: "block",
    width: "100%",
    maxWidth: "100%",
    height: "auto",
    borderRadius: borderRadius ?? 0,
  };
}
export function styleInlineContent(
  element: HTMLElement,
  profile: StyleProfile,
  tokens: StyleTokens,
) {
  const detail = profile.details;
  const emphasis = { ...detail?.emphasis };
  if (emphasis.color === profile.tokens.accent) emphasis.color = tokens.accent;
  for (const child of element.querySelectorAll<HTMLElement>(
    "p,ul,ol,li,strong,b,a,td,th,table,img",
  )) {
    child.removeAttribute("style");
    const marker = detail?.listMarker;
    const ordered = child.tagName === "OL";
    const styles: Record<string, CSSValues> = {
      P: { margin: 0 },
      UL: {
        margin: 0,
        paddingLeft: detail?.listIndent ?? "1.6em",
        listStyleType:
          marker && /^(disc|circle|square|none)$/.test(marker)
            ? marker
            : "disc",
      },
      OL: {
        margin: 0,
        paddingLeft: detail?.listIndent ?? "1.6em",
        listStyleType:
          marker && /^(decimal|lower-|upper-|none)/.test(marker)
            ? marker
            : "decimal",
      },
      LI: { marginBottom: detail?.listGap ?? 6 },
      STRONG: { fontWeight: 700, color: tokens.accent, ...cssStyle(emphasis) },
      A: { color: tokens.accent, textDecoration: "underline" },
      TD: { border: "1px solid #d9dfdb", padding: 8 },
      TABLE: {
        borderCollapse: "collapse",
        width: "100%",
        tableLayout: "fixed",
      },
      IMG: { maxWidth: "100%", height: "auto" },
    };
    styles.B = styles.STRONG;
    styles.TH = styles.TD;
    setCSS(child, styles[ordered ? "OL" : child.tagName]);
  }
}
export function wechatHTML(
  article: ArticleDocument,
  profile: StyleProfile,
  assets: AssetMap,
  doc: Document = document,
) {
  const t = effectiveTokens(article, profile);
  const root = doc.createElement("section");
  setCSS(root, articleCSS(article, profile));
  const warnings = new Set<string>();
  const noteImage = (src: string) => {
    warnings.add(
      src.startsWith("data:")
        ? "本地图片已保留；微信可能过滤 Data URL，请在公众号后台上传原图并核对。"
        : "外链图片可能被微信转存或拦截，请在公众号后台核对图片。",
    );
    if (/image\/gif|\.gif(?:\?|$)/i.test(src))
      warnings.add("包含动图，请在微信后台确认动画与首帧显示。");
  };
  const tags: Record<ArticleBlock["kind"], string> = {
    title: "h1",
    heading: "h2",
    subheading: "h3",
    paragraph: "p",
    quote: "blockquote",
    callout: "section",
    list: "section",
    image: "figure",
    divider: "hr",
    code: "pre",
    table: "section",
    caption: "p",
  };
  const editorial = layoutIndex(article.layout);
  for (const block of article.blocks) {
    const step = layoutStepFor(block, article.layout, editorial);
    const flowParagraph =
      block.kind === "paragraph" &&
      /<(?:p|div|section|article|h[1-6]|blockquote|ul|ol|table|pre|figure|hr)\b/i.test(
        block.html,
      );
    const tag = flowParagraph
      ? "section"
      : step?.component === "title"
        ? "h1"
        : step?.component === "chapter"
          ? `h${step.level ?? 2}`
          : block.kind === "subheading" && block.headingLevel
            ? `h${block.headingLevel}`
            : tags[block.kind];
    const el = doc.createElement(tag);
    const visual = blockCSS(block, profile, t, step);
    setCSS(el, visual);
    if (block.kind === "image") {
      const src = imageSource(block.src, assets);
      if (!src || !safeImage(src))
        throw new Error(`图片“${block.alt || "未命名"}”缺失，请补充后再导出。`);
      const image = doc.createElement("img");
      image.src = src;
      image.alt = block.alt ?? "";
      setCSS(image, imageCSS(visual.borderRadius));
      el.appendChild(image);
      if (block.caption) {
        const caption = doc.createElement("figcaption");
        caption.textContent = block.caption;
        const captionStyle = blockStyle(
          {
            id: block.id,
            kind: "caption",
            html: "",
            overrides: block.captionStyle,
          },
          profile,
          t,
        );
        setCSS(caption, { margin: 0, ...cssStyle(captionStyle) });
        el.appendChild(caption);
      }
      noteImage(src);
    } else if (block.kind !== "divider") {
      el.innerHTML = sanitizeHTML(block.html, doc.defaultView as Window);
      styleInlineContent(el, profile, t);
      for (const nested of el.querySelectorAll("img")) {
        const src = nested.getAttribute("src") ?? "";
        if (!safeImage(src))
          throw new Error(
            `图片“${nested.alt || "未命名"}”缺失，请补充后再导出。`,
          );
        noteImage(src);
      }
      if (el.querySelector("a"))
        warnings.add("正文含链接，微信可能限制外链跳转。");
      if (el.querySelector("table"))
        warnings.add("表格在窄屏中可能换行，请核对微信手机预览。");
    }
    root.appendChild(el);
  }
  if (!article.blocks.length) throw new Error("请先导入或编辑文章。");
  return {
    html: root.outerHTML,
    warnings: [
      ...warnings,
      "尚未在真实公众号后台验收，请粘贴、保存草稿并查看手机预览。",
    ],
  };
}
export function articleImages(article: ArticleDocument, assets: AssetMap) {
  return article.blocks.flatMap((block) => {
    if (block.kind === "image")
      return [{ src: imageSource(block.src, assets), alt: block.alt }];
    if (!block.html.includes("<img")) return [];
    const template = document.createElement("template");
    template.innerHTML = sanitizeHTML(block.html);
    return Array.from(template.content.querySelectorAll("img"), (image) => ({
      src: image.getAttribute("src") ?? undefined,
      alt: image.alt,
    }));
  });
}
export async function checkImages(article: ArticleDocument, assets: AssetMap) {
  for (const { src, alt } of articleImages(article, assets)) {
    if (!src || !safeImage(src))
      throw new Error(`图片“${alt || "未命名"}”缺失，请重新上传。`);
    await new Promise<void>((resolve, reject) => {
      const image = new Image();
      const timer = setTimeout(
        () =>
          reject(new Error(`图片“${alt || "未命名"}”加载超时，请替换后重试。`)),
        8000,
      );
      image.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      image.onerror = () => {
        clearTimeout(timer);
        reject(new Error(`图片“${alt || "未命名"}”无法访问，请替换后重试。`));
      };
      image.src = src;
    });
  }
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
