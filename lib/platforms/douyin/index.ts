import type { UnifiedArticleContent } from "../../content";
import {
  selectFallbackTitle,
  buildSourceTrace,
  collectRenderableBlocks,
  collectRenderablePages,
  collectTags,
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

function buildImagePages(content: UnifiedArticleContent, ratio: DouyinImageRatio): DouyinImagePage[] {
  const pageSize = douyinImageProfile.maxBlocksPerPage[ratio];
  const pages = collectRenderablePages(content, pageSize);

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
  const candidate = text.slice(0, maxChars).replace(/[，、；：\s]+$/u, "").trim();
  const sentenceEnd = [...candidate.matchAll(/[。！？；]/gu)].at(-1)?.index;
  return sentenceEnd === undefined ? candidate : candidate.slice(0, sentenceEnd + 1);
}

function buildImageCaption(title: string, intro: string, tags: string[]) {
  const hash = tags.slice(0, 2).map((tag) => `#${tag}`).join(" ");
  if (hash) {
    return [clampText(title, 16), clampText(intro, 64), hash].filter(Boolean).join("\n").trim();
  }
  return [clampText(title, 18), clampText(intro, 76)].filter(Boolean).join("\n").trim();
}

function buildIntroText(blocks: RenderableBlock[], blocksMaxWords: number) {
  const lead = blocks.find((block) => block.kind === "lead");
  if (lead?.text) {
    return clampText(lead.text, blocksMaxWords * 2);
  }
  const firstParagraph = blocks.find((block) => block.kind === "paragraph" || block.kind === "section");
  return clampText(firstParagraph?.text ?? "", blocksMaxWords * 2);
}

function selectLongformIntro(blocks: RenderableBlock[], targetWords: number) {
  const lead = blocks.find((block) => block.kind === "lead");
  if (lead?.text) {
    return { text: clampText(lead.text, targetWords * 2), sourceBlockId: lead.blockId, remainder: "" };
  }

  const source = blocks.find((block) => block.kind === "paragraph")
    ?? blocks.find((block) => block.kind === "section");
  if (!source?.text) return { text: "", sourceBlockId: undefined, remainder: "" };

  const maxChars = Math.max(1, targetWords * 2);
  const normalized = source.text.trim();
  if (normalized.length <= maxChars) {
    return { text: normalized, sourceBlockId: source.blockId, remainder: "" };
  }

  const extendedLimit = Math.min(normalized.length, maxChars + Math.min(12, Math.ceil(maxChars * 0.3)));
  const sentenceEnd = [...normalized.slice(0, extendedLimit).matchAll(/[。！？；]/gu)].at(-1);
  const sentenceCut = sentenceEnd?.index === undefined ? 0 : sentenceEnd.index + sentenceEnd[0].length;
  const commaCut = Math.max(normalized.lastIndexOf("，", maxChars - 1), normalized.lastIndexOf(",", maxChars - 1)) + 1;
  const cut = sentenceCut >= Math.ceil(maxChars * 0.65)
    ? sentenceCut
    : commaCut >= Math.ceil(maxChars * 0.55)
      ? commaCut
      : maxChars;

  return {
    text: normalized.slice(0, cut).trim(),
    sourceBlockId: source.blockId,
    remainder: normalized.slice(cut).trim(),
  };
}

function buildLongformBody(blocks: RenderableBlock[], profile: DouyinLongformProfile) {
  const introSelection = selectLongformIntro(blocks, profile.introTargetWords);
  const bodyBlocks = blocks
    .filter((block) => block.kind !== "title" && block.kind !== "lead" && block.kind !== "cta")
    .flatMap((block) => {
      if (block.blockId !== introSelection.sourceBlockId) return [block];
      return introSelection.remainder ? [{ ...block, text: introSelection.remainder }] : [];
    });
  const bodyText = renderLongformBodyText(bodyBlocks);
  const intro = introSelection.text;
  const ending = (() => {
    const endingCandidate = blocks.findLast((block) => block.kind === "summary" || block.kind === "cta" || block.kind === "section");
    return clampText(endingCandidate?.text ?? intro, profile.endingTargetWords);
  })();

  const highlightSources = bodyBlocks.filter((block) => block.kind === "golden" || block.kind === "quote" || block.kind === "card");
  const highlights = [...new Set(highlightSources.map((block) => clampText(block.text, 48).trim()).filter(Boolean))].slice(0, 4);
  const fallbackHighlight = bodyBlocks.find(
    (block) => (block.kind === "paragraph" || block.kind === "summary") && block.text.trim() && block.text.trim() !== intro,
  );

  return {
    intro,
    ending,
    body: bodyBlocks.length ? bodyText : intro,
    highlights: highlights.length ? highlights : fallbackHighlight ? [clampText(fallbackHighlight.text, 48)] : [],
  };
};

function renderLongformBodyText(blocks: RenderableBlock[]) {
  let listIndex = 0;
  return blocks.map((block) => {
    if (block.kind === "list") {
      listIndex += 1;
      return `${listIndex}. ${block.text.replace(/^\d+\.\s*/u, "")}`;
    }
    listIndex = 0;
    return block.text;
  }).join("\n\n");
}

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
  const coverTitle = content.blocks.find((block) => block.type === "title" && block.text.trim())?.text.trim() || title;
  const caption = buildImageCaption(coverTitle, buildIntroText(blocks, 16), collectTags(content, douyinImageProfile.maxTags));
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
    pages: buildImagePages(content, ratio),
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
