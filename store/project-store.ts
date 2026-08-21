import { createStore, type StoreApi } from "zustand/vanilla";
import { createEmptyProject } from "../lib/storage/project-repository";
import { StorageWriteError, categorizeStorageWriteError } from "../lib/storage/storage-error";
import type { ProjectDocument, ProjectRepository } from "../lib/storage/types";

export type ProjectLoadState = "idle" | "loading" | "ready" | "empty" | "error" | "unknownVersion";
export type ProjectSaveStatus = "idle" | "dirty" | "saving" | "saved" | "unsaved";

export type ProjectStoreState = {
  loadState: ProjectLoadState;
  saveStatus: ProjectSaveStatus;
  project?: ProjectDocument;
  unknownRawProject?: unknown;
  lastError?: { code: string; message: string };
  load(): Promise<void>;
  createProject(input?: { title?: string; article?: ProjectDocument["article"] }): ProjectDocument;
  updateProject(patch: Partial<Pick<ProjectDocument, "title" | "article" | "assets" | "platformVersions">>): void;
  deleteProject(id: string): Promise<void>;
  flushAutosave(): Promise<void>;
  dispose(): void;
};

export type ProjectStoreOptions = {
  repository: ProjectRepository;
  autosaveDelayMs?: number;
};

function nowIso() {
  return new Date().toISOString();
}

function publicError(error: unknown) {
  const storageError = error instanceof StorageWriteError ? error : categorizeStorageWriteError(error);
  return { code: storageError.code, message: storageError.message };
}

export function createProjectStore(options: ProjectStoreOptions): StoreApi<ProjectStoreState> {
  const autosaveDelayMs = options.autosaveDelayMs ?? 800;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let revision = 0;

  const store = createStore<ProjectStoreState>((set, get) => {
    async function saveCurrentProject() {
      const project = get().project;
      if (!project) {
        return;
      }

      const saveRevision = revision;
      set({ saveStatus: "saving", lastError: undefined });
      try {
        await options.repository.saveProject(project);
        if (saveRevision !== revision) {
          return;
        }
        set({ saveStatus: "saved", lastError: undefined });
      } catch (error) {
        if (saveRevision !== revision) {
          return;
        }
        set({ saveStatus: "unsaved", lastError: publicError(error) });
      }
    }

    function scheduleAutosave() {
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = undefined;
        void saveCurrentProject();
      }, autosaveDelayMs);
    }

    return {
      loadState: "idle",
      saveStatus: "idle",

      async load() {
        revision += 1;
        set({ loadState: "loading", lastError: undefined });
        try {
          const result = await options.repository.getLatestProject();
          if (result.state === "empty") {
            set({ loadState: "empty", project: undefined, unknownRawProject: undefined, saveStatus: "idle" });
            return;
          }
          if (result.state === "unknownVersion") {
            set({
              loadState: "unknownVersion",
              project: undefined,
              unknownRawProject: result.rawData,
              saveStatus: "idle",
            });
            return;
          }
          set({ loadState: "ready", project: result.project, unknownRawProject: undefined, saveStatus: "saved" });
        } catch (error) {
          set({ loadState: "error", lastError: publicError(error), saveStatus: get().project ? get().saveStatus : "idle" });
        }
      },

      createProject(input = {}) {
        const project = createEmptyProject(input);
        revision += 1;
        set({ loadState: "ready", project, saveStatus: "dirty", lastError: undefined });
        scheduleAutosave();
        return project;
      },

      updateProject(patch) {
        const current = get().project;
        if (!current) {
          return;
        }
        revision += 1;
        set({
          project: {
            ...current,
            ...patch,
            updatedAt: nowIso(),
          },
          saveStatus: "dirty",
          lastError: undefined,
        });
        scheduleAutosave();
      },

      async deleteProject(id) {
        revision += 1;
        if (timer) {
          clearTimeout(timer);
          timer = undefined;
        }
        try {
          await options.repository.deleteProject(id);
          if (get().project?.id === id) {
            set({ loadState: "empty", project: undefined, saveStatus: "idle", lastError: undefined });
          }
        } catch (error) {
          set({ saveStatus: "unsaved", lastError: publicError(error) });
        }
      },

      async flushAutosave() {
        if (timer) {
          clearTimeout(timer);
          timer = undefined;
        }
        await saveCurrentProject();
      },

      dispose() {
        if (timer) {
          clearTimeout(timer);
          timer = undefined;
        }
        void options.repository.close();
      },
    };
  });

  return store;
}
