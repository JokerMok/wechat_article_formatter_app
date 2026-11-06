import "fake-indexeddb/auto";
import { afterAll, describe, expect, it } from "vitest";
import {
  deleteStyle,
  saveArticle,
  saveStyle,
  setArticleTrash,
  studioDB,
} from "./storage";
import { builtInStyles } from "./styles";
import type { ArticleDocument } from "./types";
const db = studioDB();
afterAll(async () => {
  await db.delete();
});
describe("independent studio persistence", () => {
  it("keeps the exact applied style and rejects a stale save while a draft is in the trash", async () => {
    const style = await saveStyle({
      ...builtInStyles[1],
      id: "style-archived",
    });
    const draft: ArticleDocument = {
      id: "archived-draft",
      name: "旧稿",
      blocks: [{ id: "body", kind: "paragraph", html: "原文" }],
      styleId: style.id,
      styleVersion: style.version,
      updatedAt: "2026-11-05T02:00:00Z",
    };
    await saveArticle(draft);
    await saveStyle({ ...style, tokens: { ...style.tokens, bodySize: 19 } });
    await deleteStyle(style.id);
    expect((await db.articles.get(draft.id))?.styleSnapshot).toEqual(style);
    expect(
      (await db.styles.get(`${style.id}:${style.version}`))?.deletedAt,
    ).toBeTruthy();
    await setArticleTrash([draft.id], true);
    expect(
      (await saveArticle({ ...draft, name: "迟到的保存" })).deletedAt,
    ).toBeTruthy();
    await setArticleTrash([draft.id], false);
    expect(await db.articles.get(draft.id)).toMatchObject({
      name: draft.name,
      styleSnapshot: style,
    });
    expect((await db.articles.get(draft.id))?.deletedAt).toBeUndefined();
  });
  it("stores article content, local overrides and exact profile versions separately", async () => {
    const style = {
      ...structuredClone(builtInStyles[0]),
      id: "style-test",
      name: "独立风格",
    };
    const first = await saveStyle(style);
    const second = await saveStyle({
      ...first,
      tokens: { ...first.tokens, accent: "#123456" },
    });
    expect(first.version).toBe(1);
    expect(second.version).toBe(2);
    const article: ArticleDocument = {
      id: "draft",
      name: "原文",
      blocks: [
        {
          id: "b",
          kind: "paragraph",
          html: "42% 原文",
          overrides: { fontSize: 21 },
        },
      ],
      styleId: first.id,
      styleVersion: 1,
      updatedAt: "2026-11-05T01:00:00Z",
    };
    await saveArticle(article);
    expect(await db.articles.get("draft")).toEqual(article);
    expect((await db.styles.get("style-test:1"))?.tokens.accent).toBe(
      first.tokens.accent,
    );
    expect(await db.assets.count()).toBe(0);
    for (let i = 1; i < 33; i++)
      await saveArticle({
        ...article,
        name: `版本${i}`,
        updatedAt: `2026-11-05T01:00:${String(i).padStart(2, "0")}Z`,
      });
    expect(await db.revisions.where("articleId").equals("draft").count()).toBe(
      30,
    );
    expect(
      (await db.revisions.where("articleId").equals("draft").first())?.document
        .blocks[0].overrides?.fontSize,
    ).toBe(21);
  });
});
