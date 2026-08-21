import { describe, expect, it, vi } from "vitest";
import type { CardImageCanvasContext, CardLayoutPage } from "../../lib/renderers/cards";
import { createCardPngFilename, loadCardCanvasImages, renderCardPagePngBlob } from "./card-image-actions";

function imagePage(): CardLayoutPage {
  return {
    id: "image-page",
    pageNumber: 2,
    totalPages: 3,
    aspectRatio: "3:4",
    canvas: { width: 1080, height: 1440 },
    safeArea: { top: 100, right: 100, bottom: 100, left: 100, x: 100, y: 100, width: 880, height: 1240 },
    nodes: [
      {
        id: "image-node",
        entryId: "asset-entry",
        blockId: "image-block",
        kind: "image",
        sourceIndex: 1,
        text: "产品截图",
        lines: [],
        x: 120,
        y: 180,
        width: 640,
        height: 360,
        image: { x: 120, y: 180, width: 640, height: 360, alt: "产品截图" },
      },
    ],
    overflow: [],
  };
}

function canvasContext() {
  return {
    fillStyle: "#000",
    font: "",
    textBaseline: "top",
    textAlign: "left",
    globalAlpha: 1,
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    arcTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    arc: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    drawImage: vi.fn(),
    setLineDash: vi.fn(),
    strokeRect: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length }) as TextMetrics),
  } satisfies CardImageCanvasContext;
}

describe("workspace card image actions", () => {
  it("renders a PNG blob with loaded image assets for copy and export", async () => {
    const page = imagePage();
    const ctx = canvasContext();
    const blob = new Blob(["png"], { type: "image/png" });
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ctx),
      toBlob: vi.fn((callback: BlobCallback, type?: string) => {
        expect(type).toBe("image/png");
        callback(blob);
      }),
    } as unknown as HTMLCanvasElement & { toBlob: (callback: BlobCallback, type?: string) => void };
    const image = { src: "blob:image" } as unknown as CanvasImageSource;
    const loadImage = vi.fn(async (src: string) => {
      expect(src).toBe("blob:image");
      return image;
    });

    const result = await renderCardPagePngBlob(page, { "image-block": "blob:image" }, { createCanvas: () => canvas, loadImage });

    expect(result).toBe(blob);
    expect(canvas.width).toBe(1080);
    expect(canvas.height).toBe(1440);
    expect(ctx.drawImage).toHaveBeenCalledWith(image, -320, -180, 640, 360);
    expect(loadImage).toHaveBeenCalledTimes(1);
  });

  it("binds image URLs by block id and entry id", async () => {
    const image = {} as CanvasImageSource;
    const images = await loadCardCanvasImages(imagePage(), { "image-block": "blob:image" }, async () => image);

    expect(images["image-block"]).toBe(image);
    expect(images["asset-entry"]).toBe(image);
    expect(createCardPngFilename("", "douyinImage", 2)).toBe("douyinImage-2.png");
    expect(createCardPngFilename("人工标题", "xiaohongshu", 1)).toBe("人工标题-xiaohongshu-1.png");
  });
});
