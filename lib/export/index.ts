import JSZip from "jszip";
import { copyRichText, type CopyRichTextResult } from "../copy-rich-text";
import type { UnifiedArticleContent } from "../content";
import { toDouyinImageText, toDouyinLongform, type DouyinImageOutput, type DouyinImageRatio, type DouyinLongformOutput } from "../platforms/douyin";
import { createWechatPlatformContent, type WechatPlatformContent } from "../platforms/wechat";
import { toXiaohongshuImageText, type XiaohongshuImageTextOutput } from "../platforms/xiaohongshu";
import {
  drawCardImagePage,
  drawDouyinImagePage,
  drawXiaohongshuImagePage,
  layoutCardPages,
  type CardAspectRatio,
  type CardImageCanvasContext,
  type CardLayoutPage,
  type CardLayoutOptions,
  type DrawCardImagePageOptions,
  type TextMeasurer,
} from "../renderers/cards";
import type { WechatImageNode } from "../renderers/wechat";
import { createProjectBackupPayload, type AssetBlobRepository, type ProjectDocument, type StoredAssetMetadata, type StoredAssetRecord } from "../storage";

export type ExportedFile = {
  name: string;
  path: string;
  mimeType: string;
  blob: Blob;
};

export type ExportTimestamp = string | Date;

export type CardRenderImages = NonNullable<DrawCardImagePageOptions["images"]>;
export type CardRenderPreset = NonNullable<DrawCardImagePageOptions["preset"]>;

export type CardPageRenderInput = {
  page: CardLayoutPage;
  platform: "xiaohongshu" | "douyinImage";
  ratio: CardAspectRatio;
  fileName: string;
  pageIndex: number;
  images?: CardRenderImages;
  preset?: CardRenderPreset;
};

export type CardPageRenderer = (input: CardPageRenderInput) => Promise<Blob>;

export type PlatformImageExportManifest = {
  schemaVersion: 1;
  platform: "xiaohongshu" | "douyinImage";
  exportedAt: string;
  title: string;
  ratio: CardAspectRatio;
  pageCount: number;
  imageFiles: string[];
  copyFile: string;
  tagsFile: string;
  source: unknown;
};

export type PlatformImageExportResult<TOutput> = {
  output: TOutput;
  manifest: PlatformImageExportManifest;
  images: ExportedFile[];
  primaryImage?: ExportedFile;
  copyText: string;
  tagsText: string;
  zipBlob: Blob;
};

export type DouyinLongformExportManifest = {
  schemaVersion: 1;
  platform: "douyinLongform";
  exportedAt: string;
  title: string;
  caption: string;
  textFile: string;
  tagsFile: string;
  source: unknown;
};

export type DouyinLongformExportResult = {
  output: DouyinLongformOutput;
  manifest: DouyinLongformExportManifest;
  text: string;
  textFile: ExportedFile;
  tagsFile: ExportedFile;
  manifestFile: ExportedFile;
};

export type WechatHtmlExportResult = {
  html: string;
  text: string;
  images: WechatPlatformContent["images"];
  htmlFile: ExportedFile;
};

export type ProjectBackupManifest = {
  schemaVersion: 1;
  packageType: "projectBackup";
  exportedAt: string;
  projectId: string;
  projectFile: "project.json";
  assetManifestFile: "assets/manifest.json";
  assetCount: number;
  assets: Array<StoredAssetMetadata & { path: string }>;
};

export type ProjectBackupExportResult = {
  manifest: ProjectBackupManifest;
  projectFile: ExportedFile;
  assetManifestFile: ExportedFile;
  assetFiles: ExportedFile[];
  zipBlob: Blob;
};

export type ExportPackageErrorCode = "card_page_ratio_mismatch" | "card_image_source_unavailable" | "project_backup_asset_missing" | "project_backup_asset_unavailable";

export class ExportPackageError extends Error {
  readonly code: ExportPackageErrorCode;
  readonly details: Record<string, unknown>;

  constructor(code: ExportPackageErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "ExportPackageError";
    this.code = code;
    this.details = details;
  }
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const ZIP_FILE_DATE = new Date("1980-01-01T00:00:00.000Z");

function toExportedAt(value?: ExportTimestamp) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

export function slugifyExportName(value: string | undefined, fallback = "untitled") {
  const slug = (value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return slug || fallback;
}

export function portableArchiveName(value: string | undefined, fallback = "content") {
  const portable = (value ?? "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]+/g, "-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .toLowerCase();
  return portable || fallback;
}

export function formatExportTimestamp(value: ExportTimestamp) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    "-",
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join("");
}

export function createExportBaseName(title: string | undefined, exportedAt: ExportTimestamp, suffix?: string) {
  return [slugifyExportName(title), formatExportTimestamp(exportedAt), suffix].filter(Boolean).join("-");
}

function textBlob(text: string, mimeType = "text/plain;charset=utf-8") {
  return new Blob([text], { type: mimeType });
}

function jsonBlob(value: unknown) {
  return textBlob(`${JSON.stringify(value, null, 2)}\n`, "application/json;charset=utf-8");
}

function exportedFile(path: string, blob: Blob, mimeType = blob.type || "application/octet-stream"): ExportedFile {
  const parts = path.split("/");
  return {
    name: parts[parts.length - 1] ?? path,
    path,
    mimeType,
    blob,
  };
}

async function createZipBlob(files: ExportedFile[]) {
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.path, await file.blob.arrayBuffer(), {
      binary: true,
      date: ZIP_FILE_DATE,
    });
  }
  return zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    mimeType: "application/zip",
  });
}

function buildTagsText(tags: string[]) {
  return tags.map((tag) => `#${tag.replace(/^#/, "")}`).join(" ");
}

function appendMissingTags(copy: string, tags: string[]) {
  const existingTags = new Set(
    [...copy.matchAll(/#([^\s#]+)/gu)].map((match) => match[1]?.replace(/[，。,.；;！!？?]+$/u, "").trim()).filter(Boolean),
  );
  const missingTags = tags.filter((tag) => {
    const normalized = tag.replace(/^#/, "").trim();
    return normalized && !existingTags.has(normalized);
  });
  return [copy.trim(), buildTagsText(missingTags)].filter(Boolean).join("\n\n");
}

function buildXiaohongshuCopy(output: XiaohongshuImageTextOutput) {
  const publishingCopy = output.caption?.trim() || [output.title, output.body].filter(Boolean).join("\n\n");
  return appendMissingTags(publishingCopy, output.tags);
}

function buildDouyinImageCopy(output: DouyinImageOutput) {
  return appendMissingTags(output.caption, output.tags);
}

function buildDouyinLongformText(output: DouyinLongformOutput) {
  const highlights = output.highlights.length ? ["Highlights", ...output.highlights.map((item) => `- ${item}`)].join("\n") : "";
  const caption = output.caption ? ["Caption", output.caption].join("\n") : "";
  return [output.title, output.intro, output.body, highlights, output.ending, caption, buildTagsText(output.tags)].filter(Boolean).join("\n\n");
}

function secretLikeKey(key: string) {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return ["apikey", "secret", "token", "password", "authorization", "credential"].some((marker) => normalized.includes(marker));
}

export function sanitizeExportData(value: unknown): JsonValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Blob) return "[blob omitted]";
  if (Array.isArray(value)) return value.map((item) => sanitizeExportData(item));
  if (typeof value !== "object") return String(value);

  const clean: { [key: string]: JsonValue } = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (secretLikeKey(key)) continue;
    clean[key] = sanitizeExportData(item);
  }
  return clean;
}

export function exportWechatHtml(input: {
  content?: UnifiedArticleContent;
  wechatContent?: WechatPlatformContent;
  imageNodes?: WechatImageNode[];
  title?: string;
  exportedAt?: ExportTimestamp;
}): WechatHtmlExportResult {
  if (!input.wechatContent && !input.content) {
    throw new Error("wechat_export_requires_content");
  }

  const exportedAt = toExportedAt(input.exportedAt);
  const wechatContent = input.wechatContent ?? createWechatPlatformContent(input.content as UnifiedArticleContent, { imageNodes: input.imageNodes });
  const baseName = createExportBaseName(input.title ?? wechatContent.title, exportedAt, "wechat");
  const htmlFile = exportedFile(`${baseName}.html`, textBlob(wechatContent.html, "text/html;charset=utf-8"), "text/html;charset=utf-8");
  return {
    html: wechatContent.html,
    text: wechatContent.text,
    images: wechatContent.images,
    htmlFile,
  };
}

export async function copyWechatRichText(input: {
  content?: UnifiedArticleContent;
  wechatContent?: WechatPlatformContent;
}): Promise<CopyRichTextResult> {
  return copyRichText(exportWechatHtml(input).html);
}

async function renderCanvasPageToPng(input: CardPageRenderInput, drawPage: typeof drawCardImagePage): Promise<Blob> {
  if (typeof document === "undefined") {
    throw new Error("card_canvas_unavailable");
  }

  const canvas = document.createElement("canvas");
  canvas.width = input.page.canvas.width;
  canvas.height = input.page.canvas.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("card_canvas_context_unavailable");
  }

  drawPage(context as unknown as CardImageCanvasContext, input.page, { images: input.images, preset: input.preset });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("card_canvas_blob_unavailable"));
    }, "image/png");
  });
}

async function renderXiaohongshuPageToPng(input: CardPageRenderInput) {
  return renderCanvasPageToPng(input, drawXiaohongshuImagePage);
}

async function renderDouyinImagePageToPng(input: CardPageRenderInput) {
  return renderCanvasPageToPng(input, drawDouyinImagePage);
}

function isSafeCardImageSrc(src: string) {
  return /^(https?:\/\/|blob:|data:image\/(?:png|jpe?g|gif|webp);base64,)/i.test(src.trim());
}

function summarizeImageSrc(src: string) {
  const trimmed = src.trim();
  if (trimmed.startsWith("data:")) {
    const mimeType = trimmed.match(/^data:([^;,]+)/i)?.[1] ?? "data";
    return `${mimeType} data URL`;
  }
  return trimmed.slice(0, 120);
}

function parseMarkdownImageSrc(value: string) {
  const match = value.match(/!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/);
  return match?.[1]?.trim();
}

function getContentImageSources(content: UnifiedArticleContent) {
  const sources = new Map<string, string>();
  for (const block of content.blocks) {
    if (block.type !== "image") continue;
    const candidates = [block.source.sourceText, block.markdown, block.text, block.plainText];
    const src = candidates.map(parseMarkdownImageSrc).find((candidate): candidate is string => Boolean(candidate));
    if (src && isSafeCardImageSrc(src)) {
      sources.set(block.id, src.trim());
    }
  }
  return sources;
}

function requiredCardImageKeys(pages: CardLayoutPage[]) {
  const keys = new Set<string>();
  for (const page of pages) {
    for (const node of page.nodes) {
      if (node.kind === "image" && node.image) {
        keys.add(node.blockId);
      }
    }
  }
  return keys;
}

function assertCardImagesCoverPages(pages: CardLayoutPage[], images: CardRenderImages) {
  for (const blockId of requiredCardImageKeys(pages)) {
    if (!images[blockId]) {
      throw new ExportPackageError(
        "card_image_source_unavailable",
        `Card image block ${blockId} has no renderable image source. Provide input.images for that block before exporting PNG cards.`,
        { blockId, reason: "missing_input_image" },
      );
    }
  }
}

async function loadCardImage(src: string, blockId: string) {
  if (typeof Image === "undefined") {
    throw new ExportPackageError(
      "card_image_source_unavailable",
      `Card image block ${blockId} references ${summarizeImageSrc(src)}, but this environment cannot create browser images. Provide input.images or run the PNG export in a browser.`,
      { blockId, source: summarizeImageSrc(src), reason: "image_loader_unavailable" },
    );
  }

  return new Promise<CanvasImageSource>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => {
      reject(
        new ExportPackageError(
          "card_image_source_unavailable",
          `Card image block ${blockId} could not load ${summarizeImageSrc(src)}. Provide input.images with a loaded image or remove the image block before exporting PNG cards.`,
          { blockId, source: summarizeImageSrc(src), reason: "image_load_failed" },
        ),
      );
    };
    if (/^https?:\/\//i.test(src)) {
      image.crossOrigin = "anonymous";
    }
    image.src = src;
  });
}

async function resolveCardRenderImages(input: { content: UnifiedArticleContent; pages: CardLayoutPage[]; images?: CardRenderImages }) {
  if (input.images) {
    assertCardImagesCoverPages(input.pages, input.images);
    return input.images;
  }

  const required = requiredCardImageKeys(input.pages);
  if (!required.size) return undefined;

  const contentSources = getContentImageSources(input.content);
  const images: CardRenderImages = {};
  for (const blockId of required) {
    const src = contentSources.get(blockId);
    if (!src) {
      throw new ExportPackageError(
        "card_image_source_unavailable",
        `Card image block ${blockId} has no supported Markdown/data image source. Provide input.images for that block before exporting PNG cards.`,
        { blockId, reason: "missing_supported_content_image" },
      );
    }
    images[blockId] = await loadCardImage(src, blockId);
  }

  return images;
}

function resolveCardPages(input: {
  content: UnifiedArticleContent;
  ratio: CardAspectRatio;
  pages?: CardLayoutPage[];
  layoutOptions?: CardLayoutOptions;
  measurer?: TextMeasurer;
}) {
  return input.pages ?? layoutCardPages(input.content, input.measurer, { ...input.layoutOptions, aspectRatio: input.ratio }).pages;
}

async function renderImageFiles(input: {
  pages: CardLayoutPage[];
  platform: "xiaohongshu" | "douyinImage";
  ratio: CardAspectRatio;
  baseName: string;
  renderer?: CardPageRenderer;
  images?: CardRenderImages;
  preset?: CardRenderPreset;
}) {
  const renderer = input.renderer ?? (input.platform === "xiaohongshu" ? renderXiaohongshuPageToPng : renderDouyinImagePageToPng);
  const files: ExportedFile[] = [];
  const portableBaseName = portableArchiveName(input.baseName);
  for (const [index, page] of input.pages.entries()) {
    const fileName = `${portableBaseName}-${String(index + 1).padStart(2, "0")}.png`;
    const blob = await renderer({
      page,
      platform: input.platform,
      ratio: input.ratio,
      fileName,
      pageIndex: index,
      images: input.images,
      preset: input.preset,
    });
    files.push(exportedFile(`images/${fileName}`, blob, "image/png"));
  }
  return files;
}

async function packagePlatformImageExport<TOutput extends { title: string; tags: string[]; source: unknown }>(input: {
  output: TOutput;
  platform: "xiaohongshu" | "douyinImage";
  ratio: CardAspectRatio;
  exportedAt: string;
  images: ExportedFile[];
  copyText: string;
}) {
  const copyFile = exportedFile("copy.txt", textBlob(input.copyText));
  const tagsFile = exportedFile("tags.txt", textBlob(buildTagsText(input.output.tags)));
  const manifest: PlatformImageExportManifest = {
    schemaVersion: 1,
    platform: input.platform,
    exportedAt: input.exportedAt,
    title: input.output.title,
    ratio: input.ratio,
    pageCount: input.images.length,
    imageFiles: input.images.map((file) => file.path),
    copyFile: copyFile.path,
    tagsFile: tagsFile.path,
    source: input.output.source,
  };
  const manifestFile = exportedFile("manifest.json", jsonBlob(manifest), "application/json;charset=utf-8");
  const zipBlob = await createZipBlob([...input.images, copyFile, tagsFile, manifestFile]);
  return {
    manifest,
    zipBlob,
    tagsText: await tagsFile.blob.text(),
  };
}

function expectedRatioValue(ratio: CardAspectRatio) {
  return ratio === "3:4" ? 3 / 4 : 9 / 16;
}

function assertPagesMatchRatio(pages: CardLayoutPage[], ratio: CardAspectRatio) {
  const expected = expectedRatioValue(ratio);
  for (const page of pages) {
    const actual = page.canvas.width / page.canvas.height;
    if (page.aspectRatio !== ratio || Math.abs(actual - expected) > 0.001) {
      throw new ExportPackageError(
        "card_page_ratio_mismatch",
        `Card page ${page.id} is ${page.aspectRatio} (${page.canvas.width}x${page.canvas.height}); export requires ${ratio}. Regenerate pages for ${ratio} or omit pages so export can lay them out.`,
        {
          pageId: page.id,
          expectedRatio: ratio,
          actualRatio: page.aspectRatio,
          width: page.canvas.width,
          height: page.canvas.height,
        },
      );
    }
  }
}

export async function exportXiaohongshuPackage(input: {
  content: UnifiedArticleContent;
  output?: XiaohongshuImageTextOutput;
  editedCopy?: { title: string; caption?: string; tags: string[] };
  pages?: CardLayoutPage[];
  renderer?: CardPageRenderer;
  images?: CardRenderImages;
  layoutOptions?: CardLayoutOptions;
  measurer?: TextMeasurer;
  exportedAt?: ExportTimestamp;
  preset?: CardRenderPreset;
}): Promise<PlatformImageExportResult<XiaohongshuImageTextOutput>> {
  const output = { ...(input.output ?? toXiaohongshuImageText(input.content)), ...(input.editedCopy ? { title: input.editedCopy.title, tags: input.editedCopy.tags } : {}) };
  const exportedAt = toExportedAt(input.exportedAt);
  const baseName = createExportBaseName(output.title, exportedAt, "xiaohongshu");
  const pages = resolveCardPages({ content: input.content, ratio: "3:4", pages: input.pages, layoutOptions: input.layoutOptions, measurer: input.measurer });
  assertPagesMatchRatio(pages, "3:4");
  const renderImages = await resolveCardRenderImages({ content: input.content, pages, images: input.images });
  const images = await renderImageFiles({ pages, platform: "xiaohongshu", ratio: "3:4", baseName, renderer: input.renderer, images: renderImages, preset: input.preset });
  const copyText = input.editedCopy?.caption ?? buildXiaohongshuCopy(output);
  const packaged = await packagePlatformImageExport({ output, platform: "xiaohongshu", ratio: "3:4", exportedAt, images, copyText });
  return {
    output,
    manifest: packaged.manifest,
    images,
    primaryImage: images[0],
    copyText,
    tagsText: packaged.tagsText,
    zipBlob: packaged.zipBlob,
  };
}

export async function exportDouyinImagePackage(input: {
  content: UnifiedArticleContent;
  ratio?: DouyinImageRatio;
  output?: DouyinImageOutput;
  editedCopy?: { title: string; caption?: string; tags: string[] };
  pages?: CardLayoutPage[];
  renderer?: CardPageRenderer;
  images?: CardRenderImages;
  layoutOptions?: CardLayoutOptions;
  measurer?: TextMeasurer;
  exportedAt?: ExportTimestamp;
  preset?: CardRenderPreset;
}): Promise<PlatformImageExportResult<DouyinImageOutput>> {
  const output = { ...(input.output ?? toDouyinImageText(input.content, { ratio: input.ratio })), ...(input.editedCopy ? { title: input.editedCopy.title, tags: input.editedCopy.tags } : {}) };
  const exportedAt = toExportedAt(input.exportedAt);
  const baseName = createExportBaseName(output.title, exportedAt, `douyin-${output.ratio.replace(":", "x")}`);
  const pages = resolveCardPages({ content: input.content, ratio: output.ratio, pages: input.pages, layoutOptions: input.layoutOptions, measurer: input.measurer });
  assertPagesMatchRatio(pages, output.ratio);
  const renderImages = await resolveCardRenderImages({ content: input.content, pages, images: input.images });
  const images = await renderImageFiles({ pages, platform: "douyinImage", ratio: output.ratio, baseName, renderer: input.renderer, images: renderImages, preset: input.preset });
  const copyText = input.editedCopy?.caption ?? buildDouyinImageCopy(output);
  const packaged = await packagePlatformImageExport({ output, platform: "douyinImage", ratio: output.ratio, exportedAt, images, copyText });
  return {
    output,
    manifest: packaged.manifest,
    images,
    primaryImage: images[0],
    copyText,
    tagsText: packaged.tagsText,
    zipBlob: packaged.zipBlob,
  };
}

export function exportDouyinLongformText(input: {
  content: UnifiedArticleContent;
  output?: DouyinLongformOutput;
  exportedAt?: ExportTimestamp;
}): DouyinLongformExportResult {
  const output = input.output ?? toDouyinLongform(input.content);
  const exportedAt = toExportedAt(input.exportedAt);
  const baseName = createExportBaseName(output.title, exportedAt, "douyin-longform");
  const text = buildDouyinLongformText(output);
  const textFile = exportedFile(`${baseName}.txt`, textBlob(text));
  const tagsFile = exportedFile(`${baseName}-tags.txt`, textBlob(buildTagsText(output.tags)));
  const manifest: DouyinLongformExportManifest = {
    schemaVersion: 1,
    platform: "douyinLongform",
    exportedAt,
    title: output.title,
    caption: output.caption,
    textFile: textFile.path,
    tagsFile: tagsFile.path,
    source: output.source,
  };
  const manifestFile = exportedFile(`${baseName}-manifest.json`, jsonBlob(manifest), "application/json;charset=utf-8");
  return {
    output,
    manifest,
    text,
    textFile,
    tagsFile,
    manifestFile,
  };
}

function assetFileExtension(mimeType: string) {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/webp") return ".webp";
  return ".png";
}

function safeAssetFileName(asset: StoredAssetMetadata, index: number) {
  const rawName = asset.fileName.trim() || `${asset.id}${assetFileExtension(asset.mimeType)}`;
  const dotIndex = rawName.lastIndexOf(".");
  const baseName = dotIndex > 0 ? rawName.slice(0, dotIndex) : rawName;
  const extension = dotIndex > 0 ? rawName.slice(dotIndex).toLowerCase() : assetFileExtension(asset.mimeType);
  return `${String(index + 1).padStart(3, "0")}-${slugifyExportName(baseName, asset.id)}${extension}`;
}

async function resolveAssetRecords(input: {
  project: ProjectDocument;
  assets?: StoredAssetRecord[];
  assetRepository?: AssetBlobRepository;
}) {
  const provided = new Map((input.assets ?? []).map((asset) => [asset.id, asset]));
  const records: StoredAssetRecord[] = [];

  for (const assetRef of input.project.assets) {
    const providedRecord = provided.get(assetRef.id);
    if (providedRecord) {
      records.push(providedRecord);
      continue;
    }

    if (!input.assetRepository) {
      throw new ExportPackageError("project_backup_asset_missing", `Project backup is missing referenced asset ${assetRef.id}.`, {
        assetId: assetRef.id,
        fileName: assetRef.fileName,
      });
    }

    let loaded;
    try {
      loaded = await input.assetRepository.getAssetBlob(assetRef.id);
    } catch (error) {
      throw new ExportPackageError("project_backup_asset_unavailable", `Project backup could not load referenced asset ${assetRef.id}.`, {
        assetId: assetRef.id,
        fileName: assetRef.fileName,
        cause: error instanceof Error ? error.message : String(error),
      });
    }
    if (loaded.state === "ready") {
      records.push({
        ...loaded.asset,
        blob: loaded.blob,
      });
      continue;
    }

    throw new ExportPackageError("project_backup_asset_missing", `Project backup is missing referenced asset ${assetRef.id}.`, {
      assetId: assetRef.id,
      fileName: assetRef.fileName,
    });
  }

  return records;
}

export async function exportProjectBackupPackage(input: {
  project: ProjectDocument;
  assets?: StoredAssetRecord[];
  assetRepository?: AssetBlobRepository;
  exportedAt?: ExportTimestamp;
}): Promise<ProjectBackupExportResult> {
  const exportedAt = toExportedAt(input.exportedAt);
  const assetRecords = await resolveAssetRecords(input);
  const sanitizedProject = sanitizeExportData(input.project);
  const projectFile = exportedFile("project.json", jsonBlob(sanitizedProject), "application/json;charset=utf-8");
  const assetFiles = assetRecords.map((asset, index) => exportedFile(`assets/${safeAssetFileName(asset, index)}`, asset.blob, asset.mimeType));
  const assetsWithPaths = assetRecords.map((asset, index) => {
    const metadata: StoredAssetMetadata = {
      id: asset.id,
      projectId: asset.projectId,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      byteLength: asset.byteLength,
      crop: asset.crop,
      createdAt: asset.createdAt,
    };
    return {
      ...metadata,
      path: assetFiles[index]?.path ?? `assets/${safeAssetFileName(asset, index)}`,
    };
  });
  const assetManifestFile = exportedFile("assets/manifest.json", jsonBlob(assetsWithPaths), "application/json;charset=utf-8");
  const manifest: ProjectBackupManifest = {
    schemaVersion: 1,
    packageType: "projectBackup",
    exportedAt,
    projectId: input.project.id,
    projectFile: "project.json",
    assetManifestFile: "assets/manifest.json",
    assetCount: assetFiles.length,
    assets: assetsWithPaths,
  };
  const manifestFile = exportedFile("manifest.json", jsonBlob(manifest), "application/json;charset=utf-8");
  const backupPayloadFile = exportedFile(
    "backup.json",
    jsonBlob(
      createProjectBackupPayload({
        projects: [sanitizeExportData(input.project) as unknown as ProjectDocument],
        unknownProjects: [],
        assets: assetsWithPaths,
        exportedAt,
      }),
    ),
    "application/json;charset=utf-8",
  );
  const zipBlob = await createZipBlob([manifestFile, projectFile, assetManifestFile, backupPayloadFile, ...assetFiles]);
  return {
    manifest,
    projectFile,
    assetManifestFile,
    assetFiles,
    zipBlob,
  };
}
