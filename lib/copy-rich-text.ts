export type CopyRichTextResult = {
  ok: boolean;
  method: "clipboard-write" | "selection" | "noop";
};

function htmlToPlainText(html: string) {
  return html
    .replace(/<img\b[^>]*\balt=(["'])(.*?)\1[^>]*>/gi, "$2")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|section|div|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function copyRichText(html: string): Promise<CopyRichTextResult> {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { ok: false, method: "noop" };
  }

  if ("ClipboardItem" in window && navigator.clipboard?.write) {
    try {
      const htmlBlob = new Blob([html], { type: "text/html" });
      const textBlob = new Blob([htmlToPlainText(html)], { type: "text/plain" });
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": htmlBlob,
          "text/plain": textBlob,
        }),
      ]);
      return { ok: true, method: "clipboard-write" };
    } catch {
      // Fall through to selection copy for browser or permission edge cases.
    }
  }

  if (typeof document === "undefined") {
    return { ok: false, method: "noop" };
  }

  const container = document.createElement("div");
  container.setAttribute("contenteditable", "true");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.innerHTML = html;
  document.body.appendChild(container);

  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(container);
  selection?.removeAllRanges();
  selection?.addRange(range);
  const copied = document.execCommand("copy");
  selection?.removeAllRanges();
  container.remove();
  return { ok: copied, method: "selection" };
}
