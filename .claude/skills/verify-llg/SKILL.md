---
name: verify-llg
description: labor-law-guide(일의 무늬, 운영 https://yellowenvelope.kr) 계산 도구를 실제 브라우저로 사용자처럼 돌려 증거를 남긴다 — 상시 근로자 수·주휴수당·최저임금 확인·해고예고수당·퇴직금 계산기(severance.html)·퇴사 정리(/exit)·챗봇 계산 API. 도구를 고친 PR 을 병합한 뒤 운영 드라이런(개발게이트 G5), 「운영에서도 그렇게 보이나」를 확인할 때, 새 계산 도구를 붙인 뒤 기능 지도를 늘릴 때 쓴다.
---

# verify-llg — 계산 도구 운영 드라이런

합성 입력으로 화면을 직접 조작하고, 답 문장·금액이 기대값과 같은지, 금지어·콘솔 오류·모바일 가로 넘침이 없는지 PC(1280)와 모바일(390) 두 폭에서 본다. 도구는 모두 **브라우저 계산**이라 입력이 서버에 저장되지 않는다 — 운영을 돌려도 남는 상태가 없다.

## Launch

- **운영(기본)**: 띄울 것이 없다. 병합 커밋의 Vercel 배포가 끝났는지만 Doctor 로 본다.
- **로컬(선택)**: 저장소 루트에서 `npm.cmd run dev -- -p 3107` → 출력에 `Ready` 가 뜨면 `--base http://127.0.0.1:3107` 로 돌린다. 끝나면 띄운 그 터미널(그 PID)만 끈다. 로컬 모드는 2026-10-28 `retirement-tax` 로 처음 돌렸다(`-p 3126`, PC·모바일 PASS). `predev` 가 hwp-editor 를 내려받아 빌드하므로 첫 기동은 1분쯤 걸린다. 다른 워크트리와 포트가 겹치지 않게 번호를 바꿔 쓴다.
- Playwright 는 저장소 `node_modules` 의 것을 쓴다. 이 워크트리에 `node_modules` 가 없으면 `npm.cmd ci` (정션 금지). 급하면 다른 워크트리를 `NODE_PATH=<그 워크트리>/node_modules` 로 빌려 쓸 수 있다.

## Doctor — 돌릴 가치가 있는 인스턴스인가

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON .claude/skills/verify-llg/scripts/verify.mts doctor [--base <url>]
```

`FEATURES` 의 기능 경로가 전부 HTTP 200 이고, 운영이면 `origin/master` 커밋의 배포 상태가 `success` 일 때 `doctor: OK`(exit 0). 먼저 `git fetch` 해서 origin/master 가 방금 병합한 커밋인지 확인한다. 배포가 `pending` 이면 기다렸다 다시 친다 — 옛 빌드를 돌린 PASS 는 증거가 아니다.

## Drive

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON .claude/skills/verify-llg/scripts/verify.mts list
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON .claude/skills/verify-llg/scripts/verify.mts drive --feature notice-pay
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON .claude/skills/verify-llg/scripts/verify.mts drive --feature all [--base <url>] [--run <이름>] [--out <폴더>]
```

- 기능마다 `features/<id>.md` 의 「Driving it」 절차가 스크립트 `FEATURES[<id>].journey` 와 같다. 한쪽을 고치면 다른 쪽도 같은 PR 에서 고친다.
- 손잡이는 접근 가능한 이름(`getByLabel('알렸다')`)과 답 카드 `section[aria-live]` 를 쓴다. 위치(nth)를 쓰는 곳은 입력 순서가 화면 계약인 곳뿐이다.
- 결과 한 줄 = `PASS|FAIL 기능 폭 steps n/m banned k overflow x console y`. 하나라도 FAIL 이면 exit 1 이고 어긋난 단계의 기대·실제를 찍는다.
- 금지어 목록은 `src/lib/tool-kit/banned.ts` 를 그대로 import 한다(허용 구절 포함). 따로 적지 않는다.

## Evidence

- 위치: `artifacts/verify-llg/<run>/` — `report.json`(기능·폭·URL·HTTP·단계별 기대/실제·금지어·넘침·콘솔 오류) + `<기능>-<pc|mobile>.png`(전체 화면). `artifacts/` 는 `.gitignore` 에 있다.
- PR 댓글이나 원장에는 `drive: PASS` 줄과 run 이름, 실패면 ✗ 줄을 그대로 옮긴다.
- 증명 기준: 실제 사용자 경로(입력 칸에 넣고 버튼·라디오를 누른다)만 쓴다. 내부 함수 호출·시험용 엔드포인트로 대신하지 않는다. 퇴직금은 화면 셋(severance.html·/exit)과 챗봇 API(`/api/tools/calc`) 가 **같은 금액**인지까지 본다 — 정본 엔진 한 벌의 증거다.
- 분기가 갈리는 로직은 양쪽을 다 돈다(예: 예고 30일/29일, 주 15시간 이상/미만, 수습 감액/단순노무 제외).

## Cleanup

운영 모드는 띄운 프로세스가 없다 — Playwright 브라우저는 스크립트가 닫는다. 로컬 모드는 띄운 dev 서버 그 하나만 끈다(이름으로 node 를 죽이지 않는다). **증거 폴더는 지우지 않는다.**

## 새 도구를 붙일 때

1. `features/<id>.md` 를 아래 계약대로 쓴다(기대값은 손으로 센 값, 출처 한 줄).
2. `verify.mts` 의 `FEATURES` 에 같은 id 로 `path`·`journey` 를 넣는다.
3. 일부러 기대값을 1원 바꾼 사본으로 돌려 FAIL 이 나는지 본 뒤(자기시험) 원래대로 돌린다.
4. `features/README.md` 목록에 한 줄. 유지 루프는 `/pstack:maintain-verification-skill`.

## 기능 지도

[features/README.md](features/README.md)
