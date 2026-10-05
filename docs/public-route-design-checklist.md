> 최신 워드마크 결정 (앱 코드 31d3422): 기존 명조가 헤더/OG 기본입니다. 기하학안은 거절된 참고 자료이며 아래의 이전 제안 설명은 채택 상태를 뜻하지 않습니다. 새안 제작·운영 배포는 중지합니다.

# 현재 공개·공개 예정 경로 디자인 체크리스트

기준: HEAD `562d188` 및 이후 전달된 수정 상태, 2026-10-05 소스·협업 기록 감사. PR11 통합 `244ac392` 및 PR10 표시 수정 `01215df`를 포함한 현재 트리 기준입니다. 이번 작업은 이 문서만 작성하며 배포·데이터·정책을 변경하지 않습니다.

## 공통 적용과 증거의 범위

- Next 페이지 전부 root layout의 GlassNav·footer·SiteSurface를 통과합니다. 공개 경로는 `.public-surface`, admin/pkb는 `.private-surface`로 분리됩니다.
- site-refactor.css는 로컬 Pretendard Variable, 제목·행간·작은 글씨·입력 16px·조작 영역·모바일 4개 메뉴를 적용합니다. 목록/도구 카드 보정은 해당 layout 역할 클래스가 있는 요소에 한정됩니다. 공통 CSS 존재만으로 개별 화면의 충분한 재설계를 보장하지 않습니다.
- 공통 공유 경로: 기본 /opengraph-image, 일반 /og/page, 블로그 /og/[slug], 법령 /og/laws. 후속 publicMetadata 수정은 제목·설명의 옛 사이트 브랜드를 교체하고 공유 설명을 축약하며, spread 이후 siteName을 BRAND_NAME으로 고정합니다. 법률 주제로 사용된 노란봉투법과 법률 원문은 별개입니다.
- [실제 브라우저 결과](./design-browser-results.json): 46개 HTTP/문서 폭 기록, 합성 읽기 전용 DB 자료·법령 JSON·미배포 환경입니다. HTTP 200 및 scroll==width는 법률 내용·계산·발송·AI 응답·전체 시각 품질의 검증이 아닙니다.
- PR10 원문 보존 검사를 포함한 251 단위 테스트는 코드 회귀 검사이며 전체 사이트 법률 검수·모든 동선 검사로 간주하지 않습니다.
- [기존 검토 기록](./design-refactor-review.md)은 /laws 360/390/430/768/1024/1440 검사와 OG 확인을 보고하지만 이 JSON에 해당 행은 없습니다. 1280 법령 검사·전체 사이트 7폭 검사·모든 경로 다크 검증의 직접 증거는 여기서 확인되지 않습니다.

## 전수 경로

표의 공통은 Next 공통 셸·로컬 폰트·공개 CSS를 뜻합니다. 상세 경로의 브라우저 증거는 특정 합성 예시 한 건이며 모든 실제 자료를 검수했다는 뜻이 아닙니다.

| 경로 | 유형 | 셸·폰트/디자인 | 공유 메타데이터 | JSON 브라우저 증거 | 남은 점검 |
|---|---|---|---|---|---|
| `/admin/clusters` | 관리/개인 비공개 | root 셸·전역 폰트, 공개 CSS 제외 | 안전 일반 브랜드/비공개 정책 유지 | 없음 | 공개 디자인/노동위키 범위 제외; 호출 금지 |
| `/admin` | 관리/개인 비공개 | root 셸·전역 폰트, 공개 CSS 제외 | 안전 일반 브랜드/비공개 정책 유지 | 없음 | 공개 디자인/노동위키 범위 제외; 호출 금지 |
| `/ai` | 도구/보조 | 공통 | publicMetadata 일반 OG | 390px, 200/가로넘침 없음 | 옛 상담 제목·설명 유지; AI 경로 호출 금지 |
| `/blog/[slug]` | 글 상세 | 공통 | 실제 글 /og/[slug] | 390·1280px, 200/가로넘침 없음 | 실제 제목/공유 설명; 모든 장문·글별 메타 검증 별도 |
| `/blog/category/[category]` | 글 분류 목록 | 공통 | publicMetadata 일반 OG | 390px, 200/가로넘침 없음 | 전체 폭·다크·실제 자료·키보드 동선 추가 확인 |
| `/blog` | 글 목록 | 공통 | publicMetadata 일반 OG | 390·1280px, 200/가로넘침 없음 | 전체 폭·다크·실제 자료·키보드 동선 추가 확인 |
| `/cases/[id]` | 판례 상세 | 공통 | publicMetadata 일반 OG | 390·1280px, 200/가로넘침 없음 | 전체 폭·다크·실제 자료·키보드 동선 추가 확인 |
| `/cases` | 핵심 판례 목록 | 공통 | publicMetadata 일반 OG | 390px, 200/가로넘침 없음 | 전체 폭·다크·실제 자료·키보드 동선 추가 확인 |
| `/checklist` | 도구/보조 | 공통 | publicMetadata 일반 OG | 390px, 200/가로넘침 없음 | 전체 폭·다크·실제 자료·키보드 동선 추가 확인 |
| `/contact` | 도구/보조 | 공통 | publicMetadata 일반 OG | 390·1280px, 200/가로넘침 없음 | 전체 폭·다크·실제 자료·키보드 동선 추가 확인 |
| `/database` | 근거 검색 목록 | 공통 | publicMetadata 동적 일반 OG (후속 수정) | 390px, 200/가로넘침 없음 | 래퍼 연결 완료; 실제 OG 제목/이미지 일치 추가 검증 |
| `/decisions/[id]` | 판정례 상세 | 공통 | publicMetadata 일반 OG | 390·1280px, 200/가로넘침 없음 | 전체 폭·다크·실제 자료·키보드 동선 추가 확인 |
| `/decisions` | 판례·행정해석 목록 | 공통 | publicMetadata 일반 OG | 390·1280px, 200/가로넘침 없음 | 전체 폭·다크·실제 자료·키보드 동선 추가 확인 |
| `/faq/[category]` | FAQ 분류 | 공통 | publicMetadata 일반 OG | 390px, 200/가로넘침 없음 | 전체 폭·다크·실제 자료·키보드 동선 추가 확인 |
| `/faq` | FAQ 목록 | 공통 | publicMetadata 일반 OG | 390px, 200/가로넘침 없음 | 전체 폭·다크·실제 자료·키보드 동선 추가 확인 |
| `/guide` | 기존 법률 문서 | 공통 | publicMetadata 일반 OG | 390px, 200/가로넘침 없음 | 인용 오류 해결·법률 검수는 별도; 새 정확성 보장 없음 |
| `/harassment` | 도구/보조 | 공통 | publicMetadata 일반 OG | 390px, 200/가로넘침 없음 | 후속 래퍼에서 siteName 고정; 실제 응답 추가 확인 |
| `/interpretations/[id]` | 행정해석 상세 | 공통 | publicMetadata 일반 OG | 390·1280px, 200/가로넘침 없음 | 전체 폭·다크·실제 자료·키보드 동선 추가 확인 |
| `/laws` | 공개 예정 법 개정 목록·달력·상세·취업규칙 점검 | 공통+laws.css 개별 개선 | event별 /og/laws | 없음 | JSON 미수록; 검토 기록만 별도 존재; 자동구독 미검증 |
| `/lecture/ai-isan-2026` | 강의/교재 | 공통 | publicMetadata 일반 OG | 390px, 200/가로넘침 없음 | 별도 강의 UI: 공통 보정만으로 전체 재설계 완료 아님; noindex 유지 |
| `/lecture/ai-isan-2026/textbook` | 강의/교재 | 공통 | publicMetadata 일반 OG | 390px, 200/가로넘침 없음 | 별도 강의 UI: 공통 보정만으로 전체 재설계 완료 아님; noindex 유지 |
| `/manual` | 절차 문서 | 공통 | publicMetadata 일반 OG | 390px, 200/가로넘침 없음 | 전체 폭·다크·실제 자료·키보드 동선 추가 확인 |
| `/news` | 뉴스 목록 | 공통 | publicMetadata 동적 일반 OG (후속 수정) | 390px, 200/가로넘침 없음 | 래퍼 연결 완료; 최신성/수집 품질 미검증; 화면별 카드 재검토 |
| `/newsletter/confirmed` | 구독 상태 | 공통 | publicMetadata 일반 OG | 390px, 200/가로넘침 없음 | 상태 화면만; 실제 전달/해지 제출 미검증 |
| `/newsletter/unsubscribe` | 구독 상태 | 공통 | publicMetadata 일반 OG | 390px, 200/가로넘침 없음 | 상태 화면만; 실제 전달/해지 제출 미검증 |
| `/newsletter/unsubscribed` | 구독 상태 | 공통 | publicMetadata 일반 OG | 390px, 200/가로넘침 없음 | 상태 화면만; 실제 전달/해지 제출 미검증 |
| `/` | 홈 | 공통 | root 브랜드 기본 OG | 390·1280px, 200/가로넘침 없음 | 전체 폭·다크·실제 자료·키보드 동선 추가 확인 |
| `/pkb` | 관리/개인 비공개 | root 셸·전역 폰트, 공개 CSS 제외 | 안전 일반 브랜드/비공개 정책 유지 | 없음 | 공개 디자인/노동위키 범위 제외; 호출 금지 |
| `/privacy` | 정책 문서 | 공통 | publicMetadata 일반 OG | 390px, 200/가로넘침 없음 | 설명 브랜드 교체; privacy 사이트명만 수정, 법률 본문 보존 |
| `/sanction` | 도구/보조 | 공통 | publicMetadata 일반 OG | 390px, 200/가로넘침 없음 | 후속 래퍼에서 siteName 고정; 실제 응답 추가 확인 |
| `/search` | 검색 목록 | 공통 | publicMetadata 일반 OG | 390px, 200/가로넘침 없음 | 후속 래퍼에서 siteName 고정; 실제 응답 추가 확인 |
| `/stats` | 도구/보조 | 공통 | publicMetadata 일반 OG | 390px, 200/가로넘침 없음 | 후속 래퍼에서 siteName 고정; 실제 응답 추가 확인 |
| `/subsidy` | 도구/보조 | 공통 | publicMetadata 일반 OG | 390px, 200/가로넘침 없음 | 전체 폭·다크·실제 자료·키보드 동선 추가 확인 |
| `/terms` | 정책 문서 | 공통 | publicMetadata 일반 OG | 390px, 200/가로넘침 없음 | 설명 브랜드 교체; privacy 사이트명만 수정, 법률 본문 보존 |
| `/tools/contract-check` | 도구/보조 | 공통 | publicMetadata 일반 OG | 390·1280px, 200/가로넘침 없음 | 사진 추출·AI 호출 제외, 전체 판정 정확성 별도 |
| `/tools/holiday-pay` | 도구/보조 | 공통 | publicMetadata 일반 OG | 390·1280px, 200/가로넘침 없음 | 전체 폭·다크·실제 자료·키보드 동선 추가 확인 |
| `/tools` | 도구 목록 | 공통 | publicMetadata 일반 OG | 390·1280px, 200/가로넘침 없음 | 전체 폭·다크·실제 자료·키보드 동선 추가 확인 |
| `/tools/severance.html` | 독립 정적 계산 도구 | Next 셸 제외; 별도 work-nav·severance-brand.css·로컬 폰트 | 정적 OG 제목/설명·/og/page 이미지 | 390·1280px, 200/가로넘침 없음 | 다크 전환·공통 메뉴 지속성·공유 이미지 설명 일치 추가 확인; 계산 스크립트 보존 |

## 추가 화면·범위 경계

- 법령 상세는 독립 page.tsx 경로가 아니라 `/laws?event=...` 상태입니다. 달력·필터·RulesCheck도 같은 페이지 안의 화면입니다. 항목별 화면 검수와 새로고침/뒤로가기 동선을 별도로 확인해야 합니다.
- `/admin`, `/admin/clusters`, `/pkb`는 전수 집계에는 포함하지만 공개 콘텐츠·디자인 개선 범위에서 제외합니다. 개인 사건·상담 자료를 공개하지 않습니다.
- 동적 category/id/slug는 라우트 유형 전수이며 각 DB 레코드 URL 전수는 아닙니다. API·OG route.tsx는 페이지 수에 포함하지 않지만 공유 경로로 점검합니다.
- Google/Naver 소유권 확인 HTML은 콘텐츠 페이지가 아니므로 디자인 대상에서 제외합니다.

## 후속 수정 반영 상태

- /database·/news 동적 metadata 래퍼 연결, publicMetadata의 siteName 강제·설명 브랜드 교체를 완료한 것으로 전달받았습니다. 이전 누락 지적은 해결 상태로 갱신합니다.
- privacy 사이트명, holiday-pay 블로그 링크, BlogClient H1, 블로그 상세 돌아가기 링크를 정렬했습니다. 법률 본문 재작성은 포함하지 않습니다.
- /og/wordmark-review 시각 검토 경로와 변경하지 않는 원본 SVG 비교 자산을 추가했습니다. 생성형 이미지는 사용하지 않습니다.
- PR10 원문 보존 검사를 포함해 251 단위 검사가 보고됐습니다. 전체 사이트 법률 검수나 모든 브라우저 동선 검사를 뜻하지 않습니다.
- 공식 Library 업로드 helper는 `Library prepare_uploads is not available` 오류로 실패했습니다. 업로드 완료·Library ID는 없습니다.
- 원격 게시 대기이며 master 운영 배포는 하지 않았습니다.

## 남은 검증 한계

후속 워드마크·글 요약·대비 보완은 design-refactor-review.md의 마지막 절을 기준으로 확인합니다. 최신 픽셀 아티팩트는 design-visuals/README.md와 manifest에서 코드 기준을 연결합니다. 모바일 메뉴 상호작용과 GET-only 링크 표본 검사는 476행 global overflow 기록과 별개입니다. FAQ 노동조합 분류의 합성 빈 결과 화면을 추가 확인했으며 실데이터·법률 검수 완료로 표시하지 않습니다.

후속 직접 검사: [design-browser-matrix.json](./design-browser-matrix.json)에 34개 구체 공개 경로의 7폭·두 테마 클래스 476개 HTTP/문서 폭 결과를 추가했습니다. 모두 HTTP 200이며 문서 가로 넘침이 없습니다. 위 표의 이전 JSON 열은 이전 증거 그대로입니다. 합성 FAQ 분류 링크 부재로 분류 상세는 새 매트릭스에서 제외했습니다. 이 추가 검사는 아래의 화면별 색 대비·키보드·전체 동선·실데이터 검증을 대체하지 않습니다.

1. 후속 수정된 동적 OG·설명·siteName의 실제 HTTP 응답 및 화면별 제목 일치 확인은 별도로 남습니다. 기존 JSON은 후속 변경 검사를 증명하지 않습니다.
2. 강의·구독 상태·기존 문서는 공통 제목/폰트 보정 위주이며 모든 컴포넌트가 디자인 정본으로 재구성됐다는 증거는 없습니다.
3. 전체 7폭·다크·실자료·법률 내용·AI·캘린더 실제 앱 구독·상담 제출·뉴스 품질은 미검증 범위를 유지합니다.
