import { describe, expect, it } from "vitest";
import { parseArticleContent } from "../article-parser";
import { analyzeArticleDesign } from "./local-analyzer";

const OPINION_ARTICLE = `# 做企业 AI 最尴尬的事：你想补地基，老板想先看楼

刚开始做企业 AI 项目时，我先整理产品文档、政策文件、客服问答和业务口径。没有这些资料，AI 根本答不了业务问题。

## 第一次汇报后，方向变了

老板希望先看到一个客户能看的应用，落地的人则知道数据、规则和权限还没有准备好。两边关注点不同，但都在解决项目如何继续推进的问题。

## 先做一个能看的版本

我们在大屏看板上加了语音助手入口，用户可以询问企业数据，系统从已有大屏查数据返回。这个版本能展示，也能试用，但查的不是完整业务数据。

## 新的需求又插进来

汇报过程中，老板又提出产品选型助手。产品规则和知识库还没完全沉淀，只能先用现有资料拼出一个能跑的版本。

## 演示版可以做，但边界要清楚

能查大屏，就不要说它能查全量业务数据；能做文档问答，就不要说它能处理复杂业务判断。先做一个能验证方向并暴露基础问题的样板房。`;

const TUTORIAL_ARTICLE = `# 企业 AI 落地检查清单

如果团队想把 AI 放进业务，先从一个高频、重复、容易验收的流程开始，不要一开始铺开全部业务。

## 三步完成准备

1. 整理标准答案和升级规则。
2. 接入能够验证结果的数据。
3. 约定什么时候转人工以及哪些数据不能使用。

完成后先跑通一个小闭环，再根据反馈扩大范围。`;

const STORY_ARTICLE = `# 我的 AI 落地体会：我第一次把项目做成样板房

项目刚开始时，我以为只要先把资料整理好，后面就能顺利推进。

## 汇报现场

老板希望客户马上看到一个能打开的应用，而我担心数据和权限还没有准备好。

## 转折

我们先做了一个边界清楚的演示版本，演示暴露的问题反过来帮助团队确定了基础建设的优先级。

最后我接受了一个判断：先做能验证方向的样板房，但不能把它当成生产级能力。`;

describe("content output quality gate", () => {
  it.each([
    ["opinion", OPINION_ARTICLE, "editorial"],
    ["tutorial", TUTORIAL_ARTICLE, "informationCard"],
    ["story", STORY_ARTICLE, "storyMagazine"],
  ])("keeps every source block traceable for %s content", (_name, markdown, themeId) => {
    const article = parseArticleContent(markdown, { mode: "narrative" });
    const plan = analyzeArticleDesign(article);

    expect(plan.recommendedThemeId).toBe(themeId);
    for (const platformPlan of Object.values(plan.platformPlans)) {
      expect(platformPlan.integrity?.sourceCoverage).toBe(1);
      expect(platformPlan.integrity?.missingSourceBlockIds).toEqual([]);
      expect(platformPlan.integrity?.duplicatedBodyUnitIds).toEqual([]);
      expect(platformPlan.integrity?.unresolvedEditorialUnits).toEqual([]);
    }
  });

  it("uses different skeletons for each platform", () => {
    const article = parseArticleContent(OPINION_ARTICLE, { mode: "narrative" });
    const plan = analyzeArticleDesign(article);
    const signatures = Object.values(plan.platformPlans).map((platformPlan) => platformPlan.pages.map((page) => page.kind).join("/"));

    expect(new Set(signatures).size).toBe(4);
    expect(plan.platformPlans.wechat.exportSpec.format).toBe("html");
    expect(plan.platformPlans.xiaohongshu.exportSpec.format).toBe("png");
    expect(plan.platformPlans.douyinImage.exportSpec.format).toBe("png");
    expect(plan.platformPlans.douyinLongform.exportSpec.format).toBe("text");
  });

  it("does not leak internal semantic role labels into visible headings", () => {
    const article = parseArticleContent(OPINION_ARTICLE, { mode: "narrative" });
    const plan = analyzeArticleDesign(article);
    const visibleHeadings = Object.values(plan.platformPlans)
      .flatMap((platformPlan) => platformPlan.pages.flatMap((page) => page.blocks))
      .filter((block) => block.role === "heading")
      .map((block) => block.text);

    expect(visibleHeadings).not.toEqual(expect.arrayContaining(["先补背景", "真正的冲突", "最后总结", "给出方法"]));
  });
});
