import { afterEach, describe, expect, it, vi } from "vitest";
import { ServerAIError } from "./errors";
import { acquireServerAILimit, resetServerAILimitsForTests } from "./limits";

describe("server AI limits", () => {
  afterEach(() => {
    resetServerAILimitsForTests();
    vi.unstubAllEnvs();
  });

  it("does not trust forwarding headers on a standalone server", () => {
    vi.stubEnv("VERCEL", "");
    for (let index = 0; index < 12; index += 1) {
      acquireServerAILimit(new Request("https://app.example/api/ai/generate", { headers: {
        "x-forwarded-for": `198.51.100.${index}`, "x-real-ip": `203.0.113.${index}`, "cf-connecting-ip": `192.0.2.${index}`,
      } }))();
    }
    expect(() => acquireServerAILimit(new Request("https://app.example/api/ai/generate", { headers: { "x-forwarded-for": "198.51.100.99" } })))
      .toThrow(expect.objectContaining({ code: "AI_RATE_LIMITED", status: 429 }));
  });

  it("preserves active buckets when the tracking table is full", () => {
    const request = new Request("https://app.example/api/ai/generate");
    const now = () => 1000;
    for (let index = 0; index < 12; index += 1) acquireServerAILimit(request, { now, clientKey: "access-attempt" })();
    for (let index = 0; index < 999; index += 1) acquireServerAILimit(request, { now, clientKey: `client-${index}` })();
    expect(() => acquireServerAILimit(request, { now, clientKey: "overflow" }))
      .toThrow(expect.objectContaining({ code: "AI_RATE_LIMITED" }));
    expect(() => acquireServerAILimit(request, { now, clientKey: "access-attempt" }))
      .toThrow(expect.objectContaining({ code: "AI_RATE_LIMITED" }));
    expect(() => acquireServerAILimit(request, { now: () => 61000, clientKey: "new-window" })())
      .not.toThrow();
  });

  it("caps concurrent requests and releases the slot exactly once", () => {
    const request = new Request("https://app.example/api/ai/generate", { headers: { "x-forwarded-for": "203.0.113.10" } });
    const releases = [acquireServerAILimit(request), acquireServerAILimit(request)];

    expect(() => acquireServerAILimit(request)).toThrowError(ServerAIError);
    expect(() => acquireServerAILimit(request)).toThrow(/当前请求较多/);
    releases[0]();
    releases[0]();
    const release = acquireServerAILimit(request);
    release();
    releases[1]();
  });

  it("limits repeated calls from the same client within a minute", () => {
    const request = new Request("https://app.example/api/ai/generate", { headers: { "x-forwarded-for": "203.0.113.11" } });
    for (let index = 0; index < 12; index += 1) acquireServerAILimit(request)();
    expect(() => acquireServerAILimit(request)).toThrow(/过于频繁/);
  });
});
