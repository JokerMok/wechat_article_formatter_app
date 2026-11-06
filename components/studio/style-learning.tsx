"use client";
/* eslint-disable @next/next/no-img-element -- Preserve local assets and reference URLs without an image proxy. */
import { useState } from "react";
import {
  ArrowRight,
  ImagePlus,
  Link2,
  Code2,
  Type,
  ScanLine,
  Save,
  Sparkles,
} from "lucide-react";
import { builtInStyles } from "@/lib/studio/styles";
import { storeImage, storeDataImage } from "@/lib/studio/storage";
import {
  uid,
  kindLabels,
  type ArticleDocument,
  type BlockKind,
  type CaptureResult,
  type Rights,
  type StyleProfile,
} from "@/lib/studio/types";
import type { AssetMap } from "@/lib/studio/renderer";
import { ArticleCanvas } from "./article-canvas";
import {
  PanelToggle,
  WorkspacePanel,
  useCompactWorkspace,
} from "./workspace-panel";
import { TokenFields } from "./controls";
import { ComponentFields } from "./component-fields";
import { postJSON, visionImage, type VisionResult } from "./client-utils";

export const sampleArticle: ArticleDocument = {
  id: "style-sample",
  name: "风格示例",
  styleId: "builtin-forest",
  styleVersion: 1,
  updatedAt: "",
  blocks: [
    { id: "s1", kind: "title", html: "把日常，写成值得阅读的故事" },
    {
      id: "s2",
      kind: "paragraph",
      html: "这是一段用于查看排版的示例文字。好的设计，让内容被看见，也给阅读留一点呼吸的空间。",
    },
    { id: "s3", kind: "heading", html: "从一个细节开始" },
    {
      id: "s4",
      kind: "paragraph",
      html: "标题、正文和留白，共同构成文章的节奏。<strong>有分寸的强调</strong>，让重要的观点更清晰。",
    },
    { id: "s5", kind: "quote", html: "让风格服务内容，让表达保持自己的声音。" },
    {
      id: "s6",
      kind: "list",
      html: "<ul><li>保留文字与事实</li><li>让结构更清晰</li><li>给图片恰当的位置</li></ul>",
    },
  ],
};
export function StyleLearning({
  assets,
  onSaved,
  onError,
  onRefresh,
  initialProfile,
}: {
  initialProfile?: StyleProfile;
  assets: AssetMap;
  onSaved: (profile: StyleProfile) => Promise<void>;
  onError: (message: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const compact = useCompactWorkspace();
  const [compareView, setCompareView] = useState<"reference" | "sample">(
    "sample",
  );
  const [panel, setPanel] = useState<"source" | "settings" | null>(null);
  const [mode, setMode] = useState<"url" | "html" | "screenshot" | "text">(
    initialProfile?.source.type === "screenshot"
      ? "screenshot"
      : initialProfile?.source.type === "html"
        ? "html"
        : "url",
  );
  const [input, setInput] = useState(initialProfile?.source.url ?? "");
  const [rights, setRights] = useState<Rights>(
    initialProfile?.source.rights ?? "reference-only",
  );
  const [profile, setProfile] = useState<StyleProfile | undefined>(
    initialProfile,
  );
  const [image, setImage] = useState(
    assets[initialProfile?.source.imageId ?? ""]?.dataUrl ?? "",
  );
  const [busy, setBusy] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [scope, setScope] = useState<"tokens" | BlockKind>("tokens");
  const manual = (type: StyleProfile["source"]["type"], imageId?: string) => ({
    ...structuredClone(builtInStyles[0]),
    id: uid("style"),
    name: "我的新风格",
    source: { type, capturedAt: new Date().toISOString(), rights, imageId },
    tags: ["我的风格"],
    confidence: {
      mode: "manual" as const,
      uncertainKeys: ["尚未分析，当前参数为手动配置起点"],
      notes: ["纯文字没有可提取的视觉规则，可手动设置或上传参考截图。"],
    },
  });
  const changeMode = (next: typeof mode) => {
    setMode(next);
    setInput("");
    setImage("");
    setProfile(undefined);
    setWarnings([]);
  };
  const analyze = async () => {
    if (!image) return;
    setBusy("AI 识别中…");
    try {
      const result = await postJSON<VisionResult>("/api/ai/style-vision", {
        image: await visionImage(image),
        mode: "article",
      });
      setProfile((previous) => ({
        ...(previous ?? manual("screenshot")),
        name: result.name,
        tokens: result.tokens,
        components: result.components,
        confidence: {
          mode: "vision",
          uncertainKeys: result.uncertainKeys,
          notes: result.notes,
        },
      }));
      setPanel(null);
    } catch (error) {
      setPanel(null);
      onError((error as Error).message);
    } finally {
      setBusy("");
    }
  };
  const extract = async () => {
    setBusy("提取参考中…");
    onError("");
    try {
      if (mode === "text") {
        setProfile(manual("text"));
        setWarnings([
          "文字输入不含视觉样式，请手动配置参数，或上传带排版的截图。",
        ]);
        setPanel(null);
        return;
      }
      const result = await postJSON<CaptureResult>("/api/ai/style-capture", {
        ...(mode === "url" ? { url: input.trim() } : { html: input }),
        rights,
      });
      if (result.screenshot) {
        const asset = await storeDataImage(
          result.screenshot,
          result.title,
          rights,
          result.referenceDocument ?? (mode === "html" ? input : undefined),
        );
        result.profile.source.imageId = asset.id;
        setImage(result.screenshot);
        await onRefresh();
      }
      setProfile(result.profile);
      setPanel(null);
      setWarnings(result.warnings);
    } catch (error) {
      setPanel(null);
      onError((error as Error).message);
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="studio-learning">
      <div className="studio-workspace-tools">
        <h2>学习新风格</h2>
        <div>
          <PanelToggle
            label="参考来源"
            controls="learn-source"
            compact={compact}
            open={panel === "source"}
            onClick={() => setPanel("source")}
            icon={<Link2 size={16} />}
          />
          <PanelToggle
            label="风格参数"
            controls="learn-settings"
            compact={compact}
            open={panel === "settings"}
            onClick={() => setPanel("settings")}
            icon={<Type size={16} />}
          />
        </div>
      </div>
      <WorkspacePanel
        id="learn-source"
        title="参考来源"
        className="studio-source-panel"
        compact={compact}
        open={!compact || panel === "source"}
        onClose={() => setPanel(null)}
      >
        {!compact && <h2>学习新风格</h2>}
        <div className="studio-segment source-types">
          {(
            [
              ["url", "链接", Link2],
              ["html", "HTML", Code2],
              ["screenshot", "截图", ImagePlus],
              ["text", "文字", Type],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              aria-pressed={mode === key}
              onClick={() => changeMode(key)}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
        {mode === "screenshot" ? (
          <label className="studio-upload">
            <ImagePlus size={30} />
            <span>上传文章截图或长图</span>
            <small>PNG / JPG / WebP，最大 10 MB</small>
            <input
              type="file"
              aria-label="上传参考文章截图"
              accept="image/png,image/jpeg,image/webp"
              disabled={!!busy}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const asset = await storeImage(file, rights);
                  setImage(asset.dataUrl);
                  setProfile(manual("screenshot", asset.id));
                  await onRefresh();
                } catch (error) {
                  setPanel(null);
                  onError((error as Error).message);
                }
                e.target.value = "";
              }}
            />
          </label>
        ) : (
          <label className="studio-field">
            <span>
              {mode === "url"
                ? "参考文章链接"
                : mode === "html"
                  ? "参考 HTML / 富文本"
                  : "参考文字 / Markdown"}
            </span>
            {mode === "url" ? (
              <input
                type="url"
                placeholder="https://mp.weixin.qq.com/s/…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
            ) : (
              <textarea
                rows={12}
                placeholder={
                  mode === "html"
                    ? "粘贴 HTML，或直接粘贴带格式的参考文章"
                    : "粘贴参考文字"
                }
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onPaste={(e) => {
                  const html = e.clipboardData.getData("text/html");
                  if (mode === "html" && html) {
                    e.preventDefault();
                    setInput(html);
                  }
                }}
              />
            )}
          </label>
        )}
        <label className="studio-field">
          <span>素材权利</span>
          <select
            aria-label="参考素材权利"
            value={rights}
            onChange={(e) => {
              const value = e.target.value as Rights;
              setRights(value);
              if (profile)
                setProfile({
                  ...profile,
                  source: { ...profile.source, rights: value },
                });
            }}
          >
            <option value="reference-only">仅参考视觉风格</option>
            <option value="owned">我拥有素材版权</option>
            <option value="licensed">已取得授权</option>
            <option value="unknown">授权待确认</option>
          </select>
        </label>
        {mode === "screenshot" ? (
          <button
            className="studio-btn primary"
            disabled={!image || !!busy}
            onClick={analyze}
          >
            <Sparkles size={16} />
            {busy || "AI 识别风格"}
          </button>
        ) : (
          <button
            className="studio-btn primary"
            disabled={!input.trim() || !!busy}
            onClick={extract}
          >
            <ScanLine size={16} />
            {busy || "提取风格"}
          </button>
        )}
        {mode !== "screenshot" && image && (
          <button className="studio-btn" disabled={!!busy} onClick={analyze}>
            <Sparkles size={15} />
            AI 补充识别
          </button>
        )}
        <p className="studio-note">
          采集失败时，可改用截图或粘贴。参考中的正文、图片和 Logo
          不会加入你的文章。
        </p>
        {warnings.map((w, i) => (
          <p key={i} className="studio-notice">
            {w}
          </p>
        ))}
      </WorkspacePanel>
      <main className="studio-reference-compare">
        <div
          className="studio-segment studio-reference-switch"
          aria-label="参考对照视图"
        >
          <button
            aria-pressed={compareView === "reference"}
            onClick={() => setCompareView("reference")}
          >
            原参考
          </button>
          <button
            aria-pressed={compareView === "sample"}
            onClick={() => setCompareView("sample")}
          >
            复刻示例
          </button>
        </div>
        <div className="studio-section-heading">
          <h3>原参考</h3>
          <ArrowRight size={17} />
          <h3>复刻示例</h3>
        </div>
        <div className="studio-reference-pair" data-compare-view={compareView}>
          <div className="studio-original">
            {image ? (
              <img src={image} alt="原参考文章截图" />
            ) : input && mode === "text" ? (
              <div className="studio-text-reference">{input}</div>
            ) : (
              <div className="studio-placeholder">
                <ScanLine size={32} />
                <p>添加参考后，在这里对照</p>
              </div>
            )}
          </div>
          <div className="studio-sample">
            {profile ? (
              <ArticleCanvas
                article={sampleArticle}
                profile={profile}
                assets={assets}
                readOnly
              />
            ) : (
              <div className="studio-placeholder">
                <Type size={32} />
                <p>提取颜色、文字与留白规则</p>
              </div>
            )}
          </div>
        </div>
      </main>
      <WorkspacePanel
        id="learn-settings"
        title="风格参数"
        className="studio-inspector"
        compact={compact}
        open={!compact || panel === "settings"}
        onClose={() => setPanel(null)}
      >
        {!compact && <h3>风格参数</h3>}
        {profile ? (
          <>
            <label className="studio-field">
              <span>风格名称</span>
              <input
                aria-label="风格名称"
                value={profile.name}
                maxLength={80}
                onChange={(e) =>
                  setProfile({ ...profile, name: e.target.value })
                }
              />
            </label>
            <label className="studio-field">
              <span>标签</span>
              <input
                value={profile.tags.join("，")}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    tags: e.target.value
                      .split(/[,，]/)
                      .map((t) => t.trim())
                      .filter(Boolean)
                      .slice(0, 20),
                  })
                }
              />
            </label>
            <div className="studio-confidence">
              {profile.confidence.mode === "dom"
                ? "DOM 计算样式"
                : profile.confidence.mode === "vision"
                  ? "视觉分析 · 参数为估计值"
                  : "手动配置"}
            </div>
            <details className="studio-details">
              <summary>来源与提取依据</summary>
              {profile.source.url && (
                <a href={profile.source.url} target="_blank" rel="noreferrer">
                  查看来源
                </a>
              )}
              {[
                ...profile.confidence.notes,
                ...profile.confidence.uncertainKeys,
              ].map((s, i) => (
                <p key={i}>{s}</p>
              ))}
            </details>
            <label className="studio-field">
              <span>调整范围</span>
              <select
                aria-label="风格参数范围"
                value={scope}
                onChange={(e) => setScope(e.target.value as typeof scope)}
              >
                <option value="tokens">全局主题</option>
                {Object.entries(kindLabels).map(([key, label]) => (
                  <option value={key} key={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {scope === "tokens" ? (
              <TokenFields
                tokens={profile.tokens}
                onChange={(tokens) => setProfile({ ...profile, tokens })}
              />
            ) : (
              <ComponentFields
                value={profile.components[scope] ?? {}}
                onChange={(value) =>
                  setProfile({
                    ...profile,
                    components: { ...profile.components, [scope]: value },
                  })
                }
              />
            )}
            <label className="studio-field">
              <span>图片布局</span>
              <select
                aria-label="图片布局"
                value={profile.layoutRules.imagePolicy}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    layoutRules: {
                      ...profile.layoutRules,
                      imagePolicy: e.target.value as "full" | "inset",
                    },
                  })
                }
              >
                <option value="full">通栏</option>
                <option value="inset">两侧留白</option>
              </select>
            </label>
            <button
              className="studio-btn primary sticky-action"
              disabled={!profile.name.trim() || !!busy}
              onClick={async () => {
                setBusy("保存中…");
                try {
                  await onSaved({
                    ...profile,
                    source: { ...profile.source, rights },
                  });
                } catch (error) {
                  setPanel(null);
                  onError((error as Error).message);
                } finally {
                  setBusy("");
                }
              }}
            >
              <Save size={16} />
              保存到我的风格
            </button>
          </>
        ) : (
          <p className="studio-note">提取后可在这里精调并保存。</p>
        )}
      </WorkspacePanel>
    </div>
  );
}
