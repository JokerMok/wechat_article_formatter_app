import type {
  ArticleLayout,
  ArticleStructure,
  LayoutAnalysis,
  ArticleType,
  LayoutPlan,
  LayoutRequest,
  LayoutSource,
  LayoutStep,
  ModelDecision,
  PlannedComponent,
  SemanticRole,
  StructureNode,
} from "./layout-contract";
import type { ArticleBlock, ArticleDocument, StyleProfile } from "./types";

function digest(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++)
    hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

const blockFingerprints = new WeakMap<ArticleBlock, string>();
export function sourceFingerprint(block: ArticleBlock) {
  let fingerprint = blockFingerprints.get(block);
  if (!fingerprint) {
    fingerprint = digest(
      JSON.stringify([
        block.kind,
        block.headingLevel,
        block.html,
        block.src,
        block.alt,
        block.caption,
      ]),
    );
    blockFingerprints.set(block, fingerprint);
  }
  return fingerprint;
}
export function layoutTheme(profile: StyleProfile): LayoutRequest["theme"] {
  return {
    id: profile.id,
    width: profile.layoutRules.articleWidth,
    rhythm: profile.layoutRules.sectionRhythm,
    measured: [
      ...new Set([
        ...(profile.details?.measured ?? []),
        ...(profile.editorial?.measured ?? []),
      ]),
    ].slice(0, 30),
    components: [
      ...Object.keys(profile.components),
      ...Object.keys(profile.editorial?.components ?? {}),
    ],
  };
}
export function layoutRequest(
  article: Pick<ArticleDocument, "blocks">,
  settings: LayoutRequest["settings"],
  profile: StyleProfile,
  doc: Document = document,
): LayoutRequest {
  const template = doc.createElement("template");
  return {
    settings,
    theme: layoutTheme(profile),
    nodes: article.blocks.map((block) => {
      template.innerHTML = block.html;
      template.content
        .querySelectorAll("br")
        .forEach((node) => node.replaceWith(doc.createTextNode("\n")));
      const text =
        block.kind === "image"
          ? [block.alt, block.caption].filter(Boolean).join("\n")
          : (template.content.textContent ?? "");
      return {
        id: block.id,
        kind: block.kind,
        text,
        fingerprint: sourceFingerprint(block),
        ...(block.kind === "title"
          ? { level: 1 }
          : block.kind === "heading"
            ? { level: 2 }
            : block.kind === "subheading"
              ? { level: block.headingLevel ?? 3 }
              : {}),
        ...(block.kind === "list"
          ? { ordered: !!template.content.querySelector("ol") }
          : {}),
      };
    }),
  };
}
const syntaxRoles: Record<LayoutSource["kind"], SemanticRole> = {
  title: "title",
  heading: "chapter",
  subheading: "chapter",
  paragraph: "body",
  quote: "quote",
  list: "list",
  image: "image",
  divider: "divider",
  code: "code",
  table: "table",
  callout: "claim",
  caption: "caption",
};
const roleComponent: Partial<Record<SemanticRole, PlannedComponent>> = {
  title: "title",
  subtitle: "subtitle",
  lead: "intro",
  chapter: "chapter",
  claim: "point",
  case: "case",
  data: "data",
  summary: "conclusion",
  steps: "steps",
};
const reasons: Partial<Record<SemanticRole, string>> = {
  title: "保留原文主标题。",
  subtitle: "这段补充主标题的信息。",
  lead: "交代文章切入点，帮助读者进入正文。",
  chapter: "沿用原文章节层级，在此划分阅读节奏。",
  claim: "这一段明确表达作者的判断。",
  case: "此处叙述具体情境或经历。",
  evidence: "此处说明结果、依据或验证过程。",
  data: "此处含可定位的量化信息。",
  summary: "此处回收前文观点并收束全文。",
  steps: "保留原有有序列表，以步骤组件呈现。",
  image: "保留原图及相邻图文关系。",
  caption: "保留原有图注。",
};

function guessedType(nodes: LayoutSource[]): ArticleType {
  const heads = nodes
    .filter((n) => n.kind === "heading" || n.kind === "title")
    .map((n) => n.text)
    .join("\n");
  if (/实战|案例|复盘|项目|踩坑|第.{1,3}个坑/.test(heads)) return "case-study";
  if (/教程|指南|操作步骤|如何配置/.test(heads)) return "tutorial";
  if (/报告|调研|监测/.test(heads)) return "report";
  if (/分析|比较|对比/.test(heads)) return "analysis";
  return "other";
}
function inferredRole(
  text: string,
  ordinal: number,
  firstChapter: number,
  count: number,
  allowChapter: boolean,
): SemanticRole {
  const value = text.trim();
  if (!value) return "body";
  if (
    allowChapter &&
    value.length <= 110 &&
    /^(?:第[一二三四五六七八九十百0-9]+[章节篇]|[一二三四五六七八九十百]+[、．])\s*[^。！？\n]+[：:]?$/.test(
      value,
    )
  )
    return "chapter";
  if (ordinal < firstChapter && ordinal <= 3 && value.length >= 28)
    return "lead";
  if (
    ordinal > count * 0.75 &&
    value.length >= 32 &&
    /^(?:总而言之|总之|综上|归根结底|最后[，、：:]|这(?:个|次).{0,18}(?:让我|使我).{0,12}(?:确定|认识到)|.{1,22}最重要的改变.{0,16}不是)/.test(
      value,
    )
  )
    return "summary";
  if (
    /^(?:举个例子|比如[，、：:]|例如[，、：:]|实际案例|当时[，、：:]|有一次[，、：:])/.test(
      value,
    )
  )
    return "case";
  if (
    /^(?:这说明|这意味着|我的判断是|我越来越相信|关键在于|真正重要的是|最重要的是)/.test(
      value,
    ) ||
    /^(?:AI|我们|我).{0,24}(?:最重要的|真正的价值).{0,30}(?:不是|在于|而是)/i.test(
      value,
    )
  )
    return "claim";
  if (
    /\d+(?:\.\d+)?\s*(?:%|％|毫秒|秒|分钟|小时|倍|万元|条记录|台设备)(?:[^a-z]|$)/i.test(
      value,
    )
  )
    return "data";
  if (/^(?:实测|测试结果|验证结果|经过对比|数据显示|根据统计)/.test(value))
    return "evidence";
  return "body";
}

export function allowedComponents(
  kind: LayoutSource["kind"],
): PlannedComponent[] {
  if (kind === "paragraph")
    return [
      "original",
      "title",
      "subtitle",
      "intro",
      "chapter",
      "point",
      "case",
      "data",
      "conclusion",
    ];
  if (kind === "heading" || kind === "subheading")
    return ["original", "chapter"];
  if (kind === "list") return ["original", "steps"];
  if (kind === "callout")
    return ["original", "point", "case", "data", "conclusion"];
  return ["original"];
}

export function validDecision(decision: ModelDecision, source: LayoutSource) {
  const text = source.text.trim();
  if (source.kind !== "paragraph" || !text) return false;
  if (decision.level && decision.role !== "chapter") return false;
  return (
    !["lead", "claim", "case", "evidence", "data", "summary"].includes(
      decision.role,
    ) ||
    (text.length >= 24 && !/[：:]$/.test(text))
  );
}

export function createArticleLayout(
  input: LayoutRequest,
  options: {
    decisions?: ModelDecision[];
    articleType?: ArticleType;
    engine?: string;
    windows?: number;
    failedWindows?: number;
    fallbackReason?: string;
    theme?: LayoutRequest["theme"];
  } = {},
): {
  structure: ArticleStructure;
  plan: LayoutPlan;
  analysis?: LayoutAnalysis;
} {
  const model = new Map(options.decisions?.map((d) => [d.at, d]));
  const fingerprint = digest(
    input.nodes.map((n) => `${n.id}:${n.fingerprint}`).join("|"),
  );
  const hasTitle = input.nodes.some((n) => n.kind === "title");
  const firstChapter = input.nodes.findIndex(
    (n) => n.kind === "heading" || n.kind === "subheading",
  );
  const chapterLimit =
    firstChapter < 0 ? Math.min(input.nodes.length, 5) : firstChapter + 1;
  const sections: ArticleStructure["sections"] = [];
  const stack: typeof sections = [];
  let offset = 0;
  let hasInferredTitle = false;
  let imageContext: string | undefined;
  let previousImage: string | undefined;
  const accepted: LayoutAnalysis["decisions"] = [];
  const treatments: {
    node: StructureNode;
    step: LayoutStep;
    priority: number;
    explicit: boolean;
  }[] = [];
  for (const [index, source] of input.nodes.entries()) {
    const ordinal = index + 1;
    const choice = model.get(ordinal);
    const decision =
      choice &&
      validDecision(choice, source) &&
      (choice.role !== "title" ||
        (!hasTitle && !hasInferredTitle && ordinal === 1)) &&
      (choice.role !== "chapter" || firstChapter < 0) &&
      (!["lead", "subtitle"].includes(choice.role) || ordinal < chapterLimit) &&
      (choice.role !== "summary" || ordinal > input.nodes.length * 0.7)
        ? choice
        : undefined;
    if (decision) {
      const { at: _ordinal, ...facts } = decision;
      void _ordinal;
      accepted.push({
        ...facts,
        blockId: source.id,
        sourceFingerprint: source.fingerprint,
      });
    }
    const explicit = source.kind !== "paragraph";
    const role: SemanticRole =
      decision?.role ??
      (source.kind === "list" && source.ordered
        ? "steps"
        : explicit
          ? syntaxRoles[source.kind]
          : inferredRole(
              source.text,
              ordinal,
              chapterLimit,
              input.nodes.length,
              firstChapter < 0,
            ));
    if (role === "title" && !explicit) hasInferredTitle = true;
    const level =
      role === "chapter"
        ? (source.level ?? decision?.level ?? 2)
        : role === "title"
          ? 1
          : undefined;
    if (role === "chapter") {
      while (stack.length && stack.at(-1)!.level >= level!)
        stack.pop()!.endOrdinal = index;
      const section = {
        blockId: source.id,
        level: level!,
        parentId: stack.at(-1)?.blockId,
        endOrdinal: input.nodes.length,
      };
      sections.push(section);
      stack.push(section);
      imageContext = source.id;
      previousImage = undefined;
    }
    const node: StructureNode = {
      source: {
        blockId: source.id,
        ordinal,
        start: offset,
        end: offset + source.text.length,
        fingerprint: source.fingerprint,
      },
      sourceKind: source.kind,
      role,
      level,
      sectionId: stack.at(-1)?.blockId,
      recognizedBy: explicit ? "source" : decision ? "ai" : "rules",
      ...(role === "image" && imageContext
        ? { relatedBlockId: imageContext }
        : role === "caption" && previousImage
          ? { relatedBlockId: previousImage }
          : {}),
    };
    offset = node.source.end + 1;
    if (role === "image") previousImage = source.id;
    else if (role !== "caption" && role !== "divider") {
      previousImage = undefined;
      if (source.text.trim()) imageContext = source.id;
    }
    const mapped = roleComponent[role] ?? "original";
    const proposed =
      explicit && !["chapter", "steps"].includes(role)
        ? "original"
        : decision?.priority === 1 && ["claim", "case", "data"].includes(role)
          ? "original"
          : mapped;
    const component = allowedComponents(source.kind).includes(proposed)
      ? proposed
      : "original";
    treatments.push({
      node,
      explicit,
      priority:
        decision?.priority ??
        (role === "claim" ? 3 : role === "summary" || role === "lead" ? 2 : 1),
      step: {
        blockId: source.id,
        component,
        level,
        sourceFingerprint: source.fingerprint,
        reason:
          decision?.reason ??
          reasons[role] ??
          "沿用原组件，保留这段内容在原来的位置。",
      },
    });
  }
  const choose = (roles: SemanticRole[], limit: number) =>
    treatments
      .filter((item) => roles.includes(item.node.role))
      .sort(
        (a, b) =>
          b.priority - a.priority ||
          a.node.source.ordinal - b.node.source.ordinal,
      )
      .slice(0, limit);
  const intro = new Set(
    [...choose(["lead"], 1), ...choose(["subtitle"], 1)].map(
      (item) => item.step.blockId,
    ),
  );
  const summary = new Set(
    choose(["summary"], 1).map((item) => item.step.blockId),
  );
  const types = options.articleType ?? guessedType(input.nodes);
  const max =
    input.settings.density === "restrained"
      ? 2
      : input.settings.density === "rich"
        ? 8
        : 5;
  const budget = Math.min(
    max,
    Math.max(
      1,
      Math.ceil(
        treatments.filter((x) => x.node.sourceKind === "paragraph").length /
          (input.settings.density === "rich" ? 9 : 16),
      ),
    ),
  );
  const highlighted = new Set<string>();
  const occupied = new Set<string>();
  const strong = treatments
    .filter((item) => ["point", "case", "data"].includes(item.step.component))
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        a.node.source.ordinal - b.node.source.ordinal,
    );
  for (const item of strong) {
    const section = item.node.sectionId ?? "intro";
    if (highlighted.size >= budget || occupied.has(section)) continue;
    highlighted.add(item.step.blockId);
    occupied.add(section);
  }
  const steps = treatments.map(({ step }) => {
    const limited =
      (["intro", "subtitle"].includes(step.component) &&
        !intro.has(step.blockId)) ||
      (step.component === "conclusion" && !summary.has(step.blockId)) ||
      (["point", "case", "data"].includes(step.component) &&
        !highlighted.has(step.blockId));
    return input.settings.preserveSource || limited
      ? {
          ...step,
          component: "original" as const,
          reason: input.settings.preserveSource
            ? "按设置保留原组件。"
            : `${step.reason} 为保持节奏，此处沿用原组件。`,
        }
      : step;
  });
  const suggestion = !input.nodes.some((node) => node.kind === "image")
    ? choose(["case", "evidence", "data"], 1)[0]
    : undefined;
  return {
    ...(options.engine
      ? {
          analysis: {
            engine: options.engine,
            articleType: types,
            theme: options.theme ?? input.theme,
            windows: options.windows,
            failedWindows: options.failedWindows,
            fallbackReason: options.fallbackReason,
            decisions: accepted,
          },
        }
      : {}),
    structure: {
      version: 1,
      fingerprint,
      articleType: types,
      nodes: treatments.map(({ node }) => node),
      sections,
      thesisIds: choose(["claim"], 5).map((item) => item.step.blockId),
    },
    plan: {
      version: 1,
      structureFingerprint: fingerprint,
      analyzedWith: options.theme ?? input.theme,
      origin: options.engine ? "ai" : "rules",
      ...(options.engine
        ? {
            engine: options.engine,
            windows: options.windows,
            failedWindows: options.failedWindows,
          }
        : {}),
      ...(options.fallbackReason
        ? { fallbackReason: options.fallbackReason }
        : {}),
      steps,
      ...(suggestion
        ? {
            imageSuggestion: {
              afterBlockId: suggestion.step.blockId,
              reason: "可在此补一张自有示意图，帮助读者理解案例或数据。",
            },
          }
        : {}),
    },
  };
}

export function replan(
  input: LayoutRequest,
  analysis?: LayoutAnalysis,
  fallbackReason?: string,
) {
  const choices = new Map(
    analysis?.decisions.map((decision) => [decision.blockId, decision]),
  );
  const decisions = input.nodes.flatMap((node, index) => {
    const choice = choices.get(node.id);
    if (!choice || choice.sourceFingerprint !== node.fingerprint) return [];
    const { role, priority, reason, level } = choice;
    return [{ at: index + 1, role, priority, reason, level }];
  });
  return createArticleLayout(input, {
    decisions,
    engine: analysis?.engine,
    articleType: analysis?.articleType,
    theme: analysis?.theme,
    windows: analysis?.windows,
    failedWindows: analysis?.failedWindows,
    fallbackReason: fallbackReason ?? analysis?.fallbackReason,
  });
}

export function layoutIndex(layout?: ArticleLayout) {
  return new Map(
    layout?.enabled
      ? layout.plan.steps.map((step) => [step.blockId, step])
      : [],
  );
}
export function layoutStepFor(
  block: ArticleBlock,
  layout: ArticleLayout | undefined,
  index: ReturnType<typeof layoutIndex>,
) {
  if (!layout?.enabled) return undefined;
  const manual = layout.manual?.[block.id];
  if (manual && allowedComponents(block.kind).includes(manual.component))
    return {
      ...manual,
      blockId: block.id,
      reason: "用户指定组件。",
      sourceFingerprint: sourceFingerprint(block),
    };
  const step = index.get(block.id);
  if (step?.component === "original") return undefined;
  return step?.sourceFingerprint === sourceFingerprint(block)
    ? step
    : undefined;
}
