import { normalizeCropParams, validateImageBlob } from "../assets";
import { FormatterDatabase, type BrowserDatabaseOptions } from "./browser-database";
import { categorizeStorageWriteError, StorageWriteError } from "./storage-error";
import type { AssetBlobRepository, AssetLoadResult, StoredAssetMetadata, StoredAssetRecord } from "./types";

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function metadataFromRecord(record: StoredAssetRecord): StoredAssetMetadata {
  return {
    id: record.id,
    projectId: record.projectId,
    fileName: record.fileName,
    mimeType: record.mimeType,
    byteLength: record.byteLength,
    crop: record.crop,
    createdAt: record.createdAt,
  };
}

export function createAssetBlobRepository(options: BrowserDatabaseOptions = {}): AssetBlobRepository {
  let db: FormatterDatabase | undefined;

  function getDb() {
    db ??= new FormatterDatabase(options);
    return db;
  }

  return {
    async saveImageBlob(input) {
      const validation = await validateImageBlob(input.blob);
      if (!validation.ok) {
        throw new StorageWriteError("validation_failed", validation.error.message);
      }

      let crop: StoredAssetRecord["crop"];
      try {
        crop = input.crop ? normalizeCropParams(input.crop, validation.value.dimensions) : undefined;
      } catch {
        throw new StorageWriteError("validation_failed", "裁剪参数无效。");
      }

      const record: StoredAssetRecord = {
        id: createId("asset"),
        projectId: input.projectId,
        fileName: input.fileName,
        mimeType: validation.value.mimeType,
        byteLength: validation.value.byteLength,
        crop,
        createdAt: nowIso(),
        blob: input.blob,
      };

      try {
        await getDb().assets.put(record);
      } catch (error) {
        throw categorizeStorageWriteError(error);
      }

      return metadataFromRecord(record);
    },

    async putImageBlob(record) {
      try {
        await getDb().assets.put(record);
      } catch (error) {
        throw categorizeStorageWriteError(error);
      }
      return metadataFromRecord(record);
    },

    async getAssetBlob(id: string): Promise<AssetLoadResult> {
      const record = await getDb().assets.get(id);
      if (!record) {
        return { state: "empty" };
      }
      return {
        state: "ready",
        asset: metadataFromRecord(record),
        blob: record.blob,
      };
    },

    async listProjectAssets(projectId: string) {
      const records = await getDb().assets.where("projectId").equals(projectId).toArray();
      return records.map(metadataFromRecord);
    },

    async deleteAsset(id: string) {
      try {
        await getDb().assets.delete(id);
      } catch (error) {
        throw categorizeStorageWriteError(error);
      }
    },

    async deleteUnreferencedAssets(projectId: string, referencedAssetIds: string[]) {
      const referenced = new Set(referencedAssetIds);
      const records = await getDb().assets.where("projectId").equals(projectId).toArray();
      const deleted: string[] = [];

      try {
        for (const record of records) {
          if (!referenced.has(record.id)) {
            await getDb().assets.delete(record.id);
            deleted.push(record.id);
          }
        }
      } catch (error) {
        throw categorizeStorageWriteError(error);
      }

      return deleted;
    },

    async close() {
      db?.close();
      db = undefined;
    },
  };
}
