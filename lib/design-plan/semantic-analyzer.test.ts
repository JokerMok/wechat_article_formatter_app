import { describe, expect, it } from "vitest";
import { parseArticleContent } from "../article-parser";
import { analyzeArticleDesign } from "./local-analyzer";
import { analyzeSemanticBlueprint, migrateSemanticBlueprintSections, validateSemanticBlueprint } from "./semantic-analyzer";

const article = parseArticleContent(
  `# 做企业 AI 最尴尬的事：你想补地基，老板想先看楼

刚开始做企业 AI 项目时，我先把公司的产品文档、政策文件和客服问答整理出来。

第一次汇报后，老板希望先看到一个客户能看的应用，但团队担心数据和规则还没有准备好。

## 先做一个能看的版本

我们在大屏看板上加了语音助手入口，用户可以询问企业数据，系统从已有大屏查数据返回。

这个版本能展示，也能试用，但它查的不是完整业务数据，只能先收缩范围。

## 演示版可以做，但边界要清楚

能查大屏，就不要说它能查全量业务数据。

企业 AI 最怕的不是先做演示版，而是把演示版当成生产级能力。

最后，先做一个能验证方向并暴露基础问题的样板房。`,
  { mode: "knowledge" },
);

describe("semantic analyzer", () => {
  it("keeps source traceability and distinguishes facts from opinions and examples", () => {
    const plan = analyzeArticleDesign(article);
    const blueprint = plan.blueprint;
    const sourceIds = new Set(article.blocks.map((block) => block.id));
    const allUnits = [
      ...blueprint.facts,
      ...blueprint.opinions,
      ...blueprint.examples,
      ...blueprint.methods,
      ...blueprint.results,
      ...blueprint.counterArguments,
      ...blueprint.boundaries,
      ...blueprint.goldenSentences,
    ];

    expect(blueprint.sections.length).toBeGreaterThanOrEqual(3);
    expect(blueprint.facts.length).toBeLessThan(article.blocks.length);
    expect(blueprint.examples.length).toBeGreaterThan(0);
    expect(blueprint.boundaries.length).toBeGreaterThan(0);
    expect(allUnits.every((unit) => unit.sourceBlockIds.every((id) => sourceIds.has(id)))).toBe(true);
    expect(blueprint.topicTags).not.toContain("做企业");
    expect(blueprint.titleCandidates.some((title) => title.includes("老板想先看楼"))).toBe(true);
  });

  it("creates semantic chapters for prose without markdown headings", () => {
    const plain = parseArticleContent(
      `很多团队先想做一个完整智能体，但资料、流程和权限并没有准备好。

      真正的问题不是模型不够强，而是业务规则没有沉淀。

      我后来先选一个重复、可验收的岗位做小范围验证，再补数据和后台。

      这个做法不能替代完整系统建设，结果也要经过人工确认。`,
      { mode: "knowledge" },
    );
    const plan = analyzeArticleDesign(plain);
    expect(plan.blueprint.sections.length).toBeGreaterThan(1);
    expect(plan.blueprint.sections.every((section) => section.sourceBlockIds.length > 0)).toBe(true);
    expect(plan.blueprint.sections.some((section) => section.role === "method")).toBe(true);
    expect(plan.blueprint.sections.some((section) => section.role === "boundary")).toBe(true);
    expect(plan.blueprint.sections.some((section) => !section.displayHeading && !section.title)).toBe(true);
  });

  it("coalesces heading-free long prose into semantic groups instead of one chapter per paragraph", () => {
    const plain = parseArticleContent(
      Array.from({ length: 16 }, (_, index) => {
        const paragraphs = [
          "很多团队开始做企业 AI 时，先想要一个看起来完整的智能体，但资料、流程和权限往往还没有准备好。",
          "真正影响结果的不是模型数量，而是业务规则是否被整理成团队可以复用的内容。",
          "我后来把问题拆成几个可以验证的小任务，先确认每个任务的输入、输出和验收标准。",
          "在推进过程中，团队需要记录哪些内容已经完成，哪些接口还没有接通，避免把演示效果误认为生产能力。",
        ];
        return paragraphs[index % paragraphs.length];
      }).join("\n\n"),
      { mode: "knowledge" },
    );
    const plan = analyzeArticleDesign(plain);
    const sourceIds = new Set(plain.blocks.map((block) => block.id));

    expect(plan.blueprint.sections.length).toBeLessThanOrEqual(8);
    expect(plan.blueprint.sections.length).toBeGreaterThan(1);
    expect(plan.blueprint.sections.every((section) => section.sourceBlockIds.every((id) => sourceIds.has(id)))).toBe(true);
  });

  it("keeps heading-free lead-in context out of the first method section", () => {
    const source = parseArticleContent(
      `# 企业 AI 项目复盘

      刚开始做项目时，我先整理资料和业务规则，确保后续讨论有共同基础。

      ## 先做一个可验证版本

      再选择一个重复且可验收的流程进行小范围验证。`,
      { mode: "knowledge" },
    );
    const sections = analyzeArticleDesign(source).blueprint.sections;

    expect(sections[0]).toMatchObject({ role: "background", title: "" });
    expect(sections[0].displayHeading).toBeUndefined();
    expect(sections[1]).toMatchObject({ role: "method", title: "先做一个可验证版本" });
    expect(sections[1].displayHeading).toMatchObject({ text: "先做一个可验证版本", provenance: "source" });
  });

  it("keeps facts, experience, method and boundaries in separate traceable buckets", () => {
    const mixed = parseArticleContent(
      `# 一个真实项目的复盘\n\n2026年完成了3次资料盘点，项目负责人记录了结果。\n\n我后来发现，真正的问题不是工具数量，而是规则没有沉淀。\n\n建议先选一个重复且可验收的流程，再逐步接入数据。\n\n这个方法不能替代完整系统，所有输出仍需要人工确认。`,
      { mode: "knowledge" },
    );
    const blueprint = analyzeArticleDesign(mixed).blueprint;

    expect(blueprint.facts.some((unit) => unit.text.includes("2026年") && unit.text.includes("3次"))).toBe(true);
    expect(blueprint.opinions.some((unit) => unit.text.includes("真正的问题"))).toBe(true);
    expect(blueprint.methods.some((unit) => unit.text.includes("先选"))).toBe(true);
    expect(blueprint.boundaries.some((unit) => unit.text.includes("不能替代"))).toBe(true);
    expect(blueprint.facts.every((unit) => !unit.text.includes("我后来"))).toBe(true);
  });

  it("rejects invented AI semantic units", () => {
    const blueprint = analyzeSemanticBlueprint(article, {
      generationMode: "layoutOnly",
      contentType: "opinionAnalysis",
      targetAudience: "关注企业 AI 落地的从业者",
      tone: "理性",
    });
    const originalUnit = blueprint.examples[0] ?? blueprint.goldenSentences[0];
    expect(originalUnit).toBeDefined();
    const invalid = {
      ...blueprint,
      examples: [{ ...originalUnit!, text: "源文没有这句话" }],
    };
    expect(validateSemanticBlueprint(invalid, article)).toMatchObject({ ok: false, inventedUnits: [invalid.examples[0].id] });
  });

  it("migrates legacy structural titles without exposing them as headings", () => {
    const blueprint = analyzeArticleDesign(article).blueprint;
    const migrated = migrateSemanticBlueprintSections({
      ...blueprint,
      sections: blueprint.sections.map((section, index) => index === 0
        ? { ...section, title: "先补背景", titleProvenance: "structuralSummary" as const, displayHeading: undefined }
        : section),
    }, article);

    expect(migrated.sections[0]).toMatchObject({ title: "" });
    expect(migrated.sections[0].displayHeading).toBeUndefined();
  });

  it("only migrates a legacy source title when it matches a real source heading", () => {
    const blueprint = analyzeArticleDesign(article).blueprint;
    const sourceSection = blueprint.sections.find((section) => section.displayHeading?.provenance === "source");
    expect(sourceSection).toBeDefined();
    const migrated = migrateSemanticBlueprintSections({
      ...blueprint,
      sections: [{
        ...sourceSection!,
        displayHeading: undefined,
        title: sourceSection!.displayHeading!.text,
        titleProvenance: "source" as const,
      }],
    }, article);

    expect(migrated.sections[0].displayHeading).toMatchObject({
      text: sourceSection!.displayHeading!.text,
      provenance: "source",
    });
  });

  it("rejects generated display headings in layout-only blueprints", () => {
    const blueprint = analyzeArticleDesign(article).blueprint;
    const invalid = {
      ...blueprint,
      sections: [{
        ...blueprint.sections[0],
        displayHeading: { text: "先补背景", provenance: "expressionOptimization" as const, confidence: 1 },
      }],
    };

    expect(validateSemanticBlueprint(invalid, article)).toMatchObject({ ok: false, invalidDisplayHeadings: [invalid.sections[0].id] });
  });

  it("keeps semantic role labels out of public platform copy", () => {
    const plan = analyzeArticleDesign(article);
    const visibleText = plan.platformPlans.xiaohongshu.pages.flatMap((page) => page.blocks).map((block) => block.text);
    for (const label of ["先补背景", "真正的冲突", "给出方法", "最后总结", "故事开始"]) {
      expect(visibleText).not.toContain(label);
    }
    expect(plan.blueprint.sections.some((section) => !section.displayHeading && !section.title)).toBe(true);
  });

  it("does not repeat the first source paragraph as a cover teaser and body copy", () => {
    const plan = analyzeArticleDesign(article);
    const firstBody = article.blocks.find((block) => block.type === "paragraph")?.text ?? "";
    const plannedText = plan.platformPlans.xiaohongshu.pages.flatMap((page) => page.blocks).map((block) => block.text);
    expect(plannedText.filter((text) => text === firstBody).length).toBe(1);
  });
});
