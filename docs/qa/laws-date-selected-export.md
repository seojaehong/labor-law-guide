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
- Full Vitest suite: 372 tests / 44 files passed after the final long-DOCX continuation-row refinement.
- `git diff --check`: passed.
- Production webpack build passed on one retry: compilation, TypeScript, all 101 static pages and final route output completed. Three unchanged FAQ routes timed out once and then succeeded through Next.js automatic retries. Only local placeholder Supabase values were used. The first attempt was interrupted with `automatic approval review was cancelled`, not an explicit user denial.
- Global lint on the exact stacked review base reports 20 errors and 20 warnings, all in unchanged application/components. Changed product files pass targeted lint. Global lint is not a pass.
- Playwright web server started with placeholder Supabase environment values and webpack. Chromium failed before opening a page with `socket() failed: Operation not permitted`. No flags or alternate browser route were used to bypass that restriction. Browser interaction, mobile layout and real browser download tests remain unverified.
- Authored Playwright cases cover month/list sync, hidden selection, both real downloads, mobile width, invalid dates, PR19 return/back URL state, failed detail retry and repeated download clicks. Their existence is not a test pass.
- Independent openpyxl, python-docx and XML parsing recover exact original text for a representative selection and the longest production clause (164,034 characters). The representative DOCX rendered to 7 pages and every page was visually inspected. The long-clause stress event rendered to 184 pages after lossless continuation rows were added; full visual review of all 184 pages is not claimed. Actual Hancom Hangul is not available here.

## Before publication

Rerun final unit/type/lint/build checks after future edits, and run the Playwright cases in an authorized browser environment. Inspect both 360px mobile and desktop layouts. Verify actual Hancom Hangul before claiming that specific application is supported.

## Future usability option

Consider a separate explicitly labeled “요약 목록” export alongside “신구대조 원문 전체” after observing real use. Keep original legal text lossless in the full comparison. This option is a recommendation only and was not added in this change.
