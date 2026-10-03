# Reading-first layout system (TASK-500)

Status: local proposal, **not approved for deployment**. Based on repository HEAD `3be9fb3d2cb6f832d88a11c9554cee5489b936d5`, verified against remote HEAD on 2026-10-03. Reference research was completed before implementation; see [research and adoption/rejection decisions](layout-reference-research.md).

## The rule

A reading measure belongs to the article, not the entire article-plus-sidebar shell. The old `820 − 40 − 280 − 40 = 460px` geometry caused the reported compression. Raising a single container limit would leave that failure mode intact.

Use four families:

| Family | Public pages / role | Width policy | Sidebar policy |
| --- | --- | --- | --- |
| Reading | Blog, case, interpretation and decision details; wrapper-only migration for guide/manual/policy documents | Detail prose `38ic`, approximate `38em` fallback; 17–18px fluid rem-based type | Detail rail added **outside** measure; stack below the article below 72rem |
| List | Blog/news/case/decision indexes, database, FAQ, search, tools directory | `--layout-list-max` = 68.75rem; no reading-sized cap on search controls/results | Existing list controls stay intact |
| Tool | AI UI, contact/subsidy, sanction, statistics, knowledge search; compact calculator/checklist forms | `--layout-tool-max` = 68.75rem; compact modifier uses 51.25rem | 20rem supporting rail; chat uses 23.75rem; stack below 72rem |
| Wide | Global navigation/footer shell | `--layout-wide-max` = 87.5rem | Chrome modifier has no extra vertical padding |

`38ic` is a **starting design target**, not a claim of 38 Korean characters on every rendered line. `ic` measures 水 in the active font. Korean syllables, spaces, numbers, punctuation and Latin words vary. `ch` would measure the Latin zero and is deliberately not used. The measured result must be validated after fonts load. The implementation starts at 38ic rather than the research brief's illustrative 36ic: this stays below the 40-equivalent upper heuristic while preserving more room for legal sentences, and padded legal summary panels then have roughly 35–36 full-width equivalents at nominal desktop type size. Those are design estimates only; actual rendered line counts remain the approval gate. Research suggests approximately 32–40 full-width Korean equivalents on desktop; mixed-prose Unicode counts are reported separately. W3C's CJK guidance is not an assertion of WCAG AAA compliance.

The global root text size remains user-controlled. Prose uses `clamp(1.0625rem, 1rem + 0.125vw, 1.125rem)`, leading 1.8 and paragraph spacing 1.25em. Metadata, badges, forms and compact search snippets retain their existing type scale. Guide/manual/privacy/terms only migrate their outer wrapper in this phase: embedded text utilities and reusable explainer cards keep their prior type sizes. They are not claimed as fully migrated 17–18px reading prose. `MarkdownSnippet` only receives reading typography when explicitly passed `variant="reading"`.

## Shared tokens

All definitions live in `src/app/globals.css`, retaining the project's Tailwind v4 CSS-first architecture:

- `--reading-measure`, `--reading-font-size`, `--reading-leading`, `--reading-paragraph-space`
- `--layout-list-max`, `--layout-tool-max`, `--layout-wide-max`
- `--layout-compact-max` (single-card forms/CTA blocks), `--layout-intro-max` (existing homepage intro geometry)
- `--layout-gutter`: 1.25rem to 2rem; `--layout-gap`: 1.5rem to 3rem
- `--layout-rail`, `--layout-tool-rail`, `--layout-chat-rail`
- `--layout-page-space`: 2rem to 3rem

The 72rem content-fit threshold is centralized in one CSS media rule. CSS custom properties cannot be interpolated into ordinary media query conditions. It is therefore intentionally not duplicated as a misleading unused breakpoint variable. At 1024px the article takes its own measured width and the rail follows in document order; at 1280/1440px both fit. 768/390px are single-column. No mobile font reduction is used to preserve desktop line counts.

The desktop rail keeps existing sticky behavior. Mobile/tablet rails are static and follow the article, so supporting links remain available without preceding the text. No new TOC, content section, metadata field or source attribution was invented.

## Scope and preservation

The five reported pages now share structural classes: blog/cases/interpretations details use the reading layout; contact/subsidy use the tool layout. Decision-detail paragraphs and source sections also opt into reading type. Index pages use list geometry. Public wrapper literals `820/1100/1400/760px` are replaced by named tokens or family classes; nested homepage cards retain their prior size through tokens. Admin screens are explicitly excluded.

Brand palette, NODE branding, content/data/query behavior, metadata, canonicals, robots/noindex decisions, sitemap configuration and `SITEMAP_CASELAW` are unchanged. Existing semantic colors continue to provide light/dark behavior. Article prose uses the primary text role. Long tokens wrap with `overflow-wrap:anywhere`; tables/code scroll inside their own regions instead of widening the page. Markdown tables receive a focusable, labelled region for keyboard scrolling. Existing table content/attributes are preserved.

Remaining staged work: review guide/manual/policy body typography and reusable explainer cards individually before adopting the detail-prose scale; avoid blanket overrides that enlarge metadata and controls.

Out of scope: rewriting legal text, changing source classification, adding TOC generation, redesigning the homepage, AI response generation, fixing pre-existing unrelated lint violations or broad color/contrast remediation.

## Required review

See [verification record](layout-validation.md). Do not equate type checks or CSS compilation with visual approval. Before deployment, inspect all five widths in light/dark, actual paragraph line counts, long citations, footnotes, tables, code, keyboard-scroll regions and 200% zoom. Use the October 3 article as a content-specific final review once an authorized preview is available.

## Staged rollout and rollback

1. **Foundations:** land tokens/classes and layout contract tests; do not delete existing color/type tokens. New classes are opt-in.
2. **Reading details:** apply blog/cases/interpretations, legal snippet variant and decision typography. Review before/after screenshots before progressing.
3. **Tool layouts:** apply contact/subsidy/AI structural shells and verify static inputs. Never submit AI prompts as a visual test.
4. **Public wrappers:** migrate remaining family wrappers and navigation/footer to shared token consumption; retain admin exclusion and homepage visual identity.
5. **Human gate:** only after the rendering checklist and explicit deployment approval. No early search-performance conclusion during the first 48 hours after any later approved deployment.

The local patch is uncommitted. The stages above are proposed review/commit boundaries, not a claim that commits exist. Revert consumer changes for an affected stage first; unused foundation tokens are harmless. Revert the complete patch to return to `3be9fb3`. Do not revert unrelated category-navigation work already present in that base.
