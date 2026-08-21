import { expect, test } from "@playwright/test";
import { articleById } from "../fixtures/content/articles";

test("TEST-020 narrow workspace exposes source, editor and preview views without horizontal overflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "素材" })).toBeVisible();

  await page.getByRole("button", { name: "素材" }).click();
  await page.getByLabel("源文 Markdown").fill(articleById("extreme-english").source);
  await page.getByRole("button", { name: "生成四端" }).click();
  await expect(page.getByText(/已使用本地确定性生成|已保存到浏览器本地/)).toBeVisible();

  await page.getByRole("button", { name: "编辑" }).click();
  await expect(page.getByLabel("平台标题")).toBeVisible();
  await page.getByRole("button", { name: "抖音图文" }).click();
  await page.getByRole("button", { name: "预览" }).click();
  await expect(page.getByText(/1080x1440/).first()).toBeVisible();

  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(overflow.body).toBeLessThanOrEqual(overflow.viewport + 1);
  await expect(page.locator("main")).not.toContainText(/<script|font-weight|^\s*>\s*$/i);
});
