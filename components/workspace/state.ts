import type { TemplateKey } from "../../lib/article-types";
import { parseArticleContent } from "../../lib/article-parser";
import type { UnifiedArticleBlock, UnifiedArticleContent } from "../../lib/content";
import { unifiedArticleContentSchema } from "../../lib/content/schemas";
import { toDouyinImageText, toDouyinLongform } from "../../lib/platforms/douyin";
import type { PlatformId, PlatformVersion, PlatformVersionMap } from "../../lib/platforms/types";
import { createWechatPlatformVersion } from "../../lib/platforms/wechat";
import { toXiaohongshuImageText } from "../../lib/platforms/xiaohongshu";
import type { CardAspectRatio, CardLayoutPage, CardLayoutResult } from "../../lib/renderers/cards";
import type { ProjectAssetReference, ProjectBackupPayload, ProjectDocument } from "../../lib/storage";
import { styleTemplates } from "../../lib/style-templates";
import type {
  AiWorkspaceSettings,
  DraftHistory,
  LayoutSettings,
  PlatformDraft,
  PlatformMeta,
  RatioMode,
  WorkspacePersistedState,
} from "./types";

export const AUTO_SAVE_DEBOUNCE_MS = 800;
export const WORKSPACE_HISTORY_LIMIT = 50;
export const WORKSPACE_PLATFORM_IDS = ["wechat", "xiaohongshu", "douyinImage", "douyinLongform"] as const satisfies readonly PlatformId[];

export const WORKSPACE_PLATFORM_LABELS: Record<PlatformId, string> = {
  wechat: "公众号",
  xiaohongshu: "小红书",
  douyinImage: "抖音图文",
  douyinLongform: "抖音长文",
};

export const WORKSPACE_VERSION_KEY = "__unifiedSelfMediaWorkspace";

export const PROJECT_BACKUP_IMAGE_NOTICE =
  "项目备份 ZIP 包含项目结构、图片文件和清单；单独导入 JSON 时，图片仍依赖当前浏览器本地素材库。";

export const DEFAULT_SOURCE_MARKDOWN = `# 统一自媒体工作区

这是一篇可以直接编辑的本地演示稿。修改左侧 Markdown 后，点击重新生成即可分别得到公众号、小红书、抖音图文和抖音长文版本。

## 核心判断

同一篇源文不应该复制粘贴到四套孤立工具里。更好的方式是保留一个源文，再让每个平台拥有自己的标题、正文、标签、排版和编辑历史。

> 真正省时间的不是一键生成，而是修改一次以后不会丢。

- 公众号保留完整结构和富文本样式
- 小红书图文按真实 3:4 页面重排
- 抖音图文可以在 3:4 和 9:16 间切换
- 抖音长文保留导语、重点和结尾

图片：上传素材后可以插入到源文

写在最后：先用确定性本地生成兜底，接入 AI 时也不应该覆盖人工修改。`;

export const DEFAULT_LAYOUT_SETTINGS: LayoutSettings = {
  ratio: "3:4",
  margin: 84,
  lineSpacing: 1.35,
  paragraphSpacing: 38,
  titleSpacing: 54,
  titleFontSize: 72,
  headingFontSize: 42,
  bodyFontSize: 36,
  focusFontSize: 34,
};

export const DEFAULT_AI_SETTINGS: AiWorkspaceSettings = {
  mode: "deterministic",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4.1-mini",
  lastFallbackReason: "当前演示使用本地确定性转换，未调用外部 AI。",
};

export function parseSourceMarkdown(sourceMarkdown: string) {
  return parseArticleContent(sourceMarkdown, { mode: "knowledge" });
}

export function cloneArticleContent(content: UnifiedArticleContent): UnifiedArticleContent {
  return {
    ...content,
    blocks: content.blocks.map((block) => cloneBlock(block)),
    warnings: content.warnings.map((warning) => ({ ...warning, source: warning.source ? { ...warning.source } : undefined })),
  };
}

export function createPlatformDraft(
  platform: PlatformId,
  article: UnifiedArticleContent,
  options: Partial<Pick<PlatformDraft, "templateKey" | "ratio" | "lockedPageIds" | "manualPages">> = {},
): PlatformDraft {
  const ratio = options.ratio ?? defaultRatioForPlatform(platform);
  const templateKey = options.templateKey ?? "zhenyiKnowledgeMinimal";
  const content = cloneArticleContent(article);
  const meta = createPlatformMeta(platform, content, ratio);

  return {
    platform,
    status: "generated",
    title: metaTitle(platform, content, meta),
    content,
    templateKey,
    ratio,
    meta,
    lockedPageIds: options.lockedPageIds ?? [],
    manualPages: options.manualPages ?? [],
    updatedAt: new Date().toISOString(),
  };
}

export function createWorkspaceState(sourceMarkdown = DEFAULT_SOURCE_MARKDOWN): WorkspacePersistedState {
  const article = parseSourceMarkdown(sourceMarkdown);
  return {
    schemaVersion: 1,
    sourceMarkdown,
    layout: { ...DEFAULT_LAYOUT_SETTINGS },
    ai: { ...DEFAULT_AI_SETTINGS },
    platforms: Object.fromEntries(WORKSPACE_PLATFORM_IDS.map((platform) => [platform, createPlatformDraft(platform, article)])) as Record<
      PlatformId,
      PlatformDraft
    >,
  };
}

export function regeneratePlatformDraft(
  current: PlatformDraft,
  article: UnifiedArticleContent,
  ai: AiWorkspaceSettings = DEFAULT_AI_SETTINGS,
): PlatformDraft {
  const regenerated = createPlatformDraft(current.platform, article, {
    templateKey: current.templateKey,
    ratio: current.ratio,
    lockedPageIds: current.lockedPageIds,
    manualPages: current.manualPages,
  });

  return {
    ...regenerated,
    status: ai.mode === "deterministic" ? "generated" : "generated",
    meta: {
      ...regenerated.meta,
      tags: regenerated.meta.tags,
    },
  };
}

export function platformDraftFromVersion(current: PlatformDraft, version: PlatformVersion): PlatformDraft {
  const fallback = createPlatformDraft(current.platform, version.content, {
    templateKey: current.templateKey,
    ratio: current.ratio,
    lockedPageIds: current.lockedPageIds,
    manualPages: current.manualPages,
  });

  return {
    ...fallback,
    status: version.status,
    title: version.title,
    content: cloneArticleContent(version.content),
    meta: {
      ...fallback.meta,
      body: version.summary ?? fallback.meta.body,
      caption: version.summary ?? fallback.meta.caption,
      highlights: version.highlights ? [...version.highlights] : fallback.meta.highlights,
      tags: version.tags ? [...version.tags] : fallback.meta.tags,
    },
    editedWechatHtml: undefined,
    updatedAt: version.updatedAt,
  };
}

export function platformVersionsFromDrafts(drafts: Record<PlatformId, PlatformDraft>): PlatformVersionMap {
  return Object.fromEntries(
    WORKSPACE_PLATFORM_IDS.map((platform) => {
      const draft = drafts[platform];
      return [
        platform,
        {
          platform,
          status: draft.status,
          title: draft.title,
          content: cloneArticleContent(draft.content),
          summary: draft.meta.body ?? draft.meta.caption,
          highlights: draft.meta.highlights ? [...draft.meta.highlights] : undefined,
          tags: [...draft.meta.tags],
          updatedAt: draft.updatedAt,
        } satisfies PlatformVersion,
      ];
    }),
  ) as PlatformVersionMap;
}

export function pushDraftHistory(history: DraftHistory, previous: PlatformDraft): DraftHistory {
  return {
    past: [...history.past, previous].slice(-WORKSPACE_HISTORY_LIMIT),
    future: [],
  };
}

export function pushDraftRedoHistory(history: DraftHistory, current: PlatformDraft): DraftHistory {
  return {
    past: [...history.past, current].slice(-WORKSPACE_HISTORY_LIMIT),
    future: history.future.slice(1),
  };
}

export type PlatformDraftSignatureMap = Record<PlatformId, string>;

export function createPlatformDraftSignature(draft: PlatformDraft): string {
  return JSON.stringify({
    updatedAt: draft.updatedAt,
    status: draft.status,
    title: draft.title,
    content: draft.content,
    meta: draft.meta,
    editedWechatHtml: draft.editedWechatHtml,
  });
}

export function createPlatformDraftSignatureMap(drafts: Record<PlatformId, PlatformDraft>, platforms: PlatformId[] = [...WORKSPACE_PLATFORM_IDS]): PlatformDraftSignatureMap {
  return Object.fromEntries(WORKSPACE_PLATFORM_IDS.map((platform) => [platform, platforms.includes(platform) ? createPlatformDraftSignature(drafts[platform]) : ""])) as PlatformDraftSignatureMap;
}

export function platformDraftChangedSince(draft: PlatformDraft, signature: string): boolean {
  return createPlatformDraftSignature(draft) !== signature;
}

export function applyPlatformDraftReplacements(input: {
  drafts: Record<PlatformId, PlatformDraft>;
  histories: Record<PlatformId, DraftHistory>;
  replacements: Partial<Record<PlatformId, PlatformDraft>>;
  changedSince?: Partial<Record<PlatformId, string>>;
}): {
  drafts: Record<PlatformId, PlatformDraft>;
  histories: Record<PlatformId, DraftHistory>;
  appliedPlatforms: PlatformId[];
  skippedChangedPlatforms: PlatformId[];
} {
  const nextDrafts = { ...input.drafts };
  const nextHistories = { ...input.histories };
  const appliedPlatforms: PlatformId[] = [];
  const skippedChangedPlatforms: PlatformId[] = [];

  for (const platform of WORKSPACE_PLATFORM_IDS) {
    const replacement = input.replacements[platform];
    if (!replacement) continue;

    const current = input.drafts[platform];
    const startingSignature = input.changedSince?.[platform];
    if (startingSignature !== undefined && platformDraftChangedSince(current, startingSignature)) {
      skippedChangedPlatforms.push(platform);
      continue;
    }

    if (createPlatformDraftSignature(current) === createPlatformDraftSignature(replacement)) {
      nextDrafts[platform] = replacement;
      appliedPlatforms.push(platform);
      continue;
    }

    nextHistories[platform] = pushDraftHistory(input.histories[platform], current);
    nextDrafts[platform] = replacement;
    appliedPlatforms.push(platform);
  }

  return { drafts: nextDrafts, histories: nextHistories, appliedPlatforms, skippedChangedPlatforms };
}

export function resolveRegenerationPlatforms(
  drafts: Record<PlatformId, PlatformDraft>,
  requestedPlatforms: PlatformId[],
  confirmEditedOverwrite: (editedPlatforms: PlatformId[]) => boolean,
) {
  const requested = WORKSPACE_PLATFORM_IDS.filter((platform) => requestedPlatforms.includes(platform));
  const editedPlatforms = requested.filter((platform) => drafts[platform].status === "edited");

  if (!editedPlatforms.length) {
    return {
      platforms: requested,
      editedPlatforms,
      skippedEditedPlatforms: [] as PlatformId[],
      confirmedEditedOverwrite: undefined,
    };
  }

  const confirmedEditedOverwrite = confirmEditedOverwrite(editedPlatforms);
  return {
    platforms: confirmedEditedOverwrite ? requested : requested.filter((platform) => !editedPlatforms.includes(platform)),
    editedPlatforms,
    skippedEditedPlatforms: confirmedEditedOverwrite ? ([] as PlatformId[]) : editedPlatforms,
    confirmedEditedOverwrite,
  };
}

export function updatePlatformBlock(draft: PlatformDraft, blockId: string, text: string): PlatformDraft {
  const content = cloneArticleContent(draft.content);
  const previousMeta = createPlatformMeta(draft.platform, content, draft.ratio);
  const previousTitle = metaTitle(draft.platform, content, previousMeta);
  const titleWasEdited = draft.title !== previousTitle;
  const captionWasEdited = draft.meta.caption !== undefined && draft.meta.caption !== previousMeta.caption;
  const blocks = content.blocks.map((block) => (block.id === blockId ? updateBlockText(block, text) : block));
  const nextContent = {
    ...content,
    title: blocks.find((block) => block.type === "title" && "text" in block)?.text ?? content.title,
    blocks,
  };
  const meta = createPlatformMeta(draft.platform, nextContent, draft.ratio);

  return {
    ...draft,
    status: "edited",
    title: titleWasEdited ? draft.title : metaTitle(draft.platform, nextContent, meta),
    content: nextContent,
    meta: { ...meta, caption: captionWasEdited ? draft.meta.caption : meta.caption, tags: draft.meta.tags.length ? draft.meta.tags : meta.tags },
    editedWechatHtml: undefined,
    updatedAt: new Date().toISOString(),
  };
}

export function updatePlatformTitle(draft: PlatformDraft, title: string): PlatformDraft {
  return {
    ...draft,
    title,
    meta: { ...draft.meta },
    status: "edited",
    updatedAt: new Date().toISOString(),
  };
}

export function updatePlatformTags(draft: PlatformDraft, tagsText: string): PlatformDraft {
  return {
    ...draft,
    meta: { ...draft.meta, tags: parseTags(tagsText) },
    status: "edited",
    updatedAt: new Date().toISOString(),
  };
}

export function updatePlatformCaption(draft: PlatformDraft, caption: string): PlatformDraft {
  return {
    ...draft,
    meta: { ...draft.meta, caption },
    status: "edited",
    updatedAt: new Date().toISOString(),
  };
}

export function updatePlatformRatio(draft: PlatformDraft, ratio: RatioMode): PlatformDraft {
  const meta = createPlatformMeta(draft.platform, draft.content, ratio);
  return {
    ...draft,
    ratio,
    meta: { ...meta, tags: draft.meta.tags.length ? draft.meta.tags : meta.tags },
    status: "edited",
    updatedAt: new Date().toISOString(),
  };
}

export function toggleLockedPage(draft: PlatformDraft, pageId: string): PlatformDraft {
  const locked = new Set(draft.lockedPageIds);
  if (locked.has(pageId)) locked.delete(pageId);
  else locked.add(pageId);
  return {
    ...draft,
    lockedPageIds: [...locked],
    status: "edited",
    updatedAt: new Date().toISOString(),
  };
}

export function withWechatHtmlOverride(draft: PlatformDraft, html: string): PlatformDraft {
  return {
    ...draft,
    editedWechatHtml: sanitizeWechatHtml(html),
    status: "edited",
    updatedAt: new Date().toISOString(),
  };
}

export function withManualCardPages(draft: PlatformDraft, pages: CardLayoutPage[]): PlatformDraft {
  const manualPages = pages.filter((page) => page.manual || page.locked).map(cloneCardLayoutPage);
  return {
    ...draft,
    manualPages,
    lockedPageIds: manualPages.filter((page) => page.locked).map((page) => page.id),
    status: "edited",
    updatedAt: new Date().toISOString(),
  };
}

export function withLockedCardPage(draft: PlatformDraft, page: CardLayoutPage, locked: boolean): PlatformDraft {
  const pagesById = new Map(draft.manualPages.map((manualPage) => [manualPage.id, cloneCardLayoutPage(manualPage)]));
  const lockedIds = new Set(draft.lockedPageIds);

  if (locked) {
    pagesById.set(page.id, cloneCardLayoutPage({ ...page, manual: true, locked: true }));
    lockedIds.add(page.id);
  } else {
    const existing = pagesById.get(page.id);
    if (existing?.manual && !existing.locked) {
      pagesById.set(page.id, { ...existing, locked: false });
    } else {
      pagesById.delete(page.id);
    }
    lockedIds.delete(page.id);
  }

  const manualPages = [...pagesById.values()].map((manualPage) => ({
    ...manualPage,
    locked: lockedIds.has(manualPage.id) || Boolean(manualPage.locked),
  }));

  return {
    ...draft,
    manualPages,
    lockedPageIds: [...lockedIds],
    status: "edited",
    updatedAt: new Date().toISOString(),
  };
}

export function clearManualCardPages(draft: PlatformDraft): PlatformDraft {
  return {
    ...draft,
    manualPages: [],
    lockedPageIds: [],
    status: "edited",
    updatedAt: new Date().toISOString(),
  };
}

export function applyManualPageOrder(result: CardLayoutResult, manualPages: CardLayoutPage[]): CardLayoutResult {
  const filteredResult = filterEmptyAutomaticCardPages(result, manualPages);
  if (manualPages.length < filteredResult.pages.length) return filteredResult;
  const manualOrder = new Map(manualPages.map((page, index) => [page.id, index]));
  if (!filteredResult.pages.every((page) => manualOrder.has(page.id))) return filteredResult;
  const totalPages = filteredResult.pages.length;
  const pages = [...filteredResult.pages]
    .sort((left, right) => (manualOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (manualOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER))
    .map((page, index) => ({ ...page, pageNumber: index + 1, totalPages }));
  return { ...filteredResult, pages, overflow: pages.flatMap((page) => page.overflow) };
}

export function markAiGenerationFailure(state: WorkspacePersistedState, message: string): WorkspacePersistedState {
  return {
    ...state,
    ai: {
      ...state.ai,
      lastFallbackReason: `${message} 已保留当前编辑稿，未自动套用本地回退版本。`,
    },
  };
}

export function markAiConfigurationIncomplete(state: WorkspacePersistedState, missingFields: string[]): WorkspacePersistedState {
  const fieldList = missingFields.length ? missingFields.join("、") : "AI 配置";
  return {
    ...state,
    ai: {
      ...state.ai,
      lastFallbackReason: `AI 配置不完整：请填写 ${fieldList}，或切回本地模式后重新生成。已保留当前编辑稿。`,
    },
  };
}

export function isAiProviderConfigured(ai: AiWorkspaceSettings, sessionApiKey: string) {
  return ai.mode === "assistant" && ai.baseUrl.trim().length > 0 && ai.model.trim().length > 0 && sessionApiKey.trim().length > 0;
}

export function getMissingAiProviderFields(ai: AiWorkspaceSettings, sessionApiKey: string): string[] {
  if (ai.mode !== "assistant") return [];
  return [
    ai.baseUrl.trim().length === 0 ? "Base URL" : undefined,
    ai.model.trim().length === 0 ? "模型" : undefined,
    sessionApiKey.trim().length === 0 ? "Session API Key" : undefined,
  ].filter((field): field is string => Boolean(field));
}

export function sanitizeWechatHtml(html: string): string {
  if (typeof document === "undefined") return sanitizeWechatHtmlFallback(html);

  const template = document.createElement("template");
  template.innerHTML = html;
  sanitizeNode(template.content);
  return template.innerHTML;
}

export function readPersistedWorkspace(value: unknown): WorkspacePersistedState | undefined {
  if (!isRecord(value)) return undefined;
  const raw = value[WORKSPACE_VERSION_KEY];
  if (!isRecord(raw) || raw.schemaVersion !== 1 || typeof raw.sourceMarkdown !== "string" || !isRecord(raw.platforms)) {
    return undefined;
  }

  const fallback = createWorkspaceState(raw.sourceMarkdown);
  const rawPlatforms = raw.platforms;
  const platforms = readPlatformDrafts(rawPlatforms, fallback);
  if (!platforms) return undefined;

  return {
    schemaVersion: 1,
    sourceMarkdown: raw.sourceMarkdown,
    layout: readLayout(raw.layout, fallback.layout),
    ai: readAi(raw.ai, fallback.ai),
    platforms,
  };
}

export function serializeWorkspace(state: WorkspacePersistedState) {
  return {
    [WORKSPACE_VERSION_KEY]: state,
  };
}

export function selectRestorableBackupProject(payload: ProjectBackupPayload): ProjectDocument | undefined {
  const projects = payload.projects.flatMap((project) => readRestorableBackupProject(project, payload.assets));
  return projects.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
}

export function describeProjectBackupExportStatus(assetCount: number) {
  const imageCount = assetCount > 0 ? `共记录 ${assetCount} 张图片元数据。` : "当前项目没有图片元数据。";
  return `项目备份 ZIP 已导出。${imageCount}${PROJECT_BACKUP_IMAGE_NOTICE}`;
}

export function describeProjectBackupImportStatus(missingAssetCount: number) {
  if (missingAssetCount > 0) {
    return `项目备份已导入，但 ${missingAssetCount} 张图片缺失。${PROJECT_BACKUP_IMAGE_NOTICE}`;
  }
  return `项目备份已导入。${PROJECT_BACKUP_IMAGE_NOTICE}`;
}

function defaultRatioForPlatform(platform: PlatformId): CardAspectRatio {
  return platform === "douyinImage" ? "3:4" : "3:4";
}

function createPlatformMeta(platform: PlatformId, content: UnifiedArticleContent, ratio: RatioMode): PlatformMeta {
  if (platform === "wechat") {
    const version = createWechatPlatformVersion(content, { template: styleTemplates.zhenyiKnowledgeMinimal });
    return {
      body: version.summary,
      highlights: version.highlights ?? [],
      tags: [],
    };
  }

  if (platform === "xiaohongshu") {
    const output = toXiaohongshuImageText(content);
    return {
      body: output.body,
      caption: output.body,
      tags: output.tags,
      highlights: output.pages.map((page) => page.focusPrompt).slice(0, 4),
    };
  }

  if (platform === "douyinImage") {
    const output = toDouyinImageText(content, { ratio });
    return {
      body: output.pages.flatMap((page) => page.blocks.map((block) => block.text)).join("\n"),
      caption: output.caption,
      tags: output.tags,
    };
  }

  const output = toDouyinLongform(content);
  return {
    body: output.body,
    caption: output.caption,
    intro: output.intro,
    ending: output.ending,
    highlights: output.highlights,
    tags: output.tags,
  };
}

function metaTitle(platform: PlatformId, content: UnifiedArticleContent, meta: PlatformMeta) {
  if (platform === "wechat") {
    return createWechatPlatformVersion(content).title;
  }
  if (platform === "douyinLongform") {
    return toDouyinLongform(content).title;
  }
  if (platform === "douyinImage") {
    return toDouyinImageText(content).title;
  }
  return toXiaohongshuImageText(content).title || meta.body?.slice(0, 20) || "未命名文章";
}

function cloneBlock(block: UnifiedArticleBlock): UnifiedArticleBlock {
  if (block.type === "list") {
    return { ...block, source: { ...block.source }, items: [...block.items] };
  }
  if (block.type === "card") {
    return { ...block, source: { ...block.source } };
  }
  return { ...block, source: { ...block.source } };
}

function updateBlockText(block: UnifiedArticleBlock, text: string): UnifiedArticleBlock {
  if (block.type === "list") {
    const items = text
      .split("\n")
      .map((item) => item.replace(/^\s*(?:[-*+]|\d+[.)）])\s*/, "").trim())
      .filter(Boolean);
    return { ...block, items, text: items.join(""), plainText: items.join("\n"), markdown: items.map((item) => `- ${item}`).join("\n") };
  }

  if (block.type === "card") {
    const matched = text.match(/^([^：:]{2,20})[:：](.+)$/);
    return {
      ...block,
      title: matched ? matched[1].trim() : block.title,
      body: matched ? matched[2].trim() : text,
      text,
      plainText: text,
      markdown: text,
    };
  }

  if (block.type === "divider" || block.type === "pageBreak") {
    return block;
  }

  return { ...block, text, plainText: text, markdown: text };
}

function parseTags(tagsText: string) {
  return tagsText
    .split(/[,\s#，、]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function readLayout(value: unknown, fallback: LayoutSettings): LayoutSettings {
  if (!isRecord(value)) return fallback;
  return {
    ratio: value.ratio === "9:16" ? "9:16" : "3:4",
    margin: readNumber(value.margin, fallback.margin),
    lineSpacing: readNumber(value.lineSpacing, fallback.lineSpacing),
    paragraphSpacing: readNumber(value.paragraphSpacing, fallback.paragraphSpacing),
    titleSpacing: readNumber(value.titleSpacing, fallback.titleSpacing),
    titleFontSize: readNumber(value.titleFontSize, fallback.titleFontSize),
    headingFontSize: readNumber(value.headingFontSize, fallback.headingFontSize),
    bodyFontSize: readNumber(value.bodyFontSize, fallback.bodyFontSize),
    focusFontSize: readNumber(value.focusFontSize, fallback.focusFontSize),
  };
}

function readAi(value: unknown, fallback: AiWorkspaceSettings): AiWorkspaceSettings {
  if (!isRecord(value)) return fallback;
  return {
    mode: value.mode === "assistant" ? "assistant" : "deterministic",
    baseUrl: typeof value.baseUrl === "string" ? value.baseUrl : fallback.baseUrl,
    model: typeof value.model === "string" ? value.model : fallback.model,
    lastFallbackReason: typeof value.lastFallbackReason === "string" ? value.lastFallbackReason : fallback.lastFallbackReason,
  };
}

function readArticleContent(value: unknown): UnifiedArticleContent | undefined {
  const parsed = unifiedArticleContentSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function readPlatformDrafts(value: Record<string, unknown>, fallback: WorkspacePersistedState): Record<PlatformId, PlatformDraft> | undefined {
  const entries: Array<[PlatformId, PlatformDraft]> = [];
  for (const platform of WORKSPACE_PLATFORM_IDS) {
    const draft = readPlatformDraft(value[platform], platform, fallback.platforms[platform]);
    if (!draft) return undefined;
    entries.push([platform, draft]);
  }
  return Object.fromEntries(entries) as Record<PlatformId, PlatformDraft>;
}

function readPlatformDraft(value: unknown, platform: PlatformId, fallback: PlatformDraft): PlatformDraft | undefined {
  if (!isRecord(value)) return undefined;
  const content = readArticleContent(value.content);
  if (!content) return undefined;
  const ratio = value.ratio === "9:16" ? "9:16" : "3:4";
  const manualPages = Array.isArray(value.manualPages) ? value.manualPages.flatMap(readCardLayoutPage) : [];
  const manualPageIds = new Set(manualPages.map((page) => page.id));
  return {
    ...fallback,
    platform,
    status: readPlatformDraftStatus(value.status, fallback.status),
    title: typeof value.title === "string" ? value.title : fallback.title,
    content,
    templateKey: typeof value.templateKey === "string" && value.templateKey in styleTemplates ? (value.templateKey as TemplateKey) : fallback.templateKey,
    ratio,
    meta: readPlatformMeta(value.meta, fallback.meta),
    lockedPageIds: Array.isArray(value.lockedPageIds) ? value.lockedPageIds.filter((id): id is string => typeof id === "string" && manualPageIds.has(id)) : [],
    manualPages,
    editedWechatHtml: typeof value.editedWechatHtml === "string" ? sanitizeWechatHtml(value.editedWechatHtml) : undefined,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : fallback.updatedAt,
  };
}

function readPlatformDraftStatus(value: unknown, fallback: PlatformDraft["status"]): PlatformDraft["status"] {
  return value === "draft" || value === "generated" || value === "edited" || value === "locked" || value === "error" ? value : fallback;
}

function readPlatformMeta(value: unknown, fallback: PlatformMeta): PlatformMeta {
  if (!isRecord(value)) return clonePlatformMeta(fallback);
  return {
    body: readOptionalString(value.body, fallback.body),
    caption: readOptionalString(value.caption, fallback.caption),
    intro: readOptionalString(value.intro, fallback.intro),
    ending: readOptionalString(value.ending, fallback.ending),
    highlights: readOptionalStringArray(value.highlights, fallback.highlights),
    tags: readStringArray(value.tags, fallback.tags),
  };
}

function clonePlatformMeta(meta: PlatformMeta): PlatformMeta {
  return {
    body: meta.body,
    caption: meta.caption,
    intro: meta.intro,
    ending: meta.ending,
    highlights: meta.highlights ? [...meta.highlights] : undefined,
    tags: [...meta.tags],
  };
}

function readOptionalString(value: unknown, fallback: string | undefined) {
  return typeof value === "string" ? value : fallback;
}

function readStringArray(value: unknown, fallback: string[]) {
  return Array.isArray(value) && value.every((item): item is string => typeof item === "string") ? [...value] : [...fallback];
}

function readOptionalStringArray(value: unknown, fallback: string[] | undefined) {
  return Array.isArray(value) && value.every((item): item is string => typeof item === "string")
    ? [...value]
    : fallback
      ? [...fallback]
      : undefined;
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCardAspectRatio(value: unknown): value is CardAspectRatio {
  return value === "3:4" || value === "9:16";
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readRequiredNumberRecord<T extends string>(value: unknown, keys: readonly T[]): Record<T, number> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = keys.map((key) => [key, readFiniteNumber(value[key])] as const);
  if (entries.some(([, field]) => field === undefined)) return undefined;
  return Object.fromEntries(entries) as Record<T, number>;
}

function cloneCardLayoutPage(page: CardLayoutPage): CardLayoutPage {
  return {
    ...page,
    canvas: { ...page.canvas },
    safeArea: { ...page.safeArea },
    nodes: page.nodes.map((node) => ({
      ...node,
      lines: node.lines.map((line) => ({ ...line })),
      image: node.image ? { ...node.image } : undefined,
      style: node.style ? { ...node.style } : undefined,
    })),
    overflow: page.overflow.map((issue) => ({ ...issue })),
  };
}

type CardLayoutNodeValue = CardLayoutPage["nodes"][number];
type CardLayoutLineValue = CardLayoutNodeValue["lines"][number];
type CardLayoutNodeKindValue = CardLayoutNodeValue["kind"];
type CardLayoutTextStyleValue = NonNullable<CardLayoutNodeValue["style"]>;
type CardLayoutImageValue = NonNullable<CardLayoutNodeValue["image"]>;
type CardOverflowIssueValue = CardLayoutPage["overflow"][number];

const CARD_LAYOUT_NODE_KINDS = new Set<CardLayoutNodeKindValue>(["title", "heading", "body", "focus", "image"]);
const CARD_OVERFLOW_TYPES = new Set<CardOverflowIssueValue["type"]>(["vertical", "horizontal"]);
const CARD_OVERFLOW_EDGES = new Set<NonNullable<CardOverflowIssueValue["edge"]>>(["top", "right", "bottom", "left"]);

function readCardLayoutLine(value: unknown): CardLayoutLineValue | undefined {
  if (!isRecord(value) || typeof value.text !== "string") return undefined;
  const box = readRequiredNumberRecord(value, ["x", "y", "width", "height"]);
  return box ? { text: value.text, ...box } : undefined;
}

function readCardLayoutStyle(value: unknown): CardLayoutTextStyleValue | undefined {
  if (!isRecord(value) || typeof value.fontFamily !== "string") return undefined;
  const style = readRequiredNumberRecord(value, ["fontSize", "fontWeight", "lineHeight"]);
  return style ? { fontFamily: value.fontFamily, ...style } : undefined;
}

function readCardLayoutImage(value: unknown): CardLayoutImageValue | undefined {
  if (!isRecord(value) || typeof value.alt !== "string") return undefined;
  const box = readRequiredNumberRecord(value, ["x", "y", "width", "height"]);
  if (!box) return undefined;
  const rotation = readFiniteNumber(value.rotation);
  const opacity = readFiniteNumber(value.opacity);
  return {
    ...box,
    alt: value.alt,
    ...(rotation === undefined ? {} : { rotation }),
    ...(opacity === undefined ? {} : { opacity }),
    ...(value.mode === "inline" || value.mode === "absolute" ? { mode: value.mode } : {}),
  };
}

function readCardLayoutNode(value: unknown): CardLayoutNodeValue | undefined {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.entryId !== "string" ||
    typeof value.blockId !== "string" ||
    !CARD_LAYOUT_NODE_KINDS.has(value.kind as CardLayoutNodeKindValue) ||
    typeof value.text !== "string" ||
    !Array.isArray(value.lines)
  ) {
    return undefined;
  }

  const sourceIndex = readFiniteNumber(value.sourceIndex);
  const box = readRequiredNumberRecord(value, ["x", "y", "width", "height"]);
  const lines = value.lines.map(readCardLayoutLine);
  if (sourceIndex === undefined || !box || lines.some((line) => line === undefined)) return undefined;

  const style = readCardLayoutStyle(value.style);
  const image = readCardLayoutImage(value.image);
  return {
    id: value.id,
    entryId: value.entryId,
    blockId: value.blockId,
    kind: value.kind as CardLayoutNodeKindValue,
    sourceIndex,
    text: value.text,
    lines: lines as CardLayoutLineValue[],
    ...box,
    ...(style ? { style } : {}),
    ...(typeof value.continuedFromPreviousPage === "boolean" ? { continuedFromPreviousPage: value.continuedFromPreviousPage } : {}),
    ...(typeof value.continuesOnNextPage === "boolean" ? { continuesOnNextPage: value.continuesOnNextPage } : {}),
    ...(image ? { image } : {}),
  };
}

function readCardOverflowIssue(value: unknown): CardOverflowIssueValue | undefined {
  if (
    !isRecord(value) ||
    typeof value.pageId !== "string" ||
    typeof value.nodeId !== "string" ||
    !CARD_OVERFLOW_TYPES.has(value.type as CardOverflowIssueValue["type"])
  ) {
    return undefined;
  }
  const amount = readFiniteNumber(value.amount);
  if (amount === undefined) return undefined;
  return {
    pageId: value.pageId,
    nodeId: value.nodeId,
    type: value.type as CardOverflowIssueValue["type"],
    amount,
    ...(CARD_OVERFLOW_EDGES.has(value.edge as NonNullable<CardOverflowIssueValue["edge"]>)
      ? { edge: value.edge as NonNullable<CardOverflowIssueValue["edge"]> }
      : {}),
  };
}

function readCardLayoutPage(value: unknown): CardLayoutPage[] {
  if (!isRecord(value) || typeof value.id !== "string" || !isCardAspectRatio(value.aspectRatio) || !Array.isArray(value.nodes)) return [];
  const pageNumber = readFiniteNumber(value.pageNumber);
  const totalPages = readFiniteNumber(value.totalPages);
  const canvas = readRequiredNumberRecord(value.canvas, ["width", "height"]);
  const safeArea = readRequiredNumberRecord(value.safeArea, ["top", "right", "bottom", "left", "x", "y", "width", "height"]);
  const nodes = value.nodes.map(readCardLayoutNode);
  if (pageNumber === undefined || totalPages === undefined || !canvas || !safeArea || nodes.some((node) => node === undefined)) return [];

  return [
    {
      id: value.id,
      pageNumber,
      totalPages,
      aspectRatio: value.aspectRatio,
      canvas,
      safeArea,
      nodes: nodes as CardLayoutNodeValue[],
      ...(typeof value.manual === "boolean" ? { manual: value.manual } : {}),
      ...(typeof value.locked === "boolean" ? { locked: value.locked } : {}),
      overflow: Array.isArray(value.overflow) ? value.overflow.flatMap((issue) => readCardOverflowIssue(issue) ?? []) : [],
    },
  ];
}

function readRestorableBackupProject(value: unknown, backupAssets: unknown[] = []): ProjectDocument[] {
  if (!isRecord(value)) return [];
  const platformVersions = isRecord(value.platformVersions) ? value.platformVersions : {};
  const workspace = readPersistedWorkspace(platformVersions);
  const article = readArticleContent(value.article);
  if (!workspace || !article) return [];

  const timestamp = typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString();
  const id = typeof value.id === "string" ? value.id : "backup-project";
  const projectAssets = Array.isArray(value.assets) ? value.assets.flatMap(readBackupAssetReference) : [];
  const matchingBackupAssets = backupAssets.flatMap((asset) => (isRecord(asset) && asset.projectId === id ? readBackupAssetReference(asset) : []));
  const assets = [...new Map([...projectAssets, ...matchingBackupAssets].map((asset) => [asset.id, asset])).values()];
  return [
    {
      schemaVersion: 2,
      id,
      title: typeof value.title === "string" && value.title.trim() ? value.title : "导入项目",
      article,
      assets,
      platformVersions,
      createdAt: typeof value.createdAt === "string" ? value.createdAt : timestamp,
      updatedAt: timestamp,
    },
  ];
}

function readBackupAssetReference(value: unknown): ProjectAssetReference[] {
  if (!isRecord(value)) return [];
  if (typeof value.id !== "string" || typeof value.fileName !== "string" || typeof value.byteLength !== "number") return [];
  if (value.mimeType !== "image/png" && value.mimeType !== "image/jpeg" && value.mimeType !== "image/webp") return [];
  return [
    {
      id: value.id,
      fileName: value.fileName,
      mimeType: value.mimeType,
      byteLength: value.byteLength,
      crop: isRecord(value.crop) ? (value.crop as ProjectAssetReference["crop"]) : undefined,
    },
  ];
}

function filterEmptyAutomaticCardPages(result: CardLayoutResult, manualPages: CardLayoutPage[]): CardLayoutResult {
  if (manualPages.length === 0) return result;
  const pages = result.pages.filter((page) => page.manual || page.locked || page.nodes.length > 0);
  if (pages.length === 0 || pages.length === result.pages.length) return result;
  const totalPages = pages.length;
  const numberedPages = pages.map((page, index) => ({ ...page, pageNumber: index + 1, totalPages }));
  return { ...result, pages: numberedPages, overflow: numberedPages.flatMap((page) => page.overflow) };
}

function sanitizeNode(parent: ParentNode) {
  const blockedTags = new Set(["script", "style", "iframe", "object", "embed", "svg", "math", "template", "meta", "link", "base", "form", "input"]);
  const allowedTags = new Set(["section", "div", "p", "span", "strong", "b", "em", "i", "br", "img", "blockquote", "ul", "ol", "li", "code", "pre", "hr", "a"]);
  const elements = Array.from(parent.querySelectorAll("*"));

  for (const element of elements) {
    const tagName = element.tagName.toLowerCase();
    if (blockedTags.has(tagName)) {
      element.remove();
      continue;
    }
    if (!allowedTags.has(tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      continue;
    }
    sanitizeAttributes(element, tagName);
  }
}

function sanitizeAttributes(element: Element, tagName: string) {
  const globalAttributes = new Set(["style", "title", "data-wechat-block-type"]);
  const tagAttributes: Record<string, Set<string>> = {
    a: new Set(["href"]),
    img: new Set(["src", "alt", "width", "height"]),
  };
  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase();
    const value = attribute.value;
    const allowed = globalAttributes.has(name) || tagAttributes[tagName]?.has(name);
    if (!allowed || name.startsWith("on")) {
      element.removeAttribute(attribute.name);
      continue;
    }
    if ((name === "href" || name === "src") && !isSafeWechatUrl(value, name === "src" && tagName === "img")) {
      element.removeAttribute(attribute.name);
      continue;
    }
    if (name === "style") {
      const style = sanitizeStyleValue(value);
      if (style) element.setAttribute("style", style);
      else element.removeAttribute("style");
    }
  }
}

function isSafeWechatUrl(value: string, allowImageData: boolean) {
  const trimmed = value.trim().replace(/[\u0000-\u001f\u007f\s]+/g, "").toLowerCase();
  if (/^(javascript|vbscript|file):/.test(trimmed)) return false;
  if (trimmed.startsWith("data:")) {
    return allowImageData && /^data:image\/(?:png|jpe?g|gif|webp);base64,/.test(trimmed);
  }
  return /^(https?:|mailto:|tel:|blob:|#|\/)/.test(trimmed);
}

function sanitizeStyleValue(value: string) {
  return value
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !/(?:expression\s*\(|url\s*\(|@import|javascript\s*:|vbscript\s*:|-moz-binding|behavior\s*:)/i.test(part))
    .join("; ");
}

function sanitizeWechatHtmlFallback(html: string) {
  return html
    .replace(/<(script|style|iframe|object|embed|svg|math|template)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(?:script|style|iframe|object|embed|svg|math|template)\b[^>]*\/?>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(?:href|src)\s*=\s*(?:"\s*(?:javascript|vbscript|file):[^"]*"|'\s*(?:javascript|vbscript|file):[^']*'|\s*(?:javascript|vbscript|file):[^\s>]+)/gi, "")
    .replace(/\s(?:href|src)\s*=\s*(?:"\s*data:(?!image\/(?:png|jpe?g|gif|webp);base64,)[^"]*"|'\s*data:(?!image\/(?:png|jpe?g|gif|webp);base64,)[^']*'|\s*data:(?!image\/(?:png|jpe?g|gif|webp);base64,)[^\s>]+)/gi, "")
    .replace(/\sstyle\s*=\s*(?:"[^"]*(?:expression\s*\(|url\s*\(|@import|javascript\s*:|vbscript\s*:)[^"]*"|'[^']*(?:expression\s*\(|url\s*\(|@import|javascript\s*:|vbscript\s*:)[^']*')/gi, "")
    .trim();
}
