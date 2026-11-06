"use client";
/* eslint-disable @next/next/no-img-element -- Preserve local assets and reference URLs without an image proxy. */
import { useEffect, useRef, useState } from "react";
import { Download, ImagePlus, Save, Sparkles, Check } from "lucide-react";
import type {
  ArticleDocument,
  CoverDocument,
  CoverStyle,
  StyleProfile,
} from "@/lib/studio/types";
import { uid } from "@/lib/studio/types";
import { newCover, drawCover, coverBlob } from "@/lib/studio/cover";
import { storeImage, studioDB } from "@/lib/studio/storage";
import { downloadBlob, type AssetMap } from "@/lib/studio/renderer";
import { plainHTML } from "@/lib/studio/import";
import { ColorField, RangeField } from "./controls";
import {
  PanelToggle,
  WorkspacePanel,
  useCompactWorkspace,
} from "./workspace-panel";
import { postJSON, visionImage, type VisionResult } from "./client-utils";
function CoverCanvas({
  cover,
  assets,
  candidate,
}: {
  cover: CoverDocument;
  assets: AssetMap;
  candidate?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    const temp = document.createElement("canvas");
    drawCover(temp, cover, assets, candidate)
      .then(() => {
        if (!alive || !ref.current) return;
        ref.current.width = temp.width;
        ref.current.height = temp.height;
        ref.current.getContext("2d")?.drawImage(temp, 0, 0);
        setError("");
      })
      .catch((error) => {
        if (alive) setError(error.message);
      });
    return () => {
      alive = false;
    };
  }, [cover, assets, candidate]);
  return (
    <div className="studio-cover-frame">
      <canvas
        ref={ref}
        aria-label={`封面候选 ${(candidate ?? cover.candidate) + 1}`}
        style={{ aspectRatio: `${cover.width}/${cover.height}` }}
      />
      {error && (
        <p role="alert" className="studio-cover-error">
          {error}
        </p>
      )}
    </div>
  );
}
export function CoverWorkbench({
  article,
  profile,
  assets,
  onRefresh,
  onError,
  onMessage,
  onUse,
}: {
  article: ArticleDocument;
  profile: StyleProfile;
  assets: AssetMap;
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
  onMessage: (message: string) => void;
  onUse: (id: string) => void;
}) {
  const compact = useCompactWorkspace();
  const [panel, setPanel] = useState<"source" | "settings" | null>(null);
  const [cover, setCover] = useState<CoverDocument>();
  const [styles, setStyles] = useState<CoverStyle[]>([]);
  const [busy, setBusy] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [reference, setReference] = useState("");
  const initial = useRef({ article, profile });
  useEffect(() => {
    let alive = true;
    (async () => {
      const { article, profile } = initial.current;
      const db = studioDB();
      const old = article.coverId
        ? await db.covers.get(article.coverId)
        : (await db.covers.where("articleId").equals(article.id).toArray()).at(
            -1,
          );
      const savedStyles = await db.coverStyles.toArray();
      if (alive) {
        setCover(
          old ??
            newCover(
              article.id,
              plainHTML(
                article.blocks.find((b) => b.kind === "title")?.html ??
                  article.name,
              ),
              profile,
            ),
        );
        setGenerated(Boolean(old));
        setStyles(savedStyles);
      }
    })().catch(() => onError("封面草稿读取失败，请检查本地存储。"));
    return () => {
      alive = false;
    };
  }, [onError]); // The parent keys this workbench by article ID.
  if (!cover) return <p className="studio-loading">正在恢复封面…</p>;
  const change = (next: Partial<CoverDocument>) => {
    const updated = { ...cover, ...next, updatedAt: new Date().toISOString() };
    setCover(updated);
    void studioDB()
      .covers.put(updated)
      .catch(() => onError("封面自动保存失败，请及时下载。"));
  };
  const changeStyle = (next: Partial<CoverStyle>) =>
    change({ style: { ...cover.style, ...next } });
  return (
    <div className="studio-cover-workbench">
      <div className="studio-workspace-tools">
        <h2>封面工作台</h2>
        <div>
          <PanelToggle
            label="内容与参考"
            controls="cover-source"
            compact={compact}
            open={panel === "source"}
            onClick={() => setPanel("source")}
            icon={<ImagePlus size={16} />}
          />
          <PanelToggle
            label="文字与构图"
            controls="cover-settings"
            compact={compact}
            open={panel === "settings"}
            onClick={() => setPanel("settings")}
            icon={<Sparkles size={16} />}
          />
        </div>
      </div>
      <WorkspacePanel
        id="cover-source"
        title="内容与参考"
        className="studio-source-panel"
        compact={compact}
        open={!compact || panel === "source"}
        onClose={() => setPanel(null)}
      >
        {!compact && <h2>封面工作台</h2>}
        <label className="studio-field">
          <span>文章标题</span>
          <textarea
            aria-label="封面标题"
            rows={3}
            value={cover.title}
            onChange={(e) => change({ title: e.target.value })}
          />
        </label>
        <label className="studio-field">
          <span>副标题</span>
          <input
            aria-label="封面副标题"
            value={cover.subtitle}
            onChange={(e) => change({ subtitle: e.target.value })}
          />
        </label>
        <label className="studio-field">
          <span>尺寸</span>
          <select
            aria-label="封面尺寸"
            value={`${cover.width}x${cover.height}`}
            onChange={(e) => {
              const [width, height] = e.target.value.split("x").map(Number);
              change({
                width,
                height,
                fontSize: width === 900 ? 58 : 72,
                y: 24,
                x: 8,
                textWidth: 80,
              });
            }}
          >
            <option value="900x383">公众号头图 · 900 × 383</option>
            <option value="900x900">方形封面 · 900 × 900</option>
            <option value="1080x1440">竖版封面 · 1080 × 1440</option>
          </select>
        </label>
        <h3>参考封面</h3>
        <label className="studio-upload compact">
          <ImagePlus size={22} />
          <span>上传参考，学习视觉规则</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label="上传参考封面"
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const asset = await storeImage(file, "reference-only");
                setReference(asset.dataUrl);
                changeStyle({
                  sourceImageId: asset.id,
                  rights: "reference-only",
                  confidence: "manual",
                  notes: ["仅上传参考，尚未完成视觉分析。"],
                });
                await onRefresh();
              } catch (error) {
                setPanel(null);
                onError((error as Error).message);
              }
              e.target.value = "";
            }}
          />
        </label>
        {(reference || assets[cover.style.sourceImageId ?? ""]) && (
          <img
            className="studio-cover-reference"
            src={reference || assets[cover.style.sourceImageId!]?.dataUrl}
            alt="参考封面原图"
          />
        )}
        <button
          className="studio-btn"
          disabled={busy || (!reference && !cover.style.sourceImageId)}
          onClick={async () => {
            setBusy(true);
            try {
              const src =
                reference || assets[cover.style.sourceImageId!]?.dataUrl;
              if (!src) throw new Error("参考图片缺失，请重新上传。");
              const result = await postJSON<VisionResult>(
                "/api/ai/style-vision",
                { image: await visionImage(src), mode: "cover" },
              );
              changeStyle({
                name: result.name,
                background: result.tokens.background,
                foreground: result.tokens.text,
                accent: result.tokens.accent,
                fontFamily: result.tokens.fontFamily,
                composition: result.composition,
                confidence: "vision",
                notes: [...result.notes, ...result.uncertainKeys],
              });
              onMessage("已提取封面视觉规则，参考原图未用作背景。");
            } catch (error) {
              setPanel(null);
              onError((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Sparkles size={15} />
          {busy ? "识别中…" : "分析参考封面"}
        </button>
        <label className="studio-field">
          <span>封面风格</span>
          <select
            aria-label="已保存封面风格"
            value=""
            onChange={(e) => {
              const style = styles.find((s) => s.id === e.target.value);
              if (style) change({ style });
            }}
          >
            <option value="">选择已保存风格</option>
            {styles.map((s) => (
              <option value={s.id} key={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="studio-btn"
          onClick={() => {
            const template = newCover(article.id, cover.title, profile);
            change({ style: template.style });
          }}
        >
          沿用正文主题
        </button>
        <button
          className="studio-btn primary"
          disabled={!cover.title.trim()}
          onClick={() => {
            setGenerated(true);
            setPanel(null);
            change({ candidate: 0 });
          }}
        >
          生成三张候选
        </button>
      </WorkspacePanel>
      <main className="studio-cover-stage">
        <div className="studio-section-heading">
          <h3>封面预览</h3>
          <span>文字层可编辑</span>
        </div>
        <CoverCanvas cover={cover} assets={assets} />
        {generated && (
          <div className="studio-cover-candidates">
            {[0, 1, 2].map((candidate) => (
              <button
                key={candidate}
                aria-pressed={cover.candidate === candidate}
                aria-label={`选择封面候选 ${candidate + 1}`}
                onClick={() => change({ candidate })}
              >
                <CoverCanvas
                  cover={cover}
                  assets={assets}
                  candidate={candidate}
                />
                <span>
                  候选 {candidate + 1}
                  {cover.candidate === candidate && <Check size={14} />}
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="studio-cover-delivery">
          <button
            className="studio-btn"
            disabled={busy || !cover.title.trim()}
            onClick={async () => {
              try {
                downloadBlob(
                  await coverBlob(cover, assets),
                  `${cover.title.slice(0, 30) || "封面"}.png`,
                );
              } catch (error) {
                setPanel(null);
                onError((error as Error).message);
              }
            }}
          >
            <Download size={16} />
            下载 PNG
          </button>
          <button
            className="studio-btn primary"
            disabled={!cover.title.trim()}
            onClick={async () => {
              try {
                await studioDB().covers.put(cover);
                onUse(cover.id);
                onMessage("封面已保存并用于当前文章。");
              } catch {
                onError("封面保存失败，请及时下载 PNG。");
              }
            }}
          >
            <Check size={16} />
            用于当前文章
          </button>
        </div>
      </main>
      <WorkspacePanel
        id="cover-settings"
        title="文字与构图"
        className="studio-inspector"
        compact={compact}
        open={!compact || panel === "settings"}
        onClose={() => setPanel(null)}
      >
        {!compact && <h3>文字与构图</h3>}
        <label className="studio-field">
          <span>对齐</span>
          <select
            aria-label="封面文字对齐"
            value={cover.style.composition}
            onChange={(e) =>
              change({
                style: {
                  ...cover.style,
                  composition: e.target.value as CoverStyle["composition"],
                },
                y: e.target.value === "bottom" ? 58 : 24,
                x: e.target.value === "center" ? 50 : 8,
              })
            }
          >
            <option value="left">左对齐</option>
            <option value="center">居中</option>
            <option value="bottom">底部构图（可调位置）</option>
          </select>
        </label>
        <label className="studio-field">
          <span>字体</span>
          <select
            aria-label="封面字体"
            value={cover.style.fontFamily}
            onChange={(e) =>
              changeStyle({
                fontFamily: e.target.value as CoverStyle["fontFamily"],
              })
            }
          >
            <option value="sans">黑体</option>
            <option value="serif">宋体</option>
          </select>
        </label>
        <RangeField
          label="封面字号"
          value={cover.fontSize}
          min={24}
          max={160}
          unit="px"
          onChange={(v) => change({ fontSize: v })}
        />
        <RangeField
          label="水平位置"
          value={cover.x}
          min={2}
          max={90}
          unit="%"
          onChange={(v) => change({ x: v })}
        />
        <RangeField
          label="垂直位置"
          value={cover.y}
          min={4}
          max={80}
          unit="%"
          onChange={(v) => change({ y: v })}
        />
        <RangeField
          label="文字区域宽度"
          value={cover.textWidth}
          min={30}
          max={92}
          unit="%"
          onChange={(v) => change({ textWidth: v })}
        />
        <ColorField
          label="封面底色"
          value={cover.style.background}
          onChange={(v) => changeStyle({ background: v })}
        />
        <ColorField
          label="封面字色"
          value={
            cover.textColors?.[cover.candidate] ??
            cover.textColor ??
            cover.style.foreground
          }
          onChange={(v) =>
            change({
              textColor: undefined,
              textColors: { ...cover.textColors, [cover.candidate]: v },
            })
          }
        />
        <ColorField
          label="封面主色"
          value={cover.style.accent}
          onChange={(v) => changeStyle({ accent: v })}
        />
        <h3>自有背景图片</h3>
        <label className="studio-upload compact">
          <ImagePlus size={19} />
          <span>添加可使用的背景</span>
          <input
            type="file"
            aria-label="上传自有封面背景"
            accept="image/png,image/jpeg,image/webp"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const asset = await storeImage(file, "owned");
                change({ imageId: asset.id });
                await onRefresh();
              } catch (error) {
                setPanel(null);
                onError((error as Error).message);
              }
              e.target.value = "";
            }}
          />
        </label>
        {cover.imageId && (
          <>
            <RangeField
              label="背景缩放"
              value={cover.imageScale}
              min={1}
              max={3}
              step={0.05}
              onChange={(v) => change({ imageScale: v })}
            />
            <RangeField
              label="背景横向裁切"
              value={cover.imageX}
              min={0}
              max={100}
              unit="%"
              onChange={(v) => change({ imageX: v })}
            />
            <RangeField
              label="背景纵向裁切"
              value={cover.imageY}
              min={0}
              max={100}
              unit="%"
              onChange={(v) => change({ imageY: v })}
            />
            <button
              className="studio-text-btn"
              onClick={() => change({ imageId: undefined })}
            >
              移除背景图片
            </button>
          </>
        )}
        <label className="studio-field">
          <span>封面风格名称</span>
          <input
            aria-label="封面风格名称"
            value={cover.style.name}
            maxLength={80}
            onChange={(e) => changeStyle({ name: e.target.value })}
          />
        </label>
        <button
          className="studio-btn"
          onClick={async () => {
            try {
              const style = { ...cover.style, id: uid("coverstyle") };
              await studioDB().coverStyles.put(style);
              setStyles([...styles, style]);
              change({ style });
              onMessage("封面风格已独立保存。");
            } catch {
              onError("封面风格保存失败，请重试。");
            }
          }}
        >
          <Save size={15} />
          保存封面风格
        </button>
        {cover.style.notes.length > 0 && (
          <details className="studio-details">
            <summary>分析依据与估计项</summary>
            {cover.style.notes.map((note, i) => (
              <p key={i}>{note}</p>
            ))}
          </details>
        )}
      </WorkspacePanel>
    </div>
  );
}
