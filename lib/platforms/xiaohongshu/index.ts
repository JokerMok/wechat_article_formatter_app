import type { UnifiedArticleContent } from "../../content";
import { paginateBlocks, buildSourceTrace, collectRenderableBlocks, collectTags, selectFallbackTitle, selectSubtitle } from "../platform-profiles";
import type { PlatformSourceTrace, RenderableBlock } from "../platform-profiles";
import { platformProfiles } from "../platform-profiles";
import type { PlatformProfile, XiaohongshuProfile } from "../platform-profiles";

export type XiaohongshuPageBlock = RenderableBlock;

export type XiaohongshuBodyPage = {
  pageIndex: number;
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
  tags: string[];
  cover: XiaohongshuCover;
  pages: XiaohongshuBodyPage[];
};

const profile = platformProfiles.xiaohongshu as XiaohongshuProfile;

function buildPages(profilePageCapacity: number, content: UnifiedArticleContent): XiaohongshuBodyPage[] {
  const blocks = collectRenderableBlocks(content);
  const pages = paginateBlocks(blocks, profilePageCapacity);

  return pages.map((pageBlocks, pageIndex) => ({
    pageIndex,
    blocks: pageBlocks.map((block) => ({ ...block })),
    sourceBlockIds: pageBlocks.map((block) => block.blockId),
  }));
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
    tags,
    cover: buildCover(content),
    pages,
  };
}
