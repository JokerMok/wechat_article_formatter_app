import { describe, expect, it } from "vitest";
import { parseArticleContent } from "../article-parser";
import { DESIGN_SCHEMES, VISUAL_THEMES } from "../design-schemes";
import { analyzeArticleDesign, detectContentType } from "./local-analyzer";
import { designPlanSchema } from "./schemas";

describe("analyzeArticleDesign", () => {
  it("defaults to layout-only and keeps every planned source fact traceable", () => {
    const article = parseArticleContent(`# 企业 AI 落地清单

先选一个高频、重复、容易验收的流程。

## 三个步骤

- 整理标准答案
- 标记禁用话术
- 约定升级规则

> 先做小闭环，再扩大范围。`, { mode: "knowledge" });

    const plan = analyzeArticleDesign(article);

    expect(plan.contentType).toBe("checklistGuide");
    expect(plan.recommendedScheme).toBe("checklistGuide");
    expect(plan.generationMode).toBe("layoutOnly");
    expect(plan.titleCandidates).toEqual(["企业 AI 落地清单"]);
    expect(plan.callToAction).toBe("");
    expect(plan.keyPoints).toContain("整理标准答案");
    expect(plan.highlights).toContain("先做小闭环，再扩大范围。");
    expect(plan.blockOrder.map((block) => block.blockId)).toEqual(article.blocks.map((block) => block.id));
    expect(plan.blueprint.sourceFacts.every((fact) => fact.sourceBlockIds.every((id) => article.blocks.some((block) => block.id === id)))).toBe(true);
    expect(plan.platformPlans.xiaohongshu.pages.every((page) => page.blocks.every((block) => block.provenance === "source"))).toBe(true);
    expect(designPlanSchema.safeParse(plan).success).toBe(true);
  });

  it("separates reach optimization from layout-only and records expression changes", () => {
    const article = parseArticleContent("# 企业 AI 落地清单\n\n先选一个高频流程，再逐步扩大范围。", { mode: "knowledge" });
    const layoutOnly = analyzeArticleDesign(article);
    const optimized = analyzeArticleDesign(article, { generationMode: "reachOptimized" });

    expect(layoutOnly.recommendedTitle).toBe("企业 AI 落地清单");
    expect(layoutOnly.modificationSummary).toEqual([]);
    expect(optimized.titleCandidates).toHaveLength(3);
    expect(optimized.modificationSummary.length).toBeGreaterThan(0);
    expect(optimized.platformPlans.xiaohongshu.pages.flatMap((page) => page.blocks).some((block) => block.provenance === "expressionOptimization")).toBe(true);
  });

  it.each([
    ["knowledgeTutorial", "# 入门教程\n\n本文说明如何完成基础配置和日常操作。", "knowledge"],
    ["checklistGuide", "# 发布前清单\n\n- 检查标题\n- 核对来源\n\n这是一份避坑攻略。", "knowledge"],
    ["opinionAnalysis", "# 一个判断\n\n我认为，本质不是工具多少，而是流程是否清楚。这是真正关键的问题。", "knowledge"],
    ["dataInsight", "# 行业报告\n\n调查数据显示，样本中的使用比例达到42%，趋势仍在增长。", "knowledge"],
    ["caseReview", "# 客户项目复盘\n\n这个案例记录了实施、交付、验收和最终结果。", "business"],
    ["storyNarrative", "# 那次经历\n\n那天是我第一次接手。后来出现转折，当时没人想到最后会这样。", "narrative"],
    ["productIntroduction", "# 产品说明\n\n产品功能、核心能力、适用场景、选型方式、配置建议和服务版本。", "business"],
    ["experienceSharing", "# 使用心得\n\n这几个月我用下来，体验、体会和感受都很具体，也想分享踩坑建议。", "knowledge"],
  ] as const)("recognizes %s", (expected, markdown, mode) => {
    expect(detectContentType(parseArticleContent(markdown, { mode }))).toBe(expected);
  });

  it.each([
    ["editorial", "editorial", "# 一个行业判断\n\n我认为，本质不是工具多少，而是流程是否清楚。"],
    ["informationCard", "checklist", "# 发布清单\n\n- 检查标题\n- 核对来源\n\n按步骤完成发布。"],
    ["storyMagazine", "story", "# 一次项目经历\n\n第一次接手时问题很多，后来经过调整，最后完成交付。"],
    ["editorial", "data", "# 数据复盘\n\n报告显示，使用比例达到42%，但这个数字不能外推。"],
  ] as const)("recommends the %s theme and %s layout for the content type", (themeId, layoutId, markdown) => {
    const plan = analyzeArticleDesign(parseArticleContent(markdown, { mode: "knowledge" }));
    expect(plan.recommendedThemeId).toBe(themeId);
    expect(plan.contentLayoutId).toBe(layoutId);
    expect(plan.platformPlans.xiaohongshu.themeId).toBe(themeId);
    expect(plan.platformPlans.xiaohongshu.layoutId).toBe(layoutId);
  });

  it("does not mistake generic business words for a story", () => {
    const article = parseArticleContent(`# 企业 AI 落地，先补哪一块基础

很多团队第一次做企业 AI，都会先讨论模型和界面。真正决定项目能不能进入业务的，通常是资料是否能被找到、理解和复用。

## 基础能力要可复用

产品文档、客户问答和业务口径往往散落在不同文件夹里。没有统一来源，模型即使能回答，也很难保证稳定。

最后，应用应该在真实使用中暴露问题，再把问题变成下一轮基础建设。`, { mode: "knowledge" });

    const plan = analyzeArticleDesign(article);
    expect(plan.contentType).toBe("opinionAnalysis");
    expect(plan.recommendedThemeId).toBe("editorial");
    expect(plan.contentLayoutId).toBe("editorial");
  });

  it("keeps an explicit checklist ahead of a trailing narrative word", () => {
    const article = parseArticleContent(`# 发布前检查清单

按步骤核对标题、来源和图片。最后再检查是否存在空白页。`, { mode: "knowledge" });

    const plan = analyzeArticleDesign(article);
    expect(plan.contentType).toBe("checklistGuide");
    expect(plan.recommendedThemeId).toBe("informationCard");
    expect(plan.contentLayoutId).toBe("checklist");
  });

  it("uses four structurally distinct schemes with user-facing metadata", () => {
    const schemes = Object.values(DESIGN_SCHEMES);
    expect(schemes).toHaveLength(4);
    expect(new Set(schemes.map((scheme) => scheme.name)).size).toBe(4);
    expect(new Set(schemes.map((scheme) => scheme.layoutVariant)).size).toBe(4);
    expect(new Set(schemes.map((scheme) => scheme.structure.join("/"))).size).toBe(4);
    expect(new Set(schemes.map((scheme) => JSON.stringify(scheme.palette))).size).toBe(3);
    expect(new Set(schemes.map((scheme) => scheme.themeId)).size).toBe(3);
    expect(Object.values(VISUAL_THEMES).every((theme) => theme.colors.primary && theme.typography.bodyFamily)).toBe(true);
    expect(schemes.every((scheme) => scheme.description && scheme.platforms.length > 0)).toBe(true);
  });

  it("keeps pagination targets bounded for very long input", () => {
    const article = parseArticleContent(`# 长文

${"这是一段用于验证分页上限的正文。".repeat(2000)}`, { mode: "knowledge" });
    const plan = analyzeArticleDesign(article);

    expect(plan.pagination.xiaohongshuTargetPages).toBeLessThanOrEqual(10);
    expect(plan.pagination.douyinImageTargetPages).toBeLessThanOrEqual(8);
  });
});
