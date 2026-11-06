import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { builtInStyles } from "../../../../lib/studio/styles";
import { resetServerAILimitsForTests } from "../../../../lib/ai/server/limits";
const image = "data:image/png;base64,YWJj";
const request = (data: unknown) =>
  new Request("http://localhost/api/ai/style-vision", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: "http://localhost" },
    body: JSON.stringify(data),
  });
const fetchMock = vi.fn();
beforeEach(() => {
  resetServerAILimitsForTests();
  vi.stubEnv("AI_API_KEY", "test-private-upstream-key");
  vi.stubEnv("AI_BASE_URL", "https://upstream.example/v1");
  vi.stubEnv("AI_MODEL", "test-text-endpoint");
  vi.stubEnv("AI_VISION_MODEL", "test-vision-endpoint");
  vi.stubEnv("AI_ACCESS_CODE", "");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("vision style route", () => {
  it("validates structured visual output and uses a server-only independent vision endpoint", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  name: "测试视觉",
                  tokens: builtInStyles[0].tokens,
                  components: { heading: { color: "#123456" } },
                  uncertainKeys: ["字号"],
                  notes: ["视觉估计"],
                  composition: "left",
                }),
              },
            },
          ],
        }),
      ),
    );
    const response = await POST(request({ image, mode: "article" }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.uncertainKeys.join(" ")).toContain("均为估计");
    expect(JSON.stringify(body)).not.toContain("test-private-upstream-key");
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.model).toBe("test-vision-endpoint");
    expect(payload.messages[0].content).toContain("不可信参考数据");
  });
  it("reports a closed endpoint accurately without leaking upstream details", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "InvalidEndpoint.ClosedEndpoint",
            message: "test-private-upstream-key",
          },
        }),
        { status: 400 },
      ),
    );
    const response = await POST(request({ image, mode: "cover" }));
    const text = await response.text();
    expect(response.status).toBe(502);
    expect(text).toContain("接入点已关闭");
    expect(text).not.toContain("test-private-upstream-key");
  });
  it("rejects untrusted remote image URLs and model-produced invalid style values", async () => {
    expect(
      (
        await POST(
          request({ image: "http://169.254.169.254/", mode: "article" }),
        )
      ).status,
    ).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  '{"name":"invalid","tokens":{"accent":"url(javascript:x)"}}',
              },
            },
          ],
        }),
      ),
    );
    expect((await POST(request({ image, mode: "article" }))).status).toBe(502);
  });
});
