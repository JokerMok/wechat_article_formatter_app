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
    await copyRichText(html);

    expect(write).toHaveBeenCalledOnce();
    const [items] = write.mock.calls[0];
    const item = items[0] as MockClipboardItem;
    expect(item.types).toEqual(["text/html", "text/plain"]);
    await expect(item.getType("text/html").then((blob) => blob.text())).resolves.toBe(html);
  });
});
