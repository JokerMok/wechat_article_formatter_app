import { describe, expect, it } from "vitest";
import { normalizeCropParams, validateImageBlob } from "./validation";

function imageBlob(bytes: number[], type: string) {
  return new Blob([new Uint8Array(bytes)], { type });
}

describe("asset image validation", () => {
  it("accepts png, jpeg, and webp images by signature", async () => {
    await expect(validateImageBlob(imageBlob([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "image/png"))).resolves.toMatchObject({
      ok: true,
      value: { mimeType: "image/png" },
    });
    await expect(validateImageBlob(imageBlob([0xff, 0xd8, 0xff, 0xe0], "image/jpeg"))).resolves.toMatchObject({
      ok: true,
      value: { mimeType: "image/jpeg" },
    });
    await expect(
      validateImageBlob(imageBlob([0x52, 0x49, 0x46, 0x46, 1, 0, 0, 0, 0x57, 0x45, 0x42, 0x50], "image/webp"))
    ).resolves.toMatchObject({
      ok: true,
      value: { mimeType: "image/webp" },
    });
  });

  it("rejects corrupted, unsupported, and oversized images without accepting the declared type alone", async () => {
    await expect(validateImageBlob(imageBlob([1, 2, 3, 4], "image/png"))).resolves.toEqual({
      ok: false,
      error: { code: "invalid_image_data", message: "图片文件已损坏或无法识别。" },
    });
    await expect(validateImageBlob(new Blob(["<svg />"], { type: "image/svg+xml" }))).resolves.toMatchObject({
      ok: false,
      error: { code: "unsupported_type" },
    });
    await expect(validateImageBlob(new Blob([new Uint8Array(20 * 1024 * 1024 + 1)], { type: "image/png" }))).resolves.toMatchObject({
      ok: false,
      error: { code: "file_too_large" },
    });
  });

  it("normalizes bounded crop parameters and rejects invalid crop rectangles", () => {
    expect(normalizeCropParams({ x: 10.4, y: 20.6, width: 300.2, height: 200.8 }, { width: 640, height: 480 })).toEqual({
      x: 10,
      y: 21,
      width: 300,
      height: 201,
      unit: "pixel",
    });
    expect(() => normalizeCropParams({ x: -1, y: 0, width: 100, height: 100 }, { width: 640, height: 480 })).toThrow(
      "crop_out_of_bounds"
    );
    expect(() => normalizeCropParams({ x: 500, y: 0, width: 200, height: 100 }, { width: 640, height: 480 })).toThrow(
      "crop_out_of_bounds"
    );
  });
});
