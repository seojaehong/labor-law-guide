# Local static before/after gallery

This is a **local-only** alternative capture artifact when application browser QA is unavailable. It is not a deployment, a production-data export, or evidence that browser tests passed. Uploading/publishing this directory requires separate authorization.

## Generate

From this checkout, with its existing installed dependencies:

    node --test tests/layout/static-snapshot.test.mjs
    node tests/layout/generate-static-gallery.mjs /workspace/shared/layout-preview

The output directory must be new or empty; existing evidence is never deleted. The generator:

1. Archives the pristine `3be9fb3` baseline into a unique temporary directory, without touching the modified checkout.
2. Copies only source, public assets and required build configuration from the changed checkout to a separate temporary directory. It does not copy `.env`, `.next`, `.git`, logs, provider keys or credentials.
3. Uses the same synthetic fixture server for both captures. It starts and fetches the servers inside one invocation, which works with per-command network/process isolation. The child environment is explicitly allowlisted and request guards reject non-loopback fetch/HTTP requests.
4. Renders seven actual application routes in each version with their own Next development compiler and real compiled CSS: blog, decision, decisions list, case, interpretation, contact and subsidy.
5. Parses only React's literal `$RC` / `$RS` streamed-HTML ID placements to materialize completed SSR, without evaluating JavaScript. Missing/unrecognized Suspense placements fail closed.
6. Removes application scripts, analytics, metadata payloads, external font links, request-bearing attributes, outbound navigation targets and form actions. Snapshot CSP additionally forbids scripts, connections and form submissions. Local SVG icons remain. The selected routes contain no required image assets.
7. Bundles the installed Pretendard variable WOFF2 and compiled stylesheets. Source digests, HTML hashes, font hash, fixture hash and sanitization counts are recorded in `manifest.json`.
8. Stops its development/fixture servers. Raw SSR and server logs remain in the temporary capture workspace, outside the gallery output.

The database rows and all four reading documents are synthetic. Contact/subsidy retain checked-in public template copy to preserve layout context; those pages are not represented as invented synthetic database records.

## Inspect, only in an authorized browser environment

Serve the output directory through an authorized same-origin static host and open `index.html`. Do not claim successful visual review from `file://`, a shell browser denied by policy, or an unreachable loopback page. Do not bypass browser restrictions or publish the gallery without approval.

The gallery provides actual 1440, 1280, 1024, 768 and 390px iframe viewports, light/dark class switching, and 100%/200% root text sizing. Each iframe has a fixed 1000px height so sticky elements retain normal viewport behavior. Wider iframes scroll horizontally in the gallery; screenshots should record the chosen viewport and show the intended frame area.

Only the gallery's controlled JavaScript runs. It loads the local font, verifies a loaded Pretendard `FontFace`, and then counts grapheme clusters using `Range.getClientRects()`. Measurements include exact per-line text, font size/line height, content geometry, sidebar position, table scrolling containers and overflow. Final partial lines are excluded from the medians. It does not estimate characters per line by dividing width by font size.

“Measure all 70 combinations” covers 7 routes × 5 widths × 2 themes, producing 140 before/after frame measurements. It uses 100% text size. The separate 200% control is text resizing, not browser zoom. Save the JSON with its capture manifest. Browser screenshots are a separate, still-required review step.

## Scope and limits

- The artifact preserves SSR template structure and CSS. It cannot validate hydration, application navigation, client-only states, form submissions or browser keyboard behavior.
- The generator's Node tests validate sanitizer behavior, not browser geometry or typography.
- No browser metrics or screenshots are fabricated. A generated gallery can be complete while browser QA remains blocked.
- No files from the production database or remote service are fetched. No API endpoint or AI provider is called.

## Calibrated recapture with immutable original evidence

    node tests/layout/generate-static-gallery.mjs /workspace/shared/layout-preview-calibrated --reuse-before /workspace/shared/layout-preview --ordinary

This path copies the original stress BEFORE snapshots, compiled assets and capture manifest byte-for-byte. It checks the original HTML hashes, fixture hash, font hash, baseline commit/source hash and CSS bytes before proceeding. Only the stress AFTER is recaptured. AFTER HTML filenames, all compiled CSS filenames, and the controller/style references are content-addressed, so a calibrated capture has fresh asset identities rather than reusing stale cached AFTER content.

The ordinary mode is a clearly labelled supplemental capture of the four reading routes from the pristine baseline and current source. Both receive the same `ordinary-fixture-data.mjs` data through the existing real templates and Markdown renderers. The original stress fixture module is unchanged. Ordinary data retains the Hangul/mixed paragraphs, normal lists and table, and adds a short synthetic quote plus a GFM footnote/back-reference. Only artificial stress content is excluded: the uninterrupted fullwidth ruler, extreme URL/token row, forced-width table, long code and stress-only heading. Non-reading routes reuse their standard captures. These supplemental BEFORE snapshots are not replacements for original BEFORE evidence.

Stress mode remains the default acceptance view. Ordinary mode is for a fair visual comparison, because a 5752px BEFORE case under the uninterrupted-ruler fixture is artificial min-content stress, not a normal production article width. Each JSON measurement and matrix records its selected mode and snapshot identity. Missing/hidden probes are explicitly excluded, without a zero characters-per-line result.

Same-document footnote fragments are retained by the snapshot sanitizer; base URLs, outbound URLs, scripts, event handlers, connections and forms remain disabled. The controlled harness permits fragment clicks only in ordinary AFTER when the target exists and the anchor does not open another browsing context. Original stress BEFORE bytes remain immutable. SSR capture records the actual footnote ref/back-reference target IDs and ARIA label resolution; final ordinary AFTER captures fail if those fragment targets or labels are broken. This is separate from browser interaction verification.

For a temporary current-source blog/case SSR proof (not a complete comparison gallery):

    node tests/layout/generate-static-gallery.mjs /workspace/shared/layout-ordinary-proof --ordinary-proof

Run the focused offline tests before capture:

    node --test tests/layout/fixture.test.mjs tests/layout/ordinary-fixture.test.mjs tests/layout/static-snapshot.test.mjs tests/layout/static-gallery.test.mjs

These Node tests validate fixtures, sanitizer, missing/hidden measurement handling and bounded same-origin cache-fresh retry behavior. They do not claim browser geometry, screenshots, interaction results or approval for publication.
