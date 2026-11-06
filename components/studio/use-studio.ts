"use client";
import { scopedStorageName } from "@/lib/accounts/browser";
import { useCallback, useEffect, useRef, useState } from "react";
import { allBuiltInStyles, builtInStyles } from "@/lib/studio/styles";
import {
  studioDB,
  saveArticle,
  saveStyle,
  setArticleTrash,
  renameArticle,
  copyArticle,
  deleteStyle,
  type StoredStyle,
} from "@/lib/studio/storage";
import type {
  ArticleDocument,
  ArticleRevision,
  StudioAsset,
  StyleProfile,
} from "@/lib/studio/types";
import { repairLegacyArticle } from "@/lib/studio/import";
import { uid, styleProfileSchema } from "@/lib/studio/types";

export function emptyArticle(): ArticleDocument {
  return {
    id: uid("article"),
    name: "未命名文章",
    blocks: [],
    styleId: builtInStyles[0].id,
    styleVersion: builtInStyles[0].version,
    updatedAt: new Date().toISOString(),
  };
}
export function useStudio() {
  const [article, setArticle] = useState<ArticleDocument>();
  const [articles, setArticles] = useState<ArticleDocument[]>([]);
  const [profiles, setProfiles] =
    useState<Array<StyleProfile | StoredStyle>>(allBuiltInStyles);
  const [assets, setAssets] = useState<Record<string, StudioAsset>>({});
  const [saveState, setSaveState] = useState("正在恢复…");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [revisions, setRevisions] = useState<ArticleRevision[]>([]);
  const [historyCount, setHistoryCount] = useState({ undo: 0, redo: 0 });
  const current = useRef(article);
  const past = useRef<ArticleDocument[]>([]),
    future = useRef<ArticleDocument[]>([]),
    lastChange = useRef(0);
  const saveQueue = useRef(Promise.resolve());
  const lastGroup = useRef<string | boolean>(false);
  const refresh = useCallback(async () => {
    const db = studioDB();
    const [docs, styles, files] = await Promise.all([
      db.articles.orderBy("updatedAt").reverse().toArray(),
      db.styles.toArray(),
      db.assets.toArray(),
    ]);
    setArticles(docs);
    setProfiles([
      ...new Map(
        [...allBuiltInStyles, ...styles].map((p) => [
          `${p.id}:${p.version}`,
          p,
        ]),
      ).values(),
    ]);
    setAssets(Object.fromEntries(files.map((a) => [a.id, a])));
  }, []);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await refresh();
        const docs = await studioDB()
          .articles.orderBy("updatedAt")
          .reverse()
          .toArray();
        let selected: string | null = null;
        try {
          selected = localStorage.getItem(scopedStorageName("style-studio-active"));
        } catch {}
        const active = docs.filter((row) => !row.deletedAt);
        const saved =
          active.find((d) => d.id === selected) ?? active[0] ?? emptyArticle();
        if (alive) {
          const restored = repairLegacyArticle(saved);
          current.current = restored;
          setArticle(restored);
          setSaveState("已恢复");
        }
      } catch {
        if (alive) {
          const fallback = emptyArticle();
          current.current = fallback;
          setArticle(fallback);
          setError(
            "本地数据库无法打开，当前编辑不能自动保存。请检查浏览器存储设置并及时导出。",
          );
          setSaveState("保存不可用");
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [refresh]);
  const persisted = useRef<Record<string, string>>({});
  const persist = useCallback((document: ArticleDocument) => {
    saveQueue.current = saveQueue.current
      .catch(() => undefined)
      .then(async () => {
        try {
          const saved = await saveArticle(document);
          if (saved.deletedAt) return;
          persisted.current[document.id] = document.updatedAt;
          try {
            localStorage.setItem(scopedStorageName("style-studio-active"), document.id);
          } catch {}
          if (
            current.current?.id === document.id &&
            current.current.updatedAt === document.updatedAt
          )
            setSaveState("已自动保存");
          setArticles((prev) =>
            [saved, ...prev.filter((a) => a.id !== document.id)].sort((a, b) =>
              b.updatedAt.localeCompare(a.updatedAt),
            ),
          );
        } catch {
          setSaveState("保存失败");
          setError(
            "本地保存失败，可能是空间不足。请下载交付包保留当前稿件，再检查浏览器存储。",
          );
          throw new Error("文章未能保存，请先下载交付包。");
        }
      });
    return saveQueue.current;
  }, []);
  useEffect(() => {
    if (!article) return;
    const timer = setTimeout(() => {
      void persist(article).catch(() => undefined);
    }, 400);
    return () => clearTimeout(timer);
  }, [article, persist]);
  useEffect(() => {
    const flush = () => {
      const latest = current.current;
      if (latest && persisted.current[latest.id] !== latest.updatedAt)
        void persist(latest).catch(() => undefined);
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      const latest = current.current;
      if (latest && persisted.current[latest.id] !== latest.updatedAt) {
        flush();
        event.preventDefault();
        event.returnValue = "";
      }
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      flush();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [persist]);
  const update = useCallback(
    (
      change: (a: ArticleDocument) => ArticleDocument,
      group: string | boolean = false,
      recordHistory = true,
    ) => {
      const a = current.current;
      if (!a) return false;
      const changed = change(a);
      if (changed === a) return false;
      if (recordHistory) {
        if (
          !group ||
          lastGroup.current !== group ||
          Date.now() - lastChange.current > 700
        ) {
          past.current = [...past.current.slice(-59), structuredClone(a)];
        }
        lastChange.current = Date.now();
        lastGroup.current = group;
        future.current = [];
        setHistoryCount({ undo: past.current.length, redo: 0 });
      }
      const next = { ...changed, updatedAt: new Date().toISOString() };
      current.current = next;
      setSaveState("保存中…");
      setArticle(next);
      return true;
    },
    [],
  );
  const undo = useCallback(() => {
    lastGroup.current = false;
    const previous = past.current.pop();
    if (!previous || !current.current) return;
    future.current.push(current.current);
    const next = { ...previous, updatedAt: new Date().toISOString() };
    current.current = next;
    setSaveState("保存中…");
    setArticle(next);
    setHistoryCount({ undo: past.current.length, redo: future.current.length });
  }, []);
  const redo = useCallback(() => {
    lastGroup.current = false;
    const next = future.current.pop();
    if (!next || !current.current) return;
    past.current.push(current.current);
    const updated = { ...next, updatedAt: new Date().toISOString() };
    current.current = updated;
    setSaveState("保存中…");
    setArticle(updated);
    setHistoryCount({ undo: past.current.length, redo: future.current.length });
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== "z" ||
        !(event.target as HTMLElement).closest("[data-studio-editor]")
      )
        return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [undo, redo]);
  const adopt = (next: ArticleDocument) => {
    past.current = [];
    future.current = [];
    lastGroup.current = false;
    setHistoryCount({ undo: 0, redo: 0 });
    setSaveState("保存中…");
    setArticle(next);
    current.current = next;
  };
  const flushCurrent = async () => {
    if (current.current) await persist(current.current);
    await saveQueue.current;
  };
  const openArticle = async (id?: string) => {
    await flushCurrent();
    const next = id ? await studioDB().articles.get(id) : emptyArticle();
    if (!next || next.deletedAt) throw new Error("稿件已移至回收站。");
    adopt(repairLegacyArticle(next));
  };
  const trashArticles = async (ids: string[]) => {
    await flushCurrent();
    await setArticleTrash(ids, true);
    if (current.current && ids.includes(current.current.id)) {
      const next = await studioDB()
        .articles.orderBy("updatedAt")
        .reverse()
        .filter((row) => !row.deletedAt)
        .first();
      adopt(next ?? emptyArticle());
    }
    await refresh();
  };
  const restoreArticles = async (ids: string[]) => {
    await setArticleTrash(ids, false);
    await refresh();
  };
  const renameDraft = async (id: string, name: string) => {
    if (current.current?.id === id) {
      update((row) => ({ ...row, name }));
      await flushCurrent();
    } else {
      await renameArticle(id, name);
    }
    await refresh();
  };
  const duplicateDraft = async (id: string, open: boolean) => {
    await flushCurrent();
    const duplicate = await copyArticle(id);
    if (open) adopt(duplicate);
    await refresh();
  };
  const removeProfile = async (id: string) => {
    await flushCurrent();
    await deleteStyle(id);
    await refresh();
  };
  const addProfile = async (profile: StyleProfile) => {
    const saved = await saveStyle(profile);
    await refresh();
    return saved;
  };
  const applyProfile = (profile: StyleProfile, clearLocal = false) => {
    update((a) => ({
      ...a,
      styleId: profile.id,
      styleVersion: profile.version,
      styleSnapshot: styleProfileSchema.parse(profile),
      theme: undefined,
      blocks: clearLocal
        ? a.blocks.map((block) => ({
            ...block,
            overrides: undefined,
            captionStyle: undefined,
          }))
        : a.blocks,
    }));
    setError("");
    setMessage("");
  };
  const loadRevisions = async () => {
    if (!current.current) return;
    await saveArticle(current.current);
    setRevisions(
      (
        await studioDB()
          .revisions.where("articleId")
          .equals(current.current.id)
          .sortBy("savedAt")
      ).reverse(),
    );
  };
  const profile =
    article?.styleSnapshot ??
    profiles.find(
      (p) => p.id === article?.styleId && p.version === article?.styleVersion,
    ) ??
    builtInStyles[0];
  const latest = [
    ...new Map(
      [...profiles]
        .filter((p) => !("deletedAt" in p && p.deletedAt))
        .sort((a, b) => a.version - b.version)
        .map((p) => [p.id, p]),
    ).values(),
  ];
  return {
    article,
    articles,
    profiles,
    latest,
    profile,
    assets,
    saveState,
    error,
    message,
    setError,
    setMessage,
    update,
    undo,
    redo,
    historyCount,
    openArticle,
    renameDraft,
    duplicateDraft,
    trashArticles,
    restoreArticles,
    removeProfile,
    addProfile,
    applyProfile,
    refresh,
    revisions,
    loadRevisions,
  };
}
