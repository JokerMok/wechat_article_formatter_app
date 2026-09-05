import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";

// A serializable syntax tree shared by parsing and rendering. Raw HTML is never executed.
export type MarkdownNode = {
  type: string;
  value?: string;
  depth?: number;
  url?: string;
  alt?: string;
  title?: string | null;
  identifier?: string;
  ordered?: boolean;
  start?: number | null;
  checked?: boolean | null;
  lang?: string | null;
  children?: MarkdownNode[];
  position?: { start: { line: number; offset?: number }; end: { line: number; offset?: number } };
};

const parser = unified().use(remarkParse).use(remarkGfm);
export function markdownTree(value: string): MarkdownNode {
  return parser.parse(value) as MarkdownNode;
}

export function markdownPlainText(node: MarkdownNode): string {
  if (node.type === "image" || node.type === "imageReference") return node.alt ?? "";
  if (node.type === "break") return "\n";
  if (node.type === "definition") return "";
  if (node.value !== undefined) return node.value;
  const separator = ["root", "blockquote", "list", "listItem", "table"].includes(node.type) ? "\n" : node.type === "tableRow" ? " | " : "";
  return (node.children ?? []).map(markdownPlainText).join(separator);
}

export function escapeMarkup(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function safeLink(value: string) {
  return /^(https?:\/\/|mailto:|#)/i.test(value.trim()) && !/[\u0000-\u0020]/.test(value) ? value : undefined;
}

/** Safe inline-styled HTML: no model-produced markup, scripts or arbitrary attributes. */
export function renderMarkdown(value: string, accent = "#963d3a", inline = false): string {
  const tree = markdownTree(value);
  const definitions = new Map<string, MarkdownNode>();
  const index = (node: MarkdownNode) => { if (node.type === "definition" && node.identifier) definitions.set(node.identifier, node); node.children?.forEach(index); };
  index(tree);
  const render = (node: MarkdownNode): string => {
    const children = () => (node.children ?? []).map(render).join("");
    switch (node.type) {
      case "root": return children();
      case "definition": return "";
      case "text": case "html": return escapeMarkup(node.value ?? "").replace(/\n/g, "<br>");
      case "break": return "<br>";
      case "strong": return `<strong style="font-weight:700;color:${escapeMarkup(accent)}">${children()}</strong>`;
      case "emphasis": return `<em>${children()}</em>`;
      case "delete": return `<del>${children()}</del>`;
      case "inlineCode": return `<code style="font-family:monospace;background:#f1f3f4;padding:1px 4px;white-space:pre-wrap">${escapeMarkup(node.value ?? "")}</code>`;
      case "link": case "linkReference": {
        const href = safeLink(node.url ?? definitions.get(node.identifier ?? "")?.url ?? "");
        return href ? `<a href="${escapeMarkup(href)}" style="color:${escapeMarkup(accent)};text-decoration:underline">${children()}</a>` : children();
      }
      case "image": case "imageReference": {
        const src = node.url ?? definitions.get(node.identifier ?? "")?.url ?? "";
        return /^https?:\/\//i.test(src) ? `<img src="${escapeMarkup(src)}" alt="${escapeMarkup(node.alt ?? "")}" style="max-width:100%;height:auto">` : escapeMarkup(node.alt ?? "");
      }
      case "heading": return children();
      case "paragraph": return inline ? children() : `<p style="margin:0 0 8px;line-height:inherit">${children()}</p>`;
      case "blockquote": return `<blockquote style="margin:12px 0;padding:8px 16px;border-left:3px solid ${escapeMarkup(accent)}">${children()}</blockquote>`;
      case "list": {
        const tag = node.ordered ? "ol" : "ul";
        return `<${tag}${node.ordered ? ` start="${node.start ?? 1}"` : ""} style="margin:8px 0;padding-left:1.6em;list-style-type:${node.ordered ? "decimal" : "disc"}">${children()}</${tag}>`;
      }
      case "listItem": return `<li style="margin:6px 0;line-height:inherit">${node.checked === null || node.checked === undefined ? "" : node.checked ? "☑ " : "☐ "}${children()}</li>`;
      case "table": return `<table style="width:100%;border-collapse:collapse;font-size:14px;table-layout:fixed"><tbody>${children()}</tbody></table>`;
      case "tableRow": return `<tr>${children()}</tr>`;
      case "tableCell": return `<td style="padding:8px;border:1px solid #d5dbd8;overflow-wrap:anywhere">${children()}</td>`;
      case "code": return `<pre style="white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.7 monospace;background:#f4f6f5;padding:16px">${escapeMarkup(node.value ?? "")}</pre>`;
      case "thematicBreak": return `<hr style="border:0;border-top:1px solid #d5dbd8;margin:24px 0">`;
      default: return children() || escapeMarkup(node.value ?? "");
    }
  };
  return render(tree);
}
