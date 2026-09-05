import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AI_SESSION_COOKIE, assertServerAIAccess, createAISession } from "./access";

const ACCESS_CODE = "fixture-access-code-1234";
const NOW = 1_800_000_000_000;
const SESSION_MS = 24 * 60 * 60 * 1000;
const request = (token?: string) => new Request("https://app.example/api/ai/analyze", {
  headers: token === undefined ? {} : { cookie: `${AI_SESSION_COOKIE}=${token}` },
});

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("AI_ACCESS_CODE", ACCESS_CODE);
});
afterEach(() => vi.unstubAllEnvs());

describe("server AI access", () => {
  it.each([undefined, "", "   ", "short", "123456789012345", "x".repeat(257)])("fails closed for invalid production configuration %#", (code) => {
    vi.stubEnv("AI_ACCESS_CODE", code);
    expect(() => createAISession("fixture", NOW)).toThrow(expect.objectContaining({ code: "AI_NOT_CONFIGURED", status: 503 }));
    expect(() => assertServerAIAccess(request(), NOW)).toThrow(expect.objectContaining({ code: "AI_NOT_CONFIGURED", status: 503 }));
  });

  it("requires configuration in a production-built preview deployment", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("AI_ACCESS_CODE", "");
    expect(() => assertServerAIAccess(request(), NOW)).toThrow(expect.objectContaining({ status: 503 }));
  });

  it.each([16, 256])("supports an access code of %i characters", (length) => {
    const code = "a".repeat(length);
    vi.stubEnv("AI_ACCESS_CODE", code);
    const token = createAISession(code, NOW);
    expect(() => assertServerAIAccess(request(token), NOW)).not.toThrow();
    expect(token).not.toContain(code);
  });

  it("keeps unconfigured local development available but enforces any configured code", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("AI_ACCESS_CODE", "");
    expect(createAISession("", NOW)).toBe("local");
    expect(() => assertServerAIAccess(request(), NOW)).not.toThrow();
    vi.stubEnv("AI_ACCESS_CODE", ACCESS_CODE);
    expect(() => assertServerAIAccess(request(), NOW)).toThrow(expect.objectContaining({ code: "AI_FORBIDDEN" }));
  });

  it("rejects missing sessions and does not accept the upstream API key as the access code", () => {
    vi.stubEnv("AI_API_KEY", "fixture-upstream-key");
    expect(() => assertServerAIAccess(request(), NOW)).toThrow(expect.objectContaining({ code: "AI_FORBIDDEN" }));
    for (const candidate of ["", "wrong", "fixture-upstream-key"]) {
      expect(() => createAISession(candidate, NOW)).toThrow(expect.objectContaining({ code: "AI_FORBIDDEN" }));
    }
  });

  it("accepts a signed session until the expiry boundary and revokes it on code rotation", () => {
    const token = createAISession(ACCESS_CODE, NOW);
    expect(() => assertServerAIAccess(request(token), NOW + SESSION_MS - 1)).not.toThrow();
    expect(() => assertServerAIAccess(request(token), NOW + SESSION_MS)).toThrow(expect.objectContaining({ code: "AI_FORBIDDEN" }));
    vi.stubEnv("AI_ACCESS_CODE", "rotated-fixture-access-code");
    expect(() => assertServerAIAccess(request(token), NOW)).toThrow(expect.objectContaining({ code: "AI_FORBIDDEN" }));
  });

  it("rejects tampered timestamps, signatures, suffixes and sessions beyond the lifetime", () => {
    const token = createAISession(ACCESS_CODE, NOW);
    const [expires, signature] = token.split(".");
    const invalid = [
      `${Number(expires) - 1}.${signature}`,
      `${expires}.${signature[0] === "a" ? "b" : "a"}${signature.slice(1)}`,
      `${token}.extra`, `${token}.`, `${expires}.${signature.toUpperCase()}`,
      "local", "NaN.deadbeef", "", createAISession(ACCESS_CODE, NOW + 1),
    ];
    for (const value of invalid) {
      expect(() => assertServerAIAccess(request(value), NOW)).toThrow(expect.objectContaining({ code: "AI_FORBIDDEN" }));
    }
  });

  it("rejects ambiguous duplicate session cookies", () => {
    const token = createAISession(ACCESS_CODE, NOW);
    const duplicated = new Request("https://app.example/api/ai/analyze", {
      headers: { cookie: `${AI_SESSION_COOKIE}=${token}; ${AI_SESSION_COOKIE}=invalid` },
    });
    expect(() => assertServerAIAccess(duplicated, NOW)).toThrow(expect.objectContaining({ code: "AI_FORBIDDEN" }));
  });
});
