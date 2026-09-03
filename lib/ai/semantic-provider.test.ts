import { describe, expect, it, vi } from "vitest";
import { parseArticleContent } from "../article-parser";
import { analyzeArticleDesign } from "../design-plan";
import { OpenAICompatibleSemanticAnalyzer } from "./semantic-provider";

const source = parseArticleContent("# 标题：先解决问题\n\n这是一段观点。\n\n最后要保留边界。", { mode: "knowledge" });
const baseConfig = { baseUrl: "https://example.test/v1", apiKey: "server-secret", model: "fixture-model" };

function completionForSource() {
  const blueprint = analyzeArticleDesign(source).blueprint;
  const semanticBlueprint = Object.fromEntries(
    Object.entries(blueprint).filter(([key]) => !new Set(["contentType", "sourceFacts", "coreMessage", "titleCandidates", "openingHook", "callToAction", "modificationSummary"]).has(key)),
  );
  return JSON.stringify({ choices: [{ message: { content: JSON.stringify(semanticBlueprint) } }] });
}

describe("OpenAI-compatible semantic analyzer", () => {
  it("posts the source blocks and returns a validated blueprint", async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      expect(String(input)).toBe("https://example.test/v1/chat/completions");
      const body = JSON.parse(String(init?.body));
      expect(body.messages[1].content).toContain('"blocks"');
      expect(body.messages[1].content).not.toContain("server-secret");
      return new Response(completionForSource(), { status: 200 });
    }) as unknown as typeof fetch;
    const result = await new OpenAICompatibleSemanticAnalyzer({ ...baseConfig, fetchImpl: fetchMock }).analyze({ source, generationMode: "layoutOnly" });
    expect(result.blueprint.schemaVersion).toBe(1);
    expect(result.blueprint.sourceFacts).toEqual(expect.any(Array));
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("accepts the minimal semantic response and assembles the internal blueprint locally", async () => {
    const paragraph = source.blocks.find((block) => block.type === "paragraph");
    expect(paragraph).toBeDefined();
    const response = {
      choices: [{
        message: {
          content: JSON.stringify({
            schemaVersion: 1,
            documentType: "opinionAnalysis",
            audience: "需要快速判断方案的内容团队",
            tone: "理性",
            thesis: "先解决问题，再保留边界。",
            sections: [{
              id: "model-section-1",
              role: "argument",
              sourceBlockIds: [paragraph!.id],
              confidence: 0.86,
              allowSplit: true,
            }],
            facts: [{ sourceBlockIds: [paragraph!.id] }],
            quoteCandidates: [{ sourceBlockIds: [paragraph!.id] }],
          }),
        },
      }],
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(response), { status: 200 })) as unknown as typeof fetch;

    const result = await new OpenAICompatibleSemanticAnalyzer({ ...baseConfig, fetchImpl: fetchMock }).analyze({ source, generationMode: "layoutOnly" });

    expect(result.blueprint.primaryContentType).toBe("opinionAnalysis");
    expect(result.blueprint.centralThesis).toBe("先解决问题，再保留边界。");
    expect(result.blueprint.sections.some((section) => section.role === "argument" && section.sourceBlockIds.includes(paragraph!.id))).toBe(true);
    expect(result.blueprint.facts.every((fact) => fact.sourceBlockIds.includes(paragraph!.id))).toBe(true);
  });

  it("keeps compatibility with a legacy single-section response without exposing its internal label", async () => {
    const paragraph = source.blocks.find((block) => block.type === "paragraph");
    expect(paragraph).toBeDefined();
    const response = {
      choices: [{
        message: {
          content: JSON.stringify({
            role: "企业AI试点实施建议",
            purpose: "内部语义用途",
            title: "真正的冲突",
            sourceBlockIds: [paragraph!.id],
          }),
        },
      }],
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(response), { status: 200 })) as unknown as typeof fetch;

    const result = await new OpenAICompatibleSemanticAnalyzer({ ...baseConfig, fetchImpl: fetchMock }).analyze({ source, generationMode: "layoutOnly" });

    expect(result.blueprint.sections.some((section) => section.sourceBlockIds.includes(paragraph!.id))).toBe(true);
    expect(result.blueprint.sections.every((section) => section.displayHeading?.text !== "真正的冲突")).toBe(true);
  });

  it("preserves a schema error instead of silently accepting invalid JSON", async () => {
    const fetchMock = vi.fn((): Promise<Response> => Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: "not-json" } }] }), { status: 200 }))) as unknown as typeof fetch;
    await expect(new OpenAICompatibleSemanticAnalyzer({ ...baseConfig, fetchImpl: fetchMock }).analyze({ source, generationMode: "layoutOnly" })).rejects.toMatchObject({ code: "schema" });
  });

  it("maps a missing model endpoint to a useful upstream error", async () => {
    const fetchMock = vi.fn((): Promise<Response> => Promise.resolve(new Response("{}", { status: 404 }))) as unknown as typeof fetch;
    await expect(new OpenAICompatibleSemanticAnalyzer({ ...baseConfig, fetchImpl: fetchMock }).analyze({ source, generationMode: "layoutOnly" })).rejects.toMatchObject({ code: "upstream", diagnostics: { status: 404 } });
  });
});
