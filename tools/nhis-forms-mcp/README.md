# nhis-forms MCP (로컬 전용)

사이트 화면이 아니라 **이 PC 의 Claude Code 에서** 쓰는 도구다. 사이트와 같은 엔진(`src/lib/nhis-forms`·`src/lib/branch-directory`)을 묶어 쓰므로 서식이 한 벌로 유지된다.

| 도구 | 하는 일 |
|---|---|
| `find_branch` | 주소·사업자번호 → 건보 관할 지사와 담당 전화·팩스 |
| `make_form` | 자격상실(8호)·취득(6호) + 지연 사유 사업주확인서 PDF. 명단은 `peopleFile`(JSON 파일)로만 받는다 — 주민번호가 모델 대화에 실리지 않는다 |
| `popbill_status` | 팝빌 연결·잔액·팩스/문자 권한·발신번호 |
| `send_fax` / `fax_result` | 팩스 전송(`confirm:true` 일 때만) · 결과 조회 |
| `send_sms` / `sms_result` | 문자 전송(`confirm:true` 일 때만) · 결과 조회 |

- 설정 = `~/.claude/.env` 의 `POPBILL_LINK_ID`·`POPBILL_SECRET_KEY`. 선택 `POPBILL_IS_TEST`(기본 true)·`POPBILL_CORP_NUM`(기본 위너스)·`POPBILL_FAX_SENDER`(기본 0504-499-2647)·`POPBILL_SMS_SENDER`
- 주민번호는 PDF 로만 만들어지고 팩스로 팝빌에만 나간다. 도구 응답에는 싣지 않는다
- 빌드: `npm.cmd install && npm.cmd run build` → 등록: `claude mcp add nhis-forms -s user -- node <이 폴더>/dist/server.mjs`
- 시험: `node smoke.mjs`(합성 값, 전송 안 함)
- 엔진(`src/lib/nhis-forms`)을 고치면 다시 빌드해야 반영된다
