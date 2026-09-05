import { expect, test } from "@playwright/test";

test("hosted AI uses the real route and updates only the current platform", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("源文 Markdown")).toBeVisible();
  const xiaohongshuTitle = await page.getByRole("navigation", { name: "目标平台" }).getByRole("button", { name: /^小红书/ }).count();
  expect(xiaohongshuTitle).toBe(1);

  await page.getByRole("group", { name: "内容处理方式" }).getByRole("button", { name: "传播力优化" }).click();
  await page.getByText("服务端 AI", { exact: true }).click();
  await expect(page.getByRole("group", { name: "生成引擎" }).getByRole("button", { name: "服务端 AI" })).toHaveAttribute("aria-pressed", "true");

  const requestedRoutes: string[] = [];
  page.on("request", (request) => { if (request.method() === "POST" && request.url().includes("/api/ai/")) requestedRoutes.push(new URL(request.url()).pathname); });
  const routeRequest = page.waitForRequest((request) => request.url().endsWith("/api/ai/generate") && request.method() === "POST");
  await page.locator("header").getByRole("button", { name: "生成当前平台" }).click();
  const request = await routeRequest;
  expect(requestedRoutes).toEqual(["/api/ai/analyze", "/api/ai/generate"]);
  const body = request.postDataJSON();
  expect(Object.keys(body).sort()).toEqual(["analysis", "platforms", "source", "sourceRevision", "task"]);
  expect(body.analysis.sections.length).toBeGreaterThan(0);
  expect(body.analysis.sections.every((section: { sourceBlockIds: string[] }) => section.sourceBlockIds.every((id) => body.source.blocks.some((block: { id: string }) => block.id === id)))).toBe(true);
  expect(body.platforms).toEqual(["wechat"]);
  expect(body).not.toHaveProperty("apiKey");
  expect(body).not.toHaveProperty("baseUrl");
  expect(body).not.toHaveProperty("model");

  await expect(page.getByLabel("平台标题")).toHaveValue("知识库重构的关键判断", { timeout: 20_000 });
  await page.getByRole("navigation", { name: "目标平台" }).getByRole("button", { name: /^小红书/ }).click();
  await expect(page.getByLabel("平台标题")).not.toHaveValue("知识库重构的关键判断");
});
