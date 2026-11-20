import { describe, expect, it } from "vitest";
import { composeCoverPrompt, coverCopyIssue, coverDesignSchema, learnedCoverReference } from "./cover-design";
import { coverDirectionOverrides } from "./cover-visual-rules";

const title = "AI 很快复刻了拼豆网站，为什么一个上传窗口还要改好几轮？";
const design = coverDesignSchema.parse({
  angle: "快速搭出的首版，仍需要核对影响体验的细节。",
  summary: "AI 很快完成可运行的拼豆网站，两个版本仍有像素差异。上传体验需要反复核对取样和预览细节。",
  keywords: ["拼豆", "上传", "预览", "取样阈值", "体验细节"],
  theme: "一颗拼豆的差异",
  direction: { type: "metaphor", palette: "warm", rendering: "hand-drawn", text: "title-subtitle", mood: "balanced", font: "handwritten" },
  language: "简体中文",
  headline: "首版很快，细节很慢",
  subtitle: "从拼豆上传窗口说起",
  tags: [],
  concept: "一颗移出整齐方格的珊瑚色拼豆，露出它原本占据的位置。",
  composition: "在偏右位置放大拼豆和网格，让标题占据左侧安静的纸面。",
  typography: "黑色粗体主标题和较小的常规字重副标题共用左对齐线。",
  colors: "暖米白做底，炭黑为主体色，珊瑚红用在唯一移位的拼豆上。",
  finish: "哑光象牙纸、炭黑网格，珊瑚色拼豆在柔和侧光下带一层影子。",
});
const frame = { title, width: 900, height: 383 };

describe("AI cover design", () => {
  it("rejects reproducing the long article title, including a split version", () => {
    expect(coverCopyIssue({ ...design, headline: title }, title, "")).toBeTruthy();
    expect(coverCopyIssue({
      ...design,
      headline: "AI很快复刻了拼豆网站",
      subtitle: "为什么一个上传窗口还要改好几轮？",
    }, title, "")).toBeTruthy();
    expect(coverCopyIssue(design, title, "")).toBeUndefined();
  });

  it("accepts longer copy intentionally provided by the user", () => {
    const specified = { ...design, headline: title };
    expect(coverCopyIssue(specified, title, `主标题「${title}」`)).toBeUndefined();
    expect(coverCopyIssue(specified, title, "主标题「同一张图，不同拼豆板」")).toContain("逐字");
  });

  it("separates the designed lettering from article context and applies the chosen visual rules", () => {
    const prompt = composeCoverPrompt(design, frame);
    const [lettering, context] = prompt.split("# 文章语境");
    expect(lettering).toContain("主标题「首版很快，细节很慢」");
    expect(lettering).not.toContain(title);
    expect(context).toContain(title);
    expect(prompt).toContain("metaphor · 配色 warm · 绘制 hand-drawn");
    expect(prompt).toContain(`本张配色 ${design.colors}`);
    expect(prompt).toContain("自然笔触、变化线宽");
    expect(prompt).toContain(design.concept);
    expect(prompt).toContain("1536 × 1024");
    expect(prompt).toContain("中央 88% 宽、56% 高");
    expect(prompt).not.toContain(design.angle);
    expect(prompt).not.toContain("# 参考封面");
  });

  it("expands Baoyu presets, accepts dimension overrides and ignores quoted flags", () => {
    expect(coverDirectionOverrides("主标题「--palette mono」 --style blueprint --palette warm --no-title")).toEqual({
      palette: "warm",
      rendering: "digital",
      text: "none",
    });
    expect(coverDirectionOverrides("--style cinematic --rendering=chalk --palette unknown")).toEqual({
      palette: "duotone",
      rendering: "chalk",
    });
  });

  it("uses the selected text density in validation and rendering", () => {
    const visualOnly = {
      ...design, direction: { ...design.direction, text: "none" as const }, headline: "", subtitle: "", typography: "",
    };
    expect(coverCopyIssue(visualOnly, title, "")).toBeUndefined();
    expect(coverCopyIssue({ ...visualOnly, headline: "封面标题" }, title, "")).toContain("纯视觉");
    expect(composeCoverPrompt(visualOnly, frame)).toContain("画面不出现文字");
    expect(composeCoverPrompt(visualOnly, frame)).not.toContain("# 文字排版");
    const textRich = { ...design, direction: { ...design.direction, text: "text-rich" as const } };
    expect(coverCopyIssue(textRich, title, "")).toContain("标签");
    expect(coverCopyIssue({ ...textRich, tags: ["精度", "取样"] }, title, "")).toBeUndefined();
  });

  it("carries the analyzed appearance into the prompt without inventing a reference file", () => {
    const reference = learnedCoverReference(JSON.stringify({
      background: "#f5f0e6", foreground: "#5d3a3a", accent: "#e07a5f",
      composition: "bottom", fontFamily: "serif", referenceNotes: "暖白纸面、棕色网点、底部字区。",
    }));
    expect(reference).toBeDefined();
    const prompt = composeCoverPrompt({ ...design, referenceTreatment: "右侧拼豆使用参考的棕色网点，标题放在底部。" }, { ...frame, reference });
    expect(prompt).toContain("参考底色 #f5f0e6");
    expect(prompt).toContain("暖白纸面、棕色网点");
    expect(prompt).toContain("标题放在底部");
    expect(prompt).not.toContain("refs/");
    expect(learnedCoverReference("朴素的扁平风格")).toBeUndefined();
  });
});
