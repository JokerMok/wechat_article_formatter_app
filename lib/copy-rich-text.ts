export async function copyRichText(html: string) {
  if (typeof window === "undefined" || typeof navigator === "undefined") return;

  if ("ClipboardItem" in window && navigator.clipboard?.write) {
    try {
      const htmlBlob = new Blob([html], { type: "text/html" });
      const textBlob = new Blob([html.replace(/<[^>]+>/g, "")], { type: "text/plain" });
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": htmlBlob,
          "text/plain": textBlob,
        }),
      ]);
      return;
    } catch {
      // Fall through to selection copy for browser or permission edge cases.
    }
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
  document.execCommand("copy");
  selection?.removeAllRanges();
  container.remove();
}
