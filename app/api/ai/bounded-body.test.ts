import { afterEach, describe, expect, it, vi } from "vitest";
import { parseArticleContent } from "../../../lib/article-parser";
import * as limits from "../../../lib/ai/server/limits";
import * as gateway from "../../../lib/ai/server/gateway";
import * as boundedBody from "../../../lib/ai/server/bounded-body";
import { AI_SESSION_COOKIE, createAISession } from "../../../lib/ai/server/access";
import { POST as analyze } from "./analyze/route";
import { POST as generate } from "./generate/route";

const source = parseArticleContent("# Title\n\nBody text.", { mode: "knowledge" });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  limits.resetServerAILimitsForTests();
});

describe.each([
  { name: "analyze", post: analyze, payload: { source, generationMode: "layoutOnly" } },
  { name: "generate", post: generate, payload: { task: "optimize-platform-variant", source, platforms: ["wechat"] } },
])("$name request body boundary", ({ name, post, payload }) => {
  const request = (body: BodyInit, signal?: AbortSignal) => new Request(`http://localhost/api/ai/${name}`, {
    method: "POST", headers: { origin: "http://localhost" }, body, signal, duplex: "half",
  } as RequestInit);

  const mockModel = () => {
    vi.spyOn(gateway, "generateWithServerAI").mockResolvedValue({ response: { schemaVersion: 1, drafts: [] }, diagnostics: { provider: "openai-compatible", model: "fixture" } });
    vi.spyOn(gateway, "analyzeWithServerAI").mockRejectedValue(new Error("fixture model failure"));
    return vi.spyOn(limits, "acquireServerAILimit");
  };

  it.each([
    { code: "", status: 503, error: "AI_NOT_CONFIGURED" },
    { code: "fixture-access-code-1234", status: 403, error: "AI_FORBIDDEN" },
  ])("rejects production access before reading the body (status=$status)", async ({ code, status, error }) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AI_ACCESS_CODE", code);
    const acquire = mockModel();
    const read = vi.spyOn(boundedBody, "readBoundedBody");
    const response = await post(request(JSON.stringify(payload)));
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: error } });
    expect(read).not.toHaveBeenCalled();
    expect(acquire).not.toHaveBeenCalled();
    expect(gateway.generateWithServerAI).not.toHaveBeenCalled();
    expect(gateway.analyzeWithServerAI).not.toHaveBeenCalled();
  });

  it("accepts an authenticated production session and releases the slot after model completion", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AI_ACCESS_CODE", "fixture-access-code-1234");
    const session = createAISession("fixture-access-code-1234");
    const acquire = mockModel();
    for (let index = 0; index < 3; index += 1) {
      const authenticated = request(JSON.stringify(payload));
      authenticated.headers.set("cookie", `${AI_SESSION_COOKIE}=${session}`);
      const response = await post(authenticated);
      expect(response.status).toBe(name === "generate" ? 200 : 500);
    }
    expect(acquire).toHaveBeenCalledTimes(3);
    expect(name === "generate" ? gateway.generateWithServerAI : gateway.analyzeWithServerAI).toHaveBeenCalledTimes(3);
  });

  it("does not reserve model slots for slow bodies and cancels them at five seconds", async () => {
    vi.useFakeTimers();
    const acquire = mockModel();
    const cancel = vi.fn();
    const pending = [0, 1].map(() => post(request(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode("{")); }, cancel,
    }))));
    await vi.advanceTimersByTimeAsync(0);
    expect(acquire).not.toHaveBeenCalled();
    const normal = await post(request(JSON.stringify(payload)));
    expect(normal.status).not.toBe(429);
    expect(acquire).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(5000);
    for (const response of await Promise.all(pending)) {
      expect(response.status).toBe(504);
      expect(await response.json()).toMatchObject({ ok: false, error: { code: "AI_TIMEOUT" } });
    }
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(acquire).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["invalid JSON", "invalid schema", "oversized source"])("does not acquire a slot for %s", async (scenario) => {
    const acquire = mockModel();
    const body = scenario === "invalid JSON" ? "{"
      : scenario === "invalid schema" ? "{}"
        : JSON.stringify({ ...payload, source: { ...source, sourceText: "x".repeat(120001) } });
    const response = await post(request(body));
    expect(response.status).toBe(scenario === "oversized source" ? 413 : 400);
    expect(acquire).not.toHaveBeenCalled();
    expect(gateway.generateWithServerAI).not.toHaveBeenCalled();
    expect(gateway.analyzeWithServerAI).not.toHaveBeenCalled();
  });

  it("cancels a pending body without acquiring a model slot", async () => {
    vi.useFakeTimers();
    const acquire = mockModel();
    const caller = new AbortController();
    const cancel = vi.fn();
    const result = post(request(new ReadableStream<Uint8Array>({ cancel }), caller.signal));
    caller.abort();
    expect(await (await result).json()).toMatchObject({ ok: false, error: { code: "AI_ABORTED" } });
    expect(cancel).toHaveBeenCalledOnce();
    expect(acquire).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
