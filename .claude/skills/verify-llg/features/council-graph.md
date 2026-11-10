# 노사협의회 회의록 그래프

노사협의회 기록 폴더(회의록 .json · `_이행기록.jsonl` · `_회의록이력.jsonl` · `_고충대장.jsonl`)를 브라우저 안에서 읽어 회의·안건·이월·이행·고충의 연결을 sigma.js(WebGL) + graphology + ForceAtlas2 로 그린다. 파일은 서버로 보내지 않는다.

## Sub-features

- `cg-sample` 「가상 예시 보기」 — 가상 사업장 회의 3건·이행 2건·고충 2건으로 그린다.
- `cg-folder` 「기록 폴더 열기」(webkitdirectory) · 「파일 고르기」 — 로컬 도구가 만든 기록 폴더를 연다.
- `cg-filter` 종류 체크 · 회의 기간 · 「기한 지난 이행·고충만」.
- `cg-select` 노드를 누르면 오른쪽에 종류·상태·이어진 선(선 목록에서 다른 노드로 이동).

## How to get to it (user POV)

- `/tools` 목록 「문서·규정」 묶음의 「노사협의회 회의록 그래프」.
- 주소 `/tools/council-graph` 직접.

## Driving it with verify.mts

Preconditions:

- doctor OK.

- **가상 예시.** `drive --feature council-graph`. 「가상 예시 보기」를 누르면 요약 줄이 `회의 3건 · 안건 7건 · 이월 2번 · 이행 3건 · 고충 2건 · 기한 경과 3건`(손으로 센 값 — 이행 기한 경과 2건: 냉난방 설치 07-31 진행 중·교육 일정 공지 10-15 미착수, 고충 G-2026-002 통보 기록 없음), 그래프 상자에 canvas 가 생긴다. 「기한 지난 이행·고충만」을 켜면 「보이는 노드」가 줄고, 기간을 2026-06 으로 좁혀도 준다.

## Gotchas

- 「기한 경과」는 오늘(KST)과 비교한다 — 예시 날짜는 모두 2026-10-15 이전이라 2026-11-10 뒤에는 값이 같다.
- 노드 선택(`cg-select`)은 WebGL 캔버스 좌표 클릭이라 아직 절차가 없다.
- 폴더 열기(`cg-folder`)는 파일 선택 창이 떠서 헤드리스 절차가 없다 — 같은 읽기 규칙은 `tests/unit/nosa-council-graph-view.test.ts` 가 본다.
