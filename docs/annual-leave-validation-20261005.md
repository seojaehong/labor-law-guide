# 연차 도구 검증

298 tests / 34 files, TypeScript, 연차 변경 범위 ESLint 통과. 개인정보 없는 기존 production fixture build 107페이지 성공. 실제 XLSX 업로드·다운로드, 잘못된 파일 입력 보존·같은 이름 재선택, 기본 세션 개인정보 보관, 320/390/768/1024/1440px 가로 넘침 검사를 수행했다. 명부 A→B→A, 새로고침과 정산 화면에서 복귀를 검증했고 원본의 덮어쓰기 버그를 수정했다. 처음 사업장을 만들 때 기존 미저장 입력도 보존한다.

초기 밝음/어둠 연속 페이지 검사에서 production React hydration #418이 간헐적으로 `/tools` 등에서 발생했다. 이후 공통 표면의 서버 자식 수화 경계를 수정해 해결했고, [수정 및 반복 회귀 검증](annual-leave-hydration-20261005.md)에 별도로 기록했다. 일반 환경 build는 Supabase 설정이 없어 실패했으며 fixture build와 구분한다.

원본 출처와 지원 범위는 `annual-leave-port-20261005.md`를 참조한다. 운영 master 병합 및 배포는 수행하지 않았다.
