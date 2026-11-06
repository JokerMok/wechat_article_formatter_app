import type { ComponentStyle } from "@/lib/studio/types";
import { ColorField, RangeField } from "./controls";
export function ComponentFields({
  value,
  onChange,
}: {
  value: ComponentStyle;
  onChange: (value: ComponentStyle, key?: keyof ComponentStyle) => void;
}) {
  const change = (key: keyof ComponentStyle, next: string | number) =>
    onChange({ ...value, [key]: next }, key);
  return (
    <>
      <fieldset className="studio-control-group">
        <legend>文字</legend>
        <ColorField
          label="文字颜色"
          value={value.color ?? "#263b32"}
          onChange={(v) => change("color", v)}
        />
        <RangeField
          label="字号"
          value={value.fontSize ?? 16}
          min={10}
          max={64}
          unit="px"
          onChange={(v) => change("fontSize", v)}
        />
        <RangeField
          label="当前块行距"
          value={value.lineHeight ?? 1.85}
          min={1}
          max={3}
          step={0.05}
          onChange={(v) => change("lineHeight", v)}
        />
        <label className="studio-field">
          <span>对齐</span>
          <select
            aria-label="文字对齐"
            value={value.textAlign ?? "left"}
            onChange={(e) => change("textAlign", e.target.value)}
          >
            <option value="left">左对齐</option>
            <option value="center">居中</option>
            <option value="right">右对齐</option>
            <option value="justify">两端对齐</option>
          </select>
        </label>
        <label className="studio-field">
          <span>字重</span>
          <select
            aria-label="字重"
            value={value.fontWeight ?? 400}
            onChange={(e) => change("fontWeight", Number(e.target.value))}
          >
            <option value={400}>常规</option>
            <option value={500}>中等</option>
            <option value={600}>半粗</option>
            <option value={700}>粗体</option>
          </select>
        </label>
        <RangeField
          label="字间距"
          value={value.letterSpacing ?? 0}
          min={0}
          max={8}
          step={0.2}
          unit="px"
          onChange={(v) => change("letterSpacing", v)}
        />
      </fieldset>
      <fieldset className="studio-control-group">
        <legend>间距</legend>
        <RangeField
          label="上间距"
          value={value.marginTop ?? 0}
          min={0}
          max={100}
          unit="px"
          onChange={(v) => change("marginTop", v)}
        />
        <RangeField
          label="下间距"
          value={value.marginBottom ?? 20}
          min={0}
          max={100}
          unit="px"
          onChange={(v) => change("marginBottom", v)}
        />
        <RangeField
          label="内边距"
          value={value.padding ?? 0}
          min={0}
          max={64}
          unit="px"
          onChange={(v) => change("padding", v)}
        />
      </fieldset>
      <details className="studio-control-details">
        <summary>宽度与段首</summary>
        <div>
          <RangeField
            label="组件宽度"
            value={value.widthPercent ?? 100}
            min={10}
            max={100}
            unit="%"
            onChange={(v) => change("widthPercent", v)}
          />
          <label className="studio-field">
            <span>组件位置</span>
            <select
              aria-label="组件位置"
              value={value.align ?? "left"}
              onChange={(event) => change("align", event.target.value)}
            >
              <option value="left">靠左</option>
              <option value="center">居中</option>
              <option value="right">靠右</option>
            </select>
          </label>
          <RangeField
            label="首行缩进"
            value={value.textIndent ?? 0}
            min={0}
            max={64}
            unit="px"
            onChange={(v) => change("textIndent", v)}
          />
        </div>
      </details>
      <details className="studio-control-details">
        <summary>边框与背景</summary>
        <div>
          <ColorField
            label="填充颜色"
            value={value.backgroundColor ?? "#ffffff"}
            onChange={(v) => change("backgroundColor", v)}
          />
          <RangeField
            label="边框宽度"
            value={value.borderWidth ?? 0}
            min={0}
            max={8}
            unit="px"
            onChange={(v) => change("borderWidth", v)}
          />
          <RangeField
            label="左侧装饰线"
            value={value.borderLeftWidth ?? 0}
            min={0}
            max={12}
            unit="px"
            onChange={(v) => change("borderLeftWidth", v)}
          />
          <ColorField
            label="边框颜色"
            value={value.borderColor ?? "#d4dfd8"}
            onChange={(v) => change("borderColor", v)}
          />
          <RangeField
            label="圆角"
            value={value.borderRadius ?? 0}
            min={0}
            max={48}
            unit="px"
            onChange={(v) => change("borderRadius", v)}
          />
        </div>
      </details>
    </>
  );
}
