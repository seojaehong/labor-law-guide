Title: Add isolated Korean Laya evaluation with pinned CPU environment
Base: master
Head: feat/laya-local-evaluation
Draft: true

FAQ/law retrieval shares TypeSafe Jev choice selection. This adds a default-disabled Laya adapter and an isolated offline Korean relevance evaluation without changing production callers, Jev flags, hosting, or PR24/54.

Laya 0.4.12, CPU PyTorch 2.8.0 and Transformers 4.57.6 plus transitive dependencies are version/hash locked for Linux x86_64 CPython 3.12. The official Laya wheel hash was verified and installation/import succeeded in this cloud sandbox. A pinned official multilingual snapshot and independently reviewed artifact manifest are required before model loading; arbitrary code artifacts and remote-code configs are refused. Missing setup, invalid scores, truncation and timeouts preserve retrieval order. Model preference is never legal correctness.

The harness prepares six synthetic statute/public repository case-summary relevance fixtures. It separates cold-process/load, first and subsequent inference latency, peak RSS, rank changes and top1/MRR/recall@3. Validation: 40 TypeScript/Jev tests, 10 Python guard/formatting tests, scoped ESLint and project TypeScript check pass. The installed upstream formatter's truncation behavior was checked with a synthetic character tokenizer, without model weights.

Actual model download/inference remains blocked: the official Hugging Face model API returned proxy 403 on the authorized retry. No bypass, private data, paid API, new credentials or server creation was used. Model relevance accuracy, actual inference speed and model RAM are unmeasured. The cloud sandbox is not either Oracle server. A local scoring bridge, official artifact hash verification, representative legal relevance review and real model/resource testing remain before operational replacement. See experiments/laya/RESUME_2026-10-21.md and resume-evidence.json. This draft is for reviewing an experiment; production activation is not enabled.
