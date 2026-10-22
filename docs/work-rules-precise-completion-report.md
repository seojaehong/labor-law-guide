# PR #71 후속 보완 및 검증 보고 (2026-10-22)

- 작업 브랜치: `fix/precise-review-completion`
- 기준: `origin/master` = `81639fec515b055d54d3d06113531de726b339e9` (#71 병합 상태).
- 작업 시작 전 로컬 변경 없음. 기존 `work` 브랜치를 이동·수정하지 않고 별도 브랜치에서 구현했다.
- 저장소의 app/tests AGENTS.md와 관련 공개 SKILL.md를 확인했다. `/workspace/.agents`는 비어 있고 저장소에 별도 `.agents/skills`는 없었다.

## 변경

1. DB 설정 누락, 클라이언트 생성 예외, RPC 오류·예외·응답 형식 오류를 503으로 차단한다. 이때 AI 호출을 시작하지 않는다. 개인/전체 한도 초과는 기존 429를 유지한다.
2. 회차별 실패·조문 응답 누락을 합집합에 남긴다. 재질문은 빠진 조문만 반영하고, 완료된 다른 조문의 의견을 덮지 않는다. 불이익 의견과 회차 충돌도 보존한다. 토큰을 소비했어도 유효한 조문 답변이 전혀 없으면 502다.
3. 대조 시작일과 KST 점검 기준일을 입력·결과·엑셀에 보존한다. 저장소의 법령 ID·조문·시행일·MST가 맞는 변경 원문만 모델 입력에 연결한다. 원문 없는 항목은 AI가 문제없음이라고 해도 추가 확인이다. 모델 인용은 항상 미검증이며 식별자 대조가 법률 적용 검증을 의미하지 않는다. 본문 미보관 시에도 원문 없는 review 메타데이터는 저장하고 모델이 옮긴 인용은 비운다.
4. 같은 번호·다른 제목이 3개 이상일 때 덮어쓰지 않는다(TS/Python). Python HWPX는 중첩 문단 뒤 예외 문구·엔티티·구역 번호 순서를 보존한다. 웹의 기존 중첩표 읽기와 HWP/HWPX 부분 수정·저장·재열기에는 합성 회귀를 추가했다.
5. 즉시 Messages API의 실패 응답과 재시도 usage도 합산한다. Batch 할인은 적용하지 않는다. Sonnet 5.5 캐시 읽기 단가를 공식 현재 문서 기준 $0.10/MTok으로 바로잡았다. 추정 비용·usage 누락 여부·청구 미검증을 구조화 로그와 응답에 구분한다. production의 console 제거에도 비용 로그는 남는다. 기록 저장 예외가 이미 받은 결과를 지우지 않는다.
6. UI는 중복 실행을 막고 대기 취소·입력 변경 후 늦은 응답을 무시한다. 취소가 서버 비용 중단을 보장하지 않음을 표시한다. 부분 실패·충돌과 근거 미검증을 결과·엑셀에 남긴다.
7. 기존 오프라인 평가기에 `--baseline` 비교를 추가했다. 회복·퇴행·추가 오탐·미표기 항목·미완료·충돌을 분리한다. 평가 항목과 한계는 `work-rules-precise-offline-eval.md`에 기록했다. 실제 비교 실험은 하지 않았다.

기존 비AI 규칙 엔진과 상시 인원 전달, 중복 번호 2개 처리 방향을 유지했다. 모델 교체나 파이프라인 재설계는 하지 않았다.

## 검증

| 검증 | 결과 |
|---|---|
| 관련 Vitest 5개 파일 | 80/80 통과 |
| 전체 Vitest | 1,048 통과 / 3 실패 (97개 파일 중 95개 통과) |
| Python `scripts/work_rules_c/tests` | 108/108 통과, fake client·합성 자료 사용 |
| `npx tsc --noEmit` | 최종 통과 |
| 변경 범위 eslint | 통과 |
| 전체 `npm run lint` | 기존 8 errors / 18 warnings |
| Playwright `playwright.precise-offline.config.ts` | 1 시나리오 통과: 반복 클릭, 취소, 늦은 응답, 503 후 재시도, 부분 실패·충돌, 입력 변경 |
| 최종 `npm --ignore-scripts run build` | 사이트 production 빌드 통과; 외부 통신 차단·가짜 Supabase 설정 사용 |
| API 빌드 추적 파일 | 법령 JSON 98개 포함 확인 |
| `git diff --check` | 통과 |

전체 테스트 실패는 `home-launch-scope.test.ts` 2건(뉴스레터 노출), `work-rule-observations.test.ts` 1건(관측용 matcher 해시)이다. 깨끗한 `origin/master`를 `/tmp/labor-master-baseline`에 별도 추출해 동일 3건을 재현했다. 전체 lint도 같은 기준본에서 동일 8 errors / 18 warnings를 재현했다. 무관한 기존 파일은 수정하지 않았다.

검증 중 발견된 새 인용 식별자 타입 오류는 수정 후 타입 검사·빌드·관련 테스트를 다시 통과했다. Next 개발 서버의 손상된 생성 타입 파일은 생성물만 정리하고 서버 검증과 빌드를 순차 실행해 해결했다. 최종 코드의 미해결 신규 테스트 실패는 없다.

최초 일반 `npm run build`의 HWP 편집기 prebuild는 고정 외부 저장소 `edwardkim/rhwp` 다운로드가 DNS 실패로 건너뛰어졌다. 사이트 빌드는 통과했으나 편집기 별도 번들의 재생성은 미실시다. 최종 사이트 검증은 prebuild 재시도 없이 수행했다. HWP/HWPX 편집 코어는 설치된 WASM과 합성 파일로 검증했다.

## 수정 파일

- `next.config.ts`
- `src/app/api/tools/work-rules-precise/route.ts`
- `src/app/laws/PreciseCheck.tsx`
- `src/lib/laws/precise/articles.ts`, `judge.ts`, `pipeline.ts`, `prompts.ts`, `evidence.ts`
- `scripts/work_rules_c/articles.py`, `eval.py`, `prompts/batch_system.md`
- `scripts/work_rules_c/tests/test_articles.py`, `test_eval.py`
- `tests/unit/laws-precise.test.ts`, `laws-precise-route.test.ts`, `laws-precise-evidence.test.ts`, `hwp-apply.test.ts`
- `tests/e2e/laws-precise-offline.spec.ts`
- `scripts/testing/precise-offline-dev.cjs`, `playwright.precise-offline.config.ts`
- 이 보고서 및 `docs/work-rules-precise-offline-eval.md`

## 확인 제한·미실시

GitHub CLI의 열린 PR 목록과 #71 상세 조회(`gh pr list`, `gh pr view 71`, 대상 `seojaehong/labor-law-guide`)는 GitHub GraphQL `Forbidden`으로 조회 거절됐다. 실행된 변경은 없고 다른 경로로 우회하거나 재시도하지 않았다. 따라서 열린 관련 PR 및 서버/다른 개발자의 미게시 변경과의 중복·충돌은 확인하지 못했다. 접근 가능한 연결에서 권한을 복구한 뒤 해당 PR 목록과 변경 파일을 대조해야 한다. 이 checkout의 remote fetch refspec은 master만 포함한다. 원격 master는 작업 종료 전 다시 fetch해 기준 SHA와 동일함을 확인했다.

실제 고객 원본 자료 검증, 실제 DB 통합 검증, 유료 모델 실험, 청구액 대조, 배포 환경 검증은 미실시다. 원문 연결은 저장소 보유 자료 범위이며 원문 최신성·법률 적용·모델 추가 효용은 입증하지 않는다. 테스트 개수는 법률 정확성을 보장하지 않는다.

원격 push, PR 생성·병합, 배포, 운영 플래그·서버 설정 변경, DB migration 적용, 실제 고객 문서 외부 전송, 유료 API 호출은 하지 않았다. ZDR은 보류 상태를 유지했다.
