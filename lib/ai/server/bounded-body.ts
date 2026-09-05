import { ServerAIError } from "./errors";

const BODY_TIMEOUT_MS = 5_000;

export async function readBoundedBody(request: Request, maxBytes: number): Promise<string> {
  const cancelled = () => new ServerAIError("AI_ABORTED", "请求已取消。", false);
  const tooLarge = () => new ServerAIError("AI_INVALID_REQUEST", "请求内容过大，请拆分后重试。", false, 413);
  const contentLength = Number(request.headers.get("content-length"));
  const declaredTooLarge = Number.isFinite(contentLength) && contentLength > maxBytes;
  if (!request.body) {
    if (request.signal.aborted) throw cancelled();
    if (declaredTooLarge) throw tooLarge();
    return "";
  }

  const reader = request.body.getReader();
  const expiresAt = Date.now() + BODY_TIMEOUT_MS;
  let failure: ServerAIError | undefined;
  let cancellationStarted = false;
  const cancelReader = (reason: unknown) => {
    if (cancellationStarted) return;
    cancellationStarted = true;
    // A stream's cancel hook may never settle; it must not extend the deadline.
    void reader.cancel(reason).catch(() => undefined);
  };
  let rejectBoundary!: (error: ServerAIError) => void;
  const boundary = new Promise<never>((_, reject) => {
    rejectBoundary = reject;
  });
  const stop = (error: ServerAIError) => {
    if (failure) return;
    failure = error;
    rejectBoundary(error);
    cancelReader(error);
  };
  const timeout = () => stop(new ServerAIError("AI_TIMEOUT", "请求内容读取超时，请重试。", true, 504));
  const cancel = () => stop(cancelled());
  const assertActive = () => {
    if (request.signal.aborted) cancel();
    if (Date.now() >= expiresAt) timeout();
    if (failure) throw failure;
  };
  const timeoutId = setTimeout(timeout, BODY_TIMEOUT_MS);
  request.signal.addEventListener("abort", cancel, { once: true });

  const read = async () => {
    assertActive();
    if (declaredTooLarge) throw tooLarge();
    const decoder = new TextDecoder();
    const chunks: string[] = [];
    let byteLength = 0;
    while (true) {
      assertActive();
      const next = await reader.read();
      assertActive();
      if (next.done) break;
      byteLength += next.value.byteLength;
      if (byteLength > maxBytes) throw tooLarge();
      chunks.push(decoder.decode(next.value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join("");
  };

  try {
    return await Promise.race([read(), boundary]);
  } catch (error) {
    cancelReader(error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
    request.signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}
