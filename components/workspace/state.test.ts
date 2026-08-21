import { describe, expect, it } from "vitest";
import {
  WORKSPACE_PLATFORM_IDS,
  WORKSPACE_VERSION_KEY,
  createWorkspaceState,
  readPersistedWorkspace,
  serializeWorkspace,
  updatePlatformBlock,
  updatePlatformRatio,
} from "./state";

describe("workspace state", () => {
  it("creates isolated drafts for all platforms", () => {
    const state = createWorkspaceState(`# 标题

正文第一段。
`);

    expect(Object.keys(state.platforms).sort()).toEqual([...WORKSPACE_PLATFORM_IDS].sort());
    expect(state.platforms.wechat.content).not.toBe(state.platforms.xiaohongshu.content);
    expect(state.platforms.douyinImage.ratio).toBe("3:4");
  });

  it("edits only the selected platform draft", () => {
    const state = createWorkspaceState(`# 标题

正文第一段。
`);
    const paragraph = state.platforms.wechat.content.blocks.find((block) => block.type === "paragraph");
    expect(paragraph).toBeDefined();

    const edited = updatePlatformBlock(state.platforms.wechat, paragraph!.id, "只改公众号版本。");

    expect(edited.content.blocks.find((block) => block.id === paragraph!.id && "text" in block)?.text).toBe("只改公众号版本。");
    expect(state.platforms.xiaohongshu.content.blocks.find((block) => block.id === paragraph!.id && "text" in block)?.text).toBe("正文第一段。");
  });

  it("restores persisted workspace state with social reflow settings", () => {
    const state = createWorkspaceState();
    const next = {
      ...state,
      platforms: {
        ...state.platforms,
        douyinImage: updatePlatformRatio(state.platforms.douyinImage, "9:16"),
      },
    };

    const restored = readPersistedWorkspace(serializeWorkspace(next));

    expect(restored?.schemaVersion).toBe(1);
    expect(restored?.platforms.douyinImage.ratio).toBe("9:16");
    expect(Object.prototype.hasOwnProperty.call(serializeWorkspace(next), WORKSPACE_VERSION_KEY)).toBe(true);
  });
});
