import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { createArticleLayout } from "../../lib/studio/article-layout";
import { layoutRequestSchema } from "../../lib/studio/layout-contract";
const output = path.join(process.cwd(), "artifacts/style-studio");
const importOutput = path.join(output, "whole-article-import");
const ownPng =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/D1sAAAAASUVORK5CYII=";
const source = `# 阅读里的新发现\n\n2026 年，Acme 保留 **42%** 的原始记录。\n\n## 让设计服务内容\n\n这一段保持原有文字和专有名词。\n\n> 好的排版给阅读留一点空间。\n\n- 第一项\n- 第二项\n\n![我的图片](data:image/png;base64,${ownPng})\n\n图片后还有结尾。`;
const canvasOf = (page: Page) =>
  page.getByRole("article", { name: "文章编辑画布" });
const emptyPaste = (page: Page) =>
  page.getByRole("textbox", { name: "粘贴整篇文章" });

async function startBlank(page: Page) {
  await page.getByRole("button", { name: "排版我的文章", exact: true }).click();
  await expect(emptyPaste(page)).toBeFocused();
}
async function pasteClipboard(
  page: Page,
  data: { text?: string; html?: string; png?: string },
) {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(async ({ text, html, png }) => {
    if (!html && !png) {
      await navigator.clipboard.writeText(text ?? "");
      return;
    }
    const parts: Record<string, Blob> = {};
    if (text) parts["text/plain"] = new Blob([text], { type: "text/plain" });
    if (html) parts["text/html"] = new Blob([html], { type: "text/html" });
    if (png) parts["image/png"] = await (await fetch(png)).blob();
    await navigator.clipboard.write([new ClipboardItem(parts)]);
  }, data);
  await page.keyboard.press("ControlOrMeta+v");
}
async function articleImage(page: Page) {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 260;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#e4eee6";
    ctx.fillRect(0, 0, 640, 260);
    ctx.fillStyle = "#b3cfbb";
    ctx.beginPath();
    ctx.arc(535, 40, 155, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#21634a";
    ctx.fillRect(50, 65, 7, 125);
    ctx.font = "500 32px sans-serif";
    ctx.fillText("给阅读留一点空间", 80, 115);
    ctx.fillStyle = "#597661";
    ctx.font = "18px sans-serif";
    ctx.fillText("原创图片 · 排版验证素材", 80, 155);
    return canvas.toDataURL("image/png");
  });
}
async function importSource(page: Page) {
  await startBlank(page);
  const image = await articleImage(page);
  await pasteClipboard(page, {
    text: source.replace(ownPng, image.split(",")[1]),
  });
  await expect(
    page.getByRole("article", { name: "文章编辑画布" }),
  ).toContainText("42%");
}
async function setRange(page: Page, label: string, value: number) {
  await page
    .getByRole("slider", { name: label, exact: true })
    .evaluate((el, v) => {
      const input = el as HTMLInputElement;
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, String(v));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
}
test.beforeAll(async () => {
  await fs.mkdir(importOutput, { recursive: true });
});
test.beforeEach(async ({ page }) => {
  await page.route("**/api/ai/article-layout", (route) => {
    const request = layoutRequestSchema.parse(route.request().postDataJSON());
    return route.fulfill({ json: { data: createArticleLayout(request) } });
  });
});

test("whole article clipboard imports 24 paragraphs, then edits, undoes and restores on refresh", async ({
  page,
}) => {
  await page.goto("/");
  await startBlank(page);
  await expect(
    canvasOf(page).getByRole("button", { name: "添加段落" }),
  ).toHaveCount(0);
  await page.screenshot({ path: path.join(importOutput, "01-empty.png") });
  const paragraphs = [
    "上周六清晨，我从旧桥北侧下到河岸。昨夜下过雨，石阶边缘还留着一条水线。",
    "前一晚我把手电和笔记本装进包里，临出门才发现今天只需要一支笔。",
    "沿河跑步的人已经过了第一座桥。我们在窄处停下来，各自让出半步。",
    "河面比想象中平静。桥下的反光被桥墩分成两块，水位比上次略高。",
    "我在栏杆上看到三道不同颜色的刻痕，暂时无法确认其中哪道是原来的水位标记。",
    "上游的灌木刚修剪过，留下的细枝沿着护栏堆成一排。",
    "刚拐过堤岸的第二道弯，\n一群麻雀从草坡飞向低处的电线。",
    "我停下脚步补记时间，等前面那辆自行车过去才重新出发。",
    "石板路尽头的木牌已经褪色，背面还有去年贴过告示的胶痕。",
    "过桥后有人正在摆摊。他把货架的短脚垫起来，让边上的排水沟露在外面。",
    "水面上飘着两片树叶，一片停在桥孔前，另一片沿着河心继续向下游。",
    "我把观察顺序写进纸本，给后续复查留出同样的起点。",
    "走到第四个路口时，雾已经散了，南岸的窗户开始映出太阳。",
    "下一段路多了几张长椅。靠近水边的那张还湿着，另一张下面有落叶。",
    "为了看清岸边长草的位置，我沿着水线往回走了十几步。",
    "远处传来清扫车的声音，桥下正在交谈的两人抬起头看了一眼。",
    "一条小船停在支流入口，绳索绑在一根红色柱子上。",
    "我从背包里拿出地图，把这段新开的步道圈出来。",
    "一处断开的路标需要下次确认。只看当天照片，无法判断它什么时候换过。",
    "午前的人流逐渐增加。沿岸的石阶上，有人在等朋友，也有人在整理渔具。",
    "过了最后一座桥，我顺手买了一杯热茶，坐下来核对照片的拍摄顺序。",
    "有两张照片从同一个角度拍摄。我保留了两张，因为中间的水位已经有了变化。",
    "返程时我补记了一条线索。下次从南岸出发，应该能看清桥墩旁那片缓流。",
    "到家以后，先把现场顺序录入文档。解释和判断留到第二次回访之后。",
  ];
  await pasteClipboard(page, { text: paragraphs.join("\n\n") });
  const canvas = canvasOf(page);
  const fields = canvas.getByRole("textbox", { name: "编辑正文", exact: true });
  await expect(fields).toHaveCount(24);
  await expect(
    canvas.getByRole("textbox", { name: "编辑文章标题" }),
  ).toHaveCount(0);
  for (const [i, paragraph] of paragraphs.entries())
    await expect(fields.nth(i)).toHaveText(paragraph.replace("\n", ""));
  await page.screenshot({
    path: path.join(importOutput, "02-long-article.png"),
  });

  const field = fields.nth(11);
  await field.fill("第 12 段已经现场修订。");
  await field.press("ControlOrMeta+z");
  await expect(field).toHaveText(paragraphs[11]);
  await field.press("ControlOrMeta+Shift+z");
  await expect(field).toHaveText("第 12 段已经现场修订。");
  await page.getByRole("button", { name: "桌面预览" }).click();
  await expect(page.locator(".studio-paper.desktop")).toBeVisible();
  await page.getByRole("button", { name: "手机预览" }).click();
  await expect(page.locator(".studio-paper.mobile")).toBeVisible();
  await expect(page.getByText("已自动保存", { exact: true })).toBeVisible();
  await page.reload();
  await expect(fields).toHaveCount(24);
  await expect(field).toHaveText("第 12 段已经现场修订。");
  await field.fill("刷新后继续修改第 12 段。");
  await expect(field).toHaveText("刷新后继续修改第 12 段。");
  await field.click();
  await canvas.getByRole("button", { name: "下移当前块" }).click();
  await expect(fields.nth(12)).toHaveText("刷新后继续修改第 12 段。");
  await canvas.getByRole("button", { name: "删除当前块" }).click();
  await expect(fields).toHaveCount(23);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(fields).toHaveCount(24);
  await canvas.getByRole("button", { name: "段落", exact: true }).click();
  await expect(fields).toHaveCount(25);
});

test("whole article clipboard keeps rich structure and pictures across three themes", async ({
  browser,
  baseURL,
}, testInfo) => {
  const size = { width: 1440, height: 1000 };
  const recorded = await browser.newContext({
    baseURL,
    viewport: size,
    recordVideo: { dir: testInfo.outputPath("video"), size },
  });
  const page = await recorded.newPage();
  try {
    await page.goto("/");
    await startBlank(page);
    const image = await articleImage(page);
    await page.waitForTimeout(950); // Hold the blank canvas in the recording.
    await pasteClipboard(page, {
      text: "沿河的观察手记\n清晨第一站，记录从河岸开始。",
      html: `<section style="font-size:40px;color:red"><h1>沿河的观察手记</h1>
        <p>清晨第一站，记录从河岸开始。先看<a href="https://example.com/notes">观察记录</a>。</p>
        <h2>现场摘记</h2><p>几条短笔记留给下一次回访。</p>
        <p><img alt="原创河岸插图" data-src="${image}"></p>
        <h3>记录方法</h3><ol start="3"><li>确认地点<ul><li>补上坐标</li></ul></li><li>保留现场原图</li></ol>
        <blockquote><p>先记录，再解释。</p></blockquote>
        <h4>附记</h4><p>当天的原始材料保留在项目里。</p></section>`,
    });
    const canvas = canvasOf(page);
    await expect(canvas.locator("[data-block-id]")).toHaveCount(10);
    await expect(canvas.locator("a")).toHaveAttribute(
      "href",
      "https://example.com/notes",
    );
    await expect(canvas.locator("ol")).toHaveAttribute("start", "3");
    await expect(canvas.locator("ol ul li")).toHaveText("补上坐标");
    const imageNode = canvas.getByRole("img", { name: "原创河岸插图" });
    await expect
      .poll(() => imageNode.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBe(640);
    const content = () =>
      canvas
        .locator("[data-block-id]")
        .evaluateAll((nodes) =>
          nodes.map((node) => [
            node.className,
            node
              .querySelector(".studio-editable")
              ?.innerHTML.replace(/ style="[^"]*"/g, ""),
            node.querySelector("img")?.getAttribute("src"),
          ]),
        );
    const original = await content();
    const palettes = ["墨色书页", "蓝调观察", "林间来信"];
    const appearances = new Set();
    for (const [index, style] of palettes.entries()) {
      await page.waitForTimeout(850); // Leave time to compare the rendered styles in the recording.
      await page
        .getByRole("button", { name: `预览风格 ${style}`, exact: true })
        .click();
      if (await page.getByRole("button", { name: "确认应用" }).count())
        await page.getByRole("button", { name: "确认应用" }).click();
      await expect(page.locator(".studio-style-state")).toContainText(style);
      expect(await content()).toEqual(original);
      appearances.add(
        await canvas.evaluate((el) => {
          const css = getComputedStyle(el);
          return [
            css.backgroundColor,
            css.color,
            css.fontFamily,
            css.fontSize,
          ].join("|");
        }),
      );
      await page.screenshot({
        path: path.join(importOutput, `03-theme-${index + 1}.png`),
      });
    }
    expect(appearances.size).toBe(3);
    const edited = canvas
      .getByRole("textbox", { name: "编辑正文", exact: true })
      .last();
    await edited.fill("当天的原始材料已补充一张现场照片。");
    await expect(edited).toContainText("已补充");
    await edited.press("ControlOrMeta+z");
    await expect(edited).toContainText("保留在项目里");
    await page.waitForTimeout(800);
  } finally {
    await recorded.close();
  }
  await page
    .video()
    ?.saveAs(path.join(importOutput, "whole-article-demo.webm"));
});

test("whole article Word file imports body, headings, list, table and both pictures", async ({
  page,
}) => {
  await page.goto("/");
  await startBlank(page);
  const chooser = page.waitForEvent("filechooser");
  await canvasOf(page).getByRole("button", { name: "导入文件" }).click();
  await (
    await chooser
  ).setFiles(
    path.join(process.cwd(), "tests/e2e/fixtures/article-import.docx"),
  );
  const canvas = canvasOf(page);
  await expect(canvas).toContainText("沿河的记录");
  await expect(canvas.locator(".studio-block-heading")).toContainText(
    "现场笔记",
  );
  await expect(canvas.locator(".studio-block-subheading")).toContainText(
    "补充材料",
  );
  await expect(canvas.locator("ul > li")).toHaveCount(2);
  await expect(canvas.locator("table tr")).toHaveCount(2);
  await expect(canvas.locator("table img")).toHaveAttribute(
    "alt",
    "表内现场图",
  );
  await expect(canvas.locator("img")).toHaveCount(2);
  await expect
    .poll(() =>
      canvas
        .locator("img")
        .evaluateAll((images: HTMLImageElement[]) =>
          images.map((image) => image.naturalWidth),
        ),
    )
    .toEqual([480, 480]);
  await expect(
    canvas.locator(".studio-block-image + .studio-block-paragraph"),
  ).toContainText("排在插图之后");
  await expect(page.getByText("已自动保存", { exact: true })).toBeVisible();
  await page.reload();
  await expect(canvas.locator("table img")).toBeVisible();
  await expect(canvas.locator("img")).toHaveCount(2);
  await page.screenshot({ path: path.join(importOutput, "04-word.png") });
});

test("whole article Markdown auto-detection and plain writing work in the blank canvas", async ({
  page,
}) => {
  await page.goto("/");
  await startBlank(page);
  await pasteClipboard(page, {
    text: "# 行走的路线\n\n## 第一站\n\n- 左岸\n- 右岸\n\n> 留下一条观察笔记。",
  });
  const canvas = canvasOf(page);
  await expect(canvas.locator(".studio-block-title")).toContainText(
    "行走的路线",
  );
  await expect(canvas.locator(".studio-block-heading")).toContainText("第一站");
  await expect(canvas.locator("ul > li")).toHaveCount(2);
  await expect(canvas.locator(".studio-block-quote")).toContainText(
    "留下一条观察笔记",
  );
  await page.screenshot({ path: path.join(importOutput, "05-markdown.png") });
  await page.getByRole("button", { name: "返回稿件列表" }).click();
  await startBlank(page);
  await page.keyboard.insertText("直接写下第一句。");
  const first = canvas.getByRole("textbox", { name: "编辑正文", exact: true });
  await expect(first).toBeFocused();
  await page.keyboard.insertText("接着写。");
  await expect(first).toHaveText("直接写下第一句。接着写。");
});

test("whole article partial import keeps text, accepts pasted and dropped images", async ({
  page,
}) => {
  await page.goto("/");
  await startBlank(page);
  const image = await articleImage(page);
  await pasteClipboard(page, {
    text: "导入损坏图片前的原文。\n导入损坏图片后的原文。",
    html: '<p>导入损坏图片前的原文。</p><img src="data:image/png;base64,broken" alt="损坏图片"><p>导入损坏图片后的原文。</p>',
  });
  const canvas = canvasOf(page);
  await expect(
    canvas.getByRole("textbox", { name: "编辑正文", exact: true }),
  ).toHaveCount(2);
  await expect(
    page.getByRole("alert").filter({ hasText: "部分内容未能导入" }),
  ).toContainText("图片无法解码");
  await pasteClipboard(page, { png: image });
  await expect(canvas.locator("img")).toHaveCount(1);
  const transfer = await page.evaluateHandle(async (url) => {
    const data = new DataTransfer();
    const png = await (await fetch(url)).blob();
    data.items.add(new File([png], "拖入的图片.png", { type: "image/png" }));
    return data;
  }, image);
  const first = canvas
    .getByRole("textbox", { name: "编辑正文", exact: true })
    .first();
  await first.dispatchEvent("dragover", { dataTransfer: transfer });
  await first.dispatchEvent("drop", { dataTransfer: transfer });
  await expect(
    canvas
      .locator(".studio-block-paragraph + .studio-block-image")
      .first()
      .getByRole("img"),
  ).toHaveAttribute("alt", "拖入的图片.png");
  await expect(canvas.locator("img")).toHaveCount(2);
  await expect(canvas).toContainText("导入损坏图片后的原文。");
});

test("whole article imports Markdown, HTML and TXT files directly onto the canvas", async ({
  page,
}) => {
  await page.goto("/");
  for (const [name, mimeType, content, expected, selector] of [
    [
      "notes.md",
      "text/markdown",
      "# 文件标题\n\n- 一条记录",
      "文件标题",
      ".studio-block-title",
    ],
    [
      "notes.html",
      "text/html",
      "<h2>文件小节</h2><p>正文。</p>",
      "文件小节",
      ".studio-block-heading",
    ],
    [
      "notes.txt",
      "text/plain",
      "第一段文字。\r\n\r\n第二段文字。",
      "第一段文字。",
      ".studio-block-paragraph:first-child",
    ],
  ]) {
    await startBlank(page);
    const file = page.waitForEvent("filechooser");
    await canvasOf(page).getByRole("button", { name: "导入文件" }).click();
    await (
      await file
    ).setFiles({ name, mimeType, buffer: Buffer.from(content) });
    await expect(canvasOf(page).locator(selector)).toHaveText(expected);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "返回稿件列表" }).click();
  }
});
test("whole import automatically attempts one semantic layout and retains rules when AI is unavailable", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/ai/article-layout", (route) => {
    requests++;
    return route.fulfill({
      status: 503,
      json: { error: { message: "测试中排版模型暂不可用。" } },
    });
  });
  await page.goto("/");
  await startBlank(page);
  await pasteClipboard(page, {
    text: "这是一次排查的记录。我们从同一组观测数据出发，逐个核对处理环节并比对实际结果。\n\n一、记录现象\n\n实测发现重试时会出现明显的画面卡顿，样本和测试条件已按原文记录。",
  });
  const canvas = canvasOf(page);
  await expect(canvas.locator('[data-layout-component="chapter"]')).toHaveCount(
    1,
  );
  await page.getByRole("button", { name: "智能排版", exact: true }).click();
  const layout = page.getByRole("dialog", { name: "智能排版", exact: true });
  await expect(layout.getByRole("status")).toContainText(
    "测试中排版模型暂不可用",
  );
  await page.getByRole("button", { name: "关闭面板", exact: true }).click();
  await page
    .getByRole("region", { name: "快速风格切换" })
    .getByRole("button", { name: "预览风格 蓝调观察", exact: true })
    .click();
  const text = canvas
    .getByRole("textbox", { name: "编辑正文", exact: true })
    .last();
  await text.fill("修改这一个内容块。");
  expect(requests).toBe(1);
  await expect(canvas).toContainText("一、记录现象");
});
test("article editing, themes, local overrides, history, refresh and WeChat exports", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "我的工作台", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(output, "home-desktop.png"),
    fullPage: true,
  });
  await importSource(page);
  const canvas = page.getByRole("article", { name: "文章编辑画布" });
  const paragraph = canvas
    .getByRole("textbox", { name: "编辑正文", exact: true })
    .first();
  await paragraph.click();
  await paragraph.fill("2026 年，Acme 保留 42% 的原始记录。已人工编辑。");
  await paragraph.press("ControlOrMeta+z");
  await expect(paragraph).not.toContainText("已人工编辑");
  await paragraph.press("ControlOrMeta+Shift+z");
  await expect(paragraph).toContainText("已人工编辑");
  await setRange(page, "字号", 21);
  await expect(paragraph.locator("..")).toHaveCSS("font-size", "21px");
  const blue = page
    .getByRole("region", { name: "快速风格切换" })
    .getByRole("button", { name: "预览风格 蓝调观察", exact: true });
  await blue.click();
  await expect(canvas.locator(".studio-block-quote")).toHaveCSS(
    "background-color",
    "rgb(241, 245, 251)",
  );
  await expect(blue.locator(".studio-block-quote")).toHaveCSS(
    "background-color",
    "rgb(241, 245, 251)",
  );
  await page.getByRole("button", { name: "确认应用", exact: true }).click();
  await expect(paragraph).toContainText("已人工编辑");
  await expect(paragraph.locator("..")).toHaveCSS("font-size", "21px");
  expect(await canvas.locator("img").count()).toBe(1);
  await page.getByRole("button", { name: "比较风格", exact: true }).click();
  await expect(page.locator(".studio-comparison-grid > section")).toHaveCount(
    3,
  );
  await expect(page.locator(".studio-comparison-grid")).toContainText("42%");
  await page.getByRole("button", { name: "手机预览", exact: true }).click();
  await expect(page.getByText("已自动保存", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "文章排版", exact: true }).click();
  await expect(
    page.getByRole("article", { name: "文章编辑画布" }),
  ).toContainText("已人工编辑");
  await expect(
    page.getByRole("article", { name: "文章编辑画布" }).locator("img"),
  ).toHaveCount(1);
  await page.screenshot({
    path: path.join(output, "editor-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "编辑历史", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("保留最近 30");
  await page.getByRole("button", { name: "关闭面板" }).click();
  await page.getByRole("button", { name: "导出", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("样式已内联");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载正文 HTML" }).click();
  const download = await downloadPromise;
  const file = await download.path();
  const html = await fs.readFile(file!, "utf8");
  expect(html).toContain("42%");
  expect(html).toContain("<img");
  expect(html).toContain("style=");
  expect(html).not.toMatch(/class=|data-block-id|<script/);
  await page.getByRole("button", { name: "复制公众号图文" }).click();
  await expect(
    page.getByText("图文已复制，请在公众号后台粘贴并核对。", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭面板" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: path.join(output, "editor-mobile.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("learn HTML reference, compare actual capture, save reusable style and handle private URL", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "学习新风格", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "HTML", exact: true }).click();
  await page
    .getByRole("textbox", { name: "参考 HTML / 富文本", exact: true })
    .fill(
      '<article><h1 style="font-size:30px">紫色阅读笔记</h1><h2 style="font-size:24px;color:#773399">小标题</h2><p style="font-size:17px;line-height:34px;margin-bottom:22px">这是一篇受控测试参考，用于验证真实计算样式和实际截图，不作为真实客户文章验收证据。</p><blockquote style="background:#eee6f0;padding:18px">引用文字</blockquote></article>',
    );
  await page.getByRole("button", { name: "提取风格", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "风格名称", exact: true }),
  ).toHaveValue("紫色阅读笔记", { timeout: 30000 });
  await expect(page.getByRole("img", { name: "原参考文章截图" })).toBeVisible();
  await page.screenshot({
    path: path.join(output, "style-learning-desktop.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "保存到我的风格", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "我的风格", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "预览风格 紫色阅读笔记", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "紫色阅读笔记" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭面板" }).click();
  const row = page.locator(".studio-library-card").filter({
    has: page.getByRole("button", { name: "预览风格 紫色阅读笔记" }),
  });
  await row.getByRole("button", { name: "编辑参数", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "风格名称" })).toHaveValue(
    "紫色阅读笔记",
  );
  await page.getByRole("textbox", { name: "风格名称" }).fill("紫色阅读笔记 V2");
  await page.getByRole("button", { name: "保存新版本" }).click();
  await expect(
    page.getByRole("combobox", { name: "紫色阅读笔记 V2版本" }),
  ).toHaveValue("2");
  await page.getByRole("button", { name: "学习新风格", exact: true }).click();
  await page
    .getByRole("textbox", { name: "参考文章链接" })
    .fill("http://169.254.169.254/");
  await page.getByRole("button", { name: "提取风格" }).click();
  await expect(page.locator(".studio-feedback[role=alert]")).toContainText(
    "已阻止",
  );
});
test("three editable covers, independent cover style and downloadable original PNG", async ({
  page,
}) => {
  await page.goto("/");
  await importSource(page);
  await page.getByRole("button", { name: "封面", exact: true }).click();
  await page
    .getByRole("textbox", { name: "封面标题", exact: true })
    .fill("把日常写成故事");
  await page
    .getByRole("textbox", { name: "封面副标题", exact: true })
    .fill("阅读与表达");
  await page.getByRole("button", { name: "生成三张候选", exact: true }).click();
  await expect(page.locator(".studio-cover-candidates > button")).toHaveCount(
    3,
  );
  await page.getByRole("button", { name: "选择封面候选 2" }).click();
  await setRange(page, "封面字号", 64);
  await expect(
    page.getByRole("slider", { name: "封面字号", exact: true }),
  ).toHaveValue("64");
  await page.getByLabel("封面字色", { exact: true }).fill("#fff4cc");
  await expect(
    page.locator(".studio-cover-stage .studio-cover-error"),
  ).toHaveCount(0);
  const sizes = await page
    .locator(".studio-cover-candidates canvas")
    .evaluateAll((canvases) =>
      canvases.map((c) => (c as HTMLCanvasElement).toDataURL()),
    );
  expect(new Set(sizes).size).toBe(3);
  await page.screenshot({
    path: path.join(output, "cover-desktop.png"),
    fullPage: true,
  });
  await page
    .getByRole("textbox", { name: "封面风格名称", exact: true })
    .fill("我的封面规则");
  await page.getByRole("button", { name: "保存封面风格", exact: true }).click();
  await expect(
    page.getByText("封面风格已独立保存。", { exact: true }),
  ).toBeVisible();
  const promise = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载 PNG", exact: true }).click();
  const file = await (await promise).path();
  expect((await fs.readFile(file!)).subarray(1, 4).toString()).toBe("PNG");
  await page.getByRole("button", { name: "用于当前文章", exact: true }).click();
  await expect(page.getByText("已自动保存", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "封面", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "封面标题", exact: true }),
  ).toHaveValue("把日常写成故事");
  await expect(
    page.getByRole("slider", { name: "封面字号", exact: true }),
  ).toHaveValue("64");
});

test("AI cover waits for edited prompt approval and preserves the artwork pixels", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/ai/cover-prompt", (route) =>
    route.fulfill({ json: { data: { prompt: "绘制标题「阅读新发现」，用靛蓝与金色构图。" } } }),
  );
  const imageRequests: unknown[] = [];
  await page.route("**/api/ai/cover-image", (route) => {
    imageRequests.push(route.request().postDataJSON());
    if (imageRequests.length === 1)
      return route.fulfill({ status: 502, json: { error: "图片暂未生成，请重试。" } });
    return route.fulfill({
      contentType: "image/png",
      body: Buffer.from(ownPng, "base64"),
    });
  });
  await page.goto("/");
  await importSource(page);
  await page.getByRole("button", { name: "封面", exact: true }).click();
  await page.getByRole("button", { name: "内容与参考", exact: true }).click();
  const sourcePanel = page.getByRole("dialog", { name: "内容与参考" });
  const start = sourcePanel.getByRole("button", { name: "生成封面提示词" });
  const review = page.getByRole("dialog", { name: "确认封面提示词" });
  await start.click();
  await expect(review).toBeVisible();
  await review.getByRole("button", { name: "取消", exact: true }).click();
  await expect(review).not.toBeVisible();
  await expect(sourcePanel).toBeVisible();
  expect(imageRequests).toHaveLength(0);
  await start.click();
  const prompt = review.getByRole("textbox", { name: "封面提示词" });
  await expect(prompt).toHaveValue("绘制标题「阅读新发现」，用靛蓝与金色构图。");
  const edited = "绘制标题「读书手记」，用深蓝与暖橙构图。";
  await prompt.fill(edited);
  expect(imageRequests).toHaveLength(0);
  const confirm = review.getByRole("button", { name: "确认并生成图片" });
  await confirm.click();
  await expect(review.getByRole("alert")).toHaveText("图片暂未生成，请重试。");
  await expect(prompt).toHaveValue(edited);
  await confirm.click();
  await expect(page.getByRole("heading", { name: "AI 完整封面" })).toBeVisible();
  expect(imageRequests).toEqual(Array(2).fill({ prompt: edited, width: 900, height: 383, confirmed: true }));
  const canvas = page.locator('canvas[aria-label="AI 完整封面"]');
  await expect(canvas).toHaveAttribute("width", "900");
  const sourceImage = `data:image/png;base64,${ownPng}`;
  expect(await canvas.evaluate(async (element, src) => {
    const target = element as HTMLCanvasElement;
    const image = new Image();
    image.src = src;
    await image.decode();
    const expected = document.createElement("canvas");
    expected.width = target.width;
    expected.height = target.height;
    expected.getContext("2d")!.drawImage(image, 0, 0, expected.width, expected.height);
    return target.toDataURL() === expected.toDataURL();
  }, sourceImage)).toBe(true);
});

test("screenshot fallback keeps reference and parameters when vision is unavailable", async ({
  page,
}) => {
  await page.route("**/api/ai/style-vision", (route) =>
    route.fulfill({
      status: 502,
      json: { error: "AI 接入点已关闭，请配置可用视觉模型。" },
    }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "学习新风格", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "截图", exact: true }).click();
  await page.getByLabel("上传参考文章截图", { exact: true }).setInputFiles({
    name: "owned-test.png",
    mimeType: "image/png",
    buffer: Buffer.from(ownPng, "base64"),
  });
  await expect(page.getByRole("img", { name: "原参考文章截图" })).toBeVisible();
  await page.getByRole("button", { name: "AI 识别风格", exact: true }).click();
  await expect(page.locator(".studio-feedback[role=alert]")).toContainText(
    "接入点已关闭",
  );
  await expect(page.getByRole("img", { name: "原参考文章截图" })).toBeVisible();
  await expect(page.getByText("手动配置", { exact: true })).toBeVisible();
  await page
    .getByRole("textbox", { name: "风格名称", exact: true })
    .fill("截图手调风格");
  await page
    .getByRole("button", { name: "保存到我的风格", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "预览风格 截图手调风格", exact: true }),
  ).toBeVisible();
});
test("the workbench omits the retired multi-platform entry", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /多平台工作区/ })).toHaveCount(0);
  await page.getByRole("button", { name: "账号未开通", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "统一账号" })).toContainText("尚未开通");
  expect((await page.goto("/multiplatform"))?.status()).toBe(404);
});

test("responsive panels prioritize the canvas and keep keyboard focus inside tools", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto("/");
  await importSource(page);
  const editor = page.getByRole("article", { name: "文章编辑画布" });
  const styles = page.getByRole("button", { name: "风格与结构", exact: true });
  const settings = page.getByRole("button", { name: "样式设置", exact: true });
  await expect(styles).toHaveAttribute("aria-expanded", "false");
  await expect(settings).toHaveAttribute("aria-expanded", "false");
  expect((await editor.boundingBox())!.y).toBeLessThan(360);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await settings.click();
  const panel = page.getByRole("dialog", { name: "样式设置", exact: true });
  await expect(panel).toBeVisible();
  const close = panel.getByRole("button", {
    name: "关闭样式设置",
    exact: true,
  });
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  expect(
    await page.evaluate(
      () => !!document.activeElement?.closest("dialog[open]"),
    ),
  ).toBe(true);
  await panel.getByRole("slider", { name: "正文字号", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Escape");
  await expect(panel).not.toBeVisible();
  await expect(settings).toBeFocused();
  await expect(styles).toHaveAttribute("aria-expanded", "false");
  const quickStyles = page.getByRole("region", { name: "快速风格切换" });
  await quickStyles
    .getByRole("button", { name: "预览风格 蓝调观察", exact: true })
    .click();
  await expect(quickStyles.getByRole("status")).toContainText("预览未保存");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await quickStyles.getByRole("button", { name: "恢复原风格" }).click();
  await expect(quickStyles.getByRole("status")).toContainText("已应用");
  await quickStyles.getByRole("button", { name: "更多风格" }).click();
  const stylePanel = page.getByRole("dialog", {
    name: "风格与结构",
    exact: true,
  });
  await stylePanel
    .getByRole("button", { name: "预览风格 蓝调观察", exact: true })
    .click();
  await expect(stylePanel).not.toBeVisible();
  await quickStyles
    .getByRole("button", { name: "确认应用", exact: true })
    .click();
  await expect(editor).toContainText("42%");
  await page.screenshot({
    path: path.join(output, "layout-editor-phone.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator("#editor-inspector")).toBeVisible();
  await expect(page.locator("#editor-styles")).not.toBeVisible();
  const stage = page.locator(".studio-editor-stage");
  const before = (await stage.boundingBox())!.width;
  await styles.click();
  await expect(page.locator("#editor-styles")).toBeVisible();
  expect((await stage.boundingBox())!.width).toBeLessThan(before - 150);
  await styles.click();
  await page.screenshot({
    path: path.join(output, "layout-editor-desktop.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight + 1,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1024, height: 768 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: path.join(output, "layout-editor-tablet.png"),
    fullPage: true,
  });
});

test("mobile learning and cover workspaces show previews before optional panels", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "学习新风格", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "参考来源", exact: true }).click();
  const sourcePanel = page.getByRole("dialog", {
    name: "参考来源",
    exact: true,
  });
  await sourcePanel.getByRole("button", { name: "文字", exact: true }).click();
  await sourcePanel
    .getByRole("textbox", { name: "参考文字 / Markdown", exact: true })
    .fill("这是一段用于布局验证的文字参考，不推断不存在的视觉属性。");
  await sourcePanel
    .getByRole("button", { name: "提取风格", exact: true })
    .click();
  await expect(sourcePanel).not.toBeVisible();
  await page.getByRole("button", { name: "原参考", exact: true }).click();
  await expect(page.locator(".studio-original")).toBeVisible();
  await expect(page.locator(".studio-sample")).not.toBeVisible();
  await page.getByRole("button", { name: "复刻示例", exact: true }).click();
  await expect(page.locator(".studio-sample")).toBeVisible();
  await page.screenshot({
    path: path.join(output, "layout-learning-phone.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "封面", exact: true }).click();
  await expect(
    page.locator(".studio-cover-stage canvas").first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "内容与参考", exact: true }).click();
  const coverSource = page.getByRole("dialog", {
    name: "内容与参考",
    exact: true,
  });
  await coverSource
    .getByRole("textbox", { name: "封面标题", exact: true })
    .fill("阅读里的新发现");
  await coverSource
    .getByRole("button", { name: "生成三张候选", exact: true })
    .click();
  if (await coverSource.isVisible())
    await coverSource.getByRole("button", { name: "关闭内容与参考" }).click();
  await page.screenshot({
    path: path.join(output, "layout-cover-phone.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
