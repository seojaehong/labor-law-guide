/**
 * 교차 검증 — TS 구현(src/lib/annual-leave.ts) vs Frappe HRMS Python 엔진.
 *
 * 왜 두 번 구현했나: 같은 규칙을 독립적으로 두 번 짜서 서로 대조하기 위해서다.
 * 한쪽 출력을 정답으로 복사하면 검증이 아니라 자기확인이 된다.
 *
 * 기대값 출처: hrms/regional/south_korea/annual_leave.py 를 2026-09-23 에 실행해 받은 값.
 *   재생성: python3 -c "... calculate_annual_leave_entitlement ..." → tests/annual-leave-python-expected.json
 *
 * 실행: node --experimental-strip-types tests/annual-leave.crosscheck.mts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { calculateEntitlement } from "../../src/lib/leave/annual-leave";
import { DEMO_ROWS, DEMO_AS_OF } from "../../src/lib/leave/leave-demo-sample";

const here = dirname(fileURLToPath(import.meta.url));
const expected = JSON.parse(
  readFileSync(resolve(here, "annual-leave-python-expected.json"), "utf8")
) as Record<string, number>;

let failures = 0;
for (const row of DEMO_ROWS) {
  const ts = calculateEntitlement({ hireDate: row.hireDate, asOf: DEMO_AS_OF }).days;
  const py = expected[row.name];
  if (py === undefined) {
    console.error(`  ❌ ${row.name}: Python 기대값이 없다 — 표본을 바꿨으면 기대값도 다시 뽑아야 한다`);
    failures++;
    continue;
  }
  if (ts !== py) {
    console.error(`  ❌ ${row.name}: TS ${ts} ≠ PY ${py}`);
    failures++;
  }
}

if (failures) {
  console.error(`\n교차 검증 실패 ${failures}건 — 한쪽을 고쳐 맞추기 전에 어느 쪽이 맞는지 먼저 정할 것`);
  throw new Error("Original regression assertions failed");
}
console.log(`annual-leave.crosscheck: ${DEMO_ROWS.length}건 TS=PY 일치`);
