/**
 * 연차 발생일수 엔진 경계값 검증.
 *
 * 목표: 입력 날짜가 달력에 실제 존재하는지 먼저 확인한다.
 * JavaScript Date 의 자동 보정(2026-02-31 → 2026-03-03)을 그대로 두면
 * 잘못된 입사일/기준일이 정상 계산으로 통과한다.
 */
import assert from "node:assert/strict";
import { calculateEntitlement, compareRow } from "../../src/lib/leave/annual-leave";

let fail = 0;
const check = (label: string, fn: () => void) => {
  try { fn(); } catch (e) { fail++; console.error(`  ❌ ${label}: ${e instanceof Error ? e.message : e}`); }
};

check("존재하지 않는 입사일은 계산하지 않는다", () => {
  assert.throws(
    () => calculateEntitlement({ hireDate: "2026-02-31", asOf: "2026-09-23" }),
    /입사일.*올바른 날짜/
  );
});

check("존재하지 않는 기준일은 계산하지 않는다", () => {
  assert.throws(
    () => calculateEntitlement({ hireDate: "2026-01-01", asOf: "2026-04-31" }),
    /기준일.*올바른 날짜/
  );
});

check("윤년 2월 29일은 유효한 날짜로 계산한다", () => {
  const r = calculateEntitlement({ hireDate: "2024-02-29", asOf: "2024-03-29" });
  assert.equal(r.completedMonths, 1);
  assert.equal(r.days, 1);
});

check("비교 행에서 잘못된 날짜는 일치가 아니라 error 로 남긴다", () => {
  const r = compareRow({ name: "오입력", hireDate: "2026-02-31", recordedDays: 0 }, "2026-09-23");
  assert.equal(r.verdict, "error");
  assert.match(r.errorMessage ?? "", /입사일.*올바른 날짜/);
});

if (fail) { console.error(`\nannual-leave-edges: 실패 ${fail}건`); throw new Error("Original regression assertions failed"); }
console.log("annual-leave-edges: 4건 통과");
