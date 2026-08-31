import { describe, expect, it } from "vitest";
import { parseArticleContent } from "../article-parser";
import { DESIGN_SCHEME_IDS } from "../design-schemes";
import { analyzeArticleDesign } from "./local-analyzer";

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

describe("platform design planner", () => {
  it("uses one brand system with four genuinely different page skeletons", () => {
    const article = parseArticleContent(REAL_ARTICLE, { mode: "narrative" });
    const plans = DESIGN_SCHEME_IDS.map((recommendedScheme) => analyzeArticleDesign(article, { recommendedScheme }));
    const palettes = plans.map((plan) => JSON.stringify(plan.palette));
    const skeletons = plans.map((plan) => plan.platformPlans.xiaohongshu.pages.map((page) => page.kind).join("/"));

    expect(new Set(palettes).size).toBe(1);
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

    expect(xhs.pages.length).toBeGreaterThanOrEqual(6);
    expect(xhs.pages.length).toBeLessThanOrEqual(10);
    expect(douyin.pages.length).toBeGreaterThanOrEqual(4);
    expect(douyin.pages.length).toBeLessThanOrEqual(8);
    expect(xhs.pages.map((page) => page.blocks.map((block) => block.text))).not.toEqual(douyin.pages.map((page) => page.blocks.map((block) => block.text)));
    expect(plan.platformPlans.wechat.exportSpec.format).toBe("html");
    expect(xhs.exportSpec).toMatchObject({ format: "png", width: 1080, height: 1440 });
    expect(douyin.pages.every((page) => page.blocks.length <= 6)).toBe(true);
    expect(douyin.pages.slice(1).every((page) => page.blocks.reduce((count, block) => count + block.text.length, 0) <= 240)).toBe(true);
    expect(xhs.pages.every((page) => page.blocks.length > 0)).toBe(true);
    expect(xhs.pages.flatMap((page) => page.blocks).every((block) => block.provenance === "source")).toBe(true);
  });

  it("adds pages for long content instead of changing the source blueprint", () => {
    const article = parseArticleContent(`${REAL_ARTICLE}\n\n${REAL_ARTICLE.repeat(3)}`, { mode: "narrative" });
    const plan = analyzeArticleDesign(article);
    const sourceSnapshot = plan.blueprint.sourceFacts.map((fact) => fact.text).join("");

    expect(plan.platformPlans.xiaohongshu.pages.length).toBeGreaterThan(10);
    expect(plan.platformPlans.douyinImage.pages.length).toBeGreaterThan(8);
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
});
