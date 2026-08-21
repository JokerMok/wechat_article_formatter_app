import { describe, expect, it } from "vitest";
import { normalizeCropParams, validateImageBlob } from "./validation";

function imageBlob(bytes: number[], type: string) {
  return new Blob([new Uint8Array(bytes)], { type });
}

function base64Bytes(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

const validPng = base64Bytes("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=");
const validJpeg = base64Bytes(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AYf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/Aaf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z"
);
const validWebp = base64Bytes("UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAgA0JaQAA3AA/vv9UAA=");

describe("asset image validation", () => {
  it("accepts png, jpeg, and webp images by signature", async () => {
    await expect(validateImageBlob(new Blob([validPng], { type: "image/png" }))).resolves.toMatchObject({
      ok: true,
      value: { mimeType: "image/png" },
    });
    await expect(validateImageBlob(new Blob([validJpeg], { type: "image/jpeg" }))).resolves.toMatchObject({
      ok: true,
      value: { mimeType: "image/jpeg" },
    });
    await expect(validateImageBlob(new Blob([validWebp], { type: "image/webp" }))).resolves.toMatchObject({
      ok: true,
      value: { mimeType: "image/webp" },
    });
  });

  it("rejects truncated or structurally damaged image fixtures", async () => {
    const truncatedPng = validPng.slice(0, -12);
    const damagedPngSignature = new Uint8Array(validPng);
    const damagedJpeg = new Uint8Array(validJpeg.slice(0, -2));
    const damagedWebp = validWebp.slice(0, -1);
    damagedPngSignature[4] = 0x00;

    await expect(validateImageBlob(new Blob([truncatedPng], { type: "image/png" }))).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid_image_data" },
    });
    await expect(validateImageBlob(new Blob([damagedPngSignature], { type: "image/png" }))).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid_image_data" },
    });
    await expect(validateImageBlob(new Blob([damagedJpeg], { type: "image/jpeg" }))).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid_image_data" },
    });
    await expect(validateImageBlob(new Blob([damagedWebp], { type: "image/webp" }))).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid_image_data" },
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
    expect(() => normalizeCropParams({ x: Number.NaN, y: 0, width: 100, height: 100 }, { width: 640, height: 480 })).toThrow(
      "crop_out_of_bounds"
    );
    expect(() =>
      normalizeCropParams({ x: 0, y: 0, width: Number.POSITIVE_INFINITY, height: 100 }, { width: 640, height: 480 })
    ).toThrow("crop_out_of_bounds");
  });
});
