import type { UnifiedArticleBlock, UnifiedArticleContent } from "../content";
import type { PlatformId } from "../platforms/types";
import type { ContentBlueprint, PagePlan, PagePlanKind, PlannedContentBlock } from "./types";

/** Layout is a projection, not an editorial rewrite. Every source block occurs exactly once. */
export function planPreservedPages(source: UnifiedArticleContent, platform: PlatformId, blueprint: ContentBlueprint): PagePlan[] {
  const cards = platform === "xiaohongshu" || platform === "douyinImage";
  const pages: PagePlan[] = [];
  let current: UnifiedArticleBlock[] = [];
  let size = 0;
  const budget = platform === "douyinImage" ? 260 : 440;
  const compact = cards && source.blocks.length <= 4
    && source.blocks.every((block) => ["title", "paragraph", "quote"].includes(block.type))
    && source.blocks.reduce((length, block) => length + block.plainText.length, 0) <= 180;
  const kind = (blocks: UnifiedArticleBlock[]): PagePlanKind => {
    if (blocks[0]?.type === "title") return "cover";
    if (blocks.some((block) => block.type === "list")) return "checklist";
    if (blocks.some((block) => block.type === "quote")) return "quote";
    const role = blueprint.sections.find((section) => section.sourceBlockIds.includes(blocks[0]?.id))?.role;
    if (role === "conclusion") return "summary";
    if (role === "method") return "step";
    if (role === "boundary") return "boundary";
    return blocks.some((block) => block.type === "section") ? "chapter" : "argument";
  };
  const flush = () => {
    if (!current.length) return;
    const pageKind = kind(current);
    const blocks: PlannedContentBlock[] = current.map((block) => ({
      id: `${platform}:source:${block.id}`, unitId: block.id,
      role: block.type === "title" ? "title" : ["section", "subsection"].includes(block.type) ? "heading" : block.type === "image" ? "media" : block.type === "quote" ? "focus" : "body",
      text: block.text, sourceBlockIds: [block.id], provenance: "source", usage: "body",
    }));
    pages.push({ id: `${platform}:page:${pageKind}:${pages.length + 1}`, kind: pageKind, sourceBlockIds: current.map((block) => block.id), blocks });
    current = []; size = 0;
  };
  for (const block of source.blocks) {
    if (cards && block.type === "pageBreak") { flush(); continue; }
    if (cards && !compact && current.length && (current[0].type === "title" || block.type === "section" || (size >= budget && !["section", "subsection"].includes(current.at(-1)!.type)))) flush();
    current.push(block);
    size += block.type === "image" ? 200 : block.plainText.length;
  }
  flush();
  return pages;
}
