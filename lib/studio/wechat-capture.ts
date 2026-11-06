import { JSDOM } from "jsdom";
import { PublicFetchHTTPError, safeFetch } from "./safe-fetch";

// WeChat request profile and body variants adapted from Rudy-114/wechat-article-reader
// (MIT, 490aa648b2a9d3875d8f38e22103791171d23aaa). See THIRD_PARTY_WECHAT_LICENSE.
const host = "mp.weixin.qq.com";
const desktopUA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const mobileUA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1";

export type WechatFailure =
  | "invalid_url"
  | "verification_required"
  | "deleted"
  | "restricted"
  | "expired"
  | "migrated"
  | "body_missing"
  | "unexpected_redirect"
  | "preview_failed"
  | "upstream_http"
  | "network_error";

export class WechatCaptureError extends Error {
  constructor(
    readonly code: WechatFailure,
    message: string,
  ) {
    super(message);
  }
}

function articlePath(url: URL) {
  return /^\/s(?:\/[\w-]+\/?)?$/.test(url.pathname);
}

export function wechatURL(value: string): URL | undefined {
  const input = value.trim().replace(/&amp;/gi, "&");
  let url: URL;
  try {
    url = new URL(
      /^mp\.weixin\.qq\.com\//i.test(input) ? `https://${input}` : input,
    );
  } catch {
    return undefined;
  }
  if (url.hostname !== host) return undefined;
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.port ||
    url.username ||
    url.password ||
    !articlePath(url)
  ) {
    throw new WechatCaptureError(
      "invalid_url",
      "请使用完整的微信公众号文章链接（/s 或 /s/短链）。",
    );
  }
  url.protocol = "https:";
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (
      /^(?:key|uin|pass_ticket|appmsg_token|token|sessionid|poc_token)$/i.test(
        key,
      )
    )
      url.searchParams.delete(key);
  }
  return url;
}

function verifyPath(path: string) {
  return /(?:appmsgcaptcha|verifyhtml|secitptpage\/verify)/i.test(path);
}

function checkRedirect(url: URL) {
  if (url.hostname === host && verifyPath(url.pathname)) {
    throw new WechatCaptureError(
      "verification_required",
      "微信返回了访问验证页，服务器未取得公开正文。",
    );
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== host ||
    url.port ||
    url.username ||
    url.password ||
    !articlePath(url)
  ) {
    throw new WechatCaptureError(
      "unexpected_redirect",
      "公众号文章跳转到了非公开文章地址。",
    );
  }
}

function meta(document: Document, name: string) {
  return (
    document
      .querySelector(`meta[property="${name}"]`)
      ?.getAttribute("content")
      ?.trim() ?? ""
  );
}

function readLiteral(document: Document, html: string, names: string) {
  const match = new RegExp(
    String.raw`\b(?:${names})\s*[:=]\s*(?:(?:JsDecode|htmlDecode)\(\s*)?(["'])((?:\\[\s\S]|(?!\1)[^\\])*?)\1`,
  ).exec(html);
  if (!match) return "";
  const value = match[2].replace(
    /\\(?:x([\da-f]{2})|u([\da-f]{4})|([\s\S]))/gi,
    (_, x, u, escaped) => {
      if (x || u) return String.fromCharCode(Number.parseInt(x ?? u, 16));
      if (escaped === "n") return "\n";
      if (escaped === "r") return "\r";
      if (escaped === "t") return "\t";
      return escaped;
    },
  );
  const decoder = document.createElement("textarea");
  decoder.innerHTML = value;
  return decoder.value.trim();
}

function normalizeImages(body: Element, url: URL) {
  for (const image of body.querySelectorAll("img")) {
    const candidates = [
      image.getAttribute("data-src"),
      image.getAttribute("data-original"),
      image.getAttribute("src"),
    ];
    for (const candidate of candidates) {
      if (!candidate?.trim()) continue;
      try {
        const resolved = new URL(candidate, url);
        if (
          !["http:", "https:"].includes(resolved.protocol) ||
          resolved.username ||
          resolved.password ||
          resolved.port
        )
          continue;
        image.setAttribute("src", resolved.href);
        image.removeAttribute("loading");
        break;
      } catch {
        // A malformed lazy URL does not invalidate a real src.
      }
    }
  }
}

const unavailable: Array<[WechatFailure, RegExp, string]> = [
  [
    "verification_required",
    /环境异常|完成验证后即可继续访问|访问验证/,
    "微信返回了访问验证页，服务器未取得公开正文。",
  ],
  ["deleted", /已被发布者删除|该内容已删除/, "这篇文章已被发布者删除。"],
  ["expired", /链接已过期|链接已经过期/, "微信提示此文章链接已过期。"],
  ["migrated", /公众号已迁移/, "微信公众号已迁移，请使用迁移后的文章链接。"],
  [
    "restricted",
    /因违规无法查看|被投诉且经审核|已被屏蔽|涉嫌违反相关法律法规|参数错误|请先登录/,
    "微信提示该文章当前无法公开访问。",
  ],
];

export function parseWechatArticle(dom: JSDOM, html: string, url: URL) {
  const document = dom.window.document;
  const title = (
    document
      .querySelector("#activity-name,.rich_media_title")
      ?.textContent?.trim() ||
    meta(document, "og:title") ||
    document.title.trim()
  ).slice(0, 300);
  const account = (
    document
      .querySelector("#js_name,.rich_media_meta_nickname")
      ?.textContent?.trim() || meta(document, "og:article:author")
  ).slice(0, 150);
  for (const selector of [
    "#js_content",
    ".rich_media_content",
    "#js_text_content",
    "#js_text_desc",
    "#js_image_desc",
  ]) {
    const body = document.querySelector<HTMLElement>(selector);
    if (!body) continue;
    normalizeImages(body, url);
    if (!body.textContent?.trim() && !body.querySelector("img[src],svg"))
      continue;
    // WeChat reveals the wrapper via its page JS. Restore just the startup state
    // so the original descendants can render in our script-free preview.
    if (body.style.visibility === "hidden")
      body.style.removeProperty("visibility");
    if (body.style.opacity === "0") body.style.removeProperty("opacity");
    if (body.style.display === "none") body.style.removeProperty("display");
    body.removeAttribute("hidden");
    return { body, title, account, format: "dom" as const };
  }
  const notice = document.body?.cloneNode(true) as HTMLElement | undefined;
  notice
    ?.querySelectorAll("script,style,template,noscript")
    .forEach((node) => node.remove());
  const visibleText = (notice?.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);
  const failure = unavailable.find(([, marker]) => marker.test(visibleText));
  if (failure) throw new WechatCaptureError(failure[0], failure[2]);

  const text = readLiteral(document, html, "content_noencode|ContentNoEncode");
  if (text) {
    const body = document.createElement("div");
    body.id = "js_text_content";
    if (/^\s*<(?:section|div|p|blockquote|img)\b/i.test(text)) {
      body.innerHTML = text;
      normalizeImages(body, url);
    } else {
      body.style.whiteSpace = "pre-wrap";
      body.textContent = text;
    }
    if (body.textContent?.trim() || body.querySelector("img[src]")) {
      document.body.append(body);
      return { body, title, account, format: "embedded" as const };
    }
  }
  throw new WechatCaptureError(
    "body_missing",
    "微信返回了页面，但未找到可验证的正文。",
  );
}

export async function fetchWechatArticle(
  url: URL,
  signal: AbortSignal,
  fetchPage = safeFetch,
) {
  for (const [index, userAgent] of [desktopUA, mobileUA].entries()) {
    let dom: JSDOM | undefined;
    try {
      const result = await fetchPage(url.href, {
        maxBytes: 8_000_000,
        signal,
        headers: {
          "user-agent": userAgent,
          accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "zh-CN,zh;q=0.9",
        },
        validateRedirect: checkRedirect,
      });
      const finalURL = new URL(result.url);
      checkRedirect(finalURL);
      if (!/text\/html|application\/xhtml/i.test(result.contentType)) {
        throw new WechatCaptureError(
          "body_missing",
          "微信返回的内容不是文章 HTML。",
        );
      }
      const html = result.body.toString("utf8");
      dom = new JSDOM(html, { url: finalURL.href });
      const article = parseWechatArticle(dom, html, finalURL);
      return {
        ...article,
        dom,
        url: wechatURL(finalURL.href)!.href,
        requestProfile:
          index === 0 ? ("desktop" as const) : ("mobile" as const),
      };
    } catch (error) {
      dom?.window.close();
      const status =
        error instanceof PublicFetchHTTPError ? error.status : undefined;
      const code = (error as NodeJS.ErrnoException)?.code;
      const retryable =
        (error instanceof WechatCaptureError &&
          error.code === "body_missing") ||
        (status !== undefined && status >= 500) ||
        /^(?:ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ABORT_ERR)$/.test(
          code ?? "",
        );
      if (index === 0 && retryable && !signal.aborted) continue;
      if (error instanceof WechatCaptureError) throw error;
      if (status)
        throw new WechatCaptureError(
          "upstream_http",
          `微信返回 HTTP ${status}，服务器未取得正文。`,
        );
      throw new WechatCaptureError(
        "network_error",
        "服务器未能取得完整的微信公众号文章响应。",
      );
    }
  }
  throw new WechatCaptureError("body_missing", "微信未返回可验证的正文。");
}
