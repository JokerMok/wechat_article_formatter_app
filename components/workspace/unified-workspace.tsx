"use client";

import * as React from "react";
import {
  Download,
  FilePlus2,
  ImagePlus,
  Lock,
  LockOpen,
  Redo2,
  RefreshCw,
  Save,
  Settings2,
  Trash2,
  Undo2,
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
  drawCardImagePage,
  layoutCardPages,
  type CardLayoutPage,
  type CardLayoutResult,
} from "@/lib/renderers/cards";
import type { WechatImageNode } from "@/lib/renderers/wechat";
import { renderWechatContentHtml } from "@/lib/renderers/wechat";
import { createAssetBlobRepository, createEmptyProject, createProjectRepository, type ProjectAssetReference, type ProjectDocument } from "@/lib/storage";
import { styleTemplates, templateList } from "@/lib/style-templates";
import { cn } from "@/lib/utils";
import {
  DEFAULT_SOURCE_MARKDOWN,
  WORKSPACE_PLATFORM_IDS,
  WORKSPACE_PLATFORM_LABELS,
  createWorkspaceState,
  parseSourceMarkdown,
  readPersistedWorkspace,
  regeneratePlatformDraft,
  serializeWorkspace,
  toggleLockedPage,
  updatePlatformBlock,
  updatePlatformCaption,
  updatePlatformRatio,
  updatePlatformTags,
  updatePlatformTitle,
  withWechatHtmlOverride,
} from "./state";
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
  const [projectId, setProjectId] = React.useState(() => createEmptyProject().id);
  const [projectTitle, setProjectTitle] = React.useState("统一自媒体工作区");
  const [projects, setProjects] = React.useState<ProjectListItem[]>([]);
  const [assets, setAssets] = React.useState<AssetPlaceholder[]>([]);
  const [activePlatform, setActivePlatform] = React.useState<PlatformId>("wechat");
  const [mode, setMode] = React.useState<WorkspaceMode>("editor");
  const [saveState, setSaveState] = React.useState<"loading" | "dirty" | "saving" | "saved" | "error">("loading");
  const [statusMessage, setStatusMessage] = React.useState("正在恢复本地项目");
  const [history, setHistory] = React.useState<Record<PlatformId, DraftHistory>>(() => createEmptyHistories());
  const repoRef = React.useRef<ReturnType<typeof createProjectRepository> | undefined>(undefined);
  const assetRepoRef = React.useRef<ReturnType<typeof createAssetBlobRepository> | undefined>(undefined);
  const hydratedRef = React.useRef(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
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
    });
    return {
      ...result,
      pages: result.pages.map((page) => ({ ...page, locked: activeDraft.lockedPageIds.includes(page.id) || page.locked })),
    };
  }, [activeDraft, activePlatform, workspace.layout]);

  const wechatHtml = React.useMemo(() => {
    const template = styleTemplates[activeDraft.templateKey] ?? styleTemplates.zhenyiKnowledgeMinimal;
    return activeDraft.editedWechatHtml ?? renderWechatContentHtml(activeDraft.content, { template, imageNodes: createWechatImageNodes(activeDraft.content, assets) });
  }, [activeDraft, assets]);

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
    setSaveState("dirty");
    const timer = window.setTimeout(() => {
      void saveProject();
    }, 700);
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

  async function hydrateAssets(projectAssets: ProjectAssetReference[]) {
    const assetRepo = assetRepoRef.current;
    const nextAssets: AssetPlaceholder[] = [];
    for (const asset of projectAssets) {
      const loaded = await assetRepo?.getAssetBlob(asset.id);
      nextAssets.push({
        id: asset.id,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        byteLength: asset.byteLength,
        objectUrl: loaded?.state === "ready" ? URL.createObjectURL(loaded.blob) : undefined,
      });
    }
    setAssets((previous) => {
      previous.forEach((asset) => {
        if (asset.objectUrl) URL.revokeObjectURL(asset.objectUrl);
      });
      return nextAssets;
    });
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
        setWorkspace(restored);
        await hydrateAssets(result.project.assets);
        setStatusMessage("已恢复本地项目");
      } else if (result.state === "unknownVersion") {
        const fresh = createWorkspaceState();
        setWorkspace(fresh);
        setStatusMessage("发现更高版本项目，已保留数据并载入本地演示");
      } else {
        const fresh = createWorkspaceState();
        const project = createEmptyProject({ title: "统一自媒体工作区", article: parseSourceMarkdown(fresh.sourceMarkdown) });
        setProjectId(project.id);
        setProjectTitle(project.title);
        setWorkspace(fresh);
        setStatusMessage("已创建本地演示项目");
      }
      await refreshProjects();
      hydratedRef.current = true;
      setSaveState("saved");
    } catch (error) {
      hydratedRef.current = true;
      setSaveState("error");
      setStatusMessage(error instanceof Error ? error.message : "项目恢复失败，当前使用本地演示");
    }
  }

  async function saveProject() {
    const repo = repoRef.current;
    if (!repo) return;
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
      setSaveState("saved");
      setStatusMessage("已保存到浏览器本地");
    } catch (error) {
      setSaveState("error");
      setStatusMessage(error instanceof Error ? error.message : "保存失败，已有内容未清空");
    }
  }

  async function openProject(id: string) {
    const repo = repoRef.current;
    if (!repo) return;
    await saveProject();
    const result = await repo.getProject(id);
    if (result.state !== "ready") {
      setStatusMessage(result.state === "unknownVersion" ? "项目版本过高，无法在当前版本打开" : "项目不存在");
      return;
    }
    setProjectId(result.project.id);
    setProjectTitle(result.project.title);
    setWorkspace(workspaceFromDocument(result.project));
    await hydrateAssets(result.project.assets);
    setStatusMessage("项目已打开");
  }

  function createNewProject() {
    const fresh = createWorkspaceState();
    const project = createEmptyProject({ title: "未命名项目", article: parseSourceMarkdown(fresh.sourceMarkdown) });
    setProjectId(project.id);
    setProjectTitle(project.title);
    setWorkspace(fresh);
    setAssets([]);
    setHistory(createEmptyHistories());
    setStatusMessage("已新建项目");
  }

  async function deleteCurrentProject() {
    const repo = repoRef.current;
    const assetRepo = assetRepoRef.current;
    if (!repo) return;
    try {
      await repo.deleteProject(projectId, { assetRepository: assetRepo });
      createNewProject();
      await refreshProjects();
      setStatusMessage("项目已删除");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "删除失败");
    }
  }

  function updateWorkspace(patch: Partial<WorkspacePersistedState>) {
    setWorkspace((current) => ({ ...current, ...patch }));
  }

  function commitPlatform(nextDraft: PlatformDraft) {
    setWorkspace((current) => {
      const previous = current.platforms[nextDraft.platform];
      setHistory((histories) => ({
        ...histories,
        [nextDraft.platform]: {
          past: [...histories[nextDraft.platform].past, previous].slice(-30),
          future: [],
        },
      }));
      return {
        ...current,
        platforms: { ...current.platforms, [nextDraft.platform]: nextDraft },
      };
    });
  }

  function regenerateCurrentPlatform() {
    commitPlatform(regeneratePlatformDraft(activeDraft, sourceArticle, workspace.ai));
    setStatusMessage(workspace.ai.mode === "assistant" ? "AI 未配置，已使用本地确定性生成" : "已使用本地确定性生成");
  }

  function regenerateAllPlatforms() {
    setWorkspace((current) => ({
      ...current,
      platforms: Object.fromEntries(
        WORKSPACE_PLATFORM_IDS.map((platform) => [platform, regeneratePlatformDraft(current.platforms[platform], sourceArticle, current.ai)]),
      ) as Record<PlatformId, PlatformDraft>,
    }));
    setStatusMessage("四个平台已重新生成");
  }

  function undoPlatform() {
    const h = history[activePlatform];
    const previous = h.past.at(-1);
    if (!previous) return;
    setHistory((histories) => ({
      ...histories,
      [activePlatform]: {
        past: histories[activePlatform].past.slice(0, -1),
        future: [activeDraft, ...histories[activePlatform].future],
      },
    }));
    setWorkspace((current) => ({ ...current, platforms: { ...current.platforms, [activePlatform]: previous } }));
  }

  function redoPlatform() {
    const h = history[activePlatform];
    const next = h.future[0];
    if (!next) return;
    setHistory((histories) => ({
      ...histories,
      [activePlatform]: {
        past: [...histories[activePlatform].past, activeDraft],
        future: histories[activePlatform].future.slice(1),
      },
    }));
    setWorkspace((current) => ({ ...current, platforms: { ...current.platforms, [activePlatform]: next } }));
  }

  async function uploadAssets(files: FileList | File[]) {
    const assetRepo = assetRepoRef.current;
    if (!assetRepo) return;
    const uploaded: AssetPlaceholder[] = [];
    for (const file of Array.from(files)) {
      try {
        const saved = await assetRepo.saveImageBlob({ projectId, blob: file, fileName: file.name });
        uploaded.push({ ...saved, objectUrl: URL.createObjectURL(file) });
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : `${file.name} 上传失败`);
      }
    }
    if (uploaded.length) {
      setAssets((current) => [...current, ...uploaded]);
      setStatusMessage(`已上传 ${uploaded.length} 张图片`);
    }
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
      await copyRichText(wechatHtml);
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
    const blob = new Blob([wechatHtml], { type: "text/html;charset=utf-8" });
    downloadBlob(blob, `${activeDraft.title || "wechat"}.html`);
  }

  async function exportCardPng(page: CardLayoutPage) {
    const canvas = document.createElement("canvas");
    canvas.width = page.canvas.width;
    canvas.height = page.canvas.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawCardImagePage(ctx, page);
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, `${activeDraft.title || activePlatform}-${page.pageNumber}.png`);
    }, "image/png");
  }

  async function copyCardPng(page: CardLayoutPage) {
    const canvas = document.createElement("canvas");
    canvas.width = page.canvas.width;
    canvas.height = page.canvas.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawCardImagePage(ctx, page);
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setStatusMessage("PNG 已复制");
      } catch {
        setStatusMessage("图片剪贴板不可用，已保留下载入口");
      }
    }, "image/png");
  }

  function updateLayout(patch: Partial<LayoutSettings>) {
    updateWorkspace({ layout: { ...workspace.layout, ...patch } });
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
          <Button type="button" size="sm" variant="outline" onClick={createNewProject}>
            <FilePlus2 className="h-4 w-4" />
            新建
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => void saveProject()}>
            <Save className="h-4 w-4" />
            保存
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
            onTogglePageLock={(pageId) => commitPlatform(toggleLockedPage(activeDraft, pageId))}
            onExportCard={(page) => void exportCardPng(page)}
            onCopyCard={(page) => void copyCardPng(page)}
            aiMode={workspace.ai.mode}
            onAiModeChange={(modeValue) =>
              updateWorkspace({
                ai: {
                  ...workspace.ai,
                  mode: modeValue,
                  lastFallbackReason: modeValue === "assistant" ? "AI 接口未在本工作区配置，生成时会退回本地确定性转换。" : DEFAULT_SOURCE_MARKDOWN ? "当前使用本地确定性转换。" : undefined,
                },
              })
            }
            temperature={workspace.ai.temperature}
            onTemperatureChange={(temperature) => updateWorkspace({ ai: { ...workspace.ai, temperature } })}
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
    </main>
  );
}

function SourcePanel(props: {
  sourceMarkdown: string;
  article: UnifiedArticleContent;
  assets: AssetPlaceholder[];
  onSourceChange: (value: string) => void;
  onReparse: () => void;
  onRegenerateAll: () => void;
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
          <Button type="button" size="sm" onClick={props.onRegenerateAll}>
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
  onRegenerate: () => void;
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
            <Button type="button" size="sm" onClick={props.onRegenerate}>
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
  onTogglePageLock: (pageId: string) => void;
  onExportCard: (page: CardLayoutPage) => void;
  onCopyCard: (page: CardLayoutPage) => void;
  aiMode: "deterministic" | "assistant";
  onAiModeChange: (mode: "deterministic" | "assistant") => void;
  temperature: number;
  onTemperatureChange: (value: number) => void;
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
          <Range label="温度" value={props.temperature} min={0} max={1} step={0.1} onChange={props.onTemperatureChange} />
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
  onTogglePageLock: (pageId: string) => void;
  onExportCard: (page: CardLayoutPage) => void;
  onCopyCard: (page: CardLayoutPage) => void;
}) {
  if (!props.layout) return null;
  return (
    <div className="space-y-5">
      {props.layout.pages.map((page) => (
        <div key={page.id} className="mx-auto w-[270px]">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {page.canvas.width}x{page.canvas.height} · {page.pageNumber}/{page.totalPages}
            </span>
            <div className="flex gap-1">
              <Button type="button" size="sm" variant="outline" onClick={() => props.onTogglePageLock(page.id)} aria-label="锁定页面">
                {page.locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
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
