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

282 unit tests /32 files passed; tsc --noEmit passed; targeted ESLint passed; webpack production fixture build passed (104 pages). Browser integration nine groups passed; FAQ async race regressions 2 passed; final route sweep62/62 passed at390/1440. Modal contrast142/142 opaque-background samples passed across light/dark. legal-annotation-rendering and blog-summary-rendering regressions are included in the unit suite.

Browser evidence uses a synthetic read-only local PostgREST fixture with provider credentials omitted. Real bundled laws/standard data used for browser-only period checks. Structural production-data tests confirm100 standard articles self-match and existing22 mappings reference valid IDs. This is not legal validation or real DB verification.

Screenshots: period-390-light.png, period-390-dark.png, period-1440.png, retry-390.png, period-results-390.png. browser-results.json records no /api calls in the period flow; existing Google Tag Manager script requests were blocked by the browser test.

## Not included / remaining limits

No PR13 historical corpus, since expansion, extra18 mappings, C engine, AI invocation, server/cron/permission/database change, production merge or deployment. No logo changes or proposal asset updates. No collection timeout retry. Legal wording/mappings remain unreviewed; matching is heuristic, alternative article titles may mis-match. Old HWP unsupported; only body paragraphs extracted (headers, images and complex formatting are not preserved). Human/iOS native validation remains pending. DOCX validated as generated OOXML, not opened in desktop Hangeul/Word. XLSX workbook sheet/disclaimer, table clipboard text and ICS structure also passed the browser run.

Prior noindex scope and SITEMAP_CASELAW unchanged. PR remains Draft. Deployment decision requires final scope, legal-data limits and preview review.


## Empty document regression follow-up

Valid archives with no readable body text (empty, image-only, whitespace) now fail explicitly for both DOCX/HWPX. The previous textarea and document review mode are preserved; file input clears even on early validation failure, so selecting the same filename again can recover. The UI applies the nonempty-text guard before committing state; extraction also rejects empty results. Six unit cases and six browser failure→same-name-success cycles cover the two formats.

Privacy scope: browser verification blocks existing Google Analytics/Google Tag Manager scripts. No new review-flow API requests were observed in that isolated environment. This does **not** verify all external traffic on the operational site or claim that production transmits nothing. Operational analytics traffic was not inspected and no analytics/protection settings were changed.


Native date follow-up: light inputs use color-scheme:light and dark inputs color-scheme:dark. date-native-dark-before.png reproduces the previous normal color-scheme in the same surface; date-native-dark.png shows final native rendering. Pixel measurements are in date-native-pixel-audit.json; they cover Chromium1234 DPR1, not iOS/Safari. The result event link is clicked in the fixture: URL hash, target article ID, aria-expanded=true and rendered .lr-detail are checked; result-link-arrival-390.png records arrival.

Follow-up rerun:282 unit tests, TypeScript and targeted ESLint passed; final webpack build104pages passed. Final browser run includes6 empty/image/whitespace failure→same-name-success cycles and actual result-link arrival. Existing data since,22 mappings, original serif and withheld standard-only proposals remain unchanged.

Final visible error notice is inside the modal immediately below the textarea, since an outside toast can be covered by the modal. Browser assertions verify the inline alert and its clearing on successful retry. Native icon maximum contrast:normal1.36:1 → dark15.45:1, with78 interior pixels at≥3:1. Final screenshot Library IDs are in library-empty-visible-saved.json; the earlier followup IDs precede the inline-alert improvement.
