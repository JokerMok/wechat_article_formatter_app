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
  const canvas = options.createCanvas?.() ?? document.createElement("canvas");
  canvas.width = page.canvas.width;
  canvas.height = page.canvas.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  const images = await loadCardCanvasImages(page, imageUrlByBlock, options.loadImage);
  const drawPage = options.platform === "douyinImage" ? drawDouyinImagePage : drawXiaohongshuImagePage;
  drawPage(ctx, page, { images, preset: options.preset, platform: options.platform });
  return canvasToBlob(canvas, "image/png");
}

export async function loadCardCanvasImages(page: CardLayoutPage, imageUrlByBlock: Record<string, string>, loadImage: CardImageLoader = loadBrowserImage) {
  const entries = await Promise.all(
    page.nodes.flatMap((node) => {
      if (node.kind !== "image") return [];
      const url = imageUrlByBlock[node.blockId] ?? imageUrlByBlock[node.entryId];
      if (!url) return [];
      return [
        loadImage(url)
          .then((image) => [
            [node.blockId, image],
            [node.entryId, image],
          ])
          .catch(() => []),
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
  image.src = src;
  if (image.decode) {
    await image.decode();
  } else {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("image load failed"));
    });
  }
  return image;
}
