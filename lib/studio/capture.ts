import { chromium } from "playwright";
import { JSDOM } from "jsdom";
import createDOMPurify from "dompurify";
import { Readability } from "@mozilla/readability";
import { safeFetch } from "./safe-fetch";
import {
  fetchWechatArticle,
  wechatURL,
  WechatCaptureError,
} from "./wechat-capture";
import { builtInStyles } from "./styles";
import type { CaptureResult, ComponentStyle, StyleProfile } from "./types";
import { uid } from "./types";

type Sample = {
  tag: string;
  textLength: number;
  color: string;
  backgroundColor: string;
  fontSize: string;
  lineHeight: string;
  marginTop: string;
  marginBottom: string;
  padding: string;
  borderRadius: string;
  borderColor: string;
  borderWidth: string;
  fontFamily: string;
  fontWeight: string;
  textAlign: string;
  width: number;
  widthPercent: number;
  paddingInline: string;
  textIndent: string;
  borderLeftWidth: string;
  letterSpacing: string;
  listMarker: string;
  align?: ComponentStyle["align"];
};
function number(value: string, fallback: number, min: number, max: number) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}
function hex(value: string, fallback: string) {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  const parts = value.match(
    /^rgba?\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)(?:\s*[,/]\s*([\d.]+))?/,
  );
  return parts && (!parts[4] || Number(parts[4]) > 0.3)
    ? "#" +
        parts
          .slice(1, 4)
          .map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0"))
          .join("")
    : fallback;
}
export function profileFromSamples(
  samples: Sample[],
  source: StyleProfile["source"],
  title: string,
): StyleProfile {
  const profile = structuredClone(builtInStyles[0]);
  profile.id = uid("style");
  profile.name = (title || "新参考风格").slice(0, 80);
  profile.source = source;
  profile.tags = ["采集风格"];
  profile.confidence = {
    mode: "dom",
    uncertainKeys: [],
    notes: [
      "参数来自禁用脚本后的计算样式；动态脚本、登录内容和自定义字体可能未还原。",
    ],
  };
  const choose = (tags: string[], needsText = true) =>
    samples
      .filter((s) => tags.includes(s.tag) && (!needsText || s.textLength > 0))
      .sort((a, b) => b.textLength - a.textLength)[0];
  const textGroups = new Map<string, Sample>();
  for (const sample of samples.filter(
    (s) => s.tag === "text" && s.textLength > 0,
  )) {
    const key = [
      sample.fontSize,
      sample.color,
      sample.lineHeight,
      sample.fontFamily,
    ].join("|");
    const previous = textGroups.get(key);
    textGroups.set(key, {
      ...sample,
      textLength: sample.textLength + (previous?.textLength ?? 0),
    });
  }
  const body =
    [...textGroups.values()].sort((a, b) => b.textLength - a.textLength)[0] ??
    choose(["p", "span", "li"]);
  const heading = choose(["h2"]);
  const h1 = choose(["h1"]);
  const quote = choose(["blockquote"]);
  if (body) {
    const size = number(body.fontSize, 16, 12, 24);
    profile.tokens.bodySize = size;
    profile.tokens.text = hex(body.color, profile.tokens.text);
    profile.tokens.lineHeight =
      number(body.lineHeight, size * 1.85, size * 1.2, size * 2.8) / size;
    profile.tokens.paragraphGap = number(body.marginBottom, 20, 4, 48);
    profile.tokens.fontFamily =
      /songti|simsun|serif/i.test(body.fontFamily) &&
      !/sans-serif/i.test(body.fontFamily)
        ? "serif"
        : "sans";
    profile.confidence.notes.push(
      `参考字体：${body.fontFamily}；输出使用可编辑的系统${profile.tokens.fontFamily === "serif" ? "宋体" : "黑体"}字体栈。`,
    );
    if (!body.marginBottom)
      profile.confidence.uncertainKeys.push(
        "段落间距：没有可读取的段落容器，使用可编辑默认值",
      );
    if (!Number.isFinite(parseFloat(body.lineHeight)))
      profile.confidence.uncertainKeys.push(
        "正文行高为 normal，行距使用估计值，可手动调整",
      );
  } else profile.confidence.uncertainKeys.push("正文参数：参考中未识别到正文");
  if (heading) {
    profile.tokens.accent = hex(heading.color, profile.tokens.accent);
    profile.tokens.headingSize = number(heading.fontSize, 22, 16, 36);
  } else
    profile.confidence.uncertainKeys.push(
      "标题样式：未识别标题，使用可编辑默认值",
    );
  if (h1) profile.tokens.titleSize = number(h1.fontSize, 30, 20, 48);
  else
    profile.confidence.uncertainKeys.push(
      "文章标题字号：没有语义标题，使用可编辑默认值",
    );
  const component = (s: Sample): ComponentStyle => ({
    color: hex(s.color, profile.tokens.text),
    fontSize: number(s.fontSize, 16, 10, 64),
    lineHeight: Math.max(
      1,
      Math.min(
        3,
        number(s.lineHeight, number(s.fontSize, 16, 10, 64) * 1.6, 12, 192) /
          number(s.fontSize, 16, 10, 64),
      ),
    ),
    marginTop: number(s.marginTop, 0, 0, 100),
    marginBottom: number(s.marginBottom, 20, 0, 100),
    padding: number(s.padding, 0, 0, 64),
    borderRadius: number(s.borderRadius, 0, 0, 48),
    fontWeight: number(s.fontWeight, 400, 300, 900),
    borderWidth: number(s.borderWidth, 0, 0, 8),
    borderLeftWidth: number(s.borderLeftWidth, 0, 0, 12),
    paddingInline: number(s.paddingInline, 0, 0, 80),
    textIndent: number(s.textIndent, 0, 0, 64),
    letterSpacing: number(s.letterSpacing, 0, 0, 8),
    fontFamily:
      /songti|simsun|serif/i.test(s.fontFamily) &&
      !/sans-serif/i.test(s.fontFamily)
        ? "serif"
        : "sans",
    borderColor: hex(s.borderColor, profile.tokens.text),
    ...(["left", "center", "right", "justify"].includes(s.textAlign)
      ? { textAlign: s.textAlign as ComponentStyle["textAlign"] }
      : {}),
    ...(hex(s.backgroundColor, "")
      ? { backgroundColor: hex(s.backgroundColor, "") }
      : {}),
  });
  profile.components = {};
  profile.layoutRules = {
    articleWidth: 640,
    sectionRhythm: [],
    imagePolicy: "full",
  };
  profile.details = { measured: [] };
  const measured = profile.details.measured!;
  const root = samples.find((s) => s.tag === "root");
  if (root) {
    measured.push("page");
    profile.tokens.background = hex(root.backgroundColor, "#ffffff");
    profile.layoutRules.articleWidth = Math.round(
      number(String(root.width), 640, 280, 900),
    );
    profile.layoutRules.paddingInline = number(root.paddingInline, 0, 0, 80);
    profile.layoutRules.paddingBlock = number(root.padding, 0, 0, 80);
    profile.tokens.padding = profile.layoutRules.paddingInline;
    profile.layoutRules.borderWidth = number(root.borderWidth, 0, 0, 8);
    if (profile.layoutRules.borderWidth)
      profile.layoutRules.borderColor = hex(
        root.borderColor,
        profile.tokens.text,
      );
  }
  const paragraph = choose(["p"]);
  if (paragraph) {
    // The text sample can be an inline span inside the paragraph. Use the
    // paragraph's box for spacing and the dominant text for typography.
    const { fontSize, fontFamily, lineHeight, color, ...box } =
      component(paragraph);
    void fontSize;
    void fontFamily;
    void lineHeight;
    void color;
    profile.components.paragraph = box;
    measured.push("paragraph");
  } else if (body) measured.push("bodyTypography");
  const roles = {
    title: h1,
    heading,
    subheading: choose(["h3", "h4", "h5", "h6"]),
    quote,
    callout: choose(["callout"]),
    list: choose(["ul", "ol"]),
    divider: choose(["hr"], false),
    caption: choose(["figcaption"]),
    image: choose(["img"], false),
    table: choose(["table"]),
    code: choose(["pre"]),
  } as const;
  for (const [kind, sample] of Object.entries(roles) as Array<
    [keyof typeof roles, Sample | undefined]
  >) {
    if (!sample) continue;
    const visual = component(sample);
    if (["image", "divider", "quote", "callout"].includes(kind)) {
      visual.widthPercent = number(String(sample.widthPercent), 100, 10, 100);
      visual.align = sample.align;
    }
    if (kind === "image")
      profile.tokens.radius = number(sample.borderRadius, 0, 0, 32);
    if (kind === "divider" && !visual.borderWidth && sample.backgroundColor)
      visual.borderColor = hex(
        sample.backgroundColor,
        visual.borderColor ?? profile.tokens.muted,
      );
    if (kind === "list") {
      profile.details.listIndent = number(sample.paddingInline, 24, 0, 64);
      visual.paddingInline = 0;
      const marker = sample.listMarker;
      const valid = [
        "disc",
        "circle",
        "square",
        "decimal",
        "lower-alpha",
        "upper-alpha",
        "lower-roman",
        "upper-roman",
        "none",
      ] as const;
      profile.details.listMarker = valid.find((option) => option === marker);
      const item = choose(["li"]);
      if (item) profile.details.listGap = number(item.marginBottom, 6, 0, 48);
    }
    profile.components[kind] = visual;
    measured.push(kind);
  }
  const editorialSamples = {
    subtitle: choose(["editorial-subtitle"]),
    intro: choose(["editorial-intro"]),
    chapter: choose(["h2"]),
    point: choose(["callout", "editorial-point"]),
    case: choose(["editorial-case"]),
    data: choose(["editorial-data"]),
    conclusion: choose(["editorial-conclusion"]),
    steps: choose(["editorial-steps"]),
  };
  const editorial: NonNullable<StyleProfile["editorial"]> = {
    components: {},
    measured: [],
  };
  for (const key of Object.keys(
    editorialSamples,
  ) as (keyof typeof editorialSamples)[]) {
    const sample = editorialSamples[key];
    if (!sample) continue;
    editorial.components[key] = component(sample);
    editorial.measured?.push(key);
  }
  if (editorial.measured?.length) profile.editorial = editorial;
  const emphasis = choose(["strong", "b"]);
  if (emphasis) {
    const visual = component(emphasis);
    profile.details.emphasis = {
      color: visual.color,
      backgroundColor: visual.backgroundColor,
      fontWeight: visual.fontWeight,
      letterSpacing: visual.letterSpacing,
    };
    measured.push("emphasis");
  }
  if (!quote) profile.confidence.uncertainKeys.push("引用：未识别到原文引用");
  if (!roles.image)
    profile.confidence.uncertainKeys.push("图片：未识别到可测量的原文图片");
  if (!roles.list)
    profile.confidence.uncertainKeys.push("列表：未识别到原文列表");
  if (!roles.divider)
    profile.confidence.uncertainKeys.push("分隔线：未识别到原文分隔线");
  profile.layoutRules.sectionRhythm = samples
    .filter((s) =>
      [
        "h1",
        "h2",
        "h3",
        "h4",
        "p",
        "blockquote",
        "img",
        "ul",
        "ol",
        "hr",
        "callout",
      ].includes(s.tag),
    )
    .slice(0, 30)
    .map((s) => s.tag);
  return profile;
}
export async function captureReference(input: {
  url?: string;
  html?: string;
  baseURL?: string;
  rights: StyleProfile["source"]["rights"];
  signal?: AbortSignal;
}): Promise<CaptureResult> {
  const signal = AbortSignal.any([
    input.signal ?? new AbortController().signal,
    AbortSignal.timeout(35_000),
  ]);
  let html = input.html ?? "";
  let url = input.baseURL;
  const wxURL = input.url ? wechatURL(input.url) : undefined;
  const wechat = wxURL ? await fetchWechatArticle(wxURL, signal) : undefined;
  if (wechat) {
    url = wechat.url;
  } else if (input.url) {
    const response = await safeFetch(input.url, { signal });
    if (!/text\/html|application\/xhtml/.test(response.contentType))
      throw new Error("链接不是可读取的文章网页，请改用截图或粘贴 HTML。");
    const charset =
      response.contentType.match(/charset=([^; ]+)/i)?.[1] ?? "utf-8";
    try {
      html = new TextDecoder(charset).decode(response.body);
    } catch {
      html = response.body.toString("utf8");
    }
    url = response.url;
  }
  const dom =
    wechat?.dom ??
    new JSDOM(html, { url: url ?? "https://reference.invalid/" });
  const original = dom.window.document;
  if (!wechat)
    original
      .querySelectorAll("img[data-src]")
      .forEach((img) => img.setAttribute("src", img.getAttribute("data-src")!));
  original
    .querySelectorAll(
      wechat
        ? "script,iframe,form,object,embed,video,audio,base,meta[http-equiv],foreignObject,use,animate,animateMotion,animateTransform,set"
        : "script,iframe,form,object,embed,video,audio,base,meta[http-equiv],svg",
    )
    .forEach((el) => el.remove());
  const readable = wechat
    ? null
    : new Readability(original.cloneNode(true) as Document).parse();
  const title = (
    wechat?.title ||
    original.querySelector("#activity-name,h1")?.textContent ||
    readable?.title ||
    original.title ||
    "参考风格"
  )
    .trim()
    .slice(0, 300);
  const target =
    wechat?.body ??
    original.querySelector("#js_content,article,main") ??
    original.body;
  const referenceText = (target.textContent ?? "").trim();
  const isWechat = input.url
    ? new URL(input.url).hostname === "mp.weixin.qq.com"
    : false;
  const blockedPage =
    referenceText.length < 500 &&
    /环境异常|完成验证|访问验证|请先登录|访问过于频繁|Access Denied|Just a moment|enable javascript/i.test(
      referenceText,
    );
  if (
    !wechat &&
    (referenceText.length < 20 ||
      (isWechat && !original.querySelector("#js_content")) ||
      blockedPage)
  ) {
    dom.window.close();
    throw new Error(
      "未取得可用正文，网页可能要求登录或触发反爬。请上传截图或手动粘贴。",
    );
  }
  const purifier = createDOMPurify(dom.window);
  const reference = purifier.sanitize(target.outerHTML, {
    RETURN_DOM: true,
    FORBID_TAGS: ["style", "link"],
    FORBID_ATTR: wechat ? ["srcset"] : ["style", "class", "id"],
  }) as HTMLElement;
  // Keep authored layout in the fragment. Network-backed CSS remains confined
  // to the isolated preview, where it goes through the bounded asset loader.
  for (const element of reference.querySelectorAll<HTMLElement>("[style]")) {
    const style = element.getAttribute("style") ?? "";
    if (
      !/url\s*\(|image-set\s*\(|expression\s*\(|\\|@import|behavior\s*:/i.test(
        style,
      )
    )
      continue;
    if (!element.style) {
      element.removeAttribute("style");
      continue;
    }
    for (const property of Array.from(element.style)) {
      if (
        /url\s*\(|image-set\s*\(|expression\s*\(|\\|@import|behavior/i.test(
          property + element.style.getPropertyValue(property),
        )
      ) {
        element.style.removeProperty(property);
      }
    }
    element.setAttribute("style", element.style.cssText);
  }
  const referenceHTML = reference.innerHTML;
  const inlineStyleCount = reference.querySelectorAll(
    "[style]:not([style=''])",
  ).length;
  if (wechat) {
    original
      .querySelectorAll("link:not([rel~=stylesheet])")
      .forEach((link) => link.remove());
    target.setAttribute("data-studio-wechat-body", "");
    const titleNode = original.querySelector(
      "#activity-name,.rich_media_title",
    );
    const accountNode = original.querySelector("#js_name");
    // Keep the article's ancestor classes and heading while dropping the
    // comments, recommendations, navigation and unrelated image requests.
    for (
      let node = target;
      node.parentElement && node !== original.body;
      node = node.parentElement
    ) {
      for (const sibling of Array.from(node.parentElement.children)) {
        if (
          sibling === node ||
          sibling.contains(titleNode) ||
          sibling.contains(accountNode) ||
          sibling.matches("style,link[rel=stylesheet]")
        )
          continue;
        sibling.remove();
      }
    }
    const startupStyle = original.createElement("style");
    startupStyle.textContent =
      "[data-studio-wechat-body]{visibility:visible!important;opacity:1!important}";
    original.head.append(startupStyle);
  }
  const safe = purifier.sanitize(original.documentElement.outerHTML, {
    WHOLE_DOCUMENT: true,
    ADD_TAGS: ["style", "link"],
    ADD_ATTR: ["rel", "media"],
    FORBID_TAGS: [
      "script",
      "iframe",
      "form",
      "object",
      "embed",
      "video",
      "audio",
      ...(wechat
        ? [
            "foreignobject",
            "use",
            "animate",
            "animatemotion",
            "animatetransform",
            "set",
          ]
        : ["svg"]),
    ],
    FORBID_ATTR: ["srcset"],
  });
  dom.window.close();
  let browser;
  try {
    const executablePath = process.env.FORMATTER_CHROMIUM_PATH?.trim();
    browser = await chromium.launch({
      headless: true,
      ...(executablePath
        ? { executablePath, args: ["--disable-gpu", "--disable-software-rasterizer"] }
        : {}),
    });
  } catch {
    throw new Error(
      "采集浏览器不可用。请安装 Playwright Chromium，或改用截图手动学习。",
    );
  }
  const warnings: string[] = [];
  if (wechat?.format === "embedded")
    warnings.push(
      "已从微信页面内嵌字段恢复正文。该页面未提供可采集的原始正文 DOM，样式为可调整的初始估计。",
    );
  let bytes = 0,
    requests = 0;
  try {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      serviceWorkers: "block",
      viewport: { width: 720, height: 960 },
    });
    await context.route("**/*", async (route) => {
      try {
        const resource = route.request();
        if (
          !["stylesheet", "image", "font"].includes(resource.resourceType()) ||
          ++requests > (wechat ? 48 : 35) ||
          bytes > 15_000_000
        ) {
          await route.abort();
          return;
        }
        const address = new URL(
          resource.url(),
          url ?? "https://reference.invalid/",
        ).href;
        const result = await safeFetch(address, {
          maxBytes: 4_000_000,
          signal,
        });
        bytes += result.body.length;
        if (
          bytes > 15_000_000 ||
          !/^(?:text\/css|image\/(?:png|jpeg|webp|gif|avif)|font\/|application\/font|application\/vnd.ms-fontobject)/i.test(
            result.contentType,
          )
        ) {
          await route.abort();
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: result.contentType,
          body: result.body,
        });
      } catch {
        warnings.push(
          "部分外部样式、字体或图片无法取得，已跳过；可用截图补充。",
        );
        await route.abort().catch(() => undefined);
      }
    });
    const page = await context.newPage();
    page.setDefaultTimeout(12_000);
    // The base is generated from the validated public URL; source-provided bases are removed.
    await page.setContent(
      safe.replace(
        /<head[^>]*>/i,
        (match) =>
          `${match}<base href="${(url ?? "https://reference.invalid/").replace(/"/g, "%22")}">`,
      ),
      { waitUntil: wechat ? "domcontentloaded" : "load", timeout: 20_000 },
    );
    if (wechat) {
      await page.waitForLoadState("load", { timeout: 12_000 }).catch(() => {
        warnings.push("部分公众号资源在预览时限内未加载完成。");
      });
    }
    const samples = await page.evaluate(() => {
      const root =
        document.querySelector("[data-studio-wechat-body]") ??
        document.querySelector("#js_content,article,main") ??
        document.body;
      const labeled = [
        ["editorial-subtitle", ".subtitle,[data-role=subtitle]"],
        ["editorial-intro", ".lead,.intro,[data-role=lead],[data-role=intro]"],
        ["editorial-point", ".key-point,[data-role=point]"],
        ["editorial-case", ".case-study,[data-role=case]"],
        ["editorial-data", ".data-highlight,[data-role=data]"],
        [
          "editorial-conclusion",
          ".conclusion,.summary,[data-role=summary],[data-role=conclusion]",
        ],
        ["editorial-steps", "ol.steps,[data-role=steps]"],
      ];
      const labels = labeled.map(([, selector]) => selector).join(",");
      const textElements: Array<{
        element: Element;
        textLength: number;
        role: string;
      }> = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode()) && textElements.length < 800) {
        const parent = node.parentElement;
        if (
          !parent ||
          !node.textContent?.trim() ||
          parent.closest("script,style,noscript")
        )
          continue;
        const semantic = parent.closest(
          "h1,h2,h3,h4,h5,h6,blockquote,li,figcaption",
        );
        textElements.push({
          element: parent,
          textLength: node.textContent.trim().length,
          role: semantic ? "semantic-text" : "text",
        });
      }
      return [
        ...[
          root,
          ...Array.from(
            root.querySelectorAll(
              `h1,h2,h3,h4,h5,h6,p,blockquote,ul,ol,li,img,figcaption,hr,strong,b,table,pre,[role=note],.callout,.admonition,${labels}`,
            ),
          ),
        ]
          .slice(0, 800)
          .map((element) => ({
            element,
            textLength: (element.textContent ?? "").length,
            role:
              element === root
                ? "root"
                : (labeled.find(([, selector]) =>
                    element.matches(selector),
                  )?.[0] ??
                  (element.matches("[role=note],.callout,.admonition")
                    ? "callout"
                    : element.tagName.toLowerCase())),
          })),
        ...textElements,
        ...Array.from(
          document.querySelectorAll(
            "[data-studio-wechat-body] ~ #activity-name, #activity-name.rich_media_title",
          ),
        )
          .filter((element) => !root.contains(element))
          .slice(0, 1)
          .map((element) => ({
            element,
            textLength: (element.textContent ?? "").length,
            role: "h1",
          })),
      ]
        .filter(
          ({ element, role }) =>
            element.getBoundingClientRect().height > 0 || role === "hr",
        )
        .map(({ element: el, textLength, role }) => {
          const s = getComputedStyle(el);
          const paragraph = el.closest("p");
          const parent = el.parentElement;
          const container =
            role === "img" &&
            parent &&
            parent.childElementCount === 1 &&
            !parent.textContent?.trim()
              ? getComputedStyle(parent)
              : s;
          const rootBox = root.getBoundingClientRect();
          const box = el.getBoundingClientRect();
          const rootStyle = getComputedStyle(root);
          const rootInner =
            rootBox.width -
            parseFloat(rootStyle.paddingLeft) -
            parseFloat(rootStyle.paddingRight);
          const start =
            box.left - rootBox.left - parseFloat(rootStyle.paddingLeft);
          const end =
            rootBox.right - parseFloat(rootStyle.paddingRight) - box.right;
          const align =
            Math.abs(start - end) < 4
              ? ("center" as const)
              : end < 5 && start > 6
                ? ("right" as const)
                : ("left" as const);
          let backgroundColor = s.backgroundColor;
          if (role === "root") {
            let ancestor = parent;
            while (ancestor && backgroundColor === "rgba(0, 0, 0, 0)") {
              backgroundColor = getComputedStyle(ancestor).backgroundColor;
              ancestor = ancestor.parentElement;
            }
          }
          return {
            tag: role,
            textLength,
            color: s.color,
            backgroundColor,
            fontSize: s.fontSize,
            lineHeight: s.lineHeight,
            marginTop: container.marginTop,
            marginBottom:
              role === "text"
                ? paragraph
                  ? getComputedStyle(paragraph).marginBottom
                  : ""
                : container.marginBottom,
            padding: s.paddingTop,
            borderRadius: s.borderRadius,
            borderColor:
              parseFloat(s.borderLeftWidth) > 0
                ? s.borderLeftColor
                : s.borderTopColor,
            borderWidth: s.borderTopWidth,
            fontFamily: s.fontFamily,
            fontWeight: s.fontWeight,
            textAlign: s.textAlign,
            width: box.width,
            widthPercent:
              rootInner > 0 ? Math.round((box.width / rootInner) * 100) : 100,
            paddingInline: String(
              Math.max(parseFloat(s.paddingLeft), parseFloat(s.paddingRight)),
            ),
            textIndent: s.textIndent,
            borderLeftWidth: s.borderLeftWidth,
            letterSpacing: s.letterSpacing,
            listMarker: s.listStyleType,
            align,
          };
        });
    });
    const profile = profileFromSamples(
      samples,
      {
        type: input.url ? "url" : "html",
        url,
        capturedAt: new Date().toISOString(),
        rights: input.rights,
        title,
      },
      title,
    );
    if (wechat?.format === "embedded") {
      profile.confidence.mode = "manual";
      profile.confidence.notes = [
        "正文来自微信页面内嵌字段。原始布局缺失，当前是可调整的初始样式。",
      ];
    }
    const height = await page.evaluate(() => {
      const root = document.querySelector("[data-studio-wechat-body]");
      const bottom = root
        ? root.getBoundingClientRect().top + root.scrollHeight + window.scrollY
        : 0;
      return Math.min(
        16000,
        Math.ceil(Math.max(document.body.scrollHeight, bottom, 960)),
      );
    });
    if (wechat && height > 960)
      await page.setViewportSize({ width: 720, height });
    const screenshot = await page.screenshot({
      type: "jpeg",
      quality: 70,
      clip: { x: 0, y: 0, width: 720, height },
      timeout: 10_000,
    });
    if (height === 16000)
      warnings.push("参考长图超过 16000 像素，预览已截取前半部分。");
    const images = wechat
      ? await page
          .locator("[data-studio-wechat-body] img")
          .evaluateAll((elements) =>
            elements.map((element) => {
              const image = element as HTMLImageElement;
              return {
                url: image.getAttribute("src") ?? "",
                loaded: image.complete && image.naturalWidth > 0,
              };
            }),
          )
      : undefined;
    if (images?.some((image) => !image.loaded))
      warnings.push("部分公众号正文图片加载失败，已保留原始位置。");
    if (wechat && !samples.some((sample) => sample.tag === "root")) {
      throw new WechatCaptureError(
        "preview_failed",
        "已取得公众号正文，但 Chromium 未能渲染正文容器。",
      );
    }
    return {
      profile,
      title,
      referenceHTML,
      ...(safe.length <= 500_000 ? { referenceDocument: safe } : {}),
      screenshot: `data:image/jpeg;base64,${screenshot.toString("base64")}`,
      warnings: [...new Set(warnings)],
      ...(wechat && images
        ? {
            wechat: {
              account: wechat.account,
              format: wechat.format,
              requestProfile: wechat.requestProfile,
              textLength: referenceText.length,
              inlineStyleCount,
              images,
            },
          }
        : {}),
    };
  } finally {
    await browser.close();
  }
}
