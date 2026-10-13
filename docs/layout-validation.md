# Layout verification record

Date: 2026-10-03. Local proposal; no push, PR, merge or deployment performed.

## Completed checks

- Clean separate worktree based on verified current remote HEAD `3be9fb3`; the earlier dirty decisions workspace was preserved.
- TypeScript without generated Next route types initially passed. Final full-project TypeScript is **blocked by three pre-existing route contracts**, independently reproduced on a pristine `3be9fb3` archive after identical Next production type generation: `sanitizeExtracted` is an unsupported API route export, `CATEGORIES` is an unsupported blog page export, and decision detail `searchParams` accepts a non-Promise union. These were not silently repaired in the layout patch. Scoped layout-test TypeScript passes.
- Final combined unit suite: **106/106 passed** (97 existing + 9 layout contracts). The provider adapter in extraction unit tests is mocked; no real AI request is part of those tests.
- New layout contract subset: 9/9 passed. Tests cover CJK/fallback measure, four layout families, rail threshold, all five affected pages, opt-in detail typography, list role and absence of public legacy width literals.
- Tailwind/PostCSS compiled stylesheet successfully, including all four semantic classes and reading layout/prose rules. This establishes valid generated CSS, **not actual browser application**.
- Safe fixture-only `next build --webpack`: application compilation passed; build then failed at the existing `sanitizeExtracted` route export. A separate pristine baseline build produced the identical failure. No provider credentials or production environment files were used; the build never reached prerendering.
- Eight fixture-server unit tests passed. Ten real SSR application routes returned HTTP 200 with synthetic data, including all five reported pages, decision detail, two lists and compact tools. The final HTTP rerun also confirmed the authoritative sidebar class and authored wide-table attributes/first and last cell text survive SSR.
- Playwright discovered 110 browser cases; **discovery is not execution**. Fonts are locally fulfilled from the installed Pretendard package; primary/fallback states are checked explicitly.
- AST comparison confirmed protected `metadata`, `generateMetadata`, `revalidate` and `dynamicParams` nodes unchanged across 16 touched files. Decision data/query modules remain byte-identical; no sitemap source changed.
- Independent static review caught a Tailwind layer conflict in mobile sticky positioning. Fixed by replacing the three `sticky` utility consumers with the shared `reading-sidebar-content` class; regression assertions added. The reviewer found no remaining high-confidence production regression by inspection; actual keyboard scrolling checks and an intentionally wide synthetic table were also added to the pending browser suite.
- `git diff --check` passed.
- Changed-file ESLint: 2 errors and 11 warnings. Both errors are pre-existing in `lecture/ai-isan-2026/page.tsx` (function before declaration; unescaped apostrophe), reproduced against the pristine HEAD file. No unrelated lecture behavior was changed.

## Content-specific source inspection

The provided October 3 article was retrieved read-only as public HTML: https://yellowenvelope.kr/blog/news-20261003-01 . Its title is “노란봉투법 사용자성 질의 138건 결론 10건”. The actual article markup contains 19 paragraphs, 10 h2/h3 headings, two tables (four and three columns), one inline link, and no blockquotes/code blocks. The old 280px split grid is present. This confirms that paragraph rhythm and table containment matter for the reported example; HTML inspection is **not** viewport measurement. The preview bundle uses labelled synthetic content rather than copying the article.

## Browser execution blocker

The provided Chromium binary fails on launch with `socket() failed: Operation not permitted` in `process_singleton_posix.cc`. No security restriction was bypassed and no launch escalation attempted. Separately, the supported cloud browser could not open localhost preview (`BLOCKED_BY_CLIENT`). Local server lifecycle/network visibility also differs between execution calls; same-invocation HTTP checks are recorded separately below.

Consequently **no actual line count, viewport overflow result, dark-mode visual pass or screenshot is claimed here**. The Playwright harness is a deliverable pending execution in an authorized browser environment. Do not replace this gap with arithmetic predictions.

| Width | Intended geometry | Actual Korean/mixed line counts | Overflow | Dark/light screenshots |
| --- | --- | --- | --- | --- |
| 1440 | Reading measure + supplemental rail | Pending browser | Pending | Pending |
| 1280 | Reading measure + supplemental rail | Pending browser | Pending | Pending |
| 1024 | Centered reading measure, rail below | Pending browser | Pending | Pending |
| 768 | Single-column article, rail below | Pending browser | Pending | Pending |
| 390 | Full available width within gutters | Pending browser | Pending | Pending |

## Measurement method

The deterministic fixtures contain long mixed Korean paragraphs, full-width Hangul samples, legal numbering/citations, long tokens, a table and code. After `document.fonts.ready`, collect computed font family, font size, line height and actual content-box width. For each visible text node in a long paragraph, use a DOM Range for each character, group rectangles by line y-coordinate, and report full lines separately from the final short line. Report Hangul syllable counts, total characters including spaces, and measured full-width glyph equivalents as distinct quantities. Do not call a pixel/font-size division an actual character count.

Measure `documentElement.scrollWidth` against viewport client width, and locate any overflowing element. A table/code region may scroll internally; it must not widen the page. Confirm stacking using bounding boxes rather than only checking the media rule text. Repeat light/dark, fallback fonts, 200% zoom and keyboard access. Read citation/footnote samples visually; a numeric test cannot certify comprehension.

## Static before/after bundle

`tests/layout/generate-static-gallery.mjs` produced fourteen sanitized SSR snapshots: pristine `3be9fb3` and changed source for blog, decision detail, decision list, case, interpretation, contact and subsidy. Matching compiled CSS and the local Pretendard font are included. A manifest records hashes and source provenance. The gallery offers 1440/1280/1024/768/390 iframe viewports, light/dark and text-size controls, and a DOM Range measurement runner.

The snapshots strip application scripts, outbound resource/navigation attributes and form targets; their CSP blocks scripts/connections/submissions. Only the gallery's controlled measuring script runs. Sanitizer tests pass. The bundle has **not** been opened in a permitted browser, uploaded as a website or deployed. These are rendered HTML assets, not verified screenshots. Browser metric fields remain pending; static SSR excludes hydration/interactive app validation.

## Safety boundaries

Tests use deterministic localhost Supabase fixtures and no production `.env` or provider credentials. Browser interception must abort forbidden AI paths before a network request can reach the app; do not click prompt submission. Do not run live `/api/chat`, `/api/sanction` or `/api/ask`. Tests do not alter content, indexability or sitemap policy. Any published preview and production deployment require separate appropriate approval.

## Browser-driven calibration (pre-production)

The initial 38ic snapshot was measured in the authorized preview using the bundled Pretendard font. Blog complete-line full-Hangul medians at 1440/1280/1024/768/390 were 44/43/44/43/23; cases and interpretations reached 41 on desktop/tablet. These are acceptance misses against the <=40 desktop target, despite zero AFTER page overflow. The shared token is now a 35ic/35em candidate, with font size and mobile gutters unchanged; its predicted unpadded capacity from actual Range advances is approximately 40.5 whole-glyph slots, pending new rendered verification. Tests retain the <=40 rule rather than relaxing it. Provisional fixed-pixel lower bounds were replaced with token-relative containment/cap checks.

The first stress fixture deliberately contains an unbroken Hangul ruler; its enormous baseline min-content overflow (for example Case 5752px) is not a claim about ordinary production page width. A separately captured ordinary fixture and quotation/footnote sample are used for fair visual comparisons. Original stress BEFORE snapshots remain immutable.
