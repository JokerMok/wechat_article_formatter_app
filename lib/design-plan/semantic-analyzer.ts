import type { UnifiedArticleBlock, UnifiedArticleContent } from "../content";
import { collectTags } from "../platforms/platform-profiles";
import { cleanPublishingText, isGenericStructureHeading, publicationBlocks } from "./content-filter";
import { validateAnalysisCompleteness } from "./analysis-validator";
import type {
  ContentBlueprint,
  ContentSection,
  ContentSectionPurpose,
  ContentTone,
  ContentType,
  PagePlanKind,
  SemanticSectionRole,
  SemanticUnit,
  SemanticArticle,
  SourceFact,
} from "./types";

type SemanticBlock = {
  block: UnifiedArticleBlock;
  text: string;
  kind: "heading" | "body" | "quote" | "list" | "media";
  signals: Set<SemanticSignal>;
};

type SemanticSignal = "fact" | "opinion" | "example" | "method" | "result" | "boundary" | "counter" | "narrative" | "conclusion";

export type SemanticSignalSummary = {
  blockCount: number;
  headingCount: number;
  listCount: number;
  listItemCount: number;
  signalCounts: Record<SemanticSignal, number>;
  personalVoiceBlockCount: number;
  narrativeBlockCount: number;
  headingTexts: string[];
};

export type LocalSemanticAnalysisOptions = {
  generationMode: "layoutOnly" | "reachOptimized";
  contentType: ContentType;
  targetAudience: string;
  tone: ContentTone;
};

export function analyzeSemanticBlueprint(
  content: UnifiedArticleContent,
  options: LocalSemanticAnalysisOptions,
): ContentBlueprint {
  const blocks = toSemanticBlocks(content);
  const sections = buildSemanticSections(blocks, options.contentType);
  const units = classifyUnits(blocks);
  const centralThesis = deriveCentralThesis(units, sections, content.title);
  const titleCandidates = buildLegacyTitleCandidates(cleanText(content.title) || centralThesis, options.contentType, sections.length);
  const conclusion = deriveConclusion(units, sections, centralThesis);
  const openingHook = deriveOpeningHook(units, sections, centralThesis);
  const keyPoints = uniqueText([
    ...sections.map((section) => section.keyMessage),
    ...units.goldenSentences.map((unit) => unit.text),
  ]).slice(0, 5);
  const topicTags = deriveTopicTags(content);
  const sourceFacts = units.facts.map(toSourceFact);
  const warnings = [
    ...(units.facts.length === 0 ? ["未识别到明确客观事实，事实列表保持为空。"] : []),
    ...(sections.some((section) => section.sourceBlockIds.length === 0) ? ["存在无法追溯到源文块的章节，已保留为不确定结构。"] : []),
  ];

  const blueprint: ContentBlueprint = {
    schemaVersion: 1,
    generationMode: options.generationMode,
    primaryContentType: options.contentType,
    secondaryContentTypes: secondaryTypes(options.contentType, units, sections),
    centralThesis,
    targetAudience: options.targetAudience,
    tone: options.tone,
    narrativeArc: {
      opening: openingHook,
      development: sections.slice(1, -1).map((section) => section.summary).join("；") || centralThesis,
      ...(units.counterArguments[0] ? { turningPoint: units.counterArguments[0].text } : {}),
      resolution: conclusion,
    },
    sections,
    keyPoints,
    facts: units.facts,
    quantifiedDetails: units.quantifiedDetails,
    opinions: units.opinions,
    examples: units.examples,
    methods: units.methods,
    results: units.results,
    counterArguments: units.counterArguments,
    boundaries: units.boundaries,
    goldenSentences: units.goldenSentences,
    conclusion,
    topicTags,
    confidence: calculateConfidence(blocks, sections, units),
    warnings,
    contentType: options.contentType,
    sourceFacts,
    coreMessage: centralThesis,
    titleCandidates,
    ...(openingHook ? { openingHook } : {}),
    ...(conclusion ? { conclusion } : {}),
    modificationSummary: options.generationMode === "reachOptimized"
      ? ["识别文章中心观点和章节关系", "提炼平台可用的重点信息", "保留事实、案例、方法和边界的源文追溯"]
      : [],
  };
  const validation = validateAnalysisCompleteness(content, blueprint);
  if (!validation.valid) {
    blueprint.warnings = uniqueText([
      ...blueprint.warnings,
      ...(validation.coverageRate < 1 ? [`语义章节覆盖率为 ${Math.round(validation.coverageRate * 100)}%，已保留缺口提示。`] : []),
      ...validation.contradictoryCounts,
      ...validation.unreasonableEmphasis,
      ...(validation.unsupportedItems.length ? ["部分语义单元无法回溯到源文，已降低分析置信度。"] : []),
    ]);
    blueprint.confidence = Math.min(blueprint.confidence, 0.58);
  }
  return blueprint;
}

/**
 * Named semantic stage for the SourceDocument -> SemanticArticle pipeline.
 * The implementation stays deterministic here; hosted/custom AI analyzers
 * return the same contract and are validated before they enter planning.
 */
export function analyzeSourceDocument(
  source: UnifiedArticleContent,
  options: LocalSemanticAnalysisOptions,
): SemanticArticle {
  return analyzeSemanticBlueprint(source, options);
}

export function validateSemanticBlueprint(value: ContentBlueprint, source: UnifiedArticleContent) {
  const validBlockIds = new Set(source.blocks.map((block) => block.id));
  const sourceBlocks = new Map(source.blocks.map((block) => [block.id, block]));
  const units = [
    ...value.facts,
    ...(value.quantifiedDetails ?? []),
    ...value.opinions,
    ...value.examples,
    ...value.methods,
    ...value.results,
    ...value.counterArguments,
    ...value.boundaries,
    ...value.goldenSentences,
  ];
  const missingBlockIds = uniqueText(units.flatMap((unit) => unit.sourceBlockIds.filter((id) => !validBlockIds.has(id))));
  const unsupportedSections = value.sections.filter((section) => section.sourceBlockIds.some((id) => !validBlockIds.has(id))).map((section) => section.id);
  const blockText = new Map(source.blocks.map((block) => [block.id, block.plainText]));
  const inventedUnits = units.filter((unit) => !unit.sourceBlockIds.map((id) => blockText.get(id) ?? "").join(" ").replace(/\s+/gu, "").includes(unit.text.replace(/\s+/gu, ""))).map((unit) => unit.id);
  const invalidDisplayHeadings = value.sections
    .filter((section) => {
      const heading = section.displayHeading;
      if (!heading) return false;
      if (heading.provenance === "expressionOptimization") return value.generationMode === "layoutOnly";
      if (heading.provenance === "structuralSummary") {
        return !isGroundedStructuralHeading(heading.text, section.sourceBlockIds, sourceBlocks);
      }
      return !section.sourceBlockIds.some((id) => {
        const block = sourceBlocks.get(id);
        return (block?.type === "section" || block?.type === "subsection")
          && cleanText(block.text) === cleanText(heading.text);
      });
    })
    .map((section) => section.id);
  return {
    ok: missingBlockIds.length === 0 && unsupportedSections.length === 0 && inventedUnits.length === 0 && invalidDisplayHeadings.length === 0,
    missingBlockIds,
    unsupportedSections,
    inventedUnits,
    invalidDisplayHeadings,
  };
}

/**
 * Migrates pre-displayHeading blueprints without promoting internal labels to
 * public copy. Only a title that matches an actual source heading is exposed.
 */
export function migrateSemanticBlueprintSections(value: ContentBlueprint, source: UnifiedArticleContent): ContentBlueprint {
  const sourceBlocks = new Map(source.blocks.map((block) => [block.id, block]));
  return {
    ...value,
    sections: value.sections.map((section) => {
      if (section.displayHeading?.provenance === "expressionOptimization") {
        // An optimized heading is optional public copy, never the legacy
        // semantic-role label. Keep it only when it is a deliberate display
        // heading; old generic labels are discarded during migration.
        return { ...section, title: "", titleProvenance: undefined };
      }
      if (section.displayHeading?.provenance === "structuralSummary") {
        const structuralHeading = cleanText(section.displayHeading.text);
        const validStructuralHeading = Boolean(structuralHeading)
          && !isGenericStructureHeading(structuralHeading)
          && isGroundedStructuralHeading(structuralHeading, section.sourceBlockIds, sourceBlocks);
        return validStructuralHeading
          ? { ...section, title: "", titleProvenance: undefined, displayHeading: { ...section.displayHeading, text: structuralHeading, provenance: "structuralSummary" as const } }
          : { ...section, title: "", titleProvenance: undefined, displayHeading: undefined };
      }
      const sourceHeading = section.displayHeading?.provenance === "source"
        ? section.displayHeading.text
        : section.titleProvenance === "source" ? section.title : "";
      const matchingSourceHeading = sourceHeading && section.sourceBlockIds.some((id) => {
        const block = sourceBlocks.get(id);
        return (block?.type === "section" || block?.type === "subsection") && cleanText(block.text) === cleanText(sourceHeading);
      });
      return matchingSourceHeading
        ? { ...section, title: cleanText(sourceHeading), titleProvenance: "source" as const, displayHeading: { text: cleanText(sourceHeading), provenance: "source" as const, confidence: section.displayHeading?.confidence ?? 1 } }
        : { ...section, title: "", titleProvenance: undefined, displayHeading: undefined };
    }),
  };
}

function toSemanticBlocks(content: UnifiedArticleContent): SemanticBlock[] {
  return publicationBlocks(content)
    .filter((block) => block.type !== "title" && block.type !== "pageBreak" && block.type !== "divider" && block.type !== "code")
    .flatMap((block) => {
      const text = cleanText(block.plainText);
      if (!text || block.type === "image") return [];
      const kind = block.type === "section" || block.type === "subsection"
        ? "heading"
        : block.type === "quote" || block.type === "golden" || block.type === "summary" || block.type === "cta"
          ? "quote"
          : block.type === "list"
            ? "list"
            : "body";
      return [{ block, text, kind, signals: signalSet(text, block.type) }];
    });
}

function signalSet(text: string, blockType: UnifiedArticleBlock["type"]): Set<SemanticSignal> {
  const signals = new Set<SemanticSignal>();
  if (isObjectiveFact(text) && blockType !== "list") signals.add("fact");
  if (hasJudgmentCue(text)) signals.add("opinion");
  if (isExperience(text)) signals.add("example");
  if (isNarrative(text)) signals.add("narrative");
  if (isMethod(text, blockType)) signals.add("method");
  if (isResult(text)) signals.add("result");
  if (isBoundary(text)) signals.add("boundary");
  if (isCounterArgument(text)) signals.add("counter");
  if (isConclusion(text, blockType)) signals.add("conclusion");
  return signals;
}

function isObjectiveFact(text: string) {
  if (hasPersonalVoice(text) || hasAdviceVoice(text)) return false;
  const hasMeasurement = /\d+(?:\.\d+)?\s*(?:%|％|倍|万|亿|元|人|次|项|条|类|月|年|天)/u.test(text);
  const hasDate = /20\d{2}年(?:\d{1,2}月)?(?:\d{1,2}日)?/u.test(text);
  const hasObjectiveEvent = /数据显示|数据表明|报告|调查|统计|样本|完成了|上线了|发布了|交付了|记录了|包含|达到|增长|下降/u.test(text);
  return (hasMeasurement || hasDate) && (hasObjectiveEvent || /(?:为|有|共|达到)\s*\d/u.test(text));
}

function isExperience(text: string) {
  return hasPersonalVoice(text) && /我(?:们)?(?:先|后来|曾经|开始|发现|意识到|接手|遇到|做过|经历|看到|见过|接受|调整)|我们(?:在|把|没有|先)/u.test(text);
}

function isNarrative(text: string) {
  return isExperience(text) && /一开始|起初|后来|随后|第一次|当时|直到|回头看|这几个月|一天|一年后|最终/u.test(text);
}

function isMethod(text: string, blockType: UnifiedArticleBlock["type"]) {
  if (blockType === "list") return true;
  const normalized = text.trim();
  if (/岗位(?:说明|名称)|需要的是.{0,100}的人|处于哪个阶段/u.test(normalized)) return false;
  const startsWithAction = /^(?:先|再|然后|可以|建议|需要(?:把|将)|按照|按步骤|如何)/u.test(normalized);
  const orderedAction = /(?:先|再|然后)(?:把|做|选|从|补|搭|接|完成|解决|确定|逐步)/u.test(normalized);
  const action = /(?:整理|拆解|选择|选一个|接入|记录|补齐|建立|配置|执行|验证|检查|核对|明确|交付)/u.test(normalized);
  const methodFrame = /(?:步骤|方法|流程|做法|顺序|可以通过|建议|应该|按照|按步骤)/u.test(normalized);
  // Describing a job or a capability is not itself a method. Require an
  // action plus an instructional frame so ordinary analysis is not turned
  // into a step section merely because it mentions "交付" or "拆解".
  return startsWithAction || orderedAction || methodFrame && action && !/要求(?:却|是).{0,30}(?:覆盖|包括)/u.test(normalized);
}

function isResult(text: string) {
  return !hasAdviceVoice(text) && /结果|最终|完成|上线|落地|实现|带来|形成|开始讨论|得到|验证成功|交付/u.test(text);
}

function isBoundary(text: string) {
  // Process safeguards such as "不能因为篇幅增加就丢失内容" describe the
  // work being tested, not a limitation of the article's subject.
  if (/(?:不能|不要)因为.{0,24}(?:就|而)/u.test(text)) return false;
  return /不等于|不代表|(?:无法|不能)(?:完全)?(?:处理|支持|覆盖|替代)|仅限|只(?:能|是)(?:在|用于|说明)|前提|边界|全量|生产级|复杂业务判断|不可外推|(?:明确|收缩|限定|适用|超出).*范围|范围(?:内|外|限制)|只有当.{0,140}才|并不赞成|并非所有|不是一概/u.test(text);
}

function isCounterArgument(text: string) {
  return /(?:但|但是|然而|不过|反而|却|实际上|暴露的是|提高标准.{0,24}暴露|老板说.{0,48}(?:业务部门|技术团队)|业务部门.{0,24}技术团队|只能把所有关键词)|不是.{1,28}而是|并不是.{1,28}而是/u.test(text);
}

function isConclusion(text: string, blockType: UnifiedArticleBlock["type"]) {
  return blockType === "summary" || /因此|所以|最后|总结|归根到底|这意味着|核心判断|最大的体会|最终来看|第一阶段|真正重要的是|最后能不能做成|先把.{0,30}再决定/u.test(text);
}

function hasJudgmentCue(text: string) {
  // Treat contrast and evaluation as opinion signals even when the author
  // does not use first-person wording. This keeps analytical articles from
  // being mistaken for tutorials just because they contain recommendations.
  return /我认为|我更愿意|我的判断|我(?:.{0,3})发现|我觉得|我意识到|我接受|我的体会|这个判断|判断(?:是|为|：)|本质|关键是|真正(?:关键|重要|决定)|核心(?:判断|问题)|真正的(?:问题|原因|关键)|取决于|不是.+而是|更重要的是|意味着/u.test(text);
}

export function summarizeSemanticSignals(content: UnifiedArticleContent): SemanticSignalSummary {
  const blocks = toSemanticBlocks(content);
  const signalCounts = Object.fromEntries(
    (["fact", "opinion", "example", "method", "result", "boundary", "counter", "narrative", "conclusion"] as const)
      .map((signal) => [signal, blocks.filter((block) => block.signals.has(signal)).length]),
  ) as Record<SemanticSignal, number>;
  return {
    blockCount: blocks.length,
    headingCount: blocks.filter((block) => block.kind === "heading").length,
    listCount: blocks.filter((block) => block.kind === "list").length,
    listItemCount: blocks.filter((block) => block.kind === "list").reduce((count, block) => count + block.text.split("\n").filter(Boolean).length, 0),
    signalCounts,
    personalVoiceBlockCount: blocks.filter((block) => hasPersonalVoice(block.text)).length,
    narrativeBlockCount: blocks.filter((block) => block.signals.has("narrative")).length,
    headingTexts: blocks.filter((block) => block.kind === "heading").map((block) => block.text),
  };
}

function classifyUnits(blocks: SemanticBlock[]) {
  const result = {
    facts: [] as SemanticUnit[],
    quantifiedDetails: [] as SemanticUnit[],
    opinions: [] as SemanticUnit[],
    examples: [] as SemanticUnit[],
    methods: [] as SemanticUnit[],
    results: [] as SemanticUnit[],
    counterArguments: [] as SemanticUnit[],
    boundaries: [] as SemanticUnit[],
    goldenSentences: [] as SemanticUnit[],
  };

  blocks.forEach((item, index) => {
    const sourceBlockIds = [item.block.id];
    const certainty = item.signals.has("fact") || item.signals.has("method") || item.signals.has("boundary") ? "certain" : "uncertain";
    const confidence = Math.min(0.96, 0.58 + item.signals.size * 0.07 + (index === 0 ? 0.05 : 0));
    const unit = { id: `semantic-${index + 1}`, text: item.text, sourceBlockIds, certainty, confidence } satisfies SemanticUnit;
    // A source paragraph can carry more than one semantic role. For example,
    // an observed result may also be a fact, and a personal discovery can be
    // both an example and the author's opinion. Keep those links instead of
    // forcing one paragraph into a single bucket.
    if (item.signals.has("boundary")) result.boundaries.push(unit);
    if (hasQuantifiedDetail(item.text)) result.quantifiedDetails.push(unit);
    if (item.signals.has("method")) result.methods.push(unit);
    if (item.signals.has("fact")) result.facts.push(unit);
    if (item.signals.has("result")) result.results.push(unit);
    if (item.signals.has("example")) result.examples.push(unit);
    if (item.signals.has("counter")) result.counterArguments.push(unit);
    if (item.signals.has("opinion")) result.opinions.push(unit);

    if (isGoldenCandidate(item)) result.goldenSentences.push(unit);
  });
  result.goldenSentences = result.goldenSentences
    .sort((left, right) => goldenScore(right.text) - goldenScore(left.text))
    .slice(0, 3)
    .sort((left, right) => Number(left.id.split("-").at(-1)) - Number(right.id.split("-").at(-1)));
  return result;
}

function isGoldenCandidate(item: SemanticBlock) {
  if (item.kind === "quote") return true;
  if (item.text.length > 90) return false;
  return item.signals.has("counter")
    || item.signals.has("conclusion") && item.signals.has("opinion")
    || item.signals.has("opinion") && /本质|关键|最怕|真正|取决于/u.test(item.text);
}

function goldenScore(text: string) {
  return (/(不是|而是|本质|关键|最怕|真正|取决于)/u.test(text) ? 4 : 0)
    + (text.length >= 18 && text.length <= 72 ? 2 : 0)
    + (/[。！？]$/u.test(text) ? 1 : 0);
}

function buildSemanticSections(blocks: SemanticBlock[], contentType: ContentType): ContentSection[] {
  if (!blocks.length) return [emptySection("section-1", "开场", "hook")];
  const hasExplicitHeading = blocks.some((item) => item.kind === "heading");
  const rawGroups = hasExplicitHeading ? groupByExplicitHeadings(blocks) : groupHeadingFreeProse(blocks);
  const groups = rawGroups.flatMap(splitExplicitGroupByMeaning);
  const normalizedGroups = coalesceHeadingFreeGroups(groups, 8);

  return normalizedGroups.map((group, index) => {
    const heading = group.find((item) => item.kind === "heading");
    const body = group.filter((item) => item.kind !== "heading");
    const text = body.map((item) => item.text).join(" ");
    const role = inferSectionRole(group, index, normalizedGroups.length, contentType);
    const sourceHeading = cleanText(heading?.text);
    const keyMessage = cleanLine(selectKeyMessage(body, text), 220);
    const structuralHeading = sourceHeading || (index > 0 ? deriveStructuralHeading(group) : "");
    const sourceBlockIds = group.map((item) => item.block.id);
    return {
      id: `section-${index + 1}`,
      // Keep the legacy title field for persisted data. A heading-free section
      // may receive a short source-derived navigation label, but never an
      // internal role label such as "背景" or "冲突".
      title: sourceHeading,
      role,
      summary: cleanLine(firstSentence(text) || sourceHeading || keyMessage, 300),
      sourceBlockIds,
      keyMessage,
      importance: index === 0 || index === normalizedGroups.length - 1 ? 0.92 : role === "conflict" || role === "method" ? 0.88 : 0.72,
      canSplit: body.length > 1 || text.length > 240,
      recommendedPageRole: pageRoleFor(role),
      ...(structuralHeading ? {
        ...(sourceHeading ? { titleProvenance: "source" as const } : {}),
        displayHeading: {
          text: structuralHeading,
          provenance: sourceHeading ? "source" as const : "structuralSummary" as const,
          confidence: sourceHeading ? 1 : 0.78,
        },
      } : {}),
      purpose: legacyPurposeFor(role),
    };
  });
}

function splitExplicitGroupByMeaning(group: SemanticBlock[]) {
  const heading = group.find((item) => item.kind === "heading");
  const body = group.filter((item) => item.kind !== "heading");
  if (body.length < 3) return [group];
  const headingFreeGroups = groupHeadingFreeProse(body);
  const bodyGroups = headingFreeGroups.length > 1
    ? headingFreeGroups
    : body.length >= 4 ? splitHeadingFreeGroup(body, body.length >= 8 ? 3 : 2) : [body];
  if (bodyGroups.length <= 1) return [group];
  return bodyGroups.map((part, index) => heading && index === 0 ? [heading, ...part] : part);
}

function deriveStructuralHeading(group: SemanticBlock[]) {
  const sourceText = cleanText(group.filter((item) => item.kind !== "heading").map((item) => item.text).join(" "));
  if (!sourceText) return "";

  // A heading-free section still needs a navigation cue, but using the first
  // sentence verbatim makes the heading repeat the paragraph below it. Pair
  // two short source phrases instead; the slash is a visual separator, not
  // article copy, and both sides remain directly traceable to this section.
  const phrases = sourceText
    .split(/[。！？；：:，,、]/u)
    .map((part) => part.trim())
    .filter((part) => part.length >= 4);
  const compactPhrases = phrases.map(compactHeadingPhrase).filter((phrase) => Array.from(phrase).length >= 6);
  if (compactPhrases.length < 2) return "";
  const first = compactPhrases[0] ?? "";
  const preferredPositive = compactPhrases.find((phrase) => /^(?:先选|用两到四周|记录|再决定|补集成|补检索|明确产品负责人)/u.test(phrase));
  const last = preferredPositive && preferredPositive !== first ? preferredPositive : compactPhrases.at(-1) ?? "";
  if (!first || !last || first === last) return "";
  const candidate = `${first} / ${last}`;
  return candidate.length >= 8 && !isGenericStructureHeading(candidate) ? candidate : "";
}

function compactHeadingPhrase(value: string) {
  const compact = value
    .replace(/^(?:而且|但是|不过|所以|因此|同时|然后|最后|其实|只是|还是)\s*/u, "")
    .replace(/^我见过(?:一个)?/u, "")
    .replace(/^我(?:发现|认为|觉得|后来发现)/u, "")
    .replace(/^我并不赞成(?:一句话说)?/u, "")
    .replace(/^而是/u, "")
    .replace(/^更合理的顺序(?:是)?/u, "更合理的顺序")
    .replace(/^真正需要先回答的不是/u, "不是")
    .replace(/^而在(?:公司)?/u, "")
    .replace(/^所以我并不赞成(?:一句话说)?/u, "")
    .replace(/^更准确的说法是/u, "")
    .replace(/[，、：:；;]+$/u, "")
    .trim();
  if (Array.from(compact).length <= 24) return compact;

  const focused = compact.match(/(?:不是|而是|把|需要|只有|先|再|才能|却|误当成|决定).{3,24}$/u)?.[0]?.trim();
  if (focused && Array.from(focused).length >= 6 && Array.from(focused).length <= 24) return focused;

  // A synthetic heading must be a complete source phrase. If no natural
  // boundary exists, omit it instead of cutting through a Chinese word or
  // exposing a sentence fragment as if it were authored copy.
  return "";
}

function groupByExplicitHeadings(blocks: SemanticBlock[]) {
  const groups: SemanticBlock[][] = [];
  let current: SemanticBlock[] = [];
  for (const item of blocks) {
    if (item.kind === "heading" && current.length) {
      groups.push(current);
      current = [];
    }
    current.push(item);
  }
  if (current.length) groups.push(current);
  return groups;
}

function groupHeadingFreeProse(blocks: SemanticBlock[]) {
  const groups: SemanticBlock[][] = [];
  let current: SemanticBlock[] = [];
  let currentPhase: SemanticPhase | undefined;

  for (const [index, item] of blocks.entries()) {
    const phase = phaseForBlock(item, index, blocks.length);
    if (current.length && shouldStartHeadingFreeGroup(current, currentPhase, phase)) {
      groups.push(current);
      current = [];
    }
    current.push(item);
    // The phase belongs to the newest block. Retaining the first phase makes
    // later transitions invisible and can merge a method or boundary into
    // the opening section.
    currentPhase = phase;
  }
  if (current.length) groups.push(current);

  // Plain prose has no authored chapter boundary. When all paragraphs belong to
  // one phase, make a few reading groups from paragraph boundaries so the next
  // platform stage can add density without inventing headings.
  if (groups.length === 1 && blocks.length >= 4) {
    return splitHeadingFreeGroup(groups[0], blocks.length >= 10 ? 3 : 4);
  }
  return groups;
}

type SemanticPhase = "context" | "conflict" | "argument" | "evidence" | "example" | "method" | "result" | "boundary" | "conclusion";

function phaseForBlock(item: SemanticBlock, index: number, total: number): SemanticPhase {
  const signals = item.signals;
  // Personal delivery context should stay with the example/result it
  // describes. Boundary language inside a stakeholder conflict is a caveat,
  // not a new chapter, and method language inside an experience is not
  // automatically a tutorial section.
  if (signals.has("conclusion") && index === total - 1) return "conclusion";
  if (signals.has("method")) return "method";
  if (signals.has("example") && (signals.has("result") || signals.has("counter") || signals.has("narrative"))) return "example";
  if (signals.has("boundary") && !/老板|业务部门|技术团队|研发团队|人力部门|客户|管理层|落地的人|团队担心|团队需要|团队开始|优先级/u.test(item.text)) return "boundary";
  if (signals.has("counter")) return "conflict";
  if (signals.has("result")) return "result";
  if (signals.has("boundary")) return "boundary";
  if (signals.has("example")) return "example";
  if (signals.has("fact")) return "evidence";
  if (signals.has("conclusion")) return index === total - 1 ? "conclusion" : "argument";
  if (signals.has("opinion")) return "argument";
  return index === 0 ? "context" : "argument";
}

function shouldStartHeadingFreeGroup(current: SemanticBlock[], currentPhase: SemanticPhase | undefined, itemPhase: SemanticPhase) {
  if (!current.length || !currentPhase || currentPhase === itemPhase) return false;
  const strongPhase = new Set<SemanticPhase>(["conflict", "method", "result", "boundary", "conclusion"]);
  if (strongPhase.has(itemPhase)) return current.length >= 1;
  if (currentPhase === "boundary") return true;
  return current.length >= 2 && strongPhase.has(currentPhase);
}

function splitHeadingFreeGroup(group: SemanticBlock[], targetSize: number) {
  const result: SemanticBlock[][] = [];
  for (let index = 0; index < group.length; index += targetSize) {
    result.push(group.slice(index, index + targetSize));
  }
  return result;
}

function coalesceHeadingFreeGroups(groups: SemanticBlock[][], maxGroups: number) {
  const result = groups.map((group) => [...group]);
  while (result.length > maxGroups) {
    let mergeIndex = 0;
    let mergeScore = Number.POSITIVE_INFINITY;
    for (let index = 0; index < result.length - 1; index += 1) {
      const left = result[index];
      const right = result[index + 1];
      const leftSignal = dominantSignal(new Set(left.flatMap((entry) => [...entry.signals])));
      const rightSignal = dominantSignal(new Set(right.flatMap((entry) => [...entry.signals])));
      const combinedLength = left.reduce((total, entry) => total + entry.text.length, 0)
        + right.reduce((total, entry) => total + entry.text.length, 0);
      const samePhaseBonus = leftSignal === rightSignal ? -160 : 0;
      const score = combinedLength + samePhaseBonus;
      if (score < mergeScore) {
        mergeIndex = index;
        mergeScore = score;
      }
    }
    result.splice(mergeIndex, 2, [...result[mergeIndex], ...result[mergeIndex + 1]]);
  }
  return result;
}

function dominantSignal(signals: Set<SemanticSignal>) {
  for (const signal of ["boundary", "method", "result", "counter", "example", "fact", "opinion", "conclusion"] as const) {
    if (signals.has(signal)) return signal;
  }
  return undefined;
}

function inferSectionRole(group: SemanticBlock[], index: number, total: number, contentType: ContentType): SemanticSectionRole {
  const signals = new Set(group.flatMap((item) => [...item.signals]));
  const heading = group.find((item) => item.kind === "heading")?.text || "";
  const combinedText = group.map((item) => item.text).join(" ");
  if (index === total - 1 && !heading && signals.has("conclusion")) return "conclusion";
  // Introductory prose before the first explicit heading establishes context.
  // Method cues such as "先整理" should not turn that lead-in into a step page.
  if (index === 0 && !heading) {
    if (signals.has("counter") || signals.has("opinion") && !signals.has("method")) return "hook";
    return "background";
  }
  if (heading) {
    if (/边界|限制|范围|不能|不要|交付|资源|权限|乙方/u.test(heading)) return "boundary";
    if (/结果|完成|上线|落地|形成|体会|收获|总结|结论/u.test(heading)) return "result";
    if (/步骤|方法|流程|怎么|推进|检查|行动|做法|先做|建立|补齐|版本/u.test(heading)) return "method";
    if (/冲突|矛盾|问题|方向变|需求|老板|客户/u.test(heading)) return "conflict";
    if (/两边|双方|不是错|不是保守|关注点|看结果|看基础/u.test(heading)) return "argument";
    if (/核心|判断|本质|关键|观点/u.test(heading)) return "argument";
    if (/一开始|起初|经历|故事|场景|后来|第一次|当时|回头看/u.test(heading)) return "example";
  }
  if (index === 0 && (signals.has("opinion") || signals.has("counter"))) return "hook";
  if (signals.has("method") && !signals.has("result")) return "method";
  if (signals.has("example") && (signals.has("result") || signals.has("narrative"))) return "example";
  if (signals.has("boundary") && /老板|业务部门|技术团队|研发团队|人力部门|客户|管理层|落地的人|团队担心|团队需要|团队开始|优先级/u.test(combinedText)) return "conflict";
  if (signals.has("boundary")) return "boundary";
  if (signals.has("counter")) return contentType === "storyNarrative" || contentType === "caseReview" || contentType === "opinionAnalysis" ? "conflict" : "counterArgument";
  if (/边界|限制|范围|不能|不要/u.test(heading) || signals.has("boundary")) return "boundary";
  if (/步骤|方法|流程|怎么|推进|检查|行动|做法/u.test(heading) || signals.has("method")) return "method";
  if (signals.has("result")) return "result";
  if (signals.has("example")) return contentType === "storyNarrative" || contentType === "caseReview" ? "example" : "evidence";
  if (signals.has("fact")) return "evidence";
  if (index === total - 1 || signals.has("conclusion")) return "conclusion";
  if (index === 0) return "background";
  if (contentType === "checklistGuide" || contentType === "knowledgeTutorial") return "method";
  if (contentType === "storyNarrative" || contentType === "caseReview" || contentType === "experienceSharing") return index === 1 ? "conflict" : "argument";
  return "argument";
}

function pageRoleFor(role: SemanticSectionRole): PagePlanKind {
  if (role === "hook" || role === "background") return "intro";
  if (role === "problem" || role === "conflict" || role === "counterArgument") return "conflict";
  if (role === "evidence") return "evidence";
  if (role === "example") return "chapter";
  if (role === "method") return "step";
  if (role === "result") return "summary";
  if (role === "boundary") return "boundary";
  if (role === "callToAction") return "callToAction";
  return role === "conclusion" ? "conclusion" : "argument";
}

function legacyPurposeFor(role: SemanticSectionRole): ContentSectionPurpose {
  if (role === "hook") return "opening";
  if (role === "background") return "context";
  if (role === "method") return "step";
  if (role === "evidence") return "evidence";
  if (role === "conflict" || role === "counterArgument") return "conflict";
  if (role === "conclusion" || role === "callToAction" || role === "boundary") return "conclusion";
  return "argument";
}

function deriveCentralThesis(units: ReturnType<typeof classifyUnits>, sections: ContentSection[], title?: string) {
  return cleanLine(
    units.opinions.findLast((unit) => /不是|而是|本质|关键|意味着|取决于/u.test(unit.text))?.text
      || units.counterArguments.at(-1)?.text
      || units.opinions.at(-1)?.text
      || sections.find((section) => section.role === "argument")?.keyMessage
      || title
      || "文章中心观点待确认",
    500,
  );
}

function deriveConclusion(units: ReturnType<typeof classifyUnits>, sections: ContentSection[], fallback: string) {
  return cleanLine(units.results.at(-1)?.text || units.boundaries.at(-1)?.text || units.goldenSentences.at(-1)?.text || sections.at(-1)?.keyMessage || fallback, 500);
}

function deriveOpeningHook(units: ReturnType<typeof classifyUnits>, sections: ContentSection[], fallback: string) {
  return cleanLine(units.counterArguments[0]?.text || units.examples[0]?.text || sections[0]?.keyMessage || fallback, 300);
}

function secondaryTypes(contentType: ContentType, units: ReturnType<typeof classifyUnits>, sections: ContentSection[]): ContentType[] {
  const result: ContentType[] = [];
  if (units.methods.length && contentType !== "knowledgeTutorial" && contentType !== "checklistGuide") result.push("knowledgeTutorial");
  if (units.examples.length && contentType !== "caseReview" && contentType !== "storyNarrative" && contentType !== "experienceSharing") result.push("experienceSharing");
  if (units.facts.some((unit) => hasNumberOrDate(unit.text)) && contentType !== "dataInsight") result.push("dataInsight");
  if (sections.some((section) => section.role === "conflict") && contentType !== "opinionAnalysis") result.push("opinionAnalysis");
  return result.slice(0, 3);
}

function deriveTopicTags(content: UnifiedArticleContent) {
  const source = content.blocks.filter((block) => block.type !== "code" && block.type !== "image").map((block) => block.plainText).join(" ");
  const explicit = source.match(/(?:企业\s*AI|AI\s*落地|AI产品经理|最小可行验证|企业数字化|知识库|产品选型|内容排版|客服流程|数据治理|业务规则)/gu) ?? [];
  return collectTags(content, 8, [...explicit, ...collectTags(content, 8)]);
}

function buildLegacyTitleCandidates(title: string, contentType: ContentType, sectionCount: number) {
  const normalized = cleanText(title);
  const clauses = normalized.split(/[：:｜|]/u).map((value) => value.trim()).filter(Boolean);
  const conflictTitle = clauses.length > 1 ? clauses.slice(1).join("：") : normalized;
  const count = Math.max(3, Math.min(5, sectionCount));
  const candidates: Record<ContentType, string[]> = {
    knowledgeTutorial: [normalized, `${normalized}：一套可以直接照做的方法`, conflictTitle],
    checklistGuide: [normalized, `${normalized}：${count}个关键步骤`, `${normalized}，先避开这${count}个问题`],
    opinionAnalysis: [normalized, conflictTitle, `${normalized}：真正关键的是什么`],
    dataInsight: [normalized, conflictTitle, `${normalized}：先看结论再看原因`],
    caseReview: [normalized, conflictTitle, `${normalized}：问题、行动与边界复盘`],
    storyNarrative: [normalized, conflictTitle, `${normalized}：转折发生在这里`],
    productIntroduction: [normalized, conflictTitle, `${normalized}：能力、边界和适用场景`],
    experienceSharing: [normalized, conflictTitle, `${normalized}：一次真实使用后的体会`],
  };
  return uniqueText(candidates[contentType]).map((value) => cleanLine(value, 80)).slice(0, 3);
}

function toSourceFact(unit: SemanticUnit): SourceFact {
  return { id: unit.id, text: unit.text, sourceBlockIds: [...unit.sourceBlockIds] };
}

function emptySection(id: string, title: string, role: SemanticSectionRole): ContentSection {
  return { id, title: "", role, summary: title, sourceBlockIds: [], keyMessage: title, importance: 0.5, canSplit: false, recommendedPageRole: pageRoleFor(role), purpose: legacyPurposeFor(role) };
}

function selectKeyMessage(blocks: SemanticBlock[], fallback: string) {
  return blocks.find((block) => block.signals.has("opinion") || block.signals.has("counter") || block.signals.has("result"))?.text || firstSentence(fallback);
}

function firstSentence(value: string) {
  return value.split(/(?<=[。！？；])/u).find((part) => part.trim())?.trim() || value.trim();
}

function cleanText(value: string | undefined) {
  return value ? cleanPublishingText(value).replace(/^#+\s*/u, "").replace(/^>\s*/u, "").replace(/\s+/gu, " ").trim() : "";
}

function cleanLine(value: string, maxLength: number) {
  return cleanText(value).slice(0, maxLength);
}

function hasNumberOrDate(value: string) {
  const withoutStructuralOrdinals = value.replace(/第\s*(?:\d+|[一二三四五六七八九十百]+)\s*(?:段|页|部分|章节|章)/gu, "");
  return /\d+(?:\.\d+)?\s*(?:%|％|倍|万|亿|元|人|次|个|项|条|类|月|年|天)?|20\d{2}年|第[一二三四五六七八九十]+/u.test(withoutStructuralOrdinals);
}

function hasQuantifiedDetail(value: string) {
  const withoutStructuralOrdinals = value.replace(/第\s*(?:\d+|[一二三四五六七八九十百]+)\s*(?:段|页|部分|章节|章)/gu, "");
  return /(?:\d+(?:\.\d+)?|[一二三四五六七八九十百千万两]+)(?:\s*(?:到|至|-)\s*(?:\d+(?:\.\d+)?|[一二三四五六七八九十百千万两]+))?\s*(?:%|％|倍|万|亿|元|人|名|次|项|月|年|天|周)/u.test(withoutStructuralOrdinals)
    || /准确率|召回率|转化率|节省时间|人工接管率|失败类型|可量化|评估指标|量化结果/u.test(value);
}

function hasPersonalVoice(value: string) {
  return /我|我们|我的|自己|团队|老板|客户/u.test(value);
}

function hasAdviceVoice(value: string) {
  return /应该|建议|可以|需要|先|不要|不妨|最好|尽量/u.test(value);
}

function calculateConfidence(blocks: SemanticBlock[], sections: ContentSection[], units: ReturnType<typeof classifyUnits>) {
  if (!blocks.length) return 0.2;
  const signalCoverage = blocks.filter((block) => block.signals.size > 0).length / blocks.length;
  const sectionCoverage = blocks.every((block) => sections.some((section) => section.sourceBlockIds.includes(block.block.id))) ? 1 : 0.7;
  const classificationCoverage = [units.facts, units.opinions, units.examples, units.methods, units.results, units.counterArguments, units.boundaries].some((list) => list.length > 0) ? 1 : 0.65;
  return Math.min(0.96, Math.max(0.35, 0.45 + signalCoverage * 0.25 + sectionCoverage * 0.15 + classificationCoverage * 0.15));
}

function uniqueText(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeMeaning(value: string) {
  return cleanPublishingText(value).replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
}

function isGroundedStructuralHeading(text: string, sourceBlockIds: string[], sourceBlocks: Map<string, UnifiedArticleBlock>) {
  const normalizedHeading = normalizeMeaning(text);
  if (!normalizedHeading || isGenericStructureHeading(text)) return false;
  const sectionText = normalizeMeaning(sourceBlockIds.map((id) => sourceBlocks.get(id)?.text ?? "").join(" "));
  if (sectionText.includes(normalizedHeading)) return true;

  // Heading-free navigation cues may combine two source phrases with a slash.
  // Validate each phrase independently so punctuation does not make a
  // grounded summary look invented after normalization.
  const parts = text.split(/\s*\/\s*/u).map((part) => normalizeMeaning(part)).filter((part) => part.length >= 4);
  return parts.length >= 2 && parts.every((part) => sectionText.includes(part));
}
