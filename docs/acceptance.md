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

- `npm test`: 31 files, 282 tests passed.
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

## First Preview findings (2026-09-05)

Preview deployment: `dpl_BVESfWthKoPukBAh85nR2ZjuwxCB`, from local commit `df791f4` using Vercel's deployment API. It is not a production deployment. Git push has no CLI credentials and the GitHub connector's create-tree operation returned `403 Resource not accessible by integration`; the branch is currently local only.

Actual mixed-article WeChat generation retained headings through H4, nested lists, a table, code, reference URL, number/symbol text, image and the section named 来源. Edited title appeared in the preview and actual downloaded HTML. The copy action reported success but the browser clipboard inspection returned no entries, so paste fidelity has not been independently verified.

Actual Xiaohongshu PNG inspection exposed duplicated tail characters in multiline quotes/lists. Root cause: wrapping dropped newline characters while pagination advanced offsets by the rendered character count. Fixed by retaining raw newline offsets separately from visible canvas lines, with a regression test. The checklist heading rule was drawn at the full node height (including paragraph spacing), crossing the next paragraph; it now follows the last heading line.

Douyin image switched successfully from 1080×1440 to 1080×1920. Actual hosted analysis reached `POST /api/ai/analyze` but returned HTTP 503; UI reported “服务端 AI 尚未配置完整”. Preview AI configuration is a release blocker. No real AI success is claimed. Failure feedback was additionally made visible in focused preview mode, and analysis now disables duplicate generation while offering cancellation.

Download-event notifications timed out in this browser, but the actual HTML and PNG files arrived in the shared download directory and were inspected. Browser extension metadata errors were observed; they are distinct from application errors.
