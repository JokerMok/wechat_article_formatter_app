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
  return bytes.length >= 8 && bytesEqual(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
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

function readUint32Be(bytes: Uint8Array, offset: number) {
  return ((bytes[offset] ?? 0) * 0x1000000 +
    (bytes[offset + 1] ?? 0) * 0x10000 +
    (bytes[offset + 2] ?? 0) * 0x100 +
    (bytes[offset + 3] ?? 0)) >>> 0;
}

function readUint32Le(bytes: Uint8Array, offset: number) {
  return (
    ((bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16) | ((bytes[offset + 3] ?? 0) << 24)) >>> 0
  );
}

function readUint24Le(bytes: Uint8Array, offset: number) {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16);
}

function bytesEqual(bytes: Uint8Array, offset: number, expected: number[]) {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function pngCrc(bytes: Uint8Array, start: number, end: number) {
  let crc = 0xffffffff;
  for (let offset = start; offset < end; offset += 1) {
    crc ^= bytes[offset] ?? 0;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function hasValidPngStructure(bytes: Uint8Array) {
  if (!matchesPng(bytes)) {
    return false;
  }

  let offset = 8;
  let hasHeader = false;
  let hasImageData = false;
  let hasEnd = false;

  while (offset + 12 <= bytes.length) {
    const dataLength = readUint32Be(bytes, offset);
    const dataStart = offset + 8;
    const dataEnd = dataStart + dataLength;
    const chunkEnd = dataEnd + 4;
    if (dataEnd < dataStart || chunkEnd > bytes.length) {
      return false;
    }

    const chunkType = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    const storedCrc = readUint32Be(bytes, dataEnd);
    if (pngCrc(bytes, offset + 4, dataEnd) !== storedCrc) {
      return false;
    }

    if (!hasHeader && chunkType !== "IHDR") {
      return false;
    }
    if (chunkType === "IHDR") {
      if (hasHeader || dataLength !== 13 || readUint32Be(bytes, dataStart) === 0 || readUint32Be(bytes, dataStart + 4) === 0) {
        return false;
      }
      hasHeader = true;
    } else if (chunkType === "IDAT") {
      hasImageData = true;
    } else if (chunkType === "IEND") {
      if (dataLength !== 0 || !hasHeader || !hasImageData) {
        return false;
      }
      hasEnd = true;
      offset = chunkEnd;
      break;
    }

    offset = chunkEnd;
  }

  return hasEnd && offset === bytes.length;
}

function isJpegFrameMarker(marker: number) {
  return (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
}

function hasValidJpegStructure(bytes: Uint8Array) {
  if (!matchesJpeg(bytes)) {
    return false;
  }

  let offset = 2;
  let hasFrame = false;
  let hasScan = false;
  let hasScanData = false;

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      return false;
    }
    while (bytes[offset] === 0xff) {
      offset += 1;
    }
    if (offset >= bytes.length) {
      return false;
    }

    const marker = bytes[offset] ?? 0;
    offset += 1;
    if (marker === 0xd9) {
      return hasFrame && hasScan && hasScanData && offset === bytes.length;
    }
    if (marker === 0x00 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      return false;
    }
    if (offset + 2 > bytes.length) {
      return false;
    }

    const segmentLength = ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      return false;
    }
    const segmentStart = offset + 2;
    const segmentEnd = offset + segmentLength;

    if (isJpegFrameMarker(marker)) {
      if (segmentLength < 8 || readUint16(bytes, segmentStart + 1) === 0 || readUint16(bytes, segmentStart + 3) === 0) {
        return false;
      }
      hasFrame = true;
    }

    offset = segmentEnd;
    if (marker === 0xda) {
      if (!hasFrame || segmentLength < 8) {
        return false;
      }
      hasScan = true;
      while (offset < bytes.length) {
        if (bytes[offset] !== 0xff) {
          hasScanData = true;
          offset += 1;
          continue;
        }
        const markerOffset = offset;
        offset += 1;
        while (offset < bytes.length && bytes[offset] === 0xff) {
          offset += 1;
        }
        if (offset >= bytes.length) {
          return false;
        }
        const scanMarker = bytes[offset] ?? 0;
        if (scanMarker === 0x00 || (scanMarker >= 0xd0 && scanMarker <= 0xd7)) {
          offset += 1;
          continue;
        }
        offset = markerOffset;
        break;
      }
    }
  }

  return false;
}

function hasValidWebpStructure(bytes: Uint8Array) {
  if (!matchesWebp(bytes) || readUint32Le(bytes, 4) !== bytes.length - 8) {
    return false;
  }

  let offset = 12;
  let hasFrameChunk = false;
  while (offset + 8 <= bytes.length) {
    const chunkType = String.fromCharCode(...bytes.slice(offset, offset + 4));
    const chunkLength = readUint32Le(bytes, offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + chunkLength;
    const chunkEnd = dataEnd + (chunkLength % 2);
    if (dataEnd < dataStart || chunkEnd > bytes.length) {
      return false;
    }

    if (chunkType === "VP8 ") {
      if (chunkLength < 11 || !bytesEqual(bytes, dataStart + 3, [0x9d, 0x01, 0x2a]) || readUint16Le(bytes, dataStart + 6) === 0 || readUint16Le(bytes, dataStart + 8) === 0) {
        return false;
      }
      hasFrameChunk = true;
    } else if (chunkType === "VP8L") {
      if (chunkLength < 6 || bytes[dataStart] !== 0x2f) {
        return false;
      }
      hasFrameChunk = true;
    } else if (chunkType === "VP8X") {
      if (chunkLength < 10) {
        return false;
      }
    }

    offset = chunkEnd;
  }

  return hasFrameChunk && offset === bytes.length;
}

function readUint16(bytes: Uint8Array, offset: number) {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function readUint16Le(bytes: Uint8Array, offset: number) {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function hasValidImageStructure(type: SupportedImageMimeType, bytes: Uint8Array) {
  if (type === "image/png") {
    return hasValidPngStructure(bytes);
  }
  if (type === "image/jpeg") {
    return hasValidJpegStructure(bytes);
  }
  return hasValidWebpStructure(bytes);
}

function readPngDimensions(bytes: Uint8Array): ImageDimensions {
  return {
    width: readUint32Be(bytes, 16),
    height: readUint32Be(bytes, 20),
  };
}

function readJpegDimensions(bytes: Uint8Array): ImageDimensions | undefined {
  let offset = 2;

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      return undefined;
    }
    while (bytes[offset] === 0xff) {
      offset += 1;
    }
    if (offset >= bytes.length) {
      return undefined;
    }

    const marker = bytes[offset] ?? 0;
    offset += 1;
    if (marker === 0xd9) {
      return undefined;
    }
    if (marker === 0x00 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      return undefined;
    }
    if (offset + 2 > bytes.length) {
      return undefined;
    }

    const segmentLength = readUint16(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      return undefined;
    }
    const segmentStart = offset + 2;
    if (isJpegFrameMarker(marker)) {
      return {
        width: readUint16(bytes, segmentStart + 3),
        height: readUint16(bytes, segmentStart + 1),
      };
    }

    offset += segmentLength;
  }

  return undefined;
}

function readWebpDimensions(bytes: Uint8Array): ImageDimensions | undefined {
  let offset = 12;

  while (offset + 8 <= bytes.length) {
    const chunkType = String.fromCharCode(...bytes.slice(offset, offset + 4));
    const chunkLength = readUint32Le(bytes, offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + chunkLength;
    const chunkEnd = dataEnd + (chunkLength % 2);
    if (dataEnd < dataStart || chunkEnd > bytes.length) {
      return undefined;
    }

    if (chunkType === "VP8 ") {
      return {
        width: readUint16Le(bytes, dataStart + 6) & 0x3fff,
        height: readUint16Le(bytes, dataStart + 8) & 0x3fff,
      };
    }
    if (chunkType === "VP8L") {
      const b1 = bytes[dataStart + 1] ?? 0;
      const b2 = bytes[dataStart + 2] ?? 0;
      const b3 = bytes[dataStart + 3] ?? 0;
      const b4 = bytes[dataStart + 4] ?? 0;
      return {
        width: 1 + (((b2 & 0x3f) << 8) | b1),
        height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)),
      };
    }
    if (chunkType === "VP8X") {
      return {
        width: readUint24Le(bytes, dataStart + 4) + 1,
        height: readUint24Le(bytes, dataStart + 7) + 1,
      };
    }

    offset = chunkEnd;
  }

  return undefined;
}

function readImageDimensions(type: SupportedImageMimeType, bytes: Uint8Array): ImageDimensions | undefined {
  if (type === "image/png") {
    return readPngDimensions(bytes);
  }
  if (type === "image/jpeg") {
    return readJpegDimensions(bytes);
  }
  return readWebpDimensions(bytes);
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

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const detectedType = detectMimeType(bytes);
  if (!detectedType || !hasValidImageStructure(detectedType, bytes)) {
    return {
      ok: false,
      error: { code: "invalid_image_data", message: "图片文件已损坏或无法识别。" },
    };
  }

  const dimensions = readImageDimensions(detectedType, bytes);
  if (!dimensions || !Number.isFinite(dimensions.width) || !Number.isFinite(dimensions.height) || dimensions.width <= 0 || dimensions.height <= 0) {
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
      dimensions,
    },
  };
}

export function normalizeCropParams(input: CropParamsInput, dimensions: ImageDimensions): CropParams {
  if (!Number.isFinite(dimensions.width) || !Number.isFinite(dimensions.height) || dimensions.width <= 0 || dimensions.height <= 0) {
    throw new Error("crop_out_of_bounds");
  }

  const readBoundedInteger = (value: number | undefined, fallback: number) => {
    const next = value ?? fallback;
    if (!Number.isFinite(next)) {
      throw new Error("crop_out_of_bounds");
    }
    return Math.round(next);
  };

  const crop = {
    x: readBoundedInteger(input.x, 0),
    y: readBoundedInteger(input.y, 0),
    width: readBoundedInteger(input.width, dimensions.width),
    height: readBoundedInteger(input.height, dimensions.height),
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
