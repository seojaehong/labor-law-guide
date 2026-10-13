/**
 * A2 출근율 · A3 회계연도 첫해 비례 · A6 소멸시효 가드.
 * 근거: 근기법 §60①②, 근로개선정책과-5352(2011-12-19), 최영우 교재 산정 예, 제우스 게이트.
 */
import assert from "node:assert/strict";
import {
  applyAttendanceRatio, proratedFirstFiscalYear,
  PRESCRIPTION_NOTICE, assertNoPrescriptionMath,
} from "../../src/lib/leave/leave-advanced";

let fail = 0;
const check = (l: string, fn: () => void) => {
  try { fn(); } catch (e) { fail++; console.error(`  ❌ ${l}: ${e instanceof Error ? e.message : e}`); }
};

// ── A2 출근율 ──
check("80% 이상이면 정상 발생", () => {
  const r = applyAttendanceRatio({ hireDate: "2019-03-02", asOf: "2026-09-23", attendanceRatio: 0.9 });
  assert.equal(r.verdict, "normal");
  assert.equal(r.days, 18, `근속 7년 18일: ${r.days}`);
});

check("80% 미만이면 일수를 내지 않는다 (월별 개근을 모르므로)", () => {
  const r = applyAttendanceRatio({ hireDate: "2019-03-02", asOf: "2026-09-23", attendanceRatio: 0.7 });
  assert.equal(r.verdict, "reduced");
  assert.equal(r.days, null, "개근 월수 없이 일수를 만들면 안 된다");
  assert.ok(r.note.includes("§60②"));
});

check("출근율을 모르면 확인 불가 — 추정하지 않는다", () => {
  const r = applyAttendanceRatio({ hireDate: "2019-03-02", asOf: "2026-09-23" });
  assert.equal(r.verdict, "unknown");
  assert.equal(r.days, null);
});

check("1년 미만은 출근율과 무관 (§60②)", () => {
  const r = applyAttendanceRatio({ hireDate: "2026-03-01", asOf: "2026-09-30", attendanceRatio: 0.5 });
  assert.equal(r.verdict, "normal", "1년 미만은 출근율 80% 룰 대상이 아니다");
  assert.equal(r.days, 6);
});

// ── A3 회계연도 첫해 비례 ──
check("최영우 산정 예 — 2024-07-01 입사 → 7.5일", () => {
  const r = proratedFirstFiscalYear({ hireDate: "2024-07-01" });
  assert.equal(r.monthsInHireYear, 6, `기대 6개월: ${r.monthsInHireYear}`);
  assert.equal(r.days, 7.5, `교재 산정 예 15×6/12=7.5: ${r.days}`);
  assert.ok(r.formula.includes("15일 × 6개월"));
});

check("연초 입사는 12개월 → 15일", () => {
  const r = proratedFirstFiscalYear({ hireDate: "2024-01-01" });
  assert.equal(r.monthsInHireYear, 12);
  assert.equal(r.days, 15);
});

check("연말 입사는 개월이 적다", () => {
  const r = proratedFirstFiscalYear({ hireDate: "2024-11-01" });
  assert.equal(r.monthsInHireYear, 2);
  assert.equal(r.days, 2.5);
});

// ── A6 소멸시효 가드 ──
check("게이트: 개별 일수를 시효와 연결하면 예외", () => {
  assert.throws(() => assertNoPrescriptionMath("이 중 12일은 3년 지난 분일 수 있습니다"),
    /출시 게이트 위반/);
  assert.throws(() => assertNoPrescriptionMath({ note: "소멸시효 경과 5일" }),
    /출시 게이트 위반/);
  assert.throws(() => assertNoPrescriptionMath("청구 불가"), /출시 게이트 위반/);
});

check("게이트: 일반 안내문은 통과한다", () => {
  assertNoPrescriptionMath(PRESCRIPTION_NOTICE);
  assert.ok(PRESCRIPTION_NOTICE.includes("판단하거나"));
  assert.ok(!/\d+\s*일/.test(PRESCRIPTION_NOTICE), "안내문에 개별 일수가 있으면 안 된다");
});

if (fail) { console.error(`\nleave-advanced: 실패 ${fail}건`); throw new Error("Original regression assertions failed"); }
console.log("leave-advanced: 9건 통과 (출근율 4 · 비례부여 3 · 시효가드 2)");
