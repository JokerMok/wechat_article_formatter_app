import type { UnifiedArticleContent } from "../content";
import { FormatterDatabase, type BrowserDatabaseOptions, sanitizeProjectForStorage } from "./browser-database";
import { categorizeStorageWriteError } from "./storage-error";
import {
  CURRENT_PROJECT_SCHEMA_VERSION,
  type ProjectDocument,
  type ProjectLoadResult,
  type ProjectRepository,
  type ReadyProjectRecord,
  type UnknownVersionProjectRecord,
} from "./types";

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown, fallback: string) {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function readVersion(value: unknown) {
  return isRecord(value) && typeof value.schemaVersion === "number" ? value.schemaVersion : 0;
}

function readArticle(value: unknown): UnifiedArticleContent | null {
  if (!isRecord(value) || !("schemaVersion" in value)) {
    return null;
  }
  return value as UnifiedArticleContent;
}

function normalizeProject(raw: Record<string, unknown>): ProjectDocument {
  const createdAt = readString(raw.createdAt, nowIso());
  return {
    schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    id: readString(raw.id, createId("project")),
    title: readString(raw.title, "未命名项目"),
    article: readArticle(raw.article),
    assets: Array.isArray(raw.assets) ? (raw.assets as ProjectDocument["assets"]) : [],
    platformVersions: isRecord(raw.platformVersions) ? raw.platformVersions : {},
    createdAt,
    updatedAt: readString(raw.updatedAt, createdAt),
  };
}

export function createEmptyProject(input: {
  title?: string;
  article?: UnifiedArticleContent | null;
  id?: string;
  createdAt?: string;
} = {}): ProjectDocument {
  const timestamp = input.createdAt ?? nowIso();
  return {
    schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    id: input.id ?? createId("project"),
    title: input.title ?? "未命名项目",
    article: input.article ?? null,
    assets: [],
    platformVersions: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function migrateRawProject(raw: unknown): ReadyProjectRecord | UnknownVersionProjectRecord {
  if (!isRecord(raw)) {
    return {
      state: "unknownVersion",
      id: "unknown-project",
      schemaVersion: 0,
      rawData: raw,
    };
  }

  const version = readVersion(raw);
  if (version > CURRENT_PROJECT_SCHEMA_VERSION) {
    return {
      state: "unknownVersion",
      id: readString(raw.id, "unknown-project"),
      schemaVersion: version,
      rawData: raw,
    };
  }

  return {
    state: "ready",
    project: normalizeProject(raw),
  };
}

export function createProjectRepository(options: BrowserDatabaseOptions = {}): ProjectRepository {
  let db: FormatterDatabase | undefined;

  function getDb() {
    db ??= new FormatterDatabase(options);
    return db;
  }

  return {
    async getLatestProject(): Promise<ProjectLoadResult> {
      const records = await getDb().projects.orderBy("updatedAt").reverse().toArray();
      const raw = records[0];
      return raw === undefined ? { state: "empty" } : migrateRawProject(raw);
    },

    async getProject(id: string): Promise<ProjectLoadResult> {
      const raw = await getDb().projects.get(id);
      return raw === undefined ? { state: "empty" } : migrateRawProject(raw);
    },

    async listProjects() {
      const records = await getDb().projects.orderBy("updatedAt").reverse().toArray();
      return records.map((record) => migrateRawProject(record));
    },

    async saveProject(project: ProjectDocument) {
      try {
        await getDb().projects.put(sanitizeProjectForStorage({ ...project, updatedAt: nowIso() }));
      } catch (error) {
        throw categorizeStorageWriteError(error);
      }
    },

    async deleteProject(id, deleteOptions) {
      try {
        await getDb().projects.delete(id);
        await deleteOptions?.assetRepository?.deleteUnreferencedAssets(id, []);
      } catch (error) {
        throw categorizeStorageWriteError(error);
      }
    },

    async close() {
      db?.close();
      db = undefined;
    },
  };
}
