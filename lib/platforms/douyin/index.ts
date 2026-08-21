import type { UnifiedArticleContent } from "../../content";
import {
  selectFallbackTitle,
  buildSourceTrace,
  collectRenderableBlocks,
  collectTags,
  paginateBlocks,
  resolveDouyinImageRatio,
} from "../platform-profiles";
import { platformProfiles } from "../platform-profiles";
import type { PlatformProfile, RenderableBlock, DouyinImageProfile, DouyinLongformProfile } from "../platform-profiles";

export type DouyinImageRatio = "3:4" | "9:16";

export type DouyinImagePage = {
  pageIndex: number;
  blocks: RenderableBlock[];
  sourceBlockIds: string[];
};

export type DouyinImageOutput = {
  platform: "douyinImage";
  ratio: DouyinImageRatio;
  schemaVersion: PlatformProfile["outputSchemaVersion"];
  profileVersion: PlatformProfile["profileVersion"];
  source: ReturnType<typeof buildSourceTrace>;
  title: string;
  caption: string;
  tags: string[];
  pages: DouyinImagePage[];
};

export type DouyinLongformOutput = {
  platform: "douyinLongform";
  schemaVersion: PlatformProfile["outputSchemaVersion"];
  profileVersion: PlatformProfile["profileVersion"];
  source: ReturnType<typeof buildSourceTrace>;
  title: string;
  intro: string;
  body: string;
  highlights: string[];
  ending: string;
  caption: string;
  tags: string[];
};

const douyinImageProfile = platformProfiles.douyinImage as DouyinImageProfile;
const douyinLongProfile = platformProfiles.douyinLongform as DouyinLongformProfile;

function buildImagePages(blocks: RenderableBlock[], ratio: DouyinImageRatio): DouyinImagePage[] {
  const pageSize = douyinImageProfile.maxBlocksPerPage[ratio];
  const pages = paginateBlocks(blocks, pageSize);

  return pages.map((pageBlocks, pageIndex) => ({
    pageIndex,
    blocks: pageBlocks.map((block) => ({ ...block })),
    sourceBlockIds: pageBlocks.map((block) => block.blockId),
  }));
}

function clampText(text: string, maxChars: number) {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars).trim()}...`;
}

function buildImageCaption(title: string, intro: string, tags: string[]) {
  const hash = tags.slice(0, 2).map((tag) => `#${tag}`).join(" ");
  if (hash) {
    return [clampText(title, 16), clampText(intro, 64), hash].filter(Boolean).join(" ").trim();
  }
  return [clampText(title, 18), clampText(intro, 76)].filter(Boolean).join(" ").trim();
}

function buildIntroText(blocks: RenderableBlock[], blocksMaxWords: number) {
  const lead = blocks.find((block) => block.kind === "lead");
  if (lead?.text) {
    return clampText(lead.text, blocksMaxWords * 2);
  }
  const firstParagraph = blocks.find((block) => block.kind === "paragraph" || block.kind === "section");
  return clampText(firstParagraph?.text ?? "", blocksMaxWords * 2);
}

function buildLongformBody(blocks: RenderableBlock[], profile: DouyinLongformProfile) {
  const bodyText = blocks.map((block) => block.text).join("\n\n");
  const intro = buildIntroText(blocks, profile.introTargetWords);
  const ending = (() => {
    const endingCandidate = blocks.findLast((block) => block.kind === "summary" || block.kind === "cta" || block.kind === "section");
    return clampText(endingCandidate?.text ?? intro, profile.endingTargetWords);
  })();

  const highlightSources = blocks.filter((block) => block.kind === "golden" || block.kind === "quote" || block.kind === "card");
  const highlights = [...new Set(highlightSources.map((block) => clampText(block.text, 48).trim()).filter(Boolean))].slice(0, 4);

  return {
    intro,
    ending,
    body: blocks.length ? bodyText : intro,
    highlights: highlights.length ? highlights : [intro],
  };
};

export type DouyinImageOptions = {
  ratio?: DouyinImageRatio;
};

export type DouyinLongformOptions = {
  profile?: DouyinLongformProfile;
};

export function toDouyinImageText(content: UnifiedArticleContent, options: DouyinImageOptions = {}): DouyinImageOutput {
  const ratio = resolveDouyinImageRatio(options.ratio, douyinImageProfile);
  const blocks = collectRenderableBlocks(content);
  const title = selectFallbackTitle(content);
  const caption = buildImageCaption(title, buildIntroText(blocks, 16), collectTags(content, douyinImageProfile.maxTags));
  const tags = collectTags(content, douyinImageProfile.maxTags);

  return {
    platform: "douyinImage",
    ratio,
    schemaVersion: douyinImageProfile.outputSchemaVersion,
    profileVersion: douyinImageProfile.profileVersion,
    source: buildSourceTrace(content),
    title,
    caption,
    tags,
    pages: buildImagePages(blocks, ratio),
  };
}

export function toDouyinLongform(content: UnifiedArticleContent, options: DouyinLongformOptions = {}): DouyinLongformOutput {
  const profile = options.profile ?? douyinLongProfile;
  const blocks = collectRenderableBlocks(content);
  const title = selectFallbackTitle(content);
  const { intro, ending, body, highlights } = buildLongformBody(blocks, profile);
  const tags = collectTags(content, profile.maxTags);
  const caption = `${title}${intro ? ` - ${intro}` : ""}`;

  return {
    platform: "douyinLongform",
    schemaVersion: profile.outputSchemaVersion,
    profileVersion: profile.profileVersion,
    source: buildSourceTrace(content),
    title,
    intro,
    body,
    highlights,
    ending,
    caption,
    tags,
  };
}
