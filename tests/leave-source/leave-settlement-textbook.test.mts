/**
 * 퇴직정산 — **최영우 교재 산정 예를 그대로** 고정한다.
 *
 * 왜 따로 두나: 2026-09-24, 루브릭 100점 · 테스트 90건 상태에서 퇴직정산이
 * 가장 흔한 케이스(1년 미만 퇴사자)에 **0일**을 내고 있었다.
 * 기존 교차검증이 근로기준과-5802 한 사례만 썼고, 그 사례는 다년 근속이라
 * **1년 미만 월차가 등장하지 않는 경로**였다. 내가 고른 사례가 내 구현이
 * 마침 잘 처리하는 사례였던 것이다.
 *
 * 그래서 여기서는 교재가 숫자를 못박아 둔 세 사례를 쓴다 (pkb_chunks folder='교재').
 */
import assert from "node:assert/strict";
import { settleOnTermination } from "../../src/lib/leave/leave-ledger";

let fail = 0;
function ck(name: string, fn: () => void) {
  try { fn(); console.log(`  ✅ ${name}`); }
  catch (e) { fail += 1; console.error(`  ❌ ${name}: ${e instanceof Error ? e.message : e}`); }
}

// ── 산정 예 (가) — 2024.7.1 입사 → 2025.7.31 퇴사
//    "입사일로부터 산정할 경우 1년이 지난 25.7.1.자로 15일이 발생"
//    "※ 1년 미만 월 1일씩 11일은 회계연도단위 산정과 관계없이 발생"
//    → 입사일 기준 누계 = 11 + 15 = 26
ck("교재 (가) · 2024-07-01 입사 → 2025-07-31 퇴사 → 입사일 기준 26일", () => {
  const r = settleOnTermination({
    hireDate: "2024-07-01", endDate: "2025-07-31",
    fiscalGrantedTotal: 7.5, usedOrPaidTotal: 0,
    includeFirstYearMonthly: true,
  });
  assert.equal(r.hireDateTotal, 26, `기대 26, 실제 ${r.hireDateTotal}`);
  assert.equal(r.favourable, "hire-date", "입사일 기준이 더 많아야 한다");
  assert.equal(r.shortfallDays, 26, "회계연도 7.5일만 부여했으므로 26일이 보장선");
});

// ── 산정 예 ② — 2024.7.1 입사 → 2025.6.30 퇴사 (만 1년 되기 전날)
//    "입사일을 기준으로 하면 11일"  ← 15일은 7.1 자로 발생하므로 아직 없다
ck("교재 ② · 2024-07-01 입사 → 2025-06-30 퇴사 → 입사일 기준 11일", () => {
  const r = settleOnTermination({
    hireDate: "2024-07-01", endDate: "2025-06-30",
    fiscalGrantedTotal: 18.5, usedOrPaidTotal: 0,
  });
  assert.equal(r.hireDateTotal, 11, `기대 11, 실제 ${r.hireDateTotal}`);
});

// ── 산정 예 ③ — 2024.7.1 입사 → 2025.1.31 퇴사 (1년 미만)
//    "입사일을 기준으로 하면 6일", 회계연도로는 6 + 7.5 = 13.5일
ck("교재 ③ · 2024-07-01 입사 → 2025-01-31 퇴사 → 입사일 기준 6일", () => {
  const r = settleOnTermination({
    hireDate: "2024-07-01", endDate: "2025-01-31",
    fiscalGrantedTotal: 13.5, usedOrPaidTotal: 0,
  });
  assert.equal(r.hireDateTotal, 6, `기대 6, 실제 ${r.hireDateTotal}`);
  assert.equal(r.favourable, "fiscal-year", "회계연도 13.5 > 입사일 6");
});

ck("교재 ③ · 재산정 규정이 있으면 6일로 내려간다", () => {
  const r = settleOnTermination({
    hireDate: "2024-07-01", endDate: "2025-01-31",
    fiscalGrantedTotal: 13.5, usedOrPaidTotal: 0, hasRecalcClause: true,
  });
  assert.equal(r.guaranteedTotal, 6, "교재: 규정이 있다면 6일로 계산하여 지급");
});

ck("교재 ③ · 재산정 규정이 없으면 13.5일을 그대로 준다", () => {
  const r = settleOnTermination({
    hireDate: "2024-07-01", endDate: "2025-01-31",
    fiscalGrantedTotal: 13.5, usedOrPaidTotal: 0, hasRecalcClause: false,
  });
  assert.equal(r.guaranteedTotal, 13.5, "교재: 규정이 없다면 13.5일");
});

// ── 2026-09-24 발견한 결함들을 고정한다
ck("미입력을 0 으로 읽지 않는다 — 입사일·퇴사일만 넣으면 확정하지 않는다", () => {
  const r = settleOnTermination({ hireDate: "2019-01-01", endDate: "2026-09-24" });
  assert.equal(r.verdict, "insufficient-input", "「정산 대상 114일」이 떠서는 안 된다");
  assert.ok(Number.isNaN(r.shortfallDays));
  assert.ok(r.groundNote.includes("입력되지 않았"), "무엇이 빠졌는지 알려야 한다");
});

ck("0 을 직접 넣은 것은 미입력과 다르게 계산한다", () => {
  const r = settleOnTermination({
    hireDate: "2025-03-01", endDate: "2025-11-30",
    fiscalGrantedTotal: 0, usedOrPaidTotal: 0,
  });
  assert.equal(r.verdict, "shortfall", "0 을 넣었으면 계산해야 한다");
  assert.equal(r.hireDateTotal, 8, "9개월 근무 → 개월당 1일 = 8일");
});

ck("1년 이상 근속이면 11일 포함 여부를 묻는다 (구법 차감규정 경계를 추측하지 않는다)", () => {
  const r = settleOnTermination({
    hireDate: "2024-05-01", endDate: "2026-04-30",
    fiscalGrantedTotal: 26, usedOrPaidTotal: 0,
  });
  assert.equal(r.verdict, "insufficient-input");
  assert.ok(r.groundNote.includes("11일"), "무엇을 물어보는지 문구에 있어야 한다");
});

ck("1년 미만 근속은 묻지 않고 항상 월차를 포함한다", () => {
  const r = settleOnTermination({
    hireDate: "2025-03-01", endDate: "2025-11-30",
    fiscalGrantedTotal: 5, usedOrPaidTotal: 0,
  });
  assert.notEqual(r.verdict, "insufficient-input", "1년 미만은 차감 논란이 없다");
  assert.equal(r.hireDateTotal, 8);
});

if (fail) { console.error(`\nleave-settlement-textbook: 실패 ${fail}건`); throw new Error("Original regression assertions failed"); }
console.log("leave-settlement-textbook: 10건 통과 (최영우 산정 예 (가)·②·③ + 미입력/월차 경계)");
