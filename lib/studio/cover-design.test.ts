import { describe, expect, it } from "vitest";
import { composeCoverPrompt, coverCopyIssue, coverDesignSchema } from "./cover-design";

const title = "AI 很快复刻了拼豆网站，为什么一个上传窗口还要改好几轮？";
const design = coverDesignSchema.parse({
  angle: "快速搭出的首版，仍需要核对影响体验的细节。",
  headline: "首版很快，细节很慢",
  subtitle: "从拼豆上传窗口说起",
  concept: "一颗移出整齐方格的珊瑚色拼豆，露出它原本占据的位置。",
  composition: "在偏右位置放大拼豆和网格，让标题占据左侧安静的纸面。",
  typography: "黑色粗体主标题和较小的常规字重副标题共用左对齐线。",
  finish: "哑光象牙纸、炭黑网格，珊瑚色拼豆在柔和侧光下带一层影子。",
});

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
    expect(coverCopyIssue(specified, title, `主标题必须逐字写「${title}」`)).toBeUndefined();
  });

  it("sends the designed lettering, subject, and source-frame safe area to the image model", () => {
    const prompt = composeCoverPrompt(design, 900, 383);
    expect(prompt).toContain("主标题「首版很快，细节很慢」");
    expect(prompt).toContain(design.concept);
    expect(prompt).toContain("1536 × 1024");
    expect(prompt).toContain("中央 88% 宽、56% 高");
    expect(prompt).not.toContain(design.angle);
    expect(prompt).not.toContain(title);
  });
});
