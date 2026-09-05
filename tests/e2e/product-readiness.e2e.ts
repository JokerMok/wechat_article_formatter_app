import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { productArticle } from "../fixtures/content/product-article";
import { parseSourceDocument } from "../../lib/article-parser";
import { markdownPublicationText } from "../../lib/content/markdown";

const platforms = ["公众号", "小红书", "抖音图文", "抖音长文"] as const;
const slugs = ["wechat", "xiaohongshu", "douyin-image", "douyin-long"];

async function select(page: Page, platform: string) {
  await page.getByRole("navigation", { name: "目标平台" }).getByRole("button", { name: new RegExp(`^${platform}(?:\\s|$)`) }).click();
}

test("real article and stress variants preserve copy and match canvas exports across all platforms", async ({ page }) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByLabel("源文 Markdown")).toBeVisible();
  const picture = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 720; canvas.height = 360;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#e8efe9"; ctx.fillRect(0, 0, 720, 360);
    ctx.fillStyle = "#204a36"; ctx.fillRect(48, 48, 624, 4);
    ctx.font = "bold 44px sans-serif"; ctx.fillText("企业 AI 项目记录", 48, 160);
    ctx.font = "24px sans-serif"; ctx.fillText("图片保存与导出验收素材", 48, 218);
    return canvas.toDataURL("image/png");
  });
  const cases = [
    ["article", productArticle],
    ["long", `${productArticle}\n\n${Array.from({ length: 5 }, () => productArticle.replace(/^# .*\n/, "")).join("\n\n")}`],
    ["images", `${productArticle.replace(/\n## /g, `\n![项目记录](${picture})\n\n## `)}`],
    ["headings", productArticle.replace("## 先做一个能看的版本", "## 先做一个能看的版本\n\n### 语音入口\n\n#### 数据范围\n\n##### 试用边界")],
    ["lists-quotes", `${productArticle}\n\n## 发布前核对\n\n3. 数据边界\n   - 已有大屏数据\n   - 非全量业务数据\n4. 文档口径\n\n> 第一阶段先做一个看得见的应用，不丢人。\n\n参考：[项目仓库](https://github.com/JokerMok/wechat_article_formatter_app)`],
  ];
  const folder = "artifacts/product-readiness";
  await mkdir(folder, { recursive: true });
  const results: Array<{ fixture: string; platform: string; pages: number }> = [];
  for (const [name, source] of cases) {
    await page.getByLabel("源文 Markdown").fill(source);
    for (const [index, platform] of platforms.entries()) {
      await select(page, platform);
      await page.getByRole("button", { name: "分析源文" }).click();
      await expect(page.locator("[data-source-analysis-status]")).toContainText(/分析完成/);
      await page.getByRole("button", { name: "生成", exact: true }).click();
      const confirm = page.getByRole("button", { name: "覆盖并生成" });
      if (await confirm.isVisible()) await confirm.click();
      await expect(page.getByLabel("源文 Markdown")).toHaveValue(source);
      await expect(page.locator("text=当前页有溢出")).toHaveCount(0);
      const stem = `${folder}/${name}-${slugs[index]}`;
      if (index === 0 || index === 3) {
        const content = page.locator(index === 0 ? "[data-wechat-preview]" : "[data-longform-preview]");
        await expect(content).toContainText("下面还缺什么");
        await expect(content).toContainText("原本我希望它能查更深的企业数据");
        if (name === "images") await expect(content.locator("img")).toHaveCount(7);
        await writeFile(`${stem}.html`, await content.innerHTML());
        results.push({ fixture: name, platform, pages: 1 });
      } else {
        const card = page.locator("[data-card-preview]");
        await expect(card).toHaveAttribute("data-render-ready", "true");
        const count = await page.getByRole("tab", { name: /第\d+页/ }).count();
        expect(count).toBeGreaterThan(0);
        results.push({ fixture: name, platform, pages: count });
        const renderedText: string[] = [];
        // Inspect every page, not just the cover, and retain all publication PNGs.
        for (let number = 0; number < count; number++) {
          await page.getByRole("tab", { name: `第${number + 1}页`, exact: true }).click();
          await expect(card).toHaveAttribute("data-render-ready", "true");
          await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
          const dataUrl = await card.locator("canvas").evaluate((node) => (node as HTMLCanvasElement).toDataURL("image/png"));
          await writeFile(`${stem}-${number + 1}.png`, Buffer.from(dataUrl.split(",")[1], "base64"));
          expect(await card.locator("figcaption").textContent()).not.toBe("");
          renderedText.push(...await card.locator("[data-content-node]").allTextContents());
          await expect(page.locator("text=当前页有溢出")).toHaveCount(0);
        }
        const expectedText = parseSourceDocument(source).blocks.filter((block) => block.type !== "divider" && block.type !== "pageBreak")
          .map((block) => block.type === "image" || block.type === "code" ? block.plainText : markdownPublicationText(block.markdown)).join("");
        const normalize = (text: string) => text.replace(/\s+/gu, "");
        expect(normalize(renderedText.join(""))).toBe(normalize(expectedText));
        await page.getByRole("tab", { name: "第1页", exact: true }).click();
        await expect(card).toHaveAttribute("data-render-ready", "true");
        const preview = await card.locator("canvas").evaluate((node) => (node as HTMLCanvasElement).toDataURL("image/png"));
        const downloaded = page.waitForEvent("download");
        await page.getByRole("button", { name: "PNG", exact: true }).click();
        const stream = await (await downloaded).createReadStream();
        const chunks: Buffer[] = [];
        for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
        const exported = Buffer.concat(chunks);
        await writeFile(`${stem}-export.png`, exported);
        const difference = await page.evaluate(async ([left, right]) => {
          const decode = async (url: string) => {
            const image = new Image(); image.src = url; await image.decode();
            const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
            const ctx = canvas.getContext("2d")!; ctx.drawImage(image, 0, 0);
            return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          };
          const a = await decode(left), b = await decode(right);
          let changed = 0;
          for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) changed++;
          return { changed, length: a.length, otherLength: b.length };
        }, [preview, `data:image/png;base64,${exported.toString("base64")}`]);
        expect(difference.otherLength).toBe(difference.length);
        expect(difference.changed).toBe(0);
      }
      await page.screenshot({ path: `${stem}-workspace.png` });
    }
  }
  await writeFile(`${folder}/matrix.json`, JSON.stringify({ results, browserErrors: errors }, null, 2));
  expect(errors).toEqual([]);
});
