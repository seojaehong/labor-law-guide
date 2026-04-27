# 노란봉투법.com 통합 리팩토링 마스터플랜 (v2)

> **작성일**: 2026-04-27 (v1 → v2 advisor 검토 반영)
> **목표**: ① 사이트 안정성 보장(에러 zero) ② 모노레포 통합(C안) ③ 검색/DB 정확도 향상
> **범위**: labor-law-guide + labor-decisions-search + Supabase 통합 감사
> **결정사항**: 통합 방향 = **C (모노레포)**, diff 역추적 → 검색 정확도 향상 포함
> **사용자 요구**: "다시는 수정하지 않도록 완벽하게" → **루브릭 베이스라인 → 리팩토링 → 회귀비교** 순서 강제

---

## ⚠️ v2 핵심 변경 (advisor Opus 4.7 검토)

1. **모노레포 의미 명확화 필요** — (a) workspaces + 2 deployable apps vs (b) 단일 app 흡수. 구조도는 (b)인데 timebox는 (a) 기준 → 사용자 결정 필요.
2. **순서 역전**: Phase 3 (코드 분할) → Phase 1 (모노레포)보다 먼저. 낯선 경로에서 untangle 회피.
3. **임베딩 "30분" 오류**: 57,833 × 순차 PATCH = 수 시간. SQL UPDATE FROM (VALUES) 또는 병렬 워커로 대체.
4. **루브릭 누락**: 240문항만 있음. FAQ/chat/URL-hallucination/latency/iOS 베이스라인 부재 → Phase 0에 추가.
5. **Vercel 폐기 시 외부 링크 404**: 블로그/이메일/SYSTEM_PROMPT 잔존 URL → redirect map 선행 필요.

---

## 0. 현재 상태 스냅샷 (감사 결과)

### 0.1 labor-law-guide (메인 — 노란봉투법.com)
| 항목 | 상태 |
|------|------|
| 프레임워크 | Next.js 16 App Router, React 19, Vercel |
| 페이지 | 12개 (`/`, `/ai`, `/faq`, `/database`, `/cases`, `/decisions/[id]`, `/contact`, `/guide`, `/manual`, `/checklist`, `/news`, `/blog/[slug]`, `/admin`) |
| API | 10개 (chat, tools/calc, faq, cases, contact, analyze, admin/*) |
| LLM 도구 | 7개 (퇴직금/통상임금/연장수당/최저임금/법조항검증/블로그검색/비교분석안내) |
| Supabase RPC | 6개 (search_faq_combined/hybrid/legacy, search_similar_cases_hybrid, search_interpretation_semantic, search_cases_semantic) |
| 외부 도메인 | 노란봉투법.com, labor-decisions-search.vercel.app, winhr.co.kr |
| 핵심 부채 | `chat/route.ts` 723줄, `ai-knowledge.ts` 27KB |

### 0.2 labor-decisions-search (BigCase 분석기)
| 항목 | 상태 |
|------|------|
| 페이지 | `/`, `/search`, `/decisions/[id]`, `/harassment`, `/sanction`, `/stats` |
| 검색 파이프라인 | baseline(BM25) + candidate(metadata) + Claude Haiku reranker (점수 9-10 규칙) |
| 평가 | **239/240 달성** (commit `001f18d`) |
| Supabase | nlrc_decisions(57,833건), cases(BigCase 15,742건), lawgo_precedents |
| 핵심 RPC | `search_similar_cases_hybrid` (semantic_weight=0.6 고정) |
| 라벨 사전 | LEGAL_FOCUS 165개 / DISPOSITION 20개 / FACT_MARKER 106개 |
| 미커밋 | `scripts/bigcase_holding_enrich.py` (사용자 작업 중 끊긴 것), `restore_key_issue_from_obsidian.py` (수정) |

### 0.3 Supabase 데이터 상태 (마이그레이션 후)
| 항목 | 결과 |
|-----------|------|
| nlrc_decisions 총건 | 57,833건 |
| key_issue 마이그레이션 | ✅ 완료 (26,925건 PATCH, holding_summary 길이로 복원) |
| search_tsv 컬럼 | ✅ 자동 트리거로 재생성 (id_9999 sample: 2,141자 토큰) |
| 임베딩 1536d | ⚠️ **stale** — 짧은 key_issue 기준, 재계산 필요 |

---

## 1. 모노레포 의미 명확화 (사용자 결정 필요)

advisor 지적: 두 해석이 가능하며 작업량이 크게 다름.

### 옵션 C-α: 워크스페이스 모노레포 (deployable 2개 유지)
```
yellow-envelope/
├── apps/
│   ├── web/                  ← labor-law-guide (그대로 노란봉투법.com 배포)
│   └── decisions/            ← labor-decisions-search (sanction.노란봉투법.com 배포)
├── packages/shared/          # format-holding, labels, source-contracts
└── packages/search/          # reranker, query-parser
```
- **장점**: 양 app 독립 배포, layout/UI 충돌 없음, 1~2일 가능
- **단점**: 사용자 입장에선 여전히 "두 사이트" (서브도메인 분리 = B안과 유사)

### 옵션 C-β: 단일 앱 흡수 (실질 단일 사이트)
```
yellow-envelope/
├── apps/web/src/app/
│   ├── (main)/               # 기존 12개 페이지
│   ├── sanction/             # ← labor-decisions-search 흡수
│   ├── decisions/[id]/       # ← labor-decisions-search 흡수
│   ├── search/               # ← labor-decisions-search 흡수
│   └── api/(...통합)
├── packages/shared/
└── packages/search/
```
- **장점**: 진정한 단일 사이트 (노란봉투법.com/sanction)
- **단점**: layout/middleware/font/CSS 머지, not-found/loading 충돌, 디자인 시스템 통일 → 실제로 **5~7일** 필요

> 🎯 **사용자 확인 필요**: C-α (워크스페이스) vs C-β (단일 앱). 본 문서 v2는 **C-β** 기준 일정 산정 (사용자 원래 의도와 일치 추정).

---

## 2. 루브릭 정의 (Phase 0 — 가장 먼저 만들 것)

> "다시는 수정하지 않도록 완벽하게" → **베이스라인 측정 → 리팩토링 → 회귀 비교** 강제.
> 베이스라인 없는 리팩토링은 회귀를 못 잡음.

### 2.1 루브릭 6종 (모두 Phase 0에 베이스라인 측정)

| # | 루브릭 | 베이스라인 측정 방법 | 합격 기준 (회귀 후) |
|---|--------|---------------------|------------------|
| **R1** | 노동위 판례 검색 정확도 | 240문항 평가셋 재실행 (현재 239/240) | ≥239/240 유지 |
| **R2** | FAQ 검색 정확도 | **신규 100문항 라벨셋 작성** (FAQ 11,539 중 카테고리별 샘플) → top-1/top-3 정확도 | top-1 ≥85%, top-3 ≥95% |
| **R3** | 챗봇 답변 품질 | **30 시나리오 케이스셋** (퇴직금/해고/괴롭힘/노란봉투법 등) → URL 환각률, 인용률, 거부률 | URL 환각 0%, 인용률 ≥90% |
| **R4** | 검색 레이턴시 | curl 자동화 → /api/chat, /api/search, /api/faq, /api/cases p50/p95 | p95 ≤ 베이스라인 ×1.2 |
| **R5** | iOS Safari 호환성 | iPhone 실기 5가지 핵심 흐름 스모크 | 모두 통과 |
| **R6** | 빌드/배포 무결성 | next build, type-check, lint, vercel deploy preview | 0 error, 0 warning(추가) |

### 2.2 베이스라인 산출물 (Phase 0 완료 시점에 존재)
- `eval/r1-240-baseline.json` — 240문항 결과 (이미 존재)
- `eval/r2-faq-baseline.jsonl` — **신규 작성 필요** (100문항)
- `eval/r3-chat-scenarios.jsonl` — **신규 작성 필요** (30시나리오)
- `eval/r4-latency-baseline.json` — 자동 수집
- `eval/r5-ios-smoke-checklist.md` — 사용자 실기 체크리스트
- `eval/r6-build-baseline.txt` — next build 로그

### 2.3 회귀 비교 자동화
- `eval/run-all.sh` — 6개 루브릭 일괄 실행
- 모노레포 머지 직전/직후 두 번 실행 → diff 리포트
- CI에 통합: PR마다 R1/R2/R3/R4/R6 자동 실행

---

## 3. 발견된 이슈 — 우선순위별

### 🔴 P0 — 즉시 처리 (런칭 전 차단 요소)
1. **임베딩 staleness** — 57,833건 재계산. **방법 재설계 필요**: SQL UPDATE FROM VALUES 또는 4 워커 병렬 (단일 PATCH는 수시간 소요).
2. **bigcase_holding_enrich.py 미완** — 사용자가 작업 중 끊김 → 검토/완성/적용.
3. **빅케이스 partial parsing** — id_17397 등 DB 자체 짧음 → 재크롤 또는 obsidian 보강.

### 🟡 P1 — 통합 직전 처리
1. **외부 도메인 하드코드** — `SITE_DOMAIN`/`SANCTION_DOMAIN` 변수, SYSTEM_PROMPT 회사명, footer.
2. **chat/route.ts 비대** — 723줄. 도구 정의 분리.
3. **ai-knowledge.ts** — 27KB SYSTEM_PROMPT.
4. **types.ts 라벨 사전** — 291개 → JSON 외부화.

### 🟢 P2 — 통합 후 개선
1. multi-stage rerank
2. semantic_weight 동적화
3. format-holding.ts 양 레포 중복 → shared package
4. search_tsv 가중치 차등 (`setweight`)

---

## 4. 실행 순서 (advisor 검토로 v1 대비 재배열)

> 핵심 원칙: **가능한 한 작은 단위로 reversible하게**. 리스크 큰 작업은 베이스라인 측정 후.

### Phase 0 — 루브릭 베이스라인 + 정리 (1.5일)

**0.1 미커밋 정리 (0.5일)**
- [ ] `bigcase_holding_enrich.py` 검토 → 의도 파악 → 안전 적용
- [ ] `restore_key_issue_from_obsidian.py` 변경분 커밋 (DB-first 전략)
- [ ] 양 레포 main 동기화

**0.2 루브릭 베이스라인 측정 (1일)**
- [ ] R1: 240문항 재실행 → 결과 저장
- [ ] R2: FAQ 100문항 라벨셋 작성 + 베이스라인 측정
- [ ] R3: 챗봇 30시나리오 작성 + 베이스라인 측정 (URL 환각률 등)
- [ ] R4: 4개 API 레이턴시 자동 수집 스크립트
- [ ] R5: iOS 실기 체크리스트 (사용자 작업)
- [ ] R6: build 로그 저장

### Phase 1 — 임베딩 재계산 + BigCase enrich (백그라운드, 1일)
- [ ] 재계산 전략: SQL `UPDATE nlrc_decisions SET embedding = ... FROM (VALUES ...)` 배치 100건/회 + 4 워커 병렬 → 실제 시간 측정 후 fallback 결정
- [ ] OpenAI API rate limit 고려 (3,000 RPM Tier 1)
- [ ] 진행률 모니터링 + 중단 시 resume 가능
- [ ] BigCase enrich 적용 + 검증

### Phase 2 — 코드 분할 (현재 레포에서, 2일) ← v1에서 v2로 순서 변경
> advisor 권고: 모노레포 머지 **전에** 분할. 낯선 경로에서 untangle 회피.

**2.1 chat/route.ts 분할 (0.7일)**
```
src/lib/chat/
├── tools/
│   ├── definitions.ts        # 도구 스키마
│   └── handlers/
│       ├── calc.ts           # 계산기 5종
│       ├── search-blog.ts
│       └── suggest-analyzer.ts
├── scrub-urls.ts
└── prompts.ts
src/app/api/chat/route.ts    # ~200줄 (오케스트레이션만)
```
- 매 분할 후 R3 회귀 (30시나리오)

**2.2 ai-knowledge.ts 분할 (0.5일)**
```
src/content/system-prompts/
├── main.ts
├── yellow-envelope-law.ts
├── answer-style.ts
└── index.ts
```
- 매 분할 후 R3 회귀

**2.3 types.ts 라벨 외부화 (0.3일)**
```
src/content/labels/
├── legal-focus.json (165 entries)
├── disposition-type.json (20)
└── fact-marker.json (106)
```
- 양 레포에서 중복 제거 (labor-decisions-search도 동일 적용)

**2.4 회귀 검증 (0.5일)**
- 6개 루브릭 전수 재실행 → 베이스라인 대비 0 회귀 확인

### Phase 3 — 모노레포 골격 (1~5일, 옵션 C-α/β에 따라)

**옵션 C-α 선택 시 (1.5일)**:
- pnpm workspaces 셋업
- packages/shared 추출 (format-holding, labels, source-contracts)
- packages/search 추출 (reranker, query-parser)
- 양 app 그대로 빌드 통과
- 회귀: R1~R6 전체

**옵션 C-β 선택 시 (5일)**:
- C-α 모두 + 다음:
- layout 통합 (양 app `<html>`/`<body>` 머지)
- middleware 통합 (route 매칭 룰 일원화)
- font/CSS 통합 (Tailwind 4 단일 설정)
- not-found.tsx / loading.tsx 통합
- 디자인 시스템 통일 (양 레포 UI primitives 비교 → 결정)
- 흡수: `/sanction`, `/decisions/[id]`, `/search`, `/harassment`
- 매 단계 R1~R6 회귀

### Phase 4 — 도메인/Vercel 통합 (1.5일)

**4.1 redirect map 작성 (0.5일)** ← v1에 누락된 advisor 지적사항
- `labor-decisions-search.vercel.app/sanction` → `노란봉투법.com/sanction` (vercel.json redirects)
- 외부 잔존 링크 (블로그 글 본문, 이메일, 검색엔진 캐시) → 자동 리다이렉트
- 옛 프로젝트는 일단 redirect-only 모드로 유지 (DNS 캐시 만료 14일 후 폐기)

**4.2 도메인 상수 통일 (0.3일)**
- `SITE_DOMAIN` 단일 값
- `SANCTION_DOMAIN` 제거 (내부 path)
- `URL_WHITELIST` 정리 (vercel.app 제거)
- SYSTEM_PROMPT 회사명/도메인 점검

**4.3 Vercel 배포 (0.7일)**
- 신규 모노레포 → 노란봉투법.com 연결
- 옛 프로젝트 → redirect-only로 전환
- DNS 검증 (TTL 30분)
- 회귀: R1~R6 prod 환경

### Phase 5 — 검색 정확도 향상 (5종, 4일)

> 모든 변경은 **R1/R2 베이스라인 대비 개선** 입증되어야 적용.

**A. search_tsv 가중치 차등** (1일)
- `setweight(to_tsvector('simple', title), 'A') || setweight(to_tsvector('simple', key_issue), 'B') || setweight(to_tsvector('simple', holding_summary), 'C')`
- 트리거 함수 수정 → 1행 테스트 → 전체 재생성 → R1 측정

**B. semantic_weight 동적화** (1일)
- query_parser intent → weight 매핑
- A/B 테스트 (같은 240문항을 두 weight로 평가)
- 개선 입증 시 채택

**C. holding 별도 임베딩 컬럼** (1일)
- `ALTER TABLE nlrc_decisions ADD COLUMN holding_embedding vector(1536)`
- 임베딩 재계산 (Phase 1과 같은 전략)
- search_similar_cases_hybrid에 추가 인자 + max(sim_a, sim_b)
- R1 측정

**D. multi-stage rerank** (1일)
- BGE-reranker-v2-m3 (HuggingFace API)
- top 50 → 10 → 5
- 레이턴시 영향 측정 (R4)
- 정확도 개선이 레이턴시 손실 상회 시 채택

**E. summary_short 추가 임베딩** (옵션, 0.5일)
- 빠른 시맨틱 매칭용 짧은 임베딩

### 총 일정 요약

| 옵션 | 일정 |
|------|------|
| **C-α** (워크스페이스, 양 app 유지) | Phase 0~5 = **약 11일** |
| **C-β** (단일 앱 흡수) | Phase 0~5 = **약 14.5일** |

---

## 5. 위험 & 대응 (advisor 추가 항목 포함)

| 위험 | 영향도 | 대응 |
|------|--------|------|
| 임베딩 재계산 시간 산정 오류 | 중 | Phase 1에서 100건 측정 후 strategy 결정 |
| C-β 시 layout/font/CSS 충돌 | 고 | C-α로 시작 → 안정 후 C-β 점진 흡수 (2-step) |
| Vercel 폐기 시 외부 링크 404 | 고 | redirect map (Phase 4.1) — DNS swap 전 필수 |
| chat/route.ts 분할 회귀 | 고 | R3 30시나리오 베이스라인 → 매 단계 비교 |
| 모노레포 git history 손실 | 저 | git subtree merge로 양쪽 history 보존 |
| iOS Safari 미발견 회귀 | 중 | R5 iPhone 실기 — Phase 0과 Phase 4 후 두 번 |
| OpenAI API rate limit | 중 | exponential backoff + checkpointing |
| FAQ 100문항 라벨셋 부재 | 중 | Phase 0에서 작성 (1일 소요) |

---

## 6. 사용자 결정 필요 (실행 전 차단 요소)

1. **모노레포 옵션**: **C-α** (워크스페이스 + 서브도메인) vs **C-β** (단일 앱 흡수)?
   - C-α: 11일, 안정성↑, "사이트 통합" 의미는 약함
   - C-β: 14.5일, "사이트 완전 통합" 사용자 의도 부합 추정
2. **루브릭 100+30 라벨셋 작성**: 사용자가 직접 검수해야 R2/R3 신뢰도 확보 → 가능한지?
3. **임베딩 재계산 비용**: ~$3 + 시간 1일 OK?
4. **Phase 5 정확도 향상**: 베이스라인 대비 개선 안 보이면 skip OK? (실제 측정 후 결정)

---

## 7. 다음 액션 (권장)

```
1. (사용자 확인) C-α / C-β 선택
2. Phase 0.1 미커밋 정리 — bigcase_holding_enrich.py 검토 시작
3. Phase 0.2 루브릭 베이스라인 — R1 즉시 실행, R2/R3 라벨셋 작성
4. Phase 1 임베딩 — 100건 측정 후 전략 확정 → 백그라운드 시작
5. Phase 2 코드 분할 — chat/route.ts부터
6. ... 이후 v2 순서대로
```

---

*v2: advisor (Opus 4.7) 5개 결함 검토 반영. v1 산정 시간 오류, 순서 역전, 루브릭 누락, redirect map 누락, 모노레포 의미 모호성 모두 수정됨.*
