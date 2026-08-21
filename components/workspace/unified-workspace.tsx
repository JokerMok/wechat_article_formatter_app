"use client";

import * as React from "react";
import {
  Download,
  FilePlus2,
  ImagePlus,
  Lock,
  LockOpen,
  MoveDown,
  MoveUp,
  Merge,
  Scissors,
  Redo2,
  RefreshCw,
  Save,
  Settings2,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import { copyRichText } from "@/lib/copy-rich-text";
import type { TemplateKey } from "@/lib/article-types";
import type { UnifiedArticleBlock, UnifiedArticleContent } from "@/lib/content";
import type { PlatformId } from "@/lib/platforms/types";
import {
  createApproximateTextMeasurer,
  layoutCardPages,
  lockCardImagePage,
  mergeAdjacentCardPages,
  moveCardImagePage,
  splitCardImagePageAfterElement,
  type CardLayoutPage,
  type CardLayoutResult,
} from "@/lib/renderers/cards";
import { OpenAICompatibleProvider, generatePlatformVersions } from "@/lib/ai";
import type { WechatImageNode } from "@/lib/renderers/wechat";
import { renderWechatContentHtml } from "@/lib/renderers/wechat";
import {
  createAssetBlobRepository,
  createEmptyProject,
  createProjectBackupPayload,
  createProjectRepository,
  readProjectBackupBlob,
  type ProjectAssetReference,
  type ProjectDocument,
  type StoredAssetMetadata,
} from "@/lib/storage";
import { styleTemplates, templateList } from "@/lib/style-templates";
import { cn } from "@/lib/utils";
import {
  DEFAULT_SOURCE_MARKDOWN,
  AUTO_SAVE_DEBOUNCE_MS,
  WORKSPACE_PLATFORM_IDS,
  WORKSPACE_PLATFORM_LABELS,
  applyPlatformDraftReplacements,
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
  PROJECT_BACKUP_IMAGE_NOTICE,
  updatePlatformBlock,
  updatePlatformCaption,
  updatePlatformRatio,
  updatePlatformTags,
  updatePlatformTitle,
  withLockedCardPage,
  withManualCardPages,
  withWechatHtmlOverride,
} from "./state";
import { createCardPngFilename, renderCardPagePngBlob } from "./card-image-actions";
import { createInitialProjectId, describeAssetUploadStatus, type AssetUploadFailure } from "./client-state";
import type { AssetPlaceholder, DraftHistory, LayoutSettings, PlatformDraft, RatioMode, WorkspaceMode, WorkspacePersistedState } from "./types";

type ProjectListItem = {
  id: string;
  title: string;
  updatedAt?: string;
};

const measurer = createApproximateTextMeasurer();

function nowIso() {
  return new Date().toISOString();
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
  const [saveState, setSaveState] = React.useState<"loading" | "dirty" | "saving" | "saved" | "error">("loading");
  const [statusMessage, setStatusMessage] = React.useState("正在恢复本地项目");
  const [history, setHistory] = React.useState<Record<PlatformId, DraftHistory>>(() => createEmptyHistories());
  const historyRef = React.useRef<Record<PlatformId, DraftHistory>>(createEmptyHistories());
  const [sessionApiKey, setSessionApiKey] = React.useState("");
  const [aiRunState, setAiRunState] = React.useState<"idle" | "generating" | "error">("idle");
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
    const result = layoutCardPages(activeDraft.content, measurer, {
      aspectRatio: ratio,
      safeArea: {
        top: workspace.layout.margin + 64,
        right: workspace.layout.margin,
        bottom: workspace.layout.margin + 64,
        left: workspace.layout.margin,
      },
      typography: {
        titleFontSize: workspace.layout.titleFontSize,
        headingFontSize: workspace.layout.headingFontSize,
        bodyFontSize: workspace.layout.bodyFontSize,
        focusFontSize: workspace.layout.focusFontSize,
        lineSpacing: workspace.layout.lineSpacing,
        paragraphSpacing: workspace.layout.paragraphSpacing,
        titleSpacing: workspace.layout.titleSpacing,
      },
      manualPages: activeDraft.manualPages.map((page) => ({
        id: page.id,
        locked: page.locked,
        layout: page,
      })),
    });
    return applyManualPageOrder(result, activeDraft.manualPages);
  }, [activeDraft, activePlatform, workspace.layout]);

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
      const storedAssets = assetRepo ? await assetRepo.listProjectAssets(projectId) : [];
      const assetMetadataById = new Map<string, StoredAssetMetadata>();
      for (const asset of storedAssets) assetMetadataById.set(asset.id, asset);
      for (const asset of assets) {
        if (!assetMetadataById.has(asset.id)) {
          assetMetadataById.set(asset.id, {
            id: asset.id,
            projectId,
            fileName: asset.fileName,
            mimeType: asset.mimeType,
            byteLength: asset.byteLength,
            createdAt: nowIso(),
          });
        }
      }
      const payload = createProjectBackupPayload({
        projects: [currentProjectDocument()],
        unknownProjects: [],
        assets: [...assetMetadataById.values()],
      });
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
      downloadBlob(blob, `${projectTitle || "workspace"}-backup.json`);
      setStatusMessage(describeProjectBackupExportStatus(assetMetadataById.size));
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "项目备份导出失败");
    }
  }

  async function importProjectBackup(file: File) {
    try {
      const payload = await readProjectBackupBlob(file);
      const project = selectRestorableBackupProject(payload);
      if (!project) {
        setStatusMessage("备份文件无可恢复项目");
        return;
      }
      const canReplace = await confirmAndSaveBeforeReplacing("当前项目有未保存内容。先保存再导入项目？");
      if (!canReplace) return;

      const importedProject = createEmptyProject({ title: project.title, article: project.article });
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

  async function regenerateAllPlatforms() {
    await regeneratePlatforms([...WORKSPACE_PLATFORM_IDS]);
  }

  async function regeneratePlatforms(platforms: PlatformId[]) {
    if (workspace.ai.mode !== "assistant") {
      const regeneration = confirmEditedRegeneration(platforms);
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
      setStatusMessage(`AI 配置不完整：请填写 ${missingFields.join("、") || "Base URL、模型、Session API Key"}，或切回本地模式后重新生成。`);
      return;
    }

    const regeneration = confirmEditedRegeneration(platforms);
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
    setStatusMessage("正在生成平台版本");

    const provider = new OpenAICompatibleProvider({
      baseUrl: workspace.ai.baseUrl.trim(),
      model: workspace.ai.model.trim(),
      apiKey: sessionApiKey.trim(),
      timeoutMs: 30000,
    });

    const result = await generatePlatformVersions({
      provider,
      source: sourceArticle,
      sourceVersionId: String(sourceArticle.sourceText.length),
      platforms: regeneration.platforms,
      existingVersions: platformVersionsFromDrafts(workspace.platforms),
      signal: controller.signal,
    });

    if (aiAbortRef.current === controller) aiAbortRef.current = undefined;

    if (result.ok) {
      const current = workspaceRef.current;
      const replacements = createGeneratedDraftReplacements(current.platforms, result.versions, regeneration.platforms);
      const merged = applyPlatformDraftReplacements({
        drafts: current.platforms,
        histories: historyRef.current,
        replacements,
        changedSince: requestDraftSignatures,
      });
      const next = {
        ...current,
        ai: { ...current.ai, lastFallbackReason: undefined },
        platforms: merged.drafts,
      };
      workspaceRef.current = next;
      historyRef.current = merged.histories;
      setHistory(merged.histories);
      setWorkspace(next);
      setAiRunState("idle");
      setStatusMessage(
        regeneration.skippedEditedPlatforms.length || merged.skippedChangedPlatforms.length
          ? `AI 已生成 ${merged.appliedPlatforms.length} 个平台版本，人工编辑稿已保留`
          : `AI 已生成 ${merged.appliedPlatforms.length} 个平台版本`,
      );
      return;
    }

    if (result.error.code === "cancelled") {
      setAiRunState("idle");
      setStatusMessage("AI 生成已取消");
      return;
    }

    replaceWorkspace(markAiGenerationFailure(workspaceRef.current, result.error.message));
    setAiRunState("error");
    setStatusMessage(`${result.error.message} 已保留当前编辑稿`);
  }

  function confirmEditedRegeneration(platforms: PlatformId[]) {
    return resolveRegenerationPlatforms(workspace.platforms, platforms, (editedPlatforms) => {
      const labels = editedPlatforms.map((platform) => WORKSPACE_PLATFORM_LABELS[platform]).join("、");
      return window.confirm(`重新生成会覆盖 ${labels} 的人工编辑稿。确定继续？`);
    });
  }

  function applyDeterministicRegeneration(platforms: PlatformId[]) {
    const current = workspaceRef.current;
    const replacements = Object.fromEntries(
      platforms.map((platform) => [platform, regeneratePlatformDraft(current.platforms[platform], sourceArticle, current.ai)]),
    ) as Partial<Record<PlatformId, PlatformDraft>>;
    applyPlatformReplacements(replacements);
  }

  function createGeneratedDraftReplacements(currentDrafts: Record<PlatformId, PlatformDraft>, versions: ReturnType<typeof platformVersionsFromDrafts>, platforms: PlatformId[]) {
    return Object.fromEntries(
      platforms.flatMap((platform) => {
        const version = versions[platform];
        return version ? [[platform, platformDraftFromVersion(currentDrafts[platform], version)]] : [];
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
    const blob = await renderCardPagePngBlob(page, createImageUrlByBlock(activeDraft.content, assets));
    if (blob) downloadBlob(blob, createCardPngFilename(activeDraft.title, activePlatform, page.pageNumber));
  }

  async function copyCardPng(page: CardLayoutPage) {
    const blob = await renderCardPagePngBlob(page, createImageUrlByBlock(activeDraft.content, assets));
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

  return (
    <main className="min-h-screen bg-[#f7f7f4] text-[#20201d]">
      <header className="sticky top-0 z-30 border-b bg-white/95 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <Input value={projectTitle} onChange={(event) => setProjectTitle(event.target.value)} className="h-9 w-56 rounded-md" aria-label="项目名称" />
          <Select value={projectId} onValueChange={openProject}>
            <SelectTrigger className="h-9 w-52 rounded-md">
              <SelectValue placeholder="打开项目" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" size="sm" variant="outline" onClick={() => void createNewProject()}>
            <FilePlus2 className="h-4 w-4" />
            新建
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => void saveProject()}>
            <Save className="h-4 w-4" />
            保存
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => void exportCurrentProjectBackup()}>
            <Download className="h-4 w-4" />
            导出项目
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => backupInputRef.current?.click()}>
            <Upload className="h-4 w-4" />
            导入项目
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => void deleteCurrentProject()}>
            <Trash2 className="h-4 w-4" />
            删除
          </Button>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <span className={cn(saveState === "error" && "text-red-600")}>{saveStateLabel(saveState)}</span>
            <span>{statusMessage}</span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {WORKSPACE_PLATFORM_IDS.map((platform) => (
            <button
              key={platform}
              type="button"
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm font-medium",
                activePlatform === platform ? "border-[#20201d] bg-[#20201d] text-white" : "border-[#dedbd2] bg-white text-[#20201d]",
              )}
              onClick={() => setActivePlatform(platform)}
            >
              {WORKSPACE_PLATFORM_LABELS[platform]}
            </button>
          ))}
          <div className="ml-auto flex gap-1 lg:hidden">
            {(["source", "editor", "preview"] as WorkspaceMode[]).map((view) => (
              <button
                key={view}
                type="button"
                className={cn("rounded-md border px-3 py-1.5 text-sm", mode === view ? "border-[#20201d] bg-white" : "border-transparent")}
                onClick={() => setMode(view)}
              >
                {view === "source" ? "素材" : view === "editor" ? "编辑" : "预览"}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{PROJECT_BACKUP_IMAGE_NOTICE}</p>
      </header>

      <div className="grid min-h-[calc(100vh-108px)] grid-cols-1 gap-0 lg:grid-cols-[320px_minmax(420px,1fr)_420px]">
        <aside className={cn("border-r bg-white", panelVisible(mode, "source"))}>
          <SourcePanel
            sourceMarkdown={workspace.sourceMarkdown}
            article={sourceArticle}
            assets={assets}
            onSourceChange={(sourceMarkdown) => updateWorkspace({ sourceMarkdown })}
            onReparse={() => {
              updateWorkspace({ sourceMarkdown: workspace.sourceMarkdown });
              setStatusMessage(`已解析 ${sourceArticle.blocks.length} 个内容块`);
            }}
            onRegenerateAll={regenerateAllPlatforms}
            onPickImages={() => fileInputRef.current?.click()}
            onUpload={uploadAssets}
            onInsertAsset={insertAsset}
          />
        </aside>

        <section className={cn("min-w-0 border-r bg-[#fbfbf8]", panelVisible(mode, "editor"))}>
          <PlatformEditor
            draft={activeDraft}
            history={history[activePlatform]}
            onDraftChange={commitPlatform}
            onRegenerate={regenerateCurrentPlatform}
            onUndo={undoPlatform}
            onRedo={redoPlatform}
            onCopyText={copyText}
          />
        </section>

        <aside className={cn("bg-white", panelVisible(mode, "preview"))}>
          <PreviewPanel
            activePlatform={activePlatform}
            draft={activeDraft}
            layout={workspace.layout}
            wechatHtml={wechatHtml}
            cardLayout={cardLayout}
            imageUrlByBlock={createImageUrlByBlock(activeDraft.content, assets)}
            onLayoutChange={updateLayout}
            onTemplateChange={(templateKey) => commitPlatform({ ...activeDraft, templateKey, editedWechatHtml: undefined, updatedAt: nowIso() })}
            onRatioChange={(ratio) => commitPlatform(updatePlatformRatio(activeDraft, ratio))}
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
            aiMode={workspace.ai.mode}
            aiBaseUrl={workspace.ai.baseUrl}
            aiModel={workspace.ai.model}
            aiRunState={aiRunState}
            aiFallbackReason={workspace.ai.lastFallbackReason}
            sessionApiKey={sessionApiKey}
            onAiModeChange={(modeValue) =>
              updateWorkspace({
                ai: {
                  ...workspace.ai,
                  mode: modeValue,
                  lastFallbackReason: modeValue === "assistant" ? "请填写 Base URL、模型和 Session API Key；缺失时不会覆盖当前编辑稿。" : "当前使用本地确定性转换。",
                },
              })
            }
            onAiBaseUrlChange={(baseUrl) => updateWorkspace({ ai: { ...workspace.ai, baseUrl } })}
            onAiModelChange={(model) => updateWorkspace({ ai: { ...workspace.ai, model } })}
            onSessionApiKeyChange={setSessionApiKey}
            onCancelAi={cancelAiGeneration}
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
        accept="application/json,.json"
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
  onRegenerateAll: () => Promise<void>;
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
      <div className="border-b p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">源文与素材</h2>
          <Button type="button" size="sm" variant="outline" onClick={props.onReparse}>
            <RefreshCw className="h-4 w-4" />
            解析
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <Metric label="内容块" value={props.article.blocks.length} />
          <Metric label="图片" value={props.article.blocks.filter((block) => block.type === "image").length} />
          <Metric label="告警" value={props.article.warnings.length} />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-4">
        <Textarea
          value={props.sourceMarkdown}
          onChange={(event) => props.onSourceChange(event.target.value)}
          className="min-h-[360px] flex-1 resize-none rounded-md font-mono text-sm leading-6"
          spellCheck={false}
          aria-label="源文 Markdown"
        />
        <div className="mt-3 flex gap-2">
          <Button type="button" size="sm" onClick={() => void props.onRegenerateAll()}>
            <RefreshCw className="h-4 w-4" />
            生成四端
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={props.onPickImages}>
            <ImagePlus className="h-4 w-4" />
            上传图片
          </Button>
        </div>
      </div>
      <div className="border-t p-4">
        <h3 className="mb-2 text-xs font-semibold text-muted-foreground">素材</h3>
        <div className="grid grid-cols-2 gap-2">
          {props.assets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              className="overflow-hidden rounded-md border bg-white text-left"
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
          {!props.assets.length && <div className="col-span-2 rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">拖入或上传 PNG/JPEG/WebP</div>}
        </div>
      </div>
    </div>
  );
}

function PlatformEditor(props: {
  draft: PlatformDraft;
  history: DraftHistory;
  onDraftChange: (draft: PlatformDraft) => void;
  onRegenerate: () => Promise<void>;
  onUndo: () => void;
  onRedo: () => void;
  onCopyText: (text: string, success: string) => Promise<void>;
}) {
  const socialText = [props.draft.meta.caption, props.draft.meta.intro, props.draft.meta.body, props.draft.meta.ending].filter(Boolean).join("\n\n");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b bg-white p-4">
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
            <Button type="button" size="sm" onClick={() => void props.onRegenerate()}>
              <RefreshCw className="h-4 w-4" />
              生成
            </Button>
          </div>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-[1fr_220px]">
          <Input value={props.draft.title} onChange={(event) => props.onDraftChange(updatePlatformTitle(props.draft, event.target.value))} className="rounded-md" aria-label="平台标题" />
          <Input
            value={props.draft.meta.tags.join(" #")}
            onChange={(event) => props.onDraftChange(updatePlatformTags(props.draft, event.target.value))}
            className="rounded-md"
            aria-label="平台标签"
            placeholder="标签"
          />
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
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="space-y-3">
          {props.draft.content.blocks.map((block) => {
            const editable = block.type !== "divider" && block.type !== "pageBreak";
            return (
              <div key={block.id} className="rounded-md border bg-white p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">{blockLabel(block)}</span>
                  <span className="truncate text-xs text-muted-foreground">Line {block.source.startLine}</span>
                </div>
                <Textarea
                  value={blockText(block)}
                  disabled={!editable}
                  onChange={(event) => props.onDraftChange(updatePlatformBlock(props.draft, block.id, event.target.value))}
                  className="min-h-24 resize-y rounded-md"
                  aria-label={`${blockLabel(block)}内容`}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className="border-t bg-white p-3">
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
  layout: LayoutSettings;
  wechatHtml: string;
  cardLayout?: CardLayoutResult;
  imageUrlByBlock: Record<string, string>;
  onLayoutChange: (patch: Partial<LayoutSettings>) => void;
  onTemplateChange: (templateKey: TemplateKey) => void;
  onRatioChange: (ratio: RatioMode) => void;
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
  aiMode: "deterministic" | "assistant";
  aiBaseUrl: string;
  aiModel: string;
  aiRunState: "idle" | "generating" | "error";
  aiFallbackReason?: string;
  sessionApiKey: string;
  onAiModeChange: (mode: "deterministic" | "assistant") => void;
  onAiBaseUrlChange: (value: string) => void;
  onAiModelChange: (value: string) => void;
  onSessionApiKeyChange: (value: string) => void;
  onCancelAi: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b p-4">
        <div className="mb-3 flex items-center gap-2">
          <Settings2 className="h-4 w-4" />
          <h2 className="text-sm font-semibold">预览与设置</h2>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Metric label="状态" value={props.draft.status} />
          <Metric label="页面" value={props.cardLayout?.pages.length ?? "HTML"} />
        </div>
        <div className="mt-4 space-y-3">
          {props.activePlatform === "wechat" && (
            <SettingRow label="公众号样式">
              <Select value={props.draft.templateKey} onValueChange={(value) => props.onTemplateChange(value as TemplateKey)}>
                <SelectTrigger className="h-9 rounded-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {templateList.map((template) => (
                    <SelectItem key={template.key} value={template.key}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingRow>
          )}
          {props.activePlatform === "douyinImage" && (
            <SettingRow label="比例">
              <div className="flex gap-2">
                <Toggle pressed={props.draft.ratio === "3:4"} onPressedChange={() => props.onRatioChange("3:4")}>3:4</Toggle>
                <Toggle pressed={props.draft.ratio === "9:16"} onPressedChange={() => props.onRatioChange("9:16")}>9:16</Toggle>
              </div>
            </SettingRow>
          )}
          {props.activePlatform !== "wechat" && props.activePlatform !== "douyinLongform" && (
            <>
              <Range label="边距" value={props.layout.margin} min={48} max={140} step={2} onChange={(margin) => props.onLayoutChange({ margin })} />
              <Range label="标题" value={props.layout.titleFontSize} min={56} max={92} onChange={(titleFontSize) => props.onLayoutChange({ titleFontSize })} />
              <Range label="正文" value={props.layout.bodyFontSize} min={28} max={44} onChange={(bodyFontSize) => props.onLayoutChange({ bodyFontSize })} />
              <Range label="行距" value={props.layout.lineSpacing} min={1.1} max={1.8} step={0.05} onChange={(lineSpacing) => props.onLayoutChange({ lineSpacing })} />
              <Range label="段距" value={props.layout.paragraphSpacing} min={18} max={64} onChange={(paragraphSpacing) => props.onLayoutChange({ paragraphSpacing })} />
            </>
          )}
          <SettingRow label="生成模式">
            <div className="flex gap-2">
              <Toggle pressed={props.aiMode === "deterministic"} onPressedChange={() => props.onAiModeChange("deterministic")}>本地</Toggle>
              <Toggle pressed={props.aiMode === "assistant"} onPressedChange={() => props.onAiModeChange("assistant")}>AI</Toggle>
            </div>
          </SettingRow>
          {props.aiMode === "assistant" && (
            <div className="space-y-2 rounded-md border bg-white p-3">
              <Input value={props.aiBaseUrl} onChange={(event) => props.onAiBaseUrlChange(event.target.value)} className="h-9 rounded-md" aria-label="AI Base URL" placeholder="Base URL" />
              <Input value={props.aiModel} onChange={(event) => props.onAiModelChange(event.target.value)} className="h-9 rounded-md" aria-label="AI 模型" placeholder="模型" />
              <Input
                value={props.sessionApiKey}
                onChange={(event) => props.onSessionApiKeyChange(event.target.value)}
                className="h-9 rounded-md"
                aria-label="AI 会话 API Key"
                placeholder="Session API Key"
                type="password"
                autoComplete="off"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{props.aiRunState === "generating" ? "生成中" : props.aiFallbackReason ?? "密钥只保存在当前会话"}</span>
                <Button type="button" size="sm" variant="outline" onClick={props.onCancelAi} disabled={props.aiRunState !== "generating"}>
                  取消
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-[#efeee8] p-4">
        {props.activePlatform === "wechat" ? (
          <WechatPreview html={props.wechatHtml} onBlur={props.onWechatPreviewBlur} onCopy={props.onCopyWechat} onExport={props.onExportWechat} />
        ) : props.activePlatform === "douyinLongform" ? (
          <LongformPreview draft={props.draft} />
        ) : (
          <CardPreview
            layout={props.cardLayout}
            imageUrlByBlock={props.imageUrlByBlock}
            onTogglePageLock={props.onTogglePageLock}
            onSplitPage={props.onSplitPage}
            onMergePage={props.onMergePage}
            onMovePage={props.onMovePage}
            onClearManualPages={props.onClearManualPages}
            onExportCard={props.onExportCard}
            onCopyCard={props.onCopyCard}
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
  layout?: CardLayoutResult;
  imageUrlByBlock: Record<string, string>;
  onTogglePageLock: (page: CardLayoutPage) => void;
  onSplitPage: (page: CardLayoutPage, elementId: string) => void;
  onMergePage: (page: CardLayoutPage) => void;
  onMovePage: (page: CardLayoutPage, direction: -1 | 1) => void;
  onClearManualPages: () => void;
  onExportCard: (page: CardLayoutPage) => void;
  onCopyCard: (page: CardLayoutPage) => void;
}) {
  if (!props.layout) return null;
  const hasManualPages = props.layout.pages.some((page) => page.manual || page.locked);
  return (
    <div className="space-y-5">
      {hasManualPages && (
        <div className="mx-auto flex w-[270px] items-center justify-between rounded-md border bg-white p-2 text-xs text-muted-foreground">
          <span>已启用手动页</span>
          <Button type="button" size="sm" variant="outline" onClick={props.onClearManualPages}>
            清除
          </Button>
        </div>
      )}
      {props.layout.pages.map((page) => (
        <div key={page.id} className="mx-auto w-[270px]">
          <div className="mb-2 space-y-2 text-xs text-muted-foreground">
            <span>
              {page.canvas.width}x{page.canvas.height} · {page.pageNumber}/{page.totalPages}
              {page.manual ? " · 手动" : ""}
              {page.locked ? " · 锁定" : ""}
            </span>
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
          <div className="overflow-hidden rounded-md border bg-[#fffbf6] shadow-sm" style={{ width: 270, height: Math.round((270 * page.canvas.height) / page.canvas.width) }}>
            <div style={{ width: page.canvas.width, height: page.canvas.height, transform: `scale(${270 / page.canvas.width})`, transformOrigin: "top left", position: "relative" }}>
              <div className="absolute bg-[#d8c5b1]" style={{ left: page.safeArea.x, top: page.safeArea.y - 36, width: page.safeArea.width, height: 4 }} />
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
                    <div key={node.id} className="absolute bg-[#f1e7dc]" style={{ left: node.x, top: node.y, width: node.width, height: node.height }} />
                  );
                }
                return (
                  <div
                    key={node.id}
                    className={cn("absolute whitespace-pre-wrap break-words", node.kind === "focus" && "rounded-lg bg-[#f1e7dc] px-4 py-3")}
                    style={{
                      left: node.x,
                      top: node.y,
                      width: node.width,
                      fontFamily: node.style?.fontFamily,
                      fontSize: node.style?.fontSize,
                      lineHeight: node.style?.lineHeight,
                      fontWeight: node.style?.fontWeight,
                      color: node.kind === "body" ? "#6b3a16" : "#8a430e",
                    }}
                  >
                    {node.lines.map((line) => line.text).join("\n")}
                  </div>
                );
              })}
            </div>
          </div>
          {!!page.overflow.length && <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">当前页有溢出，调整字号或边距后会重新计算。</div>}
        </div>
      ))}
    </div>
  );
}

function Range(props: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  return (
    <SettingRow label={`${props.label} ${Number.isInteger(props.value) ? props.value : props.value.toFixed(2)}`}>
      <Slider value={props.value} min={props.min} max={props.max} step={props.step} onValueChange={props.onChange} />
    </SettingRow>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
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
