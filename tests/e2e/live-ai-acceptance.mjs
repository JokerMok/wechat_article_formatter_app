import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { productArticle } from "../fixtures/content/product-article.ts";

// Run explicitly against a started server; never loads or prints provider credentials.
const baseUrl = process.env.AI_ACCEPTANCE_URL || "http://127.0.0.1:3010";
const output = "artifacts/product-readiness";
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const results = [];
const errors = [];
const requests = [];
page.on("pageerror", (error) => errors.push(error.name));
page.on("request", (request) => {
  if (request.method() === "POST" && /\/api\/ai\/(analyze|generate)$/.test(request.url())) requests.push(new URL(request.url()).pathname);
});
try {
  await page.goto(baseUrl);
  await page.getByLabel("源文 Markdown").fill(productArticle);
  await page.getByRole("group", { name: "内容处理方式" }).getByRole("button", { name: "传播力优化" }).click();
  await page.getByRole("group", { name: "生成引擎" }).getByRole("button", { name: "服务端 AI", exact: true }).click();
  if (process.env.AI_ACCEPTANCE_ACCESS_CODE) {
    await page.getByLabel("服务端 AI 访问口令").fill(process.env.AI_ACCEPTANCE_ACCESS_CODE);
    await page.getByRole("button", { name: "验证访问", exact: true }).click();
  }
  await page.getByText("服务端访问已验证", { exact: true }).waitFor();
  const analysis = page.waitForResponse((response) => response.url().endsWith("/api/ai/analyze"), { timeout: 125000 });
  analysis.catch(() => {});
  const analysisStart = Date.now();
  await page.getByRole("button", { name: "分析源文", exact: true }).click();
  const response = await analysis;
  const analyzed = await response.json();
  results.push({ stage: "analyze", status: response.status(), ok: analyzed.ok, elapsedMs: Date.now() - analysisStart });
  console.log(JSON.stringify(results.at(-1)));
  if (!analyzed.ok) throw new Error("Live analysis failed");
  await page.getByRole("heading", { name: "源文解析结果", level: 2 }).waitFor();
  for (const [name, platform] of [["公众号", "wechat"], ["小红书", "xiaohongshu"], ["抖音图文", "douyinImage"], ["抖音长文", "douyinLongform"]]) {
    await page.getByRole("navigation", { name: "目标平台" }).getByRole("button", { name: new RegExp("^" + name) }).click();
    const start = Date.now();
    const generated = page.waitForResponse((candidate) => candidate.url().endsWith("/api/ai/generate") && candidate.request().method() === "POST", { timeout: 125000 });
    generated.catch(() => {});
    await page.locator("header").getByRole("button", { name: "生成当前平台", exact: true }).click();
    const result = await generated;
    const data = await result.json();
    await page.getByRole("heading", { name: "平台版本编辑", level: 2 }).waitFor({ timeout: 15000 });
    const sourceUnchanged = await page.getByLabel("源文 Markdown").inputValue() === productArticle;
    const failed = await page.getByText("服务端 AI 生成失败", { exact: true }).count();
    const item = { platform, status: result.status(), elapsedMs: Date.now() - start, ok: data.ok && !failed, error: data.error?.code, sourceUnchanged };
    results.push(item);
    console.log(JSON.stringify(item));
    await page.screenshot({ path: `${output}/live-ai-${platform}.png` });
    if (!item.ok || !sourceUnchanged) throw new Error(`Live generation failed: ${platform}`);
  }
  if (requests.filter((path) => path.endsWith("/analyze")).length !== 1) throw new Error("Analysis was redundantly requested");
  if (errors.length) throw new Error("Browser runtime errors");
} catch (error) {
  process.exitCode = 1;
  console.error(error.name, error.message.slice(0, 240));
  await page.screenshot({ path: `${output}/live-ai-failure.png` }).catch(() => {});
} finally {
  await writeFile(`${output}/live-ai-results.json`, JSON.stringify({ results, requests, errors }, null, 2));
  await browser.close();
}
