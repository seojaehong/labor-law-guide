# E01 mock integration validation

Base: `41e97f841b98e003034d1967cd2f5c34b248f955`.

Original patch SHA256: `d01beab072a399b3501257d3b5b2a579450949fc435265042455c56c692f9ece`, 306835 bytes. Applied without conflicts; recovery branch not merged.

Full unit suite: 574/574 across 62 files. Type check, scoped lint and offline fixture production build pass. Desktop/mobile synthetic M1/M2/M3a/M3b flow and real DOCX/Chromium PDF outputs verified. Production page/API return 404; paid provider calls and DB executions: zero.

Full eslint reproduced independently on an unchanged detached base checkout using the same lockfile/dependencies: 9 errors, 20 warnings. Head diagnostics match base exactly after checkout-path normalization, including rule, severity, line, column and message.

| Unchanged file | Errors | Warnings |
| --- | ---: | ---: |
| src/app/admin/AdminClient.tsx | 2 | 0 |
| src/app/admin/clusters/ClustersClient.tsx | 1 | 0 |
| src/app/ai/page.tsx | 0 | 1 |
| src/app/api/chat/route.ts | 0 | 1 |
| src/app/api/newsletter/send-daily/route.ts | 0 | 1 |
| src/app/database/DatabaseClient.tsx | 1 | 0 |
| src/app/decisions/[id]/page.tsx | 0 | 2 |
| src/app/faq/FaqClient.tsx | 0 | 1 |
| src/app/guide/page.tsx | 0 | 1 |
| src/app/harassment/page.tsx | 0 | 1 |
| src/app/interpretations/[id]/page.tsx | 0 | 1 |
| src/app/lecture/ai-isan-2026/page.tsx | 2 | 0 |
| src/app/lecture/ai-isan-2026/textbook/page.tsx | 0 | 1 |
| src/app/news/NewsClient.tsx | 0 | 1 |
| src/components/BetaBanner.tsx | 1 | 0 |
| src/components/ChatInterface.tsx | 1 | 0 |
| src/components/DeepChecklistWidget.tsx | 0 | 6 |
| src/components/TurnstileWidget.tsx | 1 | 0 |
| src/lib/ai/stream.ts | 0 | 1 |
| src/lib/chat/stream-round.ts | 0 | 1 |
| src/lib/faq-extractor.ts | 0 | 1 |

Mock outputs are not live-model or expert legal validation. Official requested law-version verification, authenticated ownership, durable shared budgets, server-side atomic approvals and real-provider E01 integration remain blocked. Session-only state and opaque/source-digest contracts are not production guarantees.

Automatic Vercel deployment is disabled only for branch `e01-integrated-repair`; master settings unchanged. No release authorized by this draft. SQL proposal is unexecuted.

## Independent review repairs

The async Word path snapshots the approved state, suppresses concurrent starts and rechecks a synchronously updated current-state ref after rendering, before creating a download. M2, M3a, fact-save and unsaved input edits cancel old exports. The browser regression also tests a rapid triple click (one download). Current editable facts are synchronized after corrections; unsaved buffers cannot start consultation before save.

M2 no longer inserts a fixed 08-25 allegation after user withdrawal. Only the known initial synthetic allegation is automatically transformed; custom approved-leave conflicts block drafting for user review. Application/relief text uses the latest worker-position input in both opening and rebuttal sections.

Eight new unit regressions pass. Real browser race reproduction passes in scripts/e01-race-browser.mjs, with external requests blocked. Run against the local enabled fixture server with E01_BASE_URL and optionally E01_CHROMIUM_PATH. Results are written to ignored test-results/e01-race/result.json. The usual production page/API gates and branch deployment block remain.

## Approved-leave status follow-up

Date-presence heuristics were removed. Current 08-18 allegation status is explicit excluded/alleged/unclear input. M2 establishes exclusion; editing current allegation text resets status to unclear and requires explicit confirmation before drafting. Both supplied dated correction sentences pass when exclusion is confirmed. Actual structured allegation conflicts and unknown status produce separate specific UI messages. Three added regressions plus actual browser assertions cover these cases; no claim is made that arbitrary free text has been semantically validated.
