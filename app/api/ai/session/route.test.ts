import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AI_SESSION_COOKIE, assertServerAIAccess } from "../../../../lib/ai/server/access";
import { resetServerAILimitsForTests } from "../../../../lib/ai/server/limits";
import { GET, POST } from "./route";

const ACCESS_CODE = "fixture-access-code-1234";
function login(candidate = ACCESS_CODE, url = "https://app.example/api/ai/session", extra: HeadersInit = {}) {
  const headers = new Headers(extra);
  headers.set("origin", new URL(url).origin);
  headers.set("x-ai-access-code", candidate);
  return new Request(url, { method: "POST", headers });
}
function sessionRequest(cookie?: string) {
  return new Request("https://app.example/api/ai/session", { headers: cookie ? { cookie } : {} });
}
async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.has("set-cookie")).toBe(false);
  const body = await response.json();
  expect(body).toMatchObject({ ok: false, error: { code } });
  expect(JSON.stringify(body)).not.toContain(ACCESS_CODE);
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("AI_ACCESS_CODE", ACCESS_CODE);
  vi.stubEnv("VERCEL", "");
  resetServerAILimitsForTests();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetServerAILimitsForTests();
});

describe("AI session route", () => {
  it.each(["", "short"])("returns 503 for missing or invalid production configuration %#", async (code) => {
    vi.stubEnv("AI_ACCESS_CODE", code);
    await expectError(await GET(sessionRequest()), 503, "AI_NOT_CONFIGURED");
    await expectError(await POST(login()), 503, "AI_NOT_CONFIGURED");
  });

  it("returns 403 without a session", async () => {
    await expectError(await GET(sessionRequest()), 403, "AI_FORBIDDEN");
  });

  it("creates a signed HttpOnly cookie and accepts it on both AI paths", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(login());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("cache-control")).toBe("no-store");
    const setCookie = response.headers.get("set-cookie")!;
    expect(setCookie).toContain(`${AI_SESSION_COOKIE}=`);
    for (const flag of ["HttpOnly", "SameSite=Strict", "Path=/api/ai", "Max-Age=86400", "Secure"]) expect(setCookie).toContain(flag);
    expect(setCookie).not.toContain("Domain=");
    expect(setCookie).not.toContain(ACCESS_CODE);
    const cookie = setCookie.split(";")[0];
    const status = await GET(sessionRequest(cookie));
    expect(status.status).toBe(200);
    expect(status.headers.get("cache-control")).toBe("no-store");
    for (const path of ["analyze", "generate"]) {
      expect(() => assertServerAIAccess(new Request(`https://app.example/api/ai/${path}`, { headers: { cookie } }))).not.toThrow();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sets Secure in production even if the proxy supplies an HTTP request URL", async () => {
    const response = await POST(login(ACCESS_CODE, "http://app.example/api/ai/session"));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("; Secure");
  });

  it("keeps local unconfigured HTTP sessions available", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("AI_ACCESS_CODE", "");
    const response = await POST(login("", "http://localhost/api/ai/session"));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).not.toContain("Secure");
    expect((await GET(sessionRequest())).status).toBe(200);
  });

  it.each(["wrong", "", "x".repeat(257)])("rejects an incorrect or oversized access code %#", async (candidate) => {
    await expectError(await POST(login(candidate)), 403, "AI_FORBIDDEN");
  });

  it("rejects cross-origin login and missing production origin", async () => {
    const crossOrigin = login();
    crossOrigin.headers.set("origin", "https://evil.example");
    await expectError(await POST(crossOrigin), 403, "AI_FORBIDDEN");
    await expectError(await POST(new Request("https://app.example/api/ai/session", {
      method: "POST", headers: { "x-ai-access-code": ACCESS_CODE },
    })), 403, "AI_FORBIDDEN");
  });

  it("rejects expired and tampered cookies through GET", async () => {
    vi.useFakeTimers();
    const response = await POST(login());
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    await expectError(await GET(sessionRequest(`${cookie}.extra`)), 403, "AI_FORBIDDEN");
    vi.setSystemTime(Date.now() + 86400000);
    await expectError(await GET(sessionRequest(cookie)), 403, "AI_FORBIDDEN");
  });

  it("limits login attempts despite rotating forwarding headers, then resets after a minute", async () => {
    vi.useFakeTimers();
    for (let index = 0; index < 12; index += 1) {
      await expectError(await POST(login("wrong", undefined, { "x-forwarded-for": `198.51.100.${index}` })), 403, "AI_FORBIDDEN");
    }
    await expectError(await POST(login()), 429, "AI_RATE_LIMITED");
    vi.setSystemTime(Date.now() + 60000);
    expect((await POST(login())).status).toBe(200);
  });

  it("does not read a credential request body or hold a model slot after rejecting it", async () => {
    const request = login("wrong");
    const read = vi.spyOn(request, "text");
    for (let index = 0; index < 3; index += 1) await expectError(await POST(request), 403, "AI_FORBIDDEN");
    expect(read).not.toHaveBeenCalled();
    expect((await POST(login())).status).toBe(200);
  });
});
