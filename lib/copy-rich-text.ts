export type CopyRichTextResult = {
  ok: boolean;
  method: "clipboard-write" | "selection" | "noop";
};

function htmlToPlainText(html: string) {
  const text = html
    .replace(/<img\b[^>]*\balt=(["'])(.*?)\1[^>]*>/gi, "$2")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|section|div|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (typeof document === "undefined") return text;
  const container = document.createElement("textarea");
  container.innerHTML = text;
  return container.value;
}

function copySelection(text: string, html?: string) {
  if (typeof document === "undefined" || typeof document.execCommand !== "function") return false;
  const selection = window.getSelection();
  if (!selection) return false;
  const focused = document.activeElement as HTMLElement | null;
  const ranges = Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange());
  const container = document.createElement("div");
  container.contentEditable = "true";
  container.tabIndex = -1;
  Object.assign(container.style, {
    position: "fixed", left: "0", top: "0", width: "1px", height: "1px",
    opacity: "0", overflow: "hidden", pointerEvents: "none",
  });
  if (html === undefined) container.textContent = text;
  else container.innerHTML = html;
  // Modal dialogs make the rest of the document inert, including a body-level copy target.
  const host = focused?.closest("dialog[open]") ?? document.querySelector("dialog[open]") ?? document.body;
  let populated = false;
  const onCopy = (event: ClipboardEvent) => {
    if (!event.clipboardData) return;
    try {
      if (html !== undefined) event.clipboardData.setData("text/html", html);
      event.clipboardData.setData("text/plain", text);
      event.preventDefault();
      populated = true;
    } catch { /* Keep failure visible to the caller. */ }
  };
  try {
    host.appendChild(container);
    container.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(container);
    selection.removeAllRanges();
    selection.addRange(range);
    container.addEventListener("copy", onCopy);
    return document.execCommand("copy") && populated;
  } catch {
    return false;
  } finally {
    container.removeEventListener("copy", onCopy);
    container.remove();
    focused?.focus({ preventScroll: true });
    selection.removeAllRanges();
    for (const range of ranges) selection.addRange(range);
  }
}

export async function copyPlainText(text: string): Promise<boolean> {
  if (!text || typeof window === "undefined" || typeof navigator === "undefined") return false;
  if (copySelection(text)) return true;
  if (!navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function copyRichText(html: string): Promise<CopyRichTextResult> {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { ok: false, method: "noop" };
  }

  const text = htmlToPlainText(html);
  // Run while the click still grants clipboard access, including in Safari.
  if (copySelection(text, html)) return { ok: true, method: "selection" };

  if ("ClipboardItem" in window && navigator.clipboard?.write) {
    try {
      const htmlBlob = new Blob([html], { type: "text/html" });
      const textBlob = new Blob([text], { type: "text/plain" });
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": htmlBlob,
          "text/plain": textBlob,
        }),
      ]);
      return { ok: true, method: "clipboard-write" };
    } catch {
      return { ok: false, method: "noop" };
    }
  }

  return { ok: false, method: "noop" };
}
