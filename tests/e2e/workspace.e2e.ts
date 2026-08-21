import { expect, test, type Page } from "@playwright/test";
import { articleById, fixedArticles } from "../fixtures/content/articles";

const onePixelPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

async function openWorkspace(page: Page) {
  await page.goto("/");
  await expect(page.getByLabel("源文 Markdown")).toBeVisible();
}

async function setSource(page: Page, id: Parameters<typeof articleById>[0]) {
  const article = articleById(id);
  await page.getByLabel("项目名称").fill(article.title);
  await page.getByLabel("源文 Markdown").fill(article.source);
  await page.getByRole("button", { name: "生成四端" }).click();
  await expect(page.getByText(/已使用本地确定性生成|已保存到浏览器本地|已解析/)).toBeVisible();
}

async function selectPlatform(page: Page, label: "公众号" | "小红书" | "抖音图文" | "抖音长文") {
  await page.getByRole("button", { name: label }).click();
}

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(overflow.body).toBeLessThanOrEqual(overflow.viewport + 1);
}

test("TEST-001/020 unified entry saves, refreshes, deletes with confirmation, and keeps platform edits isolated", async ({ page }) => {
  await openWorkspace(page);
  await setSource(page, "markdown-headings");

  await selectPlatform(page, "公众号");
  await page.getByLabel("平台标题").fill("公众号独立修改");
  await page.getByText("AI", { exact: true }).click();
  await page.getByRole("button", { name: "生成", exact: true }).click();
  await expect(page.getByText(/AI 配置不完整/).first()).toBeVisible();
  await expect(page.getByLabel("平台标题")).toHaveValue("公众号独立修改");
  await page.getByText("本地", { exact: true }).click();
  await selectPlatform(page, "小红书");
  await expect(page.getByLabel("平台标题")).not.toHaveValue("公众号独立修改");
  await selectPlatform(page, "公众号");
  await expect(page.getByLabel("平台标题")).toHaveValue("公众号独立修改");

  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("已保存到浏览器本地")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("项目名称")).toHaveValue(articleById("markdown-headings").title);
  await selectPlatform(page, "公众号");
  await expect(page.getByLabel("平台标题")).toHaveValue("公众号独立修改");

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("确定删除当前项目");
    await dialog.dismiss();
  });
  await page.getByRole("button", { name: "删除" }).click();
  await expect(page.getByLabel("项目名称")).toHaveValue(articleById("markdown-headings").title);

  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
  await page.getByRole("button", { name: "删除" }).click();
  await expect(page.getByText("项目已删除")).toBeVisible();
  await expect(page.getByLabel("项目名称")).toHaveValue("未命名项目");
});

test("TEST-010/011/018/019 WeChat preview editing, HTML export, image node, download and copy fallback paths", async ({ page, browserName }) => {
  await openWorkspace(page);
  await setSource(page, "image-placeholder");

  await page.locator('input[type="file"][accept*="image/png"]').setInputFiles({
    name: "cover.png",
    mimeType: "image/png",
    buffer: onePixelPng,
  });
  await expect(page.getByText("已上传 1 张图片")).toBeVisible();
  await page.getByRole("button", { name: "cover.png" }).click();
  await page.getByRole("button", { name: "生成四端" }).click();

  await selectPlatform(page, "公众号");
  const editor = page.locator(".preview-editor");
  await expect(editor).toBeVisible();
  await expect(editor.locator("img")).toHaveCount(1);
  await editor.evaluate((element) => {
    const paragraph = element.querySelector("p");
    if (paragraph) paragraph.textContent = "微信人工编辑正文";
    else element.insertAdjacentHTML("beforeend", "<p>微信人工编辑正文</p>");
    element.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });

  const htmlDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "HTML" }).click();
  const stream = await (await htmlDownload).createReadStream();
  let htmlText = "";
  if (stream) {
    for await (const chunk of stream) htmlText += String(chunk);
  }
  expect(htmlText).toContain("微信人工编辑正文");
  expect(htmlText).toContain("<img");
  expect(htmlText).not.toMatch(/<script|onerror|onclick/i);

  const clipboardSupported = await page.evaluate(() => Boolean("ClipboardItem" in window && navigator.clipboard?.write));
  await page.getByRole("button", { name: "复制微信富文本" }).click();
  if (!clipboardSupported || browserName !== "chromium") {
    test.info().annotations.push({ type: "NEEDS_MANUAL_WECHAT_VERIFICATION", description: "当前浏览器无法可靠读取富文本剪贴板，需要人工粘贴到微信编辑器验收。" });
  }
  await expect(page.getByText(/公众号富文本已复制|复制失败/)).toBeVisible();

  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () => Promise.reject(new Error("denied")),
      },
    });
  });
  await page.getByRole("button", { name: "复制文案" }).click();
  await expect(page.getByText("剪贴板不可用，请手动选择复制")).toBeVisible();
});

test("TEST-012/013/014/015 card previews keep real ratios, reflow after layout edits, and support manual page operations", async ({ page }) => {
  await openWorkspace(page);
  await setSource(page, "long-article");
  await selectPlatform(page, "小红书");

  await expect(page.getByText(/1080x1440/).first()).toBeVisible();
  await page.getByText(/^正文 /).locator("..").getByRole("slider").press("ArrowRight");
  await expect(page.getByText(/1080x1440 · 1\//).first()).toBeVisible();
  await expect(page.locator("text=当前页有溢出")).toHaveCount(0);

  const split = page.getByRole("button", { name: "拆分页面" }).first();
  if (await split.isEnabled()) await split.click();
  await expect(page.getByText("已启用手动页")).toBeVisible();
  await page.getByRole("button", { name: "锁定页面" }).first().click();
  await expect(page.getByText(/锁定/).first()).toBeVisible();
  await page.getByRole("button", { name: "下移页面" }).first().click();
  await page.getByRole("button", { name: "撤销" }).click();
  await page.getByRole("button", { name: "重做" }).click();
  await page.getByRole("button", { name: "清除" }).click();
  await expect(page.getByText("已启用手动页")).toHaveCount(0);
  await expect(page.getByText(/1080x1440 · 1\//).first()).toBeVisible();

  await selectPlatform(page, "抖音图文");
  await expect(page.getByText(/1080x1440/).first()).toBeVisible();
  await page.getByText("9:16").click();
  await expect(page.getByText(/1080x1920/).first()).toBeVisible();
  await expect(page.locator("text=当前页有溢出")).toHaveCount(0);
  await page.getByLabel("平台标题").fill("抖音图文标题");
  await selectPlatform(page, "抖音长文");
  await page.getByLabel("平台标题").fill("抖音长文独立标题");
  await selectPlatform(page, "抖音图文");
  await expect(page.getByLabel("平台标题")).toHaveValue("抖音图文标题");
});

test("TEST-016/018 project backup, image restore, PNG download and invalid file protection", async ({ page }) => {
  await openWorkspace(page);
  await setSource(page, "image-placeholder");

  await selectPlatform(page, "小红书");
  const pngDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "PNG" }).first().click();
  expect((await pngDownload).suggestedFilename()).toMatch(/-1\.png$/);

  await page.locator('input[type="file"][accept*="image/png"]').setInputFiles({
    name: "cover.png",
    mimeType: "image/png",
    buffer: onePixelPng,
  });
  await expect(page.getByText("已上传 1 张图片")).toBeVisible();
  await page.getByRole("button", { name: "cover.png" }).click();
  await page.getByRole("button", { name: "生成四端" }).click();

  await selectPlatform(page, "小红书");
  await expect(page.locator("img").first()).toBeVisible();

  const backupDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出项目" }).click();
  expect((await backupDownload).suggestedFilename()).toMatch(/backup\.json$/);

  await page.reload();
  await expect(page.getByRole("button", { name: "cover.png" })).toBeVisible();

  await page.locator("aside").first().evaluate((aside) => {
    const target = aside.firstElementChild ?? aside;
    const transfer = new DataTransfer();
    transfer.items.add(new File(["not an image"], "bad.txt", { type: "text/plain" }));
    target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  await expect(page.getByRole("button", { name: "bad.txt" })).toHaveCount(0);
  if ((await page.getByText(/仅支持 PNG、JPEG、WebP 图片|上传失败|校验失败/).count()) === 0) {
    test.info().annotations.push({
      type: "CORE_GAP_INVALID_FILE_NO_VISIBLE_ERROR",
      description: "非法图片未写入素材库，但当前核心工作区没有显示明确错误提示；T009 只报告，不越界修复。",
    });
  }
});

test("TEST-021/022/023/025 fixed articles do not crash, leak scripts, isolated quote markers, font-weight text or horizontal overflow", async ({ page }) => {
  await openWorkspace(page);

  for (const article of fixedArticles) {
    await page.getByLabel("项目名称").fill(article.title);
    await page.getByLabel("源文 Markdown").fill(article.source);
    await page.getByRole("button", { name: "生成四端" }).click();
    await expect(page.getByText(/已使用本地确定性生成|已保存到浏览器本地/)).toBeVisible();

    for (const platform of ["公众号", "小红书", "抖音图文", "抖音长文"] as const) {
      await selectPlatform(page, platform);
      const visibleText = await page.locator("main").innerText();
      expect(visibleText, `${article.id}:${platform}`).not.toMatch(/<script|<\/script|onclick|onerror|font-weight/i);
      expect(visibleText, `${article.id}:${platform}`).not.toMatch(/^\s*>\s*$/m);
      await assertNoHorizontalOverflow(page);
    }
  }
});
