import { describe, expect, it } from "vitest";
import {
  AUTO_SAVE_DEBOUNCE_MS,
  WORKSPACE_PLATFORM_IDS,
  WORKSPACE_HISTORY_LIMIT,
  WORKSPACE_VERSION_KEY,
  applyPlatformDraftReplacements,
  applyDesignSchemeToDraft,
  applyManualPageOrder,
  clearManualCardPages,
  createPlatformDraftSignatureMap,
  createWorkspaceState,
  describeProjectBackupExportStatus,
  describeProjectBackupImportStatus,
  getMissingAiProviderFields,
  isAiProviderConfigured,
  markAiConfigurationIncomplete,
  markAiGenerationFailure,
  platformDraftFromVersion,
  platformVersionsFromDrafts,
  pushDraftHistory,
  pushDraftRedoHistory,
  readPersistedWorkspace,
  regeneratePlatformDraft,
  resolveDesignSchemeApplication,
  resolveRegenerationPlatforms,
  sanitizeWechatHtml,
  serializeWorkspace,
  selectRestorableBackupProject,
  toggleLockedPage,
  updatePlatformBlock,
  updatePlatformCaption,
  updatePlatformRatio,
  updatePlatformTags,
  updatePlatformTitle,
  updateWorkspaceSource,
  updateWorkspaceSourceDraft,
  withLockedCardPage,
  withManualCardPages,
  withWechatHtmlOverride,
  PROJECT_BACKUP_IMAGE_NOTICE,
} from "./state";
import { mergeAdjacentCardPages, moveCardImagePage, splitCardImagePageAfterElement, type CardLayoutPage, type CardLayoutResult } from "../../lib/renderers/cards";
import { parseArticleContent } from "../../lib/article-parser";
import { analyzeArticleDesign } from "../../lib/design-plan";
import type { DraftHistory } from "./types";

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

function emptyHistories() {
  return Object.fromEntries(WORKSPACE_PLATFORM_IDS.map((platform) => [platform, { past: [], future: [] }])) as unknown as Record<
    (typeof WORKSPACE_PLATFORM_IDS)[number],
    DraftHistory
  >;
}

function projectBackupWithMutatedManualPage(mutate: (page: CardLayoutPage) => void) {
  const state = createWorkspaceState(`# 合法标题

正文。
`);
  const platformWithManualPage = withManualCardPages(state.platforms.xiaohongshu, [cardPage("manual-page", "手动分页")]);
  const platformVersions = serializeWorkspace({
    ...state,
    platforms: {
      ...state.platforms,
      xiaohongshu: platformWithManualPage,
    },
  });
  const raw = platformVersions[WORKSPACE_VERSION_KEY] as ReturnType<typeof createWorkspaceState>;
  mutate(raw.platforms.xiaohongshu.manualPages[0]);
  return { state, platformVersions };
}

describe("workspace state", () => {
  it("uses the required workspace timing and history limits", () => {
    expect(AUTO_SAVE_DEBOUNCE_MS).toBe(800);
    expect(WORKSPACE_HISTORY_LIMIT).toBe(50);
  });

  it("creates isolated drafts for all platforms", () => {
    const state = createWorkspaceState(`# 标题

正文第一段。
`);

    expect(Object.keys(state.platforms).sort()).toEqual([...WORKSPACE_PLATFORM_IDS].sort());
    expect(state.platforms.wechat.content).not.toBe(state.platforms.xiaohongshu.content);
    expect(state.platforms.douyinImage.ratio).toBe("9:16");
    expect(state.platforms.wechat.sourceRevision).toBe(state.sourceRevision);
    expect(state.designPlan.recommendedScheme).toBeDefined();
  });

  it("marks existing platform drafts as out of date by source revision without overwriting them", () => {
    const state = createWorkspaceState("# 原标题\n\n原正文。");
    const edited = updatePlatformTitle(state.platforms.wechat, "人工标题");
    const next = updateWorkspaceSource({ ...state, platforms: { ...state.platforms, wechat: edited } }, "# 新标题\n\n新正文。");

    expect(next.sourceRevision).not.toBe(edited.sourceRevision);
    expect(next.platforms.wechat.title).toBe("人工标题");
    expect(next.platforms.wechat.status).toBe("edited");
  });

  it("keeps source analysis explicit while editing the source draft", () => {
    const state = createWorkspaceState("# 原标题\n\n原正文。");
    const next = updateWorkspaceSourceDraft(state, "# 新标题\n\n新正文。\n\n## 新章节\n\n新的结构。");

    expect(next.sourceRevision).not.toBe(state.sourceRevision);
    expect(next.designPlan.sourceRevision).toBe(state.designPlan.sourceRevision);
    expect(next.designPlan.blueprint.sourceFacts).toEqual(state.designPlan.blueprint.sourceFacts);
    expect(next.sourceMarkdown).toContain("新标题");
  });

  it("applies a visual scheme without changing platform text", () => {
    const state = createWorkspaceState("# 标题\n\n正文。");
    const before = state.platforms.wechat;
    const after = applyDesignSchemeToDraft(before, "checklistGuide");

    expect(after.schemeId).toBe("checklistGuide");
    expect(after.templateKey).toBe("zhenyiChecklist");
    expect(after.content).toEqual(before.content);
    expect(after.status).toBe("edited");
  });

  it("keeps the current layout when applying C as a visual-only change", () => {
    const state = createWorkspaceState("# 观点标题\n\n观点正文。\n");
    const before = { ...state.platforms.xiaohongshu, layoutId: "editorial" as const };
    const selection = resolveDesignSchemeApplication(before, "storyNarrative", "visual", state.designPlan);
    const after = applyDesignSchemeToDraft(before, "storyNarrative");

    expect(selection).toMatchObject({ themeId: "storyMagazine", layoutId: "editorial" });
    expect(after.themeId).toBe("storyMagazine");
    expect(after.layoutId).toBe("editorial");
    expect(after.content).toEqual(before.content);
  });

  it("switches C to the story layout when applying structure", () => {
    const state = createWorkspaceState(`# 项目经历

第一次接手时问题很多，资料、流程和责任边界都没有整理清楚，团队只能先靠经验推进项目。

## 冲突出现

当时客户希望马上看到完整结果，但我们知道基础数据还没有准备好，直接承诺会带来更大的问题。

## 经过调整

后来我们先做了一个能验证的小版本，把已知范围和缺失条件逐项记录下来，再根据反馈继续补齐。

## 转折发生

但是项目真正改变方向，是在一次复盘之后：大家开始把演示结果和生产能力分开讨论。

## 最后的体会

回头看，先做出一个可讨论的版本并不可怕，关键是始终记得下一步要补什么。`);
    const before = { ...state.platforms.xiaohongshu, layoutId: "editorial" as const };
    const selection = resolveDesignSchemeApplication(before, "storyNarrative", "structure", state.designPlan);
    const plan = analyzeArticleDesign(parseArticleContent(state.sourceMarkdown, { mode: "knowledge" }), {
      recommendedThemeId: selection.themeId,
      recommendedLayoutId: selection.layoutId,
    });
    const after = regeneratePlatformDraft(
      { ...before, ...selection, templateKey: "zhenyiStoryMagazine" },
      parseArticleContent(state.sourceMarkdown, { mode: "knowledge" }),
      state.ai,
      plan,
      { preserveManualSelection: false },
    );

    expect(selection).toMatchObject({ themeId: "storyMagazine", layoutId: "story" });
    expect(after.themeId).toBe("storyMagazine");
    expect(after.layoutId).toBe("story");
    expect(after.content.blocks.filter((block) => block.type !== "pageBreak").map((block) => block.text)).toEqual(parseArticleContent(state.sourceMarkdown, { mode: "knowledge" }).blocks.filter((block) => block.type !== "pageBreak").map((block) => block.text));
  });

  it("switches B to the checklist layout when applying structure", () => {
    const state = createWorkspaceState(`# 发布清单

- 先检查标题是否保留核心判断
- 再检查正文是否有清晰步骤
- 注意不要把多个结论塞进一页
- 检查图片是否有可用来源
- 核对标签是否包含虚构事实
- 最后确认发布边界和人工复核

发布前还要逐项记录异常，避免遗漏关键动作。`);
    const selection = resolveDesignSchemeApplication(state.platforms.xiaohongshu, "checklistGuide", "structure", state.designPlan);
    const plan = analyzeArticleDesign(parseArticleContent(state.sourceMarkdown, { mode: "knowledge" }), {
      recommendedThemeId: selection.themeId,
      recommendedLayoutId: selection.layoutId,
    });

    expect(selection).toMatchObject({ themeId: "informationCard", layoutId: "checklist" });
    expect(plan.platformPlans.xiaohongshu.themeId).toBe("informationCard");
    expect(plan.platformPlans.xiaohongshu.layoutId).toBe("checklist");
    expect(plan.platformPlans.xiaohongshu.pages.map((page) => page.kind).some((kind) => ["checklist", "step"].includes(kind))).toBe(true);
  });

  it("uses the new recommendation for an untouched draft and keeps a manual theme", () => {
    const initial = createWorkspaceState("# 初始标题\n\n初始正文。");
    const story = createWorkspaceState(`# 我第一次做项目，先做出来的不是系统

第一次接手时问题很多，后来经过调整，最后完成了交付。`);
    const source = parseArticleContent(story.sourceMarkdown, { mode: "knowledge" });

    const recommended = regeneratePlatformDraft(initial.platforms.xiaohongshu, source, initial.ai, story.designPlan);
    expect(recommended.schemeId).toBe("storyNarrative");
    expect(recommended.themeId).toBe("storyMagazine");
    expect(recommended.layoutId).toBe("story");

    const manuallyStyled = applyDesignSchemeToDraft(initial.platforms.xiaohongshu, "checklistGuide");
    const preserved = regeneratePlatformDraft(manuallyStyled, source, initial.ai, story.designPlan);
    expect(preserved.schemeId).toBe("checklistGuide");
    expect(preserved.themeId).toBe("informationCard");
  });

  it("edits only the selected platform draft", () => {
    const state = createWorkspaceState(`# 标题

正文第一段。
`);
    const paragraph = state.platforms.wechat.content.blocks.find((block) => block.type === "paragraph");
    const untouchedXiaohongshu = state.platforms.xiaohongshu;
    expect(paragraph).toBeDefined();

    const edited = updatePlatformBlock(state.platforms.wechat, paragraph!.id, "只改公众号版本。");

    expect(edited.content.blocks.find((block) => block.id === paragraph!.id && "text" in block)?.text).toBe("只改公众号版本。");
    expect(state.platforms.xiaohongshu).toBe(untouchedXiaohongshu);
  });

  it("preserves manually edited title and caption when block text changes", () => {
    const state = createWorkspaceState(`# 原始标题

正文第一段。
`);
    const titled = updatePlatformTitle(state.platforms.xiaohongshu, "人工标题");
    const captioned = updatePlatformCaption(titled, "人工发布文案");
    const paragraph = captioned.content.blocks.find((block) => block.type === "paragraph");
    expect(paragraph).toBeDefined();

    const edited = updatePlatformBlock(captioned, paragraph!.id, "正文改动。");

    expect(edited.title).toBe("人工标题");
    expect(edited.meta.caption).toBe("人工发布文案");
    expect(edited.content.blocks.find((block) => block.id === paragraph!.id && "text" in block)?.text).toBe("正文改动。");
  });

  it("preserves an edited caption and deliberately cleared tags when changing aspect ratio", () => {
    const state = createWorkspaceState("# 标题\n\n正文。");
    const draft = updatePlatformTags(updatePlatformCaption(state.platforms.douyinImage, "人工发布文案"), "");
    const resized = updatePlatformRatio(draft, "9:16");
    expect(resized.meta.caption).toBe("人工发布文案");
    expect(resized.meta.tags).toEqual([]);
    expect(resized.content).toBe(draft.content);
    expect(resized.ratio).toBe("9:16");
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

  it("uses explicit theme and layout fields when persisted scheme metadata disagrees", () => {
    const state = createWorkspaceState("# 迁移标题\n\n迁移正文。\n");
    const serialized = serializeWorkspace({
      ...state,
      platforms: {
        ...state.platforms,
        xiaohongshu: {
          ...state.platforms.xiaohongshu,
          schemeId: "knowledgeMinimal",
          themeId: "storyMagazine",
          layoutId: "story",
        },
      },
    });

    const restored = readPersistedWorkspace(serialized);

    expect(restored?.platforms.xiaohongshu.themeId).toBe("storyMagazine");
    expect(restored?.platforms.xiaohongshu.layoutId).toBe("story");
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

  it("applies full manual page order to layout previews", () => {
    const state = createWorkspaceState();
    const first = cardPage("page-1", "第一页");
    const second = cardPage("page-2", "第二页");
    const third = cardPage("page-3", "第三页");
    const layout: CardLayoutResult = {
      source: state.platforms.xiaohongshu.content,
      pages: [first, second, third].map((page, index) => ({ ...page, manual: true, pageNumber: index + 1, totalPages: 3 })),
      overflow: [],
    };
    const draft = withManualCardPages(state.platforms.xiaohongshu, [third, first, second]);

    const ordered = applyManualPageOrder(layout, draft.manualPages);

    expect(ordered.pages.map((page) => [page.id, page.pageNumber])).toEqual([
      ["page-3", 1],
      ["page-1", 2],
      ["page-2", 3],
    ]);
  });

  it("keeps split, merged, and moved manual card pages from being replaced by automatic order", () => {
    const state = createWorkspaceState();
    const first = {
      ...cardPage("page-1", "第一页"),
      nodes: [
        cardPage("page-1-a", "第一页 A").nodes[0],
        { ...cardPage("page-1-b", "第一页 B").nodes[0], id: "page-1-b-node" },
      ],
    };
    const second = cardPage("page-2", "第二页");
    const layout: CardLayoutResult = {
      source: state.platforms.xiaohongshu.content,
      pages: [
        { ...first, manual: true, pageNumber: 1, totalPages: 2 },
        { ...second, manual: true, pageNumber: 2, totalPages: 2 },
      ],
      overflow: [],
    };

    const split = splitCardImagePageAfterElement(layout, first.id, first.nodes[0]?.id ?? "");
    const merged = mergeAdjacentCardPages(split, split.pages[0]?.id ?? "");
    const moved = moveCardImagePage(merged, second.id, 0);
    const draft = withManualCardPages(state.platforms.xiaohongshu, moved.pages.map((page) => ({ ...page, manual: true })));
    const ordered = applyManualPageOrder(layout, draft.manualPages);

    expect(draft.manualPages.map((page) => page.id)).toEqual([second.id, first.id]);
    expect(ordered.pages.map((page) => [page.id, page.pageNumber])).toEqual([
      [second.id, 1],
      [first.id, 2],
    ]);
  });

  it("filters empty automatic trailing pages after manual card pages consume all entries", () => {
    const state = createWorkspaceState();
    const manual = cardPage("manual-1", "手动第一页");
    const emptyAutomatic = { ...cardPage("page-1", "自动空白"), id: "page-1", manual: false, nodes: [] };
    const layout: CardLayoutResult = {
      source: state.platforms.xiaohongshu.content,
      pages: [
        { ...manual, pageNumber: 1, totalPages: 2 },
        { ...emptyAutomatic, pageNumber: 2, totalPages: 2 },
      ],
      overflow: [],
    };

    const ordered = applyManualPageOrder(layout, [manual]);

    expect(ordered.pages.map((page) => [page.id, page.pageNumber, page.totalPages, page.nodes.length])).toEqual([["manual-1", 1, 1, 1]]);
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
        mode: "custom" as const,
        baseUrl: "https://api.example.test/v1",
        model: "fixture-model",
      },
    };

    expect(isAiProviderConfigured(next.ai, "session-token")).toBe(true);
    expect(isAiProviderConfigured(next.ai, "")).toBe(false);
    expect(JSON.stringify(serializeWorkspace(next))).not.toContain("session-token");
    expect(platformVersionsFromDrafts(next.platforms).wechat?.title).toBe(next.platforms.wechat.title);
  });

  it("keeps only the latest 50 undo and redo history snapshots", () => {
    const state = createWorkspaceState();
    const snapshots = Array.from({ length: WORKSPACE_HISTORY_LIMIT + 5 }, (_, index) => ({
      ...state.platforms.wechat,
      title: `快照 ${index}`,
    }));

    const history = snapshots.reduce<DraftHistory>((current, snapshot) => pushDraftHistory(current, snapshot), { past: [], future: [] });
    const redoHistory = pushDraftRedoHistory({ past: history.past, future: [state.platforms.wechat] }, state.platforms.wechat);

    expect(history.past).toHaveLength(WORKSPACE_HISTORY_LIMIT);
    expect(history.past[0]?.title).toBe("快照 5");
    expect(redoHistory.past).toHaveLength(WORKSPACE_HISTORY_LIMIT);
    expect(redoHistory.future).toEqual([]);
  });

  it("pushes overwritten drafts into history for deterministic and AI replacement commits", () => {
    const state = createWorkspaceState(`# 旧标题

旧正文。
`);
    const deterministicSource = createWorkspaceState(`# 本地标题

本地正文。
`);
    const deterministicDraft = regeneratePlatformDraft(state.platforms.wechat, deterministicSource.platforms.wechat.content, state.ai);
    const initialTitle = state.platforms.wechat.title;
    const deterministicTitle = deterministicDraft.title;
    const deterministicResult = applyPlatformDraftReplacements({
      drafts: state.platforms,
      histories: emptyHistories(),
      replacements: { wechat: deterministicDraft },
    });

    expect(deterministicResult.appliedPlatforms).toEqual(["wechat"]);
    expect(deterministicResult.histories.wechat.past).toHaveLength(1);
    expect(deterministicResult.histories.wechat.past[0]?.title).toBe(initialTitle);
    expect(deterministicResult.drafts.wechat.title).toBe(deterministicTitle);

    const aiSource = createWorkspaceState(`# AI 标题

AI 正文。
`);
    const aiVersion = platformVersionsFromDrafts(aiSource.platforms).wechat;
    expect(aiVersion).toBeDefined();
    const aiDraft = platformDraftFromVersion(deterministicResult.drafts.wechat, aiVersion!);
    const aiResult = applyPlatformDraftReplacements({
      drafts: deterministicResult.drafts,
      histories: deterministicResult.histories,
      replacements: { wechat: aiDraft },
    });

    expect(aiResult.histories.wechat.past).toHaveLength(2);
    expect(aiResult.histories.wechat.past.at(-1)?.title).toBe(deterministicTitle);
    expect(aiResult.drafts.wechat.title).toBe(aiVersion!.title);
  });

  it("does not overwrite or write history for platform drafts edited during AI generation", () => {
    const state = createWorkspaceState(`# 原标题

原正文。
`);
    const requestSignatures = createPlatformDraftSignatureMap(state.platforms, ["wechat", "xiaohongshu"]);
    const paragraph = state.platforms.wechat.content.blocks.find((block) => block.type === "paragraph");
    expect(paragraph).toBeDefined();
    const editedWechat = updatePlatformBlock(state.platforms.wechat, paragraph!.id, "AI 请求期间的人工修改。");
    const currentDrafts = { ...state.platforms, wechat: editedWechat };
    const aiSource = createWorkspaceState(`# AI 标题

AI 正文。
`);
    const aiVersions = platformVersionsFromDrafts(aiSource.platforms);

    const result = applyPlatformDraftReplacements({
      drafts: currentDrafts,
      histories: emptyHistories(),
      replacements: {
        wechat: platformDraftFromVersion(currentDrafts.wechat, aiVersions.wechat!),
        xiaohongshu: platformDraftFromVersion(currentDrafts.xiaohongshu, aiVersions.xiaohongshu!),
      },
      changedSince: requestSignatures,
    });

    expect(result.skippedChangedPlatforms).toEqual(["wechat"]);
    expect(result.appliedPlatforms).toEqual(["xiaohongshu"]);
    expect(result.drafts.wechat.content.blocks.find((block) => block.id === paragraph!.id && "text" in block)?.text).toBe("AI 请求期间的人工修改。");
    expect(result.drafts.xiaohongshu.title).toBe(aiVersions.xiaohongshu!.title);
    expect(result.histories.wechat.past).toEqual([]);
    expect(result.histories.xiaohongshu.past).toHaveLength(1);
  });

  it("requires explicit confirmation before regenerating edited platform drafts", () => {
    const state = createWorkspaceState(`# 标题

正文。
`);
    const paragraph = state.platforms.wechat.content.blocks.find((block) => block.type === "paragraph");
    expect(paragraph).toBeDefined();
    const current = {
      ...state.platforms,
      wechat: updatePlatformBlock(state.platforms.wechat, paragraph!.id, "公众号人工修改。"),
    };
    const confirmations: string[][] = [];

    const cancelled = resolveRegenerationPlatforms(current, ["wechat", "xiaohongshu"], (editedPlatforms) => {
      confirmations.push(editedPlatforms);
      return false;
    });
    const confirmed = resolveRegenerationPlatforms(current, ["wechat"], (editedPlatforms) => {
      confirmations.push(editedPlatforms);
      return true;
    });
    const uneditedOnly = resolveRegenerationPlatforms(current, ["xiaohongshu"], () => {
      throw new Error("unedited platform must not ask for overwrite confirmation");
    });

    expect(cancelled.platforms).toEqual(["xiaohongshu"]);
    expect(cancelled.skippedEditedPlatforms).toEqual(["wechat"]);
    expect(confirmed.platforms).toEqual(["wechat"]);
    expect(uneditedOnly.platforms).toEqual(["xiaohongshu"]);
    expect(confirmations).toEqual([["wechat"], ["wechat"]]);
  });

  it("preserves edited drafts when regeneration confirmation is cancelled", () => {
    const state = createWorkspaceState(`# 旧标题

旧正文。
`);
    const sourceArticle = createWorkspaceState(`# 新标题

新正文。
`);
    const paragraph = state.platforms.wechat.content.blocks.find((block) => block.type === "paragraph");
    expect(paragraph).toBeDefined();
    const current = {
      ...state.platforms,
      wechat: updatePlatformBlock(state.platforms.wechat, paragraph!.id, "公众号人工修改。"),
    };
    const regeneration = resolveRegenerationPlatforms(current, ["wechat", "xiaohongshu"], () => false);
    const next = Object.fromEntries(
      WORKSPACE_PLATFORM_IDS.map((platform) => [
        platform,
        regeneration.platforms.includes(platform) ? regeneratePlatformDraft(current[platform], sourceArticle.platforms.wechat.content, state.ai) : current[platform],
      ]),
    ) as typeof current;

    expect(next.wechat.content.blocks.find((block) => block.id === paragraph!.id && "text" in block)?.text).toBe("公众号人工修改。");
    expect(next.xiaohongshu.title).toContain("新标题");
  });

  it("marks incomplete AI configuration without replacing any current platform drafts", () => {
    const state = createWorkspaceState(`# 标题

正文。
`);
    const paragraph = state.platforms.wechat.content.blocks.find((block) => block.type === "paragraph");
    expect(paragraph).toBeDefined();
    const editedWechat = updatePlatformBlock(state.platforms.wechat, paragraph!.id, "公众号人工修改。");
    const editedXiaohongshu = updatePlatformCaption(state.platforms.xiaohongshu, "小红书人工发布文案");
    const current = {
      ...state,
      ai: { ...state.ai, mode: "custom" as const, baseUrl: "", model: "" },
      platforms: {
        ...state.platforms,
        wechat: editedWechat,
        xiaohongshu: editedXiaohongshu,
      },
    };

    const missingFields = getMissingAiProviderFields(current.ai, "");
    const next = markAiConfigurationIncomplete(current, missingFields);

    expect(missingFields).toEqual(["Base URL", "模型", "Session API Key"]);
    expect(next.platforms).toBe(current.platforms);
    expect(next.platforms.wechat.content.blocks.find((block) => block.id === paragraph!.id && "text" in block)?.text).toBe("公众号人工修改。");
    expect(next.platforms.xiaohongshu.meta.caption).toBe("小红书人工发布文案");
    expect(next.ai.lastFallbackReason).toContain("切回本地模式后重新生成");
  });

  it("marks AI generation failures without replacing edited drafts with fallback content", () => {
    const state = createWorkspaceState(`# 标题

正文。
`);
    const paragraph = state.platforms.wechat.content.blocks.find((block) => block.type === "paragraph");
    expect(paragraph).toBeDefined();
    const editedWechat = updatePlatformBlock(state.platforms.wechat, paragraph!.id, "人工修改稿。");
    const next = markAiGenerationFailure(
      {
        ...state,
        platforms: { ...state.platforms, wechat: editedWechat },
      },
      "AI 限流",
    );

    expect(next.platforms.wechat.content.blocks.find((block) => block.id === paragraph!.id && "text" in block)?.text).toBe("人工修改稿。");
    expect(next.ai.lastFallbackReason).toContain("未自动套用本地回退版本");
  });

  it("selects a restorable project backup without accepting illegal asset metadata", () => {
    const state = createWorkspaceState(`# 可恢复标题

正文。
`);
    const selected = selectRestorableBackupProject({
      schemaVersion: 1,
      exportedAt: "2026-08-21T00:00:00.000Z",
      projects: [
        {
          schemaVersion: 2,
          id: "invalid",
          title: "非法项目",
          article: state.platforms.wechat.content,
          assets: [],
          platformVersions: {},
          createdAt: "2026-08-20T00:00:00.000Z",
          updatedAt: "2026-08-20T00:00:00.000Z",
        },
        {
          schemaVersion: 2,
          id: "valid",
          title: "可恢复项目",
          article: state.platforms.wechat.content,
          assets: [
            { id: "asset-2", fileName: "bad.svg", mimeType: "image/svg+xml", byteLength: 10 } as never,
          ],
          platformVersions: serializeWorkspace(state),
          createdAt: "2026-08-21T00:00:00.000Z",
          updatedAt: "2026-08-21T00:00:00.000Z",
        },
      ],
      unknownProjects: [],
      assets: [{ id: "asset-1", projectId: "valid", fileName: "cover.png", mimeType: "image/png", byteLength: 12, createdAt: "2026-08-21T00:00:00.000Z" }],
    });

    expect(selected?.title).toBe("可恢复项目");
    expect(selected?.assets).toEqual([{ id: "asset-1", fileName: "cover.png", mimeType: "image/png", byteLength: 12, crop: undefined }]);
    expect(selectRestorableBackupProject({ schemaVersion: 1, exportedAt: "", projects: [], unknownProjects: [], assets: [] })).toBeUndefined();
  });

  it("restores corrupted project backup meta without leaking invalid arrays or unknown fields", () => {
    const state = createWorkspaceState(`# 合法标题

正文。
`);
    const xiaohongshuTags = [...state.platforms.xiaohongshu.meta.tags];
    const xiaohongshuHighlights = [...(state.platforms.xiaohongshu.meta.highlights ?? [])];
    const douyinLongformTags = [...state.platforms.douyinLongform.meta.tags];
    const douyinLongformHighlights = [...(state.platforms.douyinLongform.meta.highlights ?? [])];
    const corrupted = serializeWorkspace(state);
    const raw = corrupted[WORKSPACE_VERSION_KEY] as typeof state;
    raw.platforms.xiaohongshu = {
      ...raw.platforms.xiaohongshu,
      status: "unknown" as never,
      meta: {
        ...raw.platforms.xiaohongshu.meta,
        body: { text: "非法正文" } as never,
        caption: ["非法文案"] as never,
        tags: {} as never,
        highlights: "非法重点" as never,
        polluted: true,
      } as never,
    };
    raw.platforms.douyinLongform = {
      ...raw.platforms.douyinLongform,
      meta: {
        ...raw.platforms.douyinLongform.meta,
        intro: 123 as never,
        ending: { text: "非法结尾" } as never,
        tags: "非法标签" as never,
        highlights: {} as never,
      } as never,
    };

    expect(() => readPersistedWorkspace(corrupted)).not.toThrow();
    const restored = readPersistedWorkspace(corrupted);
    const selected = selectRestorableBackupProject({
      schemaVersion: 1,
      exportedAt: "2026-08-21T00:00:00.000Z",
      projects: [
        {
          schemaVersion: 2,
          id: "corrupted-meta",
          title: "损坏 meta",
          article: state.platforms.wechat.content,
          assets: [],
          platformVersions: corrupted,
          createdAt: "2026-08-21T00:00:00.000Z",
          updatedAt: "2026-08-21T00:00:00.000Z",
        },
      ],
      unknownProjects: [],
      assets: [],
    });
    const restoredFromProject = readPersistedWorkspace(selected?.platformVersions);

    expect(restored?.platforms.xiaohongshu.status).toBe("generated");
    expect(Array.isArray(restored?.platforms.xiaohongshu.meta.tags)).toBe(true);
    expect(Array.isArray(restored?.platforms.xiaohongshu.meta.highlights)).toBe(true);
    expect(Array.isArray(restored?.platforms.douyinLongform.meta.tags)).toBe(true);
    expect(Array.isArray(restored?.platforms.douyinLongform.meta.highlights)).toBe(true);
    expect(restored?.platforms.xiaohongshu.meta.tags.join(" ")).toBe(xiaohongshuTags.join(" "));
    expect(restored?.platforms.xiaohongshu.meta.highlights?.join(" ")).toBe(xiaohongshuHighlights.join(" "));
    expect(restored?.platforms.douyinLongform.meta.tags.join(" ")).toBe(douyinLongformTags.join(" "));
    expect(restored?.platforms.douyinLongform.meta.highlights?.join(" ")).toBe(douyinLongformHighlights.join(" "));
    expect("polluted" in (restored?.platforms.xiaohongshu.meta ?? {})).toBe(false);
    expect(Array.isArray(restoredFromProject?.platforms.xiaohongshu.meta.tags)).toBe(true);
    expect(restoredFromProject?.platforms.xiaohongshu.meta.tags.join(" ")).toBe(xiaohongshuTags.join(" "));
  });

  it.each([
    ["canvas width is a string", (page: CardLayoutPage) => ((page.canvas as unknown as Record<string, unknown>).width = "bad")],
    ["node x is Infinity", (page: CardLayoutPage) => (page.nodes[0].x = Number.POSITIVE_INFINITY)],
    ["line height is an object", (page: CardLayoutPage) => ((page.nodes[0].lines[0] as unknown as Record<string, unknown>).height = { value: 40 })],
  ])("drops corrupted manual card pages when %s", (_name, mutate) => {
    const { state, platformVersions } = projectBackupWithMutatedManualPage(mutate);

    const selected = selectRestorableBackupProject({
      schemaVersion: 1,
      exportedAt: "2026-08-21T00:00:00.000Z",
      projects: [
        {
          schemaVersion: 2,
          id: "corrupted-manual-page",
          title: "损坏手动分页",
          article: state.platforms.wechat.content,
          assets: [],
          platformVersions,
          createdAt: "2026-08-21T00:00:00.000Z",
          updatedAt: "2026-08-21T00:00:00.000Z",
        },
      ],
      unknownProjects: [],
      assets: [],
    });
    const restored = readPersistedWorkspace(selected?.platformVersions);

    expect(selected?.title).toBe("损坏手动分页");
    expect(restored?.platforms.xiaohongshu.manualPages).toEqual([]);
    expect(restored?.platforms.xiaohongshu.content.blocks).toEqual(state.platforms.xiaohongshu.content.blocks);
  });

  it("rejects persisted workspace backups with invalid platform draft content", () => {
    const state = createWorkspaceState(`# 合法标题

正文。
`);
    const corrupted = serializeWorkspace({
      ...state,
      platforms: {
        ...state.platforms,
        wechat: {
          ...state.platforms.wechat,
          content: {} as never,
        },
      },
    });

    expect(readPersistedWorkspace(corrupted)).toBeUndefined();
    expect(
      selectRestorableBackupProject({
        schemaVersion: 1,
        exportedAt: "2026-08-21T00:00:00.000Z",
        projects: [
          {
            schemaVersion: 2,
            id: "corrupted",
            title: "损坏项目",
            article: state.platforms.wechat.content,
            assets: [],
            platformVersions: corrupted,
            createdAt: "2026-08-21T00:00:00.000Z",
            updatedAt: "2026-08-21T00:00:00.000Z",
          },
        ],
        unknownProjects: [],
        assets: [],
      }),
    ).toBeUndefined();
  });

  it("rejects project backups with invalid article content", () => {
    const state = createWorkspaceState(`# 合法标题

正文。
`);

    expect(
      selectRestorableBackupProject({
        schemaVersion: 1,
        exportedAt: "2026-08-21T00:00:00.000Z",
        projects: [
          {
            schemaVersion: 2,
            id: "invalid-article",
            title: "坏正文",
            article: {} as never,
            assets: [],
            platformVersions: serializeWorkspace(state),
            createdAt: "2026-08-21T00:00:00.000Z",
            updatedAt: "2026-08-21T00:00:00.000Z",
          },
        ],
        unknownProjects: [],
        assets: [],
      }),
    ).toBeUndefined();
  });

  it("describes project backup image metadata limits and missing local blobs", () => {
    expect(describeProjectBackupExportStatus(2)).toContain("共记录 2 张图片元数据");
    expect(describeProjectBackupExportStatus(2)).toContain(PROJECT_BACKUP_IMAGE_NOTICE);
    expect(describeProjectBackupImportStatus(3)).toContain("3 张图片缺失");
    expect(describeProjectBackupImportStatus(3)).toContain(PROJECT_BACKUP_IMAGE_NOTICE);
  });
});
