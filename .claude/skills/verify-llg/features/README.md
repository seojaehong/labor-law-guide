# 일의 무늬 계산 도구 검증 지도

계산 도구의 사용자 동작을 검증하는 정본 목록이다. 돌리기 전에 이 색인을 읽고, 해당 기능 파일을 절차로 쓴다.

## 공통 전제

- 운영 `https://yellowenvelope.kr`(기본) 또는 로컬 `http://127.0.0.1:3107`.
- `verify.mts doctor` 가 OK 여야 한다(경로 200 + 병합 커밋 배포 success).
- 입력은 합성 값만 쓴다. 실명·주민번호·실제 급여 금지.
- 폭 두 개: PC 1280×900, 모바일 390×844.

## 운전 규칙

- 각 절차는 페이지를 새로 연 상태에서 시작한다.
- 답은 답 카드(`section[aria-live]`) 글자로 판정한다. 퇴직금 계산기는 `#resultArea`, /exit 는 `section[aria-label="확인용 추정"]`.
- 접근 가능한 이름이 있는 컨트롤은 이름으로 누른다.
- 화면 공통 점검: 금지어 0(`src/lib/tool-kit/banned.ts`), `document.documentElement.scrollWidth > innerWidth` 거짓, 콘솔 오류 0.

## 증거·건너뜀 보고

- 단계마다 기대값과 실제 글자를 `report.json` 에 남기고 화면 전체 캡처를 남긴다.
- 들어가지 못한 경로는 시도한 명령과 못 맞춘 전제를 적는다. 다른 경로로 돌린 것을 그 경로의 증거로 쓰지 않는다.

## 기능 파일 계약

H1 제목, 사용자 입장 한 문단, 그다음 H2 넷을 이 순서로: `Sub-features` · `How to get to it (user POV)` · `Driving it with verify.mts` · `Gotchas`.

## 기능

- [상시 근로자 수 계산기](./headcount.md) — `/tools/headcount`
- [주휴수당 계산기](./weekly-holiday-pay.md) — `/tools/weekly-holiday-pay`
- [최저임금 확인 계산기](./min-wage.md) — `/tools/min-wage`
- [해고예고수당 계산기](./notice-pay.md) — `/tools/notice-pay`
- [퇴직금 계산기 · 퇴사 정리 · 챗봇 계산 API](./severance.md) — `/tools/severance.html`, `/exit`, `/api/tools/calc`
- [실수령액 계산기](./take-home-pay.md) — `/tools/take-home-pay`
