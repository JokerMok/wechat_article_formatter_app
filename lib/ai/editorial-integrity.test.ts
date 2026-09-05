import { describe, expect, it } from "vitest";
import { parseSourceDocument } from "../article-parser";
import { OpenAICompatibleProvider, validateGeneratedFacts } from "./provider";

const source = parseSourceDocument("# 项目对比\n\n项目甲投入120万元，效率提高5%。\n\n项目乙投入20万元，仍处于试用阶段。");
const plan = {
  schemaVersion: 1, platform: "wechat", contentType: "opinionAnalysis", title: "项目对比",
  sections: [{ id: "a", role: "evidence", body: "项目甲投入120万元，效率提高5%。", sourceBlockIds: [source.blocks[1].id] }],
};

function generate(value: unknown) {
  return new OpenAICompatibleProvider({
    baseUrl: "https://model.example/v1", apiKey: "test-only", model: "test",
    fetchImpl: async () => Response.json({ choices: [{ message: { content: JSON.stringify({ schemaVersion: 1, editorialPlans: [value] }) } }] }),
  }).generate({ source, platforms: ["wechat"], generationMode: "reachOptimized" });
}

describe("editorial output integrity", () => {
  it("sends the same enum and length contract used to validate the model response", async () => {
    let instruction = "";
    const provider = new OpenAICompatibleProvider({ baseUrl: "https://model.example/v1", apiKey: "test", model: "test", fetchImpl: async (_url, init) => {
      instruction = JSON.parse(String(init?.body)).messages[0].content;
      return Response.json({ choices: [{ message: { content: JSON.stringify({ schemaVersion: 1, editorialPlans: [plan] }) } }] });
    } });
    await provider.generate({ source, platforms: ["wechat"], generationMode: "reachOptimized" });
    expect(instruction).toContain('"opinionAnalysis"');
    expect(instruction).toContain('"maxLength":12000');
    expect(instruction).toContain('"sourceBlockIds"');
    await expect(generate({ ...plan, contentType: "opinion" })).rejects.toMatchObject({ diagnostics: { details: expect.arrayContaining([expect.stringContaining("contentType")]) } });
  });
  it("accepts supported claims and never truncates valid text", async () => {
    const result = await generate(plan);
    expect(result.response).toMatchObject({ editorialPlans: [plan] });
  });
  it("rejects a source reference instead of dropping the section", async () => {
    await expect(generate({ ...plan, sections: [{ ...plan.sections[0], sourceBlockIds: ["missing"] }] })).rejects.toMatchObject({ code: "schema" });
  });
  it("rejects claims copied from a different source section", async () => {
    await expect(generate({ ...plan, sections: [{ ...plan.sections[0], body: "项目甲投入20万元。" }] })).rejects.toMatchObject({ code: "schema" });
  });
  it("does not silently replace an empty or oversized response with a local plan", async () => {
    await expect(generate({ ...plan, sections: [{ id: "title-only", role: "claim", sourceBlockIds: [source.blocks[0].id] }] })).rejects.toMatchObject({ code: "schema" });
    await expect(generate({ ...plan, sections: [] })).rejects.toMatchObject({ code: "schema" });
    await expect(generate({ ...plan, sections: [{ ...plan.sections[0], body: "甲".repeat(12001) }] })).rejects.toMatchObject({ code: "schema" });
  });
  it("distinguishes numeric tokens and their units", () => {
    const onlyA = { ...source, sourceText: source.blocks[1].markdown, blocks: [source.blocks[1]] };
    expect(validateGeneratedFacts("投入20万元", onlyA).ok).toBe(false);
    expect(validateGeneratedFacts("提高5倍", onlyA).ok).toBe(false);
    expect(validateGeneratedFacts("提高5%", onlyA).ok).toBe(true);
  });
  it("rejects duplicate identity and markup", async () => {
    await expect(generate({ ...plan, sections: [...plan.sections, ...plan.sections] })).rejects.toMatchObject({ code: "schema" });
    await expect(generate({ ...plan, sections: [{ ...plan.sections[0], body: '<script>alert("test")</script>' }] })).rejects.toMatchObject({ code: "schema" });
  });
});
