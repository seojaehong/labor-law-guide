# 법률 검증 구조 조사 및 변경

기준: master f942e3c (PR52 캐시 수정 포함). 코드 조사이며 운영 환경변수·DB 데이터·API 연결 상태는 확인하지 않았다. 키를 읽거나 출력하지 않았고 실제 유료 API 호출·문서 전송·운영 변경은 하지 않았다.

- 취업규칙: `src/lib/laws/rules-check.ts`, `standard-check.ts`, `src/app/laws/RulesCheck.tsx`. 브라우저에서 문단·제목·키워드·정규식, 시행기간·상시검사·과거 필수개정 검사를 수행한다. 입력 본문을 AI에 전송하지 않는다. 정적 데이터 로딩 실패는 이미 오류로 처리한다. 문구 일치는 법률 적합성이 아니다.
- 채팅 생성: `src/lib/vertex/client.ts`, `anthropic-fallback.ts`, `src/app/api/chat/route.ts`. 기존 Vertex Gemini 및 Anthropic fallback이 있다. 검색 임베딩은 OpenAI, 검색 재정렬·재작성에도 공급자 설정이 있다. 기능별 구성이므로 API가 전혀 없다는 설명은 잘못이다. 키 하나만으로 전체 법률 정답 검증이 보장되지 않는다.
- 법령 확인: `src/lib/legal-verify.ts`는 Supabase `law_articles` 캐시의 법명·조문 라벨 존재를 조회했다. 오류·자료 부족에도 빈 hallucinated 배열을 반환했고 생성문은 조회 전에 스트리밍됐다. `src/lib/chat/citations.ts`는 검색 출처 ID 존재 검사이며 의미 검증이 아니다. `src/lib/chat/context/laws.ts`의 모델 지시도 강제 검증이 아니다.
- 오프라인: `scripts/laws/fetch_law_revisions.py`, `daily_update.sh`, `rules_impact.py`, `work_rules_map.json` 및 `public/data/laws/*.json`은 수집·매핑·생성 파이프라인이다. 매 요청의 실시간 법제처 검증과 구별한다. 기존 PR51 생성 규칙 축소 방어와 PR52 캐시 변경은 보존했다.

## 변경과 운영 영향

캐시 조회는 지연 초기화·3초 제한·응답 형태 검사·조문 삭제/시행일/출처/중복 개정 검사를 수행한다. unknown/error는 항상 review_required다. reference_found는 참조 확인만 뜻하고 전체 상태는 여전히 review_required다. 빈 hallucinated는 적합 판정 신호로 사용할 수 없다.

채팅 모델 본문은 클라이언트에 스트리밍하지 않는다. 확인 불가·상충 근거, 불완전 생성, 명시적 확신 과장 문구는 본문을 보류한다. 모든 추출 인용의 캐시 출처·시행일이 확인된 완성 응답은 검토 필요 고지를 먼저 표시하고 미검수 참고 초안으로 제공한다. 이는 의미·사업장 적용성 검증이나 적합 판정이 아니다. 정규식 과장 탐지는 보조 장치이며 모든 과장 표현을 탐지하지 못한다. 근거 없는 답변 보류와 스트리밍 지연은 의도적인 기능 제한이다. 원문 생성은 여전히 기존 공급자로 수행되며 새 외부 API는 추가하지 않았다. 운영 적용 전 부모의 diff·위험 검토가 필요하다. 전문가 검수 없는 상태를 환경변수 하나로 통과시키는 우회는 두지 않았다.

취규는 기존 기간/매칭 검사를 유지하면서 근거 조문/시행일이 없거나 부정확하면 검토 필요, 별도 후보 조문에 옛 문구가 공존하면 검토 필요로 낮춘다. UI·내보내기는 문구 일치와 법률 판단을 구별한다. 정적 매핑의 법령 내용 자체가 정확하다는 보증은 추가하지 않는다.

## 후속 보안 설정

추가 AI 검증 공급자를 임의 선택하지 않았다. 기존 Vertex(프로젝트/지역/인증)·Anthropic(키/모델) 구조가 우선이다. 별도 보조 검증 API는 공급자·명시적 문서 전송 동의·보관 정책 및 키 보안 설정 결정 후 별도 작업이다. 보조 AI 일치도 최종 법률 검증 완료를 뜻하지 않는다. 이번 변경에는 자격증명 생성·저장·권한 확대가 없다.

## 로컬 검증 (합성 입력)

- 전체 Vitest: 918 통과 / 920, 홈 화면 검사 2건 실패. `origin/master`를 `/tmp/labor-baseline`에 추출해 같은 2건을 재현했다. 관련 회귀·신규 테스트는 통과했다.
- 변경 TS/TSX·테스트 ESLint 및 `tsc --noEmit`: 통과. 전체 lint는 변경하지 않은 파일의 기존 8 errors / 18 warnings로 실패했다.
- Python 구문 검사 및 TS/Python 매처 parity: 통과. 판정 소스 해시와 실제 public 데이터 해시를 동기화했다(기존 RULE_VERSION도 실제 데이터와 달랐다).
- 외부 placeholder 설정으로 Next 빌드: 변경 브랜치와 기준 master 모두 FAQ 정적 생성 60초 시간 초과가 재현됐다. loopback 합성 fixture로는 두 브랜치 모두 컴파일·타입·103개 정적 생성과 전체 빌드가 완료됐다. 운영 설정 검증이 아니다.
- Supabase 문서/changelog 조회는 네트워크 403이었다. 새로운 Supabase 기능·스키마는 도입하지 않았으며 기존 select/filter와 설치된 SDK 타입으로 검증했다. 운영 쿼리는 실행하지 않았다.

GitHub 브랜치 푸시는 성공했다. 초안 PR 생성은 `POST https://api.github.com/graphql: Forbidden`으로 실패했으며 PR은 생성되지 않았다. PR 본문 초안은 `/tmp/labor-pr-body.md`에 남겼다. 배포·병합은 하지 않았다.

## 추가 검토 보완

- 원본 `scripts/laws/work_rules_map.json`의 44개 규칙은 `law`가 없는 raw 계약이다. Python CLI는 기존 index의 lawId로 법명을 보강하고 검토 필요 기호를 처리한다. 원본 map 전체 CLI 실행·JSON 내보내기 및 미확인 lawId의 검토 필요 출력 회귀검사를 추가했다. 전체 법령 명칭 변경의 `본문` 식별자도 명시적인 근거로 인정하되 법률 적합성을 보증하지 않는다.
- 인용부호 법명, 동일 법명 뒤 복수 조문(제 생략 포함), 미지원 법률·시행령·시행규칙 인용을 수집한다. 일부만 확인된 혼합 답변과 범위 인용은 보류한다. 일반 숫자·출근율 100%는 인용이나 확신 과장으로 처리하지 않는다. `근로자퇴직급여 보장법`은 보장 주장과 구별한다. 이 검사는 명시적 조문 참조 범위이며 모든 자연어 법률 주장·생략형 인용을 포괄하지 않는다.
- 취소된 요청/응답은 private collector가 AbortError로 다음 청크 소비를 중단하고, 취소를 공급자 fallback으로 재시도하지 않는다. 검증 조회에도 취소 신호를 연결했다. SDK 호출 전 구간의 즉시 네트워크 취소까지 보장하는 변경은 아니다. 정상 완료와 중간 취소의 합성 검사로 검증했다.
- 검사 기준일(기본 조회일)과 사건 발생일·경과규정·사업장 적용 여부의 미확인을 출력에서 구별했다. 운영 DB 필드 충족률이나 실제 응답 제공률은 확인하지 않았다.

### 빌드 비교와 재현

동일한 placeholder URL `https://example.invalid`에서 변경 브랜치와 원본 master f942e3c 모두 FAQ 정적 생성 60초 시간 초과가 재현됐다. 기준 master 추출본의 초기 빌드는 node_modules 외부 symlink 제한으로 실패했고, 의존성을 실제 복사한 후 비교했다. 따라서 symlink 실패와 FAQ 시간 초과는 구분한다.

합성 데이터만 제공하는 loopback fixture는 `tests/fixtures/supabase-build-fixture.py`다. `python3 tests/fixtures/supabase-build-fixture.py`를 별도 프로세스로 실행하고 다음과 같이 빌드한다:

```sh
env -u SUPABASE_SERVICE_ROLE_KEY NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:45671 NEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic-placeholder npm run build
```

이 fixture는 FAQ 합성 1건과 다른 조회의 빈 배열을 반환한다. API 라우트·화면의 컴파일/타입/정적 생성 확인용이며 운영 DB의 스키마·데이터 품질·연결 검증을 대체하지 않는다.

### GitHub 오류 증거와 미완료 작업

`gh pr create --draft`는 `Post "https://api.github.com/graphql": Forbidden`으로 종료했다. 인증정보를 쓰지 않는 공개 `curl https://api.github.com/`도 아래 응답으로 TLS/API 접근 전에 실패했다:

```text
curl: (56) CONNECT tunnel failed, response 403
HTTP/1.1 403 Forbidden
content-length: 16
content-type: text/plain
server: envoy
connection: close
```

이는 CONNECT 프록시 차단 증거다. GitHub 계정·저장소 권한 거절 증거는 없지만, 프록시 내부의 정책 사유까지 확인할 수는 없다. 따라서 인증·권한을 변경하거나 다른 커넥터로 우회하지 않았다. PR 생성은 실패 상태다. 브랜치 푸시는 성공했고 배포·병합은 하지 않았다.

최종 추가 검증: 게이트·취소·CLI 집중 검사 70건 통과, 전체 920건 중 918건 통과(기준 master에서도 실패한 홈 화면 2건 제외). 변경 파일 lint·tsc·Python 구문 검사를 통과했다. 기준 master와 변경 브랜치의 offline fixture 빌드는 각각 종료 코드 0이다.

## PR54와 최신 base 통합

부모의 연결된 GitHub 커넥터에서 초안 PR54(https://github.com/seojaehong/labor-law-guide/pull/54)가 생성됐다. 이 환경의 CLI 프록시 차단 기록과 PR 생성의 최종 상태를 구별한다. 최신 master 11015081cdb81eb5b83a66c467f28fbd2c9b40b0의 PR53 교재 예시 익명화 변경을 충돌 없이 통합했다. 해당 파일은 최신 master와 동일하며 PR52도 보존된다. 초기 GitHub mergeable=false를 실제 코드 충돌로 해석하지 않았다. GitHub 서버의 현재 병합 가능 상태는 이 환경에서 재조회하지 않았다. 통합 코드 전체 테스트는 918/920 통과(기존 홈 화면 2건 실패 유지), 변경 파일 lint와 Python 구문 검사는 통과했다. 운영 배포·PR 병합은 하지 않았다.
