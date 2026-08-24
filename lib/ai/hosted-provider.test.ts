import { describe, expect, it, vi } from "vitest";
import { parseArticleContent } from "../article-parser";
import { HostedAIProvider } from "./hosted-provider";

describe("HostedAIProvider", () => {
  it("sends only the business request to the local server route", async () => {
    const response = { response: { schemaVersion: 1, drafts: [] }, diagnostics: { provider: "openai-compatible", model: "server-configured" } };
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(_input).toBe("/api/ai/generate");
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({ task: "generate-platform-variant", platforms: ["wechat"] });
      expect(body).not.toHaveProperty("apiKey");
      expect(body).not.toHaveProperty("baseUrl");
      expect(body).not.toHaveProperty("model");
      return new Response(JSON.stringify({ ok: true, data: response }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const source = parseArticleContent("# 标题\n\n正文。", { mode: "knowledge" });

    await expect(new HostedAIProvider(fetchMock).generate({ source, sourceVersionId: "v1", platforms: ["wechat"] })).resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
