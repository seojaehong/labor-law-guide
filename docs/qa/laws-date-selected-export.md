# Laws: date browsing and selected exports

## Scope

The default is the searchable amendment list. “날짜로 보기” uses effective dates only; its displayed month and selected date are shared with the result list. Promulgation dates remain in legal details and exports. The existing external calendar subscription is retained under “더보기”. No legal data, calculation, external API, credential, database or collection schedule is changed.

Selections use amendment IDs, independently of expanded detail cards. “현재 결과 N건 전체 선택” only changes the current filtered result. Hidden selections remain explicitly counted; “선택한 항목 보기” makes them reviewable. XLSX and DOCX are available only after selection. Export snapshots are locked against concurrent downloads, preserve selection after failure and allow a fresh detail request on retry. A missing detail aborts the file instead of silently skipping an amendment.

XLSX is genuine OOXML. Long clauses are continued across numbered rows because Excel limits cell text to 32,767 UTF-16 units. DOCX is genuine OOXML generated with the existing document helper, not a renamed HWP/HWPX. The interface explicitly identifies these as full original before/after comparisons, warns that long clauses can produce large documents and take time to prepare, and says that actual Hancom Hangul compatibility has not been reviewed. No page-count estimate is promised before rendering.

## Integration prerequisite

The review branch is stacked directly on PR #19 head `0fa365b92884a5b8f4c6b4294be2cf379ea6517c`. Its Draft PR base is `fix/laws-list-url-state-20261006`, so the review diff includes only this feature. PR #19 remains independently paused; do not merge this feature into that branch. After PR #19 is independently approved and merged, rebase the feature-only change on then-current master, retarget the Draft PR, and reverify. The earlier local preparation used master `21356f2` plus the PR #19 URL overlay. No production deployment is authorized by this review arrangement.

## Local verification

- TypeScript `tsc --noEmit`: passed.
- ESLint for all changed implementation and test files: passed.
- Full Vitest suite: 382 tests / 45 files passed after the final long-DOCX continuation-row refinement.
- `git diff --check`: passed.
- Production webpack build passed on one retry: compilation, TypeScript, all 101 static pages and final route output completed. Three unchanged FAQ routes timed out once and then succeeded through Next.js automatic retries. Only local placeholder Supabase values were used. The first attempt was interrupted with `automatic approval review was cancelled`, not an explicit user denial.
- Global lint on the exact stacked review base reports 20 errors and 20 warnings, all in unchanged application/components. Changed product files pass targeted lint. Global lint is not a pass.
- Playwright web server started with placeholder Supabase environment values and webpack. Chromium failed before opening a page with `socket() failed: Operation not permitted`. No flags or alternate browser route were used to bypass that restriction. Browser interaction, mobile layout and real browser download tests remain unverified.
- Authored Playwright cases cover month/list sync, hidden selection, both real downloads, mobile width, invalid dates, PR19 return/back URL state, failed detail retry and repeated download clicks. Their existence is not a test pass.
- Independent openpyxl, python-docx and XML parsing recover exact original text for a representative selection and the longest production clause (164,034 characters). The revised representative DOCX rendered to 9 pages and every page was visually inspected; its three amendments start on pages 1, 4 and 6. The long-clause stress event rendered to 184 pages after lossless continuation rows were added; full visual review of all 184 pages is not claimed. Actual Hancom Hangul is not available here.

## Before publication

Rerun final unit/type/lint/build checks after future edits, and run the Playwright cases in an authorized browser environment. Inspect both 360px mobile and desktop layouts. Verify actual Hancom Hangul before claiming that specific application is supported.

## Future usability option

Consider a separate explicitly labeled “요약 목록” export alongside “신구대조 원문 전체” after observing real use. Keep original legal text lossless in the full comparison. This option is a recommendation only and was not added in this change.

## Export-volume safeguards added after review

Before any large download, a native accessible confirmation dialog displays the resolved amendment/law/clause counts, exact original before+after Unicode-code-point count (including whitespace, excluding separately generated metadata), and actual generated Blob byte size. No page estimate is calculated. Preparation happens in browser memory, not an external service.

Any of these triggers confirmation: at least 20 amendments, 50 clauses, 50,000 original-text characters, or 5,000,000 actual file bytes. These are advisory thresholds, not caps. In the 401-event source data the per-event p95 is 43,655 characters, 16 events reach 50,000, and the largest has 344,414. Raw before/after total is 4,720,306 characters; this differs intentionally from counts of all rendered document text including repeated metadata.

Cancel/Escape preserves selection and releases the prepared Blob. Initial focus is Cancel; native dialog semantics make the background inert, and explicit Tab/Shift+Tab boundary handling cycles between the two dialog buttons. The confirmed download has a duplicate-click guard. DOCX now groups each amendment with its heading, own table, sources, reasons and addenda; every subsequent amendment starts on a new page. Existing non-section compareDocx callers preserve their previous behavior.

The original head ff5f8a3 passed manual external-preview browsing and actual selected XLSX/DOCX download/reopening. The new confirmation flow requires rechecking on its newly deployed preview. Localhost browser navigation returned ERR_BLOCKED_BY_CLIENT and was not bypassed.

The 9ec7170 external preview was checked with all 401 amendments selected. Its confirmation showed exact sizes DOCX 31,389,999 bytes and XLSX 4,581,023 bytes, 95 laws, 1,568 clauses and 4,720,306 original-text characters. Both actual downloaded files were independently reopened and every original before/after clause matched exactly. The DOCX has 401 amendment tables and 400 amendment page-break properties. Escape and button cancellation preserved selection and returned focus. A native Tab boundary could move focus to browser chrome, so explicit boundary cycling was added and requires new-head preview recheck.
