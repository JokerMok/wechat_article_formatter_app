import { describe, expect, it } from "vitest";
import { parseArticleContent } from "../article-parser";
import { CONTENT_LAYOUTS, DESIGN_SCHEME_IDS, getContentLayout, getDesignScheme, VISUAL_THEMES } from "../design-schemes";
import { analyzeArticleDesign } from "./local-analyzer";
import { buildPlatformDesignPlans } from "./platform-planner";
import type { EditorialPlan } from "./types";

const REAL_ARTICLE = `# 做企业 AI 最尴尬的事：你想补地基，老板想先看楼

刚开始做企业 AI 项目时，我的第一反应不是先做一个看起来很酷的智能体，而是先把公司的资料整理出来。产品文档、政策文件、客服问答、业务口径和历史聊天记录散在不同地方。它们看起来不像 AI 项目，但没有这些内容，AI 根本回答不了业务问题。

## 第一次汇报后，方向变了

第一次给老板汇报时，我很快发现一个问题：把逻辑解释清楚，不代表老板会觉得够。他需要看到一个客户来访时能打开、能演示、能证明公司正在做 AI 的应用。于是我们先在大屏看板上增加了语音助手入口，再把产品文档和政策文件整理成两个基础问答能力。

## 新需求又插进来

汇报过程中，老板又提出产品选型助手。这个需求合理，但产品规则还没有完全沉淀，知识库也只是临时整理了一版。继续开发意味着先用现有资料拼出能跑的版本，同时把缺失的数据、规则和接口记下来。

## 两条线必须同时推进

老板看结果，希望应用能被客户感知；落地的人看基础，担心临时版本被当成生产能力。两边都没有错。真正可行的做法，是一条线交付看得见的应用，另一条线补数据、知识库、接口、权限和后台。

## 演示版可以做，但边界要清楚

能查大屏，就不要说能查全量业务数据；能做文档问答，就不要说能处理复杂业务判断；能给选型建议，就不要说能自动生成完整方案。企业 AI 最怕的不是先做演示版，而是把演示版当成生产级能力。

最后能不能做成，取决于团队能否一边搭出楼的样子，一边持续补齐下面的地基。`;

const FULL_SEMANTIC_ARTICLE = `# 做企业 AI 最尴尬的事：你想补地基，老板想先看楼

刚开始做企业 AI 项目时，我先把公司的产品文档、政策文件、客服问答和业务口径整理出来。没有这些资料，AI 根本答不了业务问题。

## 一开始，我想先补基础

我的规划是先做知识库，再接数据，最后让智能体进入具体业务场景。这个判断没错，但它不容易在第一次汇报时被看见。

## 第一次汇报后，方向变了

老板希望先看到一个客户能看的应用。落地的人知道基础还没准备好，但老板需要一个能打开、能演示、能证明项目正在推进的结果。

## 先做一个能看的版本

我们在大屏看板上加了语音助手入口，用户可以询问企业数据，系统从已有大屏查数据返回。这个版本能展示，也能试用，但查的不是完整业务数据。

## 新的需求又插进来

汇报过程中，老板又提出产品选型助手。产品规则和知识库还没完全沉淀，只能先用现有资料拼出一个能跑的版本。

## 老板不是错，落地人也不是保守

老板看结果，团队看数据、规则、权限和后台。两边都没错，只是关注点不一样。

## 内部项目不是乙方交付

内部项目需要同步风险、说明资源缺口，再根据现实调整顺序。开发人员还有自己的系统任务，不能假设所有人都会围着 AI 转。

## 演示版可以做，但边界要清楚

能查大屏，就不要说能查全量业务数据；能做文档问答，就不要说能处理复杂业务判断。先做一个能验证方向并暴露基础问题的样板房。`;

describe("platform design planner", () => {
  it("keeps three independent themes composable with four content skeletons", () => {
    const article = parseArticleContent(REAL_ARTICLE, { mode: "narrative" });
    const plans = DESIGN_SCHEME_IDS.map((recommendedScheme) => analyzeArticleDesign(article, { recommendedScheme }));
    const palettes = plans.map((plan) => JSON.stringify(plan.palette));
    const skeletons = plans.map((plan) => plan.platformPlans.xiaohongshu.pages.map((page) => page.kind).join("/"));

    expect(new Set(palettes).size).toBe(3);
    expect(new Set(plans.map((plan) => plan.recommendedThemeId)).size).toBe(3);
    expect(Object.keys(VISUAL_THEMES)).toHaveLength(3);
    expect(Object.keys(CONTENT_LAYOUTS)).toHaveLength(4);
    expect(new Set(skeletons).size).toBe(4);
    expect(skeletons.find((value) => value.includes("step"))).toBeTruthy();
    expect(skeletons.find((value) => value.includes("conflict") || value.includes("turning"))).toBeTruthy();
    expect(skeletons.find((value) => value.includes("evidence") || value.includes("interpretation"))).toBeTruthy();
  });

  it("creates independent platform plans and keeps layout-only wording traceable", () => {
    const article = parseArticleContent(REAL_ARTICLE, { mode: "narrative" });
    const plan = analyzeArticleDesign(article);
    const xhs = plan.platformPlans.xiaohongshu;
    const douyin = plan.platformPlans.douyinImage;
    const douyinCharacterBudget = getContentLayout(plan.contentLayoutId ?? "editorial").paginationRules.cardCharacterBudget.douyinImage;

    expect(xhs.pages.length).toBeGreaterThanOrEqual(3);
    expect(xhs.pages.length).toBeLessThanOrEqual(10);
    expect(douyin.pages.length).toBeGreaterThanOrEqual(3);
    expect(douyin.pages.length).toBeLessThanOrEqual(8);
    expect(xhs.platform).toBe("xiaohongshu");
    expect(douyin.platform).toBe("douyinImage");
    expect(plan.platformPlans.wechat.exportSpec.format).toBe("html");
    expect(xhs.exportSpec).toMatchObject({ format: "png", width: 1080, height: 1440 });
    expect(douyin.pages.every((page) => page.blocks.length <= 6)).toBe(true);
    expect(douyin.pages.slice(1).every((page) => page.blocks.reduce((count, block) => count + block.text.length, 0) <= douyinCharacterBudget)).toBe(true);
    expect(xhs.pages.every((page) => page.blocks.length > 0)).toBe(true);
    expect(xhs.pages.flatMap((page) => page.blocks).every((block) => block.provenance === "source" || block.provenance === "structuralSummary")).toBe(true);
  });

  it("uses semantic chapters for the enterprise AI article instead of mechanically filling cards", () => {
    const article = parseArticleContent(FULL_SEMANTIC_ARTICLE, { mode: "narrative" });
    const plan = analyzeArticleDesign(article);
    const xhsPages = plan.platformPlans.xiaohongshu.pages;
    const douyinPages = plan.platformPlans.douyinImage.pages;
    const sectionRoles = new Set(plan.blueprint.sections.map((section) => section.role));

    expect(xhsPages.length).toBeGreaterThanOrEqual(7);
    expect(xhsPages.length).toBeLessThanOrEqual(9);
    expect(douyinPages.length).toBeGreaterThanOrEqual(4);
    expect(douyinPages.length).toBeLessThanOrEqual(8);
    expect([...sectionRoles]).toEqual(expect.arrayContaining(["background", "example", "conflict", "method", "boundary"]));
    const visibleHeadings = xhsPages.flatMap((page) => page.blocks).filter((block) => block.role === "heading");
    expect(visibleHeadings.length).toBeGreaterThan(0);
    expect(visibleHeadings.every((block) => FULL_SEMANTIC_ARTICLE.includes(block.text))).toBe(true);
    expect(new Set(xhsPages.slice(1).map((page) => page.kind)).size).toBeGreaterThan(2);
  });

  it("adds pages for long content instead of changing the source blueprint", () => {
    const article = parseArticleContent(`${REAL_ARTICLE}\n\n${REAL_ARTICLE.repeat(3)}`, { mode: "narrative" });
    const baseline = analyzeArticleDesign(parseArticleContent(REAL_ARTICLE, { mode: "narrative" }));
    const plan = analyzeArticleDesign(article);
    const sourceSnapshot = plan.blueprint.sourceFacts.map((fact) => fact.text).join("");

    expect(plan.platformPlans.xiaohongshu.pages.length).toBeGreaterThan(baseline.platformPlans.xiaohongshu.pages.length);
    expect(plan.platformPlans.douyinImage.pages.length).toBeGreaterThan(baseline.platformPlans.douyinImage.pages.length);
    expect(plan.blueprint.sourceFacts.map((fact) => fact.text).join("")).toBe(sourceSnapshot);
    expect(plan.platformPlans.xiaohongshu.pages.every((page) => page.blocks.length > 0)).toBe(true);
  });

  it("uses metric, interpretation and boundary pages for grounded data content", () => {
    const article = parseArticleContent(`# 3 个月企业 AI 复盘\n\n3 个月内完成 4 类资料盘点，并把项目拆成 2 条推进线。\n\n## 结果对比\n\n相比只做演示，双线推进能同时暴露应用问题和基础缺口。\n\n## 判断边界\n\n这些数字只说明当前项目范围，不能外推为行业结论。`, { mode: "narrative" });
    const plan = analyzeArticleDesign(article, { recommendedScheme: "dataInsight" });
    const kinds = plan.platformPlans.xiaohongshu.pages.map((page) => page.kind);

    expect(kinds).toContain("keyMetric");
    expect(kinds.some((kind) => kind === "comparison" || kind === "interpretation")).toBe(true);
    expect(kinds).toContain("boundary");
  });

  it("does not consume source text just because a cover references the same source block", () => {
    const article = parseArticleContent(`# 观点标题：先看结果再补基础

第一段正文解释为什么团队需要先做一个能被验证的应用。

第二段正文解释为什么数据、规则和权限仍然必须继续补齐。`, { mode: "knowledge" });
    const plan = analyzeArticleDesign(article);
    const blocks = plan.platformPlans.xiaohongshu.pages.flatMap((page) => page.blocks);
    const blockTexts = blocks.map((block) => block.text);

    expect(blockTexts).toContain("第一段正文解释为什么团队需要先做一个能被验证的应用。");
    expect(blockTexts).toContain("第二段正文解释为什么数据、规则和权限仍然必须继续补齐。");
    expect(blocks.every((block) => Boolean(block.unitId && block.usage))).toBe(true);
  });

  it("keeps explicit theme and layout authoritative over the compatibility scheme", () => {
    const article = parseArticleContent(`# 原文标题

正文内容需要保留在当前平台计划中。`, { mode: "knowledge" });
    const base = analyzeArticleDesign(article);
    const plans = buildPlatformDesignPlans(article, base.blueprint, getDesignScheme("knowledgeMinimal"), {
      themeId: "storyMagazine",
      contentLayoutId: "story",
    });

    expect(plans.xiaohongshu).toMatchObject({
      visualPresetId: "storyNarrative",
      themeId: "storyMagazine",
      layoutId: "story",
    });
  });

  it("deduplicates output units by unitId instead of shared sourceBlockIds", () => {
    const article = parseArticleContent(`# 原文标题

第一段原文提供背景信息。

第二段原文给出后续判断。`, { mode: "knowledge" });
    const base = analyzeArticleDesign(article);
    const paragraphIds = article.blocks.filter((block) => block.type === "paragraph").map((block) => block.id);
    const editorialPlan: EditorialPlan = {
      schemaVersion: 1,
      platform: "xiaohongshu",
      contentType: base.blueprint.primaryContentType,
      title: article.title ?? "原文标题",
      sections: [{
        id: "rewritten-section",
        role: "claim",
        body: "表达优化后的第一段。\n\n表达优化后的第二段。",
        sourceBlockIds: paragraphIds,
      }],
    };
    const plans = buildPlatformDesignPlans(article, base.blueprint, getDesignScheme("knowledgeMinimal"), {
      themeId: "editorial",
      contentLayoutId: "editorial",
      editorialPlans: { xiaohongshu: editorialPlan },
    });
    const texts = plans.xiaohongshu.pages.flatMap((page) => page.blocks).map((block) => block.text);

    expect(texts).toContain("表达优化后的第一段。");
    expect(texts).toContain("表达优化后的第二段。");
  });
});
