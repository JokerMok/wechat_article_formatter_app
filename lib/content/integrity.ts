import type { UnifiedArticleBlock, UnifiedArticleContent } from "./types";

export type SourceIntegrity = {
  ok: boolean;
  missing: string[];
  duplicated: string[];
  changed: string[];
  unexpected: string[];
  reordered: boolean;
};

function signature(block: UnifiedArticleBlock) {
  return JSON.stringify({ type: block.type, text: block.text, markdown: block.markdown,
    plainText: block.plainText, headingDepth: block.headingDepth,
    ...(block.type === "list" ? { items: block.items, ordered: block.ordered, listStart: block.listStart } : {}),
    ...(block.type === "code" ? { language: block.language } : {}),
  });
}

/** Compare actual projected content, not just the planner's self-reported refs. */
export function checkSourceIntegrity(source: UnifiedArticleContent, output: UnifiedArticleContent): SourceIntegrity {
  const expected = source.blocks.filter((block) => block.type !== "pageBreak");
  const actual = output.blocks.filter((block) => block.type !== "pageBreak");
  const byId = new Map<string, UnifiedArticleBlock[]>();
  for (const block of actual) byId.set(block.id, [...(byId.get(block.id) ?? []), block]);
  const ids = new Set(expected.map((block) => block.id));
  const missing = expected.filter((block) => !byId.has(block.id)).map((block) => block.id);
  const duplicated = [...byId].filter(([, blocks]) => blocks.length > 1).map(([id]) => id);
  const changed = expected.filter((block) => byId.has(block.id) && signature(block) !== signature(byId.get(block.id)![0])).map((block) => block.id);
  const unexpected = actual.filter((block) => !ids.has(block.id)).map((block) => block.id);
  const reordered = !missing.length && !duplicated.length && actual.filter((block) => ids.has(block.id)).some((block, index) => block.id !== expected[index]?.id);
  return { ok: !missing.length && !duplicated.length && !changed.length && !unexpected.length && !reordered, missing, duplicated, changed, unexpected, reordered };
}
