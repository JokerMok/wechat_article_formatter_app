"use client";

import * as React from "react";
import {
  Columns3,
  Download,
  Eye,
  FilePenLine,
  FilePlus2,
  LayoutTemplate,
  MoreHorizontal,
  Palette,
  RefreshCw,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import type { PlatformId } from "@/lib/platforms/types";
import { cn } from "@/lib/utils";
import { WORKSPACE_PLATFORM_IDS, WORKSPACE_PLATFORM_LABELS } from "./state";
import type { WorkspaceMode } from "./types";

export type WorkspaceFocusMode = "all" | "editor" | "preview";

type ProjectListItem = {
  id: string;
  title: string;
};

export function WorkspaceHeader(props: {
  projectId: string;
  projectTitle: string;
  projects: ProjectListItem[];
  saveStateLabel: string;
  saveError: boolean;
  statusMessage: string;
  activePlatform: PlatformId;
  platformStatus: Record<PlatformId, string>;
  mode: WorkspaceMode;
  focusMode: WorkspaceFocusMode;
  generating: boolean;
  onProjectTitleChange: (value: string) => void;
  onOpenProject: (id: string) => void;
  onPlatformChange: (platform: PlatformId) => void;
  onModeChange: (mode: WorkspaceMode) => void;
  onFocusModeChange: (mode: WorkspaceFocusMode) => void;
  onGenerate: () => void;
  onOpenStyles: () => void;
  onNew: () => void;
  onSave: () => void;
  onExport: () => void;
  onImport: () => void;
  onDelete: () => void;
}) {
  const [moreOpen, setMoreOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const projectOptions = props.projects.some((project) => project.id === props.projectId)
    ? props.projects
    : [{ id: props.projectId, title: props.projectTitle || "未命名项目" }, ...props.projects];

  React.useEffect(() => {
    if (!moreOpen) return;
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [moreOpen]);

  return (
    <>
      <header className="z-30 shrink-0 border-b border-[#31443b] bg-[#1d2b25] text-white">
        <div className="mx-auto flex h-14 max-w-[1760px] items-center gap-3 px-3 lg:px-4">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:min-w-[210px] sm:flex-none">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#d9f4e4] text-[#17633d]">
              <LayoutTemplate className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-[13px] font-semibold sm:text-sm">自媒体内容排版器</h1>
              <p className="hidden truncate text-[10px] text-[#aebfb6] min-[430px]:block">一篇源文，逐端生成</p>
            </div>
          </div>

          <Input
            value={props.projectTitle}
            onChange={(event) => props.onProjectTitleChange(event.target.value)}
            className="hidden h-8 w-[200px] border-white/15 bg-white/[0.08] text-xs text-white shadow-none placeholder:text-white/45 focus-visible:ring-[#d9f4e4] md:block"
            aria-label="项目名称"
          />
          <Select value={props.projectId} onValueChange={props.onOpenProject}>
            <SelectTrigger className="hidden h-8 w-[190px] border-white/15 bg-white/[0.08] text-xs text-white hover:bg-white/[0.12] lg:flex" aria-label="打开项目">
              <span className="truncate">{projectOptions.find((project) => project.id === props.projectId)?.title ?? props.projectTitle}</span>
            </SelectTrigger>
            <SelectContent>
              {projectOptions.map((project) => (
                <SelectItem key={project.id} value={project.id}>{project.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="ml-auto hidden min-w-0 items-center gap-2 xl:flex">
            <span className={cn("rounded-full border px-2 py-1 text-[11px]", props.saveError ? "border-red-300/50 bg-red-900/30 text-red-100" : "border-white/15 bg-white/[0.08] text-[#c0d0c7]")}>{props.saveStateLabel}</span>
            <span className="max-w-[220px] truncate text-[11px] text-[#9fb1a8]" title={props.statusMessage}>{props.statusMessage}</span>
          </div>

          <Button type="button" size="sm" className="h-8 bg-[#d9f4e4] text-[#173b29] hover:bg-[#c9ead7]" onClick={props.onGenerate} disabled={props.generating} aria-label="生成当前平台">
            <RefreshCw className={cn("h-4 w-4", props.generating && "animate-spin")} />
            <span className="hidden sm:inline">生成当前平台</span>
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-white hover:bg-white/10 hover:text-white lg:w-auto lg:px-3" onClick={props.onOpenStyles} aria-label="排版方案">
            <Palette className="h-4 w-4" />
            <span className="hidden lg:inline">排版方案</span>
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/10 hover:text-white" onClick={props.onSave} aria-label="保存项目">
            <Save className="h-4 w-4" />
          </Button>
          <div ref={menuRef} className="relative">
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/10 hover:text-white" onClick={() => setMoreOpen((value) => !value)} aria-haspopup="menu" aria-expanded={moreOpen} aria-label="更多项目操作">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
            {moreOpen && (
              <div className="absolute right-0 top-10 z-50 w-44 rounded-md border border-[#d8e1dc] bg-white p-1 text-[#17231f] shadow-xl" role="menu">
                <MenuAction icon={FilePlus2} label="新建项目" onClick={() => { setMoreOpen(false); props.onNew(); }} />
                <MenuAction icon={Upload} label="导入项目" onClick={() => { setMoreOpen(false); props.onImport(); }} />
                <MenuAction icon={Download} label="导出项目" onClick={() => { setMoreOpen(false); props.onExport(); }} />
                <div className="my-1 border-t" />
                <MenuAction icon={Trash2} label="删除项目" destructive onClick={() => { setMoreOpen(false); props.onDelete(); }} />
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="z-20 shrink-0 border-b border-[#d8e1dc] bg-white">
        <div className="mx-auto flex h-11 max-w-[1760px] items-center gap-3 px-3 lg:px-4">
          <nav className="flex min-w-0 flex-1 items-stretch gap-1 overflow-x-auto" aria-label="目标平台">
            {WORKSPACE_PLATFORM_IDS.map((platform) => (
              <button
                key={platform}
                type="button"
                aria-current={props.activePlatform === platform ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17633d] focus-visible:ring-inset",
                  props.activePlatform === platform ? "border-[#17633d] text-[#17231f]" : "border-transparent text-[#67756e] hover:text-[#17231f]",
                )}
                onClick={() => props.onPlatformChange(platform)}
              >
                {WORKSPACE_PLATFORM_LABELS[platform]}
                <span className={cn("text-[10px]", props.platformStatus[platform] === "待重新生成" || props.platformStatus[platform] === "源文已更新" ? "text-[#a05a17]" : "text-[#8a9891]")}>{props.platformStatus[platform]}</span>
              </button>
            ))}
          </nav>

          <div className="hidden items-center gap-1 lg:flex" role="group" aria-label="工作区显示模式">
            <FocusButton label="全部面板" active={props.focusMode === "all"} onClick={() => props.onFocusModeChange("all")}><Columns3 className="h-4 w-4" /></FocusButton>
            <FocusButton label="专注编辑" active={props.focusMode === "editor"} onClick={() => props.onFocusModeChange("editor")}><FilePenLine className="h-4 w-4" /></FocusButton>
            <FocusButton label="专注预览" active={props.focusMode === "preview"} onClick={() => props.onFocusModeChange("preview")}><Eye className="h-4 w-4" /></FocusButton>
          </div>

          <div className="flex rounded-md bg-[#edf2ef] p-0.5 lg:hidden" role="group" aria-label="移动端视图">
            {(["source", "editor", "preview"] as WorkspaceMode[]).map((mode) => (
              <button key={mode} type="button" className={cn("rounded px-2.5 py-1 text-xs", props.mode === mode ? "bg-white font-medium shadow-sm" : "text-muted-foreground")} onClick={() => props.onModeChange(mode)}>
                {mode === "source" ? "源文" : mode === "editor" ? "编辑" : "预览"}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function MenuAction(props: { icon: React.ComponentType<{ className?: string }>; label: string; destructive?: boolean; onClick: () => void }) {
  const Icon = props.icon;
  return (
    <button type="button" role="menuitem" className={cn("flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm hover:bg-[#f0f4f1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17633d]", props.destructive && "text-red-700 hover:bg-red-50")} onClick={props.onClick}>
      <Icon className="h-4 w-4" /> {props.label}
    </button>
  );
}

function FocusButton(props: { label: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button type="button" size="icon" variant="ghost" className={cn("h-8 w-8", props.active && "bg-[#e5f3eb] text-[#17633d]")} onClick={props.onClick} aria-label={props.label} title={props.label}>
      {props.children}
    </Button>
  );
}
