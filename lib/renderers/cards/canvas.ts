import type { CardLayoutPage, CardLayoutNode } from "./types";

export type CardCanvasPreset = {
  variant: "editorial" | "checklist" | "data" | "story";
  background: string;
  title: string;
  body: string;
  rule: string;
  highlight: string;
  surface: string;
  muted: string;
  fontFamily?: string;
  focusFontFamily?: string;
  radius?: number;
};

export type CardImageCanvasContext = {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle?: string | CanvasGradient | CanvasPattern;
  font: string;
  textBaseline: CanvasTextBaseline;
  textAlign: CanvasTextAlign;
  globalAlpha: number;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void;
  closePath(): void;
  fill(): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  fillText(text: string, x: number, y: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void;
  setLineDash(segments: number[]): void;
  strokeRect(x: number, y: number, width: number, height: number): void;
  measureText(text: string): TextMetrics;
};

export type DrawCardImagePageOptions = {
  preset?: Partial<CardCanvasPreset>;
  images?: Record<string, CanvasImageSource>;
  selectedImageId?: string;
  platform?: "xiaohongshu" | "douyinImage";
  brandLabel?: string;
};

const DEFAULT_PRESET: CardCanvasPreset = {
  variant: "editorial",
  background: "#FFFBF6",
  title: "#8A430E",
  body: "#6B3A16",
  rule: "#D8C5B1",
  highlight: "#F1E7DC",
  surface: "#FFFFFF",
  muted: "#8C8178",
  fontFamily: "-apple-system, BlinkMacSystemFont, PingFang SC, sans-serif",
  focusFontFamily: "-apple-system, BlinkMacSystemFont, PingFang SC, sans-serif",
  radius: 8,
};

export function drawCardImagePage(ctx: CardImageCanvasContext, page: CardLayoutPage, options: DrawCardImagePageOptions = {}) {
  const basePreset = { ...DEFAULT_PRESET, ...options.preset };
  const preset = resolvePagePreset(page, basePreset);
  ctx.fillStyle = preset.background;
  ctx.fillRect(0, 0, page.canvas.width, page.canvas.height);
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  drawPageWatermark(ctx, page, preset);
  drawPageFrame(ctx, page, preset, options.platform);
  drawPageKindAccent(ctx, page, preset);

  for (const node of page.nodes) {
    drawNode(ctx, node, preset, options);
  }

  drawBrandHeader(ctx, page, preset, options.brandLabel, options.platform);
}

/** Final renderer entry point for Xiaohongshu exports and previews. */
export function drawXiaohongshuImagePage(ctx: CardImageCanvasContext, page: CardLayoutPage, options: DrawCardImagePageOptions = {}) {
  drawCardImagePage(ctx, page, { ...options, platform: "xiaohongshu" });
}

/** Final renderer entry point for Douyin image exports and previews. */
export function drawDouyinImagePage(ctx: CardImageCanvasContext, page: CardLayoutPage, options: DrawCardImagePageOptions = {}) {
  drawCardImagePage(ctx, page, { ...options, platform: "douyinImage" });
}

function drawNode(ctx: CardImageCanvasContext, node: CardLayoutNode, preset: CardCanvasPreset, options: DrawCardImagePageOptions) {
  if (node.kind === "image" && node.image) {
    const image = options.images?.[node.blockId] ?? options.images?.[node.entryId];
    if (image) {
      const centerX = node.image.x + node.image.width / 2;
      const centerY = node.image.y + node.image.height / 2;
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(((node.image.rotation ?? 0) * Math.PI) / 180);
      ctx.globalAlpha = node.image.opacity ?? 1;
      const intrinsic = image as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number };
      const width = intrinsic.naturalWidth ?? intrinsic.width;
      const height = intrinsic.naturalHeight ?? intrinsic.height;
      const scale = typeof width === "number" && width > 0 && typeof height === "number" && height > 0
        ? Math.min(node.image.width / width, node.image.height / height) : undefined;
      const drawWidth = scale === undefined ? node.image.width : width! * scale;
      const drawHeight = scale === undefined ? node.image.height : height! * scale;
      ctx.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      ctx.globalAlpha = 1;
      ctx.restore();
    } else {
      ctx.fillStyle = preset.highlight;
      ctx.fillRect(node.x, node.y, node.width, node.height);
    }
    return;
  }

  if (node.kind === "focus") {
    if (preset.variant === "story") {
      ctx.fillStyle = preset.rule;
      ctx.fillRect(node.x, node.y - 12, node.width, 2);
      ctx.fillRect(node.x, node.y + node.height + 4, node.width, 2);
    } else {
      ctx.fillStyle = preset.variant === "data" ? preset.surface : preset.highlight;
      drawRoundRect(ctx, node.x - 24, node.y - 18, node.width + 48, node.height + 8, preset.radius ?? (preset.variant === "editorial" ? 4 : 12));
      ctx.fill();
      if (preset.variant === "checklist") {
        ctx.fillStyle = preset.title;
        ctx.fillRect(node.x - 24, node.y - 18, 8, node.height + 8);
      }
      if (preset.variant === "data") {
        ctx.strokeStyle = preset.rule;
        ctx.strokeRect(node.x - 24, node.y - 18, node.width + 48, node.height + 8);
      }
    }
  }

  if (node.kind === "title" && preset.variant === "editorial") {
    for (const line of node.lines) {
      const highlightWidth = Math.min(line.width + 16, node.width);
      ctx.fillStyle = preset.highlight;
      ctx.fillRect(line.x - 4, line.y + line.height * 0.62, highlightWidth, Math.max(10, line.height * 0.22));
    }
  }

  if (node.kind === "heading") {
    if (preset.variant === "editorial") {
      ctx.fillStyle = preset.title;
      ctx.fillRect(node.x - 18, node.y + 4, 7, Math.max(28, node.height - 18));
    } else if (preset.variant === "checklist") {
      ctx.fillStyle = preset.rule;
      ctx.fillRect(node.x - 10, (node.lines.at(-1)?.y ?? node.y) + (node.lines.at(-1)?.height ?? 0) + 6, Math.min(node.width * 0.34, 260), 6);
    } else if (preset.variant === "data") {
      ctx.fillStyle = preset.title;
      ctx.fillRect(node.x - 16, node.y - 8, 6, node.height + 12);
      ctx.fillStyle = preset.rule;
      ctx.fillRect(node.x - 16, node.y + node.height + 8, node.width + 16, 3);
    } else {
      ctx.fillStyle = preset.rule;
      ctx.fillRect(node.x, node.y - 18, 88, 4);
    }
  }

  ctx.fillStyle = node.kind === "body" ? preset.body : preset.title;
  if (node.style) ctx.font = `${node.style.fontWeight} ${node.style.fontSize}px ${node.style.fontFamily}`;
  for (const line of node.lines) {
    ctx.fillText(line.text, line.x, line.y);
  }
}

function drawPageFrame(
  ctx: CardImageCanvasContext,
  page: CardLayoutPage,
  preset: CardCanvasPreset,
  platform?: DrawCardImagePageOptions["platform"],
) {
  if (platform === "douyinImage") {
    ctx.fillStyle = preset.title;
    ctx.fillRect(0, 0, page.canvas.width, 72);
    ctx.fillStyle = preset.background;
    ctx.font = `700 24px ${preset.fontFamily ?? "-apple-system, BlinkMacSystemFont, PingFang SC, sans-serif"}`;
    ctx.textAlign = "right";
    ctx.fillText(`${String(page.pageNumber).padStart(2, "0")} / ${String(page.totalPages).padStart(2, "0")}`, page.canvas.width - page.safeArea.x, 23);
    ctx.textAlign = "left";
    return;
  }
  const labelY = Math.max(44, page.safeArea.y - 78);
  if (preset.variant === "editorial") {
    ctx.fillStyle = preset.rule;
    ctx.fillRect(page.safeArea.x, page.safeArea.y - 36, page.safeArea.width, 3);
    return;
  }

  if (preset.variant === "checklist") {
    ctx.fillStyle = preset.rule;
    ctx.font = `800 86px ${preset.fontFamily ?? "-apple-system, BlinkMacSystemFont, PingFang SC, sans-serif"}`;
    ctx.fillText(String(page.pageNumber).padStart(2, "0"), page.safeArea.x + page.safeArea.width - 104, labelY - 36);
    return;
  }

  if (preset.variant === "data") {
    ctx.fillStyle = `${preset.rule}3D`;
    const column = page.safeArea.width / 4;
    for (let index = 0; index <= 4; index += 1) ctx.fillRect(page.safeArea.x + column * index, page.safeArea.y - 28, 1, page.safeArea.height + 56);
    ctx.fillStyle = preset.title;
    ctx.fillRect(page.safeArea.x, page.safeArea.y - 36, page.safeArea.width, 4);
    return;
  }

  ctx.fillStyle = preset.rule;
  ctx.fillRect(page.safeArea.x, page.safeArea.y, 2, page.safeArea.height + 18);
}

function resolvePagePreset(page: CardLayoutPage, preset: CardCanvasPreset): CardCanvasPreset {
  if (page.pageKind !== "cover") return preset;
  if (preset.variant === "checklist") {
    return {
      ...preset,
      background: preset.rule,
      title: "#101010",
      body: "#171717",
      rule: "#101010",
      highlight: "#FFFFFF99",
      muted: "#292929",
    };
  }
  return {
    ...preset,
    background: preset.title,
    title: preset.surface,
    body: preset.surface,
    rule: preset.rule,
    highlight: "#FFFFFF1F",
    muted: preset.background,
  };
}

function drawPageWatermark(ctx: CardImageCanvasContext, page: CardLayoutPage, preset: CardCanvasPreset) {
  if (page.pageKind === "cover") return;
  ctx.save();
  ctx.globalAlpha = 0.035;
  ctx.fillStyle = preset.title;
  ctx.font = `900 ${page.aspectRatio === "9:16" ? 320 : 260}px ${preset.fontFamily ?? "-apple-system, BlinkMacSystemFont, PingFang SC, sans-serif"}`;
  ctx.textAlign = "right";
  ctx.fillText(String(page.pageNumber).padStart(2, "0"), page.canvas.width - page.safeArea.x, page.canvas.height - (page.aspectRatio === "9:16" ? 520 : 410));
  ctx.restore();
  ctx.textAlign = "left";
  ctx.globalAlpha = 1;
}

function drawBrandHeader(
  ctx: CardImageCanvasContext,
  page: CardLayoutPage,
  preset: CardCanvasPreset,
  brandLabel?: string,
  platform?: DrawCardImagePageOptions["platform"],
) {
  if (!brandLabel) return;
  ctx.fillStyle = platform === "douyinImage" ? preset.background : preset.muted;
  ctx.font = `600 19px ${preset.fontFamily ?? "-apple-system, BlinkMacSystemFont, PingFang SC, sans-serif"}`;
  ctx.textAlign = "left";
  ctx.fillText(brandLabel, page.safeArea.x, platform === "douyinImage" ? 25 : Math.max(44, page.safeArea.y - 78));
}

function drawPageKindAccent(ctx: CardImageCanvasContext, page: CardLayoutPage, preset: CardCanvasPreset) {
  if (page.pageKind === "cover") return;
  if (page.pageKind === "warning") {
    ctx.fillStyle = preset.rule;
    ctx.fillRect(page.safeArea.x - 24, page.safeArea.y, 8, Math.min(page.safeArea.height * 0.7, 720));
    return;
  }
  if (page.pageKind === "keyMetric") {
    const metric = page.nodes.map((node) => node.text).join(" ").match(/\d+(?:\.\d+)?\s*(?:%|％|倍|万|亿|元|人|次|个|项|条|类|月|年|天)?/u)?.[0];
    if (!metric) return;
    ctx.fillStyle = `${preset.title}18`;
    ctx.font = `800 118px ${preset.fontFamily ?? "-apple-system, BlinkMacSystemFont, PingFang SC, sans-serif"}`;
    ctx.textAlign = "right";
    ctx.fillText(metric, page.safeArea.x + page.safeArea.width, page.safeArea.y + 14);
    ctx.textAlign = "left";
    return;
  }
  if (page.pageKind === "turning" || page.pageKind === "transition") {
    ctx.fillStyle = preset.title;
    ctx.fillRect(page.safeArea.x, page.safeArea.y + 46, 72, 7);
    ctx.fillStyle = preset.muted;
    ctx.font = `600 22px ${preset.fontFamily ?? "-apple-system, BlinkMacSystemFont, PingFang SC, sans-serif"}`;
    ctx.fillText("转折", page.safeArea.x + 90, page.safeArea.y + 34);
    return;
  }
  if (page.pageKind === "ending" || page.pageKind === "summary" || page.pageKind === "conclusion" || page.pageKind === "epilogue") {
    ctx.fillStyle = preset.rule;
    const width = Math.min(180, page.safeArea.width * 0.24);
    ctx.fillRect(page.canvas.width / 2 - width / 2, page.safeArea.y + page.safeArea.height - 16, width, 3);
  }
}

function drawRoundRect(ctx: CardImageCanvasContext, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}
