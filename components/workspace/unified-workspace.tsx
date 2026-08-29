"use client";

import * as React from "react";
import JSZip from "jszip";
import {
  Download,
  ImagePlus,
  Lock,
  LockOpen,
  MoveDown,
  MoveUp,
  Merge,
  Scissors,
  Redo2,
  RefreshCw,
  Settings2,
  Sparkles,
  Undo2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import { copyRichText } from "@/lib/copy-rich-text";
import type { UnifiedArticleBlock, UnifiedArticleContent } from "@/lib/content";
import type { DesignPlan } from "@/lib/design-plan";
import { cardPresetForScheme, DESIGN_SCHEMES, type DesignSchemeId } from "@/lib/design-schemes";
import type { PlatformId } from "@/lib/platforms/types";
import {
  createApproximateTextMeasurer,
  layoutCardPagesToTarget,
  lockCardImagePage,
  mergeAdjacentCardPages,
  moveCardImagePage,
  splitCardImagePageAfterElement,
  type CardLayoutPage,
  type CardLayoutResult,
} from "@/lib/renderers/cards";
import { HostedAIProvider, OpenAICompatibleProvider, generatePlatformVersions } from "@/lib/ai";
import type { WechatImageNode } from "@/lib/renderers/wechat";
import { renderWechatContentHtml } from "@/lib/renderers/wechat";
import {
  createAssetBlobRepository,
  createEmptyProject,
  createProjectRepository,
  readProjectBackupBlob,
  readProjectBackupPayload,
  type ProjectAssetReference,
  type ProjectDocument,
  type StoredAssetRecord,
} from "@/lib/storage";
import { exportDouyinImagePackage, exportProjectBackupPackage, exportXiaohongshuPackage } from "@/lib/export";
import { styleTemplates } from "@/lib/style-templates";
import { cn } from "@/lib/utils";
import {
  DEFAULT_SOURCE_MARKDOWN,
  AUTO_SAVE_DEBOUNCE_MS,
  WORKSPACE_PLATFORM_IDS,
  WORKSPACE_PLATFORM_LABELS,
  applyPlatformDraftReplacements,
  applyDesignSchemeToDraft,
  applyManualPageOrder,
  clearManualCardPages,
  createPlatformDraftSignatureMap,
  createWorkspaceState,
  describeProjectBackupExportStatus,
  describeProjectBackupImportStatus,
  getMissingAiProviderFields,
  isAiProviderConfigured,
  markAiConfigurationIncomplete,
  markAiGenerationFailure,
  parseSourceMarkdown,
  platformDraftFromVersion,
  platformVersionsFromDrafts,
  pushDraftRedoHistory,
  readPersistedWorkspace,
  regeneratePlatformDraft,
  resolveRegenerationPlatforms,
  sanitizeWechatHtml,
  serializeWorkspace,
  selectRestorableBackupProject,
  updatePlatformBlock,
  updatePlatformCaption,
  updatePlatformRatio,
  updatePlatformTags,
  updatePlatformTitle,
  updateWorkspaceSource,
  withLockedCardPage,
  withManualCardPages,
  withWechatHtmlOverride,
} from "./state";
import { createCardPngFilename, loadCardCanvasImages, renderCardPagePngBlob } from "./card-image-actions";
import { createInitialProjectId, describeAssetUploadStatus, type AssetUploadFailure } from "./client-state";
import { DesignPlanDrawer, type SchemeApplyMode } from "./design-plan-drawer";
import { RegenerationDialog } from "./regeneration-dialog";
import { WorkspaceHeader, type WorkspaceFocusMode } from "./workspace-header";
import type { AssetPlaceholder, DraftHistory, LayoutSettings, PlatformDraft, WorkspaceMode, WorkspacePersistedState } from "./types";

type ProjectListItem = {
  id: string;
  title: string;
  updatedAt?: string;
};

const measurer = createApproximateTextMeasurer();

function nowIso() {
  return new Date().toISOString();
}

function remapAssetTokens(value: unknown, replacements: Map<string, string>): unknown {
  if (typeof value === "string") {
    return [...replacements.entries()]
      .sort(([left], [right]) => right.length - left.length)
      .reduce((result, [from, to]) => result.split(`asset:${from}`).join(`asset:${to}`), value);
  }
  if (Array.isArray(value)) return value.map((item) => remapAssetTokens(item, replacements));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, remapAssetTokens(item, replacements)]));
}

function remapProjectAssetReferences(project: ProjectDocument, replacements: Map<string, string>): ProjectDocument {
  return {
    ...project,
    assets: project.assets.map((asset) => ({ ...asset, id: replacements.get(asset.id) ?? asset.id })),
    article: remapAssetTokens(project.article, replacements) as ProjectDocument["article"],
    platformVersions: remapAssetTokens(project.platformVersions, replacements) as ProjectDocument["platformVersions"],
  };
}

type ProjectBackupFile = {
  payload: ReturnType<typeof readProjectBackupPayload>;
  assets: StoredAssetRecord[];
};

async function readProjectBackupFile(file: File): Promise<ProjectBackupFile> {
  if (!file.name.toLowerCase().endsWith(".zip")) {
    return { payload: await readProjectBackupBlob(file), assets: [] };
  }

  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const backupEntry = zip.file("backup.json");
  if (!backupEntry) throw new Error("invalid_backup_package");
  const payload = readProjectBackupPayload(JSON.parse(await backupEntry.async("text")));
  const manifestEntry = zip.file("assets/manifest.json");
  const manifest = manifestEntry ? JSON.parse(await manifestEntry.async("text")) : payload.assets;
  if (!Array.isArray(manifest)) throw new Error("invalid_backup_package_assets");

  const assets: StoredAssetRecord[] = [];
  for (const item of manifest) {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || typeof item.path !== "string") continue;
    const assetEntry = zip.file(item.path);
    if (!assetEntry) throw new Error(`missing_backup_asset:${item.id}`);
    assets.push({
      id: item.id,
      projectId: typeof item.projectId === "string" ? item.projectId : "",
      fileName: typeof item.fileName === "string" ? item.fileName : item.id,
      mimeType: item.mimeType,
      byteLength: typeof item.byteLength === "number" ? item.byteLength : 0,
      crop: item.crop,
      createdAt: typeof item.createdAt === "string" ? item.createdAt : nowIso(),
      blob: await assetEntry.async("blob"),
    });
  }
  return { payload, assets };
}

function createEmptyHistories(): Record<PlatformId, DraftHistory> {
  return Object.fromEntries(WORKSPACE_PLATFORM_IDS.map((platform) => [platform, { past: [], future: [] }])) as unknown as Record<PlatformId, DraftHistory>;
}

function panelVisible(mode: WorkspaceMode, target: WorkspaceMode) {
  return mode === target ? "block" : "hidden lg:block";
}

function blockText(block: UnifiedArticleBlock) {
  if (block.type === "list") return block.items.join("\n");
  if (block.type === "card") return block.title ? `${block.title}：${block.body}` : block.body;
  return block.text;
}

function blockLabel(block: UnifiedArticleBlock) {
  const labels: Record<string, string> = {
    title: "标题",
    lead: "导语",
    section: "小节",
    subsection: "副标题",
    paragraph: "正文",
    quote: "引用",
    golden: "金句",
    summary: "总结",
    cta: "行动",
    image: "图片",
    list: "列表",
    card: "卡片",
    code: "代码",
    divider: "分隔",
    pageBreak: "分页",
  };
  return labels[block.type] ?? block.type;
}

function makeProjectFromWorkspace(projectId: string, projectTitle: string, article: UnifiedArticleContent, assets: ProjectAssetReference[], workspace: WorkspacePersistedState): ProjectDocument {
  const timestamp = nowIso();
  return {
    ...createEmptyProject({ id: projectId, title: projectTitle, article }),
    title: projectTitle,
    article,
    assets,
    platformVersions: serializeWorkspace(workspace),
    updatedAt: timestamp,
  };
}

function workspaceFromDocument(project: ProjectDocument): WorkspacePersistedState {
  return readPersistedWorkspace(project.platformVersions) ?? createWorkspaceState(project.article?.sourceText || DEFAULT_SOURCE_MARKDOWN);
}

function articleAssetId(block: UnifiedArticleBlock) {
  const source = "source" in block ? block.source.sourceText : "";
  return source.match(/\((asset:[^)]+)\)/)?.[1]?.replace("asset:", "");
}

function createWechatImageNodes(article: UnifiedArticleContent, assets: AssetPlaceholder[]): WechatImageNode[] {
  return article.blocks.flatMap((block) => {
    if (block.type !== "image") return [];
    const assetId = articleAssetId(block);
    const asset = assetId ? assets.find((candidate) => candidate.id === assetId) : undefined;
    if (!asset?.objectUrl) return [];
    return [
      {
        id: asset.id,
        blockId: block.id,
        src: asset.objectUrl,
        alt: asset.fileName.replace(/\.[^.]+$/, ""),
        caption: asset.fileName,
        width: 100,
        align: "center",
      },
    ];
  });
}

function createImageUrlByBlock(article: UnifiedArticleContent, assets: AssetPlaceholder[]) {
  return Object.fromEntries(
    article.blocks.flatMap((block) => {
      if (block.type !== "image") return [];
      const assetId = articleAssetId(block);
      const asset = assetId ? assets.find((candidate) => candidate.id === assetId) : undefined;
      return asset?.objectUrl ? [[block.id, asset.objectUrl]] : [];
    }),
  );
}

export default function UnifiedWorkspace() {
  const [workspace, setWorkspace] = React.useState<WorkspacePersistedState>(() => createWorkspaceState());
  const workspaceRef = React.useRef<WorkspacePersistedState>(workspace);
  const [projectId, setProjectId] = React.useState(() => createInitialProjectId());
  const [projectTitle, setProjectTitle] = React.useState("统一自媒体工作区");
  const [projects, setProjects] = React.useState<ProjectListItem[]>([]);
  const [assets, setAssets] = React.useState<AssetPlaceholder[]>([]);
  const [activePlatform, setActivePlatform] = React.useState<PlatformId>("wechat");
  const [mode, setMode] = React.useState<WorkspaceMode>("editor");
  const [focusMode, setFocusMode] = React.useState<WorkspaceFocusMode>("all");
  const [sourcePaneWidth, setSourcePaneWidth] = React.useState(304);
  const [previewPaneWidth, setPreviewPaneWidth] = React.useState(420);
  const [overwriteRequest, setOverwriteRequest] = React.useState<{
    platforms: PlatformId[];
    resolve: (confirmed: boolean) => void;
  }>();
  const [stylePanelOpen, setStylePanelOpen] = React.useState(false);
  const [saveState, setSaveState] = React.useState<"loading" | "dirty" | "saving" | "saved" | "error">("loading");
  const [statusMessage, setStatusMessage] = React.useState("正在恢复本地项目");
  const [history, setHistory] = React.useState<Record<PlatformId, DraftHistory>>(() => createEmptyHistories());
  const historyRef = React.useRef<Record<PlatformId, DraftHistory>>(createEmptyHistories());
  const [sessionApiKey, setSessionApiKey] = React.useState("");
  const [aiRunState, setAiRunState] = React.useState<"idle" | "generating" | "error">("idle");
  const [aiStatusMessage, setAiStatusMessage] = React.useState<string | undefined>();
  const repoRef = React.useRef<ReturnType<typeof createProjectRepository> | undefined>(undefined);
  const assetRepoRef = React.useRef<ReturnType<typeof createAssetBlobRepository> | undefined>(undefined);
  const hydratedRef = React.useRef(false);
  const revisionRef = React.useRef(0);
  const aiAbortRef = React.useRef<AbortController | undefined>(undefined);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const backupInputRef = React.useRef<HTMLInputElement>(null);
  const activeDraft = workspace.platforms[activePlatform];
  const sourceArticle = React.useMemo(() => parseSourceMarkdown(workspace.sourceMarkdown), [workspace.sourceMarkdown]);

  const cardLayout = React.useMemo(() => {
    if (activePlatform === "wechat" || activePlatform === "douyinLongform") return undefined;
    const ratio = activePlatform === "douyinImage" ? activeDraft.ratio : "3:4";
    const scheme = DESIGN_SCHEMES[activeDraft.schemeId];
    const densityScale = scheme.density === "舒展" ? 1.12 : scheme.density === "紧凑" ? 0.86 : 1;
    const lineHeightScale = scheme.typography.lineHeight / 1.78;
    const topOffset = scheme.layoutVariant === "story" ? 90 : scheme.layoutVariant === "checklist" ? 74 : 64;
    const fontFamily = scheme.layoutVariant === "story"
      ? "Songti SC, STSong, SimSun, Georgia, serif"
      : "-apple-system, BlinkMacSystemFont, Helvetica Neue, PingFang SC, Microsoft YaHei, Arial, sans-serif";
    const targetPages = activePlatform === "xiaohongshu"
      ? workspace.designPlan.pagination.xiaohongshuTargetPages
      : workspace.designPlan.pagination.douyinImageTargetPages;
    const result = layoutCardPagesToTarget(activeDraft.content, measurer, {
      aspectRatio: ratio,
      safeArea: {
        top: workspace.layout.margin + topOffset,
        right: workspace.layout.margin,
        bottom: workspace.layout.margin + 64,
        left: workspace.layout.margin,
      },
      typography: {
        fontFamily,
        titleFontSize: Math.round(workspace.layout.titleFontSize * scheme.typography.titleScale),
        headingFontSize: Math.round(workspace.layout.headingFontSize * scheme.typography.headingScale),
        bodyFontSize: Math.round(workspace.layout.bodyFontSize * scheme.typography.bodyScale),
        focusFontSize: Math.round(workspace.layout.focusFontSize * ((scheme.typography.headingScale + scheme.typography.bodyScale) / 2)),
        lineSpacing: Math.min(1.8, Math.max(1.1, workspace.layout.lineSpacing * lineHeightScale)),
        paragraphSpacing: Math.round(workspace.layout.paragraphSpacing * densityScale),
        titleSpacing: Math.round(workspace.layout.titleSpacing * densityScale),
      },
      manualPages: activeDraft.manualPages.map((page) => ({
        id: page.id,
        locked: page.locked,
        layout: page,
      })),
    }, targetPages);
    return applyManualPageOrder(result, activeDraft.manualPages);
  }, [activeDraft, activePlatform, workspace.designPlan.pagination.douyinImageTargetPages, workspace.designPlan.pagination.xiaohongshuTargetPages, workspace.layout]);

  const wechatHtml = React.useMemo(() => {
    const template = styleTemplates[activeDraft.templateKey] ?? styleTemplates.zhenyiKnowledgeMinimal;
    return activeDraft.editedWechatHtml ?? renderWechatContentHtml(activeDraft.content, { template, imageNodes: createWechatImageNodes(activeDraft.content, assets) });
  }, [activeDraft, assets]);

  React.useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  React.useEffect(() => {
    historyRef.current = history;
  }, [history]);

  React.useEffect(() => {
    repoRef.current = createProjectRepository();
    assetRepoRef.current = createAssetBlobRepository();
    void loadLatestProject();

    return () => {
      assets.forEach((asset) => {
        if (asset.objectUrl) URL.revokeObjectURL(asset.objectUrl);
      });
      void repoRef.current?.close();
      void assetRepoRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!hydratedRef.current) return;
    revisionRef.current += 1;
    setSaveState("dirty");
    const timer = window.setTimeout(() => {
      void saveProject();
    }, AUTO_SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace, projectTitle, assets]);

  async function refreshProjects() {
    const repo = repoRef.current;
    if (!repo) return;
    const records = await repo.listProjects();
    setProjects(
      records.flatMap((record) =>
        record.state === "ready" ? [{ id: record.project.id, title: record.project.title, updatedAt: record.project.updatedAt }] : [],
      ),
    );
  }

  async function loadAssetPlaceholders(projectAssets: ProjectAssetReference[]) {
    const assetRepo = assetRepoRef.current;
    const placeholders: AssetPlaceholder[] = [];
    let missingAssetCount = 0;
    for (const asset of projectAssets) {
      const loaded = await assetRepo?.getAssetBlob(asset.id);
      if (loaded?.state !== "ready") missingAssetCount += 1;
      placeholders.push({
        id: asset.id,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        byteLength: asset.byteLength,
        objectUrl: loaded?.state === "ready" ? URL.createObjectURL(loaded.blob) : undefined,
      });
    }
    return { assets: placeholders, missingAssetCount };
  }

  async function hydrateAssets(projectAssets: ProjectAssetReference[]) {
    const result = await loadAssetPlaceholders(projectAssets);
    replaceAssets(result.assets);
    return { missingAssetCount: result.missingAssetCount };
  }

  async function loadLatestProject() {
    const repo = repoRef.current;
    if (!repo) return;
    setSaveState("loading");
    try {
      const result = await repo.getLatestProject();
      if (result.state === "ready") {
        const restored = workspaceFromDocument(result.project);
        setProjectId(result.project.id);
        setProjectTitle(result.project.title);
        replaceWorkspace(restored);
        await hydrateAssets(result.project.assets);
        setStatusMessage("已恢复本地项目");
      } else if (result.state === "unknownVersion") {
        const fresh = createWorkspaceState();
        const project = createEmptyProject({ title: "统一自媒体工作区", article: parseSourceMarkdown(fresh.sourceMarkdown) });
        setProjectId(project.id);
        setProjectTitle(project.title);
        replaceWorkspace(fresh);
        setStatusMessage("发现更高版本项目，已保留数据并载入本地演示");
      } else {
        const fresh = createWorkspaceState();
        const project = createEmptyProject({ title: "统一自媒体工作区", article: parseSourceMarkdown(fresh.sourceMarkdown) });
        setProjectId(project.id);
        setProjectTitle(project.title);
        replaceWorkspace(fresh);
        setStatusMessage("已创建本地演示项目");
      }
      await refreshProjects();
      hydratedRef.current = true;
      setSaveState("saved");
    } catch (error) {
      const fresh = createWorkspaceState();
      const project = createEmptyProject({ title: "统一自媒体工作区", article: parseSourceMarkdown(fresh.sourceMarkdown) });
      setProjectId(project.id);
      setProjectTitle(project.title);
      replaceWorkspace(fresh);
      replaceAssets([]);
      resetPlatformHistories();
      hydratedRef.current = true;
      setSaveState("error");
      setStatusMessage(error instanceof Error ? error.message : "项目恢复失败，当前使用本地演示");
    }
  }

  async function saveProject() {
    const repo = repoRef.current;
    if (!repo) return false;
    const saveRevision = revisionRef.current;
    setSaveState("saving");
    try {
      const projectAssets = assets.map((asset) => ({
        id: asset.id,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        byteLength: asset.byteLength,
      }));
      await repo.saveProject(makeProjectFromWorkspace(projectId, projectTitle, sourceArticle, projectAssets, workspace));
      await refreshProjects();
      if (saveRevision === revisionRef.current) {
        setSaveState("saved");
        setStatusMessage("已保存到浏览器本地");
      } else {
        setSaveState("dirty");
      }
      return true;
    } catch (error) {
      setSaveState("error");
      setStatusMessage(error instanceof Error ? error.message : "保存失败，已有内容未清空");
      return false;
    }
  }

  function currentProjectAssetReferences(): ProjectAssetReference[] {
    return assets.map((asset) => ({
      id: asset.id,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      byteLength: asset.byteLength,
    }));
  }

  function currentProjectDocument() {
    return makeProjectFromWorkspace(projectId, projectTitle, sourceArticle, currentProjectAssetReferences(), workspace);
  }

  async function exportCurrentProjectBackup() {
    const assetRepo = assetRepoRef.current;
    const saved = await saveProject();
    if (!saved) {
      setStatusMessage("保存失败，未导出项目");
      return;
    }
    try {
      const project = currentProjectDocument();
      const storedAssets: StoredAssetRecord[] = [];
      for (const asset of project.assets) {
        const loaded = await assetRepo?.getAssetBlob(asset.id);
        if (loaded?.state !== "ready") throw new Error(`项目图片 ${asset.fileName} 不存在，无法生成完整备份包`);
        storedAssets.push({ ...loaded.asset, blob: loaded.blob });
      }
      const result = await exportProjectBackupPackage({ project, assets: storedAssets });
      downloadBlob(result.zipBlob, `${projectTitle || "workspace"}-backup.zip`);
      setStatusMessage(describeProjectBackupExportStatus(result.assetFiles.length));
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "项目备份导出失败");
    }
  }

  async function importProjectBackup(file: File) {
    try {
      const backup = await readProjectBackupFile(file);
      const selectedProject = selectRestorableBackupProject(backup.payload);
      if (!selectedProject) {
        setStatusMessage("备份文件无可恢复项目");
        return;
      }
      const canReplace = await confirmAndSaveBeforeReplacing("当前项目有未保存内容。先保存再导入项目？");
      if (!canReplace) return;

      const assetRepo = assetRepoRef.current;
      const importedProject = createEmptyProject({ title: selectedProject.title, article: selectedProject.article });
      const assetIdMap = new Map<string, string>();
      for (const asset of backup.assets) {
        const restored = await assetRepo?.saveImageBlob({ projectId: importedProject.id, blob: asset.blob, fileName: asset.fileName, crop: asset.crop });
        if (!restored) throw new Error("当前浏览器不支持恢复项目图片");
        assetIdMap.set(asset.id, restored.id);
      }
      const project = remapProjectAssetReferences(selectedProject, assetIdMap);
      const importedWorkspace = workspaceFromDocument(project);
      const importedAssets = await loadAssetPlaceholders(project.assets);
      hydratedRef.current = false;
      setProjectId(importedProject.id);
      setProjectTitle(project.title);
      replaceWorkspace(importedWorkspace);
      replaceAssets(importedAssets.assets);
      resetPlatformHistories();
      revisionRef.current += 1;
      hydratedRef.current = true;
      setSaveState("dirty");
      setStatusMessage(describeProjectBackupImportStatus(importedAssets.missingAssetCount));
    } catch {
      setStatusMessage("备份文件无效，当前项目已保留");
    }
  }

  async function openProject(id: string) {
    const repo = repoRef.current;
    if (!repo) return;
    if (id === projectId) return;
    const canReplace = await confirmAndSaveBeforeReplacing("当前项目有未保存内容。先保存再打开其他项目？");
    if (!canReplace) return;
    const result = await repo.getProject(id);
    if (result.state !== "ready") {
      setStatusMessage(result.state === "unknownVersion" ? "项目版本过高，无法在当前版本打开" : "项目不存在");
      return;
    }
    hydratedRef.current = false;
    setProjectId(result.project.id);
    setProjectTitle(result.project.title);
    replaceWorkspace(workspaceFromDocument(result.project));
    await hydrateAssets(result.project.assets);
    resetPlatformHistories();
    revisionRef.current = 0;
    hydratedRef.current = true;
    setSaveState("saved");
    setStatusMessage("项目已打开");
  }

  async function createNewProject() {
    const canReplace = await confirmAndSaveBeforeReplacing("当前项目有未保存内容。先保存再新建项目？");
    if (!canReplace) return;
    replaceWithNewProject();
  }

  function replaceWithNewProject() {
    const fresh = createWorkspaceState();
    const project = createEmptyProject({ title: "未命名项目", article: parseSourceMarkdown(fresh.sourceMarkdown) });
    hydratedRef.current = false;
    setProjectId(project.id);
    setProjectTitle(project.title);
    replaceWorkspace(fresh);
    replaceAssets([]);
    resetPlatformHistories();
    revisionRef.current += 1;
    hydratedRef.current = true;
    setSaveState("dirty");
    setStatusMessage("已新建项目");
  }

  async function deleteCurrentProject() {
    const repo = repoRef.current;
    const assetRepo = assetRepoRef.current;
    if (!repo) return;
    if (!window.confirm("确定删除当前项目？项目记录和未保存修改会被移除。")) return;
    try {
      await repo.deleteProject(projectId, { assetRepository: assetRepo });
      replaceWithNewProject();
      await refreshProjects();
      setStatusMessage("项目已删除");
    } catch (error) {
      setSaveState("error");
      setStatusMessage(error instanceof Error ? error.message : "删除失败");
    }
  }

  async function confirmAndSaveBeforeReplacing(message: string) {
    if (saveState !== "dirty" && saveState !== "saving" && saveState !== "error") return true;
    if (!window.confirm(message)) return false;
    const saved = await saveProject();
    if (!saved) {
      setStatusMessage("保存失败，已保留当前项目");
    }
    return saved;
  }

  function replaceAssets(nextAssets: AssetPlaceholder[]) {
    setAssets((previous) => {
      previous.forEach((asset) => {
        if (asset.objectUrl) URL.revokeObjectURL(asset.objectUrl);
      });
      return nextAssets;
    });
  }

  function replaceWorkspace(next: WorkspacePersistedState) {
    workspaceRef.current = next;
    setWorkspace(next);
  }

  function updateWorkspace(patch: Partial<WorkspacePersistedState>) {
    setWorkspace((current) => {
      const next = { ...current, ...patch };
      workspaceRef.current = next;
      return next;
    });
  }

  function resetPlatformHistories() {
    const nextHistories = createEmptyHistories();
    historyRef.current = nextHistories;
    setHistory(nextHistories);
  }

  function applyPlatformReplacements(replacements: Partial<Record<PlatformId, PlatformDraft>>, changedSince?: Partial<Record<PlatformId, string>>) {
    const current = workspaceRef.current;
    const result = applyPlatformDraftReplacements({
      drafts: current.platforms,
      histories: historyRef.current,
      replacements,
      changedSince,
    });
    const next = {
      ...current,
      platforms: result.drafts,
    };
    workspaceRef.current = next;
    historyRef.current = result.histories;
    setHistory(result.histories);
    setWorkspace(next);
    return { appliedPlatforms: result.appliedPlatforms, skippedChangedPlatforms: result.skippedChangedPlatforms };
  }

  function commitPlatform(nextDraft: PlatformDraft) {
    applyPlatformReplacements({ [nextDraft.platform]: nextDraft });
  }

  async function regenerateCurrentPlatform() {
    await regeneratePlatforms([activePlatform]);
  }

  async function regeneratePlatforms(platforms: PlatformId[]) {
    if (!hydratedRef.current) {
      setStatusMessage("本地项目仍在恢复，请稍候再重试；当前编辑稿未改变");
      return;
    }

    if (workspace.ai.mode === "deterministic") {
      const regeneration = await confirmEditedRegeneration(platforms);
      if (!regeneration.platforms.length) {
        setAiRunState("idle");
        setStatusMessage("已取消覆盖人工编辑稿，内容已保留");
        return;
      }
      applyDeterministicRegeneration(regeneration.platforms);
      setAiRunState("idle");
      setStatusMessage(regeneration.skippedEditedPlatforms.length ? "已使用本地确定性生成，人工编辑稿已保留" : "已使用本地确定性生成");
      return;
    }

    const missingFields = getMissingAiProviderFields(workspace.ai, sessionApiKey);
    if (!isAiProviderConfigured(workspace.ai, sessionApiKey)) {
      replaceWorkspace(markAiConfigurationIncomplete(workspaceRef.current, missingFields));
      setAiRunState("error");
      const message = `AI 配置不完整：请填写 ${missingFields.join("、") || "Base URL、模型、Session API Key"}，或切回本地模式后重新生成。`;
      setAiStatusMessage(message);
      setStatusMessage(message);
      return;
    }

    const regeneration = await confirmEditedRegeneration(platforms);
    if (!regeneration.platforms.length) {
      setAiRunState("idle");
      setStatusMessage("已取消覆盖人工编辑稿，内容已保留");
      return;
    }

    aiAbortRef.current?.abort();
    const controller = new AbortController();
    aiAbortRef.current = controller;
    const requestDraftSignatures = createPlatformDraftSignatureMap(workspaceRef.current.platforms, regeneration.platforms);
    setAiRunState("generating");
    setAiStatusMessage("正在生成平台版本");
    setStatusMessage("正在生成平台版本");

    const provider = workspace.ai.mode === "hosted"
      ? new HostedAIProvider()
      : new OpenAICompatibleProvider({
          baseUrl: workspace.ai.baseUrl.trim(),
          model: workspace.ai.model.trim(),
          apiKey: sessionApiKey.trim(),
          timeoutMs: 30000,
        });

    const completedPlatforms: PlatformId[] = [];
    const skippedChangedPlatforms: PlatformId[] = [];
    const failedPlatforms: Array<{ platform: PlatformId; message: string }> = [];
    let factCheckWarningCount = 0;
    let cancelled = false;

    for (const [index, platform] of regeneration.platforms.entries()) {
      const progressMessage = `正在生成${WORKSPACE_PLATFORM_LABELS[platform]}（${index + 1}/${regeneration.platforms.length}）`;
      setAiStatusMessage(progressMessage);
      setStatusMessage(progressMessage);
      const result = await generatePlatformVersions({
        provider,
        source: sourceArticle,
        sourceVersionId: workspaceRef.current.sourceRevision,
        platforms: [platform],
        existingVersions: platformVersionsFromDrafts(workspaceRef.current.platforms),
        signal: controller.signal,
      });

      if (result.ok) {
        completedPlatforms.push(platform);
        factCheckWarningCount += result.diagnostics.details?.filter((detail) => detail.includes(":fact_check_warning:")).length ?? 0;
        const current = workspaceRef.current;
        const replacements = createGeneratedDraftReplacements(current.platforms, result.versions, [platform]);
        const merged = applyPlatformDraftReplacements({
          drafts: current.platforms,
          histories: historyRef.current,
          replacements,
          changedSince: requestDraftSignatures,
        });
        const next = {
          ...current,
          designPlan: result.designPlan,
          sourceRevision: result.designPlan.sourceRevision,
          ai: { ...current.ai, lastFallbackReason: undefined },
          platforms: merged.drafts,
        };
        workspaceRef.current = next;
        historyRef.current = merged.histories;
        setHistory(merged.histories);
        setWorkspace(next);
        skippedChangedPlatforms.push(...merged.skippedChangedPlatforms);
        continue;
      }

      if (result.error.code === "cancelled") {
        cancelled = true;
        break;
      }

      failedPlatforms.push({ platform, message: result.error.message });
    }

    if (aiAbortRef.current === controller) aiAbortRef.current = undefined;

    if (cancelled) {
      setAiRunState("idle");
      const message = completedPlatforms.length ? `已取消生成，已保留 ${completedPlatforms.length} 个已完成平台版本` : "AI 生成已取消";
      setAiStatusMessage(message);
      setStatusMessage(message);
      return;
    }

    const reviewNotice = factCheckWarningCount > 0 ? "，请复核其中的数字或引用" : "";
    const editedNotice =
      regeneration.skippedEditedPlatforms.length || skippedChangedPlatforms.length ? "，人工编辑稿已保留" : "";
    const failedNotice = failedPlatforms.length
      ? `，${failedPlatforms.map(({ platform }) => `${WORKSPACE_PLATFORM_LABELS[platform]}生成失败`).join("、")}`
      : "";

    if (completedPlatforms.length > 0) {
      setAiRunState("idle");
      const message = `AI 已完成 ${completedPlatforms.length} 个平台版本${failedNotice}${editedNotice}${reviewNotice}`;
      setAiStatusMessage(message);
      setStatusMessage(message);
      return;
    }

    const failureMessage = failedPlatforms[0]?.message ?? "AI 生成失败";
    replaceWorkspace(markAiGenerationFailure(workspaceRef.current, failureMessage));
    setAiRunState("error");
    const message = `${failureMessage} 已保留当前编辑稿`;
    setAiStatusMessage(message);
    setStatusMessage(message);
  }

  function reparseCurrentPlatform() {
    if (!hydratedRef.current) {
      setStatusMessage("本地项目仍在恢复，请稍候再试；当前编辑稿未改变");
      return;
    }

    const current = workspaceRef.current;
    const next = updateWorkspaceSource(current, current.sourceMarkdown);
    replaceWorkspace(next);
    setAiRunState("idle");
    setAiStatusMessage(undefined);
    setStatusMessage(`源文分析完成，推荐“${DESIGN_SCHEMES[next.designPlan.recommendedScheme].name}”；平台稿尚未覆盖`);
  }

  async function confirmEditedRegeneration(platforms: PlatformId[]) {
    const editedPlatforms = platforms.filter((platform) => workspaceRef.current.platforms[platform].status === "edited");
    if (!editedPlatforms.length) return resolveRegenerationPlatforms(workspaceRef.current.platforms, platforms, () => true);
    const confirmed = await new Promise<boolean>((resolve) => {
      setOverwriteRequest({ platforms: editedPlatforms, resolve });
    });
    return resolveRegenerationPlatforms(workspaceRef.current.platforms, platforms, () => confirmed);
  }

  function settleOverwriteRequest(confirmed: boolean) {
    overwriteRequest?.resolve(confirmed);
    setOverwriteRequest(undefined);
  }

  function applyDeterministicRegeneration(platforms: PlatformId[]) {
    const current = workspaceRef.current;
    const replacements = Object.fromEntries(
      platforms.map((platform) => [platform, regeneratePlatformDraft(current.platforms[platform], sourceArticle, current.ai, current.designPlan)]),
    ) as Partial<Record<PlatformId, PlatformDraft>>;
    applyPlatformReplacements(replacements);
  }

  function createGeneratedDraftReplacements(currentDrafts: Record<PlatformId, PlatformDraft>, versions: ReturnType<typeof platformVersionsFromDrafts>, platforms: PlatformId[]) {
    return Object.fromEntries(
      platforms.flatMap((platform) => {
        const version = versions[platform];
        return version ? [[platform, platformDraftFromVersion(currentDrafts[platform], version, workspaceRef.current.sourceRevision)]] : [];
      }),
    ) as Partial<Record<PlatformId, PlatformDraft>>;
  }

  function cancelAiGeneration() {
    aiAbortRef.current?.abort();
  }

  function undoPlatform() {
    const h = historyRef.current[activePlatform];
    const previous = h.past.at(-1);
    if (!previous) return;
    const nextHistory = {
      ...historyRef.current,
      [activePlatform]: {
        past: h.past.slice(0, -1),
        future: [workspaceRef.current.platforms[activePlatform], ...h.future],
      },
    };
    const nextWorkspace = { ...workspaceRef.current, platforms: { ...workspaceRef.current.platforms, [activePlatform]: previous } };
    historyRef.current = nextHistory;
    workspaceRef.current = nextWorkspace;
    setHistory(nextHistory);
    setWorkspace(nextWorkspace);
  }

  function redoPlatform() {
    const h = historyRef.current[activePlatform];
    const next = h.future[0];
    if (!next) return;
    const nextHistory = {
      ...historyRef.current,
      [activePlatform]: pushDraftRedoHistory(h, workspaceRef.current.platforms[activePlatform]),
    };
    const nextWorkspace = { ...workspaceRef.current, platforms: { ...workspaceRef.current.platforms, [activePlatform]: next } };
    historyRef.current = nextHistory;
    workspaceRef.current = nextWorkspace;
    setHistory(nextHistory);
    setWorkspace(nextWorkspace);
  }

  async function uploadAssets(files: FileList | File[]) {
    const assetRepo = assetRepoRef.current;
    if (!assetRepo) return;
    const uploaded: AssetPlaceholder[] = [];
    const failures: AssetUploadFailure[] = [];
    for (const file of Array.from(files)) {
      try {
        const saved = await assetRepo.saveImageBlob({ projectId, blob: file, fileName: file.name });
        uploaded.push({ ...saved, objectUrl: URL.createObjectURL(file) });
      } catch (error) {
        failures.push({ fileName: file.name, message: error instanceof Error ? error.message : "" });
      }
    }
    if (uploaded.length) {
      setAssets((current) => [...current, ...uploaded]);
    }
    const status = describeAssetUploadStatus(uploaded.length, failures);
    if (status) setStatusMessage(status);
  }

  function insertAsset(asset: AssetPlaceholder) {
    updateWorkspace({
      sourceMarkdown: `${workspace.sourceMarkdown.trimEnd()}\n\n![${asset.fileName.replace(/\.[^.]+$/, "")}](asset:${asset.id})\n`,
    });
    setMode("source");
    setStatusMessage("图片已插入源文，重新生成后同步到平台预览");
  }

  async function copyWechat() {
    try {
      await copyRichText(sanitizeWechatHtml(wechatHtml));
      setStatusMessage("公众号富文本已复制");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "复制失败，请改用导出 HTML");
    }
  }

  async function copyText(text: string, success: string) {
    try {
      await navigator.clipboard.writeText(text);
      setStatusMessage(success);
    } catch {
      setStatusMessage("剪贴板不可用，请手动选择复制");
    }
  }

  function downloadWechatHtml() {
    const blob = new Blob([sanitizeWechatHtml(wechatHtml)], { type: "text/html;charset=utf-8" });
    downloadBlob(blob, `${activeDraft.title || "wechat"}.html`);
  }

  async function exportCardPng(page: CardLayoutPage) {
    const blob = await renderCardPagePngBlob(page, createImageUrlByBlock(activeDraft.content, assets), { preset: cardPresetForScheme(activeDraft.schemeId) });
    if (blob) downloadBlob(blob, createCardPngFilename(activeDraft.title, activePlatform, page.pageNumber));
  }

  async function exportCardPackage() {
    if (!cardLayout || activePlatform === "wechat" || activePlatform === "douyinLongform") return;
    try {
      const imageUrlByBlock = createImageUrlByBlock(activeDraft.content, assets);
      const imageSources: Record<string, CanvasImageSource> = {};
      for (const page of cardLayout.pages) {
        Object.assign(imageSources, await loadCardCanvasImages(page, imageUrlByBlock));
      }
      const result =
        activePlatform === "xiaohongshu"
          ? await exportXiaohongshuPackage({ content: activeDraft.content, pages: cardLayout.pages, images: imageSources, preset: cardPresetForScheme(activeDraft.schemeId) })
          : await exportDouyinImagePackage({ content: activeDraft.content, ratio: activeDraft.ratio, pages: cardLayout.pages, images: imageSources, preset: cardPresetForScheme(activeDraft.schemeId) });
      downloadBlob(result.zipBlob, `${activeDraft.title || "cards"}-${activePlatform}.zip`);
      setStatusMessage(`${WORKSPACE_PLATFORM_LABELS[activePlatform]}整包已导出，包含 ${result.images.length} 张 PNG 和文案清单`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "图文整包导出失败");
    }
  }

  async function copyCardPng(page: CardLayoutPage) {
    const blob = await renderCardPagePngBlob(page, createImageUrlByBlock(activeDraft.content, assets), { preset: cardPresetForScheme(activeDraft.schemeId) });
    if (!blob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setStatusMessage("PNG 已复制");
    } catch {
      setStatusMessage("图片剪贴板不可用，已保留下载入口");
    }
  }

  function updateLayout(patch: Partial<LayoutSettings>) {
    updateWorkspace({ layout: { ...workspace.layout, ...patch } });
  }

  function applyManualLayout(nextLayout: CardLayoutResult) {
    commitPlatform(withManualCardPages(activeDraft, nextLayout.pages));
  }

  function lockPage(page: CardLayoutPage) {
    if (!cardLayout) return;
    if (page.locked) {
      commitPlatform(withLockedCardPage(activeDraft, page, false));
      return;
    }
    const lockedLayout = lockCardImagePage(cardLayout, page.id, { images: imagePlacementsFromPage(page) });
    const lockedPage = lockedLayout.pages.find((candidate) => candidate.id === page.id) ?? page;
    commitPlatform(withLockedCardPage(activeDraft, lockedPage, true));
  }

  function splitPage(page: CardLayoutPage, elementId: string) {
    if (!cardLayout) return;
    applyManualLayout(splitCardImagePageAfterElement(cardLayout, page.id, elementId));
  }

  function mergePage(page: CardLayoutPage) {
    if (!cardLayout) return;
    applyManualLayout(mergeAdjacentCardPages(cardLayout, page.id));
  }

  function movePage(page: CardLayoutPage, direction: -1 | 1) {
    if (!cardLayout) return;
    const nextIndex = page.pageNumber - 1 + direction;
    const moved = moveCardImagePage(cardLayout, page.id, nextIndex);
    commitPlatform(withManualCardPages(activeDraft, moved.pages.map((candidate) => ({ ...candidate, manual: true }))));
  }

  function clearManualPages() {
    commitPlatform(clearManualCardPages(activeDraft));
  }

  function applyScheme(schemeId: DesignSchemeId, mode: SchemeApplyMode) {
    const current = workspaceRef.current;
    const currentDraft = current.platforms[activePlatform];
    const scheme = DESIGN_SCHEMES[schemeId];
    const replacement = mode === "visual"
      ? applyDesignSchemeToDraft(currentDraft, schemeId)
      : regeneratePlatformDraft(
          { ...currentDraft, schemeId, templateKey: scheme.templateKey },
          sourceArticle,
          { ...current.ai, mode: "deterministic" },
          {
            ...current.designPlan,
            recommendedScheme: schemeId,
            visualStyle: scheme.name,
            palette: { ...scheme.palette },
            typography: { ...scheme.typography },
            density: scheme.density,
          },
        );
    const merged = applyPlatformDraftReplacements({
      drafts: current.platforms,
      histories: historyRef.current,
      replacements: { [activePlatform]: replacement },
    });
    const recentSchemeIds = [schemeId, ...current.recentSchemeIds.filter((id) => id !== schemeId)].slice(0, 3);
    const next = { ...current, platforms: merged.drafts, recentSchemeIds };
    workspaceRef.current = next;
    historyRef.current = merged.histories;
    setHistory(merged.histories);
    setWorkspace(next);
    setStatusMessage(mode === "visual" ? `已应用“${scheme.name}”视觉，平台文案未改变` : `已按“${scheme.name}”重排当前平台`);
  }

  function toggleFavoriteScheme(schemeId: DesignSchemeId) {
    const current = workspaceRef.current;
    const favoriteSchemeIds = current.favoriteSchemeIds.includes(schemeId)
      ? current.favoriteSchemeIds.filter((id) => id !== schemeId)
      : [...current.favoriteSchemeIds, schemeId];
    updateWorkspace({ favoriteSchemeIds });
  }

  function startPaneResize(side: "source" | "preview", event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = side === "source" ? sourcePaneWidth : previewPaneWidth;
    const onMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      if (side === "source") setSourcePaneWidth(Math.min(390, Math.max(260, startWidth + delta)));
      else setPreviewPaneWidth(Math.min(560, Math.max(360, startWidth - delta)));
    };
    const onEnd = () => {
      document.body.classList.remove("workspace-resizing");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
    };
    document.body.classList.add("workspace-resizing");
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd, { once: true });
  }

  return (
    <main data-workspace-shell className="flex min-h-screen flex-col bg-[#edf2ef] text-[#17231f] lg:h-screen lg:overflow-hidden">
      <WorkspaceHeader
        projectId={projectId}
        projectTitle={projectTitle}
        projects={projects}
        saveStateLabel={saveStateLabel(saveState)}
        saveError={saveState === "error"}
        statusMessage={statusMessage}
        activePlatform={activePlatform}
        platformStatus={Object.fromEntries(WORKSPACE_PLATFORM_IDS.map((platform) => [
          platform,
          draftStatusLabel(workspace.platforms[platform], workspace.sourceRevision),
        ])) as Record<PlatformId, string>}
        mode={mode}
        focusMode={focusMode}
        generating={aiRunState === "generating"}
        onProjectTitleChange={setProjectTitle}
        onOpenProject={(id) => void openProject(id)}
        onPlatformChange={setActivePlatform}
        onModeChange={setMode}
        onFocusModeChange={setFocusMode}
        onGenerate={() => void regenerateCurrentPlatform()}
        onOpenStyles={() => setStylePanelOpen(true)}
        onNew={() => void createNewProject()}
        onSave={() => void saveProject()}
        onExport={() => void exportCurrentProjectBackup()}
        onImport={() => backupInputRef.current?.click()}
        onDelete={() => void deleteCurrentProject()}
      />

      <DesignPlanDrawer
        open={stylePanelOpen}
        onClose={() => setStylePanelOpen(false)}
        activePlatform={activePlatform}
        draft={activeDraft}
        plan={workspace.designPlan}
        layout={workspace.layout}
        favoriteSchemeIds={workspace.favoriteSchemeIds}
        recentSchemeIds={workspace.recentSchemeIds}
        onLayoutChange={updateLayout}
        onApplyScheme={applyScheme}
        onToggleFavorite={toggleFavoriteScheme}
        onRatioChange={(ratio) => commitPlatform(updatePlatformRatio(activeDraft, ratio))}
      />
      <RegenerationDialog
        open={Boolean(overwriteRequest)}
        platformLabels={(overwriteRequest?.platforms ?? []).map((platform) => WORKSPACE_PLATFORM_LABELS[platform])}
        onConfirm={() => settleOverwriteRequest(true)}
        onCancel={() => settleOverwriteRequest(false)}
      />

      <div
        className="workspace-grid mx-auto grid w-full max-w-[1760px] grid-cols-1 p-2 lg:min-h-0 lg:flex-1 lg:overflow-hidden"
        data-focus-mode={focusMode}
        style={{ "--source-pane-width": `${sourcePaneWidth}px`, "--preview-pane-width": `${previewPaneWidth}px` } as React.CSSProperties}
      >
        <aside className={cn("overflow-hidden border border-[#d8e1dc] bg-white lg:min-h-0", panelVisible(mode, "source"), focusMode !== "all" && "lg:hidden")}>
          <SourcePanel
            sourceMarkdown={workspace.sourceMarkdown}
            article={sourceArticle}
            assets={assets}
            onSourceChange={(sourceMarkdown) => replaceWorkspace(updateWorkspaceSource(workspaceRef.current, sourceMarkdown))}
            onReparse={reparseCurrentPlatform}
            onPickImages={() => fileInputRef.current?.click()}
            onUpload={uploadAssets}
            onInsertAsset={insertAsset}
          />
        </aside>

        {focusMode === "all" && <PaneResizer label="调整源文栏宽" onPointerDown={(event) => startPaneResize("source", event)} />}

        <section className={cn("min-w-0 overflow-hidden border border-[#d8e1dc] bg-white lg:min-h-0", panelVisible(mode, "editor"), focusMode === "preview" && "lg:hidden")}>
          <PlatformEditor
            draft={activeDraft}
            plan={workspace.designPlan}
            history={history[activePlatform]}
            onDraftChange={commitPlatform}
            onUndo={undoPlatform}
            onRedo={redoPlatform}
            onCopyText={copyText}
          />
        </section>


        {focusMode !== "preview" && <PaneResizer label="调整预览栏宽" onPointerDown={(event) => startPaneResize("preview", event)} />}

        <aside className={cn("overflow-hidden border border-[#d8e1dc] bg-white lg:min-h-0", panelVisible(mode, "preview"))}>
          <PreviewPanel
            activePlatform={activePlatform}
            draft={activeDraft}
            plan={workspace.designPlan}
            currentSourceRevision={workspace.sourceRevision}
            wechatHtml={wechatHtml}
            cardLayout={cardLayout}
            imageUrlByBlock={createImageUrlByBlock(activeDraft.content, assets)}
            onWechatPreviewBlur={(html) => commitPlatform(withWechatHtmlOverride(activeDraft, html))}
            onCopyWechat={copyWechat}
            onExportWechat={downloadWechatHtml}
            onTogglePageLock={lockPage}
            onSplitPage={splitPage}
            onMergePage={mergePage}
            onMovePage={movePage}
            onClearManualPages={clearManualPages}
            onExportCard={(page) => void exportCardPng(page)}
            onCopyCard={(page) => void copyCardPng(page)}
            onExportPackage={() => void exportCardPackage()}
            aiMode={workspace.ai.mode}
            aiBaseUrl={workspace.ai.baseUrl}
            aiModel={workspace.ai.model}
            aiRunState={aiRunState}
            aiFallbackReason={workspace.ai.lastFallbackReason}
            aiStatusMessage={aiStatusMessage}
            statusMessage={statusMessage}
            sessionApiKey={sessionApiKey}
            onAiModeChange={(modeValue) => {
              setAiStatusMessage(undefined);
              updateWorkspace({
                ai: {
                  ...workspace.ai,
                  mode: modeValue,
                  lastFallbackReason:
                    modeValue === "hosted"
                      ? "服务端 AI：密钥和上游地址由部署环境管理。"
                      : modeValue === "custom"
                        ? "自定义接口密钥只保存在当前会话，不会写入项目。"
                        : "当前使用本地确定性转换。",
                },
              });
            }}
            onAiBaseUrlChange={(baseUrl) => updateWorkspace({ ai: { ...workspace.ai, baseUrl } })}
            onAiModelChange={(model) => updateWorkspace({ ai: { ...workspace.ai, model } })}
            onSessionApiKeyChange={setSessionApiKey}
            onCancelAi={cancelAiGeneration}
            onRetryAi={() => void regenerateCurrentPlatform()}
            onOpenStyles={() => setStylePanelOpen(true)}
          />
        </aside>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.currentTarget.files) void uploadAssets(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />
      <input
        ref={backupInputRef}
        type="file"
        accept="application/json,.json,application/zip,.zip"
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void importProjectBackup(file);
          event.currentTarget.value = "";
        }}
      />
    </main>
  );
}

function SourcePanel(props: {
  sourceMarkdown: string;
  article: UnifiedArticleContent;
  assets: AssetPlaceholder[];
  onSourceChange: (value: string) => void;
  onReparse: () => void;
  onPickImages: () => void;
  onUpload: (files: FileList | File[]) => Promise<void>;
  onInsertAsset: (asset: AssetPlaceholder) => void;
}) {
  return (
    <div
      className="flex h-full flex-col"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        void props.onUpload(event.dataTransfer.files);
      }}
    >
      <div className="border-b border-[#e3e9e5] bg-[#fbfcfb] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">源文与素材</h2>
            <p className="mt-1 text-xs text-muted-foreground">编辑源文，分析后再生成当前平台</p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={props.onReparse}>
            <RefreshCw className="h-4 w-4" />
            分析源文
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <Metric label="内容块" value={props.article.blocks.length} />
          <Metric label="图片" value={props.article.blocks.filter((block) => block.type === "image").length} />
          <Metric label="告警" value={props.article.warnings.length} />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-4 lg:overflow-hidden">
        <Textarea
          value={props.sourceMarkdown}
          onChange={(event) => props.onSourceChange(event.target.value)}
          className="min-h-[260px] flex-1 resize-none overflow-y-auto rounded-lg border-[#d8e1dc] bg-[#fbfcfb] font-mono text-sm leading-6 shadow-none focus-visible:ring-[#8fc8a8] lg:min-h-0"
          spellCheck={false}
          aria-label="源文 Markdown"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={props.onPickImages}>
            <ImagePlus className="h-4 w-4" />
            上传图片
          </Button>
        </div>
      </div>
      <div className="max-h-48 overflow-y-auto border-t border-[#e3e9e5] bg-[#fbfcfb] p-4 lg:max-h-44">
        <h3 className="mb-2 text-xs font-semibold text-[#4c6659]">素材</h3>
        <div className="grid grid-cols-2 gap-2">
          {props.assets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              className="overflow-hidden rounded-lg border border-[#d8e1dc] bg-white text-left transition-shadow hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8fc8a8]"
              onClick={() => props.onInsertAsset(asset)}
            >
              {asset.objectUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={asset.objectUrl} alt="" className="h-24 w-full object-cover" />
              ) : (
                <div className="h-24 bg-muted" />
              )}
              <span className="block truncate px-2 py-1 text-xs">{asset.fileName}</span>
            </button>
          ))}
          {!props.assets.length && <div className="col-span-2 rounded-lg border border-dashed border-[#b8c9bf] p-4 text-center text-xs text-muted-foreground">拖入或上传 PNG/JPEG/WebP</div>}
        </div>
      </div>
    </div>
  );
}

function PlatformEditor(props: {
  draft: PlatformDraft;
  plan: DesignPlan;
  history: DraftHistory;
  onDraftChange: (draft: PlatformDraft) => void;
  onUndo: () => void;
  onRedo: () => void;
  onCopyText: (text: string, success: string) => Promise<void>;
}) {
  const socialText = [props.draft.meta.caption, props.draft.meta.intro, props.draft.meta.body, props.draft.meta.ending].filter(Boolean).join("\n\n");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-[#e3e9e5] bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div>
            <div className="text-xs text-muted-foreground">{WORKSPACE_PLATFORM_LABELS[props.draft.platform]}</div>
            <h2 className="text-base font-semibold">平台版本编辑</h2>
          </div>
          <div className="ml-auto flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={props.onUndo} disabled={!props.history.past.length} aria-label="撤销">
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={props.onRedo} disabled={!props.history.future.length} aria-label="重做">
              <Redo2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-[1fr_220px]">
          <Input value={props.draft.title} onChange={(event) => props.onDraftChange(updatePlatformTitle(props.draft, event.target.value))} className="rounded-md" aria-label="平台标题" />
          <Input
            value={props.draft.meta.tags.map((tag) => `#${tag.replace(/^#/, "")}`).join(" ")}
            onChange={(event) => props.onDraftChange(updatePlatformTags(props.draft, event.target.value))}
            className="rounded-md"
            aria-label="平台标签"
            placeholder="标签"
          />
        </div>
        <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          <span className="shrink-0 text-muted-foreground">标题备选</span>
          {props.plan.titleCandidates.map((title, index) => (
            <button
              key={`${index}-${title}`}
              type="button"
              className={cn("max-w-[260px] shrink-0 truncate rounded-full border px-2.5 py-1 text-left hover:border-[#17633d] hover:text-[#17633d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17633d]", title === props.draft.title && "border-[#17633d] bg-[#edf7f1] text-[#17633d]")}
              onClick={() => props.onDraftChange(updatePlatformTitle(props.draft, title))}
              title={title}
            >
              {index === 0 ? "推荐 · " : ""}{title}
            </button>
          ))}
        </div>
        {props.draft.platform !== "wechat" && (
          <Textarea
            value={props.draft.meta.caption ?? ""}
            onChange={(event) => props.onDraftChange(updatePlatformCaption(props.draft, event.target.value))}
            className="mt-2 min-h-20 rounded-md"
            aria-label="发布文案"
            placeholder="发布文案"
          />
        )}
      </div>
      <div data-editor-scroll className="min-h-0 flex-1 overflow-y-auto bg-[#f5f8f6] p-4">
        <div className="mx-auto max-w-[860px] overflow-hidden rounded-lg border border-[#d8e1dc] bg-white shadow-[0_2px_8px_rgba(31,52,42,0.04)]">
          {props.draft.content.blocks.map((block) => {
            const editable = block.type !== "divider" && block.type !== "pageBreak";
            return (
              <div key={block.id} className="border-b border-[#edf1ee] p-4 last:border-b-0">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="rounded-full bg-[#edf2ef] px-2 py-0.5 text-xs text-[#4c6659]">{blockLabel(block)}</span>
                  <span className="truncate text-xs text-muted-foreground">Line {block.source.startLine}</span>
                </div>
                <Textarea
                  value={blockText(block)}
                  disabled={!editable}
                  onChange={(event) => props.onDraftChange(updatePlatformBlock(props.draft, block.id, event.target.value))}
                  className="min-h-24 resize-y rounded-md border-[#e3e9e5] bg-[#fbfcfb] shadow-none focus-visible:ring-[#8fc8a8]"
                  aria-label={`${blockLabel(block)}内容`}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className="border-t border-[#e3e9e5] bg-white p-3">
        <Button type="button" size="sm" variant="outline" onClick={() => void props.onCopyText(socialText || props.draft.title, "文案已复制")}>
          复制文案
        </Button>
      </div>
    </div>
  );
}

function PreviewPanel(props: {
  activePlatform: PlatformId;
  draft: PlatformDraft;
  plan: DesignPlan;
  currentSourceRevision: string;
  wechatHtml: string;
  cardLayout?: CardLayoutResult;
  imageUrlByBlock: Record<string, string>;
  onWechatPreviewBlur: (html: string) => void;
  onCopyWechat: () => Promise<void>;
  onExportWechat: () => void;
  onTogglePageLock: (page: CardLayoutPage) => void;
  onSplitPage: (page: CardLayoutPage, elementId: string) => void;
  onMergePage: (page: CardLayoutPage) => void;
  onMovePage: (page: CardLayoutPage, direction: -1 | 1) => void;
  onClearManualPages: () => void;
  onExportCard: (page: CardLayoutPage) => void;
  onCopyCard: (page: CardLayoutPage) => void;
  onExportPackage: () => void;
  aiMode: "deterministic" | "hosted" | "custom";
  aiBaseUrl: string;
  aiModel: string;
  aiRunState: "idle" | "generating" | "error";
  aiFallbackReason?: string;
  aiStatusMessage?: string;
  statusMessage: string;
  sessionApiKey: string;
  onAiModeChange: (mode: "deterministic" | "hosted" | "custom") => void;
  onAiBaseUrlChange: (value: string) => void;
  onAiModelChange: (value: string) => void;
  onSessionApiKeyChange: (value: string) => void;
  onCancelAi: () => void;
  onRetryAi: () => void;
  onOpenStyles: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b bg-white p-3">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 text-[#17633d]" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">真实成品预览</h2>
              <span className="rounded-full bg-[#edf2ef] px-2 py-0.5 text-[10px] text-[#4c6659]">{draftStatusLabel(props.draft, props.currentSourceRevision)}</span>
            </div>
            <button type="button" className="mt-1 block max-w-full text-left text-xs leading-5 text-muted-foreground hover:text-[#17633d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17633d]" onClick={props.onOpenStyles}>
              推荐：{DESIGN_SCHEMES[props.plan.recommendedScheme].name}。{props.plan.recommendationReason}
            </button>
          </div>
          <Button type="button" size="sm" variant="outline" className="h-8 shrink-0" onClick={props.onOpenStyles}>
            <Settings2 className="h-4 w-4" /> 方案
          </Button>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-1 rounded-md bg-[#edf1ee] p-1" role="group" aria-label="生成模式">
          <Toggle className="h-7 w-full px-1 text-[11px]" pressed={props.aiMode === "deterministic"} onPressedChange={() => props.onAiModeChange("deterministic")}>本地</Toggle>
          <Toggle className="h-7 w-full px-1 text-[11px]" pressed={props.aiMode === "hosted"} onPressedChange={() => props.onAiModeChange("hosted")}>服务端 AI</Toggle>
          <Toggle className="h-7 w-full px-1 text-[11px]" pressed={props.aiMode === "custom"} onPressedChange={() => props.onAiModeChange("custom")}>自定义接口</Toggle>
        </div>

        {(props.aiRunState === "generating" || props.aiRunState === "error") && (
          <div className={cn("mt-2 rounded-md border px-3 py-2 text-xs", props.aiRunState === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-[#c8d8cf] bg-[#f1f7f3] text-[#28553d]")} role={props.aiRunState === "error" ? "alert" : "status"} aria-live="polite">
            <div className="flex items-start gap-2">
              {props.aiRunState === "generating" ? <RefreshCw className="mt-0.5 h-3.5 w-3.5 animate-spin" /> : <AlertCircle className="mt-0.5 h-3.5 w-3.5" />}
              <span className="min-w-0 flex-1">{props.aiStatusMessage ?? props.aiFallbackReason ?? props.statusMessage}</span>
            </div>
            <div className="mt-2 flex gap-2">
              {props.aiRunState === "generating" ? (
                <Button type="button" size="sm" variant="outline" className="h-7" onClick={props.onCancelAi}>取消</Button>
              ) : (
                <>
                  <Button type="button" size="sm" className="h-7" onClick={props.onRetryAi}>重试服务端 AI</Button>
                  <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => props.onAiModeChange("deterministic")}>切换本地</Button>
                </>
              )}
            </div>
          </div>
        )}

        {props.aiMode === "custom" && (
          <details className="mt-2 rounded-md border bg-[#fbfcfb] px-3 py-2 text-xs">
            <summary className="cursor-pointer font-medium">自定义接口设置</summary>
            <div className="mt-2 grid gap-2">
              <Input value={props.aiBaseUrl} onChange={(event) => props.onAiBaseUrlChange(event.target.value)} className="h-8" aria-label="AI Base URL" placeholder="Base URL" />
              <Input value={props.aiModel} onChange={(event) => props.onAiModelChange(event.target.value)} className="h-8" aria-label="AI 模型" placeholder="模型" />
              <Input value={props.sessionApiKey} onChange={(event) => props.onSessionApiKeyChange(event.target.value)} className="h-8" aria-label="AI 会话 API Key" placeholder="Session API Key" type="password" autoComplete="off" />
            </div>
          </details>
        )}
      </div>
      <div data-preview-scroll className="min-h-0 flex-1 overflow-y-auto bg-[#efeee8] p-4">
        {props.activePlatform === "wechat" ? (
          <WechatPreview html={props.wechatHtml} onBlur={props.onWechatPreviewBlur} onCopy={props.onCopyWechat} onExport={props.onExportWechat} />
        ) : props.activePlatform === "douyinLongform" ? (
          <LongformPreview draft={props.draft} />
        ) : (
          <CardPreview
            key={props.activePlatform}
            activePlatform={props.activePlatform}
            layout={props.cardLayout}
            imageUrlByBlock={props.imageUrlByBlock}
            preset={cardPresetForScheme(props.draft.schemeId)}
            onTogglePageLock={props.onTogglePageLock}
            onSplitPage={props.onSplitPage}
            onMergePage={props.onMergePage}
            onMovePage={props.onMovePage}
            onClearManualPages={props.onClearManualPages}
            onExportCard={props.onExportCard}
            onCopyCard={props.onCopyCard}
            onExportPackage={props.onExportPackage}
          />
        )}
      </div>
    </div>
  );
}

function WechatPreview(props: { html: string; onBlur: (html: string) => void; onCopy: () => Promise<void>; onExport: () => void }) {
  return (
    <div className="mx-auto max-w-[390px]">
      <div className="mb-3 flex gap-2">
        <Button type="button" size="sm" onClick={() => void props.onCopy()}>
          复制微信富文本
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={props.onExport}>
          <Download className="h-4 w-4" />
          HTML
        </Button>
      </div>
      <div
        className="preview-editor min-h-[720px] rounded-md border bg-white p-5 shadow-sm"
        contentEditable
        suppressContentEditableWarning
        dangerouslySetInnerHTML={{ __html: props.html }}
        onBlur={(event) => props.onBlur(event.currentTarget.innerHTML)}
      />
    </div>
  );
}

function LongformPreview({ draft }: { draft: PlatformDraft }) {
  return (
    <div className="mx-auto max-w-[390px] rounded-md border bg-white p-5 shadow-sm">
      <h1 className="text-xl font-semibold leading-snug">{draft.title}</h1>
      {draft.meta.intro && <p className="mt-4 border-l-4 border-[#20201d] pl-3 text-sm leading-7">{draft.meta.intro}</p>}
      <div className="mt-5 whitespace-pre-wrap text-sm leading-7">{draft.meta.body}</div>
      {!!draft.meta.highlights?.length && (
        <div className="mt-5 rounded-md bg-[#f3f1eb] p-3">
          {draft.meta.highlights.map((item) => (
            <div key={item} className="mb-2 text-sm font-medium last:mb-0">
              {item}
            </div>
          ))}
        </div>
      )}
      {draft.meta.ending && <p className="mt-5 text-sm font-semibold leading-7">{draft.meta.ending}</p>}
    </div>
  );
}

function CardPreview(props: {
  activePlatform: PlatformId;
  layout?: CardLayoutResult;
  imageUrlByBlock: Record<string, string>;
  preset: ReturnType<typeof cardPresetForScheme>;
  onTogglePageLock: (page: CardLayoutPage) => void;
  onSplitPage: (page: CardLayoutPage, elementId: string) => void;
  onMergePage: (page: CardLayoutPage) => void;
  onMovePage: (page: CardLayoutPage, direction: -1 | 1) => void;
  onClearManualPages: () => void;
  onExportCard: (page: CardLayoutPage) => void;
  onCopyCard: (page: CardLayoutPage) => void;
  onExportPackage: () => void;
}) {
  const pages = props.layout?.pages ?? [];
  const [activePageIndex, setActivePageIndex] = React.useState(0);

  if (!props.layout || pages.length === 0) return null;
  const currentPageIndex = Math.min(activePageIndex, pages.length - 1);
  const page = pages[currentPageIndex] ?? pages[0];
  if (!page) return null;

  const hasManualPages = pages.some((candidate) => candidate.manual || candidate.locked);
  const previewWidth = 340;
  return (
    <div className="space-y-4">
      <div className="mx-auto flex w-full max-w-[340px] items-center justify-between rounded-md border bg-white p-2 text-xs text-muted-foreground">
        <span>轮播图预览 · {page.pageNumber}/{page.totalPages}</span>
        <Button type="button" size="sm" variant="outline" onClick={props.onExportPackage}>
          <Download className="h-4 w-4" />
          下载 ZIP
        </Button>
      </div>
      {hasManualPages && (
        <div className="mx-auto flex w-full max-w-[340px] items-center justify-between rounded-md border bg-white p-2 text-xs text-muted-foreground">
          <span>已启用手动页</span>
          <Button type="button" size="sm" variant="outline" onClick={props.onClearManualPages}>
            清除
          </Button>
        </div>
      )}
      <div className="mx-auto flex w-full max-w-[340px] items-center gap-2 rounded-md border bg-white p-2">
        <Button type="button" size="icon" variant="outline" onClick={() => setActivePageIndex(Math.max(0, currentPageIndex - 1))} disabled={currentPageIndex === 0} aria-label="上一页">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto" role="tablist" aria-label="轮播页导航">
          {pages.map((candidate, index) => (
            <button
              key={candidate.id}
              type="button"
              role="tab"
              aria-selected={index === currentPageIndex}
              aria-label={`第${index + 1}页`}
              className={cn("h-8 min-w-8 rounded-md border px-2 text-xs font-medium text-muted-foreground", index === currentPageIndex ? "border-[#17633d] bg-[#e5f3eb] text-[#17633d]" : "border-[#d8e1dc] bg-white hover:bg-[#f1f7f3]")}
              onClick={() => setActivePageIndex(index)}
            >
              {String(index + 1).padStart(2, "0")}
            </button>
          ))}
        </div>
        <Button type="button" size="icon" variant="outline" onClick={() => setActivePageIndex(Math.min(pages.length - 1, currentPageIndex + 1))} disabled={currentPageIndex >= pages.length - 1} aria-label="下一页">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="mx-auto w-full max-w-[340px] space-y-2 text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <span>
            {page.canvas.width}x{page.canvas.height} · {page.pageNumber}/{page.totalPages}
            {page.manual ? " · 手动" : ""}
            {page.locked ? " · 锁定" : ""}
          </span>
          <span>{page.nodes.length} 个内容块</span>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button type="button" size="sm" variant="outline" onClick={() => props.onTogglePageLock(page)} aria-label={page.locked ? "解锁页面" : "锁定页面"}>
            {page.locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => props.onSplitPage(page, page.nodes[Math.max(0, Math.floor(page.nodes.length / 2) - 1)]?.id ?? "")}
            disabled={page.nodes.length < 2}
            aria-label="拆分页面"
          >
            <Scissors className="h-4 w-4" />
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => props.onMergePage(page)} disabled={page.pageNumber >= page.totalPages || page.locked} aria-label="合并下一页">
            <Merge className="h-4 w-4" />
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => props.onMovePage(page, -1)} disabled={page.pageNumber <= 1} aria-label="上移页面">
            <MoveUp className="h-4 w-4" />
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => props.onMovePage(page, 1)} disabled={page.pageNumber >= page.totalPages} aria-label="下移页面">
            <MoveDown className="h-4 w-4" />
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => props.onCopyCard(page)}>
            复制
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => props.onExportCard(page)}>
            PNG
          </Button>
        </div>
      </div>
      <div data-card-preview className="mx-auto overflow-hidden rounded-md border shadow-sm" style={{ width: previewWidth, height: Math.round((previewWidth * page.canvas.height) / page.canvas.width), background: props.preset.background }}>
        <div style={{ width: page.canvas.width, height: page.canvas.height, transform: `scale(${previewWidth / page.canvas.width})`, transformOrigin: "top left", position: "relative" }}>
          <CardPreviewFrame page={page} preset={props.preset} />
          {page.nodes.map((node) => {
            const imageUrl = props.imageUrlByBlock[node.blockId];
            if (node.kind === "image") {
              return imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={node.id}
                  src={imageUrl}
                  alt=""
                  className="absolute object-cover"
                  style={{
                    left: node.image?.x ?? node.x,
                    top: node.image?.y ?? node.y,
                    width: node.image?.width ?? node.width,
                    height: node.image?.height ?? node.height,
                  }}
                />
              ) : (
                <div key={node.id} className="absolute" style={{ left: node.x, top: node.y, width: node.width, height: node.height, background: props.preset.highlight }} />
              );
            }
            return (
              <div
                key={node.id}
                className={cn("absolute whitespace-pre-wrap break-words", node.kind === "focus" && props.preset.variant !== "story" && "px-4 py-3")}
                  style={{
                    left: node.x,
                    top: node.y,
                    width: node.width,
                    fontFamily: node.style?.fontFamily,
                    fontSize: node.style?.fontSize,
                    lineHeight: node.style?.lineHeight ? `${node.style.lineHeight}px` : undefined,
                    fontWeight: node.style?.fontWeight,
                    color: node.kind === "body" ? props.preset.body : props.preset.title,
                    background: node.kind === "focus"
                      ? props.preset.variant === "story" ? "transparent" : props.preset.variant === "data" ? props.preset.surface : props.preset.highlight
                      : undefined,
                    ...cardNodeBorderStyle(node.kind, props.preset),
                    borderRadius: node.kind === "focus" && props.preset.variant !== "story" ? (props.preset.variant === "editorial" ? 4 : 12) : undefined,
                    padding: node.kind === "heading" && (props.preset.variant === "editorial" || props.preset.variant === "data") ? "0 0 0 18px" : undefined,
                  }}
              >
                {node.lines.map((line) => line.text).join("\n")}
              </div>
            );
          })}
        </div>
      </div>
      {!!page.overflow.length && <div className="mx-auto mt-2 w-full max-w-[340px] rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">当前页有溢出，调整字号或边距后会重新计算。</div>}
    </div>
  );
}

function cardNodeBorderStyle(
  kind: CardLayoutPage["nodes"][number]["kind"],
  preset: ReturnType<typeof cardPresetForScheme>,
): React.CSSProperties {
  const allSides = kind === "focus" && preset.variant === "data";
  const storyFocus = kind === "focus" && preset.variant === "story";
  const leftWidth = kind === "heading" && preset.variant === "editorial"
    ? 7
    : kind === "focus" && preset.variant === "checklist"
      ? 8
      : kind === "heading" && preset.variant === "data"
        ? 6
        : allSides
          ? 2
          : 0;
  const bottomWidth = kind === "heading" && preset.variant === "checklist" ? 8 : storyFocus || allSides ? 2 : 0;

  return {
    borderTopWidth: storyFocus || allSides ? 2 : 0,
    borderRightWidth: allSides ? 2 : 0,
    borderBottomWidth: bottomWidth,
    borderLeftWidth: leftWidth,
    borderStyle: "solid",
    borderColor: preset.rule,
    borderLeftColor: leftWidth > 0 && !allSides ? preset.title : preset.rule,
  };
}

function CardPreviewFrame(props: { page: CardLayoutPage; preset: ReturnType<typeof cardPresetForScheme> }) {
  const { page, preset } = props;
  const labelY = Math.max(44, page.safeArea.y - 78);
  if (preset.variant === "checklist") {
    return (
      <>
        <div className="absolute" style={{ left: page.safeArea.x, top: labelY, width: 76, height: 8, background: preset.title }} />
        <div className="absolute text-[20px] font-bold" style={{ left: page.safeArea.x, top: labelY + 20, color: preset.muted }}>ACTION LIST</div>
        <div className="absolute text-[86px] font-extrabold leading-none" style={{ right: page.safeArea.right, top: labelY - 36, color: preset.rule }}>{String(page.pageNumber).padStart(2, "0")}</div>
      </>
    );
  }
  if (preset.variant === "data") {
    return (
      <>
        {[0, 1, 2, 3, 4].map((column) => (
          <div key={column} className="absolute" style={{ left: page.safeArea.x + (page.safeArea.width / 4) * column, top: page.safeArea.y - 28, width: 1, height: page.safeArea.height + 56, background: `${preset.rule}3D` }} />
        ))}
        <div className="absolute" style={{ left: page.safeArea.x, top: page.safeArea.y - 36, width: page.safeArea.width, height: 4, background: preset.title }} />
        <div className="absolute text-[21px] font-bold" style={{ left: page.safeArea.x, top: labelY, color: preset.title }}>INSIGHT {String(page.pageNumber).padStart(2, "0")}</div>
      </>
    );
  }
  if (preset.variant === "story") {
    return (
      <>
        <div className="absolute" style={{ left: page.safeArea.x, top: page.safeArea.y - 34, width: 72, height: 3, background: preset.rule }} />
        <div className="absolute" style={{ left: page.safeArea.x, top: page.safeArea.y - 34, width: 2, height: page.safeArea.height + 52, background: preset.rule }} />
        <div className="absolute font-serif text-[22px] font-semibold" style={{ left: page.safeArea.x + 20, top: labelY, color: preset.title }}>CHAPTER {String(page.pageNumber).padStart(2, "0")}</div>
      </>
    );
  }
  return (
    <>
      <div className="absolute" style={{ left: page.safeArea.x, top: page.safeArea.y - 36, width: page.safeArea.width, height: 3, background: preset.rule }} />
      <div className="absolute text-[22px] font-semibold" style={{ left: page.safeArea.x, top: labelY, color: preset.muted }}>EDITORIAL / {String(page.pageNumber).padStart(2, "0")}</div>
    </>
  );
}

function PaneResizer(props: { label: string; onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void }) {
  return (
    <button
      type="button"
      className="workspace-pane-resizer hidden cursor-col-resize items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17633d] lg:flex"
      aria-label={props.label}
      onPointerDown={props.onPointerDown}
    >
      <span className="h-10 w-px bg-[#b9c7bf]" aria-hidden="true" />
    </button>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-[#fbfbf8] p-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}

function saveStateLabel(state: "loading" | "dirty" | "saving" | "saved" | "error") {
  switch (state) {
    case "loading":
      return "恢复中";
    case "dirty":
      return "未保存";
    case "saving":
      return "保存中";
    case "saved":
      return "已保存";
    case "error":
      return "保存失败";
  }
}

function draftStatusLabel(draft: PlatformDraft, currentSourceRevision: string) {
  if (draft.sourceRevision !== currentSourceRevision) {
    return draft.status === "edited" ? "源文已更新" : "待重新生成";
  }
  switch (draft.status) {
    case "edited":
      return "已编辑";
    case "generated":
      return "已生成";
    case "error":
      return "有错误";
    case "locked":
      return "已锁定";
    default:
      return "草稿";
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function imagePlacementsFromPage(page: CardLayoutPage) {
  return page.nodes.flatMap((node) => {
    if (node.kind !== "image" || !node.image) return [];
    return [
      {
        imageId: node.blockId,
        x: node.image.x,
        y: node.image.y,
        width: node.image.width,
        height: node.image.height,
        rotation: node.image.rotation,
        opacity: node.image.opacity,
        mode: node.image.mode,
      },
    ];
  });
}
