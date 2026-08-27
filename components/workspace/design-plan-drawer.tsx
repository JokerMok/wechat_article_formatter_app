"use client";

import * as React from "react";
import { Check, RotateCcw, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Toggle } from "@/components/ui/toggle";
import type { DesignPlan } from "@/lib/design-plan";
import { DESIGN_SCHEME_LIST, DESIGN_SCHEMES, type DesignScheme, type DesignSchemeId } from "@/lib/design-schemes";
import type { PlatformId } from "@/lib/platforms/types";
import { cn } from "@/lib/utils";
import { WORKSPACE_PLATFORM_LABELS } from "./state";
import type { LayoutSettings, PlatformDraft, RatioMode } from "./types";

type SchemeApplyMode = "visual" | "structure";

export function DesignPlanDrawer(props: {
  open: boolean;
  activePlatform: PlatformId;
  draft: PlatformDraft;
  plan: DesignPlan;
  layout: LayoutSettings;
  favoriteSchemeIds: DesignSchemeId[];
  recentSchemeIds: DesignSchemeId[];
  onClose: () => void;
  onApplyScheme: (schemeId: DesignSchemeId, mode: SchemeApplyMode) => void;
  onToggleFavorite: (schemeId: DesignSchemeId) => void;
  onLayoutChange: (patch: Partial<LayoutSettings>) => void;
  onRatioChange: (ratio: RatioMode) => void;
}) {
  const [pendingScheme, setPendingScheme] = React.useState<DesignSchemeId>();
  const isCardPlatform = props.activePlatform === "xiaohongshu" || props.activePlatform === "douyinImage";

  if (!props.open) return null;

  return (
    <aside
      className="fixed bottom-0 right-0 top-[100px] z-50 flex w-[min(380px,calc(100vw-24px))] flex-col border-l border-[#d7dfda] bg-[#fbfcfb] shadow-[-16px_0_40px_rgba(23,35,31,0.14)]"
      aria-label="排版方案与画布设置"
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#dfe5e1] px-4">
        <div>
          <h2 className="text-sm font-semibold text-[#17231f]">排版方案</h2>
          <p className="text-xs text-muted-foreground">{WORKSPACE_PLATFORM_LABELS[props.activePlatform]} · {DESIGN_SCHEMES[props.draft.schemeId].name}</p>
        </div>
        <Button type="button" size="icon" variant="ghost" onClick={props.onClose} aria-label="关闭排版方案">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <section className="rounded-md border border-[#cfe0d6] bg-[#f1f7f3] p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-[#17633d]">系统推荐</div>
              <h3 className="mt-1 text-base font-semibold">{DESIGN_SCHEMES[props.plan.recommendedScheme].name}</h3>
            </div>
            {props.draft.schemeId === props.plan.recommendedScheme && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[11px] font-medium text-[#17633d]">
                <Check className="h-3 w-3" /> 当前使用
              </span>
            )}
          </div>
          <p className="mt-2 text-xs leading-5 text-[#496157]">{props.plan.recommendationReason}</p>
          {props.draft.schemeId !== props.plan.recommendedScheme && (
            <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => setPendingScheme(props.plan.recommendedScheme)}>
              <RotateCcw className="h-4 w-4" /> 恢复推荐方案
            </Button>
          )}
        </section>

        <div className="mt-4 grid gap-3">
          {DESIGN_SCHEME_LIST.map((scheme) => (
            <SchemeCard
              key={scheme.id}
              scheme={scheme}
              title={props.plan.recommendedTitle}
              active={scheme.id === props.draft.schemeId}
              favorite={props.favoriteSchemeIds.includes(scheme.id)}
              recent={props.recentSchemeIds.includes(scheme.id)}
              onApply={() => setPendingScheme(scheme.id)}
              onToggleFavorite={() => props.onToggleFavorite(scheme.id)}
            />
          ))}
        </div>

        {isCardPlatform && (
          <section className="mt-5 border-t border-[#dfe5e1] pt-4">
            <h3 className="text-sm font-semibold">画布微调</h3>
            <p className="mt-1 text-xs text-muted-foreground">修改后会重新测量全文并自动分页。</p>
            {props.activePlatform === "douyinImage" && (
              <div className="mt-4">
                <Label className="text-xs text-muted-foreground">图片比例</Label>
                <div className="mt-1 grid grid-cols-2 gap-2" role="group" aria-label="图片比例">
                  <Toggle className="w-full" pressed={props.draft.ratio === "3:4"} onPressedChange={() => props.onRatioChange("3:4")}>3:4</Toggle>
                  <Toggle className="w-full" pressed={props.draft.ratio === "9:16"} onPressedChange={() => props.onRatioChange("9:16")}>9:16</Toggle>
                </div>
              </div>
            )}
            <div className="mt-4 grid gap-4">
              <DrawerRange label="边距" value={props.layout.margin} min={48} max={140} step={2} onChange={(margin) => props.onLayoutChange({ margin })} />
              <DrawerRange label="标题字号" value={props.layout.titleFontSize} min={48} max={92} step={1} onChange={(titleFontSize) => props.onLayoutChange({ titleFontSize })} />
              <DrawerRange label="正文字号" value={props.layout.bodyFontSize} min={25} max={44} step={1} onChange={(bodyFontSize) => props.onLayoutChange({ bodyFontSize })} />
              <DrawerRange label="行距" value={props.layout.lineSpacing} min={1.1} max={1.8} step={0.05} onChange={(lineSpacing) => props.onLayoutChange({ lineSpacing })} />
              <DrawerRange label="段距" value={props.layout.paragraphSpacing} min={18} max={64} step={1} onChange={(paragraphSpacing) => props.onLayoutChange({ paragraphSpacing })} />
            </div>
          </section>
        )}
      </div>

      {pendingScheme && (
        <div className="absolute inset-0 z-10 flex items-end bg-[#17231f]/28 p-3" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setPendingScheme(undefined);
        }}>
          <div className="w-full rounded-md border bg-white p-4 shadow-xl" role="dialog" aria-modal="true" aria-label="应用排版方案">
            <h3 className="font-semibold">应用“{DESIGN_SCHEMES[pendingScheme].name}”</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {props.draft.status === "edited" ? "当前平台已有人工修改。只换视觉不会改文案；优化结构会重排当前平台稿。" : "可只替换视觉，也可以按该方案重新组织当前平台稿。"}
            </p>
            <div className="mt-4 grid gap-2">
              <Button type="button" onClick={() => {
                props.onApplyScheme(pendingScheme, "visual");
                setPendingScheme(undefined);
              }}>只换视觉</Button>
              <Button type="button" variant="outline" onClick={() => {
                props.onApplyScheme(pendingScheme, "structure");
                setPendingScheme(undefined);
              }}>{props.draft.status === "edited" ? "覆盖当前人工稿并优化结构" : "同时优化结构"}</Button>
              <Button type="button" variant="ghost" onClick={() => setPendingScheme(undefined)}>取消</Button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

function SchemeCard(props: {
  scheme: DesignScheme;
  title: string;
  active: boolean;
  favorite: boolean;
  recent: boolean;
  onApply: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <article className={cn("grid grid-cols-[96px_1fr] gap-3 rounded-md border bg-white p-3", props.active ? "border-[#17633d] ring-1 ring-[#17633d]/15" : "border-[#dfe5e1]") }>
      <div className="aspect-[3/4] overflow-hidden rounded border p-2" style={{ background: props.scheme.palette.background, borderColor: props.scheme.palette.secondary }}>
        <div className="h-1 w-full" style={{ background: props.scheme.palette.secondary }} />
        <div className="mt-3 line-clamp-3 text-[8px] font-bold leading-[1.35]" style={{ color: props.scheme.palette.primary }}>{props.title}</div>
        <div className="mt-3 h-1.5 w-4/5 rounded-full" style={{ background: props.scheme.palette.primary }} />
        <div className="mt-2 h-1 w-full rounded-full" style={{ background: props.scheme.palette.secondary }} />
        <div className="mt-1 h-1 w-3/4 rounded-full" style={{ background: props.scheme.palette.secondary }} />
        <div className="mt-3 rounded-sm p-1" style={{ background: props.scheme.palette.secondary }}>
          <div className="h-1 w-5/6 rounded-full bg-white/80" />
          <div className="mt-1 h-1 w-2/3 rounded-full bg-white/80" />
        </div>
      </div>
      <div className="min-w-0">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold">{props.scheme.name}</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{props.scheme.description}</p>
          </div>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={props.onToggleFavorite} aria-label={props.favorite ? `取消收藏${props.scheme.name}` : `收藏${props.scheme.name}`}>
            <Star className={cn("h-4 w-4", props.favorite && "fill-[#b48028] text-[#b48028]")} />
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="rounded-full bg-[#f0f3f1] px-2 py-0.5">{props.scheme.density}</span>
          {props.recent && <span>最近使用</span>}
          <span className="inline-flex gap-1" aria-label="主色预览">
            <i className="h-3 w-3 rounded-full" style={{ background: props.scheme.palette.primary }} />
            <i className="h-3 w-3 rounded-full border" style={{ background: props.scheme.palette.secondary }} />
          </span>
        </div>
        <Button type="button" size="sm" variant={props.active ? "outline" : "default"} className="mt-3" onClick={props.onApply}>
          {props.active ? "调整应用方式" : "应用方案"}
        </Button>
      </div>
    </article>
  );
}

function DrawerRange(props: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  const displayValue = Number.isInteger(props.value) ? props.value : props.value.toFixed(2);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <Label className="text-xs text-muted-foreground">{props.label}</Label>
        <output className="text-xs font-medium text-[#17231f]">{displayValue}</output>
      </div>
      <Slider value={props.value} min={props.min} max={props.max} step={props.step} onValueChange={props.onChange} aria-label={props.label} />
    </div>
  );
}

export type { SchemeApplyMode };
