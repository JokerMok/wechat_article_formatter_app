import { describe, expect, it } from "vitest";
import { createInitialProjectId, describeAssetUploadStatus } from "./client-state";

describe("unified workspace client-safe state", () => {
  it("uses a stable project id before client storage hydration", () => {
    expect(createInitialProjectId()).toBe("project-pending-hydration");
    expect(createInitialProjectId()).toBe(createInitialProjectId());
  });

  it("keeps failed image uploads visible when the same batch also succeeds", () => {
    expect(
      describeAssetUploadStatus(2, [
        { fileName: "bad.svg", message: "仅支持 PNG、JPEG 和 WebP 图片。" },
        { fileName: "notes.txt", message: "仅支持 PNG、JPEG 和 WebP 图片。" },
      ]),
    ).toBe("图片上传失败：bad.svg、notes.txt（仅支持 PNG、JPEG、WebP）；已上传 2 张图片");
  });

  it("shows file names and supported formats for rejected image data", () => {
    expect(describeAssetUploadStatus(0, [{ fileName: "broken.png", message: "图片文件已损坏或无法识别。" }])).toBe(
      "图片上传失败：broken.png（图片文件已损坏或无法识别。；仅支持 PNG、JPEG、WebP）",
    );
  });
});
