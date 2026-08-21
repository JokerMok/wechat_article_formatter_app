import type { CardLayoutPage, CardLayoutNode } from "./types";

export type CardCanvasPreset = {
  background: string;
  title: string;
  body: string;
  rule: string;
  highlight: string;
  dots: string;
};

export type CardImageCanvasContext = {
  fillStyle: string | CanvasGradient | CanvasPattern;
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
  background: "#FFFBF6",
  title: "#8A430E",
  body: "#6B3A16",
  rule: "#D8C5B1",
  highlight: "#F1E7DC",
  dots: "#E9E0D7",
};

export function drawCardImagePage(ctx: CardImageCanvasContext, page: CardLayoutPage, options: DrawCardImagePageOptions = {}) {
  const preset = { ...DEFAULT_PRESET, ...options.preset };
  ctx.fillStyle = preset.background;
  ctx.fillRect(0, 0, page.canvas.width, page.canvas.height);

  ctx.fillStyle = preset.rule;
  ctx.fillRect(page.safeArea.x, page.safeArea.y - 36, page.safeArea.width, 4);
  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  for (const node of page.nodes) {
    drawNode(ctx, node, preset, options);
  }

  drawPageIndicator(ctx, page, preset);
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
    ctx.fillStyle = preset.highlight;
    drawRoundRect(ctx, node.x - 24, node.y - 18, node.width + 48, node.height, 16);
    ctx.fill();
  }

  if (node.kind === "title") {
    for (const line of node.lines) {
      const highlightWidth = Math.min(line.width + 16, node.width);
      ctx.fillStyle = preset.highlight;
      ctx.fillRect(line.x - 4, line.y + line.height * 0.62, highlightWidth, Math.max(10, line.height * 0.22));
    }
  }

  if (node.kind === "heading") {
    ctx.fillStyle = preset.title;
    ctx.fillRect(node.x - 18, node.y + 4, 7, Math.max(28, node.height - 18));
  }

  ctx.fillStyle = node.kind === "body" ? preset.body : preset.title;
  if (node.style) ctx.font = `${node.style.fontWeight} ${node.style.fontSize}px ${node.style.fontFamily}`;
  for (const line of node.lines) {
    ctx.fillText(line.text, line.x, line.y);
  }
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
