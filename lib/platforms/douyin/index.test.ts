import { describe, expect, it } from "vitest";
import { parseArticleContent } from "../../article-parser";
import { collectRenderableBlocks, platformProfiles, type DouyinLongformProfile } from "../platform-profiles";
import { toDouyinImageText, toDouyinLongform, type DouyinImageRatio } from ".";

const longArticle = Array.from({ length: 220 }, (_, index) => {
  const heading = index % 10 === 0 ? `一、结论 ${index / 10 + 1}` : `第${index + 1}段`;
  return `${heading}\n\n这是第 ${index + 1} 条稳定的长文本，用于验证长文分页和边界。`;
}).join("\n\n");

const normalArticle = `
文章标题

核心观点：同一源文章可稳定生成独立平台版本。

一、方法
- 第一条经验
- 第二条经验

> 可靠规则比个人偏好更重要。

总结：这篇长文会同时产出图文和长文版本。
`;

describe("toDouyinImageText & toDouyinLongform", () => {
  it("keeps image and longform outputs isolated and source-traceable", () => {
    const content = parseArticleContent(normalArticle);
    const image = toDouyinImageText(content);
    const longform = toDouyinLongform(content);

    expect(image.platform).toBe("douyinImage");
    expect(longform.platform).toBe("douyinLongform");
    expect(image.source.sourceTextFingerprint).toBe(longform.source.sourceTextFingerprint);
    expect(image.profileVersion).toBe("1.0.0");
    expect(longform.profileVersion).toBe("1.0.0");

    const mutatedImage = toDouyinImageText(content, { ratio: "9:16" });
    expect(mutatedImage.ratio).toBe("9:16");
    expect(mutatedImage.pages.length).toBeLessThanOrEqual(image.pages.length);
  });

  it("keeps conversion results independent across edits", () => {
    const content = parseArticleContent(normalArticle);
    const image = toDouyinImageText(content);
    const longform = toDouyinLongform(content);

    image.tags.push("extra-tag");
    longform.tags.push("another-tag");

    const imageNext = toDouyinImageText(content);
    const longNext = toDouyinLongform(content);

    expect(imageNext.tags).not.toContain("extra-tag");
    expect(longNext.tags).not.toContain("another-tag");
  });

  it("supports ratio switching without content loss", () => {
    const content = parseArticleContent(longArticle);
    const threeByFour = toDouyinImageText(content, { ratio: "3:4" as DouyinImageRatio });
    const nineBySixteen = toDouyinImageText(content, { ratio: "9:16" as DouyinImageRatio });

    const threeBlocks = threeByFour.pages.flatMap((page) => page.blocks);
    const nineBlocks = nineBySixteen.pages.flatMap((page) => page.blocks);

    expect(threeByFour.source.blockIds).toEqual(nineBySixteen.source.blockIds);
    expect(nineBlocks.length).toEqual(threeBlocks.length);
  });

  it("falls back deterministically for an unsupported runtime ratio without dropping blocks", () => {
    const content = parseArticleContent(longArticle);
    const output = toDouyinImageText(content, { ratio: "1:1" as DouyinImageRatio });
    const blocks = output.pages.flatMap((page) => page.blocks);

    expect(output.ratio).toBe(platformProfiles.douyinImage.defaultAspectRatio);
    expect(blocks).toHaveLength(collectRenderableBlocks(content).length);
    expect(output.pages.every((page) => page.blocks.length > 0)).toBe(true);
    expect(output.pages.every((page) => page.blocks.every((block) => Number.isFinite(block.text.length)))).toBe(true);
  });

  it("builds longform intro/body/highlights/ending deterministically", () => {
    const content = parseArticleContent(normalArticle);
    const longformFirst = toDouyinLongform(content);
    const longformSecond = toDouyinLongform(content);

    expect(longformFirst).toEqual(longformSecond);
    expect(longformFirst.intro).toBeTruthy();
    expect(longformFirst.body).toBeTruthy();
    expect(longformFirst.highlights.length).toBeGreaterThan(0);
    expect(longformFirst.ending).toBeTruthy();
    expect(longformFirst.caption).toContain(longformFirst.title);
  });

  it("uses the centralized intro target from the selected versioned profile", () => {
    const content = parseArticleContent(
      `这是一段足够长的普通正文，用来验证导语目标长度确实来自所选的平台 profile，而不是转换器内部的固定数字，并且继续补充内容以确保解析器将它识别为段落，而不是文章标题。`
    );
    const defaultOutput = toDouyinLongform(content);
    const tunedProfile: DouyinLongformProfile = {
      ...platformProfiles.douyinLongform,
      profileVersion: "1.1.0",
      introTargetWords: 4,
    };
    const tunedOutput = toDouyinLongform(content, { profile: tunedProfile });

    expect(tunedOutput.profileVersion).toBe("1.1.0");
    expect(tunedOutput.schemaVersion).toBe(tunedProfile.outputSchemaVersion);
    expect(tunedOutput.intro.length).toBeLessThan(defaultOutput.intro.length);
    expect(tunedOutput.intro).toBe(toDouyinLongform(content, { profile: tunedProfile }).intro);
  });
});
