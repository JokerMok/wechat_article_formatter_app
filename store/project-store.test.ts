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

  it("does not let a stale load result overwrite a project created while loading", async () => {
    const storedProject = createEmptyProject({ title: "旧项目", article });
    let resolveLoad: (value: Awaited<ReturnType<ProjectRepository["getLatestProject"]>>) => void = () => {};
    const getLatestProject = vi.fn<ProjectRepository["getLatestProject"]>().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLoad = resolve;
        })
    );
    const store = createProjectStore({
      repository: {
        getLatestProject,
        getProject: vi.fn<ProjectRepository["getProject"]>(),
        listProjects: vi.fn<ProjectRepository["listProjects"]>(),
        saveProject: vi.fn<ProjectRepository["saveProject"]>().mockResolvedValue(undefined),
        deleteProject: vi.fn<ProjectRepository["deleteProject"]>(),
        close: vi.fn<ProjectRepository["close"]>(),
      },
    });

    const load = store.getState().load();
    const created = store.getState().createProject({ title: "新项目", article });
    resolveLoad({ state: "ready", project: storedProject });
    await load;

    expect(store.getState()).toMatchObject({
      loadState: "ready",
      saveStatus: "dirty",
      project: { id: created.id, title: "新项目" },
    });
  });

  it("returns unsaved_changes and preserves autosave when load starts while dirty", async () => {
    const storedProject = createEmptyProject({ title: "磁盘旧项目", article });
    const saveProject = vi.fn<ProjectRepository["saveProject"]>().mockResolvedValue(undefined);
    const getLatestProject = vi
      .fn<ProjectRepository["getLatestProject"]>()
      .mockResolvedValue({ state: "ready", project: storedProject });
    const store = createProjectStore({
      repository: {
        getLatestProject,
        getProject: vi.fn<ProjectRepository["getProject"]>(),
        listProjects: vi.fn<ProjectRepository["listProjects"]>(),
        saveProject,
        deleteProject: vi.fn<ProjectRepository["deleteProject"]>(),
        close: vi.fn<ProjectRepository["close"]>(),
      },
    });

    await store.getState().load();
    store.getState().updateProject({ title: "本地未保存" });

    await expect(store.getState().load()).resolves.toEqual({ type: "unsaved_changes", reason: "dirty" });
    expect(getLatestProject).toHaveBeenCalledTimes(1);
    expect(store.getState()).toMatchObject({
      loadState: "ready",
      saveStatus: "dirty",
      project: { title: "本地未保存" },
      lastLoadOutcome: { type: "unsaved_changes", reason: "dirty" },
    });

    await vi.advanceTimersByTimeAsync(800);
    expect(saveProject).toHaveBeenCalledTimes(1);
    expect(saveProject.mock.calls[0][0].title).toBe("本地未保存");
    expect(store.getState()).toMatchObject({ saveStatus: "saved", project: { title: "本地未保存" } });
  });

  it("returns unsaved_changes and does not load stale data while autosave is in flight", async () => {
    const storedProject = createEmptyProject({ title: "磁盘旧项目", article });
    let resolveSave: () => void = () => {};
    const saveProject = vi.fn<ProjectRepository["saveProject"]>(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        })
    );
    const getLatestProject = vi
      .fn<ProjectRepository["getLatestProject"]>()
      .mockResolvedValue({ state: "ready", project: storedProject });
    const store = createProjectStore({
      repository: {
        getLatestProject,
        getProject: vi.fn<ProjectRepository["getProject"]>(),
        listProjects: vi.fn<ProjectRepository["listProjects"]>(),
        saveProject,
        deleteProject: vi.fn<ProjectRepository["deleteProject"]>(),
        close: vi.fn<ProjectRepository["close"]>(),
      },
    });

    await store.getState().load();
    store.getState().updateProject({ title: "写入中的本地版本" });
    await vi.advanceTimersByTimeAsync(800);
    expect(store.getState().saveStatus).toBe("saving");

    await expect(store.getState().load()).resolves.toEqual({ type: "unsaved_changes", reason: "saving" });
    expect(getLatestProject).toHaveBeenCalledTimes(1);
    expect(saveProject).toHaveBeenCalledTimes(1);
    expect(saveProject.mock.calls[0][0].title).toBe("写入中的本地版本");
    expect(store.getState()).toMatchObject({
      loadState: "ready",
      saveStatus: "saving",
      project: { title: "写入中的本地版本" },
      lastLoadOutcome: { type: "unsaved_changes", reason: "saving" },
    });

    resolveSave();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState()).toMatchObject({ saveStatus: "saved", project: { title: "写入中的本地版本" } });
  });

  it("settles a stale load result after an edit without writing the loaded project", async () => {
    const initialProject = createEmptyProject({ title: "初始项目", article });
    const loadedProject = createEmptyProject({ title: "异步返回的磁盘项目", article });
    let resolveLoad: (value: Awaited<ReturnType<ProjectRepository["getLatestProject"]>>) => void = () => {};
    const getLatestProject = vi
      .fn<ProjectRepository["getLatestProject"]>()
      .mockResolvedValueOnce({ state: "ready", project: initialProject })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveLoad = resolve;
          })
      );
    const saveProject = vi.fn<ProjectRepository["saveProject"]>().mockResolvedValue(undefined);
    const store = createProjectStore({
      repository: {
        getLatestProject,
        getProject: vi.fn<ProjectRepository["getProject"]>(),
        listProjects: vi.fn<ProjectRepository["listProjects"]>(),
        saveProject,
        deleteProject: vi.fn<ProjectRepository["deleteProject"]>(),
        close: vi.fn<ProjectRepository["close"]>(),
      },
    });

    await store.getState().load();
    const load = store.getState().load();
    store.getState().updateProject({ title: "异步期间本地编辑" });
    resolveLoad({ state: "ready", project: loadedProject });

    await expect(load).resolves.toEqual({ type: "stale_ignored" });
    expect(store.getState()).toMatchObject({
      loadState: "ready",
      saveStatus: "dirty",
      project: { title: "异步期间本地编辑" },
      lastLoadOutcome: { type: "stale_ignored" },
    });

    await vi.advanceTimersByTimeAsync(800);
    expect(saveProject).toHaveBeenCalledTimes(1);
    expect(saveProject.mock.calls[0][0].title).toBe("异步期间本地编辑");
  });

  it("settles a load conflict during an in-flight autosave and preserves the write error classification", async () => {
    const project = createEmptyProject({ title: "初稿", article });
    let rejectSave: (reason: unknown) => void = () => {};
    const saveProject = vi.fn<ProjectRepository["saveProject"]>(
      () =>
        new Promise((_resolve, reject) => {
          rejectSave = reject;
        })
    );
    const getLatestProject = vi
      .fn<ProjectRepository["getLatestProject"]>()
      .mockResolvedValue({ state: "ready", project });
    const store = createProjectStore({
      repository: {
        getLatestProject,
        getProject: vi.fn<ProjectRepository["getProject"]>(),
        listProjects: vi.fn<ProjectRepository["listProjects"]>(),
        saveProject,
        deleteProject: vi.fn<ProjectRepository["deleteProject"]>(),
        close: vi.fn<ProjectRepository["close"]>(),
      },
    });

    await store.getState().load();
    store.getState().updateProject({ title: "写入中" });
    await vi.advanceTimersByTimeAsync(800);
    expect(store.getState().saveStatus).toBe("saving");

    await expect(store.getState().load()).resolves.toEqual({ type: "unsaved_changes", reason: "saving" });
    expect(store.getState()).toMatchObject({
      loadState: "ready",
      saveStatus: "saving",
      lastLoadOutcome: { type: "unsaved_changes", reason: "saving" },
    });
    expect(getLatestProject).toHaveBeenCalledTimes(1);

    rejectSave(new StorageWriteError("write_failed", "写入失败。"));
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState()).toMatchObject({
      saveStatus: "unsaved",
      lastError: { code: "write_failed" },
    });
  });
});
