import { describe, expect, it } from "vitest";
import { parseArticleContent } from "../../article-parser";
import { styleTemplates } from "../../style-templates";
import { createWechatPlatformContent, createWechatPlatformVersion } from "./index";

describe("createWechatPlatformVersion", () => {
  it("TEST-005 creates an independent stable WeChat platform version from unified content", () => {
    const unified = parseArticleContent(`# 主标题

正文第一段，包含 **重点**。

> 关键判断

- 第一项
- 第二项

![架构图](https://example.com/arch.png)`, { mode: "knowledge" });

    const version = createWechatPlatformVersion(unified, {
      template: styleTemplates.zhenyiKnowledgeMinimal,
      updatedAt: "2026-08-21T00:00:00.000Z",
    });

    expect(version.platform).toBe("wechat");
    expect(version.status).toBe("generated");
    expect(version.title).toBe("主标题");
    expect(version.updatedAt).toBe("2026-08-21T00:00:00.000Z");
    expect(version.content.platform).toBe("wechat");
    expect(version.content.rendererVersion).toBe(1);
    expect(version.content.templateKey).toBe("zhenyiKnowledgeMinimal");
    expect(version.content.blocks.map((block) => block.id)).toEqual(unified.blocks.map((block) => block.id));
    expect(version.content.html).toContain("<strong>重点</strong>");
    expect(version.content.html).toContain("关键判断");
    expect(version.content.html).toContain("第一项");
    expect(version.content.html).toContain('<img src="https://example.com/arch.png"');

    version.content.blocks[1].text = "已编辑的公众号段落";
    expect(unified.blocks[1].text).toBe("正文第一段，包含 **重点**。");
  });

  it("keeps supplied image nodes aligned with image blocks in platform block HTML", () => {
    const unified = parseArticleContent(`# 发布标题

开场正文

![原始图片一](https://source.example/one.png)

后续正文

![原始图片二](https://source.example/two.png)`, { mode: "knowledge" });

    const content = createWechatPlatformContent(unified, {
      template: styleTemplates.zhenyiKnowledgeMinimal,
      imageNodes: [
        { src: "https://cdn.example/first.png", alt: "第一张" },
        { src: "https://cdn.example/second.png", alt: "第二张" },
      ],
    });
    const imageBlocks = content.blocks.filter((block) => block.sourceType === "image");

    expect(imageBlocks).toHaveLength(2);
    expect(imageBlocks[0].html).toContain('<img src="https://cdn.example/first.png" alt="第一张"');
    expect(imageBlocks[1].html).toContain('<img src="https://cdn.example/second.png" alt="第二张"');
    expect(imageBlocks[0].html).not.toContain("https://source.example/one.png");
    expect(imageBlocks[1].html).not.toContain("https://source.example/two.png");
    expect(content.html).toContain('<img src="https://cdn.example/first.png" alt="第一张"');
    expect(content.html).toContain('<img src="https://cdn.example/second.png" alt="第二张"');
  });

  it("keeps id-bound and positional image nodes consistent across platform outputs", () => {
    const unified = parseArticleContent(`# 发布标题

开场正文

![原始图片一](https://source.example/one.png)

后续正文

![原始图片二](https://source.example/two.png)`, { mode: "knowledge" });
    const unifiedImageBlocks = unified.blocks.filter((block) => block.type === "image");
    const secondBlock = unifiedImageBlocks[1];

    if (!secondBlock) {
      throw new Error("expected second image block");
    }

    const content = createWechatPlatformContent(unified, {
      template: styleTemplates.zhenyiKnowledgeMinimal,
      imageNodes: [
        { id: secondBlock.id, src: "https://cdn.example/second-bound.png", alt: "第二张绑定图" },
        { src: "https://cdn.example/first-positional.png", alt: "第一张位置图" },
      ],
    });
    const imageBlocks = content.blocks.filter((block) => block.sourceType === "image");

    expect(imageBlocks).toHaveLength(2);
    expect(imageBlocks[0].html).toContain('<img src="https://cdn.example/first-positional.png" alt="第一张位置图"');
    expect(imageBlocks[1].html).toContain('<img src="https://cdn.example/second-bound.png" alt="第二张绑定图"');
    expect(content.html.indexOf("https://cdn.example/first-positional.png")).toBeLessThan(content.html.indexOf("https://cdn.example/second-bound.png"));
    expect(content.images.map((node) => node.src)).toEqual(["https://cdn.example/first-positional.png", "https://cdn.example/second-bound.png"]);
    expect(content.images.map((node) => node.blockId)).toEqual(unifiedImageBlocks.map((block) => block.id));
  });
});
