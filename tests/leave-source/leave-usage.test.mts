/**
 * 사용분 차감 단위 검증 — 반차 0.5 · 반반차 0.25 · 시간차.
 *
 * 법정 제도가 아니라 회사 규칙이므로, 기대값은 "법이 이렇다"가 아니라
 * "환산이 산술적으로 맞는가 + 규칙 위반을 놓치지 않는가"를 본다.
 */
import assert from "node:assert/strict";
import { summarizeUsage, formatDays } from "../../src/lib/leave/leave-usage";
import type { UsageUnitPolicy } from "../../src/lib/leave/leave-usage";

let fail = 0;
const check = (label: string, fn: () => void) => {
  try { fn(); } catch (e) { fail++; console.error(`  ❌ ${label}: ${e instanceof Error ? e.message : e}`); }
};

const full: UsageUnitPolicy = {
  hoursPerDay: 8, allowHalf: true, allowQuarter: true, allowHourly: true, hourlyIncrement: 1,
};

check("종일+반차+반반차 환산", () => {
  const s = summarizeUsage(
    [
      { date: "2026-01-05", kind: "full" },
      { date: "2026-01-06", kind: "half" },
      { date: "2026-01-07", kind: "quarter" },
    ],
    full
  );
  assert.equal(s.totalDays, 1.75, `기대 1.75, 실제 ${s.totalDays}`);
  assert.equal(s.issues.length, 0);
});

check("시간차 — 4시간/8시간 = 0.5일", () => {
  const s = summarizeUsage([{ date: "2026-02-02", kind: "hourly", hours: 4 }], full);
  assert.equal(s.totalDays, 0.5);
});

check("소정근로시간이 8이 아닌 사업장 — 6시간제에서 3시간 = 0.5일", () => {
  const s = summarizeUsage(
    [{ date: "2026-02-02", kind: "hourly", hours: 3 }],
    { ...full, hoursPerDay: 6 }
  );
  assert.equal(s.totalDays, 0.5, `단시간 근로자 기준이 반영돼야 한다: ${s.totalDays}`);
});

check("허용하지 않는 단위를 쓰면 잡는다", () => {
  const s = summarizeUsage(
    [{ date: "2026-03-03", kind: "quarter" }],
    { ...full, allowQuarter: false }
  );
  assert.equal(s.issues.length, 1);
  assert.equal(s.issues[0].code, "unit-not-allowed");
  // 규칙 위반이어도 환산은 한다 — 합계에서 빼버리면 대장과 안 맞는다
  assert.equal(s.totalDays, 0.25);
});

check("시간이 없는 시간차는 환산 불가로 남긴다", () => {
  const s = summarizeUsage([{ date: "2026-03-04", kind: "hourly" }], full);
  assert.equal(s.issues[0].code, "hours-missing");
  assert.equal(s.totalDays, 0, "환산할 수 없으면 0으로 두고 이슈로 남긴다");
});

check("1일 소정근로시간 초과를 잡는다", () => {
  const s = summarizeUsage([{ date: "2026-03-05", kind: "hourly", hours: 9 }], full);
  assert.ok(s.issues.some((i) => i.code === "hours-exceed-day"));
});

check("최소 단위 위반을 잡는다 (1시간 단위인데 1.5시간)", () => {
  const s = summarizeUsage([{ date: "2026-03-06", kind: "hourly", hours: 1.5 }], full);
  assert.ok(s.issues.some((i) => i.code === "hours-not-multiple"));
});

check("표기", () => {
  assert.equal(formatDays(1), "1일");
  assert.equal(formatDays(0.25), "0.25일");
  assert.equal(formatDays(1.75), "1.75일");
});

if (fail) { console.error(`\nleave-usage: 실패 ${fail}건`); throw new Error("Original regression assertions failed"); }
console.log("leave-usage: 8건 통과");
