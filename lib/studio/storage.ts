import { scopedStorageName } from "../accounts/browser";
import { protectWorkspaceStorage } from "../accounts/encrypted-storage";
import Dexie, { type Table } from "dexie";
import type {
  ArticleDocument,
  ArticleRevision,
  CoverDocument,
  CoverStyle,
  StudioAsset,
  StyleProfile,
} from "./types";
import { uid, styleProfileSchema } from "./types";
import { allBuiltInStyles, builtInStyles } from "./styles";

export type StoredStyle = StyleProfile & { key: string; deletedAt?: string };

export class StudioDatabase extends Dexie {
  articles!: Table<ArticleDocument>;
  revisions!: Table<ArticleRevision>;
  styles!: Table<StoredStyle>;
  assets!: Table<StudioAsset>;
  covers!: Table<CoverDocument>;
  coverStyles!: Table<CoverStyle>;
  constructor() {
    super(scopedStorageName("wechat-style-studio-v1"));
    this.version(1).stores({
      articles: "id,updatedAt",
      revisions: "id,articleId,savedAt",
      styles: "key,id,version",
      assets: "id",
      covers: "id,articleId",
      coverStyles: "id",
    });
    protectWorkspaceStorage(this);
  }
}
let instance: StudioDatabase | undefined;
export function studioDB() {
  return (instance ??= new StudioDatabase());
}
export async function saveArticle(document: ArticleDocument) {
  const db = studioDB();
  return db.transaction("rw", db.articles, db.revisions, async () => {
    const previous = await db.articles.get(document.id);
    if (previous?.deletedAt) return previous;
    if (
      !document.styleSnapshot &&
      previous?.styleSnapshot &&
      previous.styleId === document.styleId &&
      previous.styleVersion === document.styleVersion
    )
      document = { ...document, styleSnapshot: previous.styleSnapshot };
    await db.articles.put(document);
    if (
      previous &&
      JSON.stringify({ ...previous, updatedAt: "" }) ===
        JSON.stringify({ ...document, updatedAt: "" })
    )
      return document;
    await db.revisions.add({
      id: uid("rev"),
      articleId: document.id,
      savedAt: document.updatedAt,
      document,
    });
    const revisions = await db.revisions
      .where("articleId")
      .equals(document.id)
      .sortBy("savedAt");
    if (revisions.length > 30)
      await db.revisions.bulkDelete(revisions.slice(0, -30).map((r) => r.id));
    return document;
  });
}
export async function setArticleTrash(ids: string[], deleted: boolean) {
  const db = studioDB();
  const now = new Date().toISOString();
  await db.transaction("rw", db.articles, async () => {
    const rows = (await db.articles.bulkGet(ids)).filter(
      (row): row is ArticleDocument =>
        !!row && Boolean(row.deletedAt) !== deleted,
    );
    await db.articles.bulkPut(
      rows.map((row) => ({
        ...row,
        deletedAt: deleted ? now : undefined,
      })),
    );
  });
}
export async function renameArticle(id: string, name: string) {
  const db = studioDB();
  return db.transaction("rw", db.articles, db.revisions, async () => {
    const row = await db.articles.get(id);
    if (!row || row.deletedAt) throw new Error("找不到这篇稿件。");
    return saveArticle({ ...row, name, updatedAt: new Date().toISOString() });
  });
}
export async function copyArticle(id: string) {
  const db = studioDB();
  return db.transaction(
    "rw",
    db.articles,
    db.revisions,
    db.covers,
    db.styles,
    async () => {
      const source = await db.articles.get(id);
      if (!source || source.deletedAt) throw new Error("找不到这篇稿件。");
      const cover = source.coverId
        ? await db.covers.get(source.coverId)
        : await db.covers.where("articleId").equals(id).first();
      const doc: ArticleDocument = {
        ...source,
        id: uid("article"),
        name: `${source.name.slice(0, 74)} · 副本`,
        coverId: undefined,
        styleSnapshot:
          source.styleSnapshot ??
          styleProfileSchema.parse(
            (await db.styles.get(`${source.styleId}:${source.styleVersion}`)) ??
              allBuiltInStyles.find(
                (p) =>
                  p.id === source.styleId && p.version === source.styleVersion,
              ) ??
              builtInStyles[0],
          ),
        updatedAt: new Date().toISOString(),
      };
      if (cover) {
        doc.coverId = uid("cover");
        await db.covers.add({ ...cover, id: doc.coverId, articleId: doc.id });
      }
      return saveArticle(doc);
    },
  );
}
export async function saveStyle(profile: StyleProfile) {
  const parsed = styleProfileSchema.safeParse(profile);
  if (!parsed.success)
    throw new Error("风格参数不符合范围，请检查名称、标签、字号和间距后保存。");
  profile = parsed.data;
  const db = studioDB();
  return db.transaction("rw", db.styles, async () => {
    const versions = await db.styles.where("id").equals(profile.id).toArray();
    if (versions.some((v) => v.deletedAt))
      throw new Error("此风格已删除，请另存为新风格。");
    const builtin = builtInStyles.find((p) => p.id === profile.id);
    const version =
      Math.max(builtin?.version ?? 0, ...versions.map((v) => v.version)) + 1;
    const next = { ...profile, version };
    await db.styles.add({ ...next, key: `${next.id}:${version}` });
    return next;
  });
}
export async function deleteStyle(id: string) {
  if (id.startsWith("builtin-")) throw new Error("内置风格不可删除。");
  const db = studioDB();
  await db.transaction("rw", db.articles, db.styles, async () => {
    const rows = await db.styles.where("id").equals(id).toArray();
    const versions = new Map(
      rows.map((row) => [row.version, styleProfileSchema.parse(row)]),
    );
    const docs = (await db.articles.toArray()).filter(
      (doc) =>
        doc.styleId === id &&
        !doc.styleSnapshot &&
        versions.has(doc.styleVersion),
    );
    await db.articles.bulkPut(
      docs.map((doc) => ({
        ...doc,
        styleSnapshot: versions.get(doc.styleVersion),
      })),
    );
    const now = new Date().toISOString();
    await db.styles.bulkPut(
      rows.map((row) => ({ ...row, deletedAt: row.deletedAt ?? now })),
    );
  });
}
export async function latestStyles() {
  const versions = await studioDB().styles.toArray();
  const map = new Map<string, StyleProfile>();
  for (const v of versions)
    if (!v.deletedAt && (map.get(v.id)?.version ?? 0) < v.version)
      map.set(v.id, v);
  return [...map.values()];
}
export async function storeImage(
  file: File,
  rights: StudioAsset["rights"] = "owned",
): Promise<StudioAsset> {
  if (
    !/image\/(png|jpeg|webp|gif)/.test(file.type) ||
    file.size > 10 * 1024 * 1024
  )
    throw new Error("请选择不超过 10 MB 的 PNG、JPG、WebP 或 GIF 图片。");
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("图片读取失败，请重新选择。"));
    reader.readAsDataURL(file);
  });
  const image = new Image();
  image.src = dataUrl;
  await image.decode().catch(() => {
    throw new Error("图片内容无法解码，请重新选择。");
  });
  if (image.naturalWidth * image.naturalHeight > 40_000_000)
    throw new Error("图片超过 4000 万像素，请缩小后上传。");
  const asset: StudioAsset = {
    id: uid("asset"),
    name: file.name,
    dataUrl,
    rights,
    createdAt: new Date().toISOString(),
  };
  await studioDB().assets.put(asset);
  return asset;
}
export async function validateDataImage(dataUrl: string) {
  if (
    !/^data:image\/(png|jpeg|webp|gif);base64,/.test(dataUrl) ||
    dataUrl.length > 14_000_000
  )
    throw new Error("图片格式无效或超过 10 MB，请重新选择。");
  const image = new Image();
  image.src = dataUrl;
  await image.decode().catch(() => {
    throw new Error("图片无法解码，请检查原图后重新导入。");
  });
  if (image.naturalWidth * image.naturalHeight > 40_000_000)
    throw new Error("图片超过 4000 万像素，请缩小后导入。");
}
export async function storeDataImage(
  dataUrl: string,
  name: string,
  rights: StudioAsset["rights"] = "reference-only",
  referenceHTML?: string,
) {
  await validateDataImage(dataUrl);
  const asset: StudioAsset = {
    id: uid("asset"),
    name,
    dataUrl,
    rights,
    referenceHTML,
    createdAt: new Date().toISOString(),
  };
  await studioDB().assets.put(asset);
  return asset;
}
