const INITIAL_PROJECT_ID = "project-pending-hydration";
const SUPPORTED_IMAGE_UPLOAD_MESSAGE = "仅支持 PNG、JPEG、WebP";

export type AssetUploadFailure = {
  fileName: string;
  message: string;
};

export function createInitialProjectId() {
  return INITIAL_PROJECT_ID;
}

export function describeAssetUploadStatus(uploadedCount: number, failures: AssetUploadFailure[]) {
  if (!failures.length) return uploadedCount > 0 ? `已上传 ${uploadedCount} 张图片` : "";
  const failedFiles = failures.map((failure) => failure.fileName).join("、");
  const detail = failures
    .map((failure) => normalizeAssetUploadFailureMessage(failure.message))
    .filter((message, index, messages) => messages.indexOf(message) === index)
    .join("；");
  const uploadedStatus = uploadedCount > 0 ? `；已上传 ${uploadedCount} 张图片` : "";
  return `图片上传失败：${failedFiles}（${detail || SUPPORTED_IMAGE_UPLOAD_MESSAGE}）${uploadedStatus}`;
}

function normalizeAssetUploadFailureMessage(message: string) {
  if (!message || message.includes("仅支持 PNG")) return SUPPORTED_IMAGE_UPLOAD_MESSAGE;
  return message.includes(SUPPORTED_IMAGE_UPLOAD_MESSAGE) ? message : `${message}；${SUPPORTED_IMAGE_UPLOAD_MESSAGE}`;
}
