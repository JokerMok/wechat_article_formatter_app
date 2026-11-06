import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import {
  fetchWechatArticle,
  parseWechatArticle,
  wechatURL,
} from "./wechat-capture";

const url = new URL("https://mp.weixin.qq.com/s/example");
const signal = new AbortController().signal;

describe("WeChat public article extraction", () => {
  it("restores the article wrapper and preserves image order and editorial styles", () => {
    const html =
      '<h1 id="activity-name">样式来源</h1><div id="js_content" style="visibility:hidden;opacity:0;padding:4px"><section style="color:#123456">这篇正文提到环境异常。</section><img src="data:image/gif;base64,abc" data-src="//mmbiz.qpic.cn/a"><p>图片之间</p><img data-src="//mmbiz.qpic.cn/b"></div>';
    const dom = new JSDOM(html);
    try {
      const result = parseWechatArticle(dom, html, url);
      expect(result.body.style.visibility).toBe("");
      expect(result.body.style.opacity).toBe("");
      expect(result.body.style.padding).toBe("4px");
      expect(result.body.innerHTML).toContain('style="color:#123456"');
      expect(
        Array.from(result.body.children).map((node) => node.tagName),
      ).toEqual(["SECTION", "IMG", "P", "IMG"]);
      expect(
        Array.from(result.body.querySelectorAll("img"), (img) =>
          img.getAttribute("src"),
        ),
      ).toEqual(["https://mmbiz.qpic.cn/a", "https://mmbiz.qpic.cn/b"]);
    } finally {
      dom.window.close();
    }
  });

  it("recovers literal text shares without evaluating the source script", () => {
    const html = String.raw`<div id="js_article"></div><script>throw new Error("must never run"); const data = {content_noencode: JsDecode('第一段\x0a第二段\x3c文本\x3e')};</script>`;
    const dom = new JSDOM(html);
    try {
      const result = parseWechatArticle(dom, html, url);
      expect(result.format).toBe("embedded");
      expect(result.body.textContent).toBe("第一段\n第二段<文本>");
    } finally {
      dom.window.close();
    }
  });

  it("retries an empty public representation using the mobile request profile", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({
        url: url.href,
        contentType: "text/html",
        body: Buffer.from("<title>标题占位</title>"),
      })
      .mockResolvedValueOnce({
        url: url.href,
        contentType: "text/html",
        body: Buffer.from('<div id="js_content"><p>真实正文</p></div>'),
      });
    const result = await fetchWechatArticle(url, signal, fetchPage);
    try {
      expect(result.requestProfile).toBe("mobile");
      expect(result.body.textContent).toBe("真实正文");
      expect(fetchPage).toHaveBeenCalledTimes(2);
    } finally {
      result.dom.window.close();
    }
  });

  it("stops at explicit verification and never follows the challenge URL", async () => {
    const fetchPage = vi
      .fn<typeof import("./safe-fetch").safeFetch>()
      .mockImplementation(async (_, options) => {
        options?.validateRedirect?.(
          new URL(
            "https://mp.weixin.qq.com/mp/wappoc_appmsgcaptcha?poc_token=redacted",
          ),
        );
        throw new Error(
          "verification must be detected before following the redirect",
        );
      });
    await expect(
      fetchWechatArticle(url, signal, fetchPage),
    ).rejects.toMatchObject({ code: "verification_required" });
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(
      wechatURL(
        "mp.weixin.qq.com/s?__biz=abc&amp;mid=2&amp;sn=3&amp;key=private#rd",
      )?.href,
    ).toBe("https://mp.weixin.qq.com/s?__biz=abc&mid=2&sn=3");
    expect(() =>
      wechatURL("https://user@mp.weixin.qq.com/s/example"),
    ).toThrow();
  });
});
