import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UnifiedArticleContent } from "../lib/content";
import { createEmptyProject } from "../lib/storage/project-repository";
import { StorageWriteError } from "../lib/storage/storage-error";
import type { ProjectRepository } from "../lib/storage/types";
import { createProjectStore } from "./project-store";

const article: UnifiedArticleContent = {
  schemaVersion: 1,
  sourceText: "正文内容",
  sourceFormat: "plainText",
  parseMode: "narrative",
  title: "标题",
  blocks: [],
  warnings: [],
};

describe("project store autosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("debounces project autosave by 800ms and keeps current content after a write failure", async () => {
    const project = createEmptyProject({ title: "初稿", article });
    const saveProject = vi.fn<ProjectRepository["saveProject"]>();
    saveProject.mockResolvedValue();

    const store = createProjectStore({
      repository: {
        getLatestProject: async () => ({ state: "ready", project }),
        getProject: vi.fn<ProjectRepository["getProject"]>(),
        listProjects: vi.fn<ProjectRepository["listProjects"]>(),
        saveProject,
        deleteProject: vi.fn<ProjectRepository["deleteProject"]>(),
        close: vi.fn<ProjectRepository["close"]>(),
      },
    });

    await store.getState().load();
    store.getState().updateProject({ title: "改后标题" });
    await vi.advanceTimersByTimeAsync(799);
    expect(saveProject).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(saveProject).toHaveBeenCalledTimes(1);
    expect(store.getState()).toMatchObject({ saveStatus: "saved", lastError: undefined });

    saveProject.mockRejectedValueOnce(new StorageWriteError("write_failed", "写入失败。"));
    store.getState().updateProject({ title: "失败后仍在会话里" });
    await vi.advanceTimersByTimeAsync(800);

    expect(store.getState().project?.title).toBe("失败后仍在会话里");
    expect(store.getState()).toMatchObject({ saveStatus: "unsaved", lastError: { code: "write_failed" } });
  });

  it("exposes an explicit empty state when no project exists", async () => {
    const store = createProjectStore({
      repository: {
        getLatestProject: async () => ({ state: "empty" }),
        getProject: vi.fn<ProjectRepository["getProject"]>(),
        listProjects: vi.fn<ProjectRepository["listProjects"]>(),
        saveProject: vi.fn<ProjectRepository["saveProject"]>(),
        deleteProject: vi.fn<ProjectRepository["deleteProject"]>(),
        close: vi.fn<ProjectRepository["close"]>(),
      },
    });

    await store.getState().load();

    expect(store.getState()).toMatchObject({ loadState: "empty", project: undefined, saveStatus: "idle" });
  });

  it("classifies repository failures and leaves the loading state", async () => {
    const repositoryError = new StorageWriteError("storage_unavailable", "当前环境无法使用本地存储。");
    const store = createProjectStore({
      repository: {
        getLatestProject: vi.fn<ProjectRepository["getLatestProject"]>().mockRejectedValue(repositoryError),
        getProject: vi.fn<ProjectRepository["getProject"]>(),
        listProjects: vi.fn<ProjectRepository["listProjects"]>(),
        saveProject: vi.fn<ProjectRepository["saveProject"]>(),
        deleteProject: vi.fn<ProjectRepository["deleteProject"]>(),
        close: vi.fn<ProjectRepository["close"]>(),
      },
    });

    await store.getState().load();

    expect(store.getState()).toMatchObject({
      loadState: "error",
      saveStatus: "idle",
      lastError: { code: "storage_unavailable", message: "当前环境无法使用本地存储。" },
    });
  });

  it("does not mark stale content saved when a newer revision changes during a write", async () => {
    const project = createEmptyProject({ title: "初稿", article });
    const writes: Array<{ project: typeof project; resolve: () => void }> = [];
    const saveProject = vi.fn<ProjectRepository["saveProject"]>((savedProject) => {
      return new Promise<void>((resolve) => {
        writes.push({ project: savedProject, resolve });
      });
    });
    const store = createProjectStore({
      repository: {
        getLatestProject: async () => ({ state: "ready", project }),
        getProject: vi.fn<ProjectRepository["getProject"]>(),
        listProjects: vi.fn<ProjectRepository["listProjects"]>(),
        saveProject,
        deleteProject: vi.fn<ProjectRepository["deleteProject"]>(),
        close: vi.fn<ProjectRepository["close"]>(),
      },
    });

    await store.getState().load();
    store.getState().updateProject({ title: "写入中的旧版本" });
    await vi.advanceTimersByTimeAsync(800);
    expect(writes).toHaveLength(1);

    store.getState().updateProject({ title: "更新后的新版本" });
    writes[0].resolve();
    await vi.advanceTimersByTimeAsync(0);

    expect(store.getState()).toMatchObject({ saveStatus: "dirty", project: { title: "更新后的新版本" } });

    await vi.advanceTimersByTimeAsync(800);
    expect(writes).toHaveLength(2);
    expect(writes[1].project.title).toBe("更新后的新版本");
    writes[1].resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState()).toMatchObject({ saveStatus: "saved", project: { title: "更新后的新版本" } });
  });
});
