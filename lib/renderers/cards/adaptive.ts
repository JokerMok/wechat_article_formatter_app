import type { UnifiedArticleContent } from "../../content";
import { layoutCardPages } from "./layout";
import type { CardLayoutOptions, CardLayoutResult, TextMeasurer } from "./types";

export type AdaptiveCardLayoutResult = CardLayoutResult & {
  fitScale: number;
  targetPages: number;
};

export function layoutCardPagesToTarget(
  source: UnifiedArticleContent,
  measurer: TextMeasurer,
  options: CardLayoutOptions,
  targetPages: number,
): AdaptiveCardLayoutResult {
  const target = Math.max(1, Math.floor(targetPages));
  const initial = layoutCardPages(source, measurer, options);
  if (initial.pages.length <= target || options.manualPages?.length || options.lockedPages?.length) {
    return { ...initial, fitScale: 1, targetPages: target };
  }

  let best = initial;
  let bestScale = 1;
  // Density may tighten slightly, but page count is allowed to grow. Text on a
  // 1080px social card must never be reduced to thumbnail-sized body copy.
  for (const scale of [0.96, 0.92, 0.88]) {
    const typography = options.typography ?? {};
    const candidate = layoutCardPages(source, measurer, {
      ...options,
      typography: {
        ...typography,
        titleFontSize: scaled(typography.titleFontSize, scale, 54),
        headingFontSize: scaled(typography.headingFontSize, scale, 34),
        bodyFontSize: scaled(typography.bodyFontSize, scale, 30),
        focusFontSize: scaled(typography.focusFontSize, scale, 31),
        lineSpacing: Math.max(1.28, (typography.lineSpacing ?? 1.35) - (1 - scale) * 0.28),
        paragraphSpacing: scaled(typography.paragraphSpacing, scale, 26),
        titleSpacing: scaled(typography.titleSpacing, scale, 34),
      },
    });

    if (
      candidate.pages.length < best.pages.length
      || (candidate.pages.length === best.pages.length && candidate.overflow.length < best.overflow.length)
      || (candidate.pages.length === best.pages.length && best.pages.length > target)
    ) {
      best = candidate;
      bestScale = scale;
    }
    if (candidate.pages.length <= target && candidate.overflow.length === 0) break;
  }

  return { ...best, fitScale: bestScale, targetPages: target };
}

/** Xiaohongshu keeps a calmer reading rhythm for explanatory cards. */
export function layoutXiaohongshuPagesToTarget(
  source: UnifiedArticleContent,
  measurer: TextMeasurer,
  options: CardLayoutOptions,
  targetPages: number,
): AdaptiveCardLayoutResult {
  return layoutCardPagesToTarget(source, measurer, {
    ...options,
    typography: {
      ...options.typography,
      paragraphSpacing: Math.max(options.typography?.paragraphSpacing ?? 0, 30),
    },
  }, targetPages);
}

/** Douyin image cards prioritize fast scanning and tighter grouping. */
export function layoutDouyinImagePagesToTarget(
  source: UnifiedArticleContent,
  measurer: TextMeasurer,
  options: CardLayoutOptions,
  targetPages: number,
): AdaptiveCardLayoutResult {
  return layoutCardPagesToTarget(source, measurer, {
    ...options,
    typography: {
      ...options.typography,
      paragraphSpacing: Math.min(options.typography?.paragraphSpacing ?? 28, 30),
      titleSpacing: Math.min(options.typography?.titleSpacing ?? 42, 46),
    },
  }, targetPages);
}

function scaled(value: number | undefined, scale: number, minimum: number) {
  if (value === undefined) return undefined;
  return Math.max(minimum, Math.round(value * scale));
}
