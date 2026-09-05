import { describe, expect, it } from "vitest";
import { parseSourceDocument } from "../article-parser";
import { collectTags } from "./platform-profiles";
import { toDouyinImageText, toDouyinLongform } from "./douyin";
import { toXiaohongshuImageText } from "./xiaohongshu";

const article = parseSourceDocument("# 做企业 AI 最尴尬的事，是你想补地基，老板想先看楼\n\n团队整理知识库和业务规则，先验证方案。\n\n## 演示版可以做，但边界要清楚\n\n现场反馈改变了最初安排。");

describe("publishing tags", () => {
  it.each([
    article,
    parseSourceDocument("# 春雨停了，桥边传来脚步\n\n## 小船靠岸之后\n\n纸上的字被雨水打湿。"),
    parseSourceDocument("# A Different Story\n\n## The Unexpected Ending\n\nOne afternoon changed everything."),
  ])("does not turn unmarked prose, title clauses or capitalized words into tags", (content) => {
    expect(collectTags(content, 8)).toEqual([]);
  });

  it("uses only explicit hashtags without requiring a full quota", () => {
    const content = parseSourceDocument("# Not a hashtag\n\n话题： #知识库 #数据治理# #知识库\n\nhttps://example.test/#fragment\n\n```text\n#HiddenCodeTag\n```\n\n![#HiddenImageTag](https://example.test/image.png)");
    expect(collectTags(content, 8)).toEqual(["知识库", "数据治理"]);
    expect(collectTags(content, 1)).toEqual(["知识库"]);
    expect(collectTags(content, 0)).toEqual([]);
  });

  it("takes semantic tags as authoritative and never pads an explicit empty result", () => {
    const content = parseSourceDocument("# Source\n\n#原文话题");
    expect(collectTags(content, 6, ["企业 AI", "知识库", "企业AI"])).toEqual(["企业AI", "知识库"]);
    expect(collectTags(content, 6, [])).toEqual([]);
    expect(collectTags(content, 6, ["a".repeat(33), "一句话，另一个分句"])).toEqual([]);
  });

  it("does not truncate tag identities and deduplicates without mutating semantic input", () => {
    const topics = Object.freeze(["#OpenAI", "openai", "EnterpriseKnowledgeManagement"]);
    expect(collectTags(article, 8, topics)).toEqual(["OpenAI", "EnterpriseKnowledgeManagement"]);
    expect(topics).toEqual(["#OpenAI", "openai", "EnterpriseKnowledgeManagement"]);
  });

  it("passes semantic topics to every social platform and their hashtag captions", () => {
    const topicTags = ["企业AI", "知识库"];
    const outputs = [toXiaohongshuImageText(article, { topicTags }), toDouyinImageText(article, { topicTags }), toDouyinLongform(article, { topicTags })];
    for (const output of outputs) expect(output.tags).toEqual(topicTags);
    for (const output of outputs.slice(0, 2)) {
      expect(output.caption).toContain("#企业AI #知识库");
      expect(output.caption).not.toMatch(/#做企业|#最尴尬的事|#演示版可以做/);
    }
  });
});
