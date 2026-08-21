import type { ProjectBackupPayload, ProjectDocument, StoredAssetMetadata, UnknownVersionProjectRecord } from "./types";

export function createProjectBackupPayload(input: {
  projects: ProjectDocument[];
  unknownProjects: UnknownVersionProjectRecord[];
  assets: StoredAssetMetadata[];
  exportedAt?: string;
}): ProjectBackupPayload {
  return {
    schemaVersion: 1,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    projects: input.projects,
    unknownProjects: input.unknownProjects,
    assets: input.assets,
  };
}

export function readProjectBackupPayload(raw: unknown): ProjectBackupPayload {
  if (!raw || typeof raw !== "object") {
    throw new Error("invalid_backup_payload");
  }

  const payload = raw as Partial<ProjectBackupPayload>;
  if (payload.schemaVersion !== 1 || !Array.isArray(payload.projects) || !Array.isArray(payload.unknownProjects)) {
    throw new Error("invalid_backup_payload");
  }

  return {
    schemaVersion: 1,
    exportedAt: typeof payload.exportedAt === "string" ? payload.exportedAt : "",
    projects: payload.projects,
    unknownProjects: payload.unknownProjects,
    assets: Array.isArray(payload.assets) ? payload.assets : [],
  };
}

export async function readProjectBackupBlob(blob: Blob): Promise<ProjectBackupPayload> {
  return readProjectBackupPayload(JSON.parse(await blob.text()));
}
