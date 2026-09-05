import { markdownPublicationText } from "../../content/markdown";
import type { UnifiedArticleBlock, UnifiedArticleContent } from "../../content";
import { createApproximateTextMeasurer } from "./measurement";
import type {
  CardAspectRatio,
  CardCanvasSize,
  CardImagePlacement,
  CardLayoutNode,
  CardLayoutNodeKind,
  CardLayoutOptions,
  CardLayoutPage,
  CardLayoutResult,
  CardOverflowIssue,
  CardSafeArea,
  CardTypography,
  FlowEntry,
  TextMeasurer,
  TextStyle,
} from "./types";

const DEFAULT_FONT_FAMILY =
  "-apple-system, BlinkMacSystemFont, Helvetica Neue, PingFang SC, Hiragino Sans GB, Microsoft YaHei, Arial, sans-serif";

const CANVAS_BY_RATIO: Record<CardAspectRatio, CardCanvasSize> = {
  "3:4": { width: 1080, height: 1440 },
  "9:16": { width: 1080, height: 1920 },
};

const DEFAULT_SAFE_AREA = {
  top: 148,
  right: 84,
  bottom: 150,
  left: 84,
};

const DEFAULT_TYPOGRAPHY: CardTypography = {
  fontFamily: DEFAULT_FONT_FAMILY,
  titleFontSize: 72,
  headingFontSize: 42,
  bodyFontSize: 36,
  focusFontSize: 34,
  lineSpacing: 1.35,
  paragraphSpacing: 38,
  titleSpacing: 54,
};

const DEFAULT_IMAGE_BOX = {
  width: 520,
  height: 320,
};

const BREAK_BEFORE_CHARS = /^[。！？；，、：,.!?;）】」』》〉%％]$/u;

type PageDraft = Omit<CardLayoutPage, "pageNumber" | "totalPages">;

type PositionedPage = PageDraft & {
  anchorIndex: number;
};

export function getCardCanvasSize(aspectRatio: CardAspectRatio = "3:4") {
  return CANVAS_BY_RATIO[aspectRatio];
}

export function getCardSafeArea(aspectRatio: CardAspectRatio = "3:4", options: CardLayoutOptions = {}): CardSafeArea {
  const canvas = getCardCanvasSize(aspectRatio);
  const insets = { ...DEFAULT_SAFE_AREA, ...options.safeArea };
  return {
    ...insets,
    x: insets.left,
    y: insets.top,
    width: canvas.width - insets.left - insets.right,
    height: canvas.height - insets.top - insets.bottom,
  };
}

export function getCardTypography(options: CardLayoutOptions = {}): CardTypography {
  return { ...DEFAULT_TYPOGRAPHY, ...options.typography };
}

export function layoutCardPages(
  source: UnifiedArticleContent,
  measurer: TextMeasurer = createApproximateTextMeasurer(),
  options: CardLayoutOptions = {},
): CardLayoutResult {
  const aspectRatio = options.aspectRatio ?? "3:4";
  const canvas = getCardCanvasSize(aspectRatio);
  const safeArea = getCardSafeArea(aspectRatio, options);
  const typography = getCardTypography(options);
  const maxPages = options.maxPages ?? 1_000;
  const entries = createFlowEntries(source.blocks);
  const lockedPages = (options.lockedPages ?? []).map((page) => clonePage(page, true));
  const lockedReservations = collectPageReservations(lockedPages);
  const lockedEntryIds = new Set(lockedReservations.keys());
  const manualPages = createManualPages(entries, measurer, canvas, safeArea, typography, options)
    .map((page) => ({
      ...page,
      nodes: page.nodes.filter((node) => !lockedEntryIds.has(node.entryId)),
    }))
    .filter((page) => page.nodes.length > 0);
  const manualReservations = collectPageReservations(manualPages);
  const reservedSourceIndexes = [...manualPages, ...lockedPages].flatMap((page) => page.nodes.map((node) => node.sourceIndex));
  const entriesAfterLockedPages = applyPageReservations(entries, lockedReservations);
  const automaticEntries = insertBreaksAroundReservedEntries(
    applyPageReservations(entriesAfterLockedPages, manualReservations),
    reservedSourceIndexes,
  );
  const automaticPages = paginateEntries(automaticEntries, measurer, canvas, safeArea, typography, options, maxPages);
  const positionedPages: PositionedPage[] = [
    ...automaticPages.map((page) => ({ ...page, anchorIndex: minSourceIndex(page) })),
    ...manualPages.map((page) => ({ ...page, anchorIndex: minSourceIndex(page) })),
    ...lockedPages.map((page) => ({ ...page, anchorIndex: minSourceIndex(page), locked: true })),
  ].sort((left, right) => left.anchorIndex - right.anchorIndex || pageSortKey(left.id).localeCompare(pageSortKey(right.id)));

  const pages = numberPages(positionedPages, aspectRatio).map((page) => {
    const overflow = mergeOverflow([...page.overflow, ...detectPageOverflow(page)]);
    return { ...page, overflow };
  });
  const overflow = pages.flatMap((page) => page.overflow);
  return { source, pages, overflow };
}

export function collectLayoutText(result: CardLayoutResult | CardLayoutPage): string {
  const pages = "pages" in result ? result.pages : [result];
  return pages
    .flatMap((page) => page.nodes)
    .sort((left, right) => left.sourceIndex - right.sourceIndex || left.id.localeCompare(right.id))
    .map((node) => node.text)
    .join("");
}

export function detectPageOverflow(page: CardLayoutPage): CardOverflowIssue[] {
  const safeLeft = page.safeArea.x;
  const safeRight = page.safeArea.x + page.safeArea.width;
  const safeTop = page.safeArea.y;
  const safeBottom = page.safeArea.y + page.safeArea.height;
  return page.nodes.flatMap((node) => {
    const issues: CardOverflowIssue[] = [];
    const bounds = nodeBounds(node);
    if (bounds.x < safeLeft) {
      issues.push({ pageId: page.id, nodeId: node.id, type: "horizontal", edge: "left", amount: safeLeft - bounds.x });
    }
    const right = bounds.x + bounds.width;
    if (bounds.y < safeTop) {
      issues.push({ pageId: page.id, nodeId: node.id, type: "vertical", edge: "top", amount: safeTop - bounds.y });
    }
    const bottom = bounds.y + bounds.height;
    if (right > safeRight) {
      issues.push({ pageId: page.id, nodeId: node.id, type: "horizontal", edge: "right", amount: right - safeRight });
    }
    if (bottom > safeBottom) {
      issues.push({ pageId: page.id, nodeId: node.id, type: "vertical", edge: "bottom", amount: bottom - safeBottom });
    }
    return issues;
  });
}

function nodeBounds(node: CardLayoutNode) {
  if (node.kind === "image" && node.image) {
    return { x: node.image.x, y: node.image.y, width: node.image.width, height: node.image.height };
  }
  return { x: node.x, y: node.y, width: node.width, height: node.height };
}

function mergeOverflow(issues: CardOverflowIssue[]) {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.pageId}:${issue.nodeId}:${issue.type}:${issue.edge ?? "unknown"}:${Math.round(issue.amount * 1000)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function createFlowEntries(blocks: UnifiedArticleBlock[]): FlowEntry[] {
  const entries: FlowEntry[] = [];
  blocks.forEach((block, blockIndex) => {
    if (block.type === "divider") return;
    if (block.type === "pageBreak") {
      entries.push({ id: `${block.id}:break`, blockId: block.id, kind: "pageBreak", text: "", sourceIndex: blockIndex * 1_000 });
      return;
    }
    if (block.type === "list" && block.syntax === "markdown") {
      entries.push({ id: block.id, blockId: block.id, kind: "body", text: markdownPublicationText(block.markdown), sourceIndex: blockIndex * 1_000 });
      return;
    }
    if (block.type === "list") {
      block.items.forEach((item, itemIndex) => {
        entries.push({
          id: `${block.id}:item:${itemIndex}`,
          blockId: block.id,
          kind: "body",
          text: block.syntax ? `${block.ordered ? `${(block.listStart ?? 1) + itemIndex}.` : "•"} ${item}` : item,
          sourceIndex: blockIndex * 1_000 + itemIndex,
        });
      });
      return;
    }
    if (block.type === "card") {
      if (block.title) {
        entries.push({
          id: `${block.id}:title`,
          blockId: block.id,
          kind: "heading",
          text: block.title,
          sourceIndex: blockIndex * 1_000,
          keepWithNext: Boolean(block.body),
        });
      }
      entries.push({
        id: `${block.id}:body`,
        blockId: block.id,
        kind: "focus",
        text: block.body,
        sourceIndex: blockIndex * 1_000 + 1,
      });
      return;
    }
    const kind = blockKindToEntryKind(block);
    entries.push({
      id: block.id,
      blockId: block.id,
      kind,
      text: block.syntax === "markdown" && block.type !== "image" && block.type !== "code" ? markdownPublicationText(block.markdown) : block.plainText,
      sourceIndex: blockIndex * 1_000,
      keepWithNext: kind === "title" || kind === "heading",
    });
  });
  return entries.filter((entry) => entry.kind === "pageBreak" || entry.kind === "image" || entry.text.trim().length > 0);
}

function insertBreaksAroundReservedEntries(entries: FlowEntry[], reservedSourceIndexes: number[]): FlowEntry[] {
  if (reservedSourceIndexes.length === 0) return entries;
  const reserved = [...reservedSourceIndexes].sort((left, right) => left - right);
  const withBreaks: FlowEntry[] = [];
  let previousTextEntry: FlowEntry | undefined;
  for (const entry of entries) {
    if (entry.kind !== "pageBreak" && previousTextEntry) {
      const previous = previousTextEntry;
      const hasReservedBetween = reserved.some((sourceIndex) => sourceIndex > previous.sourceIndex && sourceIndex < entry.sourceIndex);
      if (hasReservedBetween && withBreaks.at(-1)?.kind !== "pageBreak") {
        withBreaks.push({
          id: `reserved-break:${previous.id}:${entry.id}`,
          blockId: `reserved-break:${previous.blockId}:${entry.blockId}`,
          kind: "pageBreak",
          text: "",
          sourceIndex: (previous.sourceIndex + entry.sourceIndex) / 2,
        });
      }
    }
    withBreaks.push(entry);
    if (entry.kind === "pageBreak") previousTextEntry = undefined;
    else previousTextEntry = entry;
  }
  return withBreaks;
}

function blockKindToEntryKind(block: Exclude<UnifiedArticleBlock, { type: "list" } | { type: "card" }>): FlowEntry["kind"] {
  switch (block.type) {
    case "title":
      return "title";
    case "section":
    case "subsection":
      return "heading";
    case "lead":
    case "quote":
    case "golden":
    case "summary":
    case "cta":
      return "focus";
    case "image":
      return "image";
    default:
      return "body";
  }
}

function createManualPages(
  entries: FlowEntry[],
  measurer: TextMeasurer,
  canvas: CardCanvasSize,
  safeArea: CardSafeArea,
  typography: CardTypography,
  options: CardLayoutOptions,
): PageDraft[] {
  return (options.manualPages ?? []).flatMap((manual) => {
    if (manual.layout) return [clonePage(manual.layout, manual.locked ?? manual.layout.locked ?? false, true)];
    const manualEntries = entries.filter((entry) => {
      if (entry.kind === "pageBreak") return false;
      if (manual.entryIds?.includes(entry.id)) return true;
      if (manual.blockIds?.includes(entry.blockId)) return true;
      return false;
    });
    if (manualEntries.length === 0) return [];
    const page = createBlankPage(manual.id, canvas, safeArea, [], true, manual.locked);
    layoutEntriesOnPage(page, manualEntries, measurer, typography, options);
    return [page];
  });
}

type PageReservation = {
  fragments: Array<{
    text: string;
    sourceIndex: number;
  }>;
};

type ReservedTextRange = {
  start: number;
  end: number;
};

function collectPageReservations(pages: Array<Pick<CardLayoutPage, "nodes">>): Map<string, PageReservation> {
  const reservations = new Map<string, PageReservation>();
  for (const page of pages) {
    const nodes = [...page.nodes].sort((left, right) => left.sourceIndex - right.sourceIndex || left.id.localeCompare(right.id));
    for (const node of nodes) {
      if (!node.text) continue;
      const current = reservations.get(node.entryId);
      reservations.set(node.entryId, {
        fragments: [...(current?.fragments ?? []), { text: node.text, sourceIndex: node.sourceIndex }],
      });
    }
  }
  return reservations;
}

function applyPageReservations(entries: FlowEntry[], reservations: Map<string, PageReservation>): FlowEntry[] {
  return entries.flatMap((entry) => {
    const reservation = reservations.get(entry.id);
    if (!reservation || entry.kind === "pageBreak") return [entry];
    const ranges = findReservedTextRanges(entry, reservation);
    if (ranges.length === 0) return [entry];

    const sourceLength = entry.sourceLength ?? entry.text.length;
    const remaining: FlowEntry[] = [];
    let cursor = 0;
    for (const range of ranges) {
      if (range.start > cursor) {
        remaining.push(createRemainingFlowEntry(entry, cursor, range.start, sourceLength));
      }
      cursor = Math.max(cursor, range.end);
    }
    if (cursor < entry.text.length) {
      remaining.push(createRemainingFlowEntry(entry, cursor, entry.text.length, sourceLength));
    }
    return remaining;
  });
}

function findReservedTextRanges(entry: FlowEntry, reservation: PageReservation): ReservedTextRange[] {
  const ranges: ReservedTextRange[] = [];
  let cursor = 0;
  const sourceLength = entry.sourceLength ?? entry.text.length;
  const entrySourceOffset = entry.sourceOffset ?? 0;
  const baseSourceIndex = Math.floor(entry.sourceIndex);
  for (const fragment of [...reservation.fragments].sort((left, right) => left.sourceIndex - right.sourceIndex)) {
    const estimatedStart =
      Math.round((fragment.sourceIndex - baseSourceIndex) * (sourceLength + 1)) - entrySourceOffset;
    const start = findReservedFragmentStart(entry.text, fragment.text, cursor, estimatedStart);
    if (start < 0) continue;
    const end = start + fragment.text.length;
    ranges.push({ start, end });
    cursor = end;
  }
  return ranges;
}

function findReservedFragmentStart(text: string, fragment: string, cursor: number, estimatedStart: number) {
  let bestStart = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  let searchFrom = Math.max(0, cursor);
  while (searchFrom <= text.length) {
    const candidate = text.indexOf(fragment, searchFrom);
    if (candidate < 0) break;
    if (candidate >= cursor) {
      const distance = Math.abs(candidate - estimatedStart);
      if (distance < bestDistance) {
        bestStart = candidate;
        bestDistance = distance;
      }
    }
    searchFrom = candidate + 1;
  }
  return bestStart;
}

function createRemainingFlowEntry(entry: FlowEntry, start: number, end: number, sourceLength: number): FlowEntry {
  const sourceOffset = (entry.sourceOffset ?? 0) + start;
  return {
    ...entry,
    text: entry.text.slice(start, end),
    sourceOffset,
    sourceLength,
    sourceIndex: sourceIndexForTextOffset(entry.sourceIndex, sourceOffset, sourceLength),
    fragmentIndex: undefined,
  };
}

function paginateEntries(
  entries: FlowEntry[],
  measurer: TextMeasurer,
  canvas: CardCanvasSize,
  safeArea: CardSafeArea,
  typography: CardTypography,
  options: CardLayoutOptions,
  maxPages: number,
): PageDraft[] {
  if (entries.length === 0) return [createBlankPage("page-1", canvas, safeArea, [], false, false)];

  const pages: PageDraft[] = [];
  let page = createBlankPage("page-1", canvas, safeArea, [], false, false);
  let y = safeArea.y;
  let entryIndex = 0;
  let guard = 0;

  const pushPage = () => {
    pages.push(page);
    page = createBlankPage(`page-${pages.length + 1}`, canvas, safeArea, [], false, false);
    y = safeArea.y;
  };

  while (entryIndex < entries.length) {
    guard += 1;
    if (guard > entries.length * 20_000 || pages.length >= maxPages) {
      page.overflow.push({
        pageId: page.id,
        nodeId: entries[entryIndex]?.id ?? "unknown",
        type: "vertical",
        amount: entries.length - entryIndex,
      });
      break;
    }

    const entry = entries[entryIndex];
    if (entry.kind === "pageBreak") {
      if (page.nodes.length > 0) pushPage();
      entryIndex += 1;
      continue;
    }

    if (entry.keepWithNext && page.nodes.length > 0) {
      const next = entries[entryIndex + 1];
      const needed = estimateEntryHeight(entry, measurer, typography, safeArea.width, options);
      const nextNeeded = next && next.kind !== "pageBreak" ? estimateEntryHeight(next, measurer, typography, safeArea.width, options, true) : 0;
      if (y + needed + nextNeeded > safeArea.y + safeArea.height) {
        pushPage();
        continue;
      }
    }

    const consumed = placeEntry(page, entry, y, measurer, typography, safeArea.width, options);
    if (!consumed.node && page.nodes.length > 0) {
      pushPage();
      continue;
    }
    if (!consumed.node) {
      page.overflow.push({ pageId: page.id, nodeId: entry.id, type: "vertical", amount: consumed.remainingHeight });
      entryIndex += 1;
      continue;
    }

    page.nodes.push(consumed.node);
    y = consumed.nextY;
    if (consumed.remainingText) {
      entries[entryIndex] = {
        ...entry,
        text: consumed.remainingText,
        sourceOffset: (entry.sourceOffset ?? 0) + consumed.node.text.length,
        sourceLength: entry.sourceLength ?? entry.text.length,
        fragmentIndex: (entry.fragmentIndex ?? 0) + 1,
      };
      continue;
    }
    entryIndex += 1;
  }

  if (page.nodes.length > 0 || pages.length === 0) pages.push(page);
  return pages;
}

function layoutEntriesOnPage(
  page: PageDraft,
  entries: FlowEntry[],
  measurer: TextMeasurer,
  typography: CardTypography,
  options: CardLayoutOptions,
) {
  let y = page.safeArea.y;
  for (const entry of entries) {
    const consumed = placeEntry(page, entry, y, measurer, typography, page.safeArea.width, options);
    if (!consumed.node) {
      page.overflow.push({ pageId: page.id, nodeId: entry.id, type: "vertical", amount: consumed.remainingHeight });
      continue;
    }
    page.nodes.push(consumed.node);
    y = consumed.nextY;
    let remainingText = consumed.remainingText;
    let fragmentIndex = (entry.fragmentIndex ?? 0) + 1;
    let sourceOffset = (entry.sourceOffset ?? 0) + consumed.node.text.length;
    const sourceLength = entry.sourceLength ?? entry.text.length;
    while (remainingText) {
      const next = placeEntry(
        page,
        { ...entry, text: remainingText, sourceOffset, sourceLength, fragmentIndex },
        y,
        measurer,
        typography,
        page.safeArea.width,
        options,
        true,
      );
      if (!next.node) {
        page.overflow.push({ pageId: page.id, nodeId: entry.id, type: "vertical", amount: next.remainingHeight });
        break;
      }
      page.nodes.push(next.node);
      y = next.nextY;
      remainingText = next.remainingText;
      sourceOffset += next.node.text.length;
      fragmentIndex += 1;
    }
  }
}

function placeEntry(
  page: PageDraft,
  entry: FlowEntry,
  y: number,
  measurer: TextMeasurer,
  typography: CardTypography,
  safeWidth: number,
  options: CardLayoutOptions,
  continued = false,
): { node?: CardLayoutNode; nextY: number; remainingText: string; remainingHeight: number } {
  const remainingHeight = page.safeArea.y + page.safeArea.height - y;
  if (entry.kind === "image") {
    return placeImageEntry(page, entry, y, remainingHeight, options);
  }

  const style = styleForEntry(entry.kind, typography);
  const lineHeight = style.lineHeight;
  const paragraphGap = gapForEntry(entry.kind, typography);
  const textWidth = textColumnWidth(safeWidth);
  const lines = wrapText(entry.text, textWidth, style, measurer);
  const maxLines = Math.floor(Math.max(0, remainingHeight - paragraphGap) / lineHeight);
  if (maxLines <= 0) return { nextY: y, remainingText: entry.text, remainingHeight };

  const visibleLines = lines.slice(0, maxLines);
  const visibleText = visibleLines.join("");
  const remainingText = entry.text.slice(visibleText.length);
  const nodeHeight = visibleLines.length * lineHeight + paragraphGap;
  const x = page.safeArea.x + Math.floor((safeWidth - textWidth) / 2);
  const sourceOffset = entry.sourceOffset ?? 0;
  const sourceLength = entry.sourceLength ?? entry.text.length;
  const node: CardLayoutNode = {
    id: `${entry.id}:${continued ? "cont" : "node"}:${page.nodes.length}`,
    entryId: entry.id,
    blockId: entry.blockId,
    kind: entry.kind as CardLayoutNodeKind,
    sourceIndex: sourceIndexForTextOffset(entry.sourceIndex, sourceOffset, sourceLength),
    text: visibleText,
    lines: visibleLines.map((line, index) => ({
      text: line.replace(/\r?\n$/, ""),
      x,
      y: y + index * lineHeight,
      width: measurer.measureText(line.replace(/\r?\n$/, ""), style).width,
      height: lineHeight,
    })),
    x,
    y,
    width: textWidth,
    height: nodeHeight,
    style,
    continuedFromPreviousPage: continued,
    continuesOnNextPage: remainingText.length > 0,
  };
  return { node, nextY: y + nodeHeight, remainingText, remainingHeight };
}

function sourceIndexForTextOffset(baseSourceIndex: number, sourceOffset: number, sourceLength: number) {
  if (sourceLength <= 0) return baseSourceIndex;
  return Math.floor(baseSourceIndex) + sourceOffset / (sourceLength + 1);
}

function placeImageEntry(
  page: PageDraft,
  entry: FlowEntry,
  y: number,
  remainingHeight: number,
  options: CardLayoutOptions,
): { node?: CardLayoutNode; nextY: number; remainingText: string; remainingHeight: number } {
  const configured = options.imagePlacements?.[entry.blockId] ?? options.imagePlacements?.[entry.id];
  const defaultBox = options.defaultImageBox ?? DEFAULT_IMAGE_BOX;
  const image: CardImagePlacement & { alt: string } = {
    x: configured?.x ?? page.safeArea.x + Math.floor((page.safeArea.width - defaultBox.width) / 2),
    y: configured?.y ?? y,
    width: Math.min(configured?.width ?? defaultBox.width, page.safeArea.width),
    height: Math.min(configured?.height ?? defaultBox.height, Math.max(defaultBox.height, page.safeArea.height)),
    rotation: configured?.rotation ?? 0,
    opacity: configured?.opacity ?? 1,
    mode: configured?.mode ?? "inline",
    alt: entry.text,
  };
  const height = image.mode === "absolute" ? 0 : image.height + 24;
  if (height > remainingHeight && page.nodes.length > 0) return { nextY: y, remainingText: entry.text, remainingHeight };
  if (height > page.safeArea.height) {
    page.overflow.push({ pageId: page.id, nodeId: entry.id, type: "vertical", amount: height - page.safeArea.height });
  }
  const node: CardLayoutNode = {
    id: `${entry.id}:image:${page.nodes.length}`,
    entryId: entry.id,
    blockId: entry.blockId,
    kind: "image",
    sourceIndex: entry.sourceIndex,
    text: entry.text,
    lines: [],
    x: image.x,
    y: image.y,
    width: image.width,
    height: image.height,
    image,
  };
  return { node, nextY: y + height, remainingText: "", remainingHeight };
}

function estimateEntryHeight(
  entry: FlowEntry,
  measurer: TextMeasurer,
  typography: CardTypography,
  safeWidth: number,
  options: CardLayoutOptions,
  firstLineOnly = false,
) {
  if (entry.kind === "image") return (options.defaultImageBox ?? DEFAULT_IMAGE_BOX).height + 24;
  const style = styleForEntry(entry.kind, typography);
  const lines = wrapText(entry.text, textColumnWidth(safeWidth), style, measurer);
  return (firstLineOnly ? Math.min(1, lines.length) : lines.length) * style.lineHeight + gapForEntry(entry.kind, typography);
}

function styleForEntry(kind: FlowEntry["kind"], typography: CardTypography): TextStyle {
  if (kind === "title") {
    return {
      fontFamily: typography.fontFamily,
      fontSize: typography.titleFontSize,
      fontWeight: 800,
      lineHeight: Math.round(typography.titleFontSize * 1.22),
    };
  }
  if (kind === "heading") {
    return {
      fontFamily: typography.fontFamily,
      fontSize: typography.headingFontSize,
      fontWeight: 700,
      lineHeight: Math.round(typography.headingFontSize * typography.lineSpacing),
    };
  }
  if (kind === "focus") {
    return {
      fontFamily: typography.focusFontFamily ?? typography.fontFamily,
      fontSize: typography.focusFontSize,
      fontWeight: 700,
      lineHeight: Math.round(typography.focusFontSize * typography.lineSpacing),
    };
  }
  return {
    fontFamily: typography.fontFamily,
    fontSize: typography.bodyFontSize,
    fontWeight: 500,
    lineHeight: Math.round(typography.bodyFontSize * typography.lineSpacing),
  };
}

function gapForEntry(kind: FlowEntry["kind"], typography: CardTypography) {
  if (kind === "title") return typography.titleSpacing;
  if (kind === "heading") return Math.round(typography.paragraphSpacing * 0.75);
  return typography.paragraphSpacing;
}

function textColumnWidth(safeWidth: number) {
  // The card canvas is already the output surface. Narrowing the text column to
  // 330px creates artificial line breaks and turns ordinary articles into many
  // undersized pages.
  return Math.max(1, safeWidth);
}

function wrapText(text: string, maxWidth: number, style: TextStyle, measurer: TextMeasurer): string[] {
  const lines: string[] = [];
  let line = "";
  for (const char of Array.from(text)) {
    if (char === "\n") {
      // Newlines occupy source offsets even though canvas draws no newline glyph.
      lines.push(line + char);
      line = "";
      continue;
    }
    const candidate = line + char;
    if (line && measurer.measureText(candidate, style).width > maxWidth && !BREAK_BEFORE_CHARS.test(char)) {
      lines.push(line);
      line = char;
    } else line = candidate;
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [""];
}

function createBlankPage(
  id: string,
  canvas: CardCanvasSize,
  safeArea: CardSafeArea,
  overflow: CardOverflowIssue[],
  manual?: boolean,
  locked?: boolean,
): PageDraft {
  return {
    id,
    aspectRatio: canvas.height === 1920 ? "9:16" : "3:4",
    canvas,
    safeArea,
    nodes: [],
    manual,
    locked,
    overflow,
  };
}

function clonePage(page: CardLayoutPage, locked = page.locked ?? false, manual = page.manual ?? false): PageDraft {
  return {
    ...page,
    manual,
    locked,
    nodes: page.nodes.map((node) => ({ ...node, lines: node.lines.map((line) => ({ ...line })), image: node.image ? { ...node.image } : undefined })),
    overflow: page.overflow.map((issue) => ({ ...issue })),
  };
}

function minSourceIndex(page: Pick<CardLayoutPage, "nodes">) {
  return Math.min(...page.nodes.map((node) => node.sourceIndex), Number.MAX_SAFE_INTEGER);
}

function pageSortKey(id: string) {
  return id.replace(/\d+/g, (value) => value.padStart(8, "0"));
}

function numberPages(pages: PageDraft[], aspectRatio: CardAspectRatio): CardLayoutPage[] {
  const totalPages = pages.length;
  const ids = getUniquePageIds(pages);
  return pages.map((page, index) => applyPageSkeleton({
    ...page,
    id: ids[index],
    pageKind: page.pageKind ?? inferPageKind(page),
    pageNumber: index + 1,
    totalPages,
    aspectRatio,
  }));
}

function inferPageKind(page: Pick<CardLayoutPage, "nodes">): CardLayoutPage["pageKind"] {
  for (const node of page.nodes) {
    const match = node.blockId.match(/:page:([A-Za-z]+):\d+:block:/u);
    if (match?.[1]) return match[1] as CardLayoutPage["pageKind"];
  }
  if (page.nodes.some((node) => node.kind === "title")) return "cover";
  if (page.nodes.every((node) => node.kind === "focus")) return "quote";
  return "argument";
}

function applyPageSkeleton(page: CardLayoutPage): CardLayoutPage {
  if (!page.pageKind || page.nodes.length === 0 || page.manual || page.locked) return page;
  const top = Math.min(...page.nodes.map((node) => node.y));
  const bottom = Math.max(...page.nodes.map((node) => node.y + node.height));
  const contentHeight = bottom - top;
  const available = page.safeArea.height - contentHeight;
  if (available <= 0) return page;

  const centered = page.pageKind === "cover" || page.pageKind === "summary" || page.pageKind === "ending" || page.pageKind === "conclusion" || page.pageKind === "epilogue";
  const lowered = page.pageKind === "turning" || page.pageKind === "transition" || page.pageKind === "quote" || page.pageKind === "keyMetric";
  const targetTop = centered
    ? page.safeArea.y + Math.round(available * 0.5)
    : lowered
      ? page.safeArea.y + Math.round(available * 0.46)
      : top;
  const delta = Math.max(0, targetTop - top);
  if (!delta) return page;

  return {
    ...page,
    nodes: page.nodes.map((node) => ({
      ...node,
      y: node.y + delta,
      lines: node.lines.map((line) => ({ ...line, y: line.y + delta })),
      image: node.image ? { ...node.image, y: node.image.y + delta } : undefined,
    })),
  };
}

export function ensureUniqueCardPageIds(pages: CardLayoutPage[]): CardLayoutPage[] {
  const ids = getUniquePageIds(pages);
  return pages.map((page, index) => ({ ...page, id: ids[index] }));
}

function getUniquePageIds(pages: Array<Pick<CardLayoutPage, "id" | "manual" | "locked">>): string[] {
  const explicitIds = new Set(pages.filter((page) => page.manual || page.locked).map((page) => page.id));
  const used = new Set<string>();
  const ids = Array.from({ length: pages.length }, () => "");
  const indices = pages.map((_, index) => index).sort((left, right) => {
    const leftPriority = pages[left].locked ? 0 : pages[left].manual ? 1 : 2;
    const rightPriority = pages[right].locked ? 0 : pages[right].manual ? 1 : 2;
    return leftPriority - rightPriority || left - right;
  });

  for (const index of indices) {
    const page = pages[index];
    const candidate = page.id || `page-${index + 1}`;
    const explicit = Boolean(page.manual || page.locked);
    let id = candidate;
    if (used.has(id) || (!explicit && explicitIds.has(id))) {
      const base = explicit ? candidate : `${candidate}-auto`;
      id = base;
      let suffix = 2;
      while (used.has(id) || (!explicit && explicitIds.has(id))) {
        id = `${base}-${suffix}`;
        suffix += 1;
      }
    }
    used.add(id);
    ids[index] = id;
  }
  return ids;
}
