# 퇴고 — 업무 문서 문체·맞춤법 점검

의견서·보고서·강의안·공문을 붙여 넣으면 문체 상투어(im-not-ai 공개 사전 115항목)·띄어쓰기·문장 부호(한글 맞춤법)·연결어미 뒤 쉼표를 줄과 칸 단위로 찾아 원문에 칠하고 목록으로 보여 준다. 판정은 k-labor 엔진의 `checkProse`(범용 팩만)·`checkNorms` 를 묶은 브라우저 묶음(`src/lib/toego/engine.bundle.mjs`, `scripts/build-toego-browser.mjs` 가 predev·prebuild 때 만든다)이 브라우저 안에서 낸다. 글은 서버로 보내지 않는다.

## Sub-features

- `toego-example` 합성 예문 버튼 넷(의견서·보고서·강의안·공문) — 글과 문서 종류를 채우고 바로 점검한다.
- `toego-run` 직접 붙여 넣고 「점검하기」 — 요약(반드시 교정·문맥 확인 곳 수), 검사별 건수, 원문 표시(`[data-toego-original] mark`, A 실선·B 점선), 걸린 곳 목록(`[data-toego-check=<검사>]`, 줄·칸·등급·이유·고칠 방향·근거).
- `toego-stop` 멈춤 — 빈 글·40만 자 초과·주민등록번호 모양(`[data-toego-stop]`, 엔진과 같은 문구 + 해당 줄).
- `toego-mcp` MCP 연결 명령(`[data-toego-mcp-command]`) — README 의 `claude mcp add --scope user k-labor -- npx -y k-labor mcp --groups docs`.

## How to get to it (user POV)

- `/tools` 목록 「문서·규정」 묶음의 「퇴고 — 업무 문서 문체·맞춤법 점검」.
- 모바일 햄버거 메뉴 「퇴고(문서 점검)」.
- 주소 `/tools/toego` 직접.

## Driving it with verify.mts

Preconditions:

- doctor OK.

- **예시 보고서.** `drive --feature toego`. 「예시: 보고서」를 누르면 요약 줄이 `반드시 교정 3곳 · 문맥 확인 6곳`(손으로 센 값 — 문체 B 6: 현장의 숨결·들여다보·사이의 틈을·단단한 토대·공감을 도모·성공을 달성 / A 3: 「할수」 제42항·「다 .」 마침표 앞 빈칸·「보이며,」 연결어미 뒤 쉼표), 문서 종류 「컨설팅」이 눌린 상태, 원문의 「할수」가 `data-grade="A"`, 띄어쓰기 목록에 「제42항」, 문체 목록에 「im-not-ai」.
- **직접 입력 · 요청 0.** 「점검할 글」에 `합성표지글 문서를 검토할수 있다 .` 를 넣고 「점검하기」 → `반드시 교정 2곳 · 문맥 확인 0곳`(「할수」 제42항 · 「다 .」). 누른 뒤 결과가 뜰 때까지 네트워크 요청 0건.
- **주민등록번호 모양.** `첫 줄` / `합성표지글 900101-1234567`(합성 번호) → 「점검하기」 → `[data-toego-stop]` 에 「입력에 주민등록번호 모양의 숫자가 있어 멈췄습니다. 가린 뒤 다시 점검해 주세요.」와 「해당 줄: 2줄」.
- 여정 전체에서 `합성표지글` 이 실린 요청(주소·본문) 0건.

## Gotchas

- 기대값은 엔진 규칙에 묶여 있다 — `tools/k-labor/lib/prose` 의 범용 사전·규범 규칙이 바뀌면 예시의 곳 수도 바뀐다. 그때는 `tests/unit/toego-browser.test.ts`(엔진과 같은 응답)가 먼저 깨지지 않았는지 보고 이 파일과 `verify.mts` 를 같이 고친다.
- 「점검하는 동안 요청 0」은 결과가 뜰 때까지의 창만 본다. 방문 통계(GA)는 페이지를 여는 순간 따로 나간다 — 그 요청에 글이 실리지 않는지는 마지막 단계(`합성표지글` 0건)가 본다.
- 로컬 dev 는 HMR 연결 때문에 요청이 섞일 수 있다 — 요청 수 단계가 흔들리면 운영(또는 `next start`)에서 다시 본다.
