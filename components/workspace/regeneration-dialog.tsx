"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RegenerationDialog(props: {
  open: boolean;
  platformLabels: string[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!props.open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#17231f]/35 p-4" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) props.onCancel();
    }}>
      <div className="w-full max-w-md rounded-md border bg-white p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="regeneration-dialog-title">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div>
            <h2 id="regeneration-dialog-title" className="font-semibold">当前平台已有人工修改</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              重新生成会覆盖{props.platformLabels.join("、")}的当前人工稿。其他平台和源文不会改变。
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={props.onCancel}>保留当前稿</Button>
          <Button type="button" onClick={props.onConfirm}>覆盖并生成</Button>
        </div>
      </div>
    </div>
  );
}
