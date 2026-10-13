# Annual leave: actual master integration validation

Integrated source commit: `bc16c5cd96502e877c0b990d623b0cabeca9f46b`.
Master integrated: `824c042be9263739053e6e59c22bf0d386c7937d`.
Ordinary `--no-ff` merge, zero conflicts, ordinary push; no production merge/deployment.

The eight upstream files below are byte-identical to the integrated master. Their behavior was preserved, not rewritten as part of the annual-leave work:

- `public/tools/severance.html`
- `scripts/laws/daily_update.sh`
- `src/app/api/tools/severance-context/route.ts`
- `src/components/ChatInterface.tsx`
- `src/lib/chat/context/interpretations.ts`
- `src/lib/chat/tools/definitions.ts`
- `src/lib/labor-calc.ts`
- `src/lib/legal-verify.ts`

Actual integrated-tree checks: 332 tests in 38 files passed; TypeScript and targeted ESLint passed; synthetic production fixture build generated 108 routes. This supersedes earlier pre-integration build counts. The fixture uses synthetic PostgREST data and `next build --webpack` rather than production database reads.

Browser safety and workspace checks passed on the integrated tree: error UI/TSV/real downloaded XLSX parity; literal formula-like names; UTC Excel dates in Los Angeles; invalid first employee preserved; no-workspace failure; successful session roster save; storage failure; reversed promotion dates; remembered A→B→A and settlement return. Browser error count: zero. Screenshot files were regenerated from this build in `docs/design-visuals/annual-leave-20261005`.

Strict hydration regression also passed on this integrated build: 99 scenarios, 192 document loads, UTC/ko-KR, Asia/Seoul/ko-KR and America/Los_Angeles/en-US; zero React/page errors. Four routes were repeatedly theme-toggled and reloaded, live input survived theme changes, and session name/hire-date roster survived reload. All external and `/api/` requests were blocked by this regression and the safety regression.

Official Library uploads of regenerated integrated-build screenshots succeeded: error export `libfile_f08a8be8a348819198d607db8958580d`; promotion chronology `libfile_2b2c2cb8a344819193871eac1f338451`. The image bytes match the prior corrected full-page screenshots because these upstream changes do not alter the annual-leave pages.

Vercel reported successful completion for the integrated source commit: https://vercel.com/seojaehongs-projects/labor-law-guide/8bSEZhaVQJLfAXUAuanpo786Sukv . This establishes deployment completion, not protected remote UI equivalence. Anonymous Preview redirected to Vercel login. Existing Chrome-session browser tools are unavailable in the selected execution environment; no login/protection changes or credentials were used.

Severance calculation and its context API were not exercised. The upstream HTML now automatically posts to its existing context API, whose backend can call OpenAI when configured; that upstream behavior is preserved and outside this annual-leave validation. No paid AI calls, law collector retry, server/cron/permissions/ledger/Notion changes were performed.

Annual-leave limitations remain: below-80% actual attendance, part-time proportional entitlement, month-end/leap-day legal interpretation, and legal completion of promotion require separate review. Promotion is a date comparison, not legal certification. Session roster persistence stores name/hire date only; input ledger amounts are not restored after reload. Clipboard verification captures generated TSV, not pasting into a real Excel desktop application.
