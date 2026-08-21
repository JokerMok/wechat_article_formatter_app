import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { UnifiedArticleContent } from "../content";
import { createProjectBackupPayload, readProjectBackupPayload } from "./backup";
import { createAssetBlobRepository } from "./blob-repository";
import { createEmptyProject, createProjectRepository, migrateRawProject } from "./project-repository";
import { StorageWriteError, categorizeStorageWriteError } from "./storage-error";

const article: UnifiedArticleContent = {
  schemaVersion: 1,
  sourceText: "正文内容",
  sourceFormat: "plainText",
  parseMode: "narrative",
  title: "标题",
  blocks: [],
  warnings: [],
};

const validPng = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="),
  (character) => character.charCodeAt(0)
);

describe("project repository", () => {
  const dbNames: string[] = [];

  beforeEach(() => {
    dbNames.length = 0;
  });

  afterEach(async () => {
    await Promise.all(dbNames.map((name) => indexedDB.deleteDatabase(name)));
  });

  function nextName() {
    const name = `t002-project-${Date.now()}-${Math.random()}`;
    dbNames.push(name);
    return name;
  }

  it("returns an explicit empty state, then saves, restores, and deletes a project", async () => {
    const dbName = nextName();
    const repo = createProjectRepository({ dbName });

    await expect(repo.getLatestProject()).resolves.toEqual({ state: "empty" });

    const project = createEmptyProject({ title: "项目 A", article });
    await repo.saveProject(project);
    await repo.close();

    const restoredRepo = createProjectRepository({ dbName });
    await expect(restoredRepo.getLatestProject()).resolves.toMatchObject({
      state: "ready",
      project: { id: project.id, title: "项目 A", article },
    });

    await restoredRepo.deleteProject(project.id);
    await expect(restoredRepo.getProject(project.id)).resolves.toEqual({ state: "empty" });
    await restoredRepo.close();
  });

  it("can cascade project deletion to unreferenced project assets", async () => {
    const dbName = nextName();
    const repo = createProjectRepository({ dbName });
    const blobRepo = createAssetBlobRepository({ dbName });
    const blob = new Blob([validPng], { type: "image/png" });
    const asset = await blobRepo.saveImageBlob({ projectId: "project-with-asset", blob, fileName: "cover.png" });
    const project = {
      ...createEmptyProject({ id: "project-with-asset", title: "项目 A", article }),
      assets: [
        {
          id: asset.id,
          fileName: asset.fileName,
          mimeType: asset.mimeType,
          byteLength: asset.byteLength,
        },
      ],
    };

    await repo.saveProject(project);
    await repo.deleteProject(project.id, { assetRepository: blobRepo });

    await expect(repo.getProject(project.id)).resolves.toEqual({ state: "empty" });
    await expect(blobRepo.getAssetBlob(asset.id)).resolves.toEqual({ state: "empty" });

    await repo.close();
    await blobRepo.close();
  });

  it("keeps unknown raw project data exportable instead of overwriting it during migration", async () => {
    const previous = {
      schemaVersion: 1,
      id: "old-project",
      title: "旧项目",
      article,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(migrateRawProject(previous)).toMatchObject({
      state: "ready",
      project: { schemaVersion: 2, id: "old-project", title: "旧项目" },
    });

    const unknown = { schemaVersion: 99, id: "future-project", encryptedPayload: "opaque" };
    const migratedUnknown = migrateRawProject(unknown);
    expect(migratedUnknown).toEqual({
      state: "unknownVersion",
      id: "future-project",
      schemaVersion: 99,
      rawData: unknown,
    });
    if (migratedUnknown.state !== "unknownVersion") {
      throw new Error("unknown project was not preserved");
    }

    const backup = createProjectBackupPayload({
      projects: [],
      unknownProjects: [migratedUnknown],
      assets: [],
    });
    expect(readProjectBackupPayload(backup).unknownProjects[0]?.rawData).toEqual(unknown);
  });

  it("categorizes unavailable and failed writes without logging private content", async () => {
    const error = categorizeStorageWriteError(new DOMException("quota", "QuotaExceededError"));
    expect(error).toBeInstanceOf(StorageWriteError);
    expect(error.code).toBe("quota_exceeded");

    const dbName = nextName();
    const repo = createProjectRepository({ dbName, indexedDB: undefined });
    await expect(repo.saveProject(createEmptyProject({ title: "secret title", article }))).rejects.toMatchObject({
      code: "storage_unavailable",
    });
  });
});

describe("asset blob repository", () => {
  const dbNames: string[] = [];

  afterEach(async () => {
    await Promise.all(dbNames.map((name) => indexedDB.deleteDatabase(name)));
  });

  function nextName() {
    const name = `t002-asset-${Date.now()}-${Math.random()}`;
    dbNames.push(name);
    return name;
  }

  it("validates and restores image blobs from IndexedDB", async () => {
    const dbName = nextName();
    const repo = createAssetBlobRepository({ dbName });
    const blob = new Blob([validPng], { type: "image/png" });

    const saved = await repo.saveImageBlob({ projectId: "project-1", blob, fileName: "cover.png" });
    await repo.close();

    const restoredRepo = createAssetBlobRepository({ dbName });
    const restored = await restoredRepo.getAssetBlob(saved.id);

    expect(restored).toMatchObject({
      state: "ready",
      asset: { id: saved.id, projectId: "project-1", mimeType: "image/png", fileName: "cover.png" },
    });
    if (restored.state !== "ready") {
      throw new Error("asset was not restored");
    }
    expect([...new Uint8Array(await restored.blob.arrayBuffer())].slice(0, 4)).toEqual([0x89, 0x50, 0x4e, 0x47]);
    await restoredRepo.close();
  });

  it("normalizes crop metadata at the blob repository boundary", async () => {
    const dbName = nextName();
    const repo = createAssetBlobRepository({ dbName });
    const blob = new Blob([validPng], { type: "image/png" });

    const saved = await repo.saveImageBlob({
      projectId: "project-1",
      blob,
      fileName: "cover.png",
      crop: { x: 0.4, y: 0.4, width: 0.6, height: 0.6, unit: "pixel" },
    });

    expect(saved.crop).toEqual({ x: 0, y: 0, width: 1, height: 1, unit: "pixel" });
    await repo.close();
  });

  it("rejects non-finite crop metadata before storing image blobs", async () => {
    const dbName = nextName();
    const repo = createAssetBlobRepository({ dbName });
    const blob = new Blob([validPng], { type: "image/png" });

    await expect(
      repo.saveImageBlob({
        projectId: "project-1",
        blob,
        fileName: "cover.png",
        crop: { x: Number.NaN, y: 0, width: 1, height: 1, unit: "pixel" },
      })
    ).rejects.toMatchObject({ code: "validation_failed" });
    await repo.close();
  });
});
