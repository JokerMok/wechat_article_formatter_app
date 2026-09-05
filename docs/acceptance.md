# Publishing integrity acceptance branch

Base: `4b28751d9e935e365dab5be72009e2ab785a2198`.
Branch: `fix/publishing-integrity`.
Production merge is gated on real Preview acceptance, not on unit test success alone.

## Product contract

This is a source-preserving publishing workspace for creators maintaining four platform editions. Its useful difference from a Markdown editor is platform projection, editable independent drafts, card pagination and exports from those drafts. Formatting is not a promise of virality.

The canonical input is immutable source text plus a Markdown syntax tree: headings, paragraphs, quotes, nested lists, tables, code, images and inline marks. Plain text is accepted; absent headings are not invented. Raw HTML is retained as escaped text, not executed. Syntax parsing never classifies sections named “来源” as disposable metadata.

AI belongs in semantic analysis ahead of layout. It returns source references and editorial recommendations, not executable HTML/CSS. Partial semantic responses retain unclaimed source paragraphs. Analysis text is sent once with identifiers. The workspace bounds its semantic cache and rejects responses from obsolete source/project/mode contexts. Default layout-only rendering is deterministic and does not call an AI generation provider. Opt-in reach optimization remains an editorial operation.

Rendering follows source structure → semantic annotations → existing theme tokens/layout policy → platform projection → HTML or measured canvas → export. Layout-only platform projections preserve actual source blocks, order, Markdown, links, numbers and images. A content comparison gate checks the projected output, not only planner reference counts. Image cards may add pages; they must not truncate text to satisfy an arbitrary page target.

The block editor is the single editing surface for new drafts. Preview is read-only and shares the exporter’s renderer. Legacy saved HTML-only edits remain available for export; template switching cannot silently discard them. Explicit regeneration retains the existing overwrite confirmation and history. Titles now update the displayed article as well as the title field. Structural template changes use the current platform content.

## Automated evidence

- `npm test`: 31 files, 281 tests passed.
- `npm run lint`: passed.
- `npm run build`: passed (Next.js production build and TypeScript).
- Added whole-pipeline tests using the existing fixed article corpus and a mixed-structure fixture on all four platforms.
- Added actual DOM checks for H4, nested ordered/unordered lists, hrefs, strong text, table rows, code and reference images after HTML sanitization.
- Added long-paragraph canvas text coverage and overflow checks.
- Added altered-number, missing-block, duplicate-block and reordered-block detection.
- Added strict missing/cross-origin image export failure checks.

Old assertions requiring title truncation, silent metadata filtering or invented CTA sections in layout-only mode were replaced by source-preservation assertions. Tests for intentional editorial rewriting explicitly use reachOptimized mode.

## Preview acceptance (pending)

Use isolated acceptance projects, never overwrite real user drafts. For ordinary, long, image-heavy, deeply headed, list/quote-heavy and short/malformed sources, validate all four platforms:

1. Input → analyze → generate → edit title/body → switch theme/layout → switch platform → preview → copy/download.
2. Compare visible and exported text, headings, images, numbers, links and ordering with the current draft.
3. Inspect actual PNG output, not only HTML preview; verify 3:4 and 9:16, first/middle/last pages, no blank images or clipped text.
4. Refresh persistence, undo/redo, edited-draft protection, source edits during analysis, retries and failure feedback.
5. Check mobile layout, browser console and real hosted AI.

Do not claim publishing-platform paste compatibility without testing an actual publishing editor. Do not claim remote AI success from a mocked endpoint. No production merge until material P0/P1 issues found by these checks are resolved.
