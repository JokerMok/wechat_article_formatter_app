export async function copyRichText(html: string) {
  if (typeof window === "undefined" || typeof navigator === "undefined") return;

  if ("ClipboardItem" in window && navigator.clipboard?.write) {
    const htmlBlob = new Blob([html], { type: "text/html" });
    const textBlob = new Blob([html.replace(/<[^>]+>/g, "")], { type: "text/plain" });
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": htmlBlob,
        "text/plain": textBlob,
      }),
    ]);
    return;
  }

  await navigator.clipboard.writeText(html);
}
