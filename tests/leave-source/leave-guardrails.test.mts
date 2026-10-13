/**
 * 출시 게이트 — 제우스가 정한 차단 기준을 테스트로 고정한다 (2026-09-23).
 *
 * 이 테스트가 깨지면 "기능이 안 된다"가 아니라 **"넘으면 안 되는 선을 넘었다"**는 뜻이다.
 * 고칠 때는 구현을 되돌린다. 테스트를 완화하지 않는다.
 */
import assert from "node:assert/strict";
import { buildPromotionSchedule, scheduleStatusLabel } from "../../src/lib/leave/leave-promotion";
import { calculateAllowance } from "../../src/lib/leave/leave-allowance";

let fail = 0;
const check = (l: string, fn: () => void) => {
  try { fn(); } catch (e) { fail++; console.error(`  ❌ ${l}: ${e instanceof Error ? e.message : e}`); }
};

// ── A4 연차촉진 ────────────────────────────────────────────────
check("최영우 교재 표: 1년 미만은 3개월 전 10일 + 1개월 전 5일 (별도 분기)", () => {
  const r = buildPromotionSchedule({
    usagePeriodEnd: "2026-12-31",
    kind: "monthly-under-1year",
  });
  // 교재 『연차사용촉진 절차(1.1~12.31 기준)』 1년 미만 근무자
  //   9일분 1차 10.1~10.10 · 2차 11.30 까지 / 2일분 1차 12.1~12.5 · 2차 12.21 까지
  const w = r.windows;
  assert.equal(w[0].from, "2026-10-01", `9일분 1차 시작: ${w[0].from}`);
  assert.equal(w[0].to, "2026-10-10", `9일분 1차 끝: ${w[0].to}`);
  assert.equal(w[1].to, "2026-11-30", `9일분 2차: ${w[1].to}`);
  assert.equal(w[2].from, "2026-12-01", `2일분 1차 시작: ${w[2].from}`);
  assert.equal(w[2].to, "2026-12-05", `2일분 1차 끝(5일간): ${w[2].to}`);
  assert.equal(w[3].to, "2026-12-21", `2일분 2차(10일 전): ${w[3].to}`);
  // §61① 의 6개월·2개월을 그대로 쓰지 않았는지
  assert.ok(!w.some((x) => x.from === "2026-07-01"), "§61① 기간을 재사용하면 안 된다");
});

check("게이트: 1차 촉구는 마감일만 주지 않고 시작·끝을 함께 준다", () => {
  const r = buildPromotionSchedule({ usagePeriodEnd: "2026-12-31", kind: "annual-15plus" });
  const first = r.windows[0];
  assert.ok(first.from && first.to, "허용 기간의 시작과 끝이 모두 있어야 한다");
  // ★ 최영우 교재 『연차사용촉진 절차(1.1~12.31 기준)』 — 1년 이상 근무자 1차 = 7.1~7.10
  //   12-31 에서 6개월을 그냥 빼면 6-30 이 나오는데 실무 기준은 7-01 이다(남은 기간이 6개월인 첫날).
  //   처음에 6-30 으로 구현했다가 교재 표와 대조해 고쳤다.
  assert.equal(first.from, "2026-07-01", `교재 표 7.1: ${first.from}`);
  assert.equal(first.to, "2026-07-10", `교재 표 7.10 (10일간): ${first.to}`);
});

check("최영우 교재 표: 1년 이상 2차 통보는 10.31 까지 (2개월 전)", () => {
  const r = buildPromotionSchedule({ usagePeriodEnd: "2026-12-31", kind: "annual-15plus" });
  const second = r.windows[2];
  assert.equal(second.to, "2026-10-31", `교재 표 10.31: ${second.to}`);
});

check("게이트: 응답기한은 수령일 기준이다 (발송일 대체 금지)", () => {
  const withReceipt = buildPromotionSchedule({
    usagePeriodEnd: "2026-12-31", kind: "annual-15plus",
    firstNoticeSentOn: "2026-07-02", firstNoticeReceivedOn: "2026-07-06",
  });
  const w = withReceipt.windows[1];
  assert.equal(w.to, "2026-07-16", `수령일+10 이어야 한다: ${w.to}`);

  const noReceipt = buildPromotionSchedule({
    usagePeriodEnd: "2026-12-31", kind: "annual-15plus",
    firstNoticeSentOn: "2026-07-02",
  });
  const w2 = noReceipt.windows[1];
  assert.equal(w2.status, "unknown", "수령일이 없으면 확인 불가여야 한다");
  assert.equal(w2.to, null, "발송일로 기한을 만들면 안 된다");
});

check("게이트: 기록 없음을 미실시로 바꾸지 않는다", () => {
  const r = buildPromotionSchedule({ usagePeriodEnd: "2026-12-31", kind: "annual-15plus" });
  assert.equal(r.windows[0].status, "unknown", "기록이 없으면 unknown 이지 diff 가 아니다");
});

check("게이트: 라벨이 「촉진: 일치」가 아니라 「일정 대조: 일치」다", () => {
  assert.equal(scheduleStatusLabel("match"), "일정 대조: 일치");
  assert.ok(!scheduleStatusLabel("match").includes("촉진"),
    "촉진 자체가 적법하다는 뜻으로 읽히면 안 된다");
});

check("게이트: 적법성·수당면제 판정 필드가 없다", () => {
  const r = buildPromotionSchedule({
    usagePeriodEnd: "2026-12-31", kind: "annual-15plus",
    firstNoticeSentOn: "2026-07-02", firstNoticeReceivedOn: "2026-07-02",
    workerRepliedOn: "2026-07-08", secondNoticeSentOn: "2026-10-20",
  });
  // disclaimer 는 "적법성은 확인하지 않았습니다"라는 **부정문**이라 검사에서 뺀다.
  // 금지하려는 것은 "적법하다"고 단정하는 출력이다.
  const { disclaimer, ...rest } = r;
  const payload = JSON.stringify(rest);
  for (const banned of ["lawful", "적법", "수당면제", "exempt", "촉진 완료"]) {
    assert.ok(!payload.includes(banned), `금지 표현이 결과에 있다: ${banned}`);
  }
  assert.ok(disclaimer.includes("적법성은 확인하지 않았습니다"),
    "한계 고지는 반드시 있어야 한다");
});

// ── A5 수당 엔진 ───────────────────────────────────────────────
check("게이트: 통상임금을 산정하지 않는다 — 단가가 없으면 금액을 내지 않는다", () => {
  const r = calculateAllowance({
    unusedDays: 10, dailyRate: NaN,
    rateBasis: "ordinary-wage", rateSource: "",
  });
  assert.equal(r.verdict, "insufficient-input");
  assert.equal(r.amount, null, "단가 없이 금액을 만들면 안 된다");
});

check("게이트: 단가 출처를 남기지 않으면 금액을 내지 않는다", () => {
  const r = calculateAllowance({
    unusedDays: 10, dailyRate: 100000,
    rateBasis: "ordinary-wage", rateSource: "   ",
  });
  assert.equal(r.verdict, "insufficient-input");
  assert.equal(r.amount, null);
});

check("정상 계산 — 산식과 출처가 결과에 남는다", () => {
  const r = calculateAllowance({
    unusedDays: 10, dailyRate: 120000,
    rateBasis: "ordinary-wage", rateSource: "2026-09 급여대장 통상임금",
  });
  assert.equal(r.verdict, "calculated");
  assert.equal(r.amount, 1200000);
  assert.ok(r.formulaNote.includes("통상임금"));
  assert.ok(r.formulaNote.includes("2026-09 급여대장"));
});

check("게이트: 엔진이 시효·촉진으로 일수를 몰래 깎지 않는다", () => {
  const r = calculateAllowance({
    unusedDays: 26, dailyRate: 100000,
    rateBasis: "ordinary-wage", rateSource: "대장",
  });
  assert.equal(r.unusedDays, 26, "입력 일수를 그대로 써야 한다");
  assert.equal(r.amount, 2600000);
});

if (fail) { console.error(`\nleave-guardrails: 실패 ${fail}건 — 출시 막아야 한다`); throw new Error("Original regression assertions failed"); }
console.log("leave-guardrails: 10건 통과 (제우스 출시 게이트)");
