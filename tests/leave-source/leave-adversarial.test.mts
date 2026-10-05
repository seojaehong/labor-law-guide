/**
 * 적대적 입력 — **내가 의도한 것이 아니라 사용자가 넣을 것**을 넣는다.
 *
 * 왜 따로 두나: 2026-09-23 에 내가 만든 루브릭으로 100점을 받고도
 * 외부 검수에서 치명적 버그 5건이 나왔다. 내가 만든 기준은 내가 의도한 동작만
 * 검증한다. 이 파일은 **내가 의도하지 않은 입력**만 모은다.
 *
 * 규칙: 새 버그를 찾으면 여기에 케이스를 추가하고 나서 고친다.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { calculateEntitlement, compareRow } from "../../src/lib/leave/annual-leave";
import { buildHireDateLedger, settleOnTermination } from "../../src/lib/leave/leave-ledger";
import { todayLocal } from "../../src/lib/leave/leave-today";
import { buildPromotionSchedule } from "../../src/lib/leave/leave-promotion";

let fail = 0;
const ck = (l: string, fn: () => void) => {
  try { fn(); } catch (e) { fail++; console.error(`  ❌ ${l}: ${e instanceof Error ? e.message : e}`); }
};

// ── 검수에서 나온 것 (2026-09-23) ──
ck("기준일보다 미래 입사 → error (일치로 세면 안 된다)", () => {
  const r = compareRow({ name: "x", hireDate: "2027-01-01", recordedDays: 15 }, "2026-09-23");
  assert.equal(r.verdict, "error");
  assert.ok(Number.isNaN(r.calculatedDays));
});

// ── 내가 스스로 돌려서 찾은 것 ──
ck("음수 누계가 정산을 부풀리지 않는다", () => {
  const r = settleOnTermination({
    hireDate: "2019-01-01", endDate: "2026-09-23",
    fiscalGrantedTotal: -10, usedOrPaidTotal: -5,
    includeFirstYearMonthly: false,
  });
  assert.ok(r.shortfallDays <= r.guaranteedTotal,
    `정산(${r.shortfallDays})이 보장선(${r.guaranteedTotal})을 넘었다`);
  assert.ok(r.fiscalGrantedTotal >= 0 && r.usedOrPaidTotal >= 0, "음수가 그대로 남았다");
});

// ── 경계값 ──
ck("입사 당일 = 0일", () => {
  assert.equal(calculateEntitlement({ hireDate: "2026-09-23", asOf: "2026-09-23" }).days, 0);
});

ck("윤년 2/29 입사 — 1년을 마친 다음 날 15일 (대법 2022다245419)", () => {
  // 2024-02-29 ~ 2025-02-28 이 1년. 그 다음 날 3/1 에 15일이 발생한다.
  assert.equal(calculateEntitlement({ hireDate: "2024-02-29", asOf: "2025-02-28" }).serviceYears, 0);
  assert.equal(calculateEntitlement({ hireDate: "2024-02-29", asOf: "2025-03-01" }).days, 15);
});

ck("월말 입사 1/31 — 기념일 판정이 흔들리지 않는다", () => {
  assert.equal(calculateEntitlement({ hireDate: "2024-01-31", asOf: "2025-01-30" }).serviceYears, 0);
  assert.equal(calculateEntitlement({ hireDate: "2024-01-31", asOf: "2025-01-31" }).serviceYears, 1);
});

ck("초장기 근속은 상한 25일", () => {
  assert.equal(calculateEntitlement({ hireDate: "1976-01-01", asOf: "2026-09-23" }).days, 25);
});

ck("원장 안전장치 — 50년이어도 폭주하지 않는다", () => {
  const r = buildHireDateLedger("1976-01-01", "2026-09-23");
  assert.ok(r.entries.length <= 61, `행 ${r.entries.length}`);
});

ck("퇴사가 입사보다 빠르면 예외", () => {
  assert.throws(() =>
    settleOnTermination({ hireDate: "2020-01-01", endDate: "2019-01-01",
      fiscalGrantedTotal: 15, usedOrPaidTotal: 0,
      // 2026-09-24 계약 변경 — 1년 이상 근속은 월차 포함 여부를 명시해야 계산된다
      includeFirstYearMonthly: false }));
});

ck("초과 지급이면 정산 대상이 음수 — 0으로 숨기지 않는다", () => {
  const r = settleOnTermination({
    hireDate: "2019-01-01", endDate: "2026-09-23",
    fiscalGrantedTotal: 100, usedOrPaidTotal: 200, hasRecalcClause: false,
    includeFirstYearMonthly: false,
  });
  assert.ok(r.shortfallDays < 0, "이미 더 준 사실이 값에 남아야 한다");
  assert.equal(r.verdict, "no-shortfall");
});

ck("대장값 소수 0.5 단위도 대조된다", () => {
  const r = compareRow({ name: "x", hireDate: "2019-03-02", recordedDays: 17.5 }, "2026-09-23");
  assert.equal(r.verdict, "diff");
  assert.equal(r.diff, -0.5);
});


// ── 외부 검수 지적 ④ 재발 방지 — KST 오전에 날짜가 하루 전으로 찍히던 것.
//    화면 두 곳(LeaveInput·SettlementInput)에 각자 today() 가 있어 한쪽만 고쳐졌었다.
//    이제 lib/leave-today.ts 하나만 쓴다. 소스에 toISOString 날짜가 다시 생기면 실패한다.
ck("todayLocal 은 UTC 가 아니라 현지 날짜를 준다", () => {
  const got = todayLocal();
  const d = new Date();
  const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  assert.equal(got, expected, "현지 달력 날짜와 같아야 한다");
  // KST(UTC+9) 의 00~09시에는 UTC 날짜가 하루 전이다. 그때 두 값이 갈려야 정상.
  const utc = new Date().toISOString().slice(0, 10);
  if (got !== utc) {
    assert.ok(got > utc, "현지 날짜가 UTC 보다 앞서야 한다 (KST 오전)");
  }
});

ck("화면 컴포넌트에 toISOString 날짜 계산이 남아 있지 않다", () => {
  const dir = new URL("../../src/components/leave/", import.meta.url);
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".tsx")) continue;
    const src = readFileSync(new URL(f, dir), "utf-8");
    const offending = src
      .split("\n")
      .filter((l) => l.includes("toISOString") && !l.trimStart().startsWith("*") && !l.trimStart().startsWith("//"));
    assert.equal(offending.length, 0, `${f} 에 toISOString 날짜 계산이 남아 있다: ${offending.join(" / ")}`);
  }
});


// ── 2026-09-24 TF 지적 — 늦은 촉구를 「일치」라고 말하던 것
//    §61② 은 9일분·2일분을 각각 촉구한다. 발송일이 한 묶음에만 들어가도
//    「일정 대조: 일치」가 떴고, 표 1단계는 「차이」였다. 배지가 이긴다.
ck("촉진: 한 묶음만 맞아도 전체를 「일치」라고 하지 않는다", () => {
  const r = buildPromotionSchedule({
    usagePeriodEnd: "2026-12-31",
    kind: "monthly-under-1year",
    firstNoticeSentOn: "2026-12-03", // 2일분 창 안, 9일분 창은 놓침
  });
  assert.equal(r.windows[0].status, "diff", "9일분 창을 놓친 것은 맞다");
  assert.notEqual(r.overall, "match", "표가 「차이」인데 배지가 「일치」면 안 된다");
  assert.equal(r.overall, "diff");
});

ck("촉진: 두 분기의 전체 판정 규칙이 같다", () => {
  const a = buildPromotionSchedule({ usagePeriodEnd: "2026-12-31", kind: "monthly-under-1year", firstNoticeSentOn: "2026-12-03" });
  const b = buildPromotionSchedule({ usagePeriodEnd: "2026-12-31", kind: "annual-15plus", firstNoticeSentOn: "2026-12-03" });
  assert.equal(a.overall, b.overall, "같은 조건에서 분기마다 다른 결론이 나오면 안 된다");
});

ck("촉진: 아무것도 안 넣으면 「확인 불가」다", () => {
  const r = buildPromotionSchedule({ usagePeriodEnd: "2026-12-31", kind: "monthly-under-1year" });
  assert.equal(r.overall, "unknown", "입력이 없는데 일치/차이를 단정하면 안 된다");
});

if (fail) { console.error(`\nleave-adversarial: 실패 ${fail}건`); throw new Error("Original regression assertions failed"); }
console.log("leave-adversarial: 15건 통과 (검수 지적 + 자체 발견 + 경계값)");
