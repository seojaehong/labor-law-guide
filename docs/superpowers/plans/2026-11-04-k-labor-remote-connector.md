# k-labor 원격판 · Claude 커넥터 디렉터리 — 2단계 계획 (개발게이트 + pstack)

작성 2026-11-04(KST) · 상태 **초안, 재홍님 결정 대기**
선행 = 1단계 완료(k-labor 0.1.1 npm·공식 MCP 레지스트리 등재, PR #162 `a698845`).
근거 문서 = 아래 「확인한 사실」 절. 확인하지 못한 것은 그 절 끝에 따로 둔다.

## 한 줄 요약

디렉터리는 **공개 데이터용 커넥터를 인증 없이 받는다.** 그래서 k-labor 원격판은 OAuth 없이 **개인정보 입력칸이 없고 이 PC 파일을 읽거나 쓰지 않는 도구만** yellowenvelope.kr 안에 올리는 것으로 시작한다. nhis·popbill(주민번호 명단·팩스 발송)은 원격판에서 뺀다. 산재 도우미의 OAuth는 이 일과 떼어 따로 정한다.

## 확인한 사실 (261104)

| # | 사실 | 출처 |
|---|---|---|
| F1 | 「OAuth 2.0 if your tools act on a user's account, or no authentication for public data」 | claude.com/docs/connectors/building/submission |
| F2 | 무인증 = 「Supported by default」, 일부 도구만 로그인 요구하는 lazy authentication 도 있음 | …/building/authentication |
| F3 | 모든 도구에 `title` + `readOnlyHint` 또는 `destructiveHint`. 읽기 전용은 확인 없이 실행, destructive 는 매번 확인 | …/building/review-criteria, 정책 5.E |
| F4 | GET·POST 를 한 도구에서 받는 catch-all 도구는 반려. 쓰기는 생성·수정·삭제로 쪼갬 | review-criteria |
| F5 | 「Your server must call your own first-party APIs, or APIs you legitimately proxy. The MCP server domain should match your service.」 | review-criteria, 정책 3.F |
| F6 | 제출 = 유료 플랜(Pro·Max·Ultra는 본인 계정, 역할 확인 없음). Company 칸 = 회사명·웹사이트·연락처, 사업자 검증 절차는 문서에 없음 | …/directory/publish, submission |
| F7 | 필수 = 문서 URL·처리방침 URL(수집·이용·보관·제3자 제공·보존·연락처, 없으면 즉시 반려)·지원 연락처·아이콘·slug(게시 뒤 못 바꿈) | submission, 정책 3.A |
| F8 | 심사용 시험 계정 = 「required」(무인증 면제 문구 없음, 제출 단계에 「where relevant」만) | review-criteria, submission |
| F9 | 자동 스캔 → 기본 Community 등재, 일부만 사람 심사. 등재 뒤에도 계속 심사. 문의 mcp-review@anthropic.com | submission, 정책 1 |
| F10 | 법률 영역은 고위험 사용 — human-in-the-loop 와 소비자 직접 고지 필요(세부는 AUP) | 정책 1.A·1.B |
| F11 | Streamable HTTP 권장, 도구 이름 64자 이하, 토큰 절약, 일반 오류 문구(「Internal Server Error」만) 반려 | 정책 5.A~5.F |
| F12 | 제출 전에 본인 계정 커스텀 커넥터로 모든 도구를 직접 돌려 봤다고 확인해야 함 | testing, submission 8단계 |
| F13 | `mcp-handler` `withMcpAuth` 는 401 에 `resource_metadata=<origin>/.well-known/oauth-protected-resource` 를 **늘 적기만** 한다. 문서는 앱이 `protectedResourceHandler({ authServerUrls })` 로 따로 내야 하고, 그 값 = **인가 서버 주소**가 필요하다 → 산재 원격판 PRM 404 의 원인 | sanjae-apply `node_modules/mcp-handler/dist/index.js:891-1033` (1.1.0) |
| F14 | k-labor 각 묶음이 `*RemoteSafe`·`*LocalOnly` 를 export 하지만 소비하는 코드가 없다. `nhis`·`popbill` 7개는 `server.tool()` 옛 방식이라 title·annotations 없음, smoke 도 이 7개를 검사하지 않음 | `tools/k-labor/server.mjs:8-71`, `groups/*.mjs`, `smoke.mjs:139` |

**확인하지 못한 것**
- U1 무인증 커넥터도 시험 계정을 내야 하는지(F8 「where relevant」의 해석). → 제출 화면에서 확인, 막히면 mcp-review@anthropic.com 문의
- U2 법령 원문 조회·계산기가 「legal 고위험 사용」에 드는지, 든다면 고지 문구의 모양(AUP 미독). → AUP 읽기는 3단계 전에
- U3 법제처 API 호출이 F5 「legitimately proxy」로 인정되는지. 법제처는 영리 이용·재제공을 허용하고 출처 표시만 요구한다(L4) → 인정 근거는 있다. 응답에 출처(「국가법령정보센터」)를 싣고 제출 화면 7단계에 「제3자 API」로 밝힌다
- U4 법제처 OC 등록 기준 → 아래 「법제처 OC」 절. 남은 것 = 재홍님 등록 목록 확인 1건

## 법제처 OC (젠스파크 리서치)

젠스파크 딥리서치(261104, 원문 = 세션 scratchpad `gsk_oc/report.md`, 휘발) + 직접 실측.

| # | 내용 | 확실성 |
|---|---|---|
| L1 | 신청 때 **서버 IP(최소 1개, 「추가 IP」 칸 있음)와 도메인을 함께 등록**. 승인 1~2일. 오류 응답 원문 「정확한 서버장비의 IP주소 및 도메인주소를 등록해 주세요」 | 확인됨(open.law.go.kr 이용안내·실제 응답) |
| L2 | 도메인은 **Referer 헤더**로 검증되는 것으로 보임 — 공개 원격 MCP `chrisryugj/korean-law-mcp` 가 「Referer 가 없으면 OC 가 유효해도 검증 실패」로 Referer 자동 주입을 넣었다(CHANGELOG) | 2차 출처 다수, 공식 문서 없음 |
| L3 | 「해외 IP 차단」 공식 문구는 없다. 등록 IP 불일치 차단만 공식. korean-law-mcp 는 도쿄 리전에서 TCP 드롭 → 싱가포르로 옮겨 복구(이슈 #78, 스니펫만) · 클라우드 IP 에서 한글 질의 `totalCnt:0` 안티봇 의심(k-skill #404) | 추정 |
| L4 | 일일 한도 수치 없음(「트래픽 초과 시 제한」). 영리 이용 허용, 출처 표시 의무. 문의 044-200-6797(제한·신청)·02-2109-6446(기술) | 확인됨 |
| L5 | 대안 = 공공데이터포털 법제처 API(`apis.data.go.kr/1170000/law/...`) — **serviceKey 만, IP 등록 없음**, 자동 승인, 개발계정 일 10,000회, 공공누리 1유형. 데이터 범위가 DRF 와 같은지는 미확인 | 확인됨 / 범위 미확인 |
| L6 | Vercel 고정 발신 IP = Static IPs(Pro 이상, 프로젝트당 월 $100 + 전송비) | 확인됨(vercel.com) |
| L7 | **실측 261104**: 이 PC·서버2(오라클 서울 `140.245.x.x`, KR)에서 Referer 없이도, `Referer: https://yellowenvelope.kr/` 를 넣어도 `lawSearch.do` 정상. 우리 `law-drf.mjs:56` 은 Referer 를 보내지 않는다 | 실측. 단 두 IP 가 우리 OC 에 등록돼 있는지 모름 → 판정 불가 |

**판단**: 원격판은 Vercel icn1 의 유동 IP 에서 부른다. 등록 IP 검사가 실제로 걸리면 Static IPs($100/월)나 공공데이터포털 경로가 필요하다. 그래서 work-rules 를 원격판 1차 범위에서 빼는 D1 추천을 유지한다. 판정에 필요한 것은 하나뿐이다.
- **재홍님 확인 1건**: open.law.go.kr 로그인 → OPEN API 신청 내역에서 **등록된 IP·도메인 목록**. 이 PC·서버 IP 가 없는데 통과했다면 IP 검사는 사실상 꺼져 있고(Referer·국내 여부만), 원격판 icn1 + `Referer: https://yellowenvelope.kr/` 로 갈 수 있다. 있으면 icn1 시험 배포로 실측한 뒤 정한다
- 그 뒤 yellowenvelope.kr 도메인을 등록 목록에 추가하고 `law-drf.mjs` 에 Referer 를 넣는다(로컬판도 무해)

**(교정 261104) 등록 목록 대조 결과** — 등록 = 도메인 없음 · IP `168.107.31.164`(서버1)·`140.245.79.0`(서버2, 대역이 아니라 실제 주소) · OC 승인 2026-02-14. 이 PC `222.111.222.77` 은 **미등록인데 Referer 없이 통과** → 등록 IP 검사는 지금 엄격하지 않다. 원격판 icn1 도 통과할 가능성이 높으나 클라우드 대역 안티봇(L3) 때문에 **G5 시험 배포 실측으로 확정**한다. 재홍님이 도메인 `yellowenvelope.kr` 등록 완료(261104 밤) — 등록 뒤 이 PC·서버2에서 Referer 넣은 호출 정상(totalCnt 3). work-rules 를 원격판 1차 범위에 넣을지는 icn1 실측 뒤 다시 본다

## 재홍님 결정 필요

- D1 원격판 범위 — 추천: **calc·leave·tax·duties·contract(설계·점검)** 부터. work-rules 는 U3·U4 정리 뒤. nhis·popbill 은 원격판 제외(주민번호 명단·발송 책임)
- D2 위치 — 추천: **yellowenvelope.kr/api/mcp** (F5 도메인 일치, 처리방침·문서 URL을 사이트에 둠). 별도 Vercel 프로젝트는 도메인이 갈라져 F5 위험
- D3 인증 — 추천: **무인증**(F1·F2). 남용은 Vercel WAF 속도 제한으로
- D4 산재 도우미 — OAuth 를 붙여 디렉터리로 갈지, 로컬판·웹 편집기만 둘지. 주민번호를 받는 도구라 무인증 공개는 권하지 않는다
- D5 디렉터리 등재 문구의 Company 칸 — 개인(재홍님) / ITW / 위너스 중 무엇으로. 처리방침 운영자와 같아야 한다([[feedback_itw_entity_no_dual_job]] 참고)

## 개발게이트 관문

크기 = **새 기능**(원격 진입점·도구 걸러내기) → G0부터 전부.

### G0 필요성
1. 제품지도 자리: 일의 무늬 「도구」 영역의 배포 경로 확장(사이트 계산기 → AI 대화창). 새 계산은 없다
2. 지금의 대안: 로컬판 `npx -y k-labor mcp` (Claude Code·Desktop 사용자만). claude.ai 웹·모바일 사용자는 쓸 길이 없다
3. 증거: 행동 증거 **없음**(외부 사용자 문의·이슈 0). 재홍님 방향 결정(261103 「커넥터 디렉터리 등록」)만 있다
4. 가장 작은 다음 관찰: 만들지 않고 할 수 있는 것은 없다 — 대신 **본인 계정 커스텀 커넥터**(F12)까지를 1차 목표로 끊고, 디렉터리 제출은 2026-12-31 판정 전에 「권유한 노무사가 claude.ai 에서 써 봤는가」를 본 뒤 정한다

### G1 실행경로 지도
| 단계 | 파일:줄 | 재사용 |
|---|---|---|
| 입력 | `tools/k-labor/server.mjs:45-62` 묶음 선택 | 그대로(stdio) |
| 등록 | `server.mjs:69-71` → `groups/*.mjs register*()` | `register*(server, { remote })` 인자 추가 |
| 판정·계산 | `src/lib/**` 엔진(번들) | 그대로 |
| 출력 | `lib/common.mjs:28 text()` 주민번호 가림 | 그대로 |
| 원격 진입 | (없음) → `src/app/api/mcp/[transport]/route.ts` 신설 | 산재 `src/mcp/server.ts:288` 패턴(mcp-handler) |

형제 산출물: `server.json`(remotes 추가) · `src/content/ai-tools.ts`(`remote:` → `serverCard()` 자동) · `tests/unit/ai-tools.test.ts`(remotes 기대값) · k-labor README · `/ai-tools` 카드 문구 · 처리방침 페이지 · `vercel.json`/라우트 `preferredRegion='icn1'` · verify-llg FEATURES

### G2 상태어
- 「원격 가능」 = 이 PC 파일을 읽지도 쓰지도 않고, **입력에 이름·주민번호 칸이 없는** 도구. 「원격 가능」은 「외부 호출 없음」이 아니다(work-rules 는 법제처를 부른다 — 별도 꼬리표 `openWorldHint:true`)
- 반례: `find_branch` 는 개인정보가 없지만 사이트 API(IP당 하루 60회)를 부른다 → 원격에서는 서버 IP 하나가 한도를 다 쓴다. 원격판 제외 또는 직접 엔진 호출로 바꿈
- 반례: `check_contract` 는 계약 JSON 에 근로자 이름이 들어올 수 있다 → 「이름 선택·주민번호 거절」이 이미 있음(`looksLikeRrn`). 원격판 처리방침에 「이름은 저장하지 않음」 명시

### G3 조각 (각 조각 = 실패 시험 먼저)
1. **도구 걸러내기** — RED: `register*(server, { remote:true })` 로 등록한 목록에 `*LocalOnly`·nhis·popbill 이 없다 / 모든 도구에 title·readOnlyHint|destructiveHint. stdio 판 목록은 37개 그대로
2. **원격 진입점(calc 하나)** — RED: `/api/mcp/mcp` 에 initialize·tools/list·tools/call(`check_min_wage`) 200, 응답 헤더 `X-Vercel-Id` 가 icn1
3. 나머지 원격 가능 묶음(leave·tax·duties·contract 설계·점검)
4. 처리방침·문서 페이지, `server.json` remotes, `ai-tools.ts remote:` (시험이 server-card 대조)
5. (D1 이 허락하면) work-rules — OC·법제처 조건 정리 뒤

### G4 수렴
조각마다 `/pstack:interrogate <브랜치>` 1회(fable+opus). 판정표 `references/G4_수렴표.md` 로 옮긴다. 형제 산출물 행 전부 확인.

### G5 운영 드라이런
1. 병합 커밋 배포 READY
2. 전체 시험 + `npm run smoke`(k-labor) — stdio 37개 불변
3. 원격 `curl` 4종(initialize·tools/list·tools/call 성공·잘못된 입력 오류 문구) + 응답 리전 icn1
4. **본인 claude.ai 커스텀 커넥터로 모든 도구 1회씩**(F12) — 웹·모바일
5. verify-llg 에 기능 `mcp-remote` 추가(`/pstack:maintain-verification-skill`)
6. 남은 것 → PR 댓글·노션 작업 큐·원장

## pstack 연결

| 관문 | 부를 것 | 비고 |
|---|---|---|
| G1 | `/pstack:how` (261104 완료 — 위 F14) · `/pstack:blast-radius tools/k-labor/server.mjs` | 증명할 사실 = 「remote 인자 없이 부르면 stdio 등록 목록이 지금과 같다」를 실제 실행으로 |
| G3 | `/pstack:tdd` 또는 superpowers TDD (둘 중 하나) | |
| G4 | `/pstack:interrogate feat/k-labor-remote` | 자동 적용 금지 |
| G5 | `/pstack:maintain-verification-skill` | verify-llg 에 원격 MCP 기능 추가 |
| 병합 | poteto-mode 「babysit」 | 또치 댓글 확인 뒤 |

pstack 스킬은 모델이 직접 부를 수 없다 — 해당 관문에서 위 명령 한 줄을 재홍님께 드린다.
