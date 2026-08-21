import type {
  CropParams,
  CropParamsInput,
  ImageDimensions,
  ImageValidationResult,
  SupportedImageMimeType,
} from "./types";

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const supportedTypes = new Set<SupportedImageMimeType>(["image/png", "image/jpeg", "image/webp"]);

function matchesPng(bytes: Uint8Array) {
  return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

function matchesJpeg(bytes: Uint8Array) {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function matchesWebp(bytes: Uint8Array) {
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

function detectMimeType(bytes: Uint8Array): SupportedImageMimeType | undefined {
  if (matchesPng(bytes)) {
    return "image/png";
  }
  if (matchesJpeg(bytes)) {
    return "image/jpeg";
  }
  if (matchesWebp(bytes)) {
    return "image/webp";
  }
  return undefined;
}

export async function validateImageBlob(blob: Blob): Promise<ImageValidationResult> {
  if (blob.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      error: { code: "file_too_large", message: "图片不能超过 20 MB。" },
    };
  }

  if (blob.type && !supportedTypes.has(blob.type as SupportedImageMimeType)) {
    return {
      ok: false,
      error: { code: "unsupported_type", message: "仅支持 PNG、JPEG 和 WebP 图片。" },
    };
  }

  const header = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const detectedType = detectMimeType(header);
  if (!detectedType) {
    return {
      ok: false,
      error: { code: "invalid_image_data", message: "图片文件已损坏或无法识别。" },
    };
  }

  return {
    ok: true,
    value: {
      mimeType: detectedType,
      byteLength: blob.size,
    },
  };
}

export function normalizeCropParams(input: CropParamsInput, dimensions: ImageDimensions): CropParams {
  const crop = {
    x: Math.round(input.x ?? 0),
    y: Math.round(input.y ?? 0),
    width: Math.round(input.width ?? dimensions.width),
    height: Math.round(input.height ?? dimensions.height),
    unit: "pixel" as const,
  };

  if (
    crop.x < 0 ||
    crop.y < 0 ||
    crop.width <= 0 ||
    crop.height <= 0 ||
    crop.x + crop.width > dimensions.width ||
    crop.y + crop.height > dimensions.height
  ) {
    throw new Error("crop_out_of_bounds");
  }

  return crop;
}
