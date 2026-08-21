import type { TemplateKey } from "../../lib/article-types";
import { parseArticleContent } from "../../lib/article-parser";
import type { UnifiedArticleBlock, UnifiedArticleContent } from "../../lib/content";
import { toDouyinImageText, toDouyinLongform } from "../../lib/platforms/douyin";
import type { PlatformId } from "../../lib/platforms/types";
import { createWechatPlatformVersion } from "../../lib/platforms/wechat";
import { toXiaohongshuImageText } from "../../lib/platforms/xiaohongshu";
import type { CardAspectRatio } from "../../lib/renderers/cards";
import { styleTemplates } from "../../lib/style-templates";
import type {
  AiWorkspaceSettings,
  LayoutSettings,
  PlatformDraft,
  PlatformMeta,
  RatioMode,
  WorkspacePersistedState,
} from "./types";

export const WORKSPACE_PLATFORM_IDS = ["wechat", "xiaohongshu", "douyinImage", "douyinLongform"] as const satisfies readonly PlatformId[];

export const WORKSPACE_PLATFORM_LABELS: Record<PlatformId, string> = {
  wechat: "公众号",
  xiaohongshu: "小红书",
  douyinImage: "抖音图文",
  douyinLongform: "抖音长文",
};

export const WORKSPACE_VERSION_KEY = "__unifiedSelfMediaWorkspace";

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
  temperature: 0.2,
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

export function updatePlatformBlock(draft: PlatformDraft, blockId: string, text: string): PlatformDraft {
  const content = cloneArticleContent(draft.content);
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
    title: metaTitle(draft.platform, nextContent, meta),
    content: nextContent,
    meta: { ...meta, tags: draft.meta.tags.length ? draft.meta.tags : meta.tags },
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
    editedWechatHtml: html,
    status: "edited",
    updatedAt: new Date().toISOString(),
  };
}

export function readPersistedWorkspace(value: unknown): WorkspacePersistedState | undefined {
  if (!isRecord(value)) return undefined;
  const raw = value[WORKSPACE_VERSION_KEY];
  if (!isRecord(raw) || raw.schemaVersion !== 1 || typeof raw.sourceMarkdown !== "string" || !isRecord(raw.platforms)) {
    return undefined;
  }

  const fallback = createWorkspaceState(raw.sourceMarkdown);
  const rawPlatforms = raw.platforms;
  return {
    schemaVersion: 1,
    sourceMarkdown: raw.sourceMarkdown,
    layout: readLayout(raw.layout, fallback.layout),
    ai: readAi(raw.ai, fallback.ai),
    platforms: Object.fromEntries(
      WORKSPACE_PLATFORM_IDS.map((platform) => [platform, readPlatformDraft(rawPlatforms[platform], platform, fallback.platforms[platform])]),
    ) as Record<PlatformId, PlatformDraft>,
  };
}

export function serializeWorkspace(state: WorkspacePersistedState) {
  return {
    [WORKSPACE_VERSION_KEY]: state,
  };
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
    temperature: readNumber(value.temperature, fallback.temperature),
    lastFallbackReason: typeof value.lastFallbackReason === "string" ? value.lastFallbackReason : fallback.lastFallbackReason,
  };
}

function readPlatformDraft(value: unknown, platform: PlatformId, fallback: PlatformDraft): PlatformDraft {
  if (!isRecord(value)) return fallback;
  const content = isRecord(value.content) ? (value.content as UnifiedArticleContent) : fallback.content;
  const ratio = value.ratio === "9:16" ? "9:16" : "3:4";
  return {
    ...fallback,
    platform,
    status: typeof value.status === "string" ? (value.status as PlatformDraft["status"]) : fallback.status,
    title: typeof value.title === "string" ? value.title : fallback.title,
    content,
    templateKey: typeof value.templateKey === "string" && value.templateKey in styleTemplates ? (value.templateKey as TemplateKey) : fallback.templateKey,
    ratio,
    meta: isRecord(value.meta) ? ({ ...fallback.meta, ...value.meta } as PlatformMeta) : fallback.meta,
    lockedPageIds: Array.isArray(value.lockedPageIds) ? value.lockedPageIds.filter((id): id is string => typeof id === "string") : [],
    manualPages: [],
    editedWechatHtml: typeof value.editedWechatHtml === "string" ? value.editedWechatHtml : undefined,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : fallback.updatedAt,
  };
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
