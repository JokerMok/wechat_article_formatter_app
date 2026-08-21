import { describe, expect, it } from "vitest";
import {
  WORKSPACE_PLATFORM_IDS,
  WORKSPACE_VERSION_KEY,
  clearManualCardPages,
  createWorkspaceState,
  isAiProviderConfigured,
  platformVersionsFromDrafts,
  readPersistedWorkspace,
  sanitizeWechatHtml,
  serializeWorkspace,
  toggleLockedPage,
  updatePlatformBlock,
  updatePlatformRatio,
  withLockedCardPage,
  withManualCardPages,
  withWechatHtmlOverride,
} from "./state";
import type { CardLayoutPage } from "@/lib/renderers/cards";

function cardPage(id: string, text: string): CardLayoutPage {
  return {
    id,
    pageNumber: 1,
    totalPages: 1,
    aspectRatio: "3:4",
    canvas: { width: 1080, height: 1440 },
    safeArea: { top: 100, right: 100, bottom: 100, left: 100, x: 100, y: 100, width: 880, height: 1240 },
    manual: true,
    nodes: [
      {
        id: `${id}-node`,
        entryId: "block-1",
        blockId: "block-1",
        kind: "body",
        sourceIndex: 1000,
        text,
        lines: [{ text, x: 100, y: 100, width: 200, height: 40 }],
        x: 100,
        y: 100,
        width: 300,
        height: 40,
      },
    ],
    overflow: [],
  };
}

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

  it("preserves manual and locked card pages through serialization", () => {
    const state = createWorkspaceState();
    const manual = cardPage("manual-1", "手动第一页");
    const locked = { ...cardPage("locked-1", "锁定页"), locked: true };
    const next = {
      ...state,
      platforms: {
        ...state.platforms,
        xiaohongshu: withManualCardPages(state.platforms.xiaohongshu, [manual, locked]),
      },
    };

    const restored = readPersistedWorkspace(serializeWorkspace(next));

    expect(restored?.platforms.xiaohongshu.manualPages.map((page) => [page.id, page.locked])).toEqual([
      ["manual-1", undefined],
      ["locked-1", true],
    ]);
    expect(restored?.platforms.xiaohongshu.lockedPageIds).toEqual(["locked-1"]);
  });

  it("can lock, unlock, and clear card page state without id-only placeholders", () => {
    const state = createWorkspaceState();
    const page = cardPage("page-1", "固定内容");
    const locked = withLockedCardPage(state.platforms.douyinImage, page, true);

    expect(locked.manualPages[0]?.nodes[0]?.text).toBe("固定内容");
    expect(locked.lockedPageIds).toEqual(["page-1"]);

    const unlocked = withLockedCardPage(locked, page, false);
    expect(unlocked.manualPages).toEqual([]);
    expect(clearManualCardPages(toggleLockedPage(locked, "legacy-id")).lockedPageIds).toEqual([]);
  });

  it("sanitizes edited WeChat HTML before it can be stored", () => {
    const state = createWorkspaceState();
    const dirtyHtml = `<section onclick="alert(1)" style="color:#111;background:url(javascript:bad)"><script>alert(1)</script><a href="javascript:bad">链接</a><img src="data:text/html;base64,abc" onerror="bad()" alt="x" /></section>`;
    const draft = withWechatHtmlOverride(state.platforms.wechat, dirtyHtml);

    expect(draft.editedWechatHtml).not.toContain("<script");
    expect(draft.editedWechatHtml).not.toContain("onclick");
    expect(draft.editedWechatHtml).not.toContain("javascript:");
    expect(draft.editedWechatHtml).not.toContain("data:text/html");
    expect(sanitizeWechatHtml(`<p style="line-height:1.8;color:#333">正文</p>`)).toContain("line-height");
  });

  it("serializes AI provider settings without any session API key field", () => {
    const state = createWorkspaceState();
    const next = {
      ...state,
      ai: {
        ...state.ai,
        mode: "assistant" as const,
        baseUrl: "https://api.example.test/v1",
        model: "fixture-model",
      },
    };

    expect(isAiProviderConfigured(next.ai, "session-token")).toBe(true);
    expect(isAiProviderConfigured(next.ai, "")).toBe(false);
    expect(JSON.stringify(serializeWorkspace(next))).not.toContain("session-token");
    expect(platformVersionsFromDrafts(next.platforms).wechat?.title).toBe(next.platforms.wechat.title);
  });
});
