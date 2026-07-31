# tests/ 지식

- unit: vitest (`npm run test`, tests/unit/**/*.test.ts). alias `@` → src/ 는 vitest.config.ts에 이미 설정됨. JSON은 `@/lib/contract-check/data/*.json` 직접 import 가능(resolveJsonModule).
- e2e: playwright (`npm run e2e`, tests/e2e). baseURL http://localhost:3123, dev 서버 자동 기동(첫 기동 느림, 타임아웃 180s).
- contract-check 엔진 불변식: **모든 규칙 함수는 계약 1건당 정확히 Finding 1개**를 반환한다(ok/needs_data 포함). 따라서 checkContract 출력의 rule_code 집합 == 엔진 구현 규칙 집합 == 카탈로그 auto:true 집합(24개, ORDINARY-WAGE만 auto:false).
- synthetic_edge_cases.json은 완전한 계약 객체 4건의 배열이며 각각 `expected_findings`(부분 정답지, 4건씩)를 가짐. `normalize(배열)`로 파생필드(weekly_actual_hours·ordinary_hourly_rate·employment_type·retroactive_days)를 채운 뒤 checkContract에 넣어야 한다 — normalize 없이 넣으면 needs_data가 쏟아진다.
- e2e 셀렉터 관례: 폼 입력은 aria-label(`getByLabel('계약 시작일')`), 선택 버튼·스텝 이동은 `getByRole('button', { name: ... })`. ContractCheckClient의 모든 input에 aria-label이 있다. 결과 도달 판정은 `heading '점검 결과'` + 카운트 배지 `/^위반 \d+$/`.
- 브라우저 검증 스크린샷은 임시 스펙으로 `test-results/`(gitignore됨)에 캡처 후 스펙 파일은 삭제.
- `npm run lint`는 **기존 프로덕션 파일의 사전 존재 에러 11건**(react-hooks/set-state-in-effect 등, AdminClient·BlogClient·ThemeToggle 등)으로 exit≠0. contract-check 관련 파일은 clean — 검증은 `npx eslint tests/ src/lib/contract-check/ src/app/tools/` 처럼 범위를 좁혀서. 기존 파일 수정 금지(라이브 사이트).
