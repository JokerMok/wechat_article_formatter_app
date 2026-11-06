import { describe, expect, it } from "vitest";
import { captureReference } from "./capture";
import { styleProfileSchema } from "./types";
describe("real browser reference extraction", () => {
  it("captures computed styles, a real screenshot and uncertain rules without running source scripts", async () => {
    const result = await captureReference({
      html: '<!doctype html><html><head><style>article{width:640px;margin:auto}p{font-size:18px;line-height:36px;color:#354b41;margin-bottom:24px}h2{font-size:26px;color:#773399}</style><script>throw new Error("must not run")</script></head><body><article><h1>采集测试原文</h1><h2>设计规则</h2><p>这是一篇用于受控测试的参考文章，保留颜色、字号和行距，原文不进入目标文章。</p><blockquote style="background:#eeeeff;padding:20px">引用区域</blockquote><img src="http://169.254.169.254/private" alt="阻止内网资源"></article></body></html>',
      rights: "owned",
    });
    expect(result.title).toBe("采集测试原文");
    expect(result.profile.tokens).toMatchObject({
      bodySize: 18,
      lineHeight: 2,
      paragraphGap: 24,
      accent: "#773399",
      headingSize: 26,
    });
    expect(result.screenshot).toMatch(/^data:image\/jpeg;base64,/);
    expect(styleProfileSchema.safeParse(result.profile).success).toBe(true);
    expect(result.referenceHTML).not.toMatch(/script|onclick/);
    expect(result.warnings.join(" ")).toContain("无法取得");
  }, 30000);
});

describe("legacy article markup", () => {
  it("reads text-node computed styles even without paragraph or heading tags", async () => {
    const result = await captureReference({
      html: '<html><body><table><tr><td><font face="Verdana" size="2" color="#333333">这篇旧式 HTML 文章没有语义段落标签，但字体、字号和颜色仍须读取真实计算样式，而不能假装使用默认值。</font></td></tr></table></body></html>',
      rights: "owned",
    });
    expect(result.profile.tokens.bodySize).toBe(13);
    expect(result.profile.tokens.text).toBe("#333333");
    expect(result.profile.confidence.uncertainKeys.join(" ")).toContain(
      "段落间距",
    );
    expect(result.profile.confidence.notes.join(" ")).toContain("Verdana");
  }, 30000);
});
