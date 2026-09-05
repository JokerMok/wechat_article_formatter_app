import { drawDouyinImagePage, drawXiaohongshuImagePage, type CardLayoutPage } from "../../lib/renderers/cards";
import type { CardCanvasPreset } from "../../lib/renderers/cards/canvas";
import type { PlatformId } from "../../lib/platforms/types";

type CardCanvas = HTMLCanvasElement & {
  toBlob(callback: BlobCallback, type?: string, quality?: unknown): void;
};

type CardImageLoader = (src: string) => Promise<CanvasImageSource>;

export type CardImageRenderOptions = {
  createCanvas?: () => CardCanvas;
  loadImage?: CardImageLoader;
  preset?: Partial<CardCanvasPreset>;
  platform?: "xiaohongshu" | "douyinImage";
};

export function createCardPngFilename(title: string, platform: PlatformId, pageNumber: number) {
  const baseName = title ? `${title}-${platform}` : platform;
  return `${baseName}-${pageNumber}.png`;
}

export async function renderCardPagePngBlob(page: CardLayoutPage, imageUrlByBlock: Record<string, string>, options: CardImageRenderOptions = {}) {
  const canvas = await renderCardPageCanvas(page, imageUrlByBlock, options);
  return canvasToBlob(canvas, "image/png");
}

export async function renderCardPageCanvas(page: CardLayoutPage, imageUrlByBlock: Record<string, string>, options: CardImageRenderOptions = {}) {
  if (page.overflow.length) throw new Error("页面存在溢出，请调整字号或拆页后再导出。");
  if (typeof document !== "undefined" && document.fonts?.ready) await document.fonts.ready;
  const canvas = options.createCanvas?.() ?? document.createElement("canvas");
  canvas.width = page.canvas.width;
  canvas.height = page.canvas.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("浏览器无法创建图片画布，请刷新后重试。");
  const images = await loadCardCanvasImages(page, imageUrlByBlock, options.loadImage, true);
  const drawPage = options.platform === "douyinImage" ? drawDouyinImagePage : drawXiaohongshuImagePage;
  drawPage(ctx, page, { images, preset: options.preset, platform: options.platform });
  return canvas;
}

export async function loadCardCanvasImages(page: CardLayoutPage, imageUrlByBlock: Record<string, string>, loadImage: CardImageLoader = loadBrowserImage, strict = false) {
  const entries = await Promise.all(
    page.nodes.flatMap((node) => {
      if (node.kind !== "image") return [];
      const url = imageUrlByBlock[node.blockId] ?? imageUrlByBlock[node.entryId];
      if (!url) {
        if (strict) throw new Error("图片素材缺失，请重新上传或替换后导出。");
        return [];
      }
      return [
        loadImage(url)
          .then((image) => [
            [node.blockId, image],
            [node.entryId, image],
          ])
          .catch(() => {
            if (strict) throw new Error("图片无法加载或不允许跨域导出，请下载图片后上传到素材库。");
            return [];
          }),
      ];
    }),
  );
  return Object.fromEntries(entries.flat()) as Record<string, CanvasImageSource>;
}

function canvasToBlob(canvas: CardCanvas, type: string) {
  return new Promise<Blob | undefined>((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? undefined), type);
  });
}

async function loadBrowserImage(src: string): Promise<CanvasImageSource> {
  const image = new Image();
  image.decoding = "async";
  if (/^https?:/i.test(src)) image.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      if (error) { image.src = ""; reject(error); } else resolve();
    };
    const timer = setTimeout(() => finish(new Error("image load timeout")), 15000);
    image.onload = () => finish();
    image.onerror = () => finish(new Error("image load failed"));
    image.src = src;
  });
  return image;
}
