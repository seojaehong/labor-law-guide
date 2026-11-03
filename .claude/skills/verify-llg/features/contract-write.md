# 근로계약서 작성

월 임금 총액과 근무형태(근무 요일·출퇴근·휴게·공휴일 근무 예정)를 넣으면 기본급(주휴 포함)·연장·휴일·연차 항목별 월 인정시간과 금액을 나누고, 만든 계약을 근로계약서 점검 규칙으로 다시 돌린 결과를 보여 준 뒤 엑셀·한글(hwpx)·PDF 로 내려받는다. 계산과 파일 생성은 모두 브라우저 안에서 한다(PDF 글꼴 파일 GET 하나만 서버로 간다).

## Sub-features

- `cw-required` 빈 입력 = 「입력이 필요합니다: 사업체명, 근로자 성명, 계약 시작일, 월 임금 총액」.
- `cw-uijeongbu` 의정부 주4 표본(261103 교정) · 월·화·수·목 10:00~22:00 · 휴게 155분 · 공휴일 22일 · 월 2,600,000 = 기본급(잔액) 166.85시간 1,870,364원 · 연장 36.93시간 414,013원 · 휴일 21.76시간 243,879원 · 연차 6.4시간 71,744원 · 통상시급 11,209.99원 · 점검 되먹임 「손볼 항목이 없습니다」. 출처 `tests/unit/contract-write-design.test.ts`·`contract-write-check.test.ts`.
- `cw-rounding` 「100원 미만 버림」 = 1,870,500 / 414,000 / 243,800 / 71,700(재홍님 261103 단위 선택).
- `cw-absorb` 잔액을 「휴일근로수당」으로 = 휴일근로수당(잔액) 243,879원.
- `cw-files` 엑셀(PK)·한글(PK)·PDF(%PDF) 내려받기, 증거 폴더에 `contract-write-<폭>.<확장자>`.
- `cw-no-send` 입력값(총액·근로자 이름)이 실린 요청 0건.

## How to get to it (user POV)

- `/tools` 목록 「근로계약서 작성」, 또는 `/tools/contract-write`. 칸을 채우면 아래 「임금 구성」이 바로 바뀐다(버튼 없이).

## Driving it with verify.mts

- `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON .claude/skills/verify-llg/scripts/verify.mts drive --feature contract-write [--base http://127.0.0.1:<포트>]`
- 하이드레이션을 기다린 뒤(「사업체명」 입력에 React props) 채운다. 결과는 `#cw-result` 글자 전체로 본다.
- 근무 요일 기본값은 월~금이라 「금」을 눌러 끈다.

## Gotchas

- 선택지 버튼 묶음을 `<label>` 로 감싸면 첫 버튼이 라벨 글자 전체를 이름으로 가져가 `getByRole('button', { name })` 이 못 찾는다(261103 실측 — 화면 읽기 프로그램에도 틀린 이름). Field 는 `<div>` 다.
- 「(잔액)」 표시는 항목 이름에 붙어 `innerText` 에서 공백 없이 나온다(「기본급(주휴 포함)(잔액)」).
- 100원 미만 버림을 고르면 점검 되먹임에 「산출근거-금액 정합」 차이가 뜰 수 있다(항목 금액이 통상시급 × 시간보다 최대 99원 적다). 의도된 표시다.
