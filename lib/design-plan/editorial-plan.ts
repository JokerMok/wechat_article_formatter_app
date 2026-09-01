import type { UnifiedArticleBlock, UnifiedArticleContent, SourcePosition } from "../content";
import { renderBlockText } from "../platforms/platform-profiles";
import type { PlatformId } from "../platforms/types";
import { cleanPublishingText, isGenericStructureHeading, publicationBlocks } from "./content-filter";
import type {
  ContentBlueprint,
  ContentSection,
  EditorialPlan,
  EditorialSection,
  EditorialSectionRole,
  SemanticSectionRole,
} from "./types";

/**
 * Build the small editorial contract used by both deterministic and AI
 * generation. The source blocks remain the only source of truth for copy.
 */
export function buildLocalEditorialPlan(
  source: UnifiedArticleContent,
  blueprint: ContentBlueprint,
  platform: PlatformId,
): EditorialPlan {
  const sourceBlocks = new Map(source.blocks.map((block) => [block.id, block]));
  const sections = blueprint.sections
    .map((section) => editorialSectionFromBlueprint(section, sourceBlocks))
    .filter((section): section is EditorialSection => section !== undefined);

  const safeSections = sections.length > 0
    ? sections
    : fallbackEditorialSection(source, blueprint);
  const mediaBlockIds = source.blocks.filter((block) => block.type === "image").map((block) => block.id);
  const sectionsWithMedia = mediaBlockIds.length && safeSections.length
    ? safeSections.map((section, index) => index === 0
      ? { ...section, sourceBlockIds: [...new Set([...section.sourceBlockIds, ...mediaBlockIds])] }
      : section)
    : safeSections;
  const sourceTitle = cleanPublishingText(source.title ?? "");
  const openingHook = cleanPublishingText(blueprint.openingHook ?? "");
  const hook = blueprint.generationMode === "reachOptimized"
    && openingHook
    && !containsMeaningfulText(source, openingHook)
    ? openingHook
    : undefined;

  const preferredTitle = blueprint.generationMode === "reachOptimized"
    ? blueprint.titleCandidates[0] || sourceTitle
    : sourceTitle || blueprint.titleCandidates[0];

  return {
    schemaVersion: 1,
    platform,
    contentType: blueprint.primaryContentType,
    title: preferredTitle || "未命名文章",
    ...(hook ? { hook } : {}),
    sections: sectionsWithMedia,
    ...(blueprint.conclusion && !sectionsWithMedia.some((section) => containsMeaningfulText(section.body ?? "", blueprint.conclusion))
      ? { summary: blueprint.conclusion }
      : {}),
    tags: blueprint.topicTags.length ? [...blueprint.topicTags] : undefined,
  };
}

export function editorialSectionToContentSection(
  section: EditorialSection,
  source: UnifiedArticleContent,
  index: number,
): ContentSection {
  const sourceBlocks = new Map(source.blocks.map((block) => [block.id, block]));
  const headingText = section.heading;
  const sourceHeading = headingText && section.sourceBlockIds.some((id) => {
    const block = sourceBlocks.get(id);
    return (block?.type === "section" || block?.type === "subsection") && cleanPublishingText(block.text) === cleanPublishingText(headingText);
  });
  const semanticRole = semanticRoleForEditorialRole(section.role);
  const body = section.body || section.bullets?.join("；") || section.heading || "";
  const displayHeading = headingText && (sourceHeading || !isGenericStructureHeading(headingText))
    ? {
        text: headingText,
        provenance: sourceHeading ? "source" as const : "expressionOptimization" as const,
        confidence: sourceHeading ? 1 : 0.72,
      }
    : undefined;

  return {
    id: section.id || `editorial-section-${index + 1}`,
    title: displayHeading?.text ?? "",
    role: semanticRole,
    summary: firstSentence(body),
    sourceBlockIds: [...new Set(section.sourceBlockIds)],
    keyMessage: firstSentence(body),
    importance: index === 0 ? 0.92 : semanticRole === "method" || semanticRole === "conflict" ? 0.88 : 0.72,
    canSplit: body.length > 240 || Boolean(section.bullets?.length && section.bullets.length > 3),
    recommendedPageRole: pageRoleForEditorialRole(section.role),
    ...(displayHeading ? { displayHeading } : {}),
    ...(sourceHeading ? { titleProvenance: "source" as const } : {}),
  };
}

export function editorialUnitsForSection(
  section: EditorialSection,
  source: UnifiedArticleContent,
): Array<{ id: string; role: "body" | "list" | "focus" | "media" | "heading" | "subtitle"; text: string; sourceBlockIds: string[]; sourceType: UnifiedArticleBlock["type"] }> {
  const sourceBlocks = new Map(source.blocks.map((block) => [block.id, block]));
  const sourceBlockIds = [...new Set(section.sourceBlockIds.filter((id) => sourceBlocks.has(id)))];
  const sourceSectionBlocks = sourceBlockIds
    .map((id) => sourceBlocks.get(id))
    .filter((block): block is UnifiedArticleBlock => Boolean(block));
  const textSourceBlockIds = sourceSectionBlocks
    .filter((block) => block.type !== "image")
    .map((block) => block.id);
  const units: Array<{ id: string; role: "body" | "list" | "focus" | "media" | "heading" | "subtitle"; text: string; sourceBlockIds: string[]; sourceType: UnifiedArticleBlock["type"] }> = [];

  if (section.body?.trim()) {
    splitEditorialBody(section.body).forEach((text, index) => {
      const matchingSourceBlock = sourceSectionBlocks.find((block) => {
        if (block.type === "list") return false;
        const sourceText = cleanPublishingText(renderBlockText(block) ?? "");
        return normalizeMeaning(sourceText).includes(normalizeMeaning(text)) || normalizeMeaning(text).includes(normalizeMeaning(sourceText));
      });
      units.push({
        id: `${section.id}:body:${index + 1}`,
        role: section.role === "warning" || section.role === "conclusion" ? "focus" : "body",
        text,
        sourceBlockIds: matchingSourceBlock ? [matchingSourceBlock.id] : textSourceBlockIds,
        sourceType: matchingSourceBlock?.type ?? sourceSectionBlocks[0]?.type ?? "paragraph",
      });
    });
  } else {
    sourceSectionBlocks.forEach((block) => {
      if (block.type === "title" || block.type === "section" || block.type === "subsection" || block.type === "divider" || block.type === "pageBreak" || block.type === "code") return;
      if (block.type === "list") {
        block.items.map(cleanPublishingText).filter(Boolean).forEach((text, index) => {
          units.push({ id: `${block.id}:item:${index + 1}`, role: "list", text, sourceBlockIds: [block.id], sourceType: block.type });
        });
        return;
      }
      const text = cleanPublishingText(renderBlockText(block) ?? "");
      if (text) units.push({ id: block.id, role: block.type === "image" ? "media" : block.type === "quote" || block.type === "golden" || block.type === "summary" || block.type === "cta" || block.type === "card" ? "focus" : block.type === "lead" ? "subtitle" : "body", text, sourceBlockIds: [block.id], sourceType: block.type });
    });
  }

  // Source list blocks are already expanded above. Do not append the same
  // items from the normalized bullets field a second time.
  const listAlreadyExpanded = !section.body?.trim() && sourceSectionBlocks.some((block) => block.type === "list");
  if (!listAlreadyExpanded) {
    const sourceList = sourceSectionBlocks.find((block): block is Extract<UnifiedArticleBlock, { type: "list" }> => block.type === "list");
    const bulletSourceBlockIds = sourceList ? [sourceList.id] : sourceBlockIds;
    section.bullets?.map(cleanPublishingText).filter(Boolean).forEach((text, index) => {
      units.push({ id: `${section.id}:bullet:${index + 1}`, role: "list", text, sourceBlockIds: bulletSourceBlockIds, sourceType: "list" });
    });
  }

  sourceSectionBlocks.filter((block) => block.type === "image").forEach((block) => {
    units.push({
      id: block.id,
      role: "media",
      text: cleanPublishingText(renderBlockText(block) ?? block.text),
      sourceBlockIds: [block.id],
      sourceType: block.type,
    });
  });

  return units.length ? units : sourceSectionBlocks.flatMap((block) => block.type === "image"
    ? [{ id: block.id, role: "media" as const, text: cleanPublishingText(block.text), sourceBlockIds: [block.id], sourceType: block.type }]
    : []);
}

function editorialSectionFromBlueprint(section: ContentSection, sourceBlocks: Map<string, UnifiedArticleBlock>): EditorialSection | undefined {
  const sourceBlockIds = [...new Set(section.sourceBlockIds.filter((id) => sourceBlocks.has(id)))];
  if (!sourceBlockIds.length) return undefined;
  const bodyParts: string[] = [];
  const bullets: string[] = [];
  for (const id of sourceBlockIds) {
    const block = sourceBlocks.get(id);
    if (!block || block.type === "title" || block.type === "section" || block.type === "subsection" || block.type === "image" || block.type === "divider" || block.type === "pageBreak" || block.type === "code") continue;
    if (block.type === "list") {
      bullets.push(...block.items.map(cleanPublishingText).filter(Boolean));
      continue;
    }
    const text = cleanPublishingText(renderBlockText(block) ?? "");
    if (text) bodyParts.push(text);
  }
  const heading = section.displayHeading?.text && (
    section.displayHeading.provenance === "source"
    || !isGenericStructureHeading(section.displayHeading.text)
  )
    ? section.displayHeading.text
    : undefined;
  return {
    id: section.id,
    role: editorialRoleForSemanticRole(section.role),
    ...(heading ? { heading } : {}),
    ...(bodyParts.length ? { body: bodyParts.join("\n\n") } : {}),
    ...(bullets.length ? { bullets } : {}),
    sourceBlockIds,
  };
}

function fallbackEditorialSection(source: UnifiedArticleContent, blueprint: ContentBlueprint): EditorialSection[] {
  const blocks = publicationBlocks(source).filter((block) => block.type !== "title" && block.type !== "image" && block.type !== "divider" && block.type !== "pageBreak" && block.type !== "code");
  const sourceBlockIds = blocks.map((block) => block.id);
  const body = blocks.map((block) => cleanPublishingText(renderBlockText(block) ?? "")).filter(Boolean).join("\n\n");
  if (!body && !sourceBlockIds.length) {
    return [{ id: "editorial-section-1", role: "claim", sourceBlockIds: [source.blocks[0]?.id ?? "source"] }];
  }
  return [{
    id: "editorial-section-1",
    role: blueprint.primaryContentType === "checklistGuide" ? "method" : "claim",
    ...(body ? { body } : {}),
    sourceBlockIds,
  }];
}

function editorialRoleForSemanticRole(role: SemanticSectionRole): EditorialSectionRole {
  if (role === "background" || role === "hook") return "context";
  if (role === "evidence" || role === "result") return "evidence";
  if (role === "example") return "example";
  if (role === "method") return "method";
  if (role === "boundary") return "warning";
  if (role === "counterArgument" || role === "conflict" || role === "problem") return "comparison";
  if (role === "conclusion" || role === "callToAction") return "conclusion";
  return "claim";
}

function semanticRoleForEditorialRole(role: EditorialSectionRole): SemanticSectionRole {
  if (role === "context") return "background";
  if (role === "evidence") return "evidence";
  if (role === "example") return "example";
  if (role === "method") return "method";
  if (role === "warning") return "boundary";
  if (role === "comparison") return "counterArgument";
  if (role === "conclusion") return "conclusion";
  return "argument";
}

function pageRoleForEditorialRole(role: EditorialSectionRole) {
  if (role === "context") return "intro" as const;
  if (role === "evidence") return "evidence" as const;
  if (role === "example") return "chapter" as const;
  if (role === "method") return "step" as const;
  if (role === "warning") return "warning" as const;
  if (role === "comparison") return "comparison" as const;
  return role === "conclusion" ? "conclusion" as const : "argument" as const;
}

function splitEditorialBody(value: string) {
  return value.split(/\n{2,}/u).map(cleanPublishingText).filter(Boolean);
}

function firstSentence(value: string) {
  return cleanPublishingText(value).split(/(?<=[。！？；])/u).find(Boolean)?.trim() || cleanPublishingText(value).slice(0, 220);
}

function containsMeaningfulText(source: UnifiedArticleContent | string, text: string) {
  const normalized = normalizeMeaning(text);
  if (normalized.length < 8) return false;
  if (typeof source === "string") return normalizeMeaning(source).includes(normalized);
  return source.blocks.some((block) => normalizeMeaning(cleanPublishingText(renderBlockText(block) ?? "")).includes(normalized));
}

function normalizeMeaning(value: string) {
  return value.replace(/[^\p{L}\p{N}]/gu, "");
}

export function sourcePositionForEditorialText(source: UnifiedArticleContent, sourceBlockIds: string[], text: string): SourcePosition {
  const sourceBlock = sourceBlockIds.map((id) => source.blocks.find((block) => block.id === id)).find(Boolean);
  if (sourceBlock) return { ...sourceBlock.source, sourceText: sourceBlock.source.sourceText || text };
  const fallback = source.blocks[0]?.source;
  return fallback ? { ...fallback, sourceText: text } : { startLine: 1, endLine: 1, startOffset: 0, endOffset: text.length, sourceText: text };
}
