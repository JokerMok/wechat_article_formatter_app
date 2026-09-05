import type { UnifiedArticleContent } from "../content";
import { escapeMarkup as escapeHtml, renderMarkdown } from "../content/markdown";

/** Longform is continuous copy, without WeChat's framed theme components. */
export function renderLongformHtml(content: UnifiedArticleContent, images: Record<string, string> = {}): string {
  return content.blocks.map((block) => {
    if (block.type === "pageBreak") return "";
    if (block.type === "divider") return '<hr style="border:0;border-top:1px solid #dedede;margin:28px 0">';
    if (block.type === "image") {
      const url = images[block.id];
      const safe = url && /^(?:https?:|blob:|data:image\/(?:png|jpeg|webp);base64,)/i.test(url);
      return safe ? `<figure style="margin:24px 0"><img src="${escapeHtml(url)}" alt="${escapeHtml(block.text)}" style="max-width:100%;height:auto"><figcaption style="font-size:12px;color:#606060">${escapeHtml(block.text)}</figcaption></figure>` : `<p style="color:#606060">${escapeHtml(block.markdown)}</p>`;
    }
    const html = block.syntax ? renderMarkdown(block.markdown, "#222222", !["quote", "list", "table", "code"].includes(block.type)) : escapeHtml(block.text).replace(/\n/g, "<br>");
    if (block.type === "title") return `<h1 style="font-size:24px;line-height:1.45;margin:0 0 28px;text-align:left">${html}</h1>`;
    if (block.type === "section" || block.type === "subsection") {
      const level = Math.min(6, Math.max(2, block.headingDepth ?? (block.type === "section" ? 2 : 3)));
      return `<h${level} style="font-size:${level === 2 ? 19 : 17}px;line-height:1.6;margin:28px 0 12px">${html}</h${level}>`;
    }
    const sectionStart = block.presentation?.sectionStart;
    return `<section style="font-size:16px;line-height:1.85;margin:${sectionStart ? 26 : 0}px 0 18px;overflow-wrap:anywhere">${html}</section>`;
  }).join("");
}
