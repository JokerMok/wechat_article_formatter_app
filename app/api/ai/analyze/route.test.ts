import { afterEach, describe, expect, it, vi } from "vitest";
import { parseArticleContent } from "../../../../lib/article-parser";
import { analyzeArticleDesign } from "../../../../lib/design-plan";
import { resetServerAILimitsForTests } from "../../../../lib/ai/server/limits";
import { POST } from "./route";

const source = parseArticleContent("# 标题\n\n一段观点。\n\n最后说明边界。", { mode: "knowledge" });
const env = {
  AI_PROVIDER: "openai-compatible",
  AI_API_KEY: "server-secret",
  AI_BASE_URL: "https://example.test/v1",
  AI_MODEL: "fixture-model",
};

function semanticCompletion() {
  const blueprint = analyzeArticleDesign(source).blueprint;
  const semanticBlueprint = Object.fromEntries(
    Object.entries(blueprint).filter(([key]) => !new Set(["contentType", "sourceFacts", "coreMessage", "titleCandidates", "openingHook", "callToAction", "modificationSummary"]).has(key)),
  );
  return { choices: [{ message: { content: JSON.stringify(semanticBlueprint) } }] };
}

describe("POST /api/ai/analyze", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resetServerAILimitsForTests();
  });

  it("returns an explicit configuration error without contacting an upstream", async () => {
    vi.stubEnv("AI_API_KEY", "");
    vi.stubEnv("AI_BASE_URL", "");
    vi.stubEnv("AI_MODEL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(new Request("http://localhost/api/ai/analyze", { method: "POST", body: JSON.stringify({ source, generationMode: "layoutOnly" }) }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: { code: "AI_NOT_CONFIGURED" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects client upstream configuration before contacting a model", async () => {
    vi.stubEnv("AI_API_KEY", env.AI_API_KEY);
    vi.stubEnv("AI_BASE_URL", env.AI_BASE_URL);
    vi.stubEnv("AI_MODEL", env.AI_MODEL);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(new Request("http://localhost/api/ai/analyze", {
      method: "POST",
      body: JSON.stringify({ source, generationMode: "layoutOnly", apiKey: "client-secret", baseUrl: "https://evil.test", model: "evil" }),
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "AI_INVALID_REQUEST" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes a valid request to the configured upstream and returns the full traceable blueprint", async () => {
    vi.stubEnv("AI_PROVIDER", env.AI_PROVIDER);
    vi.stubEnv("AI_API_KEY", env.AI_API_KEY);
    vi.stubEnv("AI_BASE_URL", env.AI_BASE_URL);
    vi.stubEnv("AI_MODEL", env.AI_MODEL);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(semanticCompletion()), { status: 200 })));
    const response = await POST(new Request("http://localhost/api/ai/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceRevision: "v1", source, generationMode: "layoutOnly" }),
    }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.blueprint.centralThesis).toBeTruthy();
    expect(body.data.blueprint.sourceFacts).toEqual(expect.any(Array));
    expect(JSON.stringify(body)).not.toContain(env.AI_API_KEY);
  });

  it("rejects oversized source before calling the upstream", async () => {
    vi.stubEnv("AI_API_KEY", env.AI_API_KEY);
    vi.stubEnv("AI_BASE_URL", env.AI_BASE_URL);
    vi.stubEnv("AI_MODEL", env.AI_MODEL);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(new Request("http://localhost/api/ai/analyze", {
      method: "POST",
      body: JSON.stringify({ source: { ...source, sourceText: "x".repeat(120001) }, generationMode: "layoutOnly" }),
    }));
    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
