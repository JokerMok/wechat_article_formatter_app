import { createStore, type StoreApi } from "zustand/vanilla";
import { createEmptyProject } from "../lib/storage/project-repository";
import { StorageWriteError, categorizeStorageWriteError } from "../lib/storage/storage-error";
import type { ProjectDocument, ProjectRepository } from "../lib/storage/types";

export type ProjectLoadState = "idle" | "loading" | "ready" | "empty" | "error" | "unknownVersion";
export type ProjectSaveStatus = "idle" | "dirty" | "saving" | "saved" | "unsaved";
export type ProjectUnsavedChangesReason = Extract<ProjectSaveStatus, "dirty" | "saving" | "unsaved">;
export type ProjectLoadOutcome =
  | { type: "loaded"; state: Exclude<ProjectLoadState, "idle" | "loading" | "error"> }
  | { type: "unsaved_changes"; reason: ProjectUnsavedChangesReason }
  | { type: "stale_ignored" }
  | { type: "error"; error: { code: string; message: string } };

export type ProjectStoreState = {
  loadState: ProjectLoadState;
  saveStatus: ProjectSaveStatus;
  project?: ProjectDocument;
  unknownRawProject?: unknown;
  lastError?: { code: string; message: string };
  lastLoadOutcome?: ProjectLoadOutcome;
  load(): Promise<ProjectLoadOutcome>;
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

function unsavedChangesReason(saveStatus: ProjectSaveStatus): ProjectUnsavedChangesReason | undefined {
  return saveStatus === "dirty" || saveStatus === "saving" || saveStatus === "unsaved" ? saveStatus : undefined;
}

function settledLoadState(state: ProjectStoreState, fallback: ProjectLoadState): ProjectLoadState {
  if (state.loadState !== "loading") {
    return state.loadState;
  }
  if (state.project) {
    return "ready";
  }
  return fallback === "loading" ? "idle" : fallback;
}

export function createProjectStore(options: ProjectStoreOptions): StoreApi<ProjectStoreState> {
  const autosaveDelayMs = options.autosaveDelayMs ?? 800;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let projectRevision = 0;
  let loadRevision = 0;

  const store = createStore<ProjectStoreState>((set, get) => {
    async function saveCurrentProject() {
      const project = get().project;
      if (!project) {
        return;
      }

      const saveRevision = projectRevision;
      set({ saveStatus: "saving", lastError: undefined });
      try {
        await options.repository.saveProject(project);
        if (saveRevision !== projectRevision) {
          return;
        }
        set({ saveStatus: "saved", lastError: undefined });
      } catch (error) {
        const lastError = publicError(error);
        if (saveRevision !== projectRevision) {
          if (get().saveStatus === "saving") {
            set({ saveStatus: "unsaved", lastError });
          } else {
            set({ lastError });
          }
          return;
        }
        set({ saveStatus: "unsaved", lastError });
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
        const startingState = get();
        const blockedReason = startingState.project ? unsavedChangesReason(startingState.saveStatus) : undefined;
        if (blockedReason) {
          const outcome: ProjectLoadOutcome = { type: "unsaved_changes", reason: blockedReason };
          set({
            loadState: settledLoadState(startingState, startingState.loadState),
            lastLoadOutcome: outcome,
          });
          return outcome;
        }

        const loadToken = loadRevision + 1;
        const startingProjectRevision = projectRevision;
        const startingSaveStatus = startingState.saveStatus;
        const startingLoadState = startingState.loadState;
        loadRevision = loadToken;
        if (timer) {
          clearTimeout(timer);
          timer = undefined;
        }
        set({ loadState: "loading", lastError: undefined, lastLoadOutcome: undefined });
        try {
          const result = await options.repository.getLatestProject();
          const currentState = get();
          if (
            loadToken !== loadRevision ||
            startingProjectRevision !== projectRevision ||
            startingSaveStatus !== currentState.saveStatus ||
            unsavedChangesReason(currentState.saveStatus)
          ) {
            const outcome: ProjectLoadOutcome = { type: "stale_ignored" };
            set({
              loadState: settledLoadState(currentState, startingLoadState),
              lastLoadOutcome: outcome,
            });
            return outcome;
          }
          if (result.state === "empty") {
            const outcome: ProjectLoadOutcome = { type: "loaded", state: "empty" };
            projectRevision += 1;
            set({ loadState: "empty", project: undefined, unknownRawProject: undefined, saveStatus: "idle", lastLoadOutcome: outcome });
            return outcome;
          }
          if (result.state === "unknownVersion") {
            const outcome: ProjectLoadOutcome = { type: "loaded", state: "unknownVersion" };
            projectRevision += 1;
            set({
              loadState: "unknownVersion",
              project: undefined,
              unknownRawProject: result.rawData,
              saveStatus: "idle",
              lastLoadOutcome: outcome,
            });
            return outcome;
          }
          const outcome: ProjectLoadOutcome = { type: "loaded", state: "ready" };
          projectRevision += 1;
          set({ loadState: "ready", project: result.project, unknownRawProject: undefined, saveStatus: "saved", lastLoadOutcome: outcome });
          return outcome;
        } catch (error) {
          const currentState = get();
          if (loadToken !== loadRevision || startingProjectRevision !== projectRevision) {
            const outcome: ProjectLoadOutcome = { type: "stale_ignored" };
            set({
              loadState: settledLoadState(currentState, startingLoadState),
              lastLoadOutcome: outcome,
            });
            return outcome;
          }
          const lastError = publicError(error);
          const saveStatus = currentState.project ? (currentState.saveStatus === "saving" ? "unsaved" : currentState.saveStatus) : "idle";
          const outcome: ProjectLoadOutcome = { type: "error", error: lastError };
          set({ loadState: "error", lastError, saveStatus, lastLoadOutcome: outcome });
          return outcome;
        }
      },

      createProject(input = {}) {
        const project = createEmptyProject(input);
        projectRevision += 1;
        set({ loadState: "ready", project, saveStatus: "dirty", lastError: undefined });
        scheduleAutosave();
        return project;
      },

      updateProject(patch) {
        const current = get().project;
        if (!current) {
          return;
        }
        projectRevision += 1;
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
        projectRevision += 1;
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
