# Reading layout QA

This isolated suite uses synthetic content and a loopback-only, read-only PostgREST fixture. It must run from a clean worktree without `.env` files. Do **not** copy `.env.local` or provider keys from another checkout. The launcher passes only an allowlist of ordinary process variables plus local dummy Supabase settings. The browser fixture blocks every `/api` path, all cross-origin network traffic, and service workers. The exact production Pretendard stylesheet is intercepted and fulfilled from a local `@font-face` rule; the WOFF2 is fulfilled from the installed `pretendard` package. No font request reaches the CDN. The tests never click an AI submit control.

## Checks

- 1440, 1280, 1024, 768, and 390 pixel viewports, each in light and dark mode.
- Four real SSR detail templates: `/blog/news-20261003-01`, `/cases/layout-case`, `/interpretations/layout-interpretation`, `/decisions/layout-decision`.
- Blog/case/interpretation rail beside the prose only at 1152px and up; below it, the rail follows the main article. Its inner content must compute to `position: sticky` on desktop and `static` below the breakpoint.
- Real DOM `Range.getClientRects()` measurements for ordinary Hangul, uninterrupted fullwidth Hangul, and mixed Hangul/Latin/numeric paragraphs. Metrics include every line's exact text and grapheme counts. The final partial line is excluded from median line-length statistics. No character-per-line claim is inferred from width divided by font size.
- Body width, actual font size/line height, explicitly loaded Pretendard FontFace records plus `document.fonts.check`, long URLs, unbroken tokens, tables, code blocks, and page/prose `scrollWidth`.
- Accessible horizontal table scrolling, and a separate 200% root text-size overflow check. This is a text-size test, not a claim of browser zoom coverage.
- Representative list/tool page shells: decisions, blog, contact, subsidy, contract-check, stats. The stats check covers shell geometry only; its client-side data request is intentionally blocked, so this does not validate populated statistics charts.
- Full-page PNG and JSON measurements for each reading case; trace on failure.

## Run

From the repository root:

    node --test tests/layout/fixture.test.mjs
    node tests/layout/http-smoke.mjs
    npx playwright test --config=playwright.layout.config.ts --list
    npx playwright test --config=playwright.layout.config.ts

Fixture HTTP smoke output is under `test-results/layout/http/`: one HTML file per route, `report.json`, and `server.log`. Browser output defaults to `test-results/layout/after/`, including `results.json` and per-test PNG/JSON attachments.

To record a separate 1440px primary-font-failure probe without doubling the matrix:

    LAYOUT_FONT_MODE=fallback LAYOUT_ARTIFACT_LABEL=fallback npx playwright test --config=playwright.layout.config.ts --project=1440-light --grep 'blog: actual'

The fallback probe verifies that no primary FontFace loaded and records the same Range measurements. `document.fonts.status === 'loaded'` alone is never treated as proof of the expected font.

An optional existing Chromium path may be specified with `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. This does not authorize bypassing a browser launch or sandbox denial. If Chromium is blocked, report the browser suite as unrun and use an approved browser environment.

## Before/after evidence

Use a separate pristine worktree at the baseline commit, copy only this QA infrastructure into it, and run:

    LAYOUT_CAPTURE_ONLY=1 LAYOUT_ARTIFACT_LABEL=before npx playwright test --config=playwright.layout.config.ts

Then run the changed checkout with `LAYOUT_ARTIFACT_LABEL=after`. Capture-only mode records the same synthetic documents and actual line metrics without asserting the new geometry. It still checks HTTP success, fixtures, font loading, and unexpected API attempts. The width and theme are encoded in the Playwright project name. Do not call an after screenshot a baseline; do not claim screenshots exist merely because the test suite is discoverable.

## Verification status, 2026-10-03

- Eight local fixture tests passed.
- Ten real application routes returned HTTP 200 in a same-invocation local server check; all four detail routes contained all three measurement probes.
- Scoped layout-test TypeScript and ESLint checks passed.
- Playwright discovery found 110 cases. This is discovery only, not 110 passing browser tests.
- Browser execution and before/after screenshots were not completed: shell Chromium had already been denied (`socket(): Operation not permitted`) and the supported cloud browser rejected the local URL (`BLOCKED_BY_CLIENT`). Neither restriction was bypassed.
- Full-project TypeScript after Next generates route types exposes existing `blog/page.tsx` named-export and `decisions/[id]/page.tsx` searchParams-signature errors. The layout test TypeScript can be checked separately without generated route types. The implementation worker also reproduced the existing `sanitizeExtracted` invalid API-route export production-build failure in a clean baseline checkout.
