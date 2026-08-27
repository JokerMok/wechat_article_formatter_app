import { describe, expect, it, vi } from "vitest";
import { parseArticleContent } from "../article-parser";
import { HostedAIProvider } from "./hosted-provider";
import type { ProviderGenerateResult } from "./provider";

describe("HostedAIProvider", () => {
  const response: ProviderGenerateResult = { response: { schemaVersion: 1, drafts: [] }, diagnostics: { provider: "openai-compatible", model: "server-configured" } };
  const source = parseArticleContent("# 标题\n\n正文。", { mode: "knowledge" });

  it("sends only the business request to the local server route", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(_input).toBe("/api/ai/generate");
      const body = JSON.parse(String(init?.body));
      expect(Object.keys(body).sort()).toEqual(["platforms", "source", "sourceRevision", "task"]);
      expect(body).toMatchObject({ task: "generate-platform-variant", platforms: ["wechat"] });
      expect(body).not.toHaveProperty("apiKey");
      expect(body).not.toHaveProperty("baseUrl");
      expect(body).not.toHaveProperty("model");
      return new Response(JSON.stringify({ ok: true, data: response }), { status: 200, headers: { "content-type": "application/json" } });
    });
    await expect(new HostedAIProvider(fetchMock).generate({ source, sourceVersionId: "v1", platforms: ["wechat"] })).resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("uses the browser global fetch and keeps an un-aborted signal live", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(input).toBe("/api/ai/generate");
      expect(init?.signal?.aborted).toBe(false);
      return new Response(JSON.stringify({ ok: true, data: response }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(new HostedAIProvider().generate({ source, platforms: ["wechat"], signal: new AbortController().signal })).resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("preserves a fetch-before-request failure as a diagnostic transport error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(new HostedAIProvider(fetchMock).generate({ source, platforms: ["wechat"] })).rejects.toMatchObject({
      code: "transport",
      retryable: true,
      diagnostics: { errorCode: "transport", errorType: "TypeError" },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not call fetch when the signal is already cancelled", async () => {
    const fetchMock = vi.fn();
    const controller = new AbortController();
    controller.abort();

    await expect(new HostedAIProvider(fetchMock).generate({ source, platforms: ["wechat"], signal: controller.signal })).rejects.toMatchObject({ code: "cancelled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps serialization failures distinct from network failures", async () => {
    const fetchMock = vi.fn();
    const cyclicSource = { ...source } as typeof source & { cycle?: unknown };
    cyclicSource.cycle = cyclicSource;

    await expect(new HostedAIProvider(fetchMock).generate({ source: cyclicSource, platforms: ["wechat"] })).rejects.toMatchObject({ code: "invalid_request" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [503, "AI_UPSTREAM_ERROR", "upstream"],
    [401, "AI_UNAUTHORIZED_UPSTREAM", "unauthorized"],
    [403, "AI_UNAUTHORIZED_UPSTREAM", "unauthorized"],
    [404, "AI_NOT_CONFIGURED", "not_configured"],
    [429, "AI_RATE_LIMITED", "rate_limit"],
    [504, "AI_TIMEOUT", "timeout"],
  ] as const)("maps HTTP %s and server code %s to %s", async (status, serverCode, clientCode) => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input;
      void init;
      return new Response(JSON.stringify({ ok: false, error: { code: serverCode, message: `message-${serverCode}`, retryable: status >= 500 || status === 429 } }), { status });
    });

    await expect(new HostedAIProvider(fetchMock).generate({ source, platforms: ["wechat"] })).rejects.toMatchObject({ code: clientCode, message: `message-${serverCode}` });
  });

  it("maps invalid JSON from the route to a schema error", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input;
      void init;
      return new Response("not-json", { status: 200 });
    });

    await expect(new HostedAIProvider(fetchMock).generate({ source, platforms: ["wechat"] })).rejects.toMatchObject({ code: "schema", retryable: false });
  });
});
