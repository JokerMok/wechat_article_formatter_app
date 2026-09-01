import type { UnifiedArticleBlock, UnifiedArticleContent } from "../content";
import { renderBlockText } from "../platforms/platform-profiles";
import { cleanPublishingText, publicationBlocks } from "./content-filter";
import type {
  ContentBlueprint,
  ContentSection,
  ContentSectionPurpose,
  ContentTone,
  ContentType,
  PagePlanKind,
  SemanticSectionRole,
  SemanticUnit,
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

const STOP_WORDS = new Set(["这是", "一个", "我们", "他们", "很多", "可以", "如果", "因为", "所以", "这个", "那个", "以及", "然后", "最后", "真正", "自己", "时候"]);

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
  const topicTags = deriveTopicTags(content, sections, units);
  const sourceFacts = units.facts.map(toSourceFact);
  const warnings = [
    ...(units.facts.length === 0 ? ["未识别到明确客观事实，事实列表保持为空。"] : []),
    ...(sections.some((section) => section.sourceBlockIds.length === 0) ? ["存在无法追溯到源文块的章节，已保留为不确定结构。"] : []),
  ];

  return {
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
}

export function validateSemanticBlueprint(value: ContentBlueprint, source: UnifiedArticleContent) {
  const validBlockIds = new Set(source.blocks.map((block) => block.id));
  const sourceBlocks = new Map(source.blocks.map((block) => [block.id, block]));
  const units = [
    ...value.facts,
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
  const sourceText = source.sourceText.replace(/\s+/gu, "");
  const inventedUnits = units.filter((unit) => !sourceText.includes(unit.text.replace(/\s+/gu, ""))).map((unit) => unit.id);
  const invalidDisplayHeadings = value.sections
    .filter((section) => {
      const heading = section.displayHeading;
      if (!heading) return false;
      if (heading.provenance === "expressionOptimization") return value.generationMode === "layoutOnly";
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
        return { ...section, title: section.displayHeading.text, titleProvenance: undefined };
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
      const text = cleanText(renderBlockText(block) ?? undefined);
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
  if (blockType === "quote" || blockType === "golden" || blockType === "summary") signals.add("conclusion");
  if (hasNumberOrDate(text) && !hasPersonalVoice(text) && !hasAdviceVoice(text)) signals.add("fact");
  if (hasJudgmentCue(text)) signals.add("opinion");
  if (/一开始|起初|后来|随后|第一次|当时|直到|回头看|这几个月|一天|一年后|最终/u.test(text) || hasPersonalVoice(text) && /做过|经历|接手|遇到|发现/u.test(text)) signals.add("example");
  if (/一开始|起初|后来|随后|第一次|当时|直到|回头看|这几个月|一天|一年后|最终/u.test(text) && hasPersonalVoice(text)) signals.add("narrative");
  if (/步骤|方法|流程|可以通过|建议|需要把|按照|检查|整理|拆成|建立|先(?:把|做|选|从|补|搭|接|完成|解决|确定)|再(?:把|做|补|看|接|考虑|进入)|然后(?:把|做|补|看|接|再)/u.test(text) || blockType === "list") signals.add("method");
  if (/结果|最终|完成|上线|落地|实现|带来|形成|开始讨论|得到/u.test(text)) signals.add("result");
  if (/不能|不要|不等于|不代表|无法|仅限|只(?:能|是)|前提|边界|(?:明确|收缩|限定|适用|超出).*范围|范围(?:内|外|限制)/u.test(text)) signals.add("boundary");
  if (/但|但是|然而|不过|不是.+而是|有人认为|反而|却/u.test(text)) signals.add("counter");
  if (/因此|所以|最后|总结|归根到底|这意味着|核心判断/u.test(text)) signals.add("conclusion");
  return signals;
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
    if (item.signals.has("method")) result.methods.push(unit);
    if (item.signals.has("fact")) result.facts.push(unit);
    if (item.signals.has("result")) result.results.push(unit);
    if (item.signals.has("example")) result.examples.push(unit);
    if (item.signals.has("counter")) result.counterArguments.push(unit);
    if (item.signals.has("opinion")) result.opinions.push(unit);

    if (item.kind === "quote" || item.signals.has("conclusion") || item.text.length <= 90 && (item.signals.has("opinion") || item.signals.has("result"))) {
      result.goldenSentences.push(unit);
    }
  });
  return result;
}

function buildSemanticSections(blocks: SemanticBlock[], contentType: ContentType): ContentSection[] {
  if (!blocks.length) return [emptySection("section-1", "开场", "hook")];
  const groups: SemanticBlock[][] = [];
  const hasExplicitHeading = blocks.some((item) => item.kind === "heading");
  let current: SemanticBlock[] = [];
  for (const item of blocks) {
    const startsNew = item.kind === "heading" && current.length > 0;
    // Explicit headings are the author's semantic boundaries. Signal-based grouping
    // is only needed for plain prose, otherwise one paragraph can become its own page.
    const currentSignal = current.map((entry) => dominantSignal(entry.signals)).find(Boolean);
    const itemSignal = dominantSignal(item.signals);
    const signalStartsNew = !hasExplicitHeading
      && item.kind !== "heading"
      && shouldStartHeadingFreeGroup(current, item, currentSignal, itemSignal);
    if (startsNew || signalStartsNew) {
      groups.push(current);
      current = [];
    }
    current.push(item);
  }
  if (current.length) groups.push(current);

  // A heading-free article often has one sentence carrying a transition cue.
  // Keep those cues available for role inference, but do not let every cue
  // become a chapter. Merging the shortest neighboring groups preserves order
  // and source traceability while producing a usable editorial outline.
  const normalizedGroups = hasExplicitHeading ? groups : coalesceHeadingFreeGroups(groups, 8);

  return normalizedGroups.map((group, index) => {
    const heading = group.find((item) => item.kind === "heading");
    const body = group.filter((item) => item.kind !== "heading");
    const text = body.map((item) => item.text).join(" ");
    const role = inferSectionRole(group, index, normalizedGroups.length, contentType);
    const sourceHeading = cleanText(heading?.text);
    const keyMessage = cleanLine(selectKeyMessage(body, text), 220);
    const sourceBlockIds = group.map((item) => item.block.id);
    return {
      id: `section-${index + 1}`,
      // Keep the legacy title field for persisted data, but do not use it as
      // public copy. Only an explicit source heading gets a display heading.
      title: sourceHeading,
      role,
      summary: cleanLine(firstSentence(text) || sourceHeading || keyMessage, 300),
      sourceBlockIds,
      keyMessage,
      importance: index === 0 || index === normalizedGroups.length - 1 ? 0.92 : role === "conflict" || role === "method" ? 0.88 : 0.72,
      canSplit: body.length > 1 || text.length > 240,
      recommendedPageRole: pageRoleFor(role),
      ...(sourceHeading ? {
        titleProvenance: "source" as const,
        displayHeading: { text: sourceHeading, provenance: "source" as const, confidence: 1 },
      } : {}),
      purpose: legacyPurposeFor(role),
    };
  });
}

function shouldStartHeadingFreeGroup(
  current: SemanticBlock[],
  item: SemanticBlock,
  currentSignal: SemanticSignal | undefined,
  itemSignal: SemanticSignal | undefined,
) {
  if (!current.length || !currentSignal || !itemSignal || currentSignal === itemSignal) return false;

  const currentTextLength = current.reduce((total, entry) => total + entry.text.length, 0);
  const hardBoundarySignals = new Set<SemanticSignal>(["method", "result", "boundary", "conclusion"]);
  const narrativeShift = currentSignal === "example" && (itemSignal === "counter" || hardBoundarySignals.has(itemSignal));
  const reasoningShift = currentSignal === "counter" && hardBoundarySignals.has(itemSignal);
  const methodShift = currentSignal === "method" && (itemSignal === "result" || itemSignal === "boundary" || itemSignal === "conclusion");
  if (narrativeShift || reasoningShift || methodShift) return currentTextLength >= 12;
  return hardBoundarySignals.has(itemSignal) && currentTextLength >= 60;
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
  for (const signal of ["boundary", "method", "result", "example", "counter", "conclusion"] as const) {
    if (signals.has(signal)) return signal;
  }
  return undefined;
}

function inferSectionRole(group: SemanticBlock[], index: number, total: number, contentType: ContentType): SemanticSectionRole {
  const signals = new Set(group.flatMap((item) => [...item.signals]));
  const heading = group.find((item) => item.kind === "heading")?.text || "";
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
  if (signals.has("counter")) return contentType === "storyNarrative" || contentType === "caseReview" ? "conflict" : "counterArgument";
  if (/边界|限制|范围|不能|不要/u.test(heading) || signals.has("boundary") && !signals.has("method")) return "boundary";
  if (/步骤|方法|流程|怎么|推进|检查|行动|做法/u.test(heading) || signals.has("method") && !signals.has("boundary")) return "method";
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
    units.goldenSentences.at(-1)?.text || units.opinions.at(-1)?.text || sections.find((section) => section.role === "argument")?.keyMessage || title || "文章中心观点待确认",
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

function deriveTopicTags(content: UnifiedArticleContent, sections: ContentSection[], units: ReturnType<typeof classifyUnits>) {
  const source = [content.title || "", ...sections.map((section) => section.displayHeading?.text || ""), ...units.opinions.map((unit) => unit.text), ...units.methods.map((unit) => unit.text)].join(" ");
  const explicit = source.match(/(?:企业\s*AI|AI\s*落地|AI产品经理|最小可行验证|企业数字化|知识库|产品选型|内容排版|客服流程|数据治理|业务规则)/gu) ?? [];
  const sourceHeadings = content.blocks
    .filter((block) => block.type === "section" || block.type === "subsection")
    .map((block) => cleanText(block.text));
  const titleClauses = cleanText(content.title)
    .split(/[：:｜|，,。！？]/u)
    .map((value) => value.trim())
    .filter((value) => value.length >= 2 && value.length <= 16);
  const latinConcepts = source.match(/\b(?:[A-Za-z][A-Za-z0-9+#-]{1,19})\b/gu) ?? [];
  const candidates = [...explicit, ...sourceHeadings, ...titleClauses, ...latinConcepts];
  return uniqueText(candidates)
    .filter((value) => value.length >= 2 && value.length <= 20)
    .filter((value) => !isGenericTag(value))
    .filter((value) => !/^(?:做|很多|最后|先|一个|这|问题|如果|所以|然后|能够|没有|我们|我|他|更|真正|最尴尬)/u.test(value))
    .slice(0, 8);
}

function isGenericTag(value: string) {
  return STOP_WORDS.has(value) || /^(?:核心判断|内容结构|主要内容|文章结构|正文|背景|目标|总结|结语|开场|先看这个问题|可以怎么做|最后的结论)$/u.test(value);
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
