# tests/ 지식

- unit: vitest (`npm run test`, tests/unit/**/*.test.ts). alias `@` → src/ 는 vitest.config.ts에 이미 설정됨. JSON은 `@/lib/contract-check/data/*.json` 직접 import 가능(resolveJsonModule).
- e2e: playwright (`npm run e2e`, tests/e2e). baseURL http://localhost:3123, dev 서버 자동 기동(첫 기동 느림, 타임아웃 180s).
- contract-check 엔진 불변식: **모든 규칙 함수는 계약 1건당 정확히 Finding 1개**를 반환한다(ok/needs_data 포함). 따라서 checkContract 출력의 rule_code 집합 == 엔진 구현 규칙 집합 == 카탈로그 auto:true 집합(24개, ORDINARY-WAGE만 auto:false).
- synthetic_edge_cases.json은 완전한 계약 객체 4건의 배열이며 각각 `expected_findings`(부분 정답지, 4건씩)를 가짐. `normalize(배열)`로 파생필드(weekly_actual_hours·ordinary_hourly_rate·employment_type·retroactive_days)를 채운 뒤 checkContract에 넣어야 한다 — normalize 없이 넣으면 needs_data가 쏟아진다.
- e2e 셀렉터 관례: 폼 입력은 aria-label(`getByLabel('계약 시작일')`), 선택 버튼·스텝 이동은 `getByRole('button', { name: ... })`. ContractCheckClient의 모든 input에 aria-label이 있다. 결과 도달 판정은 `heading '점검 결과'` + 카운트 배지 `/^위반 \d+$/`.
- 브라우저 검증 스크린샷은 임시 스펙으로 `test-results/`(gitignore됨)에 캡처 후 스펙 파일은 삭제.
- ★ strict mode 함정: page.tsx 하단 상시 면책 문구와 결과 화면 면책 문구가 겹쳐 `getByText(/법률자문이 아닙니다/)`가 2개 매칭 — 이런 공용 문구는 `.first()` 필수. `수정 방향:`·`입력하면 판정됩니다`도 카드마다 반복되므로 동일.
- GlassNav 데스크톱 드롭다운은 mouseenter로 열리고 onClick이 토글 — playwright `click()`은 hover(열림)→click(닫힘)이 되어 드롭다운이 안 보인다. 열린 상태 검증은 `hover()`만 사용.
- `/sitemap/0.xml`은 Supabase 실쿼리를 하므로 로컬 placeholder 자격증명에선 응답이 매우 느리거나 hang — 로컬에서 curl로 검증하지 말 것(빌드 통과 + 코드 정적 엔트리 확인으로 충분).
- **API 라우트 unit 테스트**(tests/unit/extract-route.test.ts가 첫 사례): 라우트를 vitest에서 직접 import 하려면 ⓐ `NextRequest`/`NextResponse` 대신 표준 `Request`/`Response.json()`을 쓰고 ⓑ env(`ANTHROPIC_API_KEY` 등)를 **모듈 스코프가 아니라 핸들러 안에서** 읽어야 한다. 모듈 스코프 상수면 `vi.stubEnv`가 안 먹어 501/200 분기를 한 파일에서 못 짠다(api/sanction/route.ts는 모듈 스코프 방식 — 따라 하지 말 것).
- `@/lib/supabase-server`·`@/lib/rate-limit`는 **import만 해도** `createClient(undefined!)`로 터진다(env 없음). 테스트 대상 라우트에서 import 금지 — `@supabase/supabase-js`의 `createClient`를 직접 가져와 env가 있을 때만 호출하면 `vi.mock('@supabase/supabase-js')`로 리밋 분기를 갈아끼울 수 있다(`vi.hoisted`로 mock 변수 선언).
- ★ **`getByRole('alert')` 금지** — Next가 페이지마다 `<div role="alert" id="__next-route-announcer__">`를 붙여서 항상 strict mode 위반이 난다. 경고 문구는 `getByText(...)`로 특정할 것(`role="status"`는 충돌 없음).
- **env 게이트로 닫힌 API의 성공 경로 e2e**: 로컬엔 키가 없어 501만 탄다. `page.route('**/api/...', r => r.fulfill({ status: 200, json: {...} }))`로 응답을 갈아끼우면 키 없이 성공 분기를 결정론적으로 검증할 수 있다(tests/e2e/contract-check-upload.spec.ts).
- 숨겨진 `<input type="file" class="hidden">`도 `page.locator('input[type=file]').setInputFiles({name, mimeType, buffer})`로 그냥 채워진다(visible일 필요 없음).
- `npm run lint`는 **기존 프로덕션 파일의 사전 존재 에러 11건**(react-hooks/set-state-in-effect 등, AdminClient·BlogClient·ThemeToggle 등)으로 exit≠0. contract-check 관련 파일은 clean — 검증은 `npx eslint tests/ src/lib/contract-check/ src/app/tools/` 처럼 범위를 좁혀서. 기존 파일 수정 금지(라이브 사이트).
