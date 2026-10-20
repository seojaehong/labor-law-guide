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

- 전체 Vitest: 890 통과 / 892, 홈 화면 검사 2건 실패. `origin/master`를 `/tmp/labor-baseline`에 추출해 같은 2건을 재현했다. 관련 회귀·신규 테스트는 통과했다.
- 변경 TS/TSX·테스트 ESLint 및 `tsc --noEmit`: 통과. 전체 lint는 변경하지 않은 파일의 기존 8 errors / 18 warnings로 실패했다.
- Python 구문 검사 및 TS/Python 매처 parity: 통과. 판정 소스 해시와 실제 public 데이터 해시를 동기화했다(기존 RULE_VERSION도 실제 데이터와 달랐다).
- 키 없는 placeholder 설정으로 Next 빌드: 컴파일·타입검사는 통과했으나 FAQ 정적 생성에서 60초 시간 초과가 반복되어 중단했다. 전체 빌드 완료는 미확인이다. 운영 설정 검증이 아니다.
- Supabase 문서/changelog 조회는 네트워크 403이었다. 새로운 Supabase 기능·스키마는 도입하지 않았으며 기존 select/filter와 설치된 SDK 타입으로 검증했다. 운영 쿼리는 실행하지 않았다.

GitHub 브랜치 푸시는 성공했다. 초안 PR 생성은 `POST https://api.github.com/graphql: Forbidden`으로 실패했으며 PR은 생성되지 않았다. PR 본문 초안은 `/tmp/labor-pr-body.md`에 남겼다. 배포·병합은 하지 않았다.
