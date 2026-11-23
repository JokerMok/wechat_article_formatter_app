"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Sparkles } from "lucide-react";
import { accountFetch } from "@/lib/accounts/browser";
import { plainHTML } from "@/lib/studio/import";
import type { ArticleBlock, ArticleDocument } from "@/lib/studio/types";
import { StudioDialog } from "./dialog";

function blockText(block?: ArticleBlock) {
  if (!block) return "";
  return (block.kind === "image" ? block.caption || block.alt || "" : plainHTML(block.html)).trim();
}

function illustrationContext(article: ArticleDocument, after?: string) {
  const { blocks } = article;
  const index = blocks.findIndex((block) => block.id === after);
  const titleBlock = blocks.find((block) => block.kind === "title");
  const title = (titleBlock ? blockText(titleBlock) : article.name === "未命名文章" ? "" : article.name).slice(0, 200);
  const heading = index < 0 ? undefined : blocks.slice(0, index).findLast(
    (block) => block.kind === "heading" || block.kind === "subheading",
  );
  const nearby = index < 0 ? [...blocks.slice(0, 4), ...blocks.slice(-2)] : blocks.slice(Math.max(0, index - 1), index + 3);
  const context = [...new Set(heading ? [heading, ...nearby] : nearby)]
    .filter((block) => block.id !== after && block.kind !== "title")
    .map((block) => blockText(block).slice(0, 520))
    .filter(Boolean)
    .join("\n")
    .slice(0, 2200);
  return { title, focus: blockText(blocks[index]).slice(0, 900), context };
}

export function ArticleImageDialog({
  article,
  after,
  onInsert,
  onClose,
}: {
  article: ArticleDocument;
  after?: string;
  onInsert: (file: File, alt: string, signal: AbortSignal) => Promise<void>;
  onClose: () => void;
}) {
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const { title, focus, context } = illustrationContext(article, after);
  const canGenerate = Boolean(title || focus || context || brief.trim());
  const close = () => {
    pending.current?.abort();
    onClose();
  };
  const generate = async (event: FormEvent) => {
    event.preventDefault();
    if (pending.current || !canGenerate) return;
    const controller = new AbortController();
    const deadline = AbortSignal.timeout(118_000);
    pending.current = controller;
    setError("");
    setBusy(true);
    try {
      const response = await accountFetch("/api/ai/article-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, focus, context, brief: brief.trim() }),
        signal: AbortSignal.any([controller.signal, deadline]),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          (typeof payload?.error === "string" ? payload.error : payload?.error?.message) ||
          "AI 配图未能生成，请重试。",
        );
      }
      const image = await response.blob();
      if (controller.signal.aborted) return;
      const subject = (brief.trim() || focus || title || context).replace(/\s+/g, " ").slice(0, 80);
      await onInsert(
        new File([image], "AI 配图.png", { type: image.type }),
        subject ? `配图 · ${subject}` : "AI 配图",
        controller.signal,
      );
      if (!controller.signal.aborted) onClose();
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(deadline.aborted ? "配图请求超时，请重试。" :
          cause instanceof TypeError ? "网络连接中断，请重试。" :
          cause instanceof Error ? cause.message : "AI 配图未能生成，请重试。");
      }
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  return (
    <StudioDialog title="AI 配图" onClose={close}>
      <form onSubmit={generate}>
        <p className="studio-note">{after ? "插入到选中内容下方" : "插入到文章末尾"}</p>
        <label className="studio-field">
          <span>配图要求（可选）</span>
          <textarea
            rows={3}
            maxLength={500}
            value={brief}
            disabled={busy}
            placeholder="留空时根据正文构思"
            onChange={(event) => setBrief(event.currentTarget.value)}
          />
        </label>
        {error && <p className="studio-dialog-error" role="alert">{error}</p>}
        {busy && <p className="studio-note" role="status">正在生成配图…</p>}
        <div className="studio-dialog-actions">
          <button type="button" className="studio-btn" onClick={close}>取消</button>
          <button type="submit" className="studio-btn primary" disabled={busy || !canGenerate}>
            <Sparkles size={16} aria-hidden="true" />
            生成并插入
          </button>
        </div>
      </form>
    </StudioDialog>
  );
}
