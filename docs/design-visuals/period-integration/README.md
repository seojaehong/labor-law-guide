# PR12 bounded period/document integration

Application base: 31295de7e969cf4e0c83e7324cbe1b1e8dbf946c. Selected browser-only logic from PR13 head 5c3ae822ab0fb90b4cd41ba3de711de6d0875610. Master FAQ changes from 7a9255c6002c3eb553f9562f02cc3558b6667c01 preserved.

## Completed scope

- /tools/work-rules and /laws detail: period selection, standard article matching, local hwpx/docx input, local DOCX/XLSX/table/ICS output. Existing paper/ink/teal layout, menus and original serif default preserved.
- Response checks, retry resetting failed cache, input preservation, focus trap/return and body scroll lock.
- Unrecognized nonempty text blocks verdicts; engine and UI both use parsed article presence.
- Result event links navigate to /laws#event from the standalone tool.
- Input 10MB; central-directory count 1024; expanded total 20MB, individual entry 10MB; suspicious compression ratio rejected. Per-entry streaming also caps actual output if metadata lies.
- Screen label is 문구 일치, with explicit legal-review disclaimer. Standard-only automatic proposals withheld; existing 22 mapped proposals remain review material.
- Current index/data/law-revisions/public law files and since 20251001 unchanged. Exactly 22 rules retained, adding standard IDs only; reproducible static build adds standard data without collector changes.
- FAQ 징계 category/group and JEV_IN environment setting/default32 retained with existing two-pass rerank.

## Verification on this implementation

276 unit tests /32 files passed; tsc --noEmit passed; targeted ESLint passed; webpack production fixture build passed (104 pages). Browser integration seven groups passed; FAQ async race regressions 2 passed; final route sweep62/62 passed at390/1440. Modal contrast142/142 opaque-background samples passed across light/dark. legal-annotation-rendering and blog-summary-rendering regressions are included in the unit suite.

Browser evidence uses a synthetic read-only local PostgREST fixture with provider credentials omitted. Real bundled laws/standard data used for browser-only period checks. Structural production-data tests confirm100 standard articles self-match and existing22 mappings reference valid IDs. This is not legal validation or real DB verification.

Screenshots: period-390-light.png, period-390-dark.png, period-1440.png, retry-390.png, period-results-390.png. browser-results.json records no /api calls in the period flow; existing Google Tag Manager script requests were blocked by the browser test.

## Not included / remaining limits

No PR13 historical corpus, since expansion, extra18 mappings, C engine, AI invocation, server/cron/permission/database change, production merge or deployment. No logo changes or proposal asset updates. No collection timeout retry. Legal wording/mappings remain unreviewed; matching is heuristic, alternative article titles may mis-match. Old HWP unsupported; only body paragraphs extracted (headers, images and complex formatting are not preserved). Human/iOS native validation remains pending. DOCX validated as generated OOXML, not opened in desktop Hangeul/Word. XLSX workbook sheet/disclaimer, table clipboard text and ICS structure also passed the browser run.

Prior noindex scope and SITEMAP_CASELAW unchanged. PR remains Draft. Deployment decision requires final scope, legal-data limits and preview review.
