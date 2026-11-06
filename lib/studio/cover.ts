import type { CoverDocument, StyleProfile } from "./types";
import { uid } from "./types";
import { fontStacks } from "./styles";
import type { AssetMap } from "./renderer";

export function newCover(
  articleId: string,
  title: string,
  style: StyleProfile,
): CoverDocument {
  return {
    id: uid("cover"),
    articleId,
    title,
    subtitle: "",
    style: {
      id: uid("coverstyle"),
      name: style.name,
      background:
        style.tokens.background === "#ffffff"
          ? "#edf2ee"
          : style.tokens.background,
      foreground: style.tokens.text,
      accent: style.tokens.accent,
      composition: "left",
      fontFamily: style.tokens.fontFamily,
      rights: "owned",
      confidence: "theme",
      notes: [],
    },
    candidate: 0,
    width: 900,
    height: 383,
    fontSize: 58,
    x: 8,
    y: 24,
    textWidth: 80,
    imageScale: 1,
    imageX: 50,
    imageY: 50,
    updatedAt: new Date().toISOString(),
  };
}
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const char of paragraph) {
      if (line && ctx.measureText(line + char).width > maxWidth) {
        lines.push(line);
        line = char;
      } else line += char;
    }
    lines.push(line);
  }
  return lines;
}
export async function drawCover(
  canvas: HTMLCanvasElement,
  cover: CoverDocument,
  assets: AssetMap,
  candidate = cover.candidate,
) {
  canvas.width = cover.width;
  canvas.height = cover.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("当前浏览器无法绘制封面。");
  const { style, width: w, height: h } = cover;
  const backgrounds = [style.background, style.accent, style.foreground];
  const bg = backgrounds[candidate % 3];
  const contrast = (hex: string) => {
    const c = hex
      .slice(1)
      .match(/../g)!
      .map((n) => parseInt(n, 16) / 255)
      .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4));
    return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722 > 0.4
      ? "#17261f"
      : "#ffffff";
  };
  const fg =
    cover.textColors?.[candidate] ??
    cover.textColor ??
    (candidate === 0 ? style.foreground : contrast(bg));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  if (cover.imageId) {
    const src = assets[cover.imageId]?.dataUrl;
    if (!src) throw new Error("封面背景图片缺失，请重新上传。");
    const img = new Image();
    img.src = src;
    await img.decode();
    const scale = Math.max(w / img.width, h / img.height) * cover.imageScale;
    ctx.drawImage(
      img,
      ((w - img.width * scale) * cover.imageX) / 100,
      ((h - img.height * scale) * cover.imageY) / 100,
      img.width * scale,
      img.height * scale,
    );
    ctx.fillStyle = "rgba(0,0,0,.32)";
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.globalAlpha = 0.11;
    ctx.fillStyle = candidate === 0 ? style.accent : fg;
    if (candidate === 1) {
      ctx.fillRect(w * 0.73, 0, w * 0.27, h);
      ctx.fillRect(w * 0.68, h * 0.68, w * 0.32, h * 0.32);
    } else if (candidate === 2) {
      ctx.beginPath();
      ctx.arc(w * 0.93, h * 0.05, h * 0.8, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(w * 0.89, h * 0.12, w * 0.016, h * 0.76);
      ctx.fillRect(w * 0.93, h * 0.12, w * 0.016, h * 0.76);
    }
    ctx.globalAlpha = 1;
  }
  const size = cover.fontSize;
  ctx.font = `700 ${size}px ${fontStacks[style.fontFamily]}`;
  ctx.fillStyle = cover.imageId ? "#ffffff" : fg;
  const maxWidth = (w * cover.textWidth) / 100;
  const lines = wrapText(ctx, cover.title, maxWidth);
  const lineHeight = size * 1.32;
  const subtitleHeight = cover.subtitle ? size * 0.8 : 0;
  const y = (h * cover.y) / 100;
  if (lines.length * lineHeight + y + subtitleHeight > h * 0.96)
    throw new Error("封面标题超出画布，请缩小字号、上移文字或增加字区宽度。");
  const center = style.composition === "center";
  const x = (w * cover.x) / 100;
  if (center && (x - maxWidth / 2 < 0 || x + maxWidth / 2 > w))
    throw new Error("居中文字区域超出画布，请把水平位置调回 50%，或缩小字区。");
  if (!center && x + maxWidth > w * 0.98)
    throw new Error("文字区域超出右边界，请左移文字或缩小字区。");
  ctx.textAlign = center ? "center" : "left";
  ctx.textBaseline = "top";
  lines.forEach((line, i) => ctx.fillText(line, x, y + i * lineHeight));
  if (cover.subtitle) {
    ctx.font = `400 ${Math.round(size * 0.38)}px ${fontStacks[style.fontFamily]}`;
    const sublines = wrapText(ctx, cover.subtitle, maxWidth);
    if (sublines.length > 2) throw new Error("副标题过长，请缩短或减小字号。");
    sublines.forEach((line, i) =>
      ctx.fillText(
        line,
        x,
        y + lines.length * lineHeight + size * 0.24 + i * size * 0.48,
      ),
    );
  }
  return canvas;
}
export async function coverBlob(cover: CoverDocument, assets: AssetMap) {
  const canvas = document.createElement("canvas");
  await drawCover(canvas, cover, assets);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("封面导出失败。"))),
      "image/png",
    ),
  );
}
