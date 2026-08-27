import { describe, expect, it, afterEach, vi } from "vitest";
import validFixture from "../../../../tests/fixtures/ai/valid-response.json";
import { parseArticleContent } from "../../../../lib/article-parser";
import { POST } from "./route";
import { resetServerAILimitsForTests } from "../../../../lib/ai/server/limits";

const source = parseArticleContent("# 标题\n\n正文。", { mode: "knowledge" });

describe("POST /api/ai/generate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resetServerAILimitsForTests();
  });

  it("rejects malformed requests before contacting the provider", async () => {
    const response = await POST(new Request("http://localhost/api/ai/generate", { method: "POST", body: "{}" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: { code: "AI_INVALID_REQUEST" } });
  });

  it("rejects client-supplied upstream configuration", async () => {
    const response = await POST(
      new Request("http://localhost/api/ai/generate", {
        method: "POST",
        body: JSON.stringify({ task: "generate-platform-variant", source, platforms: ["wechat"], apiKey: "client-secret", baseUrl: "https://evil.test", model: "evil-model" }),
      }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("AI_INVALID_REQUEST");
    expect(JSON.stringify(body)).not.toContain("client-secret");
  });

  it("returns an explicit configuration error without calling an upstream", async () => {
    vi.stubEnv("AI_API_KEY", "");
    vi.stubEnv("AI_BASE_URL", "");
    vi.stubEnv("AI_MODEL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(new Request("http://localhost/api/ai/generate", { method: "POST", body: JSON.stringify({ task: "generate-platform-variant", source, platforms: ["wechat"] }) }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: { code: "AI_NOT_CONFIGURED", message: "服务端 AI 尚未配置完整。" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects oversized bodies before model invocation", async () => {
    vi.stubEnv("AI_API_KEY", "server-secret");
    vi.stubEnv("AI_BASE_URL", "https://example.test/v1");
    vi.stubEnv("AI_MODEL", "fixture-model");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(new Request("http://localhost/api/ai/generate", { method: "POST", body: JSON.stringify({ task: "generate-platform-variant", source: { ...source, sourceText: "x".repeat(1_000_001) }, platforms: ["wechat"] }) }));
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: { code: "AI_INVALID_REQUEST" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects cross-origin browser calls", async () => {
    const response = await POST(new Request("https://app.example/api/ai/generate", { method: "POST", headers: { origin: "https://evil.example" }, body: "{}" }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: { code: "AI_FORBIDDEN" } });
  });

  it("returns a stable success envelope and keeps server credentials out of it", async () => {
    vi.stubEnv("AI_PROVIDER", "openai-compatible");
    vi.stubEnv("AI_API_KEY", "server-secret");
    vi.stubEnv("AI_BASE_URL", "https://example.test/v1");
    vi.stubEnv("AI_MODEL", "fixture-model");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(validFixture), { status: 200, headers: { "content-type": "application/json" } })));

    const response = await POST(
      new Request("http://localhost/api/ai/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task: "generate-platform-variant", sourceRevision: "v1", source, platforms: ["wechat"] }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(JSON.stringify(body)).not.toContain("server-secret");
  });
});
