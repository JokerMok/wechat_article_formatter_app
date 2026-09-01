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

  it("preserves a schema error instead of silently accepting invalid JSON", async () => {
    const fetchMock = vi.fn((): Promise<Response> => Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: "not-json" } }] }), { status: 200 }))) as unknown as typeof fetch;
    await expect(new OpenAICompatibleSemanticAnalyzer({ ...baseConfig, fetchImpl: fetchMock }).analyze({ source, generationMode: "layoutOnly" })).rejects.toMatchObject({ code: "schema" });
  });

  it("maps a missing model endpoint to a useful upstream error", async () => {
    const fetchMock = vi.fn((): Promise<Response> => Promise.resolve(new Response("{}", { status: 404 }))) as unknown as typeof fetch;
    await expect(new OpenAICompatibleSemanticAnalyzer({ ...baseConfig, fetchImpl: fetchMock }).analyze({ source, generationMode: "layoutOnly" })).rejects.toMatchObject({ code: "upstream", diagnostics: { status: 404 } });
  });
});
