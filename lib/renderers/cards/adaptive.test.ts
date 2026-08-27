import { describe, expect, it } from "vitest";
import { parseArticleContent } from "../../article-parser";
import { createApproximateTextMeasurer } from "./measurement";
import { layoutCardPagesToTarget } from "./adaptive";

describe("layoutCardPagesToTarget", () => {
  it("reduces typography and spacing before accepting excessive pages", () => {
    const source = parseArticleContent(`# 标题

${"这是一段需要自动重排的正文内容，用于验证字号和间距会随页面容量调整。".repeat(45)}`, { mode: "knowledge" });
    const result = layoutCardPagesToTarget(source, createApproximateTextMeasurer(), {
      aspectRatio: "3:4",
      typography: {
        titleFontSize: 72,
        headingFontSize: 42,
        bodyFontSize: 38,
        focusFontSize: 34,
        lineSpacing: 1.5,
        paragraphSpacing: 42,
        titleSpacing: 56,
      },
    }, 1);

    expect(result.fitScale).toBeLessThan(1);
    expect(result.pages.every((page) => page.overflow.length === 0)).toBe(true);
  });

  it("does not rewrite manually arranged pages", () => {
    const source = parseArticleContent("# 标题\n\n正文", { mode: "knowledge" });
    const first = layoutCardPagesToTarget(source, createApproximateTextMeasurer(), {}, 1);
    const result = layoutCardPagesToTarget(source, createApproximateTextMeasurer(), {
      manualPages: [{ id: first.pages[0]!.id, layout: first.pages[0] }],
    }, 1);

    expect(result.fitScale).toBe(1);
  });
});
