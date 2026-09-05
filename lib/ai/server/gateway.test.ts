import { afterEach, describe, expect, it, vi } from "vitest";
import { parseArticleContent } from "../../article-parser";
import { AIProviderError, type ProviderGenerateOptions, type ProviderGenerateResult } from "../provider";
import { analyzeWithServerAI, generateWithServerAI } from "./gateway";
import { ServerAIError } from "./errors";

const source = parseArticleContent("# 标题\n\n正文。", { mode: "knowledge" });
const env = {
  AI_PROVIDER: "openai-compatible",
  AI_API_KEY: "server-secret",
  AI_BASE_URL: "https://example.test/v1",
  AI_MODEL: "fixture-model",
  AI_MAX_RETRIES: "1",
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe.each(["generate", "analyze"] as const)("%s cancellation boundary", (kind) => {
  const boundedEnv = { ...env, AI_TIMEOUT_MS: "1000", AI_MAX_RETRIES: "2" };
  const execute = (call: (signal: AbortSignal) => Promise<never>, signal?: AbortSignal) => kind === "generate"
    ? generateWithServerAI({ source, platforms: ["wechat"], signal }, {
      env: boundedEnv,
      createProvider: () => ({ model: "fixture", generate: (input) => call(input.signal!) }),
    })
    : analyzeWithServerAI({ source, generationMode: "layoutOnly", signal }, {
      env: boundedEnv,
      createAnalyzer: () => ({ model: "fixture", analyzeSemantic: (input) => call(input.signal!) }),
    });

  it("aborts the active retry at the total deadline and never retries a late failure", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const call = vi.fn((signal: AbortSignal) => {
      signals.push(signal);
      return new Promise<never>((_, reject) => setTimeout(() => reject(new ServerAIError("AI_INVALID_RESPONSE", "fixture", false)), 600));
    });
    const result = execute(call).catch((error) => error);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await result).toMatchObject({ code: "AI_TIMEOUT", status: 504 });
    expect(call).toHaveBeenCalledTimes(2);
    expect(signals[1].aborted).toBe(true);
    expect(signals[1].reason).toMatchObject({ code: "AI_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(2000);
    expect(call).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels an uncooperative adapter and suppresses its late retryable failure", async () => {
    vi.useFakeTimers();
    const caller = new AbortController();
    let rejectCall!: (error: unknown) => void;
    const call = vi.fn<(signal: AbortSignal) => Promise<never>>(() => new Promise<never>((_, reject) => { rejectCall = reject; }));
    const result = execute(call, caller.signal).catch((error) => error);
    await vi.advanceTimersByTimeAsync(0);
    caller.abort();
    expect(await result).toMatchObject({ code: "AI_ABORTED", retryable: false });
    expect(call.mock.calls[0][0].aborted).toBe(true);
    rejectCall(new ServerAIError("AI_INVALID_RESPONSE", "late fixture", false));
    await vi.advanceTimersByTimeAsync(2000);
    expect(call).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not invoke a model for a pre-cancelled request", async () => {
    vi.useFakeTimers();
    const caller = new AbortController();
    caller.abort();
    const call = vi.fn<(signal: AbortSignal) => Promise<never>>(() => new Promise<never>(() => undefined));
    await expect(execute(call, caller.signal)).rejects.toMatchObject({ code: "AI_ABORTED" });
    expect(call).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("checks elapsed wall time before retrying even if the timer has not fired", async () => {
    vi.useFakeTimers();
    const call = vi.fn<(signal: AbortSignal) => Promise<never>>(async () => {
      vi.setSystemTime(Date.now() + 1001);
      throw new ServerAIError("AI_INVALID_RESPONSE", "fixture", false);
    });
    await expect(execute(call)).rejects.toMatchObject({ code: "AI_TIMEOUT" });
    expect(call).toHaveBeenCalledOnce();
    expect(call.mock.calls[0][0].aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("propagates the deadline to the real adapter fetch signal", async () => {
    vi.useFakeTimers();
    let upstreamSignal: AbortSignal | undefined;
    const fetchImpl = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_, reject) => {
      upstreamSignal = init?.signal ?? undefined;
      upstreamSignal?.addEventListener("abort", () => reject(upstreamSignal?.reason), { once: true });
    }));
    const result = (kind === "generate"
      ? generateWithServerAI({ source, platforms: ["wechat"] }, { env: boundedEnv, fetchImpl })
      : analyzeWithServerAI({ source, generationMode: "layoutOnly" }, { env: boundedEnv, fetchImpl })
    ).catch((error) => error);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await result).toMatchObject({ code: "AI_TIMEOUT" });
    expect(upstreamSignal?.aborted).toBe(true);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("generateWithServerAI", () => {
  it("retries malformed output with schema feedback but never arbitrary diagnostic text", async () => {
    const provider = { model: "fixture", generate: vi.fn<(input: ProviderGenerateOptions) => Promise<ProviderGenerateResult>>()
      .mockRejectedValueOnce(new AIProviderError({ code: "schema", message: "invalid", retryable: false, diagnostics: {
        provider: "openai-compatible", model: "fixture", details: ["schema_issue path=editorialPlans.0.sections.2 code=unrecognized_keys keys=extra", "private article text"],
      } }))
      .mockResolvedValue({ response: { schemaVersion: 1, drafts: [] }, diagnostics: { provider: "openai-compatible", model: "fixture" } }) };
    await generateWithServerAI({ source, platforms: ["wechat"] }, { env, createProvider: () => provider });
    expect(provider.generate.mock.calls[1][0].validationFeedback).toEqual(["schema_issue path=editorialPlans.0.sections.2 code=unrecognized_keys keys=extra"]);
  });
  it("shares one deadline across platforms and discards late successes", async () => {
    vi.useFakeTimers();
    const provider = {
      model: "fixture",
      generate: vi.fn<(input: ProviderGenerateOptions) => Promise<ProviderGenerateResult>>(() => new Promise<ProviderGenerateResult>((resolve) => setTimeout(() => resolve({
        response: { schemaVersion: 1, drafts: [] },
        diagnostics: { provider: "openai-compatible", model: "fixture" },
      }), 600))),
    };
    const result = generateWithServerAI({ source, platforms: ["wechat", "xiaohongshu", "douyinImage"] }, {
      env: { ...env, AI_TIMEOUT_MS: "1000" }, createProvider: () => provider,
    }).catch((error) => error);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await result).toMatchObject({ code: "AI_TIMEOUT" });
    expect(provider.generate).toHaveBeenCalledTimes(2);
    expect(provider.generate.mock.calls[1][0].signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(provider.generate).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retries a retryable upstream failure within the configured bound", async () => {
    const provider = {
      model: "fixture-model",
      generate: vi
        .fn()
        .mockRejectedValueOnce(
          new AIProviderError({
            code: "transport",
            message: "upstream failed",
            retryable: true,
            diagnostics: { provider: "openai-compatible", model: "fixture-model", status: 503, errorCode: "transport" },
          }),
        )
        .mockResolvedValue({ response: { schemaVersion: 1, drafts: [] }, diagnostics: { provider: "openai-compatible", model: "fixture-model" } }),
    };

    await expect(
      generateWithServerAI(
        { source, sourceVersionId: "v1", platforms: ["wechat"] },
        { env, createProvider: () => provider },
      ),
    ).resolves.toMatchObject({ diagnostics: { model: "fixture-model" } });
    expect(provider.generate).toHaveBeenCalledTimes(2);
  });

  it("maps upstream authentication errors without exposing the secret", async () => {
    const provider = {
      model: "fixture-model",
      generate: vi.fn().mockRejectedValue(
        new AIProviderError({
          code: "transport",
          message: "provider failed with secret server-secret",
          retryable: false,
          diagnostics: { provider: "openai-compatible", model: "fixture-model", status: 401, errorCode: "transport" },
        }),
      ),
    };

    const error = await generateWithServerAI(
      { source, sourceVersionId: "v1", platforms: ["wechat"] },
      { env, createProvider: () => provider },
    ).catch((value) => value);

    expect(error).toBeInstanceOf(ServerAIError);
    expect(error).toMatchObject({ code: "AI_UNAUTHORIZED_UPSTREAM", retryable: false });
    expect(String(error)).not.toContain("server-secret");
  });

  it("maps a missing Volcengine model or endpoint to a configuration error", async () => {
    const provider = {
      model: "missing-model",
      generate: vi.fn().mockRejectedValue(
        new AIProviderError({
          code: "transport",
          message: "provider returned 404",
          retryable: true,
          diagnostics: { provider: "openai-compatible", model: "missing-model", status: 404, errorCode: "transport" },
        }),
      ),
    };

    const error = await generateWithServerAI(
      { source, sourceVersionId: "v1", platforms: ["wechat"] },
      { env, createProvider: () => provider },
    ).catch((value) => value);

    expect(error).toMatchObject({ code: "AI_NOT_CONFIGURED", retryable: false });
    expect(String(error)).toContain("AI_MODEL");
    expect(provider.generate).toHaveBeenCalledOnce();
  });

  it("splits multi-platform server requests before calling the model", async () => {
    let activeRequests = 0;
    let maxActiveRequests = 0;
    const provider = {
      model: "fixture-model",
      generate: vi.fn(async (input: ProviderGenerateOptions) => {
        activeRequests += 1;
        maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
        void input;
        await Promise.resolve();
        activeRequests -= 1;
        return {
          response: { schemaVersion: 1 as const, drafts: [] },
          diagnostics: { provider: "openai-compatible" as const, model: "fixture-model" },
        };
      }),
    };

    await expect(
      generateWithServerAI(
        { source, sourceVersionId: "v1", platforms: ["wechat", "xiaohongshu", "douyinImage", "douyinLongform"] },
        { env, createProvider: () => provider },
      ),
    ).resolves.toMatchObject({ diagnostics: { details: ["split_platform_requests:4"] } });

    expect(provider.generate).toHaveBeenCalledTimes(4);
    expect(maxActiveRequests).toBe(1);
    const calls = provider.generate.mock.calls as Array<[ProviderGenerateOptions]>;
    expect(calls.map(([input]) => input.platforms)).toEqual([["wechat"], ["xiaohongshu"], ["douyinImage"], ["douyinLongform"]]);
  });

  it("retries one invalid structured response", async () => {
    const provider = {
      model: "fixture-model",
      generate: vi
        .fn()
        .mockRejectedValueOnce(new ServerAIError("AI_INVALID_RESPONSE", "invalid response", false))
        .mockResolvedValue({ response: { schemaVersion: 1 as const, drafts: [] }, diagnostics: { provider: "openai-compatible" as const, model: "fixture-model" } }),
    };

    await expect(
      generateWithServerAI(
        { source, sourceVersionId: "v1", platforms: ["wechat"] },
        { env, createProvider: () => provider },
      ),
    ).resolves.toMatchObject({ diagnostics: { model: "fixture-model" } });
    expect(provider.generate).toHaveBeenCalledTimes(2);
  });

  it("enforces the server deadline even when an adapter ignores cancellation", async () => {
    const provider = {
      model: "fixture-model",
      generate: vi.fn<(input: ProviderGenerateOptions) => Promise<ProviderGenerateResult>>(() => new Promise<ProviderGenerateResult>(() => undefined)),
    };

    const error = await generateWithServerAI(
      { source, sourceVersionId: "v1", platforms: ["wechat"] },
      {
        env: { ...env, AI_TIMEOUT_MS: "1000" },
        createProvider: () => provider,
      },
    ).catch((value) => value);

    expect(error).toMatchObject({ code: "AI_TIMEOUT", status: 504, retryable: true });
    expect(provider.generate).toHaveBeenCalledOnce();
  });
});
