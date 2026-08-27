import { describe, expect, it } from "vitest";
import { parseArticleContent } from "../article-parser";
import { DESIGN_SCHEMES } from "../design-schemes";
import { analyzeArticleDesign } from "./local-analyzer";
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

  it("uses six structurally distinct schemes with user-facing metadata", () => {
    const schemes = Object.values(DESIGN_SCHEMES);
    expect(schemes).toHaveLength(6);
    expect(new Set(schemes.map((scheme) => scheme.name)).size).toBe(6);
    expect(new Set(schemes.map((scheme) => scheme.structure.join("/"))).size).toBe(6);
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
