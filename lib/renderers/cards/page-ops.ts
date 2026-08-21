import type { CardImagePlacement, CardLayoutPage, CardLayoutResult } from "./types";

type ImageMetadata = {
  images?: Array<CardImagePlacement & { imageId: string }>;
};

export function splitCardImagePageAfterElement(result: CardLayoutResult, pageId: string, elementId: string): CardLayoutResult {
  const pages = result.pages.flatMap((page) => {
    if (page.id !== pageId) return [page];
    const index = page.nodes.findIndex((node) => node.id === elementId);
    if (index < 0 || index >= page.nodes.length - 1) return [page];
    const first = clonePage({ ...page, nodes: page.nodes.slice(0, index + 1), manual: true });
    const second = clonePage({ ...page, id: `${page.id}-split`, nodes: page.nodes.slice(index + 1), manual: true, locked: false });
    return [first, second];
  });
  return renumber({ ...result, pages });
}

export function mergeAdjacentCardPages(result: CardLayoutResult, firstPageId: string): CardLayoutResult {
  const index = result.pages.findIndex((page) => page.id === firstPageId);
  if (index < 0 || index >= result.pages.length - 1) return result;
  const first = result.pages[index];
  const second = result.pages[index + 1];
  if (first.locked || second.locked) return result;
  const merged = clonePage({
    ...first,
    nodes: [...first.nodes, ...second.nodes].sort((left, right) => left.sourceIndex - right.sourceIndex),
    manual: true,
  });
  const pages = [...result.pages.slice(0, index), merged, ...result.pages.slice(index + 2)];
  return renumber({ ...result, pages });
}

export function moveCardImagePage(result: CardLayoutResult, pageId: string, toIndex: number): CardLayoutResult {
  const fromIndex = result.pages.findIndex((page) => page.id === pageId);
  if (fromIndex < 0) return result;
  const pages = result.pages.map((page) => clonePage(page));
  const [page] = pages.splice(fromIndex, 1);
  pages.splice(Math.max(0, Math.min(toIndex, pages.length)), 0, page);
  return renumber({ ...result, pages });
}

export function lockCardImagePage(result: CardLayoutResult, pageId: string, metadata: ImageMetadata = {}): CardLayoutResult {
  const pages = result.pages.map((page) => {
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
  return renumber({ ...result, pages });
}

function renumber(result: CardLayoutResult): CardLayoutResult {
  const totalPages = result.pages.length;
  const pages = result.pages.map((page, index) => ({ ...page, pageNumber: index + 1, totalPages }));
  return { ...result, pages, overflow: pages.flatMap((page) => page.overflow) };
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
