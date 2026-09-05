import type { TextMeasurer, TextStyle } from "./types";

const wideGlyphPattern = /[\u3000-\u9fff\uff00-\uffef]/u;

export function createApproximateTextMeasurer(): TextMeasurer {
  return {
    measureText(text: string, style: TextStyle) {
      let width = 0;
      for (const char of Array.from(text)) {
        if (char === " ") width += style.fontSize * 0.32;
        else if (wideGlyphPattern.test(char)) width += style.fontSize;
        else width += style.fontSize * 0.58;
      }
      return { width };
    },
  };
}

export function createCanvasTextMeasurer(ctx: Pick<CanvasRenderingContext2D, "font" | "measureText">): TextMeasurer {
  const cache = new Map<string, number>();
  return {
    measureText(text: string, style: TextStyle) {
      const font = `${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;
      const key = `${font}\n${text}`;
      const cached = cache.get(key);
      if (cached !== undefined) return { width: cached };
      ctx.font = font;
      const width = ctx.measureText(text).width;
      if (cache.size >= 20000) cache.clear();
      cache.set(key, width);
      return { width };
    },
  };
}
