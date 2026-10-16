# Public-law-only reranking (disabled by default)

This path is connected only to `buildLawsContext`. It does not enable the legacy
free-text Jev path, FAQ reranking, case search, or `/search`. Existing Gemini chat
answer generation is unchanged; no generating-model reranking fallback is added.

## Data boundary

- `TYPESAFE_JEV_PUBLIC_LAWS_ON` must be exactly `true`, and a server-side
  `TYPESAFE_API_KEY` must exist. No environment setting is changed by this patch.
- The public flag is independent of `TYPESAFE_JEV_ON` and
  `TYPESAFE_JEV_CHAT_ON`. Leave both legacy flags disabled. `JEV_ON=false`
  still disables the caller's law reranking.
- User text is inspected locally against a fixed vocabulary. Only literal legal
  concepts from that vocabulary enter the external request. Raw query, names,
  contacts, dialogue, FAQ and case text never enter this transport.
- The full normalized law name, article label, title and body must match an exact
  SHA-256 manifest entry generated from the repository's public law JSON or
  the three dated official-source article fixtures.
  The manifest supplies the public law ID; client/database source claims alone
  are not accepted. Arbitrary extra row fields are never serialized.
- `node scripts/jev/build-public-law-manifest.mjs` regenerates the manifest using
  local `public/data/laws/[six-digit-id].json` files and the reviewed
  `data/public-law-rerank/official-articles.json` snapshot. Review its diff when
  published law data changes. It makes no API or database requests.
- There are 2,400 manifest text variants: 2,397 public repository variants plus
  three official Labor Standards Act articles (26, 36 and 43), read on
  2026-10-11 from the linked National Law Information Center pages. Those pages
  showed effectivity 2026-10-08, law number 21533. This is a partial
  public amendment-text corpus, not a complete current-law corpus. Historical
  variants prove public availability, not current legal applicability.

## Bounds and fallback

- The existing RPC retrieves 60 rows. At most the first 32 are eligible for the
  one external call. Every row in that prefix must verify; otherwise no call.
- Full public bodies are used without the old 120-character truncation. If the
  serialized full-text request exceeds 32,000 UTF-8 bytes, a deterministic local
  extractor selects complete sentence groups using only fixed query concepts.
  Selection happens after every complete body passes the public hash check.
  Immediately following qualifications and introduced enumerated conditions are
  preserved. If a numbered item matches, the governing introduction and
  intervening legal-effect/basis sentences are retained. Unclear item structure
  keeps the entire article, which may trigger budget abstention. Each shortened candidate has `excerpt: true`; the question states
  that omitted content must not be guessed and insufficient evidence means none.
  No external summarizer is called and no candidate is removed. If complete
  selected groups still exceed the budget, the entire request is skipped.
  A 32,000-byte conservative token upper-bound budget is also enforced; this is
  not a measured provider tokenizer count. The extractor cannot establish that
  every legally relevant remote cross-reference or non-adjacent exception is
  present; the excerpt flag is essential, and quality remains unvalidated.
- Fixed endpoint and model (`jev-1.13.0`), redirect rejection, no retry, no cache,
  2.5-second deadline including body reads, AbortController, 16,384-byte streamed
  response limit. Provider/error text is not logged.
- Complete probabilities for every canonical candidate ID and `none` are
  required. Reject malformed IDs, non-finite/out-of-range scores, inconsistent
  choices, partial distributions, and materially unnormalized probabilities.
- `none`, ties, malformed responses, low confidence, errors and timeouts all
  preserve the original array. Successful ranking only promotes one row and
  preserves every other row. The caller applies its existing final-three limit.

## Limits of the evidence

Tests use mocked transport and verified repository text. They do not measure
live retrieval quality, provider accuracy, billing, or production database
coverage. The fixed seven-question public-text result motivating this work is
synthetic evidence, not a site-search quality score.

The first-five-token lexical retrieval limit still exists in `toLexQuery`; the
new concept extractor sees terms later in the input, but cannot repair candidates
the RPC failed to retrieve. Candidate 33 and later remain invisible to reranking.
These limits, and preservation of text after character 120, have independent
regression tests. The existing 3,000-character chat context limit also remains.

Before enabling, assess actual public-manifest match coverage and request-budget
coverage on a representative approved public-law retrieval set. Unknown corpus
rows fall back safely, potentially making this opt-in path a no-op for many
queries. Expansion to a complete reviewed public corpus is a separate step.

### Synthetic budget coverage (not live retrieval coverage)

With seed `614138`, independently sample 100 candidate lists at each size from
all 2,397 original repository manifest variants, using the fixed query concept
`연차 유급휴가` (same sampling corpus before/after the excerpt change):

- 4 candidates: full-body 100/100 eligible; with excerpt fallback 100/100
- 8 candidates: full-body 100/100; with excerpt fallback 100/100
- 16 candidates: full-body 65/100; with excerpt fallback 96/100
- 32 candidates: full-body 0/100; with excerpt fallback 23/100

All 32 position tests with one unverified row skip transmission. These are
constructed fixtures, not estimates of production coverage or legal relevance.
Even the improved variant skips 77/100 constructed 32-candidate requests.
Do not enable based on these results: current-law relevance, provider ranking
quality and live public-provenance coverage remain unverified.

### Seven-question offline evidence preservation

The user's seven fixed questions are tested against newly verified complete
public official articles 26, 36 and 43. This is NOT the user's original provider
payload and does not reproduce or claim its provider accuracy. No provider call
is made in these seven tests. Twenty-nine verified filler candidates force the
32-candidate excerpt path without increasing the request budget.

The six positive tests preserve their expected legal phrases: advance notice,
30 days' ordinary wages, direct/full/currency wage payment, monthly wage payment,
14-day settlement, and agreed extension. Related `다만` qualifications remain;
article 26 retains all three numbered exceptions. The seventh confirms that
these three excerpts contain no industrial-accident approval procedure and that
`none` remains available; it is not a model-selection score.

The fixtures retain official source URLs, full bodies, effective date and the
verification date. Matching older public amendment text still does not establish
current law. Only approved real-provider evaluation can establish reranking
quality; this patch leaves the feature disabled by default.

The independent-review regression for public law `000128`, article 10, tests both
before/after texts with query `임금`. A matching numbered item must not omit the
burden-reduction effect or its standard-setting sentence. Thirty-two copies now
abstain on budget; a bounded mixed list retains the complete governing rule.
