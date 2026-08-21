export type StorageWriteErrorCode =
  | "storage_unavailable"
  | "quota_exceeded"
  | "permission_denied"
  | "validation_failed"
  | "write_failed";

export class StorageWriteError extends Error {
  readonly code: StorageWriteErrorCode;

  constructor(code: StorageWriteErrorCode, message: string) {
    super(message);
    this.name = "StorageWriteError";
    this.code = code;
  }
}

export function categorizeStorageWriteError(error: unknown): StorageWriteError {
  if (error instanceof StorageWriteError) {
    return error;
  }

  if (error instanceof DOMException) {
    if (error.name === "QuotaExceededError") {
      return new StorageWriteError("quota_exceeded", "本地存储空间不足，未能保存。");
    }
    if (error.name === "SecurityError" || error.name === "NotAllowedError") {
      return new StorageWriteError("permission_denied", "浏览器阻止了本地存储写入。");
    }
  }

  if (error && typeof error === "object" && "name" in error) {
    const name = String(error.name);
    if (name === "DatabaseClosedError" || name === "MissingAPIError" || name === "OpenFailedError") {
      return new StorageWriteError("storage_unavailable", "当前环境无法使用本地存储。");
    }
  }

  return new StorageWriteError("write_failed", "本地保存失败。");
}
