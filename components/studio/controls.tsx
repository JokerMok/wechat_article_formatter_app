"use client";
import type { StyleTokens } from "@/lib/studio/types";
export function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="studio-field">
      <span>
        {label}
        <output>
          {Number(value.toFixed(2))}
          {unit}
        </output>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="studio-color">
      <span>{label}</span>
      <span>
        <input
          aria-label={label}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <code>{value.toUpperCase()}</code>
      </span>
    </label>
  );
}
export function TokenFields({
  tokens,
  onChange,
}: {
  tokens: StyleTokens;
  onChange: (tokens: StyleTokens) => void;
}) {
  const change = <K extends keyof StyleTokens>(key: K, value: StyleTokens[K]) =>
    onChange({ ...tokens, [key]: value });
  return (
    <>
      <fieldset className="studio-control-group">
        <legend>文字</legend>
        <label className="studio-field">
          <span>字体</span>
          <select
            aria-label="字体"
            value={tokens.fontFamily}
            onChange={(e) =>
              change("fontFamily", e.target.value as StyleTokens["fontFamily"])
            }
          >
            <option value="sans">黑体</option>
            <option value="serif">宋体</option>
          </select>
        </label>
        <RangeField
          label="正文字号"
          value={tokens.bodySize}
          min={12}
          max={24}
          unit="px"
          onChange={(v) => change("bodySize", v)}
        />
        <RangeField
          label="文章标题字号"
          value={tokens.titleSize}
          min={20}
          max={48}
          unit="px"
          onChange={(v) => change("titleSize", v)}
        />
        <RangeField
          label="章节标题字号"
          value={tokens.headingSize}
          min={16}
          max={36}
          unit="px"
          onChange={(v) => change("headingSize", v)}
        />
        <RangeField
          label="行距"
          value={tokens.lineHeight}
          min={1.2}
          max={2.8}
          step={0.05}
          onChange={(v) => change("lineHeight", v)}
        />
      </fieldset>
      <fieldset className="studio-control-group">
        <legend>颜色</legend>
        <ColorField
          label="主色"
          value={tokens.accent}
          onChange={(v) => change("accent", v)}
        />
        <ColorField
          label="正文颜色"
          value={tokens.text}
          onChange={(v) => change("text", v)}
        />
        <ColorField
          label="背景颜色"
          value={tokens.background}
          onChange={(v) => change("background", v)}
        />
        <ColorField
          label="次要文字"
          value={tokens.muted}
          onChange={(v) => change("muted", v)}
        />
      </fieldset>
      <fieldset className="studio-control-group">
        <legend>间距</legend>
        <RangeField
          label="段落间距"
          value={tokens.paragraphGap}
          min={4}
          max={48}
          unit="px"
          onChange={(v) => change("paragraphGap", v)}
        />
        <RangeField
          label="页面边距"
          value={tokens.padding}
          min={0}
          max={80}
          unit="px"
          onChange={(v) => change("padding", v)}
        />
        <RangeField
          label="图片圆角"
          value={tokens.radius}
          min={0}
          max={32}
          unit="px"
          onChange={(v) => change("radius", v)}
        />
      </fieldset>
    </>
  );
}
