import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import type { UnifiedArticleContent } from "../content";
import type { CardLayoutPage } from "../renderers/cards";
import type { ProjectDocument, StoredAssetRecord } from "../storage";
import {
  createExportBaseName,
  exportDouyinImagePackage,
  exportDouyinLongformText,
  exportProjectBackupPackage,
  exportWechatHtml,
  exportXiaohongshuPackage,
} from "./index";

const exportedAt = "2026-01-02T03:04:05.000Z";

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

function page(id: string, pageNumber: number, text: string): CardLayoutPage {
  return {
    id,
    pageNumber,
    totalPages: 2,
    aspectRatio: "3:4",
    canvas: { width: 1080, height: 1440 },
    safeArea: { top: 100, right: 100, bottom: 100, left: 100, x: 100, y: 100, width: 880, height: 1240 },
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

  it("exports Douyin image packages for 9:16 with caption copy and tags", async () => {
    const result = await exportDouyinImagePackage({
      content: articleContent(),
      ratio: "9:16",
      exportedAt,
      pages: [page("douyin", 1, "Douyin page")],
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
    expect(result.textFile.path).toBe("edited-longform-20260102-030405-douyin-longform.txt");
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
});
