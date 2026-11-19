import { afterEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
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

  it("copies inside the active modal during the user gesture and restores focus", async () => {
    const write = vi.fn(async () => {
      throw new Error("denied");
    });
    const dom = new JSDOM('<dialog open><button id="copy">Copy</button></dialog>');
    const doc = dom.window.document;
    const button = doc.querySelector<HTMLButtonElement>("#copy")!;
    button.focus();
    const values: Record<string, string> = {};
    Object.assign(doc, {
      execCommand: () => {
        expect(doc.activeElement?.closest("dialog")).toBe(doc.querySelector("dialog"));
        const event = new dom.window.Event("copy", { bubbles: true, cancelable: true });
        Object.defineProperty(event, "clipboardData", {
          value: { setData: (type: string, value: string) => { values[type] = value; } },
        });
        doc.activeElement!.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
        return true;
      },
    });
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", doc);
    vi.stubGlobal("navigator", { clipboard: { write } });
    try {
      const html = '<section><p>A &amp; B</p><img src="data:image/png;base64,abc" alt="Image alt" /></section>';
      expect(await copyRichText(html)).toEqual({ ok: true, method: "selection" });
      expect(values).toEqual({ "text/html": html, "text/plain": "A & B\nImage alt" });
      expect(write).not.toHaveBeenCalled();
      expect(doc.activeElement).toBe(button);
      expect(doc.querySelector('[contenteditable="true"]')).toBeNull();
    } finally {
      dom.window.close();
    }
  });

  it("rejects an empty selection copy even when execCommand returns true", async () => {
    const dom = new JSDOM("<button>Copy</button>");
    Object.assign(dom.window.document, { execCommand: () => true });
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("navigator", {});
    try {
      expect(await copyRichText("<p>Not copied</p>")).toEqual({ ok: false, method: "noop" });
      expect(dom.window.document.querySelector('[contenteditable="true"]')).toBeNull();
    } finally {
      dom.window.close();
    }
  });
});
