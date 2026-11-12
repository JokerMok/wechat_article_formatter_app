"use client";

import {
  ArrowRight,
  BookOpen,
  Copy,
  FileText,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import type { ArticleDocument } from "@/lib/studio/types";

export function DraftMenu({
  article,
  onRename,
  onCopy,
  onDelete,
}: {
  article: ArticleDocument;
  onRename: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  return (
    <details className="studio-action-menu">
      <summary
        className="studio-icon-btn"
        aria-label={`管理稿件 ${article.name}`}
      >
        <MoreHorizontal size={19} />
      </summary>
      <div>
        {(
          [
            [Pencil, "重命名", onRename],
            [Copy, "复制文章", onCopy],
            [Trash2, "删除文章", onDelete],
          ] as const
        ).map(([Icon, name, action]) => (
          <button
            key={name}
            type="button"
            onClick={(event) => {
              event.currentTarget.closest("details")?.removeAttribute("open");
              action();
            }}
          >
            <Icon size={15} />
            {name}
          </button>
        ))}
      </div>
    </details>
  );
}

export function DraftList({
  articles,
  selected,
  setSelected,
  trash,
  setTrash,
  onOpen,
  onRename,
  onCopy,
  onDelete,
  onRestore,
}: {
  articles: ArticleDocument[];
  selected: string[];
  setSelected: (ids: string[]) => void;
  trash: boolean;
  setTrash: (trash: boolean) => void;
  onOpen: (id: string) => void;
  onRename: (article: ArticleDocument) => void;
  onCopy: (id: string) => void;
  onDelete: (ids: string[]) => void;
  onRestore: (ids: string[]) => void;
}) {
  const deleted = articles.filter((article) => article.deletedAt);
  const rows = trash
    ? deleted
    : articles.filter(
        (article) =>
          !article.deletedAt &&
          (article.blocks.length || article.name !== "未命名文章"),
      );
  const ids = selected.filter((id) => rows.some((row) => row.id === id));
  return (
    <section className="studio-home-recent">
      <div className="studio-section-heading">
        <h2>{trash ? "回收站" : "最近稿件"}</h2>
        <button
          className="studio-btn"
          onClick={() => {
            setSelected([]);
            setTrash(!trash);
          }}
        >
          {trash
            ? "返回最近稿件"
            : `回收站${deleted.length ? `（${deleted.length}）` : ""}`}
        </button>
      </div>
      {rows.length > 0 ? (
        <>
          <div className="studio-draft-batch">
            <label>
              <input
                type="checkbox"
                checked={ids.length === rows.length}
                onChange={(event) =>
                  setSelected(
                    event.target.checked ? rows.map((row) => row.id) : [],
                  )
                }
              />
              全选
            </label>
            <button
              className="studio-btn"
              disabled={!ids.length}
              onClick={() => (trash ? onRestore(ids) : onDelete(ids))}
            >
              {trash ? "恢复所选" : "删除所选"}
              {ids.length ? `（${ids.length}）` : ""}
            </button>
          </div>
          <ul className="studio-draft-list">
            {rows.map((article) => (
              <li
                key={article.id}
                className="studio-draft-row"
                data-article-id={article.id}
              >
                <input
                  type="checkbox"
                  aria-label={`选择稿件 ${article.name}`}
                  checked={ids.includes(article.id)}
                  onChange={(event) =>
                    setSelected(
                      event.target.checked
                        ? [...ids, article.id]
                        : ids.filter((id) => id !== article.id),
                    )
                  }
                />
                {trash ? (
                  <strong>{article.name}</strong>
                ) : (
                  <button
                    className="studio-draft-open"
                    onClick={() => onOpen(article.id)}
                  >
                    <FileText size={20} />
                    <span>
                      <strong>{article.name}</strong>
                    </span>
                    <time>
                      {new Date(article.updatedAt).toLocaleDateString("zh-CN")}
                    </time>
                    <ArrowRight size={15} />
                  </button>
                )}
                {trash ? (
                  <button
                    className="studio-btn"
                    aria-label={`恢复稿件 ${article.name}`}
                    onClick={() => onRestore([article.id])}
                  >
                    恢复
                  </button>
                ) : (
                  <DraftMenu
                    article={article}
                    onRename={() => onRename(article)}
                    onCopy={() => onCopy(article.id)}
                    onDelete={() => onDelete([article.id])}
                  />
                )}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="studio-home-empty">
          <BookOpen size={30} aria-hidden="true" />
          <h3>{trash ? "回收站为空" : "还没有稿件"}</h3>
        </div>
      )}
    </section>
  );
}
