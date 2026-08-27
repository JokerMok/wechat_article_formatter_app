import { expect, test } from "@playwright/test";

test("hosted AI uses the real route and updates only the current platform", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("源文 Markdown")).toBeVisible();
  const xiaohongshuTitle = await page.getByRole("button", { name: "小红书" }).count();
  expect(xiaohongshuTitle).toBe(1);

  await page.getByText("服务端 AI", { exact: true }).click();
  await expect(page.getByText(/密钥、模型和上游地址由服务端环境变量管理/)).toBeVisible();

  const routeRequest = page.waitForRequest((request) => request.url().endsWith("/api/ai/generate") && request.method() === "POST");
  await page.getByRole("button", { name: "生成当前平台", exact: true }).click();
  const request = await routeRequest;
  const body = request.postDataJSON();
  expect(Object.keys(body).sort()).toEqual(["platforms", "source", "sourceRevision", "task"]);
  expect(body.platforms).toEqual(["wechat"]);
  expect(body).not.toHaveProperty("apiKey");
  expect(body).not.toHaveProperty("baseUrl");
  expect(body).not.toHaveProperty("model");

  await expect(page.getByRole("status").getByText(/AI 已完成 1 个平台版本/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel("平台标题")).toHaveValue("知识库重构的关键判断");
  await page.getByRole("button", { name: "小红书" }).click();
  await expect(page.getByLabel("平台标题")).not.toHaveValue("知识库重构的关键判断");
});
