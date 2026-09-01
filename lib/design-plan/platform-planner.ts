import type { UnifiedArticleBlock, UnifiedArticleContent } from "../content";
import { getContentLayout, getVisualTheme, type ContentLayoutId, type DesignScheme, type VisualThemeId } from "../design-schemes";
import type { PlatformId } from "../platforms/types";
import { cleanPublishingText, isGenericStructureHeading, publicationBlocks } from "./content-filter";
import { editorialSectionToContentSection, editorialUnitsForSection } from "./editorial-plan";
import type {
  ContentBlueprint,
  ContentSection,
  EditorialPlan,
  PagePlan,
  PagePlanKind,
  PlannedBlockRole,
  PlannedContentBlock,
  PlatformDesignPlan,
} from "./types";

type SourceUnit = {
  id: string;
  role: PlannedBlockRole;
  text: string;
  sourceBlockIds: string[];
  sourceType: UnifiedArticleBlock["type"];
};

type PageSeed = {
  units: SourceUnit[];
  characterCount: number;
};

export function buildPlatformDesignPlans(
  source: UnifiedArticleContent,
  blueprint: ContentBlueprint,
  scheme: DesignScheme,
  selection: { themeId?: VisualThemeId; contentLayoutId?: ContentLayoutId; editorialPlans?: Partial<Record<PlatformId, EditorialPlan>> } = {},
): Record<PlatformId, PlatformDesignPlan> {
  const theme = getVisualTheme(selection.themeId ?? scheme.themeId);
  const layout = getContentLayout(selection.contentLayoutId ?? scheme.contentLayoutId);
  return {
    wechat: buildLongformPlan(source, blueprint, scheme, theme, layout, "wechat", selection.editorialPlans?.wechat),
    xiaohongshu: buildCardPlan(source, blueprint, scheme, theme, layout, "xiaohongshu", selection.editorialPlans?.xiaohongshu),
    douyinImage: buildCardPlan(source, blueprint, scheme, theme, layout, "douyinImage", selection.editorialPlans?.douyinImage),
    douyinLongform: buildLongformPlan(source, blueprint, scheme, theme, layout, "douyinLongform", selection.editorialPlans?.douyinLongform),
  };
}

function buildLongformPlan(
  source: UnifiedArticleContent,
  blueprint: ContentBlueprint,
  scheme: DesignScheme,
  theme: ReturnType<typeof getVisualTheme>,
  layout: ReturnType<typeof getContentLayout>,
  platform: "wechat" | "douyinLongform",
  editorialPlan?: EditorialPlan,
): PlatformDesignPlan {
  const units = collectSourceUnits(source);
  const pages: PagePlan[] = [createPage(platform, 0, "cover", createCoverBlocks(source, blueprint, platform, false, undefined, editorialPlan))];
  const sections = editorialPlan
    ? editorialPlan.sections.map((section, index) => editorialSectionToContentSection(section, source, index))
    : usableSections(blueprint, units);
  const budget = layout.paginationRules.longformCharacterBudget[platform];
  const claimedSourceBlockIds = new Set<string>();

  for (const section of sections) {
    const editorialSection = editorialPlan?.sections.find((candidate) => candidate.id === section.id);
    const sectionUnits = (editorialSection ? editorialUnitsForSection(editorialSection, source) : unitsForSection(section, units))
      .filter((unit) => unit.sourceBlockIds.every((id) => !claimedSourceBlockIds.has(id)));
    sectionUnits.flatMap((unit) => unit.sourceBlockIds).forEach((id) => claimedSourceBlockIds.add(id));
    const seeds = packSectionUnits(
      sectionUnits,
      budget,
      6,
      layout.paginationRules.shortPageThreshold,
      layout.paginationRules.allowSplitLongParagraphs && section.canSplit,
    );
    const sectionHeader = sectionTitleBlock(platform, section, source);
    if (!seeds.length) {
      if (sectionHeader) pages.push(createPage(platform, pages.length, sectionPageKind(section, platform), [sectionHeader]));
      continue;
    }
    seeds.forEach((seed, index) => {
      const blocks = index === 0 && sectionHeader ? [sectionHeader, ...seed.units] : seed.units;
      pages.push(createPage(platform, pages.length, sectionPageKind(section, platform), blocks));
    });
  }

  if (blueprint.generationMode === "reachOptimized" && blueprint.openingHook && !sourceContainsText(source, blueprint.openingHook) && !containsText(pages, blueprint.openingHook)) {
    pages.splice(1, 0, createPage(platform, 1, "opening", [plannedBlock(`${platform}:opening:optimized`, "focus", blueprint.openingHook, [], "expressionOptimization")]));
    renumberPages(pages, platform);
  }

  return createPlatformPlan(source, blueprint, scheme, theme, layout.id, platform, pages, editorialPlan?.sections.flatMap((section) => [section.body ?? "", ...(section.bullets ?? [])]).filter(Boolean).join("\n\n") || units.map((unit) => unit.text).join("\n\n"), { format: platform === "wechat" ? "html" : "text" }, editorialPlan);
}

function buildCardPlan(
  source: UnifiedArticleContent,
  blueprint: ContentBlueprint,
  scheme: DesignScheme,
  theme: ReturnType<typeof getVisualTheme>,
  layout: ReturnType<typeof getContentLayout>,
  platform: "xiaohongshu" | "douyinImage",
  editorialPlan?: EditorialPlan,
): PlatformDesignPlan {
  const units = collectSourceUnits(source);
  const coverBlocks = createCoverBlocks(source, blueprint, platform, true, layout.id, editorialPlan);
  const pages: PagePlan[] = [createPage(platform, 0, "cover", coverBlocks)];
  const claimedSourceBlockIds = new Set(coverBlocks.flatMap((block) => block.sourceBlockIds));
  const semanticSections = editorialPlan
    ? editorialPlan.sections.map((section, index) => editorialSectionToContentSection(section, source, index))
    : usableSections(blueprint, units);
  const sections = compactSectionsForDouyin(
    semanticSections.filter((section, index) => {
      const editorialSection = editorialPlan?.sections[index];
      const sectionUnits = editorialSection ? editorialUnitsForSection(editorialSection, source) : unitsForSection(section, units);
      return sectionUnits.some((unit) => unit.sourceBlockIds.some((id) => !claimedSourceBlockIds.has(id)));
    }),
    platform,
  );
  const budget = layout.paginationRules.cardCharacterBudget[platform];
  const maxUnits = platform === "xiaohongshu"
    ? Math.max(2, layout.paginationRules.cardMaxUnits[platform])
    : Math.min(2, layout.paginationRules.cardMaxUnits[platform]);
  for (const [sectionIndex, section] of sections.entries()) {
    const editorialSection = editorialPlan?.sections.find((candidate) => candidate.id === section.id);
    const sectionUnits = (editorialPlan && editorialSection
      ? editorialUnitsForCardSection(section, editorialSection, editorialPlan, source)
      : unitsForSection(section, units))
      .filter((unit) => unit.sourceBlockIds.every((id) => !claimedSourceBlockIds.has(id)));
    sectionUnits.flatMap((unit) => unit.sourceBlockIds).forEach((id) => claimedSourceBlockIds.add(id));
    const seeds = packSectionUnits(
      sectionUnits,
      budget,
      maxUnits,
      layout.paginationRules.shortPageThreshold,
      layout.paginationRules.allowSplitLongParagraphs && section.canSplit,
    );
    const sectionHeader = sectionTitleBlock(platform, section, source);
    if (!seeds.length) {
      if (sectionHeader) pages.push(createPage(platform, pages.length, cardSectionPageKind(section, platform, 0, layout.id, sectionIndex, sections.length), [sectionHeader]));
      continue;
    }
    seeds.forEach((seed, index) => {
      const blocks = index === 0 && sectionHeader ? [sectionHeader, ...seed.units] : seed.units;
      pages.push(createPage(platform, pages.length, cardSectionPageKind(section, platform, index, layout.id, sectionIndex, sections.length), blocks));
    });
  }

  return createPlatformPlan(source, blueprint, scheme, theme, layout.id, platform, pages, editorialPlan?.sections.flatMap((section) => [section.body ?? "", ...(section.bullets ?? [])]).filter(Boolean).join("\n\n") || units.map((unit) => unit.text).join("\n\n"), {
    format: "png",
    width: 1080,
    height: 1440,
    aspectRatio: "3:4",
  }, editorialPlan);
}

function editorialUnitsForCardSection(
  section: ContentSection,
  primarySection: EditorialPlan["sections"][number],
  editorialPlan: EditorialPlan,
  source: UnifiedArticleContent,
) {
  const sectionSourceIds = new Set(section.sourceBlockIds);
  const matchingSections = editorialPlan.sections.filter((candidate) =>
    candidate.sourceBlockIds.some((id) => sectionSourceIds.has(id)),
  );
  if (matchingSections.length <= 1 && matchingSections[0]?.id === primarySection.id) {
    return editorialUnitsForSection(primarySection, source);
  }

  const seenSourceIds = new Set<string>();
  return matchingSections.flatMap((candidate) => editorialUnitsForSection(candidate, source)).filter((unit) => {
    const matchesSection = unit.sourceBlockIds.some((id) => sectionSourceIds.has(id));
    const isNewSource = unit.sourceBlockIds.some((id) => !seenSourceIds.has(id));
    unit.sourceBlockIds.forEach((id) => seenSourceIds.add(id));
    return matchesSection && isNewSource;
  });
}

function createPlatformPlan(
  source: UnifiedArticleContent,
  blueprint: ContentBlueprint,
  scheme: DesignScheme,
  theme: ReturnType<typeof getVisualTheme>,
  layoutId: ContentLayoutId,
  platform: PlatformId,
  pages: PagePlan[],
  publishCopy: string,
  exportSpec: PlatformDesignPlan["exportSpec"],
  editorialPlan?: EditorialPlan,
): PlatformDesignPlan {
  const title = editorialPlan?.title || blueprint.titleCandidates[0] || source.title || "未命名文章";
  return {
    schemaVersion: 1,
    platform,
    visualPresetId: scheme.id,
    themeId: theme.id,
    layoutId,
    title,
    publishCopy,
    palette: { primary: theme.colors.primary, secondary: theme.colors.secondary, background: theme.colors.background, text: theme.colors.text },
    typography: { ...scheme.typography, titleFamily: theme.typography.titleFamily, bodyFamily: theme.typography.bodyFamily, focusFamily: theme.typography.focusFamily },
    ...(editorialPlan ? { editorialPlan } : {}),
    pages,
    exportSpec,
  };
}

function usableSections(blueprint: ContentBlueprint, units: SourceUnit[]) {
  const unitIds = new Set(units.flatMap((unit) => unit.sourceBlockIds));
  const sections = blueprint.sections.filter((section) => section.sourceBlockIds.some((id) => unitIds.has(id)));
  if (sections.length) {
    // Images are intentionally excluded from semantic classification, but they
    // must stay attached to the nearest content section for preview/export.
    const assignedIds = new Set(sections.flatMap((section) => section.sourceBlockIds));
    const unassignedMediaIds = units
      .filter((unit) => unit.role === "media" && unit.sourceBlockIds.some((id) => !assignedIds.has(id)))
      .flatMap((unit) => unit.sourceBlockIds);
    if (!unassignedMediaIds.length) return sections;
    return sections.map((section, index) => index === 0
      ? { ...section, sourceBlockIds: [...new Set([...section.sourceBlockIds, ...unassignedMediaIds])] }
      : section);
  }
  return [{
    id: "section-1",
    title: "",
    role: "argument" as const,
    summary: blueprint.coreMessage,
    sourceBlockIds: units.flatMap((unit) => unit.sourceBlockIds),
    keyMessage: blueprint.coreMessage,
    importance: 0.7,
    canSplit: true,
    recommendedPageRole: "argument" as const,
  } satisfies ContentSection];
}

function compactSectionsForDouyin(sections: ContentSection[], platform: "xiaohongshu" | "douyinImage") {
  if (platform !== "douyinImage" || sections.length <= 7) return sections;

  const compacted = [...sections];
  while (compacted.length > 7) {
    const pairIndex = compacted.findIndex((section, index) => index > 0 && section.role === compacted[index - 1].role);
    if (pairIndex < 1) break;
    const previous = compacted[pairIndex - 1];
    const current = compacted[pairIndex];
    compacted.splice(pairIndex - 1, 2, mergeRelatedSections(previous, current));
  }
  return compacted;
}

function mergeRelatedSections(left: ContentSection, right: ContentSection): ContentSection {
  const displayHeading = left.displayHeading ?? right.displayHeading;
  return {
    ...left,
    title: displayHeading?.text ?? "",
    summary: cleanPublishingText(`${left.summary} ${right.summary}`).slice(0, 500),
    sourceBlockIds: [...new Set([...left.sourceBlockIds, ...right.sourceBlockIds])],
    keyMessage: cleanPublishingText(`${left.keyMessage} ${right.keyMessage}`).slice(0, 500),
    importance: Math.max(left.importance, right.importance),
    canSplit: left.canSplit || right.canSplit,
    ...(displayHeading
      ? { displayHeading, titleProvenance: "source" as const }
      : { displayHeading: undefined, titleProvenance: undefined }),
  };
}

function unitsForSection(section: ContentSection, units: SourceUnit[]) {
  const ids = new Set(section.sourceBlockIds);
  // The section header is rendered from the semantic title below. Keeping the
  // source heading in the payload would duplicate it on every first page.
  return units.filter((unit) => unit.role !== "heading" && unit.sourceBlockIds.some((id) => ids.has(id)));
}

function sectionTitleBlock(platform: PlatformId, section: ContentSection, source: UnifiedArticleContent): PlannedContentBlock | undefined {
  const displayHeading = section.displayHeading;
  if (!displayHeading?.text.trim()) return undefined;
  const sourceHeading = source.blocks.find((block) =>
    (block.type === "section" || block.type === "subsection")
    && section.sourceBlockIds.includes(block.id)
    && cleanPublishingText(block.text) === displayHeading.text,
  );
  if (displayHeading.provenance === "source" && !sourceHeading) return undefined;
  return plannedBlock(
    `${platform}:${section.id}:heading`,
    "heading",
    displayHeading.text,
    sourceHeading ? [sourceHeading.id] : [],
    displayHeading.provenance,
  );
}

function createCoverBlocks(source: UnifiedArticleContent, blueprint: ContentBlueprint, platform: PlatformId, card: boolean, layoutId?: ContentLayoutId, editorialPlan?: EditorialPlan) {
  const title = editorialPlan?.title || blueprint.titleCandidates[0] || source.title || "未命名文章";
  const titleSourceId = source.blocks.find((block) => block.type === "title")?.id;
  const coverTitle = card ? compactCoverTitle(title, platform === "xiaohongshu" ? 16 : 14) : title;
  const sourceTitle = normalizeMeaning(source.title || "");
  const normalizedCoverTitle = normalizeMeaning(coverTitle);
  const titleIsSource = normalizedCoverTitle.length > 0 && sourceTitle.includes(normalizedCoverTitle);
  const titleProvenance = titleIsSource ? "source" as const : "expressionOptimization" as const;
  const titleSourceIds = titleIsSource && titleSourceId ? [titleSourceId] : [];
  const blocks: PlannedContentBlock[] = [plannedBlock(`${platform}:cover:title`, "title", coverTitle, titleSourceIds, titleProvenance)];
  const clauses = title.split(/[：:｜|]/u).map((item) => item.trim()).filter(Boolean);
  if (card && clauses.length > 1 && clauses[0] !== coverTitle) {
    blocks.push(plannedBlock(`${platform}:cover:context`, "subtitle", clauses[0], titleSourceIds, titleProvenance));
  }
  const optimizedHook = editorialPlan?.hook || (blueprint.generationMode === "reachOptimized"
    && blueprint.openingHook
    && !sourceContainsText(source, blueprint.openingHook)
    ? blueprint.openingHook
    : undefined);
  if (card && layoutId !== "story" && layoutId !== "data" && !optimizedHook) {
    const teaserUnits = collectSourceUnits(source).filter((unit) => unit.role !== "heading" && unit.role !== "media" && unit.sourceType !== "list");
    const teaser = teaserUnits.length > 1 ? teaserUnits[0] : undefined;
    if (teaser) {
      blocks.push(plannedBlock(`${platform}:cover:teaser`, "subtitle", compactCoverSubtitle(teaser.text, 72), teaser.sourceBlockIds, "source"));
    }
  }
  if (optimizedHook) {
    blocks.push(plannedBlock(`${platform}:cover:hook`, "subtitle", compactCoverSubtitle(optimizedHook, card ? 72 : 180), [], "expressionOptimization"));
  }
  return blocks;
}

function sectionPageKind(section: ContentSection, platform: "wechat" | "douyinLongform"): PagePlanKind {
  if (platform === "douyinLongform" && section.role === "hook") return "opening";
  return section.recommendedPageRole;
}

function cardSectionPageKind(section: ContentSection, platform: "xiaohongshu" | "douyinImage", index = 0, layoutId?: ContentLayoutId, sectionIndex = 0, sectionCount = 1): PagePlanKind {
  const role = section.role;
  if (layoutId === "story") {
    if (sectionIndex === sectionCount - 1) return "epilogue";
    if (sectionIndex === 0) return "intro";
    if (sectionIndex === 1 || role === "problem" || role === "conflict" || role === "counterArgument") return "conflict";
    if (sectionIndex === sectionCount - 2) return "transition";
    return role === "example" ? "chapter" : "turning";
  }
  if (layoutId === "checklist") {
    if (sectionIndex === sectionCount - 1) return "callToAction";
    if (role === "boundary") return "warning";
    if (sectionIndex === 0) return "intro";
    if (role === "result") return "summary";
    return sectionIndex % 2 === 1 ? "step" : "action";
  }
  if (layoutId === "data") {
    if (role === "boundary" || sectionIndex === sectionCount - 1 && role === "conclusion") return "boundary";
    if (sectionIndex === 0) return "keyMetric";
    if (section.displayHeading?.text && /对比|相比|同比|环比|高于|低于/u.test(section.displayHeading.text)) return "comparison";
    if (sectionIndex === 1) return "interpretation";
    if (role === "evidence") return "keyMetric";
    if (role === "argument" || role === "counterArgument") return "interpretation";
  }
  if (layoutId === "editorial" && (role === "method" || role === "boundary")) return role === "boundary" ? "boundary" : "argument";
  if (role === "hook" || role === "background") return "intro";
  if (role === "problem" || role === "conflict" || role === "counterArgument") return "conflict";
  if (role === "method") return index === 0 ? "step" : "action";
  if (role === "boundary") return "warning";
  if (role === "result") return "summary";
  if (role === "conclusion") return platform === "douyinImage" ? "callToAction" : "conclusion";
  if (role === "evidence") return platform === "douyinImage" ? "keyMetric" : "evidence";
  if (role === "example") return "chapter";
  return platform === "douyinImage" ? "point" : "argument";
}

function collectSourceUnits(source: UnifiedArticleContent): SourceUnit[] {
  const units: SourceUnit[] = [];
  for (const block of publicationBlocks(source)) {
    if (block.type === "title" || block.type === "pageBreak" || block.type === "divider" || block.type === "code") continue;
    if (block.type === "list") {
      block.items.map(cleanPublishingText).filter(Boolean).forEach((text, index) => {
        units.push({ id: `${block.id}:item:${index}`, role: "list", text, sourceBlockIds: [block.id], sourceType: block.type });
      });
      continue;
    }
    if (block.type === "card") {
      const text = cleanPublishingText([block.title, block.body].filter(Boolean).join("："));
      if (text) units.push({ id: block.id, role: "focus", text, sourceBlockIds: [block.id], sourceType: block.type });
      continue;
    }
    const text = cleanPublishingText(block.text);
    if (!text) continue;
    units.push({ id: block.id, role: blockRole(block), text, sourceBlockIds: [block.id], sourceType: block.type });
  }
  return units;
}

function blockRole(block: Exclude<UnifiedArticleBlock, { type: "list" } | { type: "card" }>): PlannedBlockRole {
  if (block.type === "section" || block.type === "subsection") return "heading";
  if (block.type === "lead") return "subtitle";
  if (block.type === "quote" || block.type === "golden" || block.type === "summary" || block.type === "cta") return "focus";
  if (block.type === "image") return "media";
  return "body";
}

function packSectionUnits(units: SourceUnit[], characterBudget: number, maxUnits: number, shortPageThreshold: number, allowSplitLongParagraphs: boolean): PageSeed[] {
  const expanded = units.flatMap((unit) => splitUnit(unit, characterBudget, allowSplitLongParagraphs));
  const pages: PageSeed[] = [];
  let current: PageSeed = { units: [], characterCount: 0 };
  const push = () => {
    if (current.units.length) pages.push(current);
    current = { units: [], characterCount: 0 };
  };
  for (const unit of expanded) {
    const exceeds = current.units.length > 0 && current.characterCount + unit.text.length > characterBudget;
    if (exceeds || current.units.length >= maxUnits) push();
    current.units.push(unit);
    current.characterCount += unit.text.length;
    if (unit.role === "focus" && current.characterCount >= characterBudget * 0.55) push();
  }
  push();
  if (pages.length > 1) {
    const last = pages.at(-1)!;
    const previous = pages.at(-2)!;
    if (last.characterCount / characterBudget < shortPageThreshold && previous.characterCount + last.characterCount <= characterBudget && previous.units.length + last.units.length <= maxUnits) {
      previous.units.push(...last.units);
      previous.characterCount += last.characterCount;
      pages.pop();
    }
  }
  return pages;
}

function splitUnit(unit: SourceUnit, characterBudget: number, allowSplitLongParagraphs: boolean): SourceUnit[] {
  if (!allowSplitLongParagraphs || unit.role === "heading" || unit.role === "media" || unit.text.length <= characterBudget) return [unit];
  return splitTextAtBoundaries(unit.text, characterBudget).map((text, index) => ({ ...unit, id: `${unit.id}:part:${index + 1}`, text }));
}

function splitTextAtBoundaries(text: string, maxLength: number) {
  const sentences = text.split(/(?<=[。！？；])/u).filter(Boolean);
  if (sentences.length <= 1) return fixedChunks(text, maxLength);
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (sentence.length > maxLength) {
      if (current) chunks.push(current);
      chunks.push(...fixedChunks(sentence, maxLength));
      current = "";
    } else if (current && current.length + sentence.length > maxLength) {
      chunks.push(current);
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function fixedChunks(text: string, maxLength: number) {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += maxLength) chunks.push(text.slice(index, index + maxLength));
  return chunks;
}

export function compactCoverTitle(title: string, maxLength: number) {
  const normalized = title.replace(/^#+\s*/u, "").trim();
  if (normalized.length <= maxLength) return normalized;
  const clauses = normalized.split(/[：:｜|]/u).map((item) => item.trim()).filter(Boolean);
  const highValueClause = clauses.slice(1).find((clause) => /想|但|却|还是|先|后|冲突|问题|为什么|如何/u.test(clause)) || clauses.at(-1);
  if (highValueClause && highValueClause.length <= maxLength) return highValueClause;
  const firstSentence = normalized.split(/[。！？]/u)[0]?.trim();
  if (firstSentence && firstSentence.length <= maxLength) return firstSentence;
  return `${normalized.slice(0, Math.max(1, maxLength - 1)).replace(/[，、：:；;]+$/u, "").trim()}…`;
}

function compactCoverSubtitle(text: string, maxLength: number) {
  const normalized = text.replace(/\s+/gu, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  const firstSentence = normalized.split(/(?<=[。！？；])/u)[0]?.trim();
  if (firstSentence && firstSentence.length <= maxLength) return firstSentence;
  return `${normalized.slice(0, Math.max(1, maxLength - 1)).replace(/[，、：:；;]+$/u, "").trim()}…`;
}

function createPage(platform: PlatformId, index: number, kind: PagePlanKind, units: Array<SourceUnit | PlannedContentBlock>): PagePlan {
  const blocks = units.map((unit, blockIndex): PlannedContentBlock => {
    if ("provenance" in unit) return unit;
    return plannedBlock(`${platform}:${kind}:${index}:${blockIndex}`, unit.role, unit.text, unit.sourceBlockIds, "source");
  });
  return {
    id: `${platform}:page:${kind}:${index + 1}`,
    kind,
    title: blocks.find((block) => block.role === "title" || block.role === "heading")?.text,
    sourceBlockIds: [...new Set(blocks.flatMap((block) => block.sourceBlockIds))],
    blocks,
  };
}

function plannedBlock(id: string, role: PlannedBlockRole, text: string, sourceBlockIds: string[], provenance: PlannedContentBlock["provenance"]): PlannedContentBlock {
  return { id, role, text, sourceBlockIds: [...sourceBlockIds], provenance };
}

function containsText(pages: PagePlan[], text: string) {
  const normalized = normalizeMeaning(text);
  return pages.some((page) => page.blocks.some((block) => normalizeMeaning(block.text) === normalized));
}

function sourceContainsText(source: UnifiedArticleContent, text: string) {
  const normalized = normalizeMeaning(text);
  return normalized.length > 12 && source.blocks.some((block) => normalizeMeaning(cleanPublishingText(block.text)).includes(normalized));
}

function normalizeMeaning(text: string) {
  return text.replace(/[^\p{L}\p{N}]/gu, "");
}

function renumberPages(pages: PagePlan[], platform: PlatformId) {
  pages.forEach((page, index) => {
    page.id = `${platform}:page:${page.kind}:${index + 1}`;
  });
}

export function isGenericPlanHeading(text: string) {
  return isGenericStructureHeading(text);
}
