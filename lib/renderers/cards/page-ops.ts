import type { CardImagePlacement, CardLayoutPage, CardLayoutResult } from "./types";
import { ensureUniqueCardPageIds } from "./layout";

type ImageMetadata = {
  images?: Array<CardImagePlacement & { imageId: string }>;
};

export function splitCardImagePageAfterElement(result: CardLayoutResult, pageId: string, elementId: string): CardLayoutResult {
  const normalized = renumber(result);
  const pages = normalized.pages.flatMap((page) => {
    if (page.id !== pageId) return [page];
    const index = page.nodes.findIndex((node) => node.id === elementId);
    if (index < 0 || index >= page.nodes.length - 1) return [page];
    const first = clonePage({ ...page, nodes: page.nodes.slice(0, index + 1), manual: true });
    const second = clonePage({
      ...page,
      id: nextPageId(`${page.id}-split`, normalized.pages.map((candidate) => candidate.id)),
      nodes: page.nodes.slice(index + 1),
      manual: true,
      locked: false,
    });
    return [first, second];
  });
  return renumber({ ...normalized, pages });
}

export function mergeAdjacentCardPages(result: CardLayoutResult, firstPageId: string): CardLayoutResult {
  const normalized = renumber(result);
  const index = normalized.pages.findIndex((page) => page.id === firstPageId);
  if (index < 0 || index >= normalized.pages.length - 1) return normalized;
  const first = normalized.pages[index];
  const second = normalized.pages[index + 1];
  if (first.locked || second.locked) return normalized;
  const merged = clonePage({
    ...first,
    nodes: [...first.nodes, ...second.nodes].sort((left, right) => left.sourceIndex - right.sourceIndex),
    manual: true,
  });
  const pages = [...normalized.pages.slice(0, index), merged, ...normalized.pages.slice(index + 2)];
  return renumber({ ...normalized, pages });
}

export function moveCardImagePage(result: CardLayoutResult, pageId: string, toIndex: number): CardLayoutResult {
  const normalized = renumber(result);
  const fromIndex = normalized.pages.findIndex((page) => page.id === pageId);
  if (fromIndex < 0) return normalized;
  const pages = normalized.pages.map((page) => clonePage(page));
  const [page] = pages.splice(fromIndex, 1);
  pages.splice(Math.max(0, Math.min(toIndex, pages.length)), 0, page);
  return renumber({ ...normalized, pages });
}

export function lockCardImagePage(result: CardLayoutResult, pageId: string, metadata: ImageMetadata = {}): CardLayoutResult {
  const normalized = renumber(result);
  const pages = normalized.pages.map((page) => {
    if (page.id !== pageId) return clonePage(page);
    const imagesById = new Map((metadata.images ?? []).map((image) => [image.imageId, image]));
    return clonePage({
      ...page,
      locked: true,
      nodes: page.nodes.map((node) => {
        const image = imagesById.get(node.blockId) ?? imagesById.get(node.entryId);
        if (!image || node.kind !== "image") return node;
        return {
          ...node,
          image: {
            ...image,
            alt: node.image?.alt ?? node.text,
          },
        };
      }),
    });
  });
  return renumber({ ...normalized, pages });
}

function renumber(result: CardLayoutResult): CardLayoutResult {
  const pagesWithUniqueIds = ensureUniqueCardPageIds(result.pages);
  const totalPages = pagesWithUniqueIds.length;
  const pages = pagesWithUniqueIds.map((page, index) => ({ ...page, pageNumber: index + 1, totalPages }));
  return { ...result, pages, overflow: pages.flatMap((page) => page.overflow) };
}

function nextPageId(base: string, existingIds: string[]) {
  const used = new Set(existingIds);
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function clonePage(page: CardLayoutPage): CardLayoutPage {
  return {
    ...page,
    nodes: page.nodes.map((node) => ({
      ...node,
      lines: node.lines.map((line) => ({ ...line })),
      image: node.image ? { ...node.image } : undefined,
    })),
    overflow: page.overflow.map((issue) => ({ ...issue })),
  };
}
