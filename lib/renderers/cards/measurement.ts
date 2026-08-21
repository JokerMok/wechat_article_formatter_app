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
  return {
    measureText(text: string, style: TextStyle) {
      ctx.font = `${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;
      return { width: ctx.measureText(text).width };
    },
  };
}
