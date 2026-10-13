# 퇴직금 산정서 디자인 검증

검증 코드: `86be3185f8d322688ed82a4aa16b27f9ac5cb913`. 비교 기준: `33d9d72ddbb8f2c43c5d0687e759d59fd1a4de96`. Draft PR18에만 반영하며 운영 병합·배포는 하지 않는다.

## 변경

- 실수령 퇴직금을 첫 번째 정보로 표시하고, 퇴직금과 공제액 합계를 바로 아래에 배치했다. 기본 정보는 표 대신 항목/값으로 정리했다.
- 평균임금 표와 퇴직금·공제 표의 선, 간격, 숫자 정렬을 정리했다. 모바일 평균임금 표는 자체 스크롤 영역이며 키보드로 이동할 수 있다.
- 화면과 출력의 정보·계산식을 보존했다. 산정서의 종이 바탕과 짙은 글자색은 두 테마에서 동일하다. 기존 워드마크 SVG와 헤더 크기는 변경하지 않았다.
- 산정서 및 도구 메타데이터의 이전 브랜드 표기를 `일의 무늬`로 변경했다. 실제 법률 주제명은 바꾸지 않았다.
- 한국어는 `word-break: keep-all`을 적용했다. 긴 URL·숫자 값은 화면을 넘치지 않도록 예외적으로 줄을 나눈다.
- A4 출력은 핵심 금액부터 계산 내역과 서명까지 한 장에 담는다. 기존 인쇄 스타일과 충돌하던 마지막 금액 행의 대비를 수정했다.

## 이번 코드 검증

| 검사 | 결과 | 한계 |
| --- | --- | --- |
| Vitest 전체 | 39 파일, 336 테스트 통과 | 첫 병렬 실행에서 Excel 테스트 2개가 5초 timeout. `--maxWorkers=2 --testTimeout=20000`으로 전체 재실행 통과 |
| TypeScript / 변경 TSX ESLint / Next production build | 통과 | 기존 middleware deprecation 경고 유지 |
| 기존안/제안 실제 계산 비교 | 동일 합성 입력의 result 객체 전체 deepEqual | 법률 산정 정확성 전수 검증이 아님 |
| 화면 폭 | 360/390/430/768/1440px 전체 문서 가로 넘침 없음 | 합성 fixture Chromium 검사 |
| 줄바꿈/스크롤 | 한국어 항목명 중간 분리 없음, 긴 URL 문서 넘침 없음, 표 키보드 스크롤 통과 | 실기기 Safari/VoiceOver 미검수 |
| 대비 | light 164 + dark 164 + print 87 = 415개, 실패 0 | 입력/placeholder/readonly/disabled/표/새 금액·기본정보/서명/컨트롤; 완전한 WCAG 인증이 아님 |
| 인쇄 | 기존/제안 모두 실제 A4 PDF 1장, 근로자명·금액·서명 존재 | 실제 프린터 미검수; 긴 이름/내역의 모든 인쇄 조합을 한 장으로 보장하지 않음 |
| 근거 조회 회귀 | 자동 POST 없음, 지연 응답·전환·초기화·오류·빈 결과 통과 | mock only, 실제 API 0회 |
| 입력 변경 회귀 | 과거 결과/조회/인쇄 차단, 재계산 후 요청 값 일치, 저장 입력 보존 통과 | mock only, 실제 API 0회 |

최종 인쇄 CSS 보완 이후 415개 대비 검사와 실제 화면/PDF 비교를 다시 실행했다. 전체 테스트·타입·TSX lint 이후의 제품 변경은 인쇄 CSS 간격·색상 보완뿐이며 최종 production build도 다시 실행했다. 이전 전체 사이트 370폭/378대비 증거를 이번 변경의 새로운 전체 사이트 검사로 주장하지 않는다.

## 화면 증거

`docs/design-visuals/severance-statement-20261005/`에 기존/제안 390px light/dark PNG, 실제 A4 PDF 및 PDF 래스터 PNG, 나란히 비교 PNG, 전체 화면 PNG, design/contrast/A4 검증 JSON을 저장했다. 캡처는 합성 이름과 금액이며 실제 근로자 데이터와 외부 API 호출을 사용하지 않았다.

새 Library 이미지:

| 이미지 | Library ID |
| --- | --- |
| 모바일 light 비교 | `libfile_065e857347408191825d7c4278be3e70` |
| 모바일 dark 비교 | `libfile_37550823cab081919ea3fc1719dd73f7` |
| A4 출력 비교 | `libfile_04d58ae498848191b5aa947937d185f6` |
| 제안 light | `libfile_660afbd306448191ad3dde2607b4565e` |
| 제안 dark | `libfile_96dd6d0b32bc81918874fdf76375ab22` |
| 제안 A4 | `libfile_f814757f316481918e7bd03d3e9cf6ba` |

일괄 저장 helper는 `Library prepare_uploads is not available`을 반환했고 저장하지 않았다. 실행 가능한 공식 Library create 경로로 여섯 이미지의 저장 성공과 ID를 확인했다. Windows의 로컬 xattr 기록은 `AttributeError: module 'os' has no attribute 'setxattr'`로 실패했다. Library 저장 자체는 성공했으며 ID는 위 표와 작업 디렉터리의 저장 결과 manifest에 보존했다.

## 경로별 범위와 미검수

- `/tools/severance.html`: 이번 화면·인쇄·브랜드·줄바꿈 변경과 회귀 검증 완료.
- `/tools`, `/tools/holiday-pay`: 제목 브랜드 표기 변경, 타입·lint·빌드 완료. 계산 화면의 신규 시각 변경은 없다.
- FAQ 및 기타 사이트 경로: PR18의 기존 수정·검증 기록 유지. 이번 산정서 작업에서 새로 전체 경로를 재검수했다고 주장하지 않는다.
- 계산 함수/세금 계산/서버 API/권한/cron/원장/Notion/SITEMAP_CASELAW/noindex/로그인 보호/유료 AI 호출/법령 수집 재실행: 변경·실행하지 않았다. 최신 master와 API·Supabase·브랜드 원본 SVG 차이가 없다.
- 보호된 Preview의 로그인 이후 실제 원격 인터랙션, 실기기 iOS, 실제 인쇄 및 법령 수집 timeout은 미검수로 남긴다.
