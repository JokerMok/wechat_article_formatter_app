import { afterEach, describe, expect, it, vi } from "vitest";
import { copyRichText } from "./copy-rich-text";

class MockClipboardItem {
  readonly types: string[];

  constructor(readonly payload: Record<string, Blob>) {
    this.types = Object.keys(payload);
  }

  getType(type: string) {
    return Promise.resolve(this.payload[type]);
  }
}

describe("copyRichText", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps embedded images in the HTML clipboard payload", async () => {
    const write = vi.fn(async () => undefined);
    vi.stubGlobal("ClipboardItem", MockClipboardItem);
    vi.stubGlobal("window", { ClipboardItem: MockClipboardItem });
    vi.stubGlobal("navigator", { clipboard: { write } });

    const html = '<section><img src="data:image/png;base64,abc123" alt="示例" /></section>';
    const result = await copyRichText(html);

    expect(write).toHaveBeenCalledOnce();
    expect(result).toEqual({ ok: true, method: "clipboard-write" });
    const [items] = write.mock.calls[0];
    const item = items[0] as MockClipboardItem;
    expect(item.types).toEqual(["text/html", "text/plain"]);
    await expect(item.getType("text/html").then((blob) => blob.text())).resolves.toBe(html);
  });

  it("falls back to selection copy when clipboard write is denied", async () => {
    const write = vi.fn(async () => {
      throw new Error("denied");
    });
    const appended: Array<{ remove: () => void }> = [];
    const remove = vi.fn();
    vi.stubGlobal("ClipboardItem", MockClipboardItem);
    vi.stubGlobal("window", {
      ClipboardItem: MockClipboardItem,
      getSelection: () => ({
        removeAllRanges: vi.fn(),
        addRange: vi.fn(),
      }),
    });
    vi.stubGlobal("navigator", { clipboard: { write } });
    vi.stubGlobal("document", {
      createElement: () => ({
        setAttribute: vi.fn(),
        style: {},
        innerHTML: "",
        remove,
      }),
      createRange: () => ({
        selectNodeContents: vi.fn(),
      }),
      body: {
        appendChild: (node: { remove: () => void }) => appended.push(node),
      },
      execCommand: vi.fn(() => true),
    });

    const result = await copyRichText('<section><p>Fallback</p><img src="data:image/png;base64,abc" alt="Image alt" /></section>');

    expect(write).toHaveBeenCalledOnce();
    expect(appended).toHaveLength(1);
    expect(remove).toHaveBeenCalledOnce();
    expect(result).toEqual({ ok: true, method: "selection" });
  });
});
