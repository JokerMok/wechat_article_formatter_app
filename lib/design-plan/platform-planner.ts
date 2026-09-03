import type { UnifiedArticleBlock, UnifiedArticleContent } from "../content";
import {
  getContentLayout,
  getDesignScheme,
  getVisualTheme,
  schemeIdForVisualThemeAndLayout,
  type ContentLayoutId,
  type DesignScheme,
  type VisualThemeId,
} from "../design-schemes";
import type { PlatformId } from "../platforms/types";
import { cleanPublishingText, isGenericStructureHeading, publicationBlocks } from "./content-filter";
import { editorialSectionToContentSection, editorialUnitsForSection } from "./editorial-plan";
import type {
  ContentBlueprint,
  ContentSection,
  ContentUnitUsage,
  EditorialPlan,
  PagePlan,
  PagePlanKind,
  PlannedBlockRole,
  PlannedContentBlock,
  PlannedSourceUnit,
  PlatformDesignPlan,
  ContentIntegrityResult,
} from "./types";

type SourceUnit = PlannedSourceUnit;

type PageSeed = {
  units: SourceUnit[];
  characterCount: number;
};

export type PlatformPlannerInput = {
  source: UnifiedArticleContent;
  blueprint: ContentBlueprint;
  scheme: DesignScheme;
  theme: ReturnType<typeof getVisualTheme>;
  layout: ReturnType<typeof getContentLayout>;
  editorialPlan?: EditorialPlan;
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
    wechat: buildWechatPlan({ source, blueprint, scheme, theme, layout, editorialPlan: selection.editorialPlans?.wechat }),
    xiaohongshu: buildXiaohongshuPlan({ source, blueprint, scheme, theme, layout, editorialPlan: selection.editorialPlans?.xiaohongshu }),
    douyinImage: buildDouyinImagePlan({ source, blueprint, scheme, theme, layout, editorialPlan: selection.editorialPlans?.douyinImage }),
    douyinLongform: buildDouyinLongformPlan({ source, blueprint, scheme, theme, layout, editorialPlan: selection.editorialPlans?.douyinLongform }),
  };
}

export function buildWechatPlan(input: PlatformPlannerInput): PlatformDesignPlan {
  const { source, blueprint, scheme, theme, layout, editorialPlan } = input;
  const units = collectSourceUnits(source);
  const sections = sectionsForPlanner(source, blueprint, units, editorialPlan);
  const pages: PagePlan[] = [createPage("wechat", 0, "cover", createCoverBlocks(source, blueprint, "wechat", false, undefined, editorialPlan))];
  const budget = Math.max(180, layout.paginationRules.longformCharacterBudget.wechat);
  const claimedUnitIds = new Set<string>();

  for (const [sectionIndex, section] of sections.entries()) {
    const editorialSection = editorialPlan?.sections.find((candidate) => candidate.id === section.id);
    const sectionUnits = (editorialSection ? editorialUnitsForSection(editorialSection, source) : unitsForSection(section, units))
      .filter((unit) => isAvailableUnit(unit, claimedUnitIds));
    markClaimedUnits(sectionUnits, claimedUnitIds);
    const seeds = packSectionUnits(
      sectionUnits,
      budget,
      6,
      layout.paginationRules.shortPageThreshold,
      layout.paginationRules.allowSplitLongParagraphs && section.canSplit,
    );
    const sectionHeader = sectionTitleBlock("wechat", section, source);
    if (!seeds.length) {
      if (sectionHeader) pages.push(createPage("wechat", pages.length, wechatPageKind(section, sectionIndex), [sectionHeader]));
      continue;
    }
    seeds.forEach((seed, index) => {
      const blocks = index === 0 && sectionHeader ? [sectionHeader, ...seed.units] : seed.units;
      pages.push(createPage("wechat", pages.length, wechatPageKind(section, sectionIndex), blocks));
    });
  }

  if (blueprint.generationMode === "reachOptimized" && blueprint.openingHook && !sourceContainsText(source, blueprint.openingHook) && !containsText(pages, blueprint.openingHook)) {
    pages.splice(1, 0, createPage("wechat", 1, "opening", [plannedBlock("wechat:opening:optimized", "focus", blueprint.openingHook, [], "expressionOptimization")]));
    renumberPages(pages, "wechat");
  }

  return createPlatformPlan(source, blueprint, scheme, theme, layout.id, "wechat", pages, publishCopyFor(units, editorialPlan), { format: "html" }, editorialPlan);
}

export function buildXiaohongshuPlan(input: PlatformPlannerInput): PlatformDesignPlan {
  const { source, blueprint, scheme, theme, layout, editorialPlan } = input;
  const units = collectSourceUnits(source);
  const sections = sectionsForPlanner(source, blueprint, units, editorialPlan);
  const pages: PagePlan[] = [createPage("xiaohongshu", 0, "cover", createCoverBlocks(source, blueprint, "xiaohongshu", true, layout.id, editorialPlan))];
  const claimedUnitIds = new Set<string>();
  // The layout catalog owns the readable capacity for each theme. A smaller
  // global cap turns ordinary paragraphs into one-card-per-sentence output.
  const budget = Math.max(180, layout.paginationRules.cardCharacterBudget.xiaohongshu);

  for (const [sectionIndex, section] of sections.entries()) {
    const editorialSection = editorialPlan?.sections.find((candidate) => candidate.id === section.id);
    const sectionUnits = (editorialSection ? editorialUnitsForCardSection(section, editorialSection, editorialPlan!, source) : unitsForSection(section, units))
      .filter((unit) => isAvailableUnit(unit, claimedUnitIds));
    markClaimedUnits(sectionUnits, claimedUnitIds);
    const seeds = packSectionUnits(
      sectionUnits,
      budget,
      layout.paginationRules.cardMaxUnits.xiaohongshu,
      layout.paginationRules.shortPageThreshold,
      true,
    );
    const sectionHeader = sectionTitleBlock("xiaohongshu", section, source);
    if (!seeds.length) {
      if (sectionHeader) pages.push(createPage("xiaohongshu", pages.length, xiaohongshuPageKind(section, sectionIndex, sections.length, layout.id), [sectionHeader]));
      continue;
    }
    seeds.forEach((seed, index) => {
      const blocks = index === 0 && sectionHeader ? [sectionHeader, ...seed.units] : seed.units;
      pages.push(createPage("xiaohongshu", pages.length, xiaohongshuPageKind(section, sectionIndex, sections.length, layout.id), blocks));
    });
  }

  return createPlatformPlan(source, blueprint, scheme, theme, layout.id, "xiaohongshu", pages, publishCopyFor(units, editorialPlan), {
    format: "png",
    width: 1080,
    height: 1440,
    aspectRatio: "3:4",
  }, editorialPlan);
}

export function buildDouyinImagePlan(input: PlatformPlannerInput): PlatformDesignPlan {
  const { source, blueprint, scheme, theme, layout, editorialPlan } = input;
  const units = collectSourceUnits(source);
  const sections = compactDouyinSections(sectionsForPlanner(source, blueprint, units, editorialPlan));
  const pages: PagePlan[] = [createPage("douyinImage", 0, "cover", createCoverBlocks(source, blueprint, "douyinImage", true, layout.id, editorialPlan))];
  const claimedUnitIds = new Set<string>();
  const budget = Math.min(170, Math.max(100, layout.paginationRules.cardCharacterBudget.douyinImage));

  for (const [sectionIndex, section] of sections.entries()) {
    const editorialSection = editorialPlan?.sections.find((candidate) => candidate.id === section.id);
    const sectionUnits = (editorialSection ? editorialUnitsForCardSection(section, editorialSection, editorialPlan!, source) : unitsForSection(section, units))
      .filter((unit) => isAvailableUnit(unit, claimedUnitIds));
    markClaimedUnits(sectionUnits, claimedUnitIds);
    const seeds = packSectionUnits(
      sectionUnits,
      budget,
      layout.paginationRules.cardMaxUnits.douyinImage,
      layout.paginationRules.shortPageThreshold,
      true,
    );
    const sectionHeader = sectionTitleBlock("douyinImage", section, source);
    if (!seeds.length) {
      if (sectionHeader) pages.push(createPage("douyinImage", pages.length, douyinImagePageKind(section, sectionIndex, sections.length, layout.id), [sectionHeader]));
      continue;
    }
    seeds.forEach((seed, pageIndex) => {
      const blocks = pageIndex === 0 && sectionHeader ? [sectionHeader, ...seed.units] : seed.units;
      pages.push(createPage("douyinImage", pages.length, douyinImagePageKind(section, sectionIndex, sections.length, layout.id), blocks));
    });
  }

  return createPlatformPlan(source, blueprint, scheme, theme, layout.id, "douyinImage", pages, publishCopyFor(units, editorialPlan), {
    format: "png",
    width: 1080,
    height: 1440,
    aspectRatio: "3:4",
  }, editorialPlan);
}

export function buildDouyinLongformPlan(input: PlatformPlannerInput): PlatformDesignPlan {
  const { source, blueprint, scheme, theme, layout, editorialPlan } = input;
  const units = collectSourceUnits(source);
  const sections = sectionsForPlanner(source, blueprint, units, editorialPlan);
  const pages: PagePlan[] = [createPage("douyinLongform", 0, "cover", createCoverBlocks(source, blueprint, "douyinLongform", false, undefined, editorialPlan))];
  const claimedUnitIds = new Set<string>();
  const budget = Math.max(132, layout.paginationRules.longformCharacterBudget.douyinLongform);

  for (const [sectionIndex, section] of sections.entries()) {
    const editorialSection = editorialPlan?.sections.find((candidate) => candidate.id === section.id);
    const sectionUnits = (editorialSection ? editorialUnitsForSection(editorialSection, source) : unitsForSection(section, units))
      .filter((unit) => isAvailableUnit(unit, claimedUnitIds));
    markClaimedUnits(sectionUnits, claimedUnitIds);
    const seeds = packSectionUnits(
      sectionUnits,
      budget,
      Math.max(3, layout.blockRules.find((rule) => rule.role === "argument")?.maxBlocks ?? 4),
      layout.paginationRules.shortPageThreshold,
      true,
    );
    const sectionHeader = sectionTitleBlock("douyinLongform", section, source);
    if (!seeds.length) {
      if (sectionHeader) pages.push(createPage("douyinLongform", pages.length, douyinLongformPageKind(section, sectionIndex), [sectionHeader]));
      continue;
    }
    seeds.forEach((seed, pageIndex) => {
      const blocks = pageIndex === 0 && sectionHeader ? [sectionHeader, ...seed.units] : seed.units;
      pages.push(createPage("douyinLongform", pages.length, douyinLongformPageKind(section, sectionIndex), blocks));
    });
  }

  if (blueprint.generationMode === "reachOptimized" && blueprint.openingHook && !sourceContainsText(source, blueprint.openingHook) && !containsText(pages, blueprint.openingHook)) {
    pages.splice(1, 0, createPage("douyinLongform", 1, "opening", [plannedBlock("douyinLongform:opening:optimized", "focus", blueprint.openingHook, [], "expressionOptimization")]));
    renumberPages(pages, "douyinLongform");
  }

  return createPlatformPlan(source, blueprint, scheme, theme, layout.id, "douyinLongform", pages, publishCopyFor(units, editorialPlan), { format: "text" }, editorialPlan);
}

function sectionsForPlanner(source: UnifiedArticleContent, blueprint: ContentBlueprint, units: SourceUnit[], editorialPlan?: EditorialPlan) {
  const sections = editorialPlan
    ? editorialPlan.sections.map((section, index) => editorialSectionToContentSection(section, source, index))
    : usableSections(blueprint, units);
  return ensureSectionCoverage(sections, units);
}

function ensureSectionCoverage(sections: ContentSection[], units: SourceUnit[]) {
  if (!sections.length) return sections;
  const sourceOrder = new Map(units.flatMap((unit, index) => unit.sourceBlockIds.map((id) => [id, index] as const)));
  const claimed = new Set(sections.flatMap((section) => section.sourceBlockIds));
  const missing = units.filter((unit) => unit.usage === "body" && unit.sourceBlockIds.some((id) => !claimed.has(id)));
  if (!missing.length) return sections;
  const next = sections.map((section) => ({ ...section, sourceBlockIds: [...section.sourceBlockIds] }));
  for (const unit of missing) {
    const unitIndex = Math.min(...unit.sourceBlockIds.map((id) => sourceOrder.get(id) ?? Number.MAX_SAFE_INTEGER));
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    next.forEach((section, sectionIndex) => {
      const sectionIndexes = section.sourceBlockIds.map((id) => sourceOrder.get(id)).filter((value): value is number => value !== undefined);
      const anchor = sectionIndexes.length ? Math.min(...sectionIndexes) : 0;
      const distance = Math.abs(anchor - unitIndex);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = sectionIndex;
      }
    });
    next[nearestIndex]!.sourceBlockIds = [...new Set([...next[nearestIndex]!.sourceBlockIds, ...unit.sourceBlockIds])];
  }
  return next;
}

function publishCopyFor(units: SourceUnit[], editorialPlan?: EditorialPlan) {
  return editorialPlan?.sections.flatMap((section) => [section.body ?? "", ...(section.bullets ?? [])]).filter(Boolean).join("\n\n") || units.map((unit) => unit.text).join("\n\n");
}

function markClaimedUnits(units: SourceUnit[], claimedUnitIds: Set<string>) {
  units.filter((unit) => unit.usage === "body").forEach((unit) => claimedUnitIds.add(sourceUnitClaimKey(unit)));
}

function wechatPageKind(section: ContentSection, sectionIndex: number): PagePlanKind {
  if (sectionIndex === 0 || section.role === "hook" || section.role === "background") return "intro";
  if (section.role === "conclusion") return "conclusion";
  if (section.role === "evidence") return "evidence";
  if (section.role === "boundary") return "boundary";
  if (section.role === "method") return "argument";
  return section.recommendedPageRole === "cover" ? "argument" : section.recommendedPageRole;
}

function xiaohongshuPageKind(section: ContentSection, sectionIndex: number, sectionCount: number, layoutId: ContentLayoutId): PagePlanKind {
  if (layoutId === "story") {
    if (sectionIndex === 0) return "intro";
    if (sectionIndex === sectionCount - 1) return "epilogue";
    if (["problem", "conflict", "counterArgument"].includes(section.role)) return "conflict";
    if (sectionIndex === sectionCount - 2) return "transition";
    return section.role === "example" ? "chapter" : "turning";
  }
  if (layoutId === "checklist") {
    if (sectionIndex === sectionCount - 1) return "callToAction";
    if (section.role === "boundary") return "warning";
    if (section.role === "method") return "step";
    if (section.role === "conclusion") return "summary";
    return sectionIndex === 0 ? "intro" : "checklist";
  }
  if (layoutId === "data") {
    if (section.role === "boundary") return "boundary";
    if (section.role === "evidence" || section.role === "result") return "keyMetric";
    if (sectionIndex === 1) return "interpretation";
    if (section.displayHeading?.text && /对比|相比|同比|环比|高于|低于/u.test(section.displayHeading.text)) return "comparison";
    return "interpretation";
  }
  if (layoutId === "editorial" && sectionIndex === sectionCount - 1) return "callToAction";
  if (section.role === "hook" || section.role === "background") return "intro";
  if (section.role === "problem" || section.role === "conflict") return "conflict";
  if (section.role === "method") return "step";
  if (section.role === "evidence") return "evidence";
  if (section.role === "boundary") return "warning";
  if (section.role === "conclusion") return "summary";
  return "argument";
}

function douyinImagePageKind(section: ContentSection, sectionIndex: number, sectionCount: number, layoutId: ContentLayoutId): PagePlanKind {
  if (layoutId === "story") {
    if (sectionIndex === 0) return "intro";
    if (sectionIndex === sectionCount - 1) return "epilogue";
    if (["problem", "conflict", "counterArgument"].includes(section.role)) return "conflict";
    if (sectionIndex === sectionCount - 2) return "transition";
    return section.role === "example" ? "chapter" : "turning";
  }
  if (layoutId === "checklist") {
    if (sectionIndex === sectionCount - 1) return "callToAction";
    if (section.role === "boundary") return "warning";
    if (section.role === "method") return "action";
    if (section.role === "conclusion") return "summary";
    return sectionIndex === 0 ? "intro" : "checklist";
  }
  if (layoutId === "data") {
    if (section.role === "boundary") return "boundary";
    if (section.role === "evidence" || section.role === "result") return "keyMetric";
    if (section.displayHeading?.text && /对比|相比|同比|环比|高于|低于/u.test(section.displayHeading.text)) return "comparison";
    return "interpretation";
  }
  if (sectionIndex === 0 || section.role === "hook" || section.role === "background") return "intro";
  if (section.role === "evidence") return "keyMetric";
  if (section.role === "method") return "action";
  if (section.role === "boundary") return "warning";
  if (section.role === "conclusion" || sectionIndex === sectionCount - 1) return "callToAction";
  if (section.role === "conflict" || section.role === "problem") return "point";
  return "point";
}

function douyinLongformPageKind(section: ContentSection, sectionIndex: number): PagePlanKind {
  if (sectionIndex === 0 || section.role === "hook") return "opening";
  if (section.role === "conflict" || section.role === "problem") return "turning";
  if (section.role === "method") return "action";
  if (section.role === "boundary") return "boundary";
  if (section.role === "conclusion") return "ending";
  return section.recommendedPageRole === "cover" ? "section" : section.recommendedPageRole;
}

function compactDouyinSections(sections: ContentSection[]) {
  const next = sections.map((section) => ({ ...section, sourceBlockIds: [...section.sourceBlockIds] }));
  while (next.length > 7) {
    const pairIndex = next.findIndex((section, index) => index > 0 && canMergeDouyinSections(next[index - 1]!, section));
    const index = pairIndex > 0 ? pairIndex : next.length - 1;
    const left = next[index - 1]!;
    const right = next[index]!;
    next.splice(index - 1, 2, {
      ...left,
      sourceBlockIds: [...new Set([...left.sourceBlockIds, ...right.sourceBlockIds])],
      summary: cleanPublishingText(`${left.summary} ${right.summary}`).slice(0, 500),
      keyMessage: cleanPublishingText(`${left.keyMessage} ${right.keyMessage}`).slice(0, 500),
      canSplit: left.canSplit || right.canSplit,
    });
  }
  return next;
}

function canMergeDouyinSections(left: ContentSection, right: ContentSection) {
  if (left.role === right.role) return true;
  return (left.role === "background" && right.role === "example")
    || (left.role === "evidence" && right.role === "argument")
    || (left.role === "result" && right.role === "conclusion")
    || (left.role === "method" && right.role === "result");
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

  const seenUnitKeys = new Set<string>();
  return matchingSections.flatMap((candidate) => editorialUnitsForSection(candidate, source)).filter((unit) => {
    const matchesSection = unit.sourceBlockIds.some((id) => sectionSourceIds.has(id));
    const unitKey = sourceUnitClaimKey(unit);
    const isNewUnit = !seenUnitKeys.has(unitKey);
    seenUnitKeys.add(unitKey);
    return matchesSection && isNewUnit;
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
  // themeId and layoutId are the persisted presentation contract. The scheme
  // field remains a compatibility hint for older consumers only.
  const compatibilityScheme = getDesignScheme(schemeIdForVisualThemeAndLayout(theme.id, layoutId));
  return {
    schemaVersion: 1,
    platform,
    visualPresetId: compatibilityScheme.id,
    themeId: theme.id,
    layoutId,
    title,
    publishCopy,
    palette: { primary: theme.colors.primary, secondary: theme.colors.secondary, background: theme.colors.background, text: theme.colors.text },
    typography: { ...compatibilityScheme.typography, titleFamily: theme.typography.titleFamily, bodyFamily: theme.typography.bodyFamily, focusFamily: theme.typography.focusFamily },
    ...(editorialPlan ? { editorialPlan } : {}),
    integrity: calculateContentIntegrity(source, pages),
    pages,
    exportSpec,
  };
}

export function calculateContentIntegrity(source: UnifiedArticleContent, pages: PagePlan[]): ContentIntegrityResult {
  const sourceUnits = collectSourceUnits(source).filter((unit) => unit.usage === "body" && unit.role !== "heading");
  const requiredSourceBlockIds = new Set(sourceUnits.flatMap((unit) => unit.sourceBlockIds));
  const bodyBlocks = pages.flatMap((page) => page.blocks).filter((block) => block.usage === "body");
  const coveredSourceBlockIds = new Set(bodyBlocks.flatMap((block) => block.sourceBlockIds));
  const missingSourceBlockIds = [...requiredSourceBlockIds].filter((id) => !coveredSourceBlockIds.has(id));
  const bodyOccurrences = new Map<string, number>();
  for (const block of bodyBlocks) {
    const key = `${[...block.sourceBlockIds].sort().join("+")}\u0000${normalizeMeaning(block.text)}`;
    bodyOccurrences.set(key, (bodyOccurrences.get(key) ?? 0) + 1);
  }
  const duplicatedBodyUnitIds = [...bodyOccurrences.entries()]
    .filter(([, count]) => count > 1)
    .map(([key]) => key.split("\u0000")[0] ?? key);
  const unresolvedEditorialUnits = sourceUnits
    .filter((unit) => !bodyBlocks.some((block) => block.sourceBlockIds.some((id) => unit.sourceBlockIds.includes(id))))
    .map((unit) => unit.unitId);
  return {
    sourceCoverage: requiredSourceBlockIds.size === 0 ? 1 : (requiredSourceBlockIds.size - missingSourceBlockIds.length) / requiredSourceBlockIds.size,
    missingSourceBlockIds,
    duplicatedBodyUnitIds: [...new Set(duplicatedBodyUnitIds)],
    unresolvedEditorialUnits: [...new Set(unresolvedEditorialUnits)],
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

function unitsForSection(section: ContentSection, units: SourceUnit[]) {
  const ids = new Set(section.sourceBlockIds);
  // The section header is rendered from the semantic title below. Keeping the
  // source heading in the payload would duplicate it on every first page.
  return units.filter((unit) => unit.role !== "heading" && unit.sourceBlockIds.some((id) => ids.has(id)));
}

function isAvailableUnit(unit: SourceUnit, claimedUnitIds: Set<string>) {
  return unit.usage !== "body" || !claimedUnitIds.has(sourceUnitClaimKey(unit));
}

function sourceUnitClaimKey(unit: SourceUnit) {
  return `${[...unit.sourceBlockIds].sort().join("+")}\u0000${normalizeMeaning(unit.text)}`;
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
  if (optimizedHook) {
    blocks.push(plannedBlock(`${platform}:cover:hook`, "subtitle", compactCoverSubtitle(optimizedHook, card ? 72 : 180), [], "expressionOptimization"));
  }
  return blocks;
}

function collectSourceUnits(source: UnifiedArticleContent): SourceUnit[] {
  const units: SourceUnit[] = [];
  for (const block of publicationBlocks(source)) {
    if (block.type === "title" || block.type === "pageBreak" || block.type === "divider" || block.type === "code") continue;
    if (block.type === "list") {
      block.items.map(cleanPublishingText).filter(Boolean).forEach((text, index) => {
        units.push({ unitId: `${block.id}:item:${index}`, role: "list", text, sourceBlockIds: [block.id], sourceType: block.type, usage: "body" });
      });
      continue;
    }
    if (block.type === "card") {
      const text = cleanPublishingText([block.title, block.body].filter(Boolean).join("："));
      if (text) units.push({ unitId: block.id, role: "focus", text, sourceBlockIds: [block.id], sourceType: block.type, usage: "body" });
      continue;
    }
    const text = cleanPublishingText(block.text);
    if (!text) continue;
    units.push({ unitId: block.id, role: blockRole(block), text, sourceBlockIds: [block.id], sourceType: block.type, usage: "body" });
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
  return splitTextAtBoundaries(unit.text, characterBudget).map((text, index) => ({ ...unit, unitId: `${unit.unitId}:part:${index + 1}`, text }));
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
    return plannedBlock(`${platform}:${kind}:${index}:${blockIndex}`, unit.role, unit.text, unit.sourceBlockIds, "source", unit.usage, unit.unitId);
  });
  return {
    id: `${platform}:page:${kind}:${index + 1}`,
    kind,
    title: blocks.find((block) => block.role === "title" || block.role === "heading")?.text,
    sourceBlockIds: [...new Set(blocks.flatMap((block) => block.sourceBlockIds))],
    blocks,
  };
}

function plannedBlock(
  id: string,
  role: PlannedBlockRole,
  text: string,
  sourceBlockIds: string[],
  provenance: PlannedContentBlock["provenance"],
  usage: ContentUnitUsage = "reference",
  unitId = id,
): PlannedContentBlock {
  return { id, unitId, role, text, sourceBlockIds: [...new Set(sourceBlockIds)], provenance, usage };
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
