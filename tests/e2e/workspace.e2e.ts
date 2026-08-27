import { expect, test, type BrowserContext, type Download, type Page } from "@playwright/test";
import JSZip from "jszip";
import { articleById, fixedArticles } from "../fixtures/content/articles";

const onePixelPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function openWorkspace(page: Page) {
  await page.goto("/");
  await expect(page.getByLabel("源文 Markdown")).toBeVisible();
}

async function setSource(page: Page, id: Parameters<typeof articleById>[0], options?: { acceptEditedOverwrite?: boolean }) {
  const article = articleById(id);
  await page.getByLabel("项目名称").fill(article.title);
  await page.getByLabel("源文 Markdown").fill(article.source);
  for (const platform of ["公众号", "小红书", "抖音图文", "抖音长文"] as const) {
    await selectPlatform(page, platform);
    await generateCurrentPlatform(page);
    const overwriteButton = page.getByRole("button", { name: "覆盖并生成" });
    if (options?.acceptEditedOverwrite && await overwriteButton.isVisible()) {
      await overwriteButton.click();
    }
  }
  await expect(page.getByText(/已使用本地确定性生成|已保存到浏览器本地|已解析/)).toBeVisible();
}

async function generateCurrentPlatform(page: Page) {
  await page.locator("header").getByRole("button", { name: "生成当前平台" }).click();
}

async function runProjectMenuAction(page: Page, action: "新建项目" | "导入项目" | "导出项目" | "删除项目") {
  await page.getByRole("button", { name: "更多项目操作" }).click();
  await page.getByRole("menuitem", { name: action }).click();
}

async function selectPlatform(page: Page, label: "公众号" | "小红书" | "抖音图文" | "抖音长文") {
  await page.getByRole("navigation", { name: "目标平台" }).getByRole("button", { name: new RegExp(`^${label}(?:\\s|$)`) }).click();
}

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(overflow.body).toBeLessThanOrEqual(overflow.viewport + 1);
}

async function assertPlatformSurfaceClean(page: Page, label: string) {
  const visibleText = `${await page.locator("section").filter({ hasText: "平台版本编辑" }).innerText()}\n${await page.locator("main aside").last().innerText()}`;
  expect(visibleText, label).not.toMatch(/<script|<\/script|onclick|onerror|font-weight/i);
  expect(visibleText, label).not.toMatch(/^\s*>\s*$/m);
}

async function assertCardRatio(page: Page, expectedWidth: number, expectedHeight: number) {
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

async function readDownloadBuffer(download: Download) {
  const stream = await download.createReadStream();
  if (!stream) throw new Error(`Download stream unavailable: ${download.suggestedFilename()}`);

  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function readDownloadText(downloadPromise: Promise<Download>) {
  const download = await downloadPromise;
  const buffer = await readDownloadBuffer(download);
  expect(buffer.byteLength, `text download:${download.suggestedFilename()}`).toBeGreaterThan(0);
  return buffer.toString("utf8");
}

async function readDownloadZip(downloadPromise: Promise<Download>) {
  const download = await downloadPromise;
  const buffer = await readDownloadBuffer(download);
  expect(buffer.byteLength, `zip download:${download.suggestedFilename()}`).toBeGreaterThan(0);
  return { download, zip: await JSZip.loadAsync(buffer) };
}

async function assertPngDownload(downloadPromise: Promise<Download>, expectedFilename: RegExp, label: string) {
  const download = await downloadPromise;
  expect(download.suggestedFilename(), label).toMatch(expectedFilename);
  const buffer = await readDownloadBuffer(download);
  expect(buffer.byteLength, `${label} byteLength`).toBeGreaterThan(pngSignature.length);
  expect(buffer.subarray(0, pngSignature.length).equals(pngSignature), `${label} png signature`).toBe(true);
}

async function editActivePlatform(page: Page, platform: "公众号" | "小红书" | "抖音图文" | "抖音长文", marker: string) {
  await selectPlatform(page, platform);
  await page.getByLabel("平台标题").fill(`${platform}标题-${marker}`);

  if (platform === "公众号") {
    const editor = page.locator(".preview-editor");
    await expect(editor).toBeVisible();
    await editor.evaluate((element, text) => {
      element.innerHTML = `<p>${text}</p>`;
      element.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    }, `${platform}正文-${marker}`);
    return;
  }

  const caption = page.getByLabel("发布文案");
  if (await caption.count()) {
    await caption.fill(`${platform}文案-${marker}`);
  }
}

async function assertActivePlatformEdit(page: Page, platform: "公众号" | "小红书" | "抖音图文" | "抖音长文", marker: string) {
  await selectPlatform(page, platform);
  await expect(page.getByLabel("平台标题")).toHaveValue(`${platform}标题-${marker}`);
  const caption = page.getByLabel("发布文案");
  if (await caption.count()) {
    await expect(caption).toHaveValue(`${platform}文案-${marker}`);
  } else if (platform === "公众号") {
    await expect(page.locator(".preview-editor")).toContainText(`${platform}正文-${marker}`);
  }
}

async function exportWechatPaths(page: Page, marker: string) {
  await selectPlatform(page, "公众号");
  const htmlDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "HTML" }).click();
  const htmlText = await readDownloadText(htmlDownload);
  expect(htmlText, `wechat html:${marker}`).toContain(`公众号正文-${marker}`);
  expect(htmlText, `wechat html:${marker}`).not.toMatch(/<script|onerror|onclick/i);

  await page.getByRole("button", { name: "复制微信富文本" }).click();
  await expect(page.getByText(/公众号富文本已复制|复制失败/)).toBeVisible();
}

async function exportCardPng(page: Page, platform: "小红书" | "抖音图文", marker: string) {
  await selectPlatform(page, platform);
  const expected = platform === "抖音图文" ? /douyinImage-1\.png$/ : /xiaohongshu-1\.png$/;
  await expect(page.getByText(platform === "抖音图文" ? /1080x1440|1080x1920/ : /1080x1440/).first()).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "PNG" }).first().click();
  await assertPngDownload(download, expected, `${platform} png:${marker}`);
}

async function grantClipboard(context: BrowserContext, baseURL?: string) {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], baseURL ? { origin: baseURL } : undefined);
}

test("TEST-001/020 unified entry saves, refreshes, deletes with confirmation, and keeps platform edits isolated", async ({ page }) => {
  await openWorkspace(page);
  await setSource(page, "markdown-headings");

  await selectPlatform(page, "公众号");
  await page.getByLabel("平台标题").fill("公众号独立修改");
  await page.getByText("自定义接口", { exact: true }).click();
  await generateCurrentPlatform(page);
  await expect(page.getByText(/AI 配置不完整/).first()).toBeVisible();
  await expect(page.getByLabel("平台标题")).toHaveValue("公众号独立修改");
  await page.getByText("本地", { exact: true }).click();
  await selectPlatform(page, "小红书");
  await expect(page.getByLabel("平台标题")).not.toHaveValue("公众号独立修改");
  await selectPlatform(page, "公众号");
  await expect(page.getByLabel("平台标题")).toHaveValue("公众号独立修改");

  await page.getByRole("button", { name: "保存项目" }).click();
  await expect(page.getByText("已保存到浏览器本地")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("项目名称")).toHaveValue(articleById("markdown-headings").title);
  await selectPlatform(page, "公众号");
  await expect(page.getByLabel("平台标题")).toHaveValue("公众号独立修改");

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("确定删除当前项目");
    await dialog.dismiss();
  });
  await runProjectMenuAction(page, "删除项目");
  await expect(page.getByLabel("项目名称")).toHaveValue(articleById("markdown-headings").title);

  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
  await runProjectMenuAction(page, "删除项目");
  await expect(page.getByText("项目已删除")).toBeVisible();
  await expect(page.getByLabel("项目名称")).toHaveValue("未命名项目");
});

test("分析源文只更新设计计划，生成操作才更新当前平台", async ({ page }) => {
  await openWorkspace(page);
  const source = "# 解析后的平台标题\n\n这段内容应该进入当前选中的小红书稿件。";
  const originalWechatTitle = await page.getByLabel("平台标题").inputValue();

  await page.getByLabel("源文 Markdown").fill(source);
  await selectPlatform(page, "小红书");
  const originalXhsTitle = await page.getByLabel("平台标题").inputValue();
  await page.getByRole("button", { name: "分析源文" }).click();

  await expect(page.getByText(/源文分析完成/)).toBeVisible();
  await expect(page.getByLabel("平台标题")).toHaveValue(originalXhsTitle);
  await generateCurrentPlatform(page);
  await expect(page.getByLabel("平台标题")).toHaveValue(/解析后的平台标题/);
  await expect(page.getByLabel("正文内容").first()).toHaveValue("这段内容应该进入当前选中的小红书稿件。");

  await selectPlatform(page, "公众号");
  await expect(page.getByLabel("平台标题")).toHaveValue(originalWechatTitle);
});

test("desktop workspace keeps the viewport fixed and scrolls the editor content area", async ({ page }) => {
  await openWorkspace(page);
  await setSource(page, "long-article");
  await selectPlatform(page, "小红书");

  const metrics = await page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>("[data-editor-scroll]");
    const preview = document.querySelector<HTMLElement>("[data-preview-scroll]");
    return {
      viewportHeight: window.innerHeight,
      bodyScrollHeight: document.body.scrollHeight,
      editorClientHeight: editor?.clientHeight ?? 0,
      editorScrollHeight: editor?.scrollHeight ?? 0,
      previewClientHeight: preview?.clientHeight ?? 0,
      previewScrollHeight: preview?.scrollHeight ?? 0,
    };
  });

  expect(metrics.bodyScrollHeight).toBeLessThanOrEqual(metrics.viewportHeight + 1);
  expect(metrics.editorClientHeight).toBeGreaterThan(0);
  expect(metrics.editorScrollHeight).toBeGreaterThan(metrics.editorClientHeight);
  expect(metrics.previewClientHeight).toBeGreaterThan(0);
  expect(metrics.previewScrollHeight).toBeGreaterThan(metrics.previewClientHeight);
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
  await selectPlatform(page, "公众号");
  await generateCurrentPlatform(page);

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
  const htmlText = await readDownloadText(htmlDownload);
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
  const desktopCard = await assertCardRatio(page, 1080, 1440);
  await expectCardScreenshot(desktopCard, "desktop-xiaohongshu-3x4-card.png");
  await expect(page.locator("[data-card-preview]")).toHaveCount(1);
  const pageTabs = page.getByRole("tab", { name: /第\d+页/ });
  expect(await pageTabs.count()).toBeGreaterThan(1);
  await pageTabs.nth(1).click();
  await expect(page.getByText(/轮播图预览 · 2\//)).toBeVisible();
  await pageTabs.nth(0).click();
  const xhsPackageDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载 ZIP" }).click();
  const { download: xhsPackage, zip: xhsZip } = await readDownloadZip(xhsPackageDownload);
  expect(xhsPackage.suggestedFilename()).toMatch(/xiaohongshu\.zip$/);
  expect(xhsZip.file("manifest.json")).not.toBeNull();
  expect(xhsZip.file("copy.txt")).not.toBeNull();
  expect(xhsZip.file("tags.txt")).not.toBeNull();
  await page.getByRole("button", { name: "排版方案" }).click();
  await page.getByRole("slider", { name: "正文字号" }).press("ArrowRight");
  await page.getByRole("button", { name: "关闭排版方案" }).click();
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
  await assertCardRatio(page, 1080, 1440);
  await page.getByRole("button", { name: "排版方案" }).click();
  await page.getByRole("group", { name: "图片比例" }).getByText("9:16").click();
  await page.getByRole("button", { name: "关闭排版方案" }).click();
  await expect(page.getByText(/1080x1920/).first()).toBeVisible();
  await assertCardRatio(page, 1080, 1920);
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
  await assertPngDownload(pngDownload, /-1\.png$/, "project png before image upload");

  await page.locator('input[type="file"][accept*="image/png"]').setInputFiles({
    name: "cover.png",
    mimeType: "image/png",
    buffer: onePixelPng,
  });
  await expect(page.getByText("已上传 1 张图片")).toBeVisible();
  await page.getByRole("button", { name: "cover.png" }).click();
  await selectPlatform(page, "小红书");
  await generateCurrentPlatform(page);

  await selectPlatform(page, "小红书");
  await expect(page.locator("img").first()).toBeVisible();

  const backupDownload = page.waitForEvent("download");
  await runProjectMenuAction(page, "导出项目");
  const { download: backup, zip } = await readDownloadZip(backupDownload);
  expect(backup.suggestedFilename()).toMatch(/backup\.zip$/);
  const backupPayload = JSON.parse(await zip.file("backup.json")!.async("text"));
  expect(backupPayload).toMatchObject({
    schemaVersion: 1,
    projects: [expect.objectContaining({ title: articleById("image-placeholder").title })],
    assets: [expect.objectContaining({ fileName: "cover.png", mimeType: "image/png" })],
  });
  expect(zip.file("project.json")).not.toBeNull();
  expect(zip.file("manifest.json")).not.toBeNull();
  const assetManifest = JSON.parse(await zip.file("assets/manifest.json")!.async("text")) as Array<{ path: string; fileName: string }>;
  expect(assetManifest).toEqual([expect.objectContaining({ fileName: "cover.png" })]);
  expect(assetManifest[0]?.path).toBeTruthy();
  expect(zip.file(assetManifest[0]!.path)).not.toBeNull();

  await page.reload();
  await expect(page.getByRole("button", { name: "cover.png" })).toBeVisible();

  await page.locator('input[type="file"][accept*="image/png"]').setInputFiles({
    name: "bad-select.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not an image"),
  });
  await expect(page.getByText(/图片上传失败：bad-select\.txt/)).toBeVisible();
  await expect(page.getByText(/仅支持 PNG、JPEG、WebP/)).toBeVisible();
  await expect(page.getByRole("button", { name: "bad-select.txt" })).toHaveCount(0);

  await page.locator("aside").first().evaluate((aside) => {
    const target = aside.firstElementChild ?? aside;
    const transfer = new DataTransfer();
    transfer.items.add(new File(["not an image"], "bad-drop.txt", { type: "text/plain" }));
    target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  await expect(page.getByText(/图片上传失败：bad-drop\.txt/)).toBeVisible();
  await expect(page.getByText(/仅支持 PNG、JPEG、WebP/)).toBeVisible();
  await expect(page.getByRole("button", { name: "bad-drop.txt" })).toHaveCount(0);
});

test("TEST-021/022/023/025 fixed articles cover 48 persisted platform versions and export paths without leaks or overflow", async ({ page, context, baseURL }) => {
  test.setTimeout(180_000);
  await grantClipboard(context, baseURL);
  await openWorkspace(page);

  for (const [articleIndex, article] of fixedArticles.entries()) {
    const marker = `case-${articleIndex + 1}`;
    await setSource(page, article.id, { acceptEditedOverwrite: articleIndex > 0 });

    for (const platform of ["公众号", "小红书", "抖音图文", "抖音长文"] as const) {
      await editActivePlatform(page, platform, marker);
      await assertPlatformSurfaceClean(page, `${article.id}:${platform}`);
      await assertNoHorizontalOverflow(page);
    }

    await page.getByRole("button", { name: "保存项目" }).click();
    await expect(page.getByText("已保存到浏览器本地")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("项目名称")).toHaveValue(article.title);

    for (const platform of ["公众号", "小红书", "抖音图文", "抖音长文"] as const) {
      await assertActivePlatformEdit(page, platform, marker);
      await assertNoHorizontalOverflow(page);
    }

    await exportWechatPaths(page, marker);
    await exportCardPng(page, "小红书", marker);
    await exportCardPng(page, "抖音图文", marker);

    await selectPlatform(page, "抖音长文");
    await page.getByRole("button", { name: "复制文案" }).click();
    await expect(page.getByText("文案已复制")).toBeVisible();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { message: `douyin longform text:${marker}` }).toContain(`抖音长文文案-${marker}`);
  }
});
