import Dexie, { type Table } from "dexie";
import type { ProjectDocument, StoredAssetRecord } from "./types";
import { StorageWriteError } from "./storage-error";

export const DEFAULT_DATABASE_NAME = "wechat-article-formatter-t002";

export type BrowserDatabaseOptions = {
  dbName?: string;
  indexedDB?: IDBFactory;
  IDBKeyRange?: typeof globalThis.IDBKeyRange;
};

export class FormatterDatabase extends Dexie {
  projects!: Table<unknown, string>;
  assets!: Table<StoredAssetRecord, string>;

  constructor(options: BrowserDatabaseOptions = {}) {
    const idbFactory = Object.hasOwn(options, "indexedDB") ? options.indexedDB : globalThis.indexedDB;
    const keyRange = Object.hasOwn(options, "IDBKeyRange") ? options.IDBKeyRange : globalThis.IDBKeyRange;

    if (!idbFactory || !keyRange) {
      throw new StorageWriteError("storage_unavailable", "当前环境无法使用本地存储。");
    }

    super(options.dbName ?? DEFAULT_DATABASE_NAME, { indexedDB: idbFactory, IDBKeyRange: keyRange });
    this.version(1).stores({
      projects: "id, updatedAt, schemaVersion",
      assets: "id, projectId, createdAt",
    });
  }
}

export function sanitizeProjectForStorage(project: ProjectDocument): ProjectDocument {
  return {
    ...project,
    assets: project.assets.map((asset) => ({ ...asset })),
    platformVersions: { ...project.platformVersions },
  };
}
