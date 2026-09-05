import { expect, test, type Page } from "@playwright/test";
import { analyzeArticleDesign } from "../../lib/design-plan";

async function openWorkspace(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "生成当前平台", exact: true })).toBeEnabled();
}

async function projectAction(page: Page, name: string) {
  await page.getByRole("button", { name: "更多项目操作" }).click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}

for (const editedPending of [false, true]) {
  test(`hosted layout-only checks remote analysis cache without replacing manual pending: edited=${editedPending}`, async ({ page }) => {
    let analyses = 0;
    let generations = 0;
    await page.route("**/api/ai/analyze", async (route) => {
      analyses += 1;
      const { source, generationMode } = route.request().postDataJSON();
      expect(generationMode).toBe("layoutOnly");
      const plan = analyzeArticleDesign(source, { generationMode });
      await route.fulfill({ json: { ok: true, data: { blueprint: plan.blueprint, diagnostics: { provider: "openai-compatible" } } } });
    });
    await page.route("**/api/ai/generate", async (route) => {
      generations += 1;
      await route.abort();
    });
    await openWorkspace(page);
    await page.getByLabel("源文 Markdown").fill("# Source title\n\nLayout-only source body.");
    await page.getByRole("group", { name: "内容处理方式" }).getByRole("button", { name: "仅排版", exact: true }).click();
    await page.getByRole("button", { name: "分析源文", exact: true }).click();
    await expect(page.getByRole("heading", { name: "源文解析结果", level: 2, exact: true })).toBeVisible();
    expect(analyses).toBe(0);
    if (editedPending) await page.getByLabel("正文内容").first().fill("Authorized pending body.");
    await page.getByRole("group", { name: "生成引擎" }).getByRole("button", { name: "服务端 AI" }).click();
    await page.getByRole("button", { name: "生成当前平台", exact: true }).click();
    await expect(page.getByRole("heading", { name: "平台版本编辑", level: 2, exact: true })).toBeVisible();
    await expect(page.locator("[data-wechat-preview]")).toContainText(editedPending ? "Authorized pending body." : "Layout-only source body.");
    expect(analyses).toBe(editedPending ? 0 : 1);
    expect(generations).toBe(0);
    if (!editedPending) {
      await page.getByRole("button", { name: "生成当前平台", exact: true }).click();
      await expect(page.getByRole("button", { name: "生成当前平台", exact: true })).toBeEnabled();
      expect(analyses).toBe(1);
      expect(generations).toBe(0);
    }
  });
}

for (const entry of ["header", "editor"] as const) {
  test(`local ${entry} generation consumes edited pending and repeated analysis preserves it`, async ({ page }) => {
    await openWorkspace(page);
    const original = "# Source article\n\nOriginal source body.";
    await page.getByLabel("源文 Markdown").fill(original);
    await page.getByRole("button", { name: "分析源文", exact: true }).click();
    await expect(page.getByRole("heading", { name: "源文解析结果", level: 2, exact: true })).toBeVisible();
    await page.getByLabel("平台标题").fill("Authorized pending title");
    await page.getByLabel("正文内容").first().fill("Authorized pending body.");
    await page.getByRole("button", { name: "分析源文", exact: true }).click();
    await expect(page.getByLabel("正文内容").first()).toHaveValue("Authorized pending body.");
    await page.getByRole("button", { name: entry === "header" ? "生成当前平台" : "生成", exact: true }).click();
    await expect(page.getByRole("heading", { name: "平台版本编辑", level: 2, exact: true })).toBeVisible();
    await expect(page.locator("[data-wechat-preview]")).toContainText("Authorized pending body.");
    await expect(page.getByLabel("平台标题")).toHaveValue("Authorized pending title");
    await expect(page.getByLabel("源文 Markdown")).toHaveValue(original);
  });
}

for (const manualTheme of [false, true]) {
  test(`AI uses authorized pending as source and chooses the correct theme: manual=${manualTheme}`, async ({ page }) => {
    const analysisSources: string[] = [];
    const generationSources: string[] = [];
    await page.route("**/api/ai/analyze", async (route) => {
      const { source, generationMode } = route.request().postDataJSON();
      analysisSources.push(source.sourceText);
      const plan = analyzeArticleDesign(source, { generationMode });
      await route.fulfill({ json: { ok: true, data: { blueprint: plan.blueprint, diagnostics: { provider: "openai-compatible" } } } });
    });
    await page.route("**/api/ai/generate", async (route) => {
      const { source, analysis } = route.request().postDataJSON();
      generationSources.push(source.sourceText);
      expect(source.title).toBe("人工确认的标题");
      expect(source.segments.some((segment: { text: string }) => segment.text === "人工确认的业务边界需要复核。")).toBe(true);
      expect(analysis.sections.every((section: { sourceBlockIds: string[] }) => section.sourceBlockIds.every((id) => source.blocks.some((block: { id: string }) => block.id === id)))).toBe(true);
      const plan = analyzeArticleDesign(source, { generationMode: "reachOptimized" });
      await route.fulfill({ json: { ok: true, data: { response: { schemaVersion: 1, editorialPlans: [plan.platformPlans.wechat.editorialPlan] }, diagnostics: { provider: "openai-compatible" } } } });
    });
    await openWorkspace(page);
    if (manualTheme) {
      await page.getByRole("button", { name: "排版方案", exact: true }).click();
      const card = page.getByLabel("排版方案与画布设置").locator("article").filter({ has: page.getByRole("heading", { name: "B 高能信息卡", exact: true }) });
      await card.getByRole("button", { name: /应用方案|调整应用方式/ }).click();
      await page.getByRole("button", { name: "只换主题", exact: true }).click();
      await page.getByRole("button", { name: "关闭排版方案" }).click();
    }
    const original = "# 业务判断\n\n企业 AI 项目需要先验证数据边界。";
    await page.getByLabel("源文 Markdown").fill(original);
    await page.getByRole("group", { name: "内容处理方式" }).getByRole("button", { name: "传播力优化" }).click();
    await page.getByRole("button", { name: "分析源文", exact: true }).click();
    await expect(page.getByRole("heading", { name: "源文解析结果", level: 2, exact: true })).toBeVisible();
    await page.getByLabel("平台标题").fill("人工确认的标题");
    await page.getByLabel("正文内容").first().fill("人工确认的业务边界需要复核。");
    await page.getByRole("group", { name: "生成引擎" }).getByRole("button", { name: "服务端 AI" }).click();
    await page.getByRole("button", { name: "生成当前平台", exact: true }).click();
    if (manualTheme) await page.getByRole("button", { name: "覆盖并生成", exact: true }).click();
    await expect(page.getByRole("heading", { name: "平台版本编辑", level: 2, exact: true })).toBeVisible();
    expect(analysisSources).toHaveLength(1);
    expect(generationSources).toEqual(analysisSources);
    expect(generationSources[0]).toContain("人工确认的业务边界需要复核。");
    expect(generationSources[0]).not.toContain("企业 AI 项目需要先验证数据边界。");
    await expect(page.locator("[data-wechat-preview]")).toContainText("人工确认的业务边界需要复核。");
    await expect(page.getByLabel("源文 Markdown")).toHaveValue(original);
    await page.getByRole("button", { name: "排版方案", exact: true }).click();
    await expect(page.getByLabel("排版方案与画布设置").getByText(manualTheme ? "公众号 · B 高能信息卡" : "公众号 · A 编辑部简约", { exact: true })).toBeVisible();
  });
}

test("edited parsed drafts survive opening another project and importing a backup", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await openWorkspace(page);
  await page.getByLabel("项目名称").fill("Pending draft recovery");
  await page.getByLabel("源文 Markdown").fill("# Source title\n\nSource paragraph.");
  await page.getByRole("button", { name: "分析源文", exact: true }).click();
  await expect(page.getByRole("heading", { name: "源文解析结果", level: 2, exact: true })).toBeVisible();
  await page.getByLabel("平台标题").fill("Manual pending title");
  await page.getByLabel("正文内容").first().fill("Manual pending paragraph.");
  await page.getByRole("button", { name: "保存项目", exact: true }).click();
  await expect(page.getByText("已保存到浏览器本地", { exact: true })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await projectAction(page, "导出项目");
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  if (!stream) throw new Error("Backup stream unavailable");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));

  await projectAction(page, "新建项目");
  await expect(page.getByLabel("项目名称")).toHaveValue("未命名项目");
  await page.getByLabel("打开项目").click();
  await page.getByText("Pending draft recovery", { exact: true }).click();
  await expect(page.getByLabel("平台标题")).toHaveValue("Manual pending title");
  await expect(page.getByLabel("正文内容").first()).toHaveValue("Manual pending paragraph.");
  await expect(page.getByRole("heading", { name: "源文解析结果", level: 2, exact: true })).toBeVisible();
  await expect(page.locator("[data-wechat-preview]")).not.toContainText("Manual pending paragraph.");

  await page.locator('input[type="file"][accept*=".zip"]').setInputFiles({
    name: download.suggestedFilename(), mimeType: "application/zip", buffer: Buffer.concat(chunks),
  });
  await expect(page.getByText(/项目备份已导入/)).toBeVisible();
  await expect(page.getByLabel("平台标题")).toHaveValue("Manual pending title");
  await expect(page.getByLabel("正文内容").first()).toHaveValue("Manual pending paragraph.");
  await expect(page.getByRole("heading", { name: "源文解析结果", level: 2, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "保存项目", exact: true }).click();
  await expect(page.getByText("已保存到浏览器本地", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("平台标题")).toHaveValue("Manual pending title");
  await expect(page.getByLabel("正文内容").first()).toHaveValue("Manual pending paragraph.");
});

test("Wechat input autosaves before blur and does not move the selection", async ({ page }) => {
  await openWorkspace(page);
  const preview = page.locator("[data-wechat-preview]");
  await preview.fill("Preview edit without blur");
  await preview.press("End");
  await preview.press("!");
  await expect(preview).toBeFocused();
  await expect(page.getByText("已保存到浏览器本地", { exact: true })).toBeVisible();
  await expect(preview).toBeFocused();
  expect(await preview.evaluate((element) => {
    const selection = window.getSelection();
    return selection?.anchorNode && element.contains(selection.anchorNode)
      ? selection.anchorOffset === selection.anchorNode.textContent?.length
      : false;
  })).toBe(true);
  await page.reload();
  await expect(preview).toContainText("Preview edit without blur!");
});

for (const editTarget of ["parsed", "wechat", "unchanged"] as const) {
  test(`AI completion preserves current edits: ${editTarget}`, async ({ page }) => {
    let releaseResponse!: () => void;
    const responseGate = new Promise<void>((resolve) => { releaseResponse = resolve; });
    let notifyRequest!: () => void;
    const requestStarted = new Promise<void>((resolve) => { notifyRequest = resolve; });
    await page.route("**/api/ai/analyze", async (route) => {
      const { source, generationMode } = route.request().postDataJSON();
      const plan = analyzeArticleDesign(source, { generationMode });
      await route.fulfill({ json: { ok: true, data: { blueprint: plan.blueprint, diagnostics: { provider: "openai-compatible" } } } });
    });
    await page.route("**/api/ai/generate", async (route) => {
      const { source } = route.request().postDataJSON();
      const plan = analyzeArticleDesign(source, { generationMode: "reachOptimized" });
      notifyRequest();
      await responseGate;
      await route.fulfill({ json: {
        ok: true,
        data: { response: { schemaVersion: 1, editorialPlans: [plan.platformPlans.wechat.editorialPlan] }, diagnostics: { provider: "openai-compatible" } },
      } });
    });
    await openWorkspace(page);
    await page.getByLabel("源文 Markdown").fill("# A source title\n\nA complete source paragraph.");
    await page.getByRole("group", { name: "内容处理方式" }).getByRole("button", { name: "传播力优化" }).click();
    await page.getByRole("group", { name: "生成引擎" }).getByRole("button", { name: "服务端 AI" }).click();
    const preview = page.locator("[data-wechat-preview]");
    const originalHtml = await preview.innerHTML();
    await page.getByRole("button", { name: "生成当前平台", exact: true }).click();
    await requestStarted;
    await expect(page.getByRole("heading", { name: "源文解析结果", level: 2, exact: true })).toBeVisible();
    const pendingTitle = await page.getByLabel("平台标题").inputValue();
    try {
      if (editTarget === "parsed") {
        await page.getByLabel("平台标题").fill("Edited during generation");
        await page.getByLabel("正文内容").first().fill("Body edited during generation.");
      } else if (editTarget === "wechat") {
        await preview.fill("Preview edited during generation");
      } else {
        await preview.focus();
      }
    } finally {
      releaseResponse();
    }
    await expect(page.getByRole("button", { name: "生成当前平台", exact: true })).toBeEnabled();
    if (editTarget === "unchanged") {
      await expect(page.getByRole("heading", { name: "平台版本编辑", level: 2, exact: true })).toBeVisible();
      await expect(preview).toContainText("A complete source paragraph.");
    } else {
      await expect(page.getByText(/生成期间稿件已修改/).first()).toBeVisible();
      await expect(page.getByRole("heading", { name: "源文解析结果", level: 2, exact: true })).toBeVisible();
      await expect(page.getByLabel("平台标题")).toHaveValue(editTarget === "parsed" ? "Edited during generation" : pendingTitle);
      if (editTarget === "parsed") {
        await expect(page.getByLabel("正文内容").first()).toHaveValue("Body edited during generation.");
        expect(await preview.innerHTML()).toBe(originalHtml);
      } else {
        await expect(preview).toContainText("Preview edited during generation");
      }
      await page.getByRole("button", { name: "保存项目", exact: true }).click();
      await expect(page.getByText("已保存到浏览器本地", { exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByRole("heading", { name: "源文解析结果", level: 2, exact: true })).toBeVisible();
      await expect(page.getByLabel("平台标题")).toHaveValue(editTarget === "parsed" ? "Edited during generation" : pendingTitle);
      if (editTarget === "wechat") await expect(preview).toContainText("Preview edited during generation");
    }
  });
}
