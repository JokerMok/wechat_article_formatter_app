import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createAISession, AI_SESSION_COOKIE } from "../../../../lib/ai/server/access";
import { resetServerAILimitsForTests } from "../../../../lib/ai/server/limits";
import { POST as coverPOST } from "../cover-image/route";
import { POST } from "./route";

const access = "local-illustration-test";
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/D1sAAAAASUVORK5CYII=";
const content = { title: "对照测试", focus: "左右对比两种结果", context: "核对取样条件", brief: "" };
const upstream = vi.fn();

function request(data: unknown, path = "article-image", authenticated = true) {
  const headers = new Headers({ "Content-Type": "application/json", Origin: "http://localhost" });
  if (authenticated) headers.set("Cookie", `${AI_SESSION_COOKIE}=${createAISession(access)}`);
  return new Request(`http://localhost/api/ai/${path}`, {
    method: "POST", headers, body: JSON.stringify(data),
  });
}

beforeEach(() => {
  resetServerAILimitsForTests();
  vi.stubEnv("ACCOUNT_MODE", "off");
  vi.stubEnv("AI_ACCESS_CODE", access);
  vi.stubEnv("AI_API_KEY_FILE", "");
  vi.stubEnv("AI_API_KEY", "dummy-image-key");
  vi.stubEnv("AI_BASE_URL", "https://fixture.example/v1");
  vi.stubEnv("AI_MODEL", "base-model");
  vi.stubEnv("AI_COVER_MODEL", "image-model");
  vi.stubEnv("AI_PROVIDER", "openai-compatible");
  upstream.mockReset().mockImplementation(() =>
    Promise.resolve(Response.json({ output: [{ type: "image_generation_call", result: png }] })),
  );
  vi.stubGlobal("fetch", upstream);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("checks access and article content before invoking the image provider", async () => {
  expect((await POST(request(content, "article-image", false))).status).toBe(403);
  expect((await POST(request({ title: "", focus: "", context: "", brief: "" }))).status).toBe(400);
  expect(upstream).not.toHaveBeenCalled();
});

it("sends the article context once and returns its PNG as a private response", async () => {
  const result = await POST(request(content));
  expect(result.status).toBe(200);
  expect(result.headers.get("Content-Type")).toBe("image/png");
  expect(result.headers.get("Cache-Control")).toBe("no-store");
  expect(Buffer.from(await result.arrayBuffer())).toEqual(Buffer.from(png, "base64"));
  expect(upstream).toHaveBeenCalledTimes(1);
  const [url, init] = upstream.mock.calls[0];
  expect(url).toBe("https://fixture.example/v1/responses");
  expect(JSON.parse(init.body)).toMatchObject({
    model: "image-model",
    input: JSON.stringify(content),
    tools: [{ type: "image_generation", size: "1536x1024", output_format: "png" }],
  });
});

it("retains cover approval and forwards the approved prompt unchanged", async () => {
  const cover = { prompt: "只绘制已确认的封面文案", width: 900, height: 900 };
  expect((await coverPOST(request(cover, "cover-image"))).status).toBe(400);
  expect(upstream).not.toHaveBeenCalled();
  expect((await coverPOST(request({ ...cover, confirmed: true }, "cover-image"))).status).toBe(200);
  expect(JSON.parse(upstream.mock.calls[0][1].body)).toMatchObject({
    input: cover.prompt,
    tools: [{ size: "1024x1024" }],
  });
});
