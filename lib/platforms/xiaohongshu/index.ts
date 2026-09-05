import type { UnifiedArticleContent } from "../../content";
import { buildSourceTrace, collectRenderableBlocks, collectRenderablePages, collectTags, selectFallbackTitle, selectSubtitle } from "../platform-profiles";
import type { PlatformSourceTrace, RenderableBlock } from "../platform-profiles";
import { platformProfiles } from "../platform-profiles";
import type { PlatformProfile, XiaohongshuProfile } from "../platform-profiles";

export type XiaohongshuPageBlock = RenderableBlock;

export type XiaohongshuBodyPage = {
  pageIndex: number;
  pageTitle: string;
  focusPrompt: string;
  blocks: XiaohongshuPageBlock[];
  sourceBlockIds: string[];
};

export type XiaohongshuCover = {
  title: string;
  subtitle: string;
  sourceBlockId?: string;
};

export type XiaohongshuImageTextOutput = {
  platform: "xiaohongshu";
  schemaVersion: PlatformProfile["outputSchemaVersion"];
  profileVersion: PlatformProfile["profileVersion"];
  source: PlatformSourceTrace;
  title: string;
  body: string;
  caption?: string;
  tags: string[];
  cover: XiaohongshuCover;
  pages: XiaohongshuBodyPage[];
};

const profile = platformProfiles.xiaohongshu as XiaohongshuProfile;

function clampText(text: string, maxChars: number) {
  const normalized = text.trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  const candidate = normalized.slice(0, maxChars).trim();
  const sentenceEnd = [...candidate.matchAll(/[。！？；]/gu)].at(-1)?.index;
  return sentenceEnd === undefined ? candidate : candidate.slice(0, sentenceEnd + 1);
}

function derivePageTitle(pageBlocks: XiaohongshuPageBlock[], fallbackTitle: string, pageIndex: number) {
  const firstBlockText = pageBlocks[0]?.text ?? "";
  return clampText(firstBlockText || fallbackTitle || `第${pageIndex + 1}页`, 32);
}

function deriveFocusPrompt(pageBlocks: XiaohongshuPageBlock[], pageTitle: string) {
  const focusBlock =
    pageBlocks.find((block) => ["golden", "quote", "card", "section", "subsection", "lead", "summary"].includes(block.kind)) ??
    pageBlocks[0];
  const focusText = clampText(focusBlock?.text ?? pageTitle, 48);
  return `本页重点：${focusText}`;
}

function buildPages(profilePageCapacity: number, content: UnifiedArticleContent): XiaohongshuBodyPage[] {
  const pages = collectRenderablePages(content, profilePageCapacity);
  const fallbackTitle = selectFallbackTitle(content);

  return pages.map((pageBlocks, pageIndex) => {
    const pageTitle = derivePageTitle(pageBlocks, fallbackTitle, pageIndex);
    return {
      pageIndex,
      pageTitle,
      focusPrompt: deriveFocusPrompt(pageBlocks, pageTitle),
      blocks: pageBlocks.map((block) => ({ ...block })),
      sourceBlockIds: pageBlocks.map((block) => block.blockId),
    };
  });
}

function buildCover(content: UnifiedArticleContent): XiaohongshuCover {
  const title = selectFallbackTitle(content);
  const subtitle = selectSubtitle(content);
  const firstImage = content.blocks.find((block) => block.type === "image");
  return {
    title,
    subtitle,
    sourceBlockId: firstImage?.id,
  };
}

function buildBodyText(content: UnifiedArticleContent) {
  const blocks = collectRenderableBlocks(content);
  return {
    text: blocks.map((block) => block.text).filter((text) => text.length > 0).join("\n"),
    blockCount: blocks.length,
  };
}

function buildCaption(content: UnifiedArticleContent, title: string, tags: string[]) {
  const lead = content.blocks.find((block) => block.type === "lead")?.text.trim() ?? "";
  const ending = [...content.blocks].reverse().find((block) => block.type === "summary" || block.type === "cta");
  const endingText = ending?.text.trim() ?? "";
  const tagLine = tags.map((tag) => `#${tag}`).join(" ");
  return [title, lead, endingText && endingText !== lead ? endingText : "", tagLine].filter(Boolean).join("\n\n");
}

export function toXiaohongshuImageText(content: UnifiedArticleContent): XiaohongshuImageTextOutput {
  const pageCapacity = profile.maxBlocksPerPage;
  const pages = buildPages(pageCapacity, content);
  const title = selectFallbackTitle(content);
  const tags = collectTags(content, profile.maxTags);
  const body = buildBodyText(content);

  return {
    platform: "xiaohongshu",
    schemaVersion: profile.outputSchemaVersion,
    profileVersion: profile.profileVersion,
    source: buildSourceTrace(content),
    title,
    body: body.text,
    caption: buildCaption(content, title, tags),
    tags,
    cover: buildCover(content),
    pages,
  };
}
