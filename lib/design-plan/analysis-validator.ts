import type { SourceSegment, UnifiedArticleContent } from "../content";
import { cleanPublishingText, publicationBlocks } from "./content-filter";
import type { ContentBlueprint, SemanticUnit } from "./types";

export type AnalysisValidation = {
  valid: boolean;
  coverageRate: number;
  missingSourceSegmentIds: string[];
  invalidSourceSegmentIds: string[];
  duplicatedBodySegmentIds: string[];
  contradictoryCounts: string[];
  unreasonableEmphasis: string[];
  unsupportedItems: string[];
  warnings: string[];
};

const NON_BODY_TYPES = new Set(["title", "heading", "divider", "pageBreak", "code", "section", "subsection"]);

/**
 * Validates semantic references independently from the syntax parser. A source
 * paragraph may be mentioned by a cover or a quote, but it can only be
 * consumed once as body content in a semantic section.
 */
export function validateAnalysisCompleteness(source: UnifiedArticleContent, blueprint: ContentBlueprint): AnalysisValidation {
  const segments = source.segments?.length ? source.segments : fallbackSegments(source);
  const blockById = new Map(source.blocks.map((block) => [block.id, block]));
  const bodySegments = segments.filter((segment) => {
    const block = blockById.get(segment.blockId);
    return block ? !NON_BODY_TYPES.has(block.type) && block.type !== "image" && Boolean(segment.text.trim()) : false;
  });
  const validBlockIds = new Set(source.blocks.map((block) => block.id));
  const segmentsByBlock = groupSegmentsByBlock(bodySegments);

  const missingSourceSegmentIds = bodySegments
    .filter((segment) => !blueprint.sections.some((section) => section.sourceBlockIds.includes(segment.blockId)))
    .map((segment) => segment.id);
  const invalidSourceSegmentIds = blueprint.sections
    .flatMap((section) => section.sourceBlockIds)
    .filter((blockId) => !validBlockIds.has(blockId))
    .concat(allSemanticUnits(blueprint).flatMap((unit) => unit.sourceBlockIds.filter((blockId) => !validBlockIds.has(blockId))))
    .flatMap((blockId) => segmentsByBlock.get(blockId)?.map((segment) => segment.id) ?? [blockId]);

  const bodySegmentOccurrences = new Map<string, number>();
  for (const section of blueprint.sections) {
    for (const blockId of section.sourceBlockIds) {
      for (const segment of segmentsByBlock.get(blockId) ?? []) {
        bodySegmentOccurrences.set(segment.id, (bodySegmentOccurrences.get(segment.id) ?? 0) + 1);
      }
    }
  }
  const duplicatedBodySegmentIds = [...bodySegmentOccurrences.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id);

  const unsupportedItems = allSemanticUnits(blueprint)
    .filter((unit) => !unit.sourceBlockIds.some((blockId) => validBlockIds.has(blockId)) || !containsSourceText(source, unit))
    .map((unit) => unit.id);
  const contradictoryCounts = allSemanticUnits(blueprint)
    .filter((unit) => blueprint.facts.some((fact) => fact.id === unit.id) && looksSubjective(unit.text))
    .map((unit) => `事实项 ${unit.id} 同时包含主观判断或建议语气`);
  const unreasonableEmphasis = blueprint.goldenSentences.length > Math.max(3, Math.ceil(Math.max(1, bodySegments.length) * 0.45))
    ? [`重点句占比过高：${blueprint.goldenSentences.length}/${Math.max(1, bodySegments.length)}`]
    : [];
  const coverageRate = bodySegments.length === 0
    ? 1
    : (bodySegments.length - missingSourceSegmentIds.length) / bodySegments.length;
  const warnings = [
    ...(segments.some((segment) => segment.order === undefined || segment.type === undefined) ? ["源文段缺少新版本顺序或类型字段，已按块级来源兼容校验。"] : []),
    ...(bodySegments.some((segment) => !segment.text.trim()) ? ["存在空源文段，未纳入正文覆盖率。"] : []),
  ];

  return {
    valid: missingSourceSegmentIds.length === 0
      && invalidSourceSegmentIds.length === 0
      && duplicatedBodySegmentIds.length === 0
      && contradictoryCounts.length === 0
      && unreasonableEmphasis.length === 0
      && unsupportedItems.length === 0,
    coverageRate: Math.max(0, Math.min(1, coverageRate)),
    missingSourceSegmentIds: unique(missingSourceSegmentIds),
    invalidSourceSegmentIds: unique(invalidSourceSegmentIds),
    duplicatedBodySegmentIds: unique(duplicatedBodySegmentIds),
    contradictoryCounts: unique(contradictoryCounts),
    unreasonableEmphasis,
    unsupportedItems: unique(unsupportedItems),
    warnings: unique(warnings),
  };
}

function allSemanticUnits(blueprint: ContentBlueprint): SemanticUnit[] {
  return [
    ...blueprint.facts,
    ...(blueprint.quantifiedDetails ?? []),
    ...blueprint.opinions,
    ...blueprint.examples,
    ...blueprint.methods,
    ...blueprint.results,
    ...blueprint.counterArguments,
    ...blueprint.boundaries,
    ...blueprint.goldenSentences,
  ];
}

function groupSegmentsByBlock(segments: SourceSegment[]) {
  const result = new Map<string, SourceSegment[]>();
  for (const segment of segments) {
    const items = result.get(segment.blockId) ?? [];
    items.push(segment);
    result.set(segment.blockId, items);
  }
  return result;
}

function fallbackSegments(source: UnifiedArticleContent): SourceSegment[] {
  let order = 0;
  return publicationBlocks(source)
    .filter((block) => !NON_BODY_TYPES.has(block.type))
    .flatMap((block) => {
      const texts = block.type === "list" ? block.items : [block.text];
      return texts.filter((text) => text.trim()).map((text) => {
        order += 1;
        return {
          id: `${block.id}:fallback:${order}`,
          blockId: block.id,
          text: cleanPublishingText(text),
          order,
          type: block.type === "list" ? "list-item" : block.type === "quote" ? "quote" : block.type === "image" ? "image" : block.type === "lead" ? "lead" : "paragraph",
          rawText: text,
          normalizedText: cleanPublishingText(text),
          sourceRange: { ...block.source, sourceText: text, start: block.source.startOffset, end: block.source.endOffset },
        } satisfies SourceSegment;
      });
    });
}

function containsSourceText(source: UnifiedArticleContent, unit: SemanticUnit) {
  const normalized = normalize(unit.text);
  const referencedText = unit.sourceBlockIds.map((id) => source.blocks.find((block) => block.id === id)?.plainText ?? "").join(" ");
  return normalized.length >= 2 && normalize(referencedText).includes(normalized);
}

function looksSubjective(text: string) {
  return /我|我们|我认为|我觉得|应该|建议|可以|不要|需要|最好|往往|通常|更合理/u.test(text);
}

function normalize(text: string) {
  return cleanPublishingText(text).replace(/[^\p{L}\p{N}]/gu, "");
}

function unique(values: string[]) {
  return [...new Set(values)];
}
