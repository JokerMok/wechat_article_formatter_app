import { checkSourceIntegrity } from "../content/integrity";
import type { SourcePosition, UnifiedArticleBlock, UnifiedArticleContent } from "../content";
import { getDesignScheme } from "../design-schemes";
import type { PlatformId } from "../platforms/types";
import { buildLocalEditorialPlan } from "./editorial-plan";
import { buildPlatformDesignPlans } from "./platform-planner";
import type { DesignPlan, PagePlan, PlannedContentBlock, PlatformDesignPlan } from "./types";

export function buildPlatformArticle(source: UnifiedArticleContent, platform: PlatformId, plan: DesignPlan): UnifiedArticleContent {
  const sourceBlocks = new Map(source.blocks.map((block) => [block.id, block]));
  if (plan.generationMode === "layoutOnly") {
    // Rebuild from immutable source even for plans saved by older, lossy versions.
    const preserved = buildPlatformDesignPlans(source, plan.blueprint, getDesignScheme(plan.recommendedScheme), {
      themeId: plan.recommendedThemeId, contentLayoutId: plan.contentLayoutId,
    })[platform];
    const cards = platform === "xiaohongshu" || platform === "douyinImage";
    const blocks = preserved.pages.flatMap((page, index) => {
      const originals = page.blocks.flatMap((block, blockIndex) => block.sourceBlockIds.flatMap((id) => {
        const original = sourceBlocks.get(id);
        return original ? [{ ...original, source: { ...original.source }, presentation: { pageRole: page.kind, sectionId: page.id, sectionStart: blockIndex === 0 }, ...(original.type === "list" ? { items: [...original.items] } : {}) }] : [];
      }));
      return cards && index < preserved.pages.length - 1 ? [...originals, createPageBreak(source, `${page.id}:semantic-boundary`)] : originals;
    });
    const output = { ...source, blocks };
    if (!checkSourceIntegrity(source, output).ok) throw new Error("排版完整性校验失败，已阻止生成不完整的成稿。");
    return output;
  }
  const platformPlan = resolvePlatformPlan(source, platform, plan);
  const blocks = platform === "wechat"
    ? renderWechatPages(platformPlan.pages, source, sourceBlocks)
    : platform === "xiaohongshu"
      ? renderXiaohongshuPages(platformPlan.pages, source, sourceBlocks)
      : platform === "douyinImage"
        ? renderDouyinImagePages(platformPlan.pages, source, sourceBlocks)
        : renderDouyinLongformPages(platformPlan.pages, source, sourceBlocks);

  return {
    ...source,
    title: platformPlan.title,
    blocks,
  };
}

function resolvePlatformPlan(source: UnifiedArticleContent, platform: PlatformId, plan: DesignPlan): PlatformDesignPlan {
  const existing = plan.platformPlans[platform];
  const themeId = plan.recommendedThemeId ?? getDesignScheme(plan.recommendedScheme).themeId;
  const layoutId = plan.contentLayoutId ?? getDesignScheme(plan.recommendedScheme).contentLayoutId;
  // Explicit theme/layout fields are authoritative. visualPresetId is kept
  // only for migration compatibility with plans saved before the split.
  if (existing?.themeId === themeId && existing?.layoutId === layoutId && existing.title) return existing;
  const editorialPlan = existing?.editorialPlan ?? buildLocalEditorialPlan(source, plan.blueprint, platform);
  return buildPlatformDesignPlans(source, plan.blueprint, getDesignScheme(plan.recommendedScheme), {
    themeId,
    contentLayoutId: layoutId,
    editorialPlans: { [platform]: editorialPlan },
  })[platform];
}

function renderWechatPages(
  pages: PagePlan[],
  source: UnifiedArticleContent,
  sourceBlocks: Map<string, UnifiedArticleBlock>,
): UnifiedArticleBlock[] {
  return pages.flatMap((page) => page.blocks.flatMap((block, blockIndex) => renderPlannedBlock(block, page, blockIndex, source, sourceBlocks, "wechat")));
}

function renderXiaohongshuPages(
  pages: PagePlan[],
  source: UnifiedArticleContent,
  sourceBlocks: Map<string, UnifiedArticleBlock>,
): UnifiedArticleBlock[] {
  return pages.flatMap((page, pageIndex) => {
    const blocks = page.blocks.flatMap((block, blockIndex) => renderPlannedBlock(block, page, blockIndex, source, sourceBlocks, "xiaohongshu"));
    if (pageIndex === pages.length - 1) return blocks;
    return [...blocks, createPageBreak(source, `${page.id}:break:${pages[pageIndex + 1]?.kind ?? "argument"}`)];
  });
}

function renderDouyinImagePages(
  pages: PagePlan[],
  source: UnifiedArticleContent,
  sourceBlocks: Map<string, UnifiedArticleBlock>,
): UnifiedArticleBlock[] {
  return pages.flatMap((page, pageIndex) => {
    const blocks = page.blocks.flatMap((block, blockIndex) => renderPlannedBlock(block, page, blockIndex, source, sourceBlocks, "douyinImage"));
    if (pageIndex === pages.length - 1) return blocks;
    return [...blocks, createPageBreak(source, `${page.id}:break:${pages[pageIndex + 1]?.kind ?? "point"}`)];
  });
}

function renderDouyinLongformPages(
  pages: PagePlan[],
  source: UnifiedArticleContent,
  sourceBlocks: Map<string, UnifiedArticleBlock>,
): UnifiedArticleBlock[] {
  return pages.flatMap((page) => page.blocks.flatMap((block, blockIndex) => renderPlannedBlock(block, page, blockIndex, source, sourceBlocks, "douyinLongform")));
}

function renderPlannedBlock(
  block: PlannedContentBlock,
  page: PagePlan,
  blockIndex: number,
  source: UnifiedArticleContent,
  sourceBlocks: Map<string, UnifiedArticleBlock>,
  platform: PlatformId,
): UnifiedArticleBlock[] {
  if (!block.text.trim() && block.role !== "media") return [];
  const sourceBlock = block.sourceBlockIds.map((id) => sourceBlocks.get(id)).find(Boolean);
  const id = `${page.id}:block:${blockIndex + 1}:${block.id}`;

  if (block.role === "media" && sourceBlock?.type === "image") {
    return [{ ...sourceBlock, id, source: { ...sourceBlock.source } }];
  }
  if (block.role === "list") {
    return [createListBlock(id, block.text, sourceReference(source, sourceBlock, block.text))];
  }

  const type = blockTypeForRole(block, page, blockIndex, platform);
  return [createTextBlock(id, type, block.text, sourceReference(source, sourceBlock, block.text))];
}

function blockTypeForRole(
  block: PlannedContentBlock,
  page: PagePlan,
  blockIndex: number,
  platform: PlatformId,
): "title" | "lead" | "section" | "paragraph" | "quote" | "golden" | "summary" | "cta" {
  if (block.role === "title") return "title";
  if (block.role === "subtitle") return "lead";
  if (block.role === "heading") return "section";
  if (block.role === "focus") {
    if (page.kind === "action" || page.kind === "callToAction") return "cta";
    if (page.kind === "summary" || page.kind === "ending" || page.kind === "boundary" || page.kind === "conclusion" || page.kind === "epilogue") return "summary";
    return "golden";
  }
  if (block.role === "body") {
    if (platform === "douyinImage" && ["point", "keyMetric", "action", "warning", "callToAction"].includes(page.kind) && blockIndex === 0) return "golden";
    if (platform === "douyinLongform" && ["turning", "action", "ending"].includes(page.kind) && blockIndex === 0) return "golden";
    if (platform === "wechat" && (page.kind === "keyMetric" || page.kind === "turning" || page.kind === "transition") && blockIndex === 0) return "golden";
  }
  return "paragraph";
}

function createTextBlock(
  id: string,
  type: "title" | "lead" | "section" | "paragraph" | "quote" | "golden" | "summary" | "cta",
  text: string,
  source: SourcePosition,
): UnifiedArticleBlock {
  const markdownPrefix = type === "title" ? "# " : type === "section" ? "## " : type === "golden" ? "> " : "";
  return { id, type, text, plainText: text, markdown: `${markdownPrefix}${text}`, source };
}

function createListBlock(id: string, text: string, source: SourcePosition): UnifiedArticleBlock {
  return {
    id,
    type: "list",
    items: [text],
    text,
    plainText: text,
    markdown: `- ${text}`,
    source,
  };
}

function createPageBreak(source: UnifiedArticleContent, id: string): UnifiedArticleBlock {
  return {
    id,
    type: "pageBreak",
    text: "",
    plainText: "",
    markdown: "---",
    source: sourceReference(source, undefined, ""),
  };
}

function sourceReference(source: UnifiedArticleContent, block: UnifiedArticleBlock | undefined, text: string): SourcePosition {
  if (block) return { ...block.source };
  const fallback = source.blocks[0]?.source;
  return fallback
    ? { ...fallback, sourceText: text || fallback.sourceText }
    : { startLine: 1, endLine: 1, startOffset: 0, endOffset: text.length, sourceText: text };
}
