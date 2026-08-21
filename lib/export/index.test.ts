import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UnifiedArticleContent } from "../content";
import type { CardAspectRatio, CardImageCanvasContext, CardLayoutPage } from "../renderers/cards";
import type { AssetBlobRepository, ProjectDocument, StoredAssetRecord } from "../storage";
import {
  createExportBaseName,
  ExportPackageError,
  exportDouyinImagePackage,
  exportDouyinLongformText,
  exportProjectBackupPackage,
  exportWechatHtml,
  exportXiaohongshuPackage,
} from "./index";

const exportedAt = "2026-01-02T03:04:05.000Z";

afterEach(() => {
  vi.unstubAllGlobals();
});

function source(startLine: number, sourceText: string) {
  return {
    startLine,
    endLine: startLine,
    startOffset: 0,
    endOffset: sourceText.length,
    sourceText,
  };
}

function articleContent(): UnifiedArticleContent {
  return {
    schemaVersion: 1,
    sourceText: "# Original\nLead\nImage\nBody",
    sourceFormat: "markdown",
    parseMode: "knowledge",
    title: "Original Title",
    warnings: [],
    blocks: [
      {
        id: "title",
        type: "title",
        text: "Original Title",
        plainText: "Original Title",
        markdown: "# Original Title",
        source: source(1, "# Original Title"),
      },
      {
        id: "lead",
        type: "lead",
        text: "Lead text",
        plainText: "Lead text",
        markdown: "Lead text",
        source: source(2, "Lead text"),
      },
      {
        id: "image-a",
        type: "image",
        text: "Image A",
        plainText: "Image A",
        markdown: "![Image A](data:image/png;base64,aaa)",
        source: source(3, "![Image A](data:image/png;base64,aaa)"),
      },
      {
        id: "body",
        type: "paragraph",
        text: "Body text",
        plainText: "Body text",
        markdown: "Body text",
        source: source(4, "Body text"),
      },
    ],
  };
}

function page(id: string, pageNumber: number, text: string, aspectRatio: CardAspectRatio = "3:4"): CardLayoutPage {
  const canvas = aspectRatio === "9:16" ? { width: 1080, height: 1920 } : { width: 1080, height: 1440 };
  const safeArea = aspectRatio === "9:16" ? { top: 100, right: 100, bottom: 100, left: 100, x: 100, y: 100, width: 880, height: 1720 } : { top: 100, right: 100, bottom: 100, left: 100, x: 100, y: 100, width: 880, height: 1240 };
  return {
    id,
    pageNumber,
    totalPages: 2,
    aspectRatio,
    canvas,
    safeArea,
    nodes: [
      {
        id: `${id}-node`,
        entryId: `${id}-entry`,
        blockId: id,
        kind: "body",
        sourceIndex: pageNumber,
        text,
        lines: [{ text, x: 100, y: 100, width: 200, height: 40 }],
        x: 100,
        y: 100,
        width: 200,
        height: 40,
      },
    ],
    overflow: [],
  };
}

function imagePage(id: string, aspectRatio: CardAspectRatio = "3:4"): CardLayoutPage {
  const base = page(id, 1, "Image", aspectRatio);
  return {
    ...base,
    totalPages: 1,
    nodes: [
      {
        id: `${id}-node`,
        entryId: `${id}-entry`,
        blockId: id,
        kind: "image",
        sourceIndex: 1,
        text: "Image alt",
        lines: [],
        x: 100,
        y: 140,
        width: 320,
        height: 180,
        image: { x: 100, y: 140, width: 320, height: 180, rotation: 0, opacity: 1, alt: "Image alt" },
      },
    ],
  };
}

function mockCanvasContext(overrides: Partial<CardImageCanvasContext> = {}): CardImageCanvasContext {
  return {
    fillStyle: "",
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
    measureText: () => ({ width: 0 }) as TextMetrics,
    ...overrides,
  };
}

async function zipEntries(blob: Blob) {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return zip.files;
}

describe("platform exports", () => {
  it("creates deterministic export base names", () => {
    expect(createExportBaseName("  Hello, WeChat!  ", exportedAt, "wechat")).toBe("hello-wechat-20260102-030405-wechat");
  });

  it("exports WeChat edited HTML with image nodes intact", async () => {
    const html = '<section><p>Edited paragraph</p><img src="data:image/png;base64,abc" alt="Edited image" /></section>';
    const result = exportWechatHtml({
      exportedAt,
      wechatContent: {
        schemaVersion: 1,
        platform: "wechat",
        rendererVersion: 1,
        templateKey: "zhenyiKnowledgeMinimal",
        title: "Edited Title",
        sourceFormat: "markdown",
        parseMode: "knowledge",
        blocks: [],
        html,
        text: "Edited paragraph",
        images: [{ id: "image-a", blockId: "image-a", src: "data:image/png;base64,abc", alt: "Edited image" }],
        warnings: [],
      },
    });

    expect(result.html).toBe(html);
    expect(await result.htmlFile.blob.text()).toBe(html);
    expect(result.images).toEqual([{ id: "image-a", blockId: "image-a", src: "data:image/png;base64,abc", alt: "Edited image" }]);
  });

  it("renders WeChat HTML from source content with explicit image nodes", async () => {
    const result = exportWechatHtml({
      content: articleContent(),
      exportedAt,
      imageNodes: [{ blockId: "image-a", src: "data:image/png;base64,from-node", alt: "Node image", width: 80, align: "center" }],
    });

    expect(result.html).toContain('src="data:image/png;base64,from-node"');
    expect(result.html).toContain('alt="Node image"');
    expect(result.images[0]?.blockId).toBe("image-a");
  });

  it("packages Xiaohongshu images, copy, tags, and manifest in render order", async () => {
    const rendered: string[] = [];
    const result = await exportXiaohongshuPackage({
      content: articleContent(),
      exportedAt,
      pages: [page("second", 2, "Second page"), page("first", 1, "First page")],
      output: {
        platform: "xiaohongshu",
        schemaVersion: 1,
        profileVersion: "1.0.0",
        source: { sourceSchemaVersion: 1, sourceTextFingerprint: "fixed", sourceFormat: "markdown", sourceTitle: "Edited", blockIds: [], blockCount: 0 },
        title: "Edited XHS",
        body: "Edited body survives export",
        tags: ["tagA", "tagB"],
        cover: { title: "Edited XHS", subtitle: "Sub" },
        pages: [],
      },
      renderer: async ({ page: renderedPage }) => {
        rendered.push(renderedPage.id);
        return new Blob([`png:${renderedPage.id}`], { type: "image/png" });
      },
    });

    expect(rendered).toEqual(["second", "first"]);
    expect(result.images.map((file) => file.path)).toEqual([
      "images/edited-xhs-20260102-030405-xiaohongshu-01.png",
      "images/edited-xhs-20260102-030405-xiaohongshu-02.png",
    ]);
    expect(result.copyText).toContain("Edited body survives export");
    expect(result.tagsText).toBe("#tagA #tagB");

    const files = await zipEntries(result.zipBlob);
    expect(Object.keys(files).sort()).toEqual([
      "copy.txt",
      "images/",
      "images/edited-xhs-20260102-030405-xiaohongshu-01.png",
      "images/edited-xhs-20260102-030405-xiaohongshu-02.png",
      "manifest.json",
      "tags.txt",
    ]);
    await expect(files["images/edited-xhs-20260102-030405-xiaohongshu-01.png"].async("text")).resolves.toBe("png:second");
    await expect(files["copy.txt"].async("text")).resolves.toContain("Edited body survives export");
  });

  it("passes embedded card image sources into browser PNG rendering", async () => {
    const drawImage = vi.fn();
    const context = mockCanvasContext({ drawImage });
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
      toBlob: vi.fn((callback: BlobCallback) => callback(new Blob(["png"], { type: "image/png" }))),
    };
    vi.stubGlobal("document", {
      createElement: vi.fn(() => canvas),
    });

    const imageSource = {} as CanvasImageSource;
    const result = await exportXiaohongshuPackage({
      content: articleContent(),
      exportedAt,
      pages: [imagePage("image-a")],
      images: { "image-a": imageSource },
    });

    expect(result.images[0]?.path).toBe("images/original-title-20260102-030405-xiaohongshu-01.png");
    expect(drawImage).toHaveBeenCalledWith(imageSource, -160, -90, 320, 180);
  });

  it("exports Douyin image packages for 9:16 with caption copy and tags", async () => {
    const result = await exportDouyinImagePackage({
      content: articleContent(),
      ratio: "9:16",
      exportedAt,
      pages: [page("douyin", 1, "Douyin page", "9:16")],
      renderer: async ({ ratio }) => new Blob([`png:${ratio}`], { type: "image/png" }),
    });

    expect(result.output.ratio).toBe("9:16");
    expect(result.images[0]?.path).toBe("images/original-title-20260102-030405-douyin-9x16-01.png");
    expect(result.copyText).toContain(result.output.caption);
    expect(result.tagsText).toContain("#Original");

    const files = await zipEntries(result.zipBlob);
    await expect(files["images/original-title-20260102-030405-douyin-9x16-01.png"].async("text")).resolves.toBe("png:9:16");
    await expect(files["manifest.json"].async("text")).resolves.toContain('"ratio": "9:16"');
  });

  it("exports Douyin image packages for 3:4 with matching page geometry", async () => {
    const result = await exportDouyinImagePackage({
      content: articleContent(),
      ratio: "3:4",
      exportedAt,
      pages: [page("douyin", 1, "Douyin page", "3:4")],
      renderer: async ({ ratio, page: renderedPage }) => new Blob([`png:${ratio}:${renderedPage.canvas.width}x${renderedPage.canvas.height}`], { type: "image/png" }),
    });

    expect(result.output.ratio).toBe("3:4");
    expect(result.images[0]?.path).toBe("images/original-title-20260102-030405-douyin-3x4-01.png");

    const files = await zipEntries(result.zipBlob);
    await expect(files["images/original-title-20260102-030405-douyin-3x4-01.png"].async("text")).resolves.toBe("png:3:4:1080x1440");
    await expect(files["manifest.json"].async("text")).resolves.toContain('"ratio": "3:4"');
  });

  it("rejects Douyin image pages that do not match the selected ratio", async () => {
    await expect(
      exportDouyinImagePackage({
        content: articleContent(),
        ratio: "9:16",
        exportedAt,
        pages: [page("wrong-shape", 1, "Wrong page", "3:4")],
        renderer: async () => new Blob(["png"], { type: "image/png" }),
      }),
    ).rejects.toMatchObject({
      code: "card_page_ratio_mismatch",
      details: { pageId: "wrong-shape", expectedRatio: "9:16", actualRatio: "3:4", width: 1080, height: 1440 },
    });

    await expect(
      exportDouyinImagePackage({
        content: articleContent(),
        ratio: "3:4",
        exportedAt,
        pages: [page("wrong-shape", 1, "Wrong page", "9:16")],
        renderer: async () => new Blob(["png"], { type: "image/png" }),
      }),
    ).rejects.toMatchObject({
      code: "card_page_ratio_mismatch",
      details: { pageId: "wrong-shape", expectedRatio: "3:4", actualRatio: "9:16", width: 1080, height: 1920 },
    });
  });

  it("exports Douyin longform text from edited platform output", async () => {
    const result = exportDouyinLongformText({
      content: articleContent(),
      exportedAt,
      output: {
        platform: "douyinLongform",
        schemaVersion: 1,
        profileVersion: "1.0.0",
        source: { sourceSchemaVersion: 1, sourceTextFingerprint: "fixed", sourceFormat: "markdown", sourceTitle: "Edited", blockIds: [], blockCount: 0 },
        title: "Edited longform",
        intro: "Edited intro",
        body: "Edited body text",
        highlights: ["Edited highlight"],
        ending: "Edited ending",
        caption: "Edited caption",
        tags: ["longform"],
      },
    });

    expect(result.text).toContain("Edited body text");
    expect(result.text).toContain("Edited highlight");
    expect(result.text).toContain("Caption\nEdited caption");
    expect(result.textFile.path).toBe("edited-longform-20260102-030405-douyin-longform.txt");
    await expect(result.textFile.blob.text()).resolves.toContain("Caption\nEdited caption");
    expect(result.manifest.caption).toBe("Edited caption");
    await expect(result.manifestFile.blob.text()).resolves.toContain('"caption": "Edited caption"');
  });
});

describe("project backup export", () => {
  it("packages project JSON, assets manifest, assets, and strips secret-like keys", async () => {
    const project: ProjectDocument = {
      schemaVersion: 2,
      id: "project-1",
      title: "Backup Title",
      article: articleContent(),
      assets: [{ id: "asset-1", fileName: "Cover Image.png", mimeType: "image/png", byteLength: 7 }],
      platformVersions: {
        wechat: {
          content: "safe",
          apiKey: "sk-hidden",
          nested: { accessToken: "hidden-token", keep: "visible" },
        },
      },
      createdAt: exportedAt,
      updatedAt: exportedAt,
    };
    const assets: StoredAssetRecord[] = [
      {
        id: "asset-1",
        projectId: "project-1",
        fileName: "Cover Image.png",
        mimeType: "image/png",
        byteLength: 7,
        createdAt: exportedAt,
        blob: new Blob(["pngdata"], { type: "image/png" }),
      },
    ];

    const result = await exportProjectBackupPackage({ project, assets, exportedAt });
    const files = await zipEntries(result.zipBlob);

    expect(Object.keys(files).sort()).toEqual([
      "assets/",
      "assets/001-cover-image.png",
      "assets/manifest.json",
      "backup.json",
      "manifest.json",
      "project.json",
    ]);
    await expect(files["assets/001-cover-image.png"].async("text")).resolves.toBe("pngdata");

    const projectJson = await files["project.json"].async("text");
    expect(projectJson).toContain('"keep": "visible"');
    expect(projectJson).not.toContain("sk-hidden");
    expect(projectJson).not.toContain("hidden-token");
    expect(projectJson).not.toMatch(/apiKey|accessToken/);

    const assetManifest = JSON.parse(await files["assets/manifest.json"].async("text")) as Array<{ path: string }>;
    expect(assetManifest[0]?.path).toBe("assets/001-cover-image.png");
  });

  it("fails explicitly when a referenced project asset is absent from backup inputs", async () => {
    const project: ProjectDocument = {
      schemaVersion: 2,
      id: "project-1",
      title: "Backup Title",
      article: articleContent(),
      assets: [{ id: "asset-missing", fileName: "Missing.png", mimeType: "image/png", byteLength: 7 }],
      platformVersions: {},
      createdAt: exportedAt,
      updatedAt: exportedAt,
    };

    await expect(exportProjectBackupPackage({ project, assets: [], exportedAt })).rejects.toBeInstanceOf(ExportPackageError);
    await expect(exportProjectBackupPackage({ project, assets: [], exportedAt })).rejects.toMatchObject({
      code: "project_backup_asset_missing",
      details: { assetId: "asset-missing", fileName: "Missing.png" },
    });
  });

  it("fails explicitly when a referenced project asset cannot be loaded", async () => {
    const project: ProjectDocument = {
      schemaVersion: 2,
      id: "project-1",
      title: "Backup Title",
      article: articleContent(),
      assets: [{ id: "asset-broken", fileName: "Broken.png", mimeType: "image/png", byteLength: 7 }],
      platformVersions: {},
      createdAt: exportedAt,
      updatedAt: exportedAt,
    };
    const assetRepository: AssetBlobRepository = {
      saveImageBlob: async () => {
        throw new Error("unused");
      },
      getAssetBlob: async () => {
        throw new Error("idb failed");
      },
      listProjectAssets: async () => [],
      deleteAsset: async () => undefined,
      deleteUnreferencedAssets: async () => [],
      close: async () => undefined,
    };

    await expect(exportProjectBackupPackage({ project, assetRepository, exportedAt })).rejects.toMatchObject({
      code: "project_backup_asset_unavailable",
      details: { assetId: "asset-broken", fileName: "Broken.png", cause: "idb failed" },
    });
  });
});
