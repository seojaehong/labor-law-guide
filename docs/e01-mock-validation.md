# E01 mock integration validation

Base: `41e97f841b98e003034d1967cd2f5c34b248f955`.

Original patch SHA256: `d01beab072a399b3501257d3b5b2a579450949fc435265042455c56c692f9ece`, 306835 bytes. Applied without conflicts; recovery branch not merged.

Full unit suite: 563/563 across 61 files. Type check, scoped lint and offline fixture production build pass. Desktop/mobile synthetic M1/M2/M3a/M3b flow and real DOCX/Chromium PDF outputs verified. Production page/API return 404; paid provider calls and DB executions: zero.

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
