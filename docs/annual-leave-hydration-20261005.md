# Production hydration 수정 및 검증

수정 전 기준은 `f7495718c46da3e69d987df3de319c81cb8e6c55`이다. production fixture에서 React #418을 반복 재현했다. 진단용 React 산출물의 수화 실패 지점에서 `/tools`는 `div.layout-list`를 기대했으나 실제 커서는 그 안의 `h1`, 연차 화면은 `div.lv-shell`을 기대했으나 그 안의 `nav.lv-nav`를 가리켰다. `[hydration-before.json](design-visuals/annual-leave-20261005/hydration-before.json)`에 이전 오류와 요약을 기록했다. 진단 코드가 포함된 산출물은 clean build로 제거했으며 제품 코드에 넣지 않았다.

문제는 `SiteSurface` 클라이언트 래퍼 안의 서버 자식 콘텐츠가 지연 도착·중단 후 다시 수화되는 경로였다. 자식 콘텐츠에 명시적인 `Suspense` 경계를 두어 재시작을 래퍼 내부에서 처리하도록 수정했다. SSR 콘텐츠를 제거하거나 client-only로 돌리지 않았고 경고 숨김 설정도 추가하지 않았다. 테마·시간·locale·명부 값의 초기 읽기 방식은 변경하지 않았다. 기존 테마 루트 속성의 suppressHydrationWarning은 이전부터 있던 설정이며 이번 수정과 무관하다.

수정 후 production fixture에서 공개 도구 네 경로를 8회씩 전환·새로고침했다. UTC/ko-KR, Asia/Seoul/ko-KR, America/Los_Angeles/en-US의 3조합에서 192회 문서 로드와 99검사 항목이 통과했고 React 오류는 0건이다. 테마 변경 시 입력 전체가 유지되고, 새로고침 시 기본 sessionStorage 명부의 이름·입사일이 복원됨을 확인했다. 대장 금액·대조값은 원본 명부 저장 대상이 아니며 새로고침 보존으로 주장하지 않는다. 사업장 A→B→A, 기억한 명부 재방문 및 첫 사업장 생성 전 입력 보존 검사도 재통과했다.

최종 298 tests / 34 files, TypeScript, 변경 범위 ESLint와 기존 개인정보 없는 fixture build 107페이지가 통과했다. 로컬 fixture build는 `next build --webpack`이며 합성 Supabase 자료만 사용한다. Vercel은 저장소의 기본 `next build`와 기존 환경 설정을 사용하는 별도 검증이다. 일반 로컬 build의 Supabase 환경값 부재 실패를 fixture 성공으로 대체 표기하지 않았고 새 비밀을 조회하거나 설정하지 않았다. Vercel의 최종 SHA 결과는 PR16에서 별도로 기록한다.

검증 경로는 `/tools`, `/tools/leave`, `/tools/leave/advanced`, `/tools/leave/settlement`이다. 비공개 화면·사이트 전체 hydration으로 확대 해석하지 않는다. Preview 보호 설정과 운영 master는 유지했다. 월말·윤일, 특수 근태와 법적 촉진 적합성의 기존 검토 범위도 달라지지 않았다.

재실행: `node tests/layout/production-visual-fixture.mjs build`, 별도 터미널에서 `node tests/layout/production-visual-fixture.mjs start`, 이어 `node tests/layout/leave-hydration-browser.mjs`. 검사에는 합성 직원 정보만 사용하며 외부 요청과 `/api` 요청을 차단한다. 결과는 `docs/design-visuals/annual-leave-20261005/hydration-regression.json`이다.
