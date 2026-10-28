# 퇴직금 계산기 · 퇴사 정리 · 챗봇 계산 API

사이트의 퇴직금은 세 곳에서 계산되지만 정본 엔진(`src/lib/calc/severance.ts`) 하나를 쓴다. 같은 합성 입력이면 세 곳이 같은 금액(고용노동부 퇴직금 계산기 값)을 내야 한다.

## Sub-features

- `sev-html` 퇴직금 계산기(`/tools/severance.html`) 산정서 한 줄 `× 30 × 재직일수 ÷ 365`.
- `sev-period` 산정기간 — 퇴직일 5.31 이면 3.1부터(2월에 같은 날이 없을 때).
- `sev-exit` 퇴사 정리(`/exit`) 의 퇴직금 추정.
- `sev-api` 챗봇 계산 API `POST /api/tools/calc {tool:'calc_severance'}`.
- `sev-link` 챗봇 답 끝 「계산기에서 직접 확인」 링크 — `?start&end(퇴직일)&w1~w3&run=1` 로 열면 자동 계산돼 챗봇 답과 같은 금액.

## How to get to it (user POV)

- 상단 메뉴 「퇴직금 계산」 → `/tools/severance.html`.
- `/exit` 퇴사 정리 화면의 「퇴직금 추정」.
- AI 노동법 대화에서 퇴직금을 물으면 같은 API 를 부른다(대화 경로는 이 절차에 없음 — API 를 직접 친다).

## Driving it with verify.mts

Preconditions:

- doctor OK.

- **계산기.** 입사 `2023-01-01`, 퇴직일 `2026-01-01`(입력 칸은 퇴직일 = 마지막 근무일 다음 날), 1구간 임금 `9000000`, 「계산하기」. 결과에 `97,826.09 × 30 × 1,096일 ÷ 365 = 8,812,389원`.
- **산정기간.** 새로 열어 입사 `2021-06-01`, 퇴직일 `2026-05-31`. 구간 글자 `3.1~3.31 4.1~4.30 5.1~5.30`.
- **퇴사 정리.** `/exit` 입력 칸에 마지막 근무일 `2025-12-31`, 입사일 `2023-01-01`, 월 급여 `3000000`, 주 시간 `40`. 「퇴직금 추정」에 `8,812,389원`.
- **챗봇 링크.** `/tools/severance.html?start=2023-01-01&end=2026-01-01&w1=3000000&w2=3000000&w3=3000000&run=1` 을 연다. 결과 영역에 `8,812,389원`(자동 계산).
- **API.** `hire_date 2023-01-01, last_work_date 2025-12-31, wages_3months [3000000×3]` → `result.severance_pay = 8812389` (PC 폭 실행 때 한 번).

## Gotchas

- severance.html 은 Next 화면이 아니라 정적 html 이다. 엔진은 `node scripts/build-severance-engine.mjs` 가 주입한다 — 엔진을 고치고 이걸 안 돌리면 동기화 시험이 실패한다.
- 계산기 입력 칸은 퇴직일, /exit·API 는 마지막 근무일이다. 하루 차이를 헷갈리면 금액이 달라진다. 챗봇 링크는 `severance-link.ts` 가 하루를 더해 넘긴다(261028 이전에는 안 더해 8,804,348원이 나왔다).
- 8,812,389원은 고용노동부 퇴직금 계산기(moel.go.kr/retirementpayCal.do)에 같은 입력을 넣어 받은 값이다(2026-10-28).
