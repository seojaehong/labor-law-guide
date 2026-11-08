# k-labor 원격 HTTP 경계 보완

기준: PR #163의 `519d3602518e673aee7d7640d71d3074bad29a0c`. 기존 작성자 브랜치를 변경하지 않는 별도 보완안이다.

## 바뀌는 동작

- `mcp-handler@1.1.0`은 SDK 1.26.0에 고정되어 있어 제거한다. SDK 1.32.1의 Web 표준 Streamable HTTP 전송을 직접 사용한다.
- POST마다 서버/전송을 새로 만들고, JSON 응답 완료 뒤 종료한다. 세션·SSE GET·DELETE는 지원하지 않는다. 주소는 `/api/mcp/mcp` 그대로다.
- JSON 파싱 전에 실제 스트림을 **64 KiB**로 제한한다. 길이 헤더를 믿지 않는다. 잘못된 JSON·UTF-8은 400, 초과 본문은 413으로 반환한다.
- 파싱된 요청은 **중첩 32단계·객체 멤버/배열 원소 합계 2,000개**로 제한한다. 배치는 받지 않는다. SDK의 별도 `maxToolInputElements`도 **1,000개**로 설정한다.
- 이름·사업장·근무장소와 임의 계약 객체를 받는 `design_contract_wage`, `check_contract`는 원격에서 제외한다. 원격 목록은 calc·leave·tax·duties의 **21개**다. stdio 그룹 파일과 로컬 계약 도구는 변경하지 않는다.
- 입력은 원격 서버로 전송된다는 설명을 `initialize` 응답에 넣는다. 직접 로그를 남기지 않고 응답은 `Cache-Control: no-store`로 보낸다. 이것이 호스팅 사업자의 로그·보관까지 없다는 뜻은 아니다.

## 공개는 기본적으로 닫혀 있다

`K_LABOR_REMOTE_ENABLED`가 정확히 `true`가 아니면 POST는 503이다. 이 변경은 환경변수를 설정하거나 배포를 실행하지 않는다. **다음 조건을 확인하기 전에는 활성화하지 않는다.**

1. 원격 입력·처리 목적·보관/로그·위탁/제3자 처리·해외 처리 여부를 실제 운영과 맞게 고지한다. 계약 도구를 빼도 금액·입퇴사일 등이 개인 정보와 결합될 수 있고, 사용자가 임의로 식별정보를 전송하는 것까지 막지는 못한다.
2. 실제 함수 리전과 플랫폼 설정을 확인한다. `preferredRegion='icn1'`은 선호 선언이지 서울 실행의 증명이 아니다. 기존 프로젝트는 sin1 설정을 사용한다.
3. 요청 빈도·동시성·사용량 제한을 플랫폼에서 마련한다. 이 패치는 **요청 한 건의 자원 상한**이며, 전체 트래픽 남용 방어의 대체물이 아니다.
4. 본인 계정의 실제 MCP 호스트에서 초기화·21개 목록·성공/입력 오류·연속 호출·재연결을 확인한다. 로컬 메모리 안의 SDK 클라이언트 시험은 Claude 웹/모바일 호스트 실측을 대신하지 않는다.
5. 위 조건과 공개 승인 후에만 설정을 활성화한다. npm 게시, Registry 변경, production 배포 또는 병합은 이 패치 범위 밖이다.

64 KiB와 요소 상한은 현재 계산 입력을 위한 보수적인 초기값이다. 대량 입력을 지원해야 한다면 실제 사용례·자원 예산을 측정하고 경계시험을 함께 변경한다. 제한을 무제한으로 풀거나 `parsedBody`만 넘겨 스트림 검사를 생략하지 않는다.

## 보안 근거

- [GHSA-f897-62hf-6gxq](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-f897-62hf-6gxq): HTTP 본문·배치 길이 제한.
- [GHSA-46jr-4wx8-v453](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-46jr-4wx8-v453): 배열/객체 입력 요소 제한. 수정 버전 설치뿐 아니라 `maxToolInputElements` 설정도 필요하다.
- 기존 어댑터는 SDK 전 `req.json()` 예외를 처리하지 않는 경로가 있다. 직접 전송과 파싱 경계시험으로 이 의존을 제거한다.

## 확인 명령

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npx tsc --noEmit --incremental false
npx eslint 'src/app/api/mcp/[transport]/route.ts' src/lib/mcp/request-boundary.ts tests/unit/k-labor-remote*.test.ts tests/unit/k-labor-request-boundary.test.ts tools/k-labor/remote.mjs
```

패키지 lifecycle script를 실행하지 않고 의존성·시험을 확인할 수 있다. 전체 사이트 빌드에는 별도의 자산 생성 단계와 환경변수가 필요하며, 시험 통과만으로 배포 준비 완료라고 판단하지 않는다.
