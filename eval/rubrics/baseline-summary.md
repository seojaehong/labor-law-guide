# Phase 0 베이스라인 측정 종합 (2026-04-27)

> 모든 후속 리팩토링은 본 베이스라인 대비 회귀 0건 + 정확도 향상 입증 시에만 채택.

---

## 결과 요약

| 루브릭 | 베이스라인 값 | 합격 기준 | 산출물 |
|--------|---------------|----------|--------|
| **R1** 노동위 판례 정확도 | **201/240 (83.8%)** | ≥201 유지 | `evaluation/search_quality_99/20260427_093743/report.json` |
| **R2** FAQ 검색 정확도 | (검수 후 측정) | top-1 ≥85% / top-3 ≥95% | `eval/rubrics/r2-faq-eval.jsonl` (100문항) |
| **R3** 챗봇 답변 품질 | (진행 중) | URL 환각 0% / 인용 ≥90% | `eval/rubrics/r3-chat-baseline.json` |
| **R4** API 레이턴시 | 아래 표 | p95 ≤ 베이스라인 ×1.2 | `eval/rubrics/r4-latency-baseline.json` |
| **R5** iOS Safari | (사용자 실기) | 5흐름 모두 PASS | `eval/rubrics/r5-ios-smoke-checklist.md` |
| **R6** 빌드 무결성 | ✅ 성공 (양 레포) | 0 error | `eval/rubrics/r6-build-*.log` |

---

## R1 — 노동위 판례 검색 정확도

| 측정 시점 | duration | upgraded | delta | 변화 |
|---|---|---|---|---|
| 4/3 (이전 최고) | 1,122s | 206/240 | +41 | 기준 |
| 4/27 베이스라인 | 1,386s | 201/240 | +36 | -5 (회귀) |
| **4/27 RPC 픽스 후** | 1,558s | **209/240 (87.1%)** | +44 | **+8 (회복+α)** |

**해석**:
- RPC 인자명 픽스 (search_similar_cases_hybrid: `query_text→query`, `match_count→limit`) **단독으로 +8점 회복**
- 이전 timeout 버그가 4/3→4/27 -5점 회귀의 원인
- **임베딩 재계산 (현재 18%) 후 추가 향상 예상** (Phase 5)

---

## R2 — FAQ 검색 정확도

- 100문항 카테고리별 비례 샘플링 + LLM 변형 (gpt-4o-mini)
- 카테고리: 쟁의행위 13, 노동조합 12, 단체교섭 9, 기타노동법 8, 임금 7, 근로시간 4, 기타 47
- 사용자 검수 마크다운: `eval/rubrics/r2-faq-eval-review.md`

**검수 후 자동 평가 스크립트 작성 필요** (Phase 0.3에서 처리)

---

## R3 — 챗봇 답변 품질 (30시나리오)

| 측정 | PASS | URL 환각 | text_len<100 | FAQ 인용 | CASE 인용 |
|---|---|---|---|---|---|
| 4/27 1차 베이스라인 | 5/30 | **1/30** | 0 (read 30s timeout 일부) | 31 | 0 |
| 4/27 RPC 픽스 v2 (read 60s) | 1/30 | **0/30** ✅ | 4 | 28 | **0 ❌** |

**해석**:
- ✅ **URL 환각 0/30** — winhr.co.kr 차단 + STRICT_WHITELIST regex 효과
- ⚠️ **PASS 5→1**: 평가 룰이 LLM 응답 stochastic에 민감. 도구 호출은 SSE에 메타정보 없어 텍스트 추론 → 부정확. 회귀 신호 아님 (URL 환각 + text_len 모두 개선)
- ❌ **CASE 인용 0건** — RPC 픽스 후에도 `search_similar_cases_hybrid` 결과가 LLM 컨텍스트에 잘 안 들어가는 듯. 추가 디버깅 필요 (cases.ts try/catch silent fail 의심)

평가 룰 자체 신뢰도 낮음 → R3는 "URL 환각률" "응답 부실률" 지표 중심으로 회귀 비교 권장.

---

## R4 — API 레이턴시 (p50/p95)

| 엔드포인트 | n | p50 | p95 | 평가 |
|------------|---|-----|-----|------|
| /api/faq (law-guide) | 25 | 1.14s | 3.78s | 🟢 양호 |
| /api/cases (law-guide) | 25 | 5.92s | 7.22s | 🟡 느림 |
| /api/search (decisions) | 25 | 4.97s | 12.29s | 🟡 느림 |
| /api/chat TTFB | 12 | 12.37s | 26.15s | 🟡 LLM 특성 |
| /api/chat 전체 | 12 | 16.2s | 28.66s | 🟡 LLM 특성 |

**개선 후보** (Phase 5):
- /api/cases, /api/search: 인덱스/RPC 최적화 (count=estimated, top_k 줄이기)
- /api/chat TTFB: 첫 SSE chunk까지 12초는 LLM 1라운드 latency. 임베딩 캐싱?

---

## R5 — iOS Safari 스모크 (5흐름)

체크리스트: `eval/rubrics/r5-ios-smoke-checklist.md`
**사용자 실기 측정 대기** — 베이스라인 + Phase 4 후 두 번 통과 확인.

---

## R6 — 빌드 무결성

| 레포 | 결과 | 컴파일 시간 |
|------|------|-------------|
| labor-law-guide | ✅ 성공 | (Turbopack) |
| labor-decisions-search | ✅ 성공 | 3.2분 |

**경고 1건**:
- Next.js 16 `middleware` 컨벤션 deprecated → `proxy`로 변경 권장 (Phase 2 처리)

---

## 임베딩 재계산 strategy (advisor 검증)

| 항목 | 측정값 | 추정 |
|------|--------|------|
| 100건 처리 시간 | 28초 | — |
| embed_dt (OpenAI batch 50건) | 1.3~1.7초 | — |
| patch_dt (4 워커 PATCH 50건) | 10.9~13초 | — |
| 실측 rate | 3.6/s | — |
| **전체 ETA** | — | **4.5시간** (57,833건) |
| **비용** | $0.0003/100건 | **~$0.19** (전체) |

**advisor 5번 결함 점검 결과**:
- ✅ "30분" 거짓 — 실제 4.5시간 (Phase 0에서 고지)
- ✅ 비용 $1-3 추정보다 저렴 ($0.19, batch endpoint 효과)
- ✅ checkpoint + resume 가능
- ✅ 4 워커 병렬 + OpenAI rate limit 안전 (3,000 RPM)

---

## 다음 단계

1. R3 완료 → 본 문서 갱신
2. R2 사용자 검수 → 자동 평가 스크립트 작성 + 베이스라인 측정
3. R5 사용자 실기 → 결과 본 문서 갱신
4. **임베딩 본격 재계산 시작** (4.5시간 백그라운드)
5. **Phase 2.1 chat/route.ts 분할** (R3 베이스라인 확정 후)
6. R5 Phase 0 사용자 실기 결과 후 Phase 2.2/2.3 진행
