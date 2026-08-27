import { expect, test } from "@playwright/test";
import { articleById } from "../fixtures/content/articles";

async function assertCardRatio(page: import("@playwright/test").Page, expectedWidth: number, expectedHeight: number) {
  const card = page.locator("[data-card-preview]").first();
  await expect(card).toBeVisible();
  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width / box!.height).toBeCloseTo(expectedWidth / expectedHeight, 2);
  const firstTextNode = card.locator(":scope > div > div").nth(1);
  await expect(firstTextNode).toBeVisible();
  const lineHeight = await firstTextNode.evaluate((element) => Number.parseFloat(getComputedStyle(element).lineHeight));
  expect(lineHeight).toBeLessThan(120);
  await expect(page.locator("text=当前页有溢出")).toHaveCount(0);
  return card;
}

async function expectCardScreenshot(card: import("@playwright/test").Locator, snapshot: string) {
  const originalStyle = await card.getAttribute("style");
  await card.evaluate((element) => {
    const node = element as HTMLElement;
    node.style.position = "fixed";
    node.style.left = "0px";
    node.style.top = "0px";
    node.style.margin = "0px";
    node.style.zIndex = "9999";
  });
  try {
    await expect(card).toHaveScreenshot(snapshot, { maxDiffPixels: 10 });
  } finally {
    await card.evaluate((element, style) => {
      if (style === null) element.removeAttribute("style");
      else element.setAttribute("style", style);
    }, originalStyle);
  }
}

test("TEST-020 narrow workspace exposes source, editor and preview views without horizontal overflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "源文", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "源文", exact: true }).click();
  await page.getByLabel("源文 Markdown").fill(articleById("extreme-english").source);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page.locator("header").getByRole("button", { name: "生成当前平台" }).click();
  await expect(page.getByRole("navigation", { name: "目标平台" }).getByRole("button", { name: /^公众号/ })).toContainText("已生成");

  await expect(page.getByLabel("平台标题")).toBeVisible();
  await page.getByRole("button", { name: "抖音图文" }).click();
  await page.getByRole("button", { name: "预览", exact: true }).click();
  await expect(page.getByText(/1080x1440/).first()).toBeVisible();
  const narrowCard = await assertCardRatio(page, 1080, 1440);
  await expectCardScreenshot(narrowCard, "narrow-douyin-3x4-card.png");

  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(overflow.body).toBeLessThanOrEqual(overflow.viewport + 1);
  await expect(page.locator("main")).not.toContainText(/<script|font-weight|^\s*>\s*$/i);
});
