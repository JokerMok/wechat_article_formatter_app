"use client";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import {
  allowedComponents,
  layoutIndex,
  layoutStepFor,
  sourceFingerprint,
} from "@/lib/studio/article-layout";
import {
  articleTypeLabels,
  defaultLayoutSettings,
  layoutLabels,
  roleLabels,
  type LayoutSettings,
  type PlannedComponent,
} from "@/lib/studio/layout-contract";
import type { ArticleDocument } from "@/lib/studio/types";
import { plainHTML } from "@/lib/studio/import";
import { StudioDialog } from "./dialog";

export function ArticleLayoutPanel({
  article,
  selected,
  running,
  onClose,
  onConfigure,
  onAnalyze,
  onRestore,
  onEnable,
  onComponent,
}: {
  article: ArticleDocument;
  selected?: string;
  running: boolean;
  onClose: () => void;
  onConfigure: (settings: LayoutSettings, automatic: boolean) => void;
  onAnalyze: () => void;
  onRestore: () => void;
  onEnable: () => void;
  onComponent: (
    id: string,
    component: PlannedComponent | undefined,
    level?: number,
  ) => void;
}) {
  const layout = article.layout;
  const settings = layout?.settings ?? defaultLayoutSettings;
  const [chosen, setChosen] = useState(
    selected ??
      article.blocks.find((block) => block.kind === "paragraph")?.id ??
      article.blocks[0]?.id,
  );
  const block = article.blocks.find((block) => block.id === chosen);
  const node = layout?.structure.nodes.find(
    (entry) => entry.source.blockId === chosen,
  );
  const indexed = layoutIndex(layout);
  const step = block ? layoutStepFor(block, layout, indexed) : undefined;
  const originalStep = chosen
    ? layout?.plan.steps.find((item) => item.blockId === chosen)
    : undefined;
  const manual = chosen ? layout?.manual?.[chosen] : undefined;
  const candidates =
    layout?.structure.nodes.filter(
      (n) =>
        n.role === "chapter" ||
        n.role === "lead" ||
        n.role === "summary" ||
        layout.structure.thesisIds.includes(n.source.blockId) ||
        ["case", "data", "point"].includes(
          indexed.get(n.source.blockId)?.component ?? "",
        ),
    ) ?? [];
  const change = (patch: Partial<LayoutSettings>) =>
    onConfigure({ ...settings, ...patch }, layout?.automatic ?? true);
  return (
    <StudioDialog title="智能排版" wide onClose={onClose}>
      <div className="studio-layout-controls">
        <label>
          <input
            type="checkbox"
            checked={layout?.automatic ?? true}
            onChange={(event) => onConfigure(settings, event.target.checked)}
          />
          自动排版
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.preserveSource}
            onChange={(event) =>
              change({ preserveSource: event.target.checked })
            }
          />
          保留原文格式
        </label>
        <label>
          重点突出{" "}
          <select
            aria-label="重点突出程度"
            value={settings.density}
            onChange={(event) =>
              change({
                density: event.target.value as LayoutSettings["density"],
              })
            }
          >
            <option value="restrained">克制</option>
            <option value="standard">标准</option>
            <option value="rich">丰富</option>
          </select>
        </label>
      </div>
      <div className="studio-layout-status" role="status">
        {running
          ? "正在分析全文，已显示规则排版"
          : layout?.enabled
            ? `${layout.plan.origin === "ai" ? "AI 排版" : "规则排版"} · ${articleTypeLabels[layout.structure.articleType]}`
            : "原布局"}
        {layout?.plan.fallbackReason && (
          <small>{layout.plan.fallbackReason}</small>
        )}
      </div>
      {layout && (
        <div className="studio-layout-review">
          <div>
            <h3>章节与重点</h3>
            <div className="studio-layout-outline">
              {candidates.map((item) => (
                <button
                  className="studio-btn"
                  key={item.source.blockId}
                  aria-pressed={chosen === item.source.blockId}
                  onClick={() => setChosen(item.source.blockId)}
                >
                  <span>
                    第 {item.source.ordinal} 块 · {roleLabels[item.role]}
                  </span>
                  <strong>
                    {plainHTML(
                      article.blocks.find(
                        (entry) => entry.id === item.source.blockId,
                      )?.html ?? "",
                    ).slice(0, 55)}
                  </strong>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="studio-field">
              <span>原文块</span>
              <select
                aria-label="原文块"
                value={chosen ?? ""}
                onChange={(event) => setChosen(event.target.value)}
              >
                {article.blocks.map((entry, index) => (
                  <option key={entry.id} value={entry.id}>
                    {index + 1}.{" "}
                    {plainHTML(entry.html).slice(0, 48) ||
                      entry.alt ||
                      entry.kind}
                  </option>
                ))}
              </select>
            </label>
            {block && (
              <>
                <p className="studio-layout-excerpt">
                  {plainHTML(block.html) || block.alt}
                </p>
                {node?.source.fingerprint === sourceFingerprint(block) &&
                  originalStep && (
                    <p className="studio-note">{originalStep.reason}</p>
                  )}
                <label className="studio-field">
                  <span>排版组件</span>
                  <select
                    aria-label="排版组件"
                    value={manual?.component ?? "auto"}
                    onChange={(event) =>
                      onComponent(
                        block.id,
                        event.target.value === "auto"
                          ? undefined
                          : (event.target.value as PlannedComponent),
                        step?.level,
                      )
                    }
                  >
                    <option value="auto">
                      自动 · {layoutLabels[step?.component ?? "original"]}
                    </option>
                    {allowedComponents(block.kind)
                      .filter(
                        (component) =>
                          component !== "title" ||
                          !article.blocks.some(
                            (entry) => entry.kind === "title",
                          ),
                      )
                      .map((component) => (
                        <option key={component} value={component}>
                          {layoutLabels[component]}
                        </option>
                      ))}
                  </select>
                </label>
                {step?.component === "chapter" && (
                  <label className="studio-field">
                    <span>章节层级</span>
                    <select
                      aria-label="章节层级"
                      value={step.level ?? 2}
                      onChange={(event) =>
                        onComponent(
                          block.id,
                          "chapter",
                          Number(event.target.value),
                        )
                      }
                    >
                      {[2, 3, 4, 5, 6].map((level) => (
                        <option key={level} value={level}>
                          H{level}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {layout.plan.imageSuggestion?.afterBlockId === block.id && (
                  <p className="studio-note">
                    {layout.plan.imageSuggestion.reason}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
      <div className="studio-dialog-actions">
        {layout?.enabled ? (
          <button className="studio-btn" onClick={onRestore}>
            恢复原布局
          </button>
        ) : (
          layout && (
            <button className="studio-btn" onClick={onEnable}>
              使用已有方案
            </button>
          )
        )}
        <button
          className="studio-btn primary"
          disabled={running}
          onClick={onAnalyze}
        >
          <Sparkles size={15} />
          {layout?.enabled ? "AI 重新设计排版" : "开始智能排版"}
        </button>
      </div>
    </StudioDialog>
  );
}
