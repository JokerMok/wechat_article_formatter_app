"use client";

import * as React from "react";
import { drawDouyinImagePage, drawXiaohongshuImagePage, type CardLayoutPage } from "../../lib/renderers/cards";
import type { CardCanvasPreset } from "../../lib/renderers/cards/canvas";
import { renderCardPageCanvas } from "./card-image-actions";

export function CardSurface(props: { page: CardLayoutPage; preset: CardCanvasPreset; platform: "xiaohongshu" | "douyinImage"; imageUrls: Record<string, string> }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = React.useState<{ page: CardLayoutPage; preset: CardCanvasPreset; imageUrls: Record<string, string>; error?: string }>();
  const ready = rendered?.page === props.page && rendered?.preset === props.preset && rendered?.imageUrls === props.imageUrls;
  const error = ready ? rendered?.error : undefined;
  React.useEffect(() => {
    let disposed = false;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!context) return;
    const draw = props.platform === "douyinImage" ? drawDouyinImagePage : drawXiaohongshuImagePage;
    void renderCardPageCanvas(props.page, props.imageUrls, { preset: props.preset, platform: props.platform }).then((bitmap) => {
      if (disposed) return;
      context.clearRect(0, 0, canvas!.width, canvas!.height);
      context.drawImage(bitmap, 0, 0);
      setRendered({ page: props.page, preset: props.preset, imageUrls: props.imageUrls });
    }).catch((reason) => {
      if (disposed) return;
      draw(context, props.page, { preset: props.preset });
      setRendered({ page: props.page, preset: props.preset, imageUrls: props.imageUrls, error: reason instanceof Error ? reason.message : "图片加载失败" });
    });
    return () => { disposed = true; };
  }, [props.page, props.preset, props.platform, props.imageUrls]);
  const label = props.platform === "douyinImage" ? "抖音图文" : props.preset.variant === "story" ? "章节" : props.preset.variant === "checklist" ? "行动清单" : props.preset.variant === "data" ? "数据编辑部" : "编辑部 /";
  return <>
    <figure data-card-preview data-render-ready={ready} data-page-role={props.page.pageKind} className="relative mx-auto w-full max-w-[340px]" style={{ aspectRatio: `${props.page.canvas.width}/${props.page.canvas.height}`, background: props.preset.background }}>
      <canvas ref={canvasRef} width={props.page.canvas.width} height={props.page.canvas.height} className="block h-full w-full" aria-label={`第 ${props.page.pageNumber} 页成品`} />
      <figcaption className="sr-only">{label} {String(props.page.pageNumber).padStart(2, "0")} {props.page.nodes.map((node) => <span key={node.id} data-content-node>{node.text}{"\n"}</span>)}</figcaption>
    </figure>
    {error && <p role="alert" className="mx-auto max-w-[340px] text-xs text-red-700">{error}</p>}
  </>;
}
