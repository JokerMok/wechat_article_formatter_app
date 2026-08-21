import JSZip from "jszip";
import { copyRichText, type CopyRichTextResult } from "../copy-rich-text";
import type { UnifiedArticleContent } from "../content";
import { toDouyinImageText, toDouyinLongform, type DouyinImageOutput, type DouyinImageRatio, type DouyinLongformOutput } from "../platforms/douyin";
import { createWechatPlatformContent, type WechatPlatformContent } from "../platforms/wechat";
import { toXiaohongshuImageText, type XiaohongshuImageTextOutput } from "../platforms/xiaohongshu";
import { drawCardImagePage, layoutCardPages, type CardAspectRatio, type CardImageCanvasContext, type CardLayoutPage, type CardLayoutOptions, type TextMeasurer } from "../renderers/cards";
import type { WechatImageNode } from "../renderers/wechat";
import { createProjectBackupPayload, type AssetBlobRepository, type ProjectDocument, type StoredAssetMetadata, type StoredAssetRecord } from "../storage";

export type ExportedFile = {
  name: string;
  path: string;
  mimeType: string;
  blob: Blob;
};

export type ExportTimestamp = string | Date;

export type CardPageRenderInput = {
  page: CardLayoutPage;
  platform: "xiaohongshu" | "douyinImage";
  ratio: CardAspectRatio;
  fileName: string;
  pageIndex: number;
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

function buildXiaohongshuCopy(output: XiaohongshuImageTextOutput) {
  return [output.title, output.body, buildTagsText(output.tags)].filter(Boolean).join("\n\n");
}

function buildDouyinImageCopy(output: DouyinImageOutput) {
  return [output.caption, buildTagsText(output.tags)].filter(Boolean).join("\n\n");
}

function buildDouyinLongformText(output: DouyinLongformOutput) {
  const highlights = output.highlights.length ? ["Highlights", ...output.highlights.map((item) => `- ${item}`)].join("\n") : "";
  return [output.title, output.intro, output.body, highlights, output.ending, buildTagsText(output.tags)].filter(Boolean).join("\n\n");
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

async function renderBrowserCardPageToPng(input: CardPageRenderInput): Promise<Blob> {
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

  drawCardImagePage(context as unknown as CardImageCanvasContext, input.page);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("card_canvas_blob_unavailable"));
    }, "image/png");
  });
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
}) {
  const renderer = input.renderer ?? renderBrowserCardPageToPng;
  const files: ExportedFile[] = [];
  for (const [index, page] of input.pages.entries()) {
    const fileName = `${input.baseName}-${String(index + 1).padStart(2, "0")}.png`;
    const blob = await renderer({
      page,
      platform: input.platform,
      ratio: input.ratio,
      fileName,
      pageIndex: index,
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

export async function exportXiaohongshuPackage(input: {
  content: UnifiedArticleContent;
  output?: XiaohongshuImageTextOutput;
  pages?: CardLayoutPage[];
  renderer?: CardPageRenderer;
  layoutOptions?: CardLayoutOptions;
  measurer?: TextMeasurer;
  exportedAt?: ExportTimestamp;
}): Promise<PlatformImageExportResult<XiaohongshuImageTextOutput>> {
  const output = input.output ?? toXiaohongshuImageText(input.content);
  const exportedAt = toExportedAt(input.exportedAt);
  const baseName = createExportBaseName(output.title, exportedAt, "xiaohongshu");
  const pages = resolveCardPages({ content: input.content, ratio: "3:4", pages: input.pages, layoutOptions: input.layoutOptions, measurer: input.measurer });
  const images = await renderImageFiles({ pages, platform: "xiaohongshu", ratio: "3:4", baseName, renderer: input.renderer });
  const copyText = buildXiaohongshuCopy(output);
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
  pages?: CardLayoutPage[];
  renderer?: CardPageRenderer;
  layoutOptions?: CardLayoutOptions;
  measurer?: TextMeasurer;
  exportedAt?: ExportTimestamp;
}): Promise<PlatformImageExportResult<DouyinImageOutput>> {
  const output = input.output ?? toDouyinImageText(input.content, { ratio: input.ratio });
  const exportedAt = toExportedAt(input.exportedAt);
  const baseName = createExportBaseName(output.title, exportedAt, `douyin-${output.ratio.replace(":", "x")}`);
  const pages = resolveCardPages({ content: input.content, ratio: output.ratio, pages: input.pages, layoutOptions: input.layoutOptions, measurer: input.measurer });
  const images = await renderImageFiles({ pages, platform: "douyinImage", ratio: output.ratio, baseName, renderer: input.renderer });
  const copyText = buildDouyinImageCopy(output);
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

    if (!input.assetRepository) continue;
    const loaded = await input.assetRepository.getAssetBlob(assetRef.id);
    if (loaded.state === "ready") {
      records.push({
        ...loaded.asset,
        blob: loaded.blob,
      });
    }
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
