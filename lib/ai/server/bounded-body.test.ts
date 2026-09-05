import { afterEach, describe, expect, it, vi } from "vitest";
import { readBoundedBody } from "./bounded-body";

function streamRequest(body: ReadableStream<Uint8Array>, signal?: AbortSignal, headers?: HeadersInit) {
  return new Request("http://localhost/api/ai/analyze", { method: "POST", body, signal, headers, duplex: "half" } as RequestInit);
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("readBoundedBody", () => {
  it("handles absent bodies without bypassing cancellation or the declared size limit", async () => {
    vi.useFakeTimers();
    const url = "http://localhost/api/ai/analyze";
    await expect(readBoundedBody(new Request(url, { method: "POST" }), 100)).resolves.toBe("");
    await expect(readBoundedBody(new Request(url, { method: "POST", headers: { "content-length": "101" } }), 100))
      .rejects.toMatchObject({ status: 413 });
    const caller = new AbortController();
    caller.abort();
    await expect(readBoundedBody(new Request(url, { method: "POST", signal: caller.signal }), 100))
      .rejects.toMatchObject({ code: "AI_ABORTED" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("decodes UTF-8 across chunks and accepts the exact byte limit", async () => {
    vi.useFakeTimers();
    const bytes = new TextEncoder().encode("\u4e2d\u6587");
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(bytes.slice(0, 2));
      controller.enqueue(bytes.slice(2));
      controller.close();
    } });
    await expect(readBoundedBody(streamRequest(body), bytes.length)).resolves.toBe("\u4e2d\u6587");
    expect(body.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([undefined, "1"])("counts actual bytes with content-length=%s and cancels oversized input", async (length) => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode("\u4e2d")); }, cancel });
    await expect(readBoundedBody(streamRequest(body, undefined, length ? { "content-length": length } : undefined), 2))
      .rejects.toMatchObject({ code: "AI_INVALID_REQUEST", status: 413 });
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });

  it("cancels a declared oversized body without waiting for data", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    await expect(readBoundedBody(streamRequest(body, undefined, { "content-length": "100" }), 2))
      .rejects.toMatchObject({ status: 413 });
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });

  it("expires after five seconds even if stream cancellation never settles", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => new Promise<void>(() => undefined));
    const body = new ReadableStream<Uint8Array>({ cancel });
    const result = readBoundedBody(streamRequest(body), 100).catch((error) => error);
    await vi.advanceTimersByTimeAsync(4999);
    expect(cancel).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toMatchObject({ code: "AI_TIMEOUT", status: 504 });
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not reset the deadline when another chunk arrives", async () => {
    vi.useFakeTimers();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start(value) { controller = value; }, cancel });
    const result = readBoundedBody(streamRequest(body), 100).catch((error) => error);
    await vi.advanceTimersByTimeAsync(4000);
    controller.enqueue(new TextEncoder().encode("{"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(await result).toMatchObject({ code: "AI_TIMEOUT" });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each([true, false])("handles caller cancellation (pre-cancelled=%s) and cleans up", async (preCancelled) => {
    vi.useFakeTimers();
    const caller = new AbortController();
    const cancel = vi.fn(() => new Promise<void>(() => undefined));
    const body = new ReadableStream<Uint8Array>({ cancel });
    if (preCancelled) caller.abort();
    const request = streamRequest(body, caller.signal);
    const removeListener = vi.spyOn(request.signal, "removeEventListener");
    const result = readBoundedBody(request, 100).catch((error) => error);
    if (!preCancelled) caller.abort();
    expect(await result).toMatchObject({ code: "AI_ABORTED", retryable: false });
    expect(cancel).toHaveBeenCalledOnce();
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(body.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("releases the reader and timer when the stream errors", async () => {
    vi.useFakeTimers();
    const failure = new Error("fixture read error");
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.error(failure); } });
    await expect(readBoundedBody(streamRequest(body), 100)).rejects.toBe(failure);
    expect(body.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
