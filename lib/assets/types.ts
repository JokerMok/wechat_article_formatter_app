export type SupportedImageMimeType = "image/png" | "image/jpeg" | "image/webp";

export type ImageValidationErrorCode = "file_too_large" | "unsupported_type" | "invalid_image_data";

export type ImageValidationError = {
  code: ImageValidationErrorCode;
  message: string;
};

export type ImageValidationSuccess = {
  mimeType: SupportedImageMimeType;
  byteLength: number;
  dimensions: ImageDimensions;
};

export type ImageValidationResult =
  | { ok: true; value: ImageValidationSuccess }
  | { ok: false; error: ImageValidationError };

export type CropParams = {
  x: number;
  y: number;
  width: number;
  height: number;
  unit: "pixel";
};

export type ImageDimensions = {
  width: number;
  height: number;
};

export type CropParamsInput = Partial<Omit<CropParams, "unit">> & {
  unit?: "pixel";
};
