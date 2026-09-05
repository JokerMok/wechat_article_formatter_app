import type { UnifiedArticleBlock, UnifiedArticleContent } from "../content";
import type { PlatformId } from "../platforms/types";
import type { ContentLayoutId } from "../design-schemes";
import type { ContentBlueprint, PagePlan, PagePlanKind, PlannedContentBlock } from "./types";

/** Semantic boundaries define reading units; the measured renderer handles capacity. */
export function planPreservedPages(
  source: UnifiedArticleContent,
  platform: PlatformId,
  blueprint: ContentBlueprint,
  layoutId: ContentLayoutId = "editorial",
): PagePlan[] {
  const cards = platform === "xiaohongshu" || platform === "douyinImage";
  const pages: PagePlan[] = [];
  const sections = new Map<string, ContentBlueprint["sections"][number]>();
  for (const section of blueprint.sections) {
    for (const id of section.sourceBlockIds) if (!sections.has(id)) sections.set(id, section);
  }
  const compact = cards && source.blocks.filter((block) => block.type !== "pageBreak").length <= 4
    && source.blocks.every((block) => ["title", "paragraph", "quote"].includes(block.type))
    && source.blocks.reduce((length, block) => length + block.plainText.length, 0) <= 180;
  const compactOutline = cards && source.blocks.length <= 12
    && source.blocks.every((block) => ["title", "section", "subsection", "paragraph", "quote", "list"].includes(block.type))
    && source.blocks.reduce((length, block) => length + block.plainText.length, 0) <= 180;
  let current: UnifiedArticleBlock[] = [];
  let activeSectionId: string | undefined;

  const kind = (blocks: UnifiedArticleBlock[]): PagePlanKind => {
    if (blocks[0]?.type === "title") return "cover";
    const role = sections.get(blocks[0]?.id)?.role;
    if (layoutId === "checklist" && blocks.some((block) => block.type === "list")) return "checklist";
    if (role === "conclusion") return layoutId === "story" ? "epilogue" : "summary";
    if (role === "callToAction") return "callToAction";
    if (role === "boundary" || role === "counterArgument") return layoutId === "checklist" ? "warning" : "boundary";
    if (role === "method") return "step";
    if (layoutId === "story") {
      if (role === "conflict" || role === "problem") return "conflict";
      if (role === "result") return "transition";
      if (role === "hook" || role === "background") return "opening";
      return "chapter";
    }
    if (layoutId === "checklist") {
      if (blocks.some((block) => block.type === "list")) return "checklist";
      return role === "result" ? "conclusion" : "action";
    }
    if (role === "evidence") return layoutId === "data" ? "keyMetric" : "evidence";
    if (blocks.every((block) => block.type === "quote")) return "quote";
    if (blocks.some((block) => block.type === "list")) return "checklist";
    if (role === "hook" || role === "background") return "intro";
    if (blocks.some((block) => block.type === "section" || block.type === "subsection")) return "chapter";
    return platform === "douyinImage" ? "point" : "argument";
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
    current = [];
  };
  for (const block of source.blocks) {
    if (block.type === "pageBreak") {
      if (cards) { flush(); activeSectionId = undefined; continue; }
    }
    const sectionId = sections.get(block.id)?.id;
    const explicitHeading = block.type === "section" || block.type === "subsection";
    const newSemanticSection = sectionId !== undefined && activeSectionId !== undefined && sectionId !== activeSectionId;
    const standaloneCover = cards && current[0]?.type === "title";
    if (!compact && current.length && (standaloneCover || (!compactOutline && (explicitHeading || newSemanticSection)))) flush();
    current.push(block);
    if (sectionId) activeSectionId = sectionId;
  }
  flush();
  return pages;
}
