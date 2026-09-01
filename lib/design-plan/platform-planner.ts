import type { UnifiedArticleBlock, UnifiedArticleContent } from "../content";
import { getContentLayout, getVisualTheme, type ContentLayoutId, type DesignScheme, type VisualThemeId } from "../design-schemes";
import type { PlatformId } from "../platforms/types";
import { cleanPublishingText, isGenericStructureHeading, publicationBlocks } from "./content-filter";
import type {
  ContentBlueprint,
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
  selection: { themeId?: VisualThemeId; contentLayoutId?: ContentLayoutId } = {},
): Record<PlatformId, PlatformDesignPlan> {
  const theme = getVisualTheme(selection.themeId ?? scheme.themeId);
  const layout = getContentLayout(selection.contentLayoutId ?? scheme.contentLayoutId);
  return {
    wechat: buildLongformPlan(source, blueprint, scheme, theme, layout, "wechat"),
    xiaohongshu: buildCardPlan(source, blueprint, scheme, theme, layout, "xiaohongshu"),
    douyinImage: buildCardPlan(source, blueprint, scheme, theme, layout, "douyinImage"),
    douyinLongform: buildLongformPlan(source, blueprint, scheme, theme, layout, "douyinLongform"),
  };
}

function buildLongformPlan(
  source: UnifiedArticleContent,
  blueprint: ContentBlueprint,
  scheme: DesignScheme,
  theme: ReturnType<typeof getVisualTheme>,
  layout: ReturnType<typeof getContentLayout>,
  platform: "wechat" | "douyinLongform",
): PlatformDesignPlan {
  const units = collectSourceUnits(source);
  const grouped = groupLongformUnits(units.flatMap((unit) => splitUnit(unit, layout.paginationRules.longformCharacterBudget[platform])));
  const pages: PagePlan[] = [];
  const title = blueprint.titleCandidates[0] || source.title || "未命名文章";
  const titleSourceId = source.blocks.find((block) => block.type === "title")?.id;
  pages.push(createPage(platform, 0, "cover", [
    plannedBlock(`${platform}:cover:title`, "title", title, titleSourceId ? [titleSourceId] : [], title === source.title ? "source" : "expressionOptimization"),
  ]));

  grouped.forEach((group, index) => {
    const kind = longformPageKind(layout.id, group, index, grouped.length);
    pages.push(createPage(platform, index + 1, kind, group));
  });

  if (blueprint.generationMode === "reachOptimized" && blueprint.openingHook && !containsText(pages, blueprint.openingHook)) {
    const hook = plannedBlock(`${platform}:opening:optimized`, "focus", blueprint.openingHook, [], "expressionOptimization");
    pages.splice(1, 0, createPage(platform, 1, "opening", [hook]));
    renumberPages(pages, platform);
  }

  return {
    schemaVersion: 1,
    platform,
    visualPresetId: scheme.id,
    themeId: theme.id,
    layoutId: layout.id,
    title,
    publishCopy: units.map((unit) => unit.text).join("\n\n"),
    palette: { primary: theme.colors.primary, secondary: theme.colors.secondary, background: theme.colors.background, text: theme.colors.text },
    typography: { ...scheme.typography, titleFamily: theme.typography.titleFamily, bodyFamily: theme.typography.bodyFamily, focusFamily: theme.typography.focusFamily },
    pages,
    exportSpec: platform === "wechat" ? { format: "html" } : { format: "text" },
  };
}

function buildCardPlan(
  source: UnifiedArticleContent,
  blueprint: ContentBlueprint,
  scheme: DesignScheme,
  theme: ReturnType<typeof getVisualTheme>,
  layout: ReturnType<typeof getContentLayout>,
  platform: "xiaohongshu" | "douyinImage",
): PlatformDesignPlan {
  const units = collectSourceUnits(source);
  const title = blueprint.titleCandidates[0] || source.title || "未命名文章";
  const titleSourceId = source.blocks.find((block) => block.type === "title")?.id;
  const coverTitle = compactCoverTitle(title, platform === "xiaohongshu" ? 16 : 14);
  const coverBlocks: PlannedContentBlock[] = [
    plannedBlock(`${platform}:cover:title`, "title", coverTitle, titleSourceId ? [titleSourceId] : [], title === source.title ? "source" : "expressionOptimization"),
  ];

  if (blueprint.generationMode === "reachOptimized" && blueprint.openingHook) {
    coverBlocks.push(plannedBlock(`${platform}:cover:hook`, "subtitle", blueprint.openingHook, [], "expressionOptimization"));
  } else {
    const teaser = units.find((unit) => unit.role !== "heading" && unit.role !== "media");
    if (teaser) {
      coverBlocks.push(plannedBlock(
        `${platform}:cover:teaser`,
        "subtitle",
        compactCoverSubtitle(teaser.text, platform === "xiaohongshu" ? 56 : 38),
        teaser.sourceBlockIds,
        "source",
      ));
    }
  }

  const seeds = packUnits(
    units,
    layout.paginationRules.cardCharacterBudget[platform],
    layout.paginationRules.cardMaxUnits[platform],
    layout.paginationRules.shortPageThreshold,
  );
  const pages: PagePlan[] = [createPage(platform, 0, "cover", coverBlocks)];
  seeds.forEach((seed, index) => {
    const kind = cardPageKind(layout.id, seed, index, seeds.length);
    pages.push(createPage(platform, index + 1, kind, seed.units));
  });

  return {
    schemaVersion: 1,
    platform,
    visualPresetId: scheme.id,
    themeId: theme.id,
    layoutId: layout.id,
    title,
    publishCopy: units.map((unit) => unit.text).join("\n\n"),
    palette: { primary: theme.colors.primary, secondary: theme.colors.secondary, background: theme.colors.background, text: theme.colors.text },
    typography: { ...scheme.typography, titleFamily: theme.typography.titleFamily, bodyFamily: theme.typography.bodyFamily, focusFamily: theme.typography.focusFamily },
    pages,
    exportSpec: platform === "xiaohongshu"
      ? { format: "png", width: 1080, height: 1440, aspectRatio: "3:4" }
      : { format: "png", width: 1080, height: 1440, aspectRatio: "3:4" },
  };
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
    const role = blockRole(block);
    units.push({ id: block.id, role, text, sourceBlockIds: [block.id], sourceType: block.type });
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

function groupLongformUnits(units: SourceUnit[]): SourceUnit[][] {
  const groups: SourceUnit[][] = [];
  let current: SourceUnit[] = [];
  for (const unit of units) {
    if (unit.role === "heading" && current.length) {
      groups.push(current);
      current = [];
    }
    current.push(unit);
  }
  if (current.length) groups.push(current);
  return groups.length ? groups : [[]];
}

function packUnits(units: SourceUnit[], characterBudget: number, maxUnits: number, shortPageThreshold: number): PageSeed[] {
  const expanded = units.flatMap((unit) => splitUnit(unit, characterBudget));
  const pages: PageSeed[] = [];
  let current: PageSeed = { units: [], characterCount: 0 };

  const push = () => {
    if (current.units.length) pages.push(current);
    current = { units: [], characterCount: 0 };
  };

  for (const unit of expanded) {
    const unitLength = unit.text.length;
    const exceeds = current.units.length > 0 && current.characterCount + unitLength > characterBudget;
    if (exceeds || current.units.length >= maxUnits) push();
    current.units.push(unit);
    current.characterCount += unitLength;
    if (unit.role === "focus" && current.characterCount >= characterBudget * 0.55) push();
  }
  push();
  if (pages.length > 1) {
    const last = pages[pages.length - 1]!;
    const previous = pages[pages.length - 2]!;
    const canMerge = last.characterCount / characterBudget < shortPageThreshold
      && previous.characterCount + last.characterCount <= characterBudget
      && previous.units.length + last.units.length <= maxUnits;
    if (canMerge) {
      previous.units.push(...last.units);
      previous.characterCount += last.characterCount;
      pages.pop();
    }
  }
  return pages;
}

function splitUnit(unit: SourceUnit, characterBudget: number): SourceUnit[] {
  if (unit.role === "heading" || unit.role === "media" || unit.text.length <= characterBudget) return [unit];
  const parts = splitTextAtBoundaries(unit.text, characterBudget);
  return parts.map((text, index) => ({ ...unit, id: `${unit.id}:part:${index + 1}`, text }));
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
      continue;
    }
    if (current && current.length + sentence.length > maxLength) {
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

function compactCoverTitle(title: string, maxLength: number) {
  const normalized = title.replace(/^#+\s*/u, "").trim();
  const firstClause = normalized.split(/[：:｜|。！？]/u)[0]?.trim();
  if (firstClause && firstClause.length >= 8 && firstClause.length <= maxLength) return firstClause;
  if (normalized.length <= maxLength) return normalized;
  return normalized.slice(0, Math.max(1, maxLength - 1)).replace(/[，、：:；;]+$/u, "").trim() + "…";
}

function compactCoverSubtitle(text: string, maxLength: number) {
  const normalized = text.replace(/\s+/gu, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  const firstSentence = normalized.split(/(?<=[。！？；])/u)[0]?.trim();
  if (firstSentence && firstSentence.length <= maxLength) return firstSentence;
  return `${normalized.slice(0, Math.max(1, maxLength - 1)).replace(/[，、：:；;]+$/u, "").trim()}…`;
}

function cardPageKind(
  variant: DesignScheme["contentLayoutId"],
  seed: PageSeed,
  index: number,
  total: number,
): PagePlanKind {
  const text = seed.units.map((unit) => unit.text).join("");
  const hasQuote = seed.units.some((unit) => unit.sourceType === "quote" || unit.sourceType === "golden");
  const hasSummary = seed.units.some((unit) => unit.sourceType === "summary" || unit.sourceType === "cta");
  if (variant === "checklist") {
    if (index === 0) return "intro";
    if (hasQuote || /注意|避坑|风险|不要|错误/u.test(text)) return "warning";
    if (hasSummary || index === total - 1) return "callToAction";
    return "step";
  }
  if (variant === "data") {
    if (index === 0) return /\d+(?:\.\d+)?\s*(?:%|％|倍|万|亿|元|人|次|个|项|条|类|月|年|天)/u.test(text) ? "keyMetric" : "evidence";
    if (index === total - 1) return /边界|范围|不能|不可|不代表|不等于|无法|仅说明|只是/u.test(text) ? "boundary" : "conclusion";
    if (/对比|相比|同比|环比|高于|低于/u.test(text)) return "comparison";
    if (/边界|范围|不能|不可|不代表|不等于|无法|仅说明|只是/u.test(text)) return "boundary";
    if (/\d+(?:\.\d+)?\s*(?:%|％|倍|万|亿|元|人|次|个|项|条|类|月|年|天)/u.test(text)) return "keyMetric";
    return "interpretation";
  }
  if (variant === "story") {
    if (index === 0) return "intro";
    if (hasSummary || index === total - 1) return "epilogue";
    if (/但是|但|问题|冲突|没想到|却/u.test(text)) return "conflict";
    if (/后来|于是|直到|转折|改变/u.test(text) || index === Math.floor(total / 2)) return "transition";
    return "chapter";
  }
  if (index === 0) return "intro";
  if (hasQuote) return "quote";
  if (hasSummary || index === total - 1) return "conclusion";
  return seed.units.some((unit) => unit.role === "heading") ? "argument" : "point";
}

function longformPageKind(
  variant: DesignScheme["contentLayoutId"],
  units: SourceUnit[],
  index: number,
  total: number,
): PagePlanKind {
  const seed = { units, characterCount: units.reduce((count, unit) => count + unit.text.length, 0) };
  const kind = cardPageKind(variant, seed, index, total);
  return kind;
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

function plannedBlock(
  id: string,
  role: PlannedBlockRole,
  text: string,
  sourceBlockIds: string[],
  provenance: PlannedContentBlock["provenance"],
): PlannedContentBlock {
  return { id, role, text, sourceBlockIds: [...sourceBlockIds], provenance };
}

function containsText(pages: PagePlan[], text: string) {
  const normalized = normalizeMeaning(text);
  return pages.some((page) => page.blocks.some((block) => normalizeMeaning(block.text) === normalized));
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
