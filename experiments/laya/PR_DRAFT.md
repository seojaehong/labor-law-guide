Title: Add isolated Korean Laya reranking experiment with safe retrieval fallback
Base: master
Head: feat/laya-local-evaluation
Draft: true

FAQ/law retrieval currently shares TypeSafe Jev choice selection. This adds a default-disabled, injected-score Laya adapter and a separate offline Korean evaluation harness without changing existing retrieval callers or deployment configuration.

The harness pins Laya 0.4.12 and the official multilingual reviewed snapshot, refuses oversized inputs instead of silently truncating, and reports top1/MRR/recall@3, ranking changes and cold-process latency. Invalid scores, missing setup, errors and timeouts preserve retrieval order. Model preference is never presented as legal correctness.

Validation: Python evaluation tests (3) pass; unconfigured evaluation records 0 measured model cases. TypeScript adapter and existing Jev tests: 39 passed. Scoped ESLint passed. Actual model quality/speed testing is blocked: official Hugging Face API access returned proxy 403 and no inference dependencies/model are installed. The package pin is recorded, but a full dependency hash lock, complete supply-chain review, local bridge and representative public case-law evaluation remain before any activation.

PR54 is separate and untouched. No paid API, private documents, new credentials, hosting, merge or deployment. This draft is for reviewing the experiment design, not approving a Jev replacement.
