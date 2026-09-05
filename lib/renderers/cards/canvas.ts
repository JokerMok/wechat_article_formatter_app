import type { CardLayoutPage, CardLayoutNode } from "./types";

export type CardCanvasPreset = {
  variant: "editorial" | "checklist" | "data" | "story";
  background: string;
  title: string;
  body: string;
  rule: string;
  highlight: string;
  dots: string;
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
};

const DEFAULT_PRESET: CardCanvasPreset = {
  variant: "editorial",
  background: "#FFFBF6",
  title: "#8A430E",
  body: "#6B3A16",
  rule: "#D8C5B1",
  highlight: "#F1E7DC",
  dots: "#E9E0D7",
  surface: "#FFFFFF",
  muted: "#8C8178",
  fontFamily: "-apple-system, BlinkMacSystemFont, PingFang SC, sans-serif",
  focusFontFamily: "-apple-system, BlinkMacSystemFont, PingFang SC, sans-serif",
  radius: 8,
};

export function drawCardImagePage(ctx: CardImageCanvasContext, page: CardLayoutPage, options: DrawCardImagePageOptions = {}) {
  const preset = { ...DEFAULT_PRESET, ...options.preset };
  ctx.fillStyle = preset.background;
  ctx.fillRect(0, 0, page.canvas.width, page.canvas.height);
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  drawPageFrame(ctx, page, preset);
  drawPageKindAccent(ctx, page, preset);

  for (const node of page.nodes) {
    drawNode(ctx, node, preset, options);
  }

  drawPageIndicator(ctx, page, preset);
}

/** Final renderer entry point for Xiaohongshu exports and previews. */
export function drawXiaohongshuImagePage(ctx: CardImageCanvasContext, page: CardLayoutPage, options: DrawCardImagePageOptions = {}) {
  drawCardImagePage(ctx, page, options);
}

/** Final renderer entry point for Douyin image exports and previews. */
export function drawDouyinImagePage(ctx: CardImageCanvasContext, page: CardLayoutPage, options: DrawCardImagePageOptions = {}) {
  drawCardImagePage(ctx, page, options);
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
      ctx.drawImage(image, -node.image.width / 2, -node.image.height / 2, node.image.width, node.image.height);
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

function drawPageFrame(ctx: CardImageCanvasContext, page: CardLayoutPage, preset: CardCanvasPreset) {
  const labelY = Math.max(44, page.safeArea.y - 78);
  if (preset.variant === "editorial") {
    ctx.fillStyle = preset.rule;
    ctx.fillRect(page.safeArea.x, page.safeArea.y - 36, page.safeArea.width, 3);
    ctx.fillStyle = preset.muted;
    ctx.font = `600 22px ${preset.fontFamily ?? "-apple-system, BlinkMacSystemFont, PingFang SC, sans-serif"}`;
    ctx.fillText(`编辑部  /  ${String(page.pageNumber).padStart(2, "0")}`, page.safeArea.x, labelY);
    return;
  }

  if (preset.variant === "checklist") {
    ctx.fillStyle = preset.title;
    ctx.fillRect(page.safeArea.x, labelY, 76, 8);
    ctx.fillStyle = preset.rule;
    ctx.font = `800 86px ${preset.fontFamily ?? "-apple-system, BlinkMacSystemFont, PingFang SC, sans-serif"}`;
    ctx.fillText(String(page.pageNumber).padStart(2, "0"), page.safeArea.x + page.safeArea.width - 104, labelY - 36);
    ctx.fillStyle = preset.muted;
    ctx.font = `700 20px ${preset.fontFamily ?? "-apple-system, BlinkMacSystemFont, PingFang SC, sans-serif"}`;
    ctx.fillText(page.pageKind === "warning" ? "避坑提醒" : page.pageKind === "action" || page.pageKind === "callToAction" ? "执行清单" : "行动清单", page.safeArea.x, labelY + 20);
    return;
  }

  if (preset.variant === "data") {
    ctx.fillStyle = `${preset.rule}3D`;
    const column = page.safeArea.width / 4;
    for (let index = 0; index <= 4; index += 1) ctx.fillRect(page.safeArea.x + column * index, page.safeArea.y - 28, 1, page.safeArea.height + 56);
    ctx.fillStyle = preset.title;
    ctx.fillRect(page.safeArea.x, page.safeArea.y - 36, page.safeArea.width, 4);
    ctx.font = `700 21px ${preset.fontFamily ?? "-apple-system, BlinkMacSystemFont, PingFang SC, sans-serif"}`;
    ctx.fillText(`数据编辑部  ${String(page.pageNumber).padStart(2, "0")}`, page.safeArea.x, labelY);
    return;
  }

  ctx.fillStyle = preset.rule;
  ctx.fillRect(page.safeArea.x, page.safeArea.y - 34, 72, 3);
  ctx.fillRect(page.safeArea.x, page.safeArea.y - 34, 2, page.safeArea.height + 52);
  ctx.fillStyle = preset.title;
  ctx.font = `600 22px ${preset.fontFamily ?? "-apple-system, BlinkMacSystemFont, PingFang SC, sans-serif"}`;
  ctx.fillText(`${storyLabel(page.pageKind)}  ${String(page.pageNumber).padStart(2, "0")}`, page.safeArea.x + 20, labelY);
}

function drawPageKindAccent(ctx: CardImageCanvasContext, page: CardLayoutPage, preset: CardCanvasPreset) {
  if (page.pageKind === "cover") {
    ctx.fillStyle = preset.rule;
    ctx.fillRect(page.safeArea.x, page.safeArea.y + page.safeArea.height - 20, Math.min(160, page.safeArea.width * 0.22), 3);
    return;
  }
  if (page.pageKind === "warning") {
    ctx.strokeStyle = preset.rule;
    ctx.setLineDash([10, 10]);
    ctx.strokeRect(page.safeArea.x - 22, page.safeArea.y + 20, page.safeArea.width + 44, page.safeArea.height - 40);
    ctx.setLineDash([]);
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

function storyLabel(kind: CardLayoutPage["pageKind"]) {
  if (kind === "conflict") return "冲突";
  if (kind === "turning" || kind === "transition") return "转折";
  if (kind === "ending" || kind === "epilogue") return "尾声";
  if (kind === "opening" || kind === "intro") return "开场";
  return "章节";
}

function drawPageIndicator(ctx: CardImageCanvasContext, page: CardLayoutPage, preset: CardCanvasPreset) {
  if (page.totalPages <= 1) return;
  const dotGap = 24;
  const startX = page.canvas.width / 2 - ((page.totalPages - 1) * dotGap) / 2;
  const y = page.canvas.height - 62;
  for (let index = 0; index < page.totalPages; index += 1) {
    ctx.beginPath();
    ctx.fillStyle = index + 1 === page.pageNumber ? preset.title : preset.dots;
    ctx.arc(startX + index * dotGap, y, 7, 0, Math.PI * 2);
    ctx.fill();
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
