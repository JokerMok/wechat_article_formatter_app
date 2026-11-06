"use client";
/* eslint-disable @next/next/no-img-element -- Reference images are local data URLs. */

import { useState } from "react";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import type { AssetMap } from "@/lib/studio/renderer";
import {
  kindLabels,
  uid,
  type BlockKind,
  type CaptureResult,
  type StyleProfile,
  type ArticleDocument,
} from "@/lib/studio/types";
import { storeDataImage } from "@/lib/studio/storage";
import { ArticleCanvas } from "./article-canvas";
import { sampleArticle } from "./style-learning";
import { StudioDialog } from "./dialog";
import { ComponentFields } from "./component-fields";
import { ColorField, RangeField, TokenFields } from "./controls";
import { postJSON, visionImage, type VisionResult } from "./client-utils";

export type StyleAssetMode = "preview" | "source" | "edit" | "rename";

function referenceURL(input?: string) {
  try {
    const url = new URL(input ?? "");
    if (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    )
      return url.href;
  } catch {}
}

export function StyleAssetDialog({
  mode,
  profile,
  assets,
  article,
  onClose,
  onSave,
}: {
  mode: StyleAssetMode;
  profile: StyleProfile;
  assets: AssetMap;
  article?: ArticleDocument;
  onClose: () => void;
  onSave: (profile: StyleProfile) => Promise<void>;
}) {
  const previewArticle = article?.blocks.length
    ? { ...article, theme: undefined }
    : sampleArticle;
  const builtin = profile.id.startsWith("builtin-");
  const [draft, setDraft] = useState(() =>
    builtin && mode === "edit"
      ? {
          ...profile,
          id: uid("style"),
          name: `${profile.name.slice(0, 74)} · 副本`,
          source: { ...profile.source, type: "text" as const },
        }
      : profile,
  );
  const [scope, setScope] = useState<"global" | BlockKind>("global");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<StyleProfile>();
  const source = profile.source;
  const asset = assets[source.imageId ?? ""];
  const url = referenceURL(source.url);
  const task = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const reanalyze = () =>
    void task(async () => {
      if (asset?.referenceHTML || url) {
        let result: CaptureResult;
        try {
          result = await postJSON<CaptureResult>(
            "/api/ai/style-capture",
            asset?.referenceHTML
              ? {
                  html: asset.referenceHTML,
                  baseURL: url,
                  rights: source.rights,
                }
              : { url, rights: source.rights },
          );
        } catch (error) {
          if (!asset?.referenceHTML || !url) throw error;
          result = await postJSON<CaptureResult>("/api/ai/style-capture", {
            url,
            rights: source.rights,
          });
        }
        let imageId = source.imageId;
        if (result.screenshot) {
          const saved = await storeDataImage(
            result.screenshot,
            result.title,
            source.rights,
            result.referenceDocument ?? asset?.referenceHTML,
          );
          imageId = saved.id;
        }
        setAnalysis({
          ...profile,
          tokens: result.profile.tokens,
          components: result.profile.components,
          layoutRules: result.profile.layoutRules,
          details: result.profile.details,
          editorial: result.profile.editorial,
          confidence: result.profile.confidence,
          source: {
            ...source,
            imageId,
            capturedAt: result.profile.source.capturedAt,
          },
        });
      } else if (asset?.dataUrl) {
        const result = await postJSON<VisionResult>("/api/ai/style-vision", {
          image: await visionImage(asset.dataUrl),
          rights: source.rights,
          mode: "article",
        });
        setAnalysis({
          ...profile,
          tokens: result.tokens,
          components: result.components,
          confidence: {
            mode: "vision",
            uncertainKeys: result.uncertainKeys,
            notes: result.notes,
          },
        });
      } else {
        throw new Error("这套风格未保存原始参考。请重新导入参考后分析。");
      }
    });
  const title = {
    preview: profile.name,
    source: "参考来源",
    edit: "编辑风格参数",
    rename: "重命名风格",
  }[mode];
  const nameField = (
    <label className="studio-field">
      <span>风格名称</span>
      <input
        aria-label="风格名称"
        maxLength={80}
        value={draft.name}
        onChange={(event) => setDraft({ ...draft, name: event.target.value })}
      />
    </label>
  );
  return (
    <StudioDialog title={title} wide={mode !== "rename"} onClose={onClose}>
      {error && (
        <p className="studio-note" role="alert">
          {error}
        </p>
      )}
      {mode === "preview" && (
        <div className="studio-asset-preview">
          <ArticleCanvas
            article={previewArticle}
            profile={profile}
            assets={assets}
            readOnly
          />
        </div>
      )}
      {mode === "source" && (
        <div className="studio-source-detail">
          <h3>{source.title || profile.name}</h3>
          {url && (
            <a
              className="studio-text-btn"
              href={url}
              target="_blank"
              rel="noreferrer"
            >
              打开原文 <ArrowUpRight size={15} />
            </a>
          )}
          {asset?.dataUrl && (
            <a href={asset.dataUrl} download="原始参考.jpg">
              <img src={asset.dataUrl} alt="保存的原始参考" />
            </a>
          )}
          {!url && !asset && (
            <p>{builtin ? "系统内置风格" : "未保存原始参考"}</p>
          )}
          {!builtin && (url || asset) && (
            <button className="studio-btn" disabled={busy} onClick={reanalyze}>
              <RefreshCw size={15} />
              {busy ? "正在分析…" : "重新分析原始参考"}
            </button>
          )}
          {analysis && (
            <>
              <p role="status">
                已读取 {analysis.details?.measured?.length ?? 0} 类 DOM
                样式。保存为新版本。
              </p>
              <div className="studio-asset-preview">
                <ArticleCanvas
                  article={previewArticle}
                  profile={analysis}
                  assets={assets}
                  readOnly
                />
              </div>
              <button
                className="studio-btn primary"
                disabled={busy}
                onClick={() => void task(() => onSave(analysis))}
              >
                保存分析结果
              </button>
            </>
          )}
          {profile.confidence.uncertainKeys.length > 0 && (
            <details className="studio-details">
              <summary>提取范围</summary>
              <ul>
                {profile.confidence.uncertainKeys.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      {mode === "rename" && nameField}
      {mode === "edit" && (
        <div className="studio-style-edit">
          <div className="studio-asset-preview">
            <ArticleCanvas
              article={previewArticle}
              profile={draft}
              assets={assets}
              readOnly
            />
          </div>
          <div>
            {nameField}
            <label className="studio-field">
              <span>编辑范围</span>
              <select
                aria-label="编辑范围"
                value={scope}
                onChange={(event) =>
                  setScope(event.target.value as typeof scope)
                }
              >
                <option value="global">全局</option>
                {Object.entries(kindLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {scope === "global" ? (
              <>
                <TokenFields
                  tokens={draft.tokens}
                  onChange={(tokens) =>
                    setDraft({
                      ...draft,
                      tokens,
                      layoutRules:
                        tokens.padding === draft.tokens.padding
                          ? draft.layoutRules
                          : {
                              ...draft.layoutRules,
                              paddingInline: tokens.padding,
                              paddingBlock: tokens.padding,
                            },
                    })
                  }
                />
                <RangeField
                  label="文章宽度"
                  value={draft.layoutRules.articleWidth}
                  min={280}
                  max={900}
                  unit="px"
                  onChange={(articleWidth) =>
                    setDraft({
                      ...draft,
                      layoutRules: { ...draft.layoutRules, articleWidth },
                    })
                  }
                />
                <RangeField
                  label="左右留白"
                  value={
                    draft.layoutRules.paddingInline ?? draft.tokens.padding
                  }
                  min={0}
                  max={80}
                  unit="px"
                  onChange={(paddingInline) =>
                    setDraft({
                      ...draft,
                      layoutRules: { ...draft.layoutRules, paddingInline },
                    })
                  }
                />
                <RangeField
                  label="上下留白"
                  value={draft.layoutRules.paddingBlock ?? draft.tokens.padding}
                  min={0}
                  max={80}
                  unit="px"
                  onChange={(paddingBlock) =>
                    setDraft({
                      ...draft,
                      layoutRules: { ...draft.layoutRules, paddingBlock },
                    })
                  }
                />
                <ColorField
                  label="重点文字颜色"
                  value={draft.details?.emphasis?.color ?? draft.tokens.accent}
                  onChange={(color) =>
                    setDraft({
                      ...draft,
                      details: {
                        ...draft.details,
                        emphasis: { ...draft.details?.emphasis, color },
                      },
                    })
                  }
                />
              </>
            ) : (
              <ComponentFields
                value={draft.components[scope] ?? {}}
                onChange={(value) =>
                  setDraft({
                    ...draft,
                    components: { ...draft.components, [scope]: value },
                  })
                }
              />
            )}
          </div>
        </div>
      )}
      {(mode === "rename" || mode === "edit") && (
        <div className="studio-dialog-actions">
          <button
            className="studio-btn primary"
            disabled={busy || !draft.name.trim()}
            onClick={() =>
              void task(() => onSave({ ...draft, name: draft.name.trim() }))
            }
          >
            {builtin && mode === "edit"
              ? "保存为自定义风格"
              : mode === "edit"
                ? "保存新版本"
                : "保存名称"}
          </button>
        </div>
      )}
    </StudioDialog>
  );
}
