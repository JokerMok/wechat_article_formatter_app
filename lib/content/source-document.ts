import type { SourceDocument, UnifiedArticleBlock, ArticleContentParseOptions } from "./types";
import { markdownPlainText, markdownTree, type MarkdownNode } from "./markdown";

export function parseSyntaxDocument(raw: string, options: ArticleContentParseOptions = {}): SourceDocument {
  const root = markdownTree(raw);
  const blocks: UnifiedArticleBlock[] = [];
  const warnings: SourceDocument["warnings"] = [];
  const definitions = (root.children ?? []).filter((node) => node.type === "definition");
  const definitionText = definitions.map((node) => raw.slice(node.position?.start.offset, node.position?.end.offset)).join("\n");
  const add = (node: MarkdownNode) => {
    if (node.type === "definition") return;
    const position = node.position!;
    const sourceText = raw.slice(position.start.offset ?? 0, position.end.offset ?? raw.length);
    const plainText = markdownPlainText(node);
    if (node.type === "paragraph" && !sourceText.trim()) return;
    let type: UnifiedArticleBlock["type"] = "paragraph";
    if (node.type === "heading") type = node.depth === 1 ? "title" : node.depth === 2 ? "section" : "subsection";
    if (node.type === "blockquote") type = "quote";
    if (node.type === "list") type = "list";
    if (node.type === "code") type = "code";
    if (node.type === "table") type = "table";
    if (node.type === "thematicBreak") type = "divider";
    if (node.type === "image" || node.type === "imageReference") type = "image";
    if (/^<!--\s*(?:pagebreak|分页)\s*-->$/i.test(sourceText.trim())) type = "pageBreak";
    if (node.type === "html" && type !== "pageBreak") warnings.push({ code: "unsupported_block", message: "HTML 已作为文本保留，不执行其中的标签；建议粘贴 Markdown 或纯文本。" });
    if (node.type === "paragraph" && /^(图片|配图|图示|插图|此处插入|image)[:：]/i.test(sourceText)) type = "image";
    const text = node.type === "heading" ? sourceText.replace(/^\s*#{1,6}\s+/, "").replace(/\s+#+\s*$/, "").replace(/\n[=-]+\s*$/, "") : type === "quote" ? sourceText.replace(/^\s*>\s?/gm, "") : type === "code" ? node.value ?? "" : type === "image" ? node.alt ?? sourceText : sourceText;
    const common = {
      id: `block-${blocks.length + 1}`, type, text, plainText,
      markdown: (node.type === "imageReference" ? `![${node.alt ?? ""}](${definitions.find((definition) => definition.identifier === node.identifier)?.url ?? ""})` : sourceText) + (definitionText && /\]\s*(?:\[|[.,，。\s]|$)/.test(sourceText) ? `\n\n${definitionText}` : ""),
      syntax: "markdown" as const,
      ...(node.depth ? { headingDepth: node.depth } : {}),
      source: { startLine: position.start.line, endLine: position.end.line, startOffset: position.start.offset ?? 0, endOffset: position.end.offset ?? raw.length, sourceText },
    };
    if (type === "list") {
      blocks.push({ ...common, type, items: (node.children ?? []).map(markdownPlainText), ordered: Boolean(node.ordered), listStart: node.start ?? 1 });
    } else if (type === "code") blocks.push({ ...common, type, language: node.lang ?? undefined });
    else blocks.push(common as UnifiedArticleBlock);
  };
  for (const node of root.children ?? []) {
    // Split inline images at their real positions instead of losing all but the first image.
    if (node.type === "paragraph" && node.children?.some((child) => child.type === "image" || child.type === "imageReference")) {
      let group: MarkdownNode[] = [];
      const flush = () => { if (group.length) { add({ type: "paragraph", children: group, position: { start: group[0].position!.start, end: group.at(-1)!.position!.end } }); group = []; } };
      for (const child of node.children) {
        if (child.type === "image" || child.type === "imageReference") { flush(); add(child); } else group.push(child);
      }
      flush();
    } else add(node);
  }
  let hash = 2166136261;
  for (const char of raw) { hash ^= char.codePointAt(0) ?? 0; hash = Math.imul(hash, 16777619); }
  return {
    schemaVersion: 1, sourceText: raw, sourceFormat: (root.children ?? []).some((node) => node.type !== "paragraph" || node.children?.some((child) => child.type !== "text")) ? "markdown" : "plainText",
    parseMode: options.mode ?? "narrative", sourceRevision: `src-${(hash >>> 0).toString(16).padStart(8, "0")}`,
    title: blocks.find((block) => block.type === "title")?.text,
    blocks, warnings,
    // Exact block anchors. Never claim normalized sentence offsets map onto raw Markdown.
    segments: blocks.filter((block) => block.plainText.trim()).map((block) => ({ id: `${block.id}:segment:1`, blockId: block.id, text: block.plainText, sourceRange: { ...block.source } })),
  };
}
