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
  for (const scale of [0.94, 0.88, 0.82, 0.76]) {
    const typography = options.typography ?? {};
    const candidate = layoutCardPages(source, measurer, {
      ...options,
      typography: {
        ...typography,
        titleFontSize: scaled(typography.titleFontSize, scale, 48),
        headingFontSize: scaled(typography.headingFontSize, scale, 30),
        bodyFontSize: scaled(typography.bodyFontSize, scale, 25),
        focusFontSize: scaled(typography.focusFontSize, scale, 25),
        lineSpacing: Math.max(1.2, (typography.lineSpacing ?? 1.35) - (1 - scale) * 0.45),
        paragraphSpacing: scaled(typography.paragraphSpacing, scale, 22),
        titleSpacing: scaled(typography.titleSpacing, scale, 30),
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

function scaled(value: number | undefined, scale: number, minimum: number) {
  if (value === undefined) return undefined;
  return Math.max(minimum, Math.round(value * scale));
}
