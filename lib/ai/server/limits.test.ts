import { afterEach, describe, expect, it } from "vitest";
import { ServerAIError } from "./errors";
import { acquireServerAILimit, resetServerAILimitsForTests } from "./limits";

describe("server AI limits", () => {
  afterEach(() => resetServerAILimitsForTests());

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
