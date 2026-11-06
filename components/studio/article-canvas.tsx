"use client";
/* eslint-disable @next/next/no-img-element -- Preserve local assets and reference URLs without an image proxy. */
import { useLayoutEffect, useRef, type ClipboardEvent } from "react";
import {
  Plus,
  Trash2,
  ImagePlus,
  ArrowUp,
  ArrowDown,
  ClipboardPaste,
  Upload,
} from "lucide-react";
import { blockStyle, effectiveTokens } from "@/lib/studio/styles";
import {
  articleCSS,
  blockCSS,
  cssStyle,
  imageCSS,
  imageSource,
  styleInlineContent,
  type AssetMap,
} from "@/lib/studio/renderer";
import { layoutIndex, layoutStepFor } from "@/lib/studio/article-layout";
import { sanitizeHTML } from "@/lib/studio/import";
import {
  kindLabels,
  type ArticleDocument,
  type ArticleBlock,
  type StyleProfile,
  type StyleTokens,
} from "@/lib/studio/types";

function Editable({
  block,
  onChange,
  profile,
  tokens,
}: {
  block: ArticleBlock;
  onChange?: (html: string) => void;
  profile: StyleProfile;
  tokens: StyleTokens;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const html = sanitizeHTML(block.html);
    if (sanitizeHTML(element.innerHTML) !== html) element.innerHTML = html;
    styleInlineContent(element, profile, tokens);
  }, [block.html, profile, tokens]);
  return (
    <div
      ref={ref}
      role={onChange ? "textbox" : undefined}
      aria-label={onChange ? `编辑${kindLabels[block.kind]}` : undefined}
      aria-multiline={onChange ? true : undefined}
      contentEditable={onChange ? true : undefined}
      suppressContentEditableWarning
      className="studio-editable"
      onInput={
        onChange
          ? (e) => onChange(sanitizeHTML(e.currentTarget.innerHTML))
          : undefined
      }
    />
  );
}
export function ArticleCanvas({
  article,
  profile,
  assets,
  selected,
  onSelect,
  onEdit,
  onAdd,
  onDelete,
  onMove,
  onImage,
  onPaste,
  onDropImages,
  onImportFile,
  onWrite,
  importing,
  readOnly = false,
}: {
  article: ArticleDocument;
  profile: StyleProfile;
  assets: AssetMap;
  selected?: string;
  onSelect?: (id: string) => void;
  onEdit?: (id: string, html: string) => void;
  onAdd?: () => void;
  onDelete?: (id: string) => void;
  onMove?: (id: string, direction: number) => void;
  onImage?: () => void;
  onPaste?: (event: ClipboardEvent<HTMLElement>) => void;
  onDropImages?: (files: File[], after?: string) => void;
  onImportFile?: () => void;
  onWrite?: (text: string) => void;
  importing?: boolean;
  readOnly?: boolean;
}) {
  const t = effectiveTokens(article, profile);
  const editorial = layoutIndex(article.layout);
  return (
    <article
      data-studio-editor
      tabIndex={readOnly ? undefined : -1}
      className={`studio-article ${readOnly ? "is-readonly" : ""}`}
      onPasteCapture={onPaste}
      onDragOver={
        onDropImages
          ? (e) => {
              if (
                Array.from(e.dataTransfer.items).some(
                  (item) =>
                    item.kind === "file" && item.type.startsWith("image/"),
                )
              ) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
              }
            }
          : undefined
      }
      onDrop={
        onDropImages
          ? (e) => {
              const files = Array.from(e.dataTransfer.files).filter((file) =>
                file.type.startsWith("image/"),
              );
              if (!files.length) return;
              e.preventDefault();
              const after = (e.target as HTMLElement).closest<HTMLElement>(
                "[data-block-id]",
              )?.dataset.blockId;
              onDropImages(files, after);
            }
          : undefined
      }
      style={articleCSS(article, profile)}
      aria-label={readOnly ? `${profile.name}预览` : "文章编辑画布"}
    >
      {!article.blocks.length && (
        <div className="studio-empty-canvas">
          {readOnly ? (
            <p>暂无正文</p>
          ) : (
            <>
              <div className="studio-empty-paste">
                <label htmlFor="studio-whole-article">
                  <ClipboardPaste size={21} aria-hidden="true" />
                  粘贴整篇文章
                </label>
                <textarea
                  id="studio-whole-article"
                  rows={3}
                  autoFocus
                  readOnly={importing}
                  aria-busy={importing}
                  placeholder={
                    importing ? "正在导入…" : "按 ⌘V / Ctrl+V，或直接写作"
                  }
                  onInput={(e) => {
                    if (
                      !(e.nativeEvent as InputEvent).isComposing &&
                      e.currentTarget.value
                    )
                      onWrite?.(e.currentTarget.value);
                  }}
                  onCompositionEnd={(e) => {
                    const field = e.currentTarget;
                    requestAnimationFrame(() => {
                      if (field.isConnected && field.value)
                        onWrite?.(field.value);
                    });
                  }}
                />
              </div>
              <button
                className="studio-btn"
                onClick={onImportFile}
                disabled={importing}
              >
                <Upload size={15} />
                导入文件
              </button>
              <small>Word (.docx) · Markdown · HTML · TXT</small>
            </>
          )}
        </div>
      )}
      {article.blocks.map((block, index) => {
        const step = layoutStepFor(block, article.layout, editorial);
        const visual = blockCSS(block, profile, t, step);
        return (
          <section
            key={block.id}
            data-block-id={block.id}
            data-layout-component={step?.component}
            data-selected={!readOnly && selected === block.id}
            className={`studio-block studio-block-${block.kind}`}
            onClick={() => onSelect?.(block.id)}
            style={visual}
          >
            {block.kind === "image" ? (
              <figure style={{ margin: 0 }}>
                <img
                  src={imageSource(block.src, assets)}
                  alt={block.alt ?? ""}
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.dataset.failed = "true";
                  }}
                  style={imageCSS(visual.borderRadius)}
                />
                {block.caption && (
                  <figcaption
                    style={cssStyle(
                      blockStyle(
                        {
                          id: block.id,
                          kind: "caption",
                          html: "",
                          overrides: block.captionStyle,
                        },
                        profile,
                        t,
                      ),
                    )}
                  >
                    {block.caption}
                  </figcaption>
                )}
              </figure>
            ) : block.kind === "divider" ? null : (
              <Editable
                block={block}
                profile={profile}
                tokens={t}
                onChange={
                  readOnly ? undefined : (html) => onEdit?.(block.id, html)
                }
              />
            )}
            {!readOnly && selected === block.id && (
              <div className="studio-block-actions" contentEditable={false}>
                <span>{kindLabels[block.kind]}</span>
                <button
                  aria-label="上移当前块"
                  disabled={index === 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMove?.(block.id, -1);
                  }}
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  aria-label="下移当前块"
                  disabled={index === article.blocks.length - 1}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMove?.(block.id, 1);
                  }}
                >
                  <ArrowDown size={13} />
                </button>
                <button
                  aria-label="删除当前块"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete?.(block.id);
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )}
          </section>
        );
      })}
      {!readOnly && article.blocks.length > 0 && (
        <div className="studio-canvas-add">
          <button onClick={onAdd}>
            <Plus size={15} />
            段落
          </button>
          <button onClick={onImage}>
            <ImagePlus size={15} />
            图片
          </button>
        </div>
      )}
    </article>
  );
}
