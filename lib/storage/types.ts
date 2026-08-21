import type { CropParams, CropParamsInput, SupportedImageMimeType } from "../assets";
import type { UnifiedArticleContent } from "../content";

export const CURRENT_PROJECT_SCHEMA_VERSION = 2;

export type ProjectAssetReference = {
  id: string;
  fileName: string;
  mimeType: SupportedImageMimeType;
  byteLength: number;
  crop?: CropParams;
};

export type ProjectDocument = {
  schemaVersion: typeof CURRENT_PROJECT_SCHEMA_VERSION;
  id: string;
  title: string;
  article: UnifiedArticleContent | null;
  assets: ProjectAssetReference[];
  platformVersions: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ReadyProjectRecord = {
  state: "ready";
  project: ProjectDocument;
};

export type EmptyProjectRecord = {
  state: "empty";
};

export type UnknownVersionProjectRecord = {
  state: "unknownVersion";
  id: string;
  schemaVersion: number;
  rawData: unknown;
};

export type ProjectLoadResult = EmptyProjectRecord | ReadyProjectRecord | UnknownVersionProjectRecord;

export type ProjectDeleteOptions = {
  assetRepository?: AssetBlobRepository;
};

export type ProjectRepository = {
  getLatestProject(): Promise<ProjectLoadResult>;
  getProject(id: string): Promise<ProjectLoadResult>;
  listProjects(): Promise<Array<ReadyProjectRecord | UnknownVersionProjectRecord>>;
  saveProject(project: ProjectDocument): Promise<void>;
  deleteProject(id: string, options?: ProjectDeleteOptions): Promise<void>;
  close(): Promise<void>;
};

export type StoredAssetMetadata = {
  id: string;
  projectId: string;
  fileName: string;
  mimeType: SupportedImageMimeType;
  byteLength: number;
  crop?: CropParams;
  createdAt: string;
};

export type StoredAssetRecord = StoredAssetMetadata & {
  blob: Blob;
};

export type AssetLoadResult =
  | { state: "empty" }
  | {
      state: "ready";
      asset: StoredAssetMetadata;
      blob: Blob;
    };

export type AssetBlobRepository = {
  saveImageBlob(input: {
    projectId: string;
    blob: Blob;
    fileName: string;
    crop?: CropParamsInput;
  }): Promise<StoredAssetMetadata>;
  getAssetBlob(id: string): Promise<AssetLoadResult>;
  listProjectAssets(projectId: string): Promise<StoredAssetMetadata[]>;
  deleteAsset(id: string): Promise<void>;
  deleteUnreferencedAssets(projectId: string, referencedAssetIds: string[]): Promise<string[]>;
  close(): Promise<void>;
};

export type ProjectBackupPayload = {
  schemaVersion: 1;
  exportedAt: string;
  projects: ProjectDocument[];
  unknownProjects: UnknownVersionProjectRecord[];
  assets: StoredAssetMetadata[];
};
