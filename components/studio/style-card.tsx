import { Check, Star } from "lucide-react";
import type { ArticleDocument, StyleProfile } from "@/lib/studio/types";
import type { AssetMap } from "@/lib/studio/renderer";
import { ArticleCanvas } from "./article-canvas";
import { sampleArticle } from "./style-learning";

export function StyleSwatch({
  profile,
  article,
  assets = {},
  selected,
  label = profile.name,
  onClick,
  library = false,
  quick = false,
}: {
  profile: StyleProfile;
  article?: ArticleDocument;
  assets?: AssetMap;
  selected?: boolean;
  label?: string;
  onClick?: () => void;
  library?: boolean;
  quick?: boolean;
}) {
  const draft = article?.blocks.length ? article : sampleArticle;
  const highlights = quick
    ? new Set([
        draft.blocks.find((block) => block.kind === "title"),
        draft.blocks.find((block) => block.kind === "paragraph"),
        draft.blocks.find((block) => block.kind === "heading") ??
          draft.blocks.find((block) => block.kind === "subheading"),
        draft.blocks.find((block) =>
          ["quote", "callout", "divider"].includes(block.kind),
        ),
        draft.blocks.find((block) => /<(?:strong|b)\b/i.test(block.html)),
        draft.blocks.find((block) => block.kind === "image"),
      ])
    : undefined;
  const excerpt = highlights
    ? draft.blocks.filter((block) => highlights.has(block))
    : [];
  const blocks = excerpt.length
    ? excerpt
    : draft.blocks.slice(0, library ? 10 : 6);
  const miniature = {
    ...draft,
    theme:
      draft.styleId === profile.id && draft.styleVersion === profile.version
        ? draft.theme
        : undefined,
    blocks,
  };
  return (
    <button
      className="studio-style-swatch"
      aria-label={`预览风格 ${label}`}
      title={label}
      aria-pressed={!!selected}
      onClick={onClick}
    >
      <div
        className={`studio-style-miniature studio-rendered-miniature ${library ? "library" : ""}`}
        inert
        aria-hidden="true"
        style={{ backgroundColor: profile.tokens.background }}
      >
        <div className="studio-miniature-paper">
          <ArticleCanvas
            article={miniature}
            profile={profile}
            assets={assets}
            readOnly
          />
        </div>
      </div>
      <span className="studio-swatch-name">
        <span>{label}</span>
        {selected && <Check size={14} />}
      </span>
    </button>
  );
}
export function StyleLibraryCard({
  profile,
  versions,
  onPreview,
  onEdit,
  onRename,
  onCopy,
  onDelete,
  onSource,
  onFavorite,
  onExport,
  onVersion,
}: {
  profile: StyleProfile;
  versions: StyleProfile[];
  onPreview: () => void;
  onEdit: () => void;
  onRename: () => void;
  onCopy: () => void;
  onDelete?: () => void;
  onSource: () => void;
  onFavorite: () => void;
  onExport: () => void;
  onVersion: (version: number) => void;
}) {
  const builtin = profile.id.startsWith("builtin-");
  return (
    <article className="studio-library-card" aria-label={profile.name}>
      <StyleSwatch profile={profile} library onClick={onPreview} />
      <div className="studio-library-meta">
        <span>{builtin ? "内置风格" : profile.tags.join(" · ")}</span>
        <button
          aria-label={`${profile.favorite ? "取消收藏" : "收藏"}${profile.name}`}
          aria-pressed={profile.favorite}
          onClick={onFavorite}
        >
          <Star size={16} fill={profile.favorite ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="studio-style-card-actions">
        <button className="studio-btn" onClick={onEdit}>
          编辑参数
        </button>
        <button className="studio-text-btn" onClick={onSource}>
          参考来源
        </button>
        <details className="studio-action-menu">
          <summary
            className="studio-btn"
            aria-label={`管理风格 ${profile.name}`}
          >
            更多
          </summary>
          <div>
            {!builtin && <button onClick={onRename}>重命名</button>}
            <button onClick={onCopy}>复制风格</button>
            {onDelete && <button onClick={onDelete}>删除风格</button>}
            <button onClick={onExport}>导出风格</button>
          </div>
        </details>
        <select
          aria-label={`${profile.name}版本`}
          value={profile.version}
          onChange={(e) => onVersion(Number(e.target.value))}
        >
          {versions.map((p) => (
            <option key={p.version} value={p.version}>
              v{p.version}
            </option>
          ))}
        </select>
      </div>
    </article>
  );
}
