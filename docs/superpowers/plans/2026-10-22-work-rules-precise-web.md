# 취업규칙 정밀 점검(C) 웹 연결 계획 — 2026-10-22

**목표:** `scripts/work_rules_c/`(Python, 기준 구현·평가용)의 묶음 판단 경로를 TS 로 옮겨 /laws 에서 서버 호출로 쓴다. 기능 플래그가 꺼져 있으면 화면·동작이 지금과 같다.

**전제(재홍님 2026-10-22):** 기술은 다 만들고 배포 방식(무료 수집형 / 유료 분리)은 나중에 정한다. 권고안 = 무료 + 횟수 제한 + 조문별 「맞음/틀림」 수집 + 본문 저장은 동의 시만 + 「노무사 검토 신청」.

## 순서 제약 (서버1 편지 1792584127)
`RulesCheck.tsx` 의 「서버로 보내지 않습니다」 문구 변경은 전송 기능과 **같은 배포**에 넣는다. 플래그가 꺼져 있으면 문구도 그대로.

## 파일
- `src/lib/laws/precise/articles.ts` — split(부칙 STOP·목차·쪽표시·장절·번호 중복) / pair(제목 먼저·번호) / duplicated
- `src/lib/laws/precise/quantities.ts` — 수치 하락(기간 일수 환산)
- `src/lib/laws/precise/judge.ts` — 프롬프트(batch_system.md 동일), JSON 스키마, chunks(8), merge(합집합), 병렬 호출, 회차(runs 2), 빠진 조문 1회 재질문, 상시 인원
- `src/lib/laws/precise/report.ts` — comparison.v1 열, clean() 금지어
- `src/lib/laws/precise/pipeline.ts` — 조립 + 법령 기준(hits)은 `rules-check.ts` checkRules 를 조문 한 줄씩
- `src/app/api/tools/work-rules-precise/route.ts` — 플래그 `WORK_RULES_PRECISE_ENABLED`, 키 없으면 501, Turnstile, IP·전체 일일 상한, maxDuration 300, 본문 미기록
- `tests/unit/precise-*.test.ts` — Python 테스트와 같은 사례
- 화면(`RulesCheck.tsx`) — 플래그 `NEXT_PUBLIC_WORK_RULES_PRECISE`, 전송 동의, 결과 표, 조문별 맞음/틀림
- 수집 저장소 — Supabase 표(점검 결과·반응, 본문은 동의 시만)

## 실측 기준(Python, 261022)
병렬 2회 합집합 44~74초 · $0.64~0.84/문서. 상시 인원 전달 후 재측정 결과는 메모리 project_work_rules_c_pipeline.md.
