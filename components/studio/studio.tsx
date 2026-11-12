"use client";
import { useRef, useState, type ClipboardEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  FileText,
  Check,
  ChevronDown,
  Columns2,
  Copy,
  Download,
  History,
  ImagePlus,
  LayoutTemplate,
  Monitor,
  Palette,
  Plus,
  Redo2,
  Search,
  Settings2,
  UserRound,
  Smartphone,
  Sparkles,
  Undo2,
  Upload,
  X,
  Bold,
  Italic,
  RotateCcw,
} from "lucide-react";
import JSZip from "jszip";
import { ArticleLayoutPanel } from "./article-layout-panel";
import { seedLayout, useArticleLayout } from "./use-article-layout";
import { layoutIndex, layoutStepFor } from "@/lib/studio/article-layout";
import {
  layoutLabels,
  type PlannedComponent,
} from "@/lib/studio/layout-contract";
import { useStudio } from "./use-studio";
import { StudioDialog } from "./dialog";
import {
  PanelToggle,
  WorkspacePanel,
  useCompactWorkspace,
} from "./workspace-panel";
import { ArticleCanvas } from "./article-canvas";
import { StyleLearning } from "./style-learning";
import { CoverWorkbench } from "./cover-workbench";
import { DraftList, DraftMenu } from "./draft-list";
import { StyleAssetDialog, type StyleAssetMode } from "./style-asset-dialog";
import { StyleSwatch, StyleLibraryCard } from "./style-card";
import { TokenFields } from "./controls";
import { ComponentFields } from "./component-fields";
import { scopedStorageName } from "@/lib/accounts/browser";
import { AIAccess } from "../workspace/ai-access";
import {
  clipboardArticle,
  detectTextFormat,
  parseArticle,
  plainHTML,
} from "@/lib/studio/import";
import {
  articleFileTypes,
  prepareImportedImages,
  readArticleFile,
} from "@/lib/studio/article-file";
import { escapeMarkup } from "@/lib/content/markdown";
import {
  builtInStyles,
  blockStyle,
  effectiveTokens,
} from "@/lib/studio/styles";
import {
  articleImages,
  checkImages,
  downloadBlob,
  wechatHTML,
} from "@/lib/studio/renderer";
import { studioDB, storeImage } from "@/lib/studio/storage";
import { coverBlob } from "@/lib/studio/cover";
import { copyRichText } from "@/lib/copy-rich-text";
import {
  uid,
  kindLabels,
  styleProfileSchema,
  type ArticleBlock,
  type ArticleDocument,
  type BlockKind,
  type StyleProfile,
} from "@/lib/studio/types";

type Management =
  | { kind: "renameDraft"; article: ArticleDocument }
  | { kind: "trash"; ids: string[] }
  | { kind: "deleteStyle"; profile: StyleProfile; used: number }
  | { kind: "style"; mode: StyleAssetMode; profile: StyleProfile };
type View = "home" | "editor" | "library" | "learn" | "cover";
export default function Studio({
  accountMenu,
  connectionStatus,
}: {
  accountMenu?: ReactNode;
  connectionStatus?: { layoutOff: boolean; cloudConfigured: boolean };
} = {}) {
  const s = useStudio();
  const smartLayout = useArticleLayout(s.update);
  const [showLayout, setShowLayout] = useState(false);
  const compact = useCompactWorkspace();
  const [mobilePanel, setMobilePanel] = useState<"styles" | "settings" | null>(
    null,
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const showSidebar = compact ? mobilePanel === "styles" : sidebarOpen;
  const showInspector = compact ? mobilePanel === "settings" : inspectorOpen;
  const togglePanel = (panel: "styles" | "settings") => {
    if (compact)
      setMobilePanel((current) => (current === panel ? null : panel));
    else if (panel === "styles") setSidebarOpen((current) => !current);
    else setInspectorOpen((current) => !current);
  };
  const { article, profile } = s;
  const [view, setActiveView] = useState<View>(() => {
      try {
        if (
          typeof window !== "undefined" &&
          sessionStorage.getItem(scopedStorageName("style-studio-editor")) === "1"
        )
          return "editor";
      } catch {}
      return "home";
    }),
    [preview, setPreview] = useState<"desktop" | "mobile" | "compare">(
      "mobile",
    );
  const singlePreview = useRef<"mobile" | "desktop">("mobile");
  const changePreview = (next: typeof preview) => {
    if (next !== "compare") singlePreview.current = next;
    setPreview(next);
  };
  const setView = (next: View) => {
    setActiveView(next);
    try {
      if (next === "editor") sessionStorage.setItem(scopedStorageName("style-studio-editor"), "1");
      else sessionStorage.removeItem(scopedStorageName("style-studio-editor"));
    } catch {}
  };
  const [selected, setSelected] = useState<string>(),
    [sideTab, setSideTab] = useState<"styles" | "outline">("outline"),
    [scope, setScope] = useState<"global" | "block">("global");
  const [dialog, setDialog] = useState<
    "import" | "export" | "history" | "settings" | "account" | null
  >(null);
  const [importFormat, setImportFormat] = useState<
      "text" | "markdown" | "html"
    >("markdown"),
    [importText, setImportText] = useState("");
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState<"all" | "mine" | "favorite">("all");
  const [learningSeed, setLearningSeed] = useState<StyleProfile>(),
    [compareIds, setCompareIds] = useState<string[]>(
      builtInStyles.map((p) => p.id),
    );
  const [management, setManagement] = useState<Management>();
  const [newName, setNewName] = useState("");
  const [trash, setTrash] = useState(false);
  const [draftSelection, setDraftSelection] = useState<string[]>([]);
  const [candidateChoice, setCandidateChoice] = useState<{
    articleId: string;
    profile: StyleProfile;
  }>();
  const candidate =
    candidateChoice?.articleId === article?.id
      ? candidateChoice?.profile
      : undefined;
  const [styleSearch, setStyleSearch] = useState("");
  const [styleFilter, setStyleFilter] = useState<"all" | "custom" | "favorite">(
    "all",
  );
  const [versionPicks, setVersionPicks] = useState<Record<string, number>>({});
  const [exportWidth, setExportWidth] = useState(390);
  const [exportResult, setExportResult] = useState<{
      html: string;
      warnings: string[];
    }>(),
    [busy, setBusy] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null),
    styleInput = useRef<HTMLInputElement>(null),
    articleFile = useRef<HTMLInputElement>(null),
    importing = useRef(false);
  const block = article?.blocks.find((b) => b.id === selected);
  const tokens = article ? effectiveTokens(article, profile) : profile.tokens;
  const notifyError = (error: unknown) =>
    s.setError(error instanceof Error ? error.message : String(error));
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    s.setError("");
    try {
      await action();
    } catch (error) {
      notifyError(error);
    } finally {
      setBusy(false);
    }
  };
  const focusBlock = (id?: string, end = false) => {
    requestAnimationFrame(() => {
      const canvas = document.querySelector<HTMLElement>(
        '[aria-label="文章编辑画布"]',
      );
      const field = id
        ? canvas?.querySelector<HTMLElement>(
            `[data-block-id="${id}"] [contenteditable]`,
          )
        : canvas?.querySelector<HTMLElement>("[contenteditable]");
      (field ?? canvas)?.focus({ preventScroll: !id });
      if (field && end) {
        const range = document.createRange();
        range.selectNodeContents(field);
        range.collapse(false);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    });
  };
  const addBlock = (kind: BlockKind = "paragraph", text = "") => {
    const block: ArticleBlock = {
      id: uid("block"),
      kind,
      html: escapeMarkup(text).replace(/\n/g, "<br>"),
    };
    s.update((a) => {
      const blocks = [...a.blocks];
      const i = blocks.findIndex((b) => b.id === selected);
      blocks.splice(i < 0 ? blocks.length : i + 1, 0, block);
      return { ...a, blocks };
    });
    setSelected(block.id);
    setScope("block");
    focusBlock(block.id, true);
  };
  const editBlock = (
    patch: Partial<ArticleBlock>,
    id = selected,
    group = false,
  ) =>
    s.update(
      (a) => ({
        ...a,
        blocks: a.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      }),
      group ? `block:${id}:${Object.keys(patch).join(",")}` : false,
    );
  const startLearn = () => {
    setLearningSeed(undefined);
    setView("learn");
  };
  const openEditor = async (id?: string) => {
    await s.openArticle(id);
    setCandidateChoice(undefined);
    setSelected(undefined);
    setShowLayout(false);
    setView("editor");
  };
  const importIntoArticle = (
    read: (warnings: string[]) => ArticleBlock[] | Promise<ArticleBlock[]>,
    options: { after?: string; replace?: boolean; replaceImage?: string } = {},
  ) => {
    if (!article || importing.current) return;
    const articleId = article.id;
    importing.current = true;
    void run(async () => {
      const warnings: string[] = [];
      try {
        const parsed = await read(warnings);
        const { blocks, stored } = await prepareImportedImages(
          parsed,
          warnings,
        );
        if (!blocks.length)
          throw new Error(
            warnings.length ? warnings.join("；") : "没有可导入的正文或图片。",
          );
        if (stored || blocks.some((b) => b.src?.startsWith("asset:")))
          await s.refresh();
        let initialLayout: ArticleDocument | undefined;
        const updated = s.update((a) => {
          if (a.id !== articleId) return a;
          if (
            options.replaceImage &&
            a.blocks.some((b) => b.id === options.replaceImage)
          ) {
            return {
              ...a,
              blocks: a.blocks.map((b) =>
                b.id === options.replaceImage
                  ? { ...b, src: blocks[0].src, alt: blocks[0].alt }
                  : b,
              ),
            };
          }
          const next = options.replace ? [] : [...a.blocks];
          const index = next.findIndex((b) => b.id === options.after);
          const offset = index < 0 ? next.length : index + 1;
          const name =
            !a.blocks.length || options.replace
              ? plainHTML(
                  blocks.find((b) => b.kind === "title")?.html ??
                    blocks.find((b) => b.html)?.html ??
                    "",
                )
                  .trim()
                  .slice(0, 50)
              : "";
          const nextArticle = {
            ...a,
            name: a.name === "未命名文章" && name ? name : a.name,
            blocks: [
              ...next.slice(0, offset),
              ...blocks,
              ...next.slice(offset),
            ],
          };
          if (!a.blocks.length || options.replace) {
            const automatic = a.layout?.automatic ?? true;
            if (
              automatic &&
              nextArticle.blocks.some(
                (block) =>
                  block.kind === "paragraph" && block.html.length >= 16,
              )
            ) {
              nextArticle.layout = seedLayout(
                nextArticle,
                profile,
                a.layout?.settings,
                automatic,
              );
              initialLayout = nextArticle;
            } else if (a.layout) {
              nextArticle.layout = {
                ...seedLayout(
                  nextArticle,
                  profile,
                  a.layout.settings,
                  automatic,
                ),
                enabled: false,
              };
            }
          }
          return nextArticle;
        });
        if (!updated) return;
        if (initialLayout?.layout)
          smartLayout.analyze(
            initialLayout,
            profile,
            initialLayout.layout,
            false,
          );
        setDialog(null);
        setImportText("");
        setSelected(options.replaceImage);
        if (warnings.length) {
          const details = [...new Set(warnings)].slice(0, 3).join("；");
          s.setError(
            `已导入 ${blocks.length} 个内容块。部分内容未能导入（${details}${warnings.length > 3 ? `等 ${warnings.length} 项` : ""}）。`,
          );
        } else s.setMessage("");
        if (!article.blocks.length || options.replace) focusBlock();
      } finally {
        importing.current = false;
      }
    });
  };
  const readImages = async (files: File[], warnings: string[]) => {
    const images: ArticleBlock[] = [];
    for (const file of files) {
      try {
        const asset = await storeImage(file);
        images.push({
          id: uid("block"),
          kind: "image",
          html: "",
          src: `asset:${asset.id}`,
          alt: file.name,
        });
      } catch (error) {
        warnings.push(
          `${file.name || "剪贴板图片"}：${(error as Error).message}`,
        );
      }
    }
    return images;
  };
  const pasteIntoCanvas = (event: ClipboardEvent<HTMLElement>) => {
    const data = event.clipboardData;
    const html = data.getData("text/html");
    const text = data.getData("text/plain");
    const source = clipboardArticle(html, text, data.getData("text/markdown"));
    const images = Array.from(data.files).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (!source.input.trim() && !images.length) return;
    if (importing.current) {
      event.preventDefault();
      return;
    }
    const target = event.target as HTMLElement;
    const after =
      target.closest<HTMLElement>("[data-block-id]")?.dataset.blockId ??
      selected;
    const inline = Boolean(target.closest("[contenteditable]"));
    const warnings: string[] = [];
    let blocks: ArticleBlock[];
    try {
      try {
        blocks = parseArticle(source.input, source.format, document, warnings);
      } catch (error) {
        if (source.format !== "html" || !text.trim()) throw error;
        warnings.push("剪贴板 HTML 无法解析，已保留文字");
        blocks = parseArticle(text, detectTextFormat(text), document, warnings);
      }
      if (!blocks.length && text.trim() && source.format === "html")
        blocks = parseArticle(text, detectTextFormat(text), document, warnings);
    } catch (error) {
      event.preventDefault();
      notifyError(error);
      return;
    }
    event.preventDefault();
    if (
      inline &&
      !images.length &&
      !warnings.length &&
      blocks.length === 1 &&
      blocks[0].kind === "paragraph" &&
      !blocks[0].html.includes("<img")
    ) {
      document.execCommand("insertHTML", false, blocks[0].html);
      return;
    }
    importIntoArticle(
      async (issues) => {
        issues.push(...warnings);
        const hasImages = blocks.some(
          (b) => b.kind === "image" || b.html.includes("<img"),
        );
        return images.length && !hasImages
          ? [...blocks, ...(await readImages(images, issues))]
          : blocks;
      },
      { after },
    );
  };
  const renameDraft = (draft: ArticleDocument) => {
    setNewName(draft.name);
    setManagement({ kind: "renameDraft", article: draft });
  };
  const copyDraft = (id: string) =>
    void run(async () => {
      await s.duplicateDraft(id, view === "editor");
      setCandidateChoice(undefined);
      s.setMessage("已复制文章。");
    });
  const requestTrash = (ids: string[]) => setManagement({ kind: "trash", ids });
  const restoreDrafts = (ids: string[]) =>
    void run(async () => {
      await s.restoreArticles(ids);
      setDraftSelection([]);
      s.setMessage("稿件已恢复。");
    });
  const editAsset = (mode: StyleAssetMode, target: StyleProfile) => {
    if (compact) setMobilePanel(null);
    setManagement({ kind: "style", mode, profile: target });
  };
  const copyStyle = (target: StyleProfile) =>
    void run(async () => {
      const saved = await s.addProfile({
        ...target,
        id: uid("style"),
        name: `${target.name.slice(0, 74)} · 副本`,
        favorite: false,
        source: {
          ...target.source,
          type: target.id.startsWith("builtin-") ? "text" : target.source.type,
        },
      });
      s.setMessage(`已复制「${saved.name}」。`);
    });
  const requestDeleteStyle = async (target: StyleProfile) => {
    const drafts = await studioDB().articles.toArray();
    const ids = new Set(
      drafts.filter((row) => row.styleId === target.id).map((row) => row.id),
    );
    if (article) {
      if (article.styleId === target.id) ids.add(article.id);
      else ids.delete(article.id);
    }
    setManagement({ kind: "deleteStyle", profile: target, used: ids.size });
  };
  const confirmManagement = () => {
    if (!management || management.kind === "style") return;
    const action = management;
    void run(async () => {
      if (action.kind === "renameDraft")
        await s.renameDraft(action.article.id, newName.trim());
      if (action.kind === "trash") {
        await s.trashArticles(action.ids);
        setDraftSelection([]);
        if (article && action.ids.includes(article.id)) {
          setCandidateChoice(undefined);
          setSelected(undefined);
          setView("home");
        }
        s.setMessage("已移至回收站。");
      }
      if (action.kind === "deleteStyle") {
        await s.removeProfile(action.profile.id);
        if (candidate?.id === action.profile.id) setCandidateChoice(undefined);
        s.setMessage("风格已从风格库移除。");
      }
      setManagement(undefined);
    });
  };
  const applyStyle = (target: StyleProfile, clearLocal = false) => {
    s.applyProfile(target, clearLocal);
    setCandidateChoice(undefined);
    if (preview === "compare") setPreview(singlePreview.current);
  };
  const applyManualComponent = (
    blockId: string,
    component: PlannedComponent | undefined,
    level?: number,
  ) => {
    s.update((current) => {
      if (!current.layout) return current;
      const manual = { ...current.layout.manual };
      if (component) manual[blockId] = { component, level };
      else delete manual[blockId];
      return {
        ...current,
        layout: { ...current.layout, enabled: true, manual },
      };
    });
  };
  const openExport = async () => {
    if (!article) return;
    await checkImages(article, s.assets);
    setExportResult(wechatHTML(article, profile, s.assets));
    setDialog("export");
  };
  const exportPackage = async () => {
    if (!article) return;
    await checkImages(article, s.assets);
    const result = wechatHTML(article, profile, s.assets);
    const zip = new JSZip();
    zip.file(
      "article.html",
      `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body>${result.html}</body></html>`,
    );
    zip.file("article.json", JSON.stringify(article, null, 2));
    zip.file(
      "style-profile.json",
      JSON.stringify({ ...profile, tokens }, null, 2),
    );
    const localImages = new Set(
      articleImages(article, s.assets).map(({ src }) => src),
    );
    let imageIndex = 0;
    for (const src of localImages) {
      const embedded = src?.match(
        /^data:image\/(png|jpeg|webp|gif);base64,(.+)$/,
      );
      if (embedded)
        zip.file(
          `images/${++imageIndex}.${embedded[1] === "jpeg" ? "jpg" : embedded[1]}`,
          embedded[2],
          { base64: true },
        );
    }
    if (article.coverId) {
      const cover = await studioDB().covers.get(article.coverId);
      if (cover) {
        zip.file("cover.png", await coverBlob(cover, s.assets));
        zip.file("cover.json", JSON.stringify(cover, null, 2));
      }
    }
    zip.file(
      "使用说明.txt",
      [
        "正文已经过安全过滤并内联 CSS。",
        ...result.warnings,
        "请在公众号后台上传 images 中的本地图片，保存草稿并核对手机预览。",
        "本文件包为本地交付产物，未自动发布。",
      ].join("\n"),
    );
    downloadBlob(
      await zip.generateAsync({ type: "blob" }),
      `${article.name || "文章"}_交付包.zip`,
    );
  };
  if (!article)
    return <div className="studio-app studio-loading">正在恢复工作台…</div>;
  const canvasPreview =
    preview === "compare" && !article.blocks.length ? "mobile" : preview;
  const shownStyles = s.latest
    .filter(
      (p) =>
        (filter !== "mine" || p.source.type !== "builtin") &&
        (filter !== "favorite" || p.favorite) &&
        `${p.name} ${p.tags.join(" ")}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => Number(b.favorite) - Number(a.favorite));
  const displayedProfile = candidate ?? profile;
  const displayedArticle = candidate
    ? { ...article, theme: undefined }
    : article;
  const displayedTokens = effectiveTokens(displayedArticle, displayedProfile);
  const selectedLayoutStep = block
    ? layoutStepFor(block, article.layout, layoutIndex(article.layout))
    : undefined;
  const sameStyle = (a: StyleProfile, b: StyleProfile) =>
    a.id === b.id && a.version === b.version;
  const quickStyles = [
    ...s.latest.filter((style) => style.id.startsWith("builtin-")),
    ...s.latest
      .filter((style) => !style.id.startsWith("builtin-"))
      .sort((a, b) => Number(b.favorite) - Number(a.favorite)),
  ];
  const latestAppliedStyle = quickStyles.find(
    (style) => style.id === profile.id,
  );
  const appliedOlderVersion =
    latestAppliedStyle && !sameStyle(latestAppliedStyle, profile);
  if (!latestAppliedStyle || appliedOlderVersion) quickStyles.unshift(profile);
  const previewStyle = (style: StyleProfile) => {
    setCandidateChoice(
      sameStyle(style, profile)
        ? undefined
        : { articleId: article.id, profile: style },
    );
    if (preview === "compare") setPreview(singlePreview.current);
  };
  const moreStyles = () => {
    if (showSidebar && sideTab === "styles") {
      togglePanel("styles");
    } else {
      setSideTab("styles");
      if (compact) setMobilePanel("styles");
      else setSidebarOpen(true);
    }
  };
  const compared = candidate
    ? [profile, candidate]
    : [
        profile,
        ...s.latest
          .filter(
            (style) => style.id !== profile.id && compareIds.includes(style.id),
          )
          .slice(0, 2),
      ];
  const available = s.latest.filter(
    (style) =>
      (styleFilter !== "custom" || !style.id.startsWith("builtin-")) &&
      (styleFilter !== "favorite" || style.favorite) &&
      `${style.name} ${style.tags.join(" ")}`
        .toLowerCase()
        .includes(styleSearch.trim().toLowerCase()),
  );
  return (
    <div className="studio-app" data-view={view}>
      <header className="studio-header">
        <button
          className="studio-brand"
          onClick={() => setView("home")}
          aria-label="返回我的工作台"
        >
          <span className="formatter-brand-mark">
            <LayoutTemplate size={19} aria-hidden="true" />
          </span>
          <strong>风格排版</strong>
        </button>
        <nav aria-label="主导航">
          {(
            [
              ["home", "我的工作台", FileText],
              ["editor", "文章排版", BookOpen],
              ["library", "我的风格", Palette],
              ["cover", "封面", ImagePlus],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              aria-current={view === key || (view === "learn" && key === "library") ? "page" : undefined}
              onClick={() => setView(key)}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="studio-header-end">
          <span
            className={`studio-save-state ${s.saveState.includes("失败") ? "error" : ""}`}
            role="status"
          >
            <i />
            {s.saveState}
          </span>
          {accountMenu ?? <button
            className="studio-icon-btn"
            aria-label="服务端连接设置"
            onClick={() => setDialog("settings")}
          >
            <Settings2 size={18} />
          </button>}
          {!accountMenu && (
            <button
              type="button"
              className="studio-account-status"
              onClick={() => setDialog("account")}
            >
              <UserRound size={15} aria-hidden="true" />
              账号未开通
            </button>
          )}
        </div>
      </header>
      {(s.error || s.message) && (
        <div
          className={`studio-feedback ${s.error ? "error" : ""}`}
          role={s.error ? "alert" : "status"}
        >
          <span>{s.error || s.message}</span>
          <button
            aria-label="关闭提示"
            onClick={() => {
              s.setError("");
              s.setMessage("");
            }}
          >
            <X size={15} />
          </button>
        </div>
      )}
      <input
        hidden
        ref={articleFile}
        type="file"
        accept={articleFileTypes}
        aria-label="选择文章文件"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file)
            importIntoArticle((warnings) => readArticleFile(file, warnings), {
              replace: dialog === "import",
            });
        }}
      />
      <input
        hidden
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        aria-label="上传文章图片"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file)
            importIntoArticle((warnings) => readImages([file], warnings), {
              after: selected,
              replaceImage: block?.kind === "image" ? block.id : undefined,
            });
        }}
      />
      <input
        hidden
        ref={styleInput}
        type="file"
        accept="application/json,.json"
        aria-label="导入风格文件"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file)
            void run(async () => {
              if (file.size > 1_000_000)
                throw new Error("风格文件过大，请选择 1 MB 以内的 JSON。");
              const parsed = styleProfileSchema.safeParse(
                JSON.parse(await file.text()),
              );
              if (!parsed.success)
                throw new Error("这不是有效的 StyleProfile 文件。");
              const saved = await s.addProfile({
                ...parsed.data,
                id: uid("style"),
                source: { ...parsed.data.source, imageId: undefined },
              });
              s.setMessage(`已导入「${saved.name}」。`);
            });
          e.target.value = "";
        }}
      />
      {view === "home" && (
        <main className="studio-home">
          <div className="studio-home-heading studio-home-hero">
            <h1>我的工作台</h1>
            <div className="studio-home-actions">
              <button
                className="studio-btn primary"
                onClick={() => void run(() => openEditor())}
              >
                <Plus size={18} />
                排版我的文章
              </button>
              <button className="studio-btn" onClick={startLearn}>
                <Sparkles size={17} />
                学习新风格
              </button>
            </div>
          </div>
          <DraftList
            articles={s.articles}
            selected={draftSelection}
            setSelected={setDraftSelection}
            trash={trash}
            setTrash={setTrash}
            onOpen={(id) => void run(() => openEditor(id))}
            onRename={renameDraft}
            onCopy={copyDraft}
            onDelete={requestTrash}
            onRestore={restoreDrafts}
          />
        </main>
      )}
      {view === "learn" && (
        <StyleLearning
          key={
            learningSeed ? `${learningSeed.id}:${learningSeed.version}` : "new"
          }
          initialProfile={learningSeed}
          assets={s.assets}
          onRefresh={s.refresh}
          onError={s.setError}
          onSaved={async (p) => {
            const saved = await s.addProfile(p);
            s.setError("");
            setView("library");
            s.setMessage(
              `「${saved.name}」v${saved.version} 已保存，可用于任意文章。`,
            );
          }}
        />
      )}
      {view === "library" && (
        <main className="studio-library">
          <div className="studio-home-heading">
            <div>
              <h1>我的风格</h1>
              <p>{s.latest.length} 套可复用风格</p>
            </div>
            <div className="studio-home-actions">
              <button
                className="studio-btn"
                onClick={() => styleInput.current?.click()}
              >
                <Upload size={16} />
                导入风格
              </button>
              <button className="studio-btn primary" onClick={startLearn}>
                <Sparkles size={16} />
                学习新风格
              </button>
            </div>
          </div>
          <div className="studio-library-toolbar">
            <div className="studio-segment">
              {(
                [
                  ["all", "全部"],
                  ["mine", "我的"],
                  ["favorite", "收藏"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="studio-search">
              <Search size={16} />
              <input
                aria-label="搜索风格"
                placeholder="搜索名称或标签"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>
          <div className="studio-library-grid">
            {shownStyles.map((latest) => {
              const p =
                s.profiles.find(
                  (p) =>
                    p.id === latest.id && p.version === versionPicks[latest.id],
                ) ?? latest;
              return (
                <StyleLibraryCard
                  key={p.id}
                  profile={p}
                  versions={s.profiles
                    .filter((v) => v.id === p.id)
                    .sort((a, b) => b.version - a.version)}
                  onVersion={(version) =>
                    setVersionPicks({ ...versionPicks, [p.id]: version })
                  }
                  onPreview={() => editAsset("preview", p)}
                  onEdit={() => editAsset("edit", p)}
                  onRename={() => editAsset("rename", latest)}
                  onCopy={() => copyStyle(p)}
                  onDelete={
                    p.id.startsWith("builtin-")
                      ? undefined
                      : () => void run(() => requestDeleteStyle(p))
                  }
                  onSource={() => editAsset("source", p)}
                  onFavorite={() =>
                    void run(async () => {
                      await s.addProfile({
                        ...latest,
                        favorite: !latest.favorite,
                      });
                    })
                  }
                  onExport={() =>
                    downloadBlob(
                      new Blob([JSON.stringify(p, null, 2)], {
                        type: "application/json",
                      }),
                      `${p.name}.style.json`,
                    )
                  }
                />
              );
            })}
          </div>
          {shownStyles.length === 0 && (
            <div className="studio-placeholder">
              <Palette size={32} />
              <p>还没有匹配的风格</p>
              <button className="studio-btn" onClick={startLearn}>
                学习新风格
              </button>
            </div>
          )}
        </main>
      )}
      {view === "editor" && (
        <>
          <div className="studio-editor-toolbar">
            <div className="studio-toolbar-document">
              <div className="studio-document-name">
                <button
                  className="studio-icon-btn"
                  aria-label="返回稿件列表"
                  onClick={() => setView("home")}
                >
                  <ArrowLeft size={17} />
                </button>
                <input
                  aria-label="稿件名称"
                  maxLength={80}
                  value={article.name}
                  onPaste={(event) => {
                    const pasted = event.clipboardData.getData("text/plain");
                    if (!/\r?\n/.test(pasted) || !/^\s*#\s+/.test(pasted)) return;
                    const title = parseArticle(
                      pasted.split(/\r?\n/)[0],
                      "markdown",
                    )[0];
                    if (title?.kind !== "title") return;
                    event.preventDefault();
                    s.update((a) => ({
                      ...a,
                      name: plainHTML(title.html).trim().slice(0, 80),
                    }));
                  }}
                  onChange={(e) =>
                    s.update((a) => ({ ...a, name: e.target.value }), true)
                  }
                />
                <DraftMenu
                  article={article}
                  onRename={() => renameDraft(article)}
                  onCopy={() => copyDraft(article.id)}
                  onDelete={() => requestTrash([article.id])}
                />
              </div>
              <div className="studio-toolbar-group">
                <button
                  className="studio-icon-btn"
                  aria-label="撤销"
                  disabled={!s.historyCount.undo}
                  onClick={s.undo}
                >
                  <Undo2 size={17} />
                </button>
                <button
                  className="studio-icon-btn"
                  aria-label="重做"
                  disabled={!s.historyCount.redo}
                  onClick={s.redo}
                >
                  <Redo2 size={17} />
                </button>
                <button
                  className="studio-icon-btn"
                  aria-label="编辑历史"
                  onClick={() =>
                    void run(async () => {
                      await s.loadRevisions();
                      setDialog("history");
                    })
                  }
                >
                  <History size={17} />
                </button>
              </div>
            </div>
            <div className="studio-toolbar-actions">
              <div className="studio-segment studio-preview-switch">
                {(
                  [
                    ["mobile", "手机预览", Smartphone],
                    ["desktop", "桌面预览", Monitor],
                    ["compare", "比较风格", Columns2],
                  ] as const
                ).map(([key, label, Icon]) => (
                  <button
                    key={key}
                    aria-label={label}
                    title={label}
                    aria-pressed={canvasPreview === key}
                    disabled={key === "compare" && !article.blocks.length}
                    onClick={() => changePreview(key)}
                  >
                    <Icon size={16} />
                    <span>
                      {key === "mobile"
                        ? "手机"
                        : key === "desktop"
                          ? "桌面"
                          : "比较"}
                    </span>
                  </button>
                ))}
              </div>
              <div className="studio-panel-toggles">
                <PanelToggle
                  label="风格与结构"
                  controls="editor-styles"
                  compact={compact}
                  open={showSidebar}
                  onClick={() => togglePanel("styles")}
                  icon={<Palette size={16} />}
                />
                <PanelToggle
                  label="样式设置"
                  controls="editor-inspector"
                  compact={compact}
                  open={showInspector}
                  onClick={() => togglePanel("settings")}
                  icon={<Settings2 size={16} />}
                />
              </div>
              <div className="studio-toolbar-end">
                {article.blocks.length > 0 && (
                  <button
                    className="studio-btn"
                    aria-label="导入"
                    onClick={() => setDialog("import")}
                  >
                    <Upload size={15} />
                    <span className="studio-import-label">导入</span>
                  </button>
                )}
                <button
                  className="studio-btn primary"
                  aria-label="导出"
                  disabled={!article.blocks.length || busy || !!candidate}
                  title={candidate ? "确认应用或取消预览后可导出" : undefined}
                  onClick={() => void run(openExport)}
                >
                  <Download size={15} />
                  <span className="studio-export-label">导出</span>
                  <ChevronDown className="studio-export-chevron" size={13} />
                </button>
              </div>
            </div>
          </div>
          <section className="studio-quick-styles" aria-label="快速风格切换">
            <div className="studio-quick-style-list">
              {quickStyles.map((style) => (
                <StyleSwatch
                  key={`${style.id}:${style.version}`}
                  profile={style}
                  quick
                  label={
                    appliedOlderVersion && sameStyle(style, profile)
                      ? `${style.name} v${style.version}`
                      : style.name
                  }
                  article={article}
                  assets={s.assets}
                  selected={sameStyle(style, displayedProfile)}
                  onClick={() => previewStyle(style)}
                />
              ))}
            </div>
            <button
              className="studio-btn studio-quick-style-more"
              aria-label="更多风格"
              aria-controls="editor-styles"
              aria-expanded={showSidebar && sideTab === "styles"}
              aria-haspopup={compact ? "dialog" : undefined}
              onClick={moreStyles}
            >
              <Palette size={15} aria-hidden="true" />
              <span>
                更多<span className="studio-quick-style-more-label">风格</span>
              </span>
            </button>
            <div className="studio-style-state">
              <span className="studio-quick-style-status" role="status">
                {candidate ? (
                  <>
                    <span className="studio-preview-badge">预览未保存</span>
                    <strong title={candidate.name}>{candidate.name}</strong>
                  </>
                ) : (
                  <>
                    <span>已应用</span>
                    <strong title={profile.name}>{profile.name}</strong>
                  </>
                )}
              </span>
              {candidate && (
                <>
                  <button
                    className="studio-btn primary"
                    onClick={() => applyStyle(candidate)}
                  >
                    确认应用
                  </button>
                  <button
                    className="studio-text-btn"
                    onClick={() => previewStyle(profile)}
                  >
                    恢复原风格
                  </button>
                </>
              )}
              <button
                className="studio-text-btn studio-quick-style-edit"
                aria-label="风格参数"
                title="风格参数"
                onClick={() => editAsset("edit", displayedProfile)}
              >
                <Settings2 size={15} aria-hidden="true" />
                {!candidate && <span>风格参数</span>}
              </button>
            </div>
          </section>
          <div
            className="studio-editor-grid"
            data-sidebar-open={showSidebar}
            data-inspector-open={showInspector}
          >
            <WorkspacePanel
              id="editor-styles"
              title="风格与结构"
              className="studio-editor-sidebar"
              compact={compact}
              open={showSidebar}
              onClose={() => setMobilePanel(null)}
            >
              {showSidebar && (
                <>
                  <div className="studio-segment">
                    {(
                      [
                        ["styles", "风格"],
                        ["outline", "结构"],
                      ] as const
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        aria-pressed={sideTab === key}
                        onClick={() => setSideTab(key)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {sideTab === "styles" ? (
                    <>
                      <div className="studio-style-filters">
                        <label className="studio-search">
                          <Search size={14} />
                          <input
                            aria-label="搜索可用风格"
                            placeholder="搜索风格"
                            value={styleSearch}
                            onChange={(event) =>
                              setStyleSearch(event.target.value)
                            }
                          />
                        </label>
                        <select
                          aria-label="筛选可用风格"
                          value={styleFilter}
                          onChange={(event) =>
                            setStyleFilter(
                              event.target.value as typeof styleFilter,
                            )
                          }
                        >
                          <option value="all">全部</option>
                          <option value="custom">自定义</option>
                          <option value="favorite">收藏</option>
                        </select>
                      </div>
                      <div className="studio-sidebar-styles">
                        {available.map((p) => (
                          <div key={p.id}>
                            <StyleSwatch
                              profile={p}
                              article={article}
                              assets={s.assets}
                              selected={sameStyle(p, displayedProfile)}
                              onClick={() => {
                                previewStyle(p);
                                if (compact) setMobilePanel(null);
                              }}
                            />
                            {canvasPreview === "compare" &&
                              !candidate &&
                              p.id !== profile.id && (
                                <label className="studio-compare-check">
                                  <input
                                    type="checkbox"
                                    aria-label={`比较 ${p.name}`}
                                    checked={compareIds.includes(p.id)}
                                    onChange={(event) =>
                                      setCompareIds(
                                        event.target.checked
                                          ? [...compareIds.slice(-1), p.id]
                                          : compareIds.filter(
                                              (id) => id !== p.id,
                                            ),
                                      )
                                    }
                                  />
                                  加入比较
                                </label>
                              )}
                          </div>
                        ))}
                        {!available.length && (
                          <p className="studio-note">没有匹配的风格</p>
                        )}
                      </div>
                      <button
                        className="studio-new-style sidebar"
                        onClick={startLearn}
                      >
                        <Plus size={18} />
                        学习新风格
                      </button>
                    </>
                  ) : (
                    <>
                      <ol className="studio-outline">
                        {article.blocks.map((b, index) => (
                          <li key={b.id}>
                            <button
                              aria-pressed={selected === b.id}
                              onClick={() => {
                                if (compact) setMobilePanel(null);
                                setSelected(b.id);
                                setScope("block");
                                document
                                  .querySelector(`[data-block-id="${b.id}"]`)
                                  ?.scrollIntoView({
                                    block: "center",
                                    behavior: "smooth",
                                  });
                              }}
                            >
                              <span>{index + 1}</span>
                              <div>
                                <small>{kindLabels[b.kind]}</small>
                                <strong>
                                  {b.kind === "image"
                                    ? b.alt || "图片"
                                    : plainHTML(b.html).slice(0, 28) ||
                                      "空内容"}
                                </strong>
                              </div>
                            </button>
                          </li>
                        ))}
                      </ol>
                      {article.blocks.length > 0 && (
                        <button
                          className="studio-btn"
                          onClick={() => addBlock()}
                        >
                          <Plus size={15} />
                          添加段落
                        </button>
                      )}
                    </>
                  )}
                </>
              )}
            </WorkspacePanel>
            <main
              className={`studio-editor-stage ${canvasPreview === "compare" ? "comparing" : ""}`}
            >
              {article.blocks.length > 0 && (
                <div className="studio-canvas-toolbar">
                  <button
                    className="studio-text-btn studio-smart-layout-trigger"
                    aria-label="智能排版"
                    onClick={() => setShowLayout(true)}
                  >
                    <Sparkles size={15} />
                    {smartLayout.active === article.id ? "分析中…" : "智能排版"}
                  </button>
                  <span className="studio-toolbar-rule" />
                  <button
                    className="studio-icon-btn"
                    aria-label="加粗"
                    title="加粗"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => document.execCommand("bold")}
                  >
                    <Bold size={16} />
                  </button>
                  <button
                    className="studio-icon-btn"
                    aria-label="斜体"
                    title="斜体"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => document.execCommand("italic")}
                  >
                    <Italic size={16} />
                  </button>
                  <span className="studio-toolbar-rule" />
                  <button
                    className="studio-text-btn"
                    onClick={() => addBlock("heading")}
                  >
                    标题
                  </button>
                  <button
                    className="studio-text-btn"
                    onClick={() => addBlock("quote")}
                  >
                    引用
                  </button>
                  <button
                    className="studio-text-btn"
                    onClick={() => addBlock("divider")}
                  >
                    分隔线
                  </button>
                  <button
                    className="studio-text-btn"
                    onClick={() => imageInput.current?.click()}
                  >
                    <ImagePlus size={14} />
                    图片
                  </button>
                </div>
              )}
              {canvasPreview === "compare" ? (
                <div className="studio-comparison-grid">
                  {compared.map((p, index) => (
                    <section key={`${p.id}:${p.version}`}>
                      <div className="studio-comparison-title">
                        <span>
                          {index === 0 ? "当前" : "候选"} · {p.name}
                        </span>
                        {index > 0 && (
                          <button
                            className="studio-text-btn"
                            onClick={() => applyStyle(p)}
                          >
                            应用
                          </button>
                        )}
                      </div>
                      <ArticleCanvas
                        article={
                          index === 0
                            ? article
                            : { ...article, theme: undefined }
                        }
                        profile={p}
                        assets={s.assets}
                        readOnly
                      />
                    </section>
                  ))}
                </div>
              ) : (
                <div
                  className={`studio-paper ${canvasPreview}`}
                  style={{
                    width:
                      canvasPreview === "desktop"
                        ? displayedProfile.layoutRules.articleWidth
                        : 390,
                  }}
                >
                  <ArticleCanvas
                    article={displayedArticle}
                    profile={displayedProfile}
                    assets={s.assets}
                    selected={selected}
                    onSelect={(id) => {
                      setSelected(id);
                      setScope("block");
                    }}
                    onEdit={(id, html) => editBlock({ html }, id, true)}
                    onAdd={() => addBlock()}
                    onImage={() => imageInput.current?.click()}
                    onImportFile={() => articleFile.current?.click()}
                    onPaste={pasteIntoCanvas}
                    onDropImages={(files, after) =>
                      importIntoArticle(
                        (warnings) => readImages(files, warnings),
                        { after },
                      )
                    }
                    onWrite={(text) => addBlock("paragraph", text)}
                    importing={busy}
                    onDelete={(id) => {
                      s.update((a) => ({
                        ...a,
                        blocks: a.blocks.filter((b) => b.id !== id),
                      }));
                      setSelected(undefined);
                    }}
                    onMove={(id, direction) =>
                      s.update((a) => {
                        const blocks = [...a.blocks];
                        const i = blocks.findIndex((b) => b.id === id);
                        const target = i + direction;
                        if (i >= 0 && target >= 0 && target < blocks.length)
                          [blocks[i], blocks[target]] = [
                            blocks[target],
                            blocks[i],
                          ];
                        return { ...a, blocks };
                      })
                    }
                  />
                </div>
              )}
              {article.blocks.length > 0 && (
                <p className="studio-canvas-caption">
                  {article.blocks.length} 个内容块
                  {article.theme ? " · 本篇已调整" : ""}
                </p>
              )}
            </main>
            <WorkspacePanel
              id="editor-inspector"
              title="样式设置"
              className="studio-inspector"
              compact={compact}
              open={showInspector}
              onClose={() => setMobilePanel(null)}
            >
              <div className="studio-inspector-heading">
                {!compact && <h3>样式</h3>}
                <button
                  className="studio-icon-btn"
                  aria-label="恢复默认样式"
                  title="恢复当前风格的默认全局参数"
                  disabled={!!candidate || !article.theme}
                  onClick={() => s.update((a) => ({ ...a, theme: undefined }))}
                >
                  <RotateCcw size={15} />
                </button>
              </div>
              <div className="studio-segment">
                <button
                  aria-pressed={scope === "global"}
                  onClick={() => setScope("global")}
                >
                  全局
                </button>
                <button
                  aria-pressed={scope === "block"}
                  disabled={!block}
                  onClick={() => setScope("block")}
                >
                  当前块
                </button>
              </div>
              {scope === "global" ? (
                <>
                  <fieldset
                    className="studio-preview-locked-fields"
                    disabled={!!candidate}
                  >
                    <TokenFields
                      tokens={displayedTokens}
                      onChange={(theme) =>
                        s.update((a) => ({ ...a, theme }), true)
                      }
                    />
                  </fieldset>
                  <button
                    className="studio-btn"
                    disabled={
                      !article.blocks.some((b) => b.overrides || b.captionStyle)
                    }
                    onClick={() => applyStyle(candidate ?? profile, true)}
                  >
                    清除局部格式并统一套版
                  </button>
                  <button
                    className="studio-btn"
                    disabled={!!candidate}
                    onClick={() =>
                      void run(async () => {
                        const saved = await s.addProfile({
                          ...profile,
                          id: uid("style"),
                          name: `${profile.name} · 自定义`,
                          tokens,
                          source: {
                            ...profile.source,
                            type:
                              profile.source.type === "builtin"
                                ? "text"
                                : profile.source.type,
                            capturedAt: new Date().toISOString(),
                          },
                        });
                        s.applyProfile(saved);
                        s.setMessage(`已另存为「${saved.name}」。`);
                      })
                    }
                  >
                    另存为新风格
                  </button>
                  <button
                    className="studio-text-btn"
                    disabled={
                      !!candidate ||
                      !s.latest.some((style) => style.id === profile.id) ||
                      profile.id.startsWith("builtin-")
                    }
                    onClick={() =>
                      void run(async () => {
                        const saved = await s.addProfile({
                          ...profile,
                          tokens,
                        });
                        s.applyProfile(saved);
                      })
                    }
                  >
                    保存为新版本
                  </button>
                </>
              ) : block ? (
                <>
                  <label className="studio-field">
                    <span>块类型</span>
                    <select
                      aria-label="当前块类型"
                      value={block.kind}
                      onChange={(e) => {
                        const kind = e.target.value as BlockKind;
                        if (kind === "image") {
                          imageInput.current?.click();
                          return;
                        }
                        editBlock({ kind });
                      }}
                    >
                      {Object.entries(kindLabels).map(([key, label]) => (
                        <option value={key} key={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {block.kind === "image" && (
                    <>
                      <label className="studio-field">
                        <span>图片说明</span>
                        <input
                          aria-label="图片说明"
                          value={block.alt ?? ""}
                          onChange={(e) =>
                            editBlock({ alt: e.target.value }, block.id, true)
                          }
                        />
                      </label>
                      <label className="studio-field">
                        <span>图注</span>
                        <input
                          aria-label="图注"
                          value={block.caption ?? ""}
                          onChange={(e) =>
                            editBlock(
                              { caption: e.target.value },
                              block.id,
                              true,
                            )
                          }
                        />
                      </label>
                      <button
                        className="studio-btn"
                        onClick={() => imageInput.current?.click()}
                      >
                        替换图片
                      </button>
                      <details className="studio-details">
                        <summary>图注样式</summary>
                        <ComponentFields
                          value={blockStyle(
                            {
                              id: block.id,
                              kind: "caption",
                              html: "",
                              overrides: block.captionStyle,
                            },
                            displayedProfile,
                            displayedTokens,
                          )}
                          onChange={(value, key) =>
                            editBlock(
                              {
                                captionStyle: key
                                  ? { ...block.captionStyle, [key]: value[key] }
                                  : value,
                              },
                              block.id,
                              true,
                            )
                          }
                        />
                      </details>
                    </>
                  )}
                  {selectedLayoutStep && (
                    <button
                      className="studio-text-btn"
                      onClick={() => {
                        if (compact) setMobilePanel(null);
                        setShowLayout(true);
                      }}
                    >
                      {layoutLabels[selectedLayoutStep.component]} · 调整组件
                    </button>
                  )}
                  <ComponentFields
                    value={blockStyle(
                      block,
                      displayedProfile,
                      displayedTokens,
                      selectedLayoutStep,
                    )}
                    onChange={(value, key) =>
                      editBlock(
                        {
                          overrides: key
                            ? { ...block.overrides, [key]: value[key] }
                            : value,
                        },
                        block.id,
                        true,
                      )
                    }
                  />
                  <button
                    className="studio-text-btn"
                    onClick={() =>
                      editBlock({
                        overrides: undefined,
                        captionStyle: undefined,
                      })
                    }
                  >
                    清除当前块局部格式
                  </button>
                </>
              ) : (
                <p className="studio-note">点击正文，编辑当前内容块。</p>
              )}
            </WorkspacePanel>
          </div>
        </>
      )}
      {view === "cover" && (
        <CoverWorkbench
          key={article.id}
          article={article}
          profile={profile}
          assets={s.assets}
          onRefresh={s.refresh}
          onError={s.setError}
          onMessage={s.setMessage}
          onUse={(id) => s.update((a) => ({ ...a, coverId: id }))}
        />
      )}
      {dialog === "account" && (
        <StudioDialog title="统一账号" onClose={() => setDialog(null)}>
          <p className="studio-note">本站的统一账号登录尚未开通。当前稿件保存在此浏览器。</p>
        </StudioDialog>
      )}
      {dialog === "settings" && (
        <StudioDialog title="服务端连接" onClose={() => setDialog(null)}>
          <AIAccess />
          {connectionStatus && (
            <div className="studio-note">
              {connectionStatus.layoutOff && <p>智能排版当前使用规则。</p>}
              <p>{connectionStatus.cloudConfigured ? "云端模型已配置。" : "此站点尚未配置云端模型，截图分析不可用。"}</p>
            </div>
          )}
        </StudioDialog>
      )}
      {dialog === "import" && (
        <StudioDialog title="导入我的文章" onClose={() => setDialog(null)} wide>
          <div className="studio-segment">
            {(
              [
                ["markdown", "Markdown"],
                ["text", "纯文字"],
                ["html", "HTML / 富文本"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                aria-pressed={importFormat === key}
                onClick={() => setImportFormat(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <textarea
            className="studio-import-text"
            aria-label="我的文章内容"
            rows={14}
            autoFocus
            placeholder="粘贴自己的文章…"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            onPaste={(e) => {
              const html = e.clipboardData.getData("text/html");
              if (html) {
                e.preventDefault();
                setImportFormat("html");
                setImportText(html);
              }
            }}
          />
          <div className="studio-dialog-actions">
            <button
              className="studio-btn"
              disabled={busy}
              onClick={() => articleFile.current?.click()}
            >
              <Upload size={15} />
              选择文件
            </button>
            <span className="studio-note">替换当前正文，可撤销</span>
            <button
              className="studio-btn primary"
              disabled={!importText.trim() || busy}
              onClick={() =>
                importIntoArticle(
                  (warnings) =>
                    parseArticle(importText, importFormat, document, warnings),
                  { replace: true },
                )
              }
            >
              导入并排版
              <ArrowRight size={16} />
            </button>
          </div>
        </StudioDialog>
      )}
      {management?.kind === "style" && (
        <StyleAssetDialog
          key={`${management.mode}:${management.profile.id}:${management.profile.version}`}
          mode={management.mode}
          profile={management.profile}
          assets={s.assets}
          article={view === "editor" ? article : undefined}
          onClose={() => setManagement(undefined)}
          onSave={async (style) => {
            const saved = await s.addProfile(style);
            setVersionPicks((picks) => ({
              ...picks,
              [saved.id]: saved.version,
            }));
            if (view === "editor")
              setCandidateChoice({ articleId: article.id, profile: saved });
            setManagement(undefined);
            s.setMessage(`「${saved.name}」v${saved.version} 已保存。`);
          }}
        />
      )}
      {management && management.kind !== "style" && (
        <StudioDialog
          title={
            management.kind === "renameDraft"
              ? "重命名文章"
              : management.kind === "trash"
                ? "删除文章"
                : "删除风格"
          }
          onClose={() => setManagement(undefined)}
        >
          {management.kind === "renameDraft" ? (
            <label className="studio-field">
              <span>文章名称</span>
              <input
                aria-label="文章名称"
                autoFocus
                maxLength={80}
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
              />
            </label>
          ) : management.kind === "trash" ? (
            <p>将 {management.ids.length} 篇文章移到回收站，可以随时恢复。</p>
          ) : (
            <p>
              {management.used > 0
                ? `「${management.profile.name}」已被 ${management.used} 篇文章使用。移除后，这些文章保留原有排版。`
                : `从风格库移除「${management.profile.name}」。`}
            </p>
          )}
          <div className="studio-dialog-actions">
            <button
              className="studio-btn"
              onClick={() => setManagement(undefined)}
            >
              取消
            </button>
            <button
              className="studio-btn primary"
              disabled={
                busy || (management.kind === "renameDraft" && !newName.trim())
              }
              onClick={confirmManagement}
            >
              {management.kind === "renameDraft"
                ? "保存名称"
                : management.kind === "trash"
                  ? "移到回收站"
                  : "确认删除风格"}
            </button>
          </div>
        </StudioDialog>
      )}
      {view === "editor" && showLayout && (
        <ArticleLayoutPanel
          key={article.id}
          article={article}
          selected={selected}
          running={smartLayout.active === article.id}
          onClose={() => setShowLayout(false)}
          onConfigure={(settings, automatic) =>
            smartLayout.configure(
              article,
              displayedProfile,
              settings,
              automatic,
            )
          }
          onAnalyze={() =>
            smartLayout.analyze(article, displayedProfile, {
              ...seedLayout(
                article,
                displayedProfile,
                article.layout?.settings,
                article.layout?.automatic ?? true,
              ),
              manual: article.layout?.manual,
            })
          }
          onRestore={() =>
            s.update((a) =>
              a.layout ? { ...a, layout: { ...a.layout, enabled: false } } : a,
            )
          }
          onEnable={() =>
            s.update((a) =>
              a.layout ? { ...a, layout: { ...a.layout, enabled: true } } : a,
            )
          }
          onComponent={applyManualComponent}
        />
      )}
      {dialog === "history" && (
        <StudioDialog title="编辑历史" onClose={() => setDialog(null)}>
          <div className="studio-history-list">
            {s.revisions.map((revision, index) => (
              <button
                key={revision.id}
                onClick={() => {
                  s.update((a) => ({ ...revision.document, id: a.id }));
                  setDialog(null);
                  s.setMessage("已恢复历史版本，可撤销这次恢复。");
                }}
              >
                <History size={17} />
                <span>
                  <strong>{revision.document.name}</strong>
                  <small>
                    {new Date(revision.savedAt).toLocaleString("zh-CN")} ·{" "}
                    {revision.document.blocks.length} 块
                  </small>
                </span>
                {index === 0 ? <span>最近</span> : <RotateCcw size={15} />}
              </button>
            ))}
          </div>
          <p className="studio-note">
            保留最近 30 个自动保存版本。恢复也可以撤销。
          </p>
        </StudioDialog>
      )}
      {dialog === "export" && exportResult && (
        <StudioDialog title="导出到公众号" onClose={() => setDialog(null)} wide>
          <div className="studio-export-layout">
            <div className="studio-export-preview">
              <div className="studio-segment" aria-label="导出手机宽度">
                {[320, 390, 430].map((width) => (
                  <button
                    key={width}
                    aria-pressed={exportWidth === width}
                    onClick={() => setExportWidth(width)}
                  >
                    {width} px
                  </button>
                ))}
              </div>
              <div
                className="studio-export-rendered"
                style={{ width: exportWidth }}
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest("a"))
                    event.preventDefault();
                }}
                dangerouslySetInnerHTML={{ __html: exportResult.html }}
              />
            </div>
            <div className="studio-export-actions">
              <h3>
                <Check size={17} />
                微信兼容检查
              </h3>
              <ul>
                <li>仅导出文章正文</li>
                <li>样式已内联</li>
                <li>脚本与不安全属性已过滤</li>
              </ul>
              <div className="studio-export-warnings">
                {exportResult.warnings.map((warning, index) => (
                  <p key={index}>{warning}</p>
                ))}
              </div>
              <button
                className="studio-btn primary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const result = await copyRichText(exportResult.html);
                    if (!result.ok)
                      throw new Error(
                        "浏览器未允许复制，请下载 HTML 后手动复制。",
                      );
                    s.setMessage("图文已复制，请在公众号后台粘贴并核对。");
                  })
                }
              >
                <Copy size={16} />
                复制公众号图文
              </button>
              <button
                className="studio-btn"
                onClick={() =>
                  downloadBlob(
                    new Blob([exportResult.html], {
                      type: "text/html;charset=utf-8",
                    }),
                    `${article.name}.html`,
                  )
                }
              >
                <Download size={16} />
                下载正文 HTML
              </button>
              <button
                className="studio-btn"
                disabled={busy}
                onClick={() => void run(exportPackage)}
              >
                <Download size={16} />
                下载交付包
              </button>
            </div>
          </div>
        </StudioDialog>
      )}
    </div>
  );
}
