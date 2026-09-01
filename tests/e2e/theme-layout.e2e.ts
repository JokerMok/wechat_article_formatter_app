import { expect, test } from "@playwright/test";

const opinionArticle = `# 企业 AI 先做什么

真正关键的不是先做一个复杂智能体，而是先把业务问题和可验证边界讲清楚。

## 先建立判断

资料、数据和流程没有整理好，应用越快上线，后面越容易返工。

## 再做可见版本

可以先交付一个能讨论的版本，但必须明确它能做什么、不能做什么。

## 最后补齐基础

应用暴露的问题，应当反过来推动数据、接口和权限建设。`;

test("同时重新排版会切换当前平台内容骨架并保持其他平台不变", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("源文 Markdown")).toBeVisible();
  await page.getByLabel("源文 Markdown").fill(opinionArticle);
  await page.getByRole("button", { name: "分析源文", exact: true }).click();
  await page.getByRole("navigation", { name: "目标平台" }).getByRole("button", { name: /^公众号/ }).click();
  await page.locator("header").getByRole("button", { name: "生成当前平台" }).click();
  const wechatTitle = await page.getByLabel("平台标题").inputValue();

  await page.getByRole("navigation", { name: "目标平台" }).getByRole("button", { name: /^小红书/ }).click();
  await page.locator("header").getByRole("button", { name: "生成当前平台" }).click();
  await page.getByRole("button", { name: "排版方案" }).click();
  await expect(page.locator("article").filter({ hasText: "A 编辑部简约" }).first()).toBeVisible();
  await expect(page.locator("[data-card-preview]").first()).toContainText("编辑部 / 01");

  const storyCard = page.locator("article").filter({ hasText: "C 故事杂志" }).first();
  await storyCard.getByRole("button", { name: "应用方案" }).click();
  await page.getByRole("button", { name: "同时重新排版", exact: true }).click();
  await expect(page.getByText("小红书 · C 故事杂志", { exact: true })).toBeVisible();
  await expect(page.locator("[data-card-preview]").first()).not.toContainText("编辑部 / 01");
  await expect(page.locator("[data-card-preview]").first()).toContainText(/章节 01/);

  await page.getByRole("button", { name: "关闭排版方案" }).click();
  const pngDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "PNG" }).first().click();
  await expect(await pngDownload).toBeTruthy();

  await page.getByRole("button", { name: "排版方案" }).click();
  const checklistCard = page.locator("article").filter({ hasText: "B 高能信息卡" }).first();
  await checklistCard.getByRole("button", { name: "应用方案" }).click();
  await page.getByRole("button", { name: "同时重新排版", exact: true }).click();
  await expect(page.getByText("小红书 · B 高能信息卡", { exact: true })).toBeVisible();
  await expect(page.locator("[data-card-preview]").first()).toContainText(/行动清单|避坑提醒|执行清单/);
  await expect(page.locator("[data-card-preview]").first()).not.toContainText("章节 01");

  await page.getByRole("button", { name: "关闭排版方案" }).click();
  await page.getByRole("navigation", { name: "目标平台" }).getByRole("button", { name: /^公众号/ }).click();
  await expect(page.getByLabel("平台标题")).toHaveValue(wechatTitle);
});
