"use client";
import { accountFetch, isAccountWorkspace, scopedStorageName } from "@/lib/accounts/browser";
import { useEffect, useRef, useState } from "react";
import {
  layoutRequest,
  replan,
  type createArticleLayout,
} from "@/lib/studio/article-layout";
import {
  defaultLayoutSettings,
  layoutRequestSchema,
  type ArticleLayout,
  type LayoutSettings,
} from "@/lib/studio/layout-contract";
import {
  uid,
  type ArticleDocument,
  type StyleProfile,
} from "@/lib/studio/types";

type UpdateArticle = (
  change: (article: ArticleDocument) => ArticleDocument,
  group?: string | boolean,
  recordHistory?: boolean,
) => boolean;

export function seedLayout(
  article: ArticleDocument,
  profile: StyleProfile,
  settings = defaultLayoutSettings,
  automatic = true,
): ArticleLayout {
  return {
    ...replan(layoutRequest(article, settings, profile)),
    settings,
    automatic,
    enabled: true,
  };
}

export function useArticleLayout(update: UpdateArticle) {
  const request = useRef<
    { id: string; controller: AbortController } | undefined
  >(undefined);
  const [active, setActive] = useState<string>();
  useEffect(() => () => request.current?.controller.abort(), []);
  const analyze = (
    article: ArticleDocument,
    profile: StyleProfile,
    seed: ArticleLayout,
    recordHistory = true,
  ) => {
    const input = layoutRequest(article, seed.settings, profile);
    if (
      !input.nodes.some(
        (node) => node.kind === "paragraph" && node.text.trim().length >= 16,
      )
    )
      return;
    const id = uid("layout");
    request.current?.controller.abort();
    const controller = new AbortController();
    request.current = { id, controller };
    const staged = update(
      (current) =>
        current.id === article.id
          ? { ...current, layout: { ...seed, requestId: id } }
          : current,
      false,
      recordHistory,
    );
    if (!staged) {
      controller.abort();
      return;
    }
    setActive(article.id);
    void (async () => {
      let result: ReturnType<typeof createArticleLayout> | undefined;
      let fallbackReason: string | undefined;
      try {
        if (!layoutRequestSchema.safeParse(input).success)
          throw new Error("文章超出 AI 分析上限，已保留规则排版。");
        const payload = JSON.stringify(input);
        let retryStorage: string | undefined;
        let key: string | undefined;
        if (isAccountWorkspace()) {
          const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload)));
          const fingerprint = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
          retryStorage = scopedStorageName(`layout-retry:${article.id}:${fingerprint}`);
          try { key = localStorage.getItem(retryStorage) || undefined; } catch {}
          key ??= crypto.randomUUID();
          try { localStorage.setItem(retryStorage, key); } catch {}
        }
        const deadline = Date.now() + 168_000;
        for (;;) {
          const response = await accountFetch("/api/ai/article-layout", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) },
            body: payload,
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(115_000)]),
          });
          const body = await response.json();
          if (response.status === 202 && key) {
            if (Date.now() + 2500 >= deadline)
              throw new Error("本次排版结果仍在确认。再次点击智能排版会继续核对同一任务。");
            await new Promise((resolve) => setTimeout(resolve, 2500));
            continue;
          }
          if (retryStorage && (response.ok || (response.status < 500 && response.status !== 429))) {
            try { if (localStorage.getItem(retryStorage) === key) localStorage.removeItem(retryStorage); } catch {}
          }
          if (!response.ok || !body.data)
            throw new Error(
              typeof body.error === "string" ? body.error : body.error?.message || "AI 暂不可用。",
            );
          result = body.data;
          if (key) window.dispatchEvent(new Event("formatter-entitlements-changed"));
          break;
        }
      } catch (error) {
        if (!controller.signal.aborted)
          fallbackReason =
            error instanceof Error && error.name === "TimeoutError"
              ? "AI 分析超时。"
              : error instanceof TypeError
                ? "无法连接排版服务。"
                : error instanceof Error
                  ? error.message
                  : "AI 暂不可用。";
      }
      if (!controller.signal.aborted)
        update(
          (current) => {
            if (current.id !== article.id || current.layout?.requestId !== id)
              return current;
            const latest = layoutRequest(
              current,
              current.layout.settings,
              profile,
            );
            return {
              ...current,
              layout: {
                ...current.layout,
                ...replan(
                  latest,
                  result?.analysis,
                  fallbackReason ?? result?.plan.fallbackReason,
                ),
                requestId: undefined,
              },
            };
          },
          false,
          false,
        );
      if (request.current?.id === id) {
        request.current = undefined;
        setActive(undefined);
      }
    })();
  };
  const configure = (
    article: ArticleDocument,
    profile: StyleProfile,
    settings: LayoutSettings,
    automatic: boolean,
  ) => {
    update((current) => {
      if (current.id !== article.id) return current;
      const previous = current.layout;
      return {
        ...current,
        layout: {
          ...previous,
          ...replan(
            layoutRequest(current, settings, profile),
            previous?.analysis,
            previous?.plan.fallbackReason,
          ),
          settings,
          automatic,
          enabled: previous?.enabled ?? false,
        },
      };
    });
  };
  return { active, analyze, configure };
}
