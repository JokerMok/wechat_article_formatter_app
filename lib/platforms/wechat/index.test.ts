import { describe, expect, it } from "vitest";
import { parseArticleContent } from "../../article-parser";
import { styleTemplates } from "../../style-templates";
import { createWechatPlatformVersion } from "./index";

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
});
