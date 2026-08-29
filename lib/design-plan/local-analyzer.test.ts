import { describe, expect, it } from "vitest";
import { parseArticleContent } from "../article-parser";
import { DESIGN_SCHEMES } from "../design-schemes";
import { analyzeArticleDesign, detectContentType } from "./local-analyzer";
import { designPlanSchema } from "./schemas";

describe("analyzeArticleDesign", () => {
  it("recommends a checklist plan and keeps every generated claim traceable to source text", () => {
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
    expect(plan.titleCandidates).toHaveLength(3);
    expect(plan.keyPoints).toContain("整理标准答案");
    expect(plan.highlights).toContain("先做小闭环，再扩大范围。");
    expect(plan.blockOrder.map((block) => block.blockId)).toEqual(article.blocks.map((block) => block.id));
    expect(designPlanSchema.safeParse(plan).success).toBe(true);
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

  it("uses four structurally distinct schemes with user-facing metadata", () => {
    const schemes = Object.values(DESIGN_SCHEMES);
    expect(schemes).toHaveLength(4);
    expect(new Set(schemes.map((scheme) => scheme.name)).size).toBe(4);
    expect(new Set(schemes.map((scheme) => scheme.layoutVariant)).size).toBe(4);
    expect(new Set(schemes.map((scheme) => scheme.structure.join("/"))).size).toBe(4);
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
