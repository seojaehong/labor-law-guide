# Yellow Envelope: reading-first layout reference brief

Research date: 2026-10-03. Public primary sources were opened with web research; Cornell Wex and Kim & Chang were additionally inspected in the cloud browser. This is a design proposal, not a claim that reference sites use the exact dimensions below. No target-site AI endpoints or forms were used.

## Direction

Build a calm, credible Korean labor-information publication. Keep Yellow Envelope's own identity: a restrained warm/yellow accent, neutral reading surface, clear source/date metadata, and useful tools. Do not transplant NODE's brand or an awards-site aesthetic. Separate the wide navigation/list/tool shell from the capped prose column. A sidebar is supplemental content, never a reason to make the article too narrow.

## Four practical references, plus an award-design counterpoint

1. **Korean public legal database — 국가법령정보센터**: https://law.go.kr/lsSc.do
   - Observed: clear distinctions between current/historical law, legal categories and search scopes. Good precedent for visible document type, status and source context.
   - Apply: place source, effective/review date and document type together; preserve headings and article numbering.
   - Avoid: transplanting all of a specialist database's dense controls into an explanatory article.
2. **Law-firm knowledge library — Kim & Chang Insights**: https://www.kimchang.com/ko/insights/index.kc
   - Observed: search by subject, practice-area filtering, content-type labels and dates. Browser inspection also exposed a large introductory/search area.
   - Apply: consistent list rows/cards with category, meaningful title, date and short summary; separate resources from firm news.
   - Avoid: oversized introductory whitespace that delays useful search results or article text; carousel-dependent discovery.
3. **International legal information — Cornell LII Wex**: https://www.law.cornell.edu/wex/wrongful_termination
   - Observed in browser: breadcrumb, direct definition, subheadings, inline legal links, and a separately bounded right-hand toolbox; review attribution is present in the page.
   - Apply: answer-first summary, linked authority, scannable sections and a genuinely separate supporting rail.
   - Avoid: copying heading-level jumps, excessive inline-link density or empty sponsor-space geometry.
4. **Longform media — The Guardian Long Read**: https://www.theguardian.com/news/series/the-long-read
   - Observed: a recognizable series, dated story hierarchy, and clear distinctions between written and audio formats.
   - Apply: calm editorial hierarchy; avoid advertising interruptions.
5. **Award-design reference — Awwwards, Editorial New**: https://www.awwwards.com/sites/editorial-new
   - The award entry foregrounds typography, a two-color palette and menu/navigation interactions. This is a historical awarded reference inspected now, not a claim of a current award.
   - Apply: consistent type roles, limited palette, intentional spacing and strong hierarchy.
   - Avoid: parallax, novelty scrolling, animated text, giant display type or interaction-led navigation in legal reading. Recognition is not proof of reading usability.

## Korean reading measure: recommendation and evidence

Start at **32–40 full-width Korean glyph-equivalents per desktop line**, with **36** as an initial implementation target. This is a practical design heuristic, not a universal optimum or a literal count of every Unicode character. Mixed Korean prose contains spaces, punctuation, Latin abbreviations and numbers, so actual character counts vary.

W3C's Level AAA visual-presentation criterion identifies a mechanism for limiting lines to 80 characters/glyphs, or 40 for CJK. It also addresses non-justified text, spacing and resizing. This supports a cautious upper-bound direction; it does not prove that every Korean article must use a fixed 40-character line or that this proposed design meets AAA: https://www.w3.org/WAI/WCAG21/Understanding/visual-presentation.html

`ch` measures the font's zero glyph, not a Korean syllable. `ic` measures the advance of 水, so it is a useful CJK proxy but still needs validation with the actual Korean font. `em` is a fallback metric, also approximate. Definition: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/length

Recommended implementation concept:
- Give reading content its own font-size-relative max-inline-size, initially 36em, with 36ic when supported and verified against the selected Korean font.
- Start body text near 18px on desktop and 17–18px on mobile, using rem tokens and user scaling; line-height approximately 1.75–1.85. These are starting values for testing, not source-site measurements.
- Do not turn 36 glyph-equivalents into a single hardcoded pixel width shared by every page.
- Use left alignment, normal tracking, moderate weight, explicit heading rhythm and visibly underlined inline citations/links. Avoid full justification.
- Test Korean word-break behavior on actual paragraphs. `keep-all` can create ragged lines with long legal terms; combine a carefully scoped overflow fallback and inspect URLs/case identifiers rather than applying aggressive break-all to the whole article.
- On a 390px viewport, 20px side gutters and 17–18px type naturally produce about 19–21 full-width equivalents. Do not shrink text to preserve desktop line length.

## Shared layout tokens and page families

Use one semantic token system, with different width roles:
- `shell-max`: wide overall navigation/list/tool canvas.
- `reading-measure`: independently capped article text; first target 36 CJK equivalents.
- `rail-width`: narrow supporting rail for TOC, source details, related reading or consultation context.
- `layout-gap`, `page-gutter`, `section-space`, `paragraph-space`: consistent responsive spacing.
- `text-primary`, `text-secondary`, `surface`, `surface-muted`, `border`, `link`, `focus`, `accent`: shared light/dark semantic colors.

Reading/detail pages: title, summary and metadata above; prose + supporting rail when space permits. Keep the article width consistent when the rail is absent. Lists/search: wider shell with scan-friendly title/date/category hierarchy. Tools/calculators/forms: use the same shell and type roles but give inputs/results enough usable width; do not squeeze them into prose measure. Wide legal tables may scroll inside their own labeled region, never force page-wide horizontal scrolling.

## Responsive behavior and acceptance checks

- **1440**: capped reading column + rail; excess width becomes margins, not longer article lines.
- **1280**: preserve reading measure and comfortable column gap; no title/metadata collisions.
- **1024**: collapse the rail if its minimum width plus readable prose and gap no longer fit. This threshold follows content fit rather than device naming; a 64–72rem transition is a reasonable candidate to test.
- **768**: one primary column. Put TOC in an accessible disclosure near the article start; source essentials remain visible and related articles follow the text.
- **390**: single column, stable gutters, no clipped long titles, wrap metadata and button groups, no horizontal page overflow. A mobile rail must not appear as a narrow second column or a long block delaying the article.
- At every width: verify Korean paragraph line measure, real heading wraps, lists, blockquotes, citations, long URLs, table behavior, keyboard focus, 200% zoom and article anchors under sticky navigation.
- Sticky desktop rail: keep within viewport height, use a sensible header offset and disable stickiness where it would obstruct reading. Mobile disclosures must be keyboard operable and expose expanded state.

## Dark mode

Keep structure and reading width unchanged. Use semantic color pairs with measured contrast, muted dark surfaces and clearly distinct text/links/borders/focus. Avoid pure inversion of images or branded yellow; yellow should remain an accent rather than a large luminous reading background. Check tables, quotes, metadata, disabled controls and native inputs in both themes. Preserve explicit theme choice and honor system preference when no choice exists. Dark mode itself does not establish accessibility compliance.

## What implementation verification must still establish

This research does not inspect or certify Yellow Envelope's current DOM, computed CSS, fonts, production routes or existing theme behavior. The implementation owner should inventory every page family, apply shared tokens, then capture actual light/dark screenshots at 1440, 1280, 1024, 768 and 390. Measure the rendered Korean paragraphs after fonts load; do not report the proposed numbers as observed results.
