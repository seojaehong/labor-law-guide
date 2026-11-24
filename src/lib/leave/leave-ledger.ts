/**
 * 연차 원장(ledger) — 연도별 발생 이력과 누계.
 *
 * 왜 필요한가
 *   `annual-leave.ts` 는 "그 시점의 연간 부여일수" 하나만 낸다.
 *   퇴직 정산은 **누계 두 개를 비교**하는 일이라 연도별 이력이 있어야 한다.
 *
 * 법적 근거 — 고용노동부 근로기준과-5802 (2009-12-31)
 *   "연차휴가 산정기간을 노무관리의 편의를 위해 회계연도를 기준으로 전 근로자에
 *    일률적으로 적용하더라도 **근로자에게 불리하지 않아야** 하므로 퇴직시점에서
 *    총 휴가일수가 근로자의 입사일을 기준으로 산정한 휴가일수에 미달하는 경우에는
 *    그 미달하는 일수에 대하여 연차유급휴가 미사용수당으로 정산하여 지급하여야"
 *
 *   ★ 같은 해석의 후단이 중요하다 — 회계연도 기준이 **더 많은 경우도 있다**.
 *     "퇴직일이 2009년 7월 30일이라면 … (입사일기준 총 62일, 회계연도기준 총 69일)
 *      … 회계연도 기준에 따라 연차유급휴가 미사용수당을 지급하여야"
 *     즉 규칙은 「입사일 기준으로 맞춘다」가 아니라 **「유리한 쪽으로 맞춘다」**이다.
 *
 * 검증: 위 해석의 사례(입사 2004-08-01 · 퇴사 2009-09-30)에서 입사일 기준 누계 79일.
 *       tests/leave-ledger.crosscheck.mts 가 이 값을 고정한다.
 */

// 같은 디렉터리라 상대경로를 쓴다 — @/ 별칭은 Next 빌드에서만 해석되고
// node --experimental-strip-types 로 도는 테스트에서는 풀리지 않는다.
import { calculateEntitlement } from "./annual-leave";

export interface LedgerEntry {
  /** 이 발생분의 기준 연도 표시 (예: "3년차" 또는 "2026 회계연도") */
  label: string;
  /** 발생일 — 이 날짜에 권리가 생긴다 */
  accruedOn: string;
  /** 그 해 발생일수 */
  days: number;
  /** 누계 */
  cumulative: number;
  /** 어떤 규칙이 적용됐는지 */
  basisLabel: string;
}

export interface LedgerResult {
  entries: LedgerEntry[];
  /** 총 발생일수 */
  total: number;
}

/** 값이 실제로 들어온 숫자인가. `undefined`·`null`·`""`·NaN 은 「미입력」이다. */
function isFiniteNumber(v: unknown): boolean {
  if (v === undefined || v === null || v === "") return false;
  return Number.isFinite(Number(v));
}

function parse(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}
function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addYears(d: Date, n: number): Date {
  const t = new Date(d);
  t.setUTCFullYear(t.getUTCFullYear() + n);
  return t;
}

/**
 * 입사일 기준 원장.
 *
 * 1년 미만 월차(개월당 1일, 상한 11)는 **별도 권리**라 연차 누계와 섞지 않는다.
 * 여기서는 기념일마다 발생하는 연차(15일+가산)만 쌓는다.
 * `includeFirstYearMonthly` 를 켜면 1년 미만 월차도 첫 항목으로 넣는다.
 */
export function buildHireDateLedger(
  hireDate: string,
  endDate: string,
  options: { includeFirstYearMonthly?: boolean } = {}
): LedgerResult {
  const hire = parse(hireDate);
  const end = parse(endDate);
  if (end < hire) throw new Error("종료일이 입사일보다 빠릅니다");

  const entries: LedgerEntry[] = [];
  let cumulative = 0;

  if (options.includeFirstYearMonthly) {
    // 1년 미만 구간 — 만 1년이 되기 **전날**까지의 월차.
    // ★ 2026-09-24 — 기념일 당일로 재면 serviceYears 가 1 이 되어 아래 조건에서
    //   항상 탈락했다. 옵션을 켜도 월차가 한 번도 들어가지 않던 원인이다.
    const firstAnniv = addYears(hire, 1);
    const dayBefore = new Date(firstAnniv);
    dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
    const cut = end < dayBefore ? end : dayBefore;
    const r = calculateEntitlement({ hireDate, asOf: fmt(cut) });
    if (r.serviceYears < 1 && r.days > 0) {
      cumulative += r.days;
      entries.push({
        label: "1년 미만(월차)",
        accruedOn: fmt(cut),
        days: r.days,
        cumulative,
        basisLabel: r.basisLabel,
      });
    }
  }

  // 기념일마다 발생 — 종료일을 넘지 않는 것만
  for (let year = 1; ; year += 1) {
    const anniversary = addYears(hire, year);
    if (anniversary > end) break;
    const r = calculateEntitlement({ hireDate, asOf: fmt(anniversary) });
    cumulative += r.days;
    entries.push({
      label: `${year}년차`,
      accruedOn: fmt(anniversary),
      days: r.days,
      cumulative,
      basisLabel: r.basisLabel,
    });
    if (year > 60) break; // 안전장치
  }

  return { entries, total: cumulative };
}

/**
 * 1년차 연차(15일)가 이 날 이전에 생겼으면 구 근로기준법 제60조제3항이 적용된다 —
 * 최초 1년의 근로에 대한 휴가는 1년 미만 월 연차를 포함해 15일이고, 이미 쓴 월 연차는 15일에서 뺀다.
 *   법률 제15108호(공포 2017. 11. 28., 시행 2018. 5. 29.)가 제3항을 지웠고 적용례·경과조치는 두지 않았다.
 *   법제처 18-0067(2018. 4. 24.): 2018. 5. 29.을 기준으로 근로한 기간이 1년 이상인 근로자에게는 구법 제3항이 적용된다
 *     (1년이 되는 날 법률관계가 이미 확정됐으므로).
 *   법제처 18-0404(2018. 8. 6.): 2018. 5. 30. 이후 근로기간이 1년이 되는 근로자는 1년차 11일·2년차 15일을 각각 받는다.
 * 1년차 발생일 = 입사 1년이 끝난 다음 날(buildHireDateLedger 의 기념일, 대법원 2022다245419).
 *   2017-05-29 입사 → 2018-05-29 발생: 그날을 기준으로 근로한 기간이 이미 1년(2017-05-29~2018-05-28)이라 구법.
 *   2017-05-30 입사 → 2018-05-30 발생: 신법.
 * (261124 src/lib/calc/leave-pay.ts 에서 옮겼다 — leave-pay 가 이 파일을 import 하므로 반대 방향은 순환이 된다)
 */
export const OLD_60_3_LAST_ACCRUAL = "2018-05-29";

/**
 * 법정 발생 원장 — 입사일·마지막 재직일만으로 정해진다. 화면 선택으로 늘거나 줄지 않는다.
 *   · 근속 1년 미만: 월 단위 연차만(1년차 15일이 아직 없다 — 구법 시기여도 같다)
 *   · 1년차 발생일 ≤ OLD_60_3_LAST_ACCRUAL: 첫해 월 연차는 1년차 15일에 포함(따로 더하지 않는다)
 *   · 그 뒤: 첫해 월 연차(최대 11일) + 1년차 15일을 따로 센다(대법원 2021다227100)
 * 연차수당 계산기(leave-pay)와 퇴직 연차 정산(settleOnTermination)이 같이 쓴다.
 */
export function buildStatutoryHireDateLedger(
  hireDate: string,
  endDate: string
): LedgerResult & { firstYearMonthly: "separate" | "included-in-15" } {
  const annual = buildHireDateLedger(hireDate, endDate);
  const firstAccrual = annual.entries[0]?.accruedOn;
  const includedIn15 = firstAccrual !== undefined && firstAccrual <= OLD_60_3_LAST_ACCRUAL;
  const l = includedIn15 ? annual : buildHireDateLedger(hireDate, endDate, { includeFirstYearMonthly: true });
  return { ...l, firstYearMonthly: includedIn15 ? "included-in-15" : "separate" };
}

export interface SettlementInput {
  hireDate: string;
  /**
   * 마지막 재직일(상실일이 아니다). 상실일은 그 다음 날이다.
   * 예: 2025-01-01 입사 — 마지막 재직일 2025-12-31 이면 발생 11일, 2026-01-01 이면 11 + 15 = 26일.
   */
  endDate: string;
  /**
   * 회사가 회계연도 기준으로 **실제 부여한** 일수의 합계.
   *
   * ★ `undefined` 는 「미입력」이다. 0 과 다르다.
   *   빈 칸을 0 으로 읽으면 "한 번도 안 줬다"가 되어 없는 채권을 만든다.
   *   (2026-09-24 — 입사일·퇴사일만 넣으면 「정산 대상 114일」이 뜨던 결함)
   */
  fiscalGrantedTotal?: number;
  /** 이미 사용했거나 수당으로 지급한 일수의 합계. `undefined` = 미입력 */
  usedOrPaidTotal?: number;
  /**
   * ⚠ 261124 부터 **계산에 쓰지 않는다**(호출 호환을 위해 받기만 한다).
   *   입사일 기준 누계는 법정 발생 원장(buildStatutoryHireDateLedger)으로 날짜만 보고 정한다.
   *   종전에는 이 선택이 법정 발생분을 바꿨다 —
   *     · 신법 시기 「제외」: 2025-01-01 입사·2026-01-01 마지막 재직의 첫해 11일이 사라졌다(발생 26 → 15).
   *     · 구법 시기 「포함」: 2016-01-04 입사의 11일이 15일 안에 이미 있는데 또 더해졌다(170 → 181).
   *   회계연도 부여 누계에 첫해 월 연차를 넣었는지는 사용자가 그 입력값에서 맞춘다.
   *
   * 아래는 종전 설명이다(기록용).
   * 1년 미만 월차(개월당 1일, 상한 11)를 **입사일 기준 누계에 포함**할지.
   *
   * 최영우 교재 산정 예는 포함해서 비교한다 —
   *   "2024.7.1. 입사 → 2025.6.30. 퇴사: 입사일을 기준으로 하면 **11일**"
   *   "2024.7.1. 입사 → 2025.1.31. 퇴사: 입사일을 기준으로 하면 **6일**"
   * 사용자가 넣는 회계연도 부여분에도 이 11일이 들어가 있으므로, 빼고 비교하면
   * 서로 다른 잣대를 맞대는 것이 된다(2026-09-24 발견).
   *
   * ★ 그런데 **구법에는 1년 미만 월차를 다음 해 15일에서 차감하는 규정**이 있었다.
   *   그 규정이 언제 없어졌는지(시행일)를 우리 DB 에서 확인하지 못했다.
   *   확인 안 된 날짜로 법 계산을 분기하지 않는다 → 근속 1년 이상이면 **물어본다**.
   *   `undefined` 면 확정하지 않고 「확인 필요」로 남긴다.
   *   (2026-10-29) 시행일은 확인됐다 — 법률 제15108호(공포 2017. 11. 28., 시행 2018. 5. 29.), 적용례 없음.
   *     법제처 18-0067: 2018. 5. 29.을 기준으로 근로한 기간이 1년 이상이면 구법 제3항이 적용된다.
   *     /tools/leave-pay 는 이 날짜로 가른다(src/lib/calc/leave-pay.ts OLD_60_3_LAST_ACCRUAL).
   *     이 함수의 질문은 회계연도 부여분과 같은 잣대를 맞추는 뜻도 있어 그대로 둔다.
   *
   *   근속 1년 미만은 다음 해 15일이 아예 없어 차감 논란이 성립하지 않으므로
   *   묻지 않고 항상 포함한다.
   */
  includeFirstYearMonthly?: boolean;
  /**
   * 취업규칙에 「퇴직 시 입사일 기준으로 재산정한다」는 규정이 있는가.
   *
   * ★ 이 값이 결과를 가른다. 최영우 교재 산정 예 —
   *   "취업규칙에 입사일로부터 재산정하여 지급한다는 규정이 없다면 18.5일,
   *    그러한 규정이 있다면(없더라도 관행적으로 재산정해 지급했다면) 11일로 산정하여 지급"
   *
   *   즉 **회계연도 기준이 더 많을 때** 갈린다.
   *     규정 없음 → 회계연도 부여분을 그대로 둔다(근로자에게 유리한 쪽)
   *     규정 있음 → 입사일 기준으로 재산정할 수 있다(깎일 수 있다)
   *
   *   `undefined` 로 두면 **확인 불가**로 판정하고 한쪽으로 밀지 않는다.
   */
  hasRecalcClause?: boolean;
}

export type SettlementVerdict = "shortfall" | "no-shortfall" | "insufficient-input";

export interface SettlementResult {
  /** 입사일 기준 누계 */
  hireDateTotal: number;
  /** 회계연도 기준 부여 누계(입력값) */
  fiscalGrantedTotal: number;
  /** 둘 중 근로자에게 유리한 값 — 이것이 보장선이다 */
  guaranteedTotal: number;
  /** 어느 쪽이 유리했는지 */
  favourable: "hire-date" | "fiscal-year" | "equal";
  usedOrPaidTotal: number;
  /** 정산해야 할 일수 (음수면 0으로 보정하지 않고 그대로 둔다 — 판단은 사람이) */
  shortfallDays: number;
  verdict: SettlementVerdict;
  ledger: LedgerEntry[];
  /** 화면에 그대로 띄울 근거 문장 */
  groundNote: string;
}

/**
 * 퇴직 정산 — 회계연도로 운영한 사업장의 퇴사자 재정산.
 *
 * 규칙: `보장선 = max(입사일 기준 누계, 회계연도 부여 누계)`
 *       `정산 대상 = 보장선 - 이미 사용·지급분`
 *
 * ⚠ 이 함수는 **발생일수**만 다룬다. 수당 금액(통상임금 × 일수)은 계산하지 않는다.
 */
export function settleOnTermination(input: SettlementInput): SettlementResult {
  const { hasRecalcClause } = input;

  // ── 입사일 기준 누계 = 법정 발생 원장. 첫해 월 연차는 날짜로만 정한다(구 제60조제3항 경계 포함).
  //    ★ 261124 — includeFirstYearMonthly 선택이 법정 발생분을 늘리거나 없애던 것을 막는다.
  //      연차수당 계산기(leave-pay)와 같은 함수다.
  const ledger = buildStatutoryHireDateLedger(input.hireDate, input.endDate);
  const hireDateTotal = ledger.total;

  // ★ 2026-09-23 — 음수 입력이 정산을 부풀리던 것을 막는다.
  //   usedOrPaidTotal = -5 면 보장선 114 - (-5) = 119 가 되어
  //   「이미 지급한 일수」가 음수라는 이유로 정산 대상이 늘어났다.
  //   일수는 음수가 될 수 없다. 0 으로 바닥을 친다.
  //
  // ★ 2026-09-24 — 그런데 **미입력을 0 으로 읽는 것**이 더 나쁜 결함이었다.
  //   빈 칸이 0 이 되어 "한 번도 부여하지 않았다"로 계산되고, 입사일·퇴사일만
  //   넣은 사람에게 「정산 대상 114일」이 즉시 떴다. 미입력과 0 을 구분한다.
  const fiscalMissing = !isFiniteNumber(input.fiscalGrantedTotal);
  const usedMissing = !isFiniteNumber(input.usedOrPaidTotal);
  const fiscalGrantedTotal = fiscalMissing ? 0 : Math.max(0, Number(input.fiscalGrantedTotal));
  const usedOrPaidTotal = usedMissing ? 0 : Math.max(0, Number(input.usedOrPaidTotal));

  if (fiscalMissing || usedMissing) {
    const missing = [
      fiscalMissing ? "회계연도로 부여한 누계" : null,
      usedMissing ? "사용·수당 지급한 누계" : null,
    ].filter(Boolean).join(" · ");
    return {
      hireDateTotal,
      fiscalGrantedTotal,
      guaranteedTotal: hireDateTotal,
      favourable: "equal",
      usedOrPaidTotal,
      shortfallDays: NaN,
      verdict: "insufficient-input",
      ledger: ledger.entries,
      groundNote: `${missing} 가 입력되지 않았습니다. 빈 칸을 0 으로 보면 「한 번도 부여·사용하지 않았다」가 되어 실제보다 큰 정산액이 나옵니다. 값을 넣어 주세요(0 이라면 0 을 직접 입력).`,
    };
  }

  const favourable =
    hireDateTotal === fiscalGrantedTotal
      ? "equal"
      : hireDateTotal > fiscalGrantedTotal
        ? "hire-date"
        : "fiscal-year";

  // ── 회계연도가 더 많은 경우에만 취업규칙 조항이 결과를 가른다 ──
  if (favourable === "fiscal-year" && hasRecalcClause === undefined) {
    // 한쪽으로 밀지 않는다. 확인 불가로 남긴다.
    return {
      hireDateTotal,
      fiscalGrantedTotal,
      guaranteedTotal: fiscalGrantedTotal,
      favourable,
      usedOrPaidTotal,
      shortfallDays: NaN,
      verdict: "insufficient-input",
      ledger: ledger.entries,
      groundNote:
        "회계연도 부여분이 입사일 기준보다 많습니다. 이때는 취업규칙에 「퇴직 시 입사일 기준으로 재산정한다」는 규정이 있는지에 따라 결과가 달라집니다(최영우 『실무노동법』 산정 예). 규정 유무가 입력되지 않아 금액을 확정하지 않습니다.",
    };
  }

  // 규정이 있으면 입사일 기준으로 재산정할 수 있다 → 보장선이 입사일 기준으로 내려간다
  const guaranteedTotal =
    favourable === "fiscal-year" && hasRecalcClause === true
      ? hireDateTotal
      : Math.max(hireDateTotal, fiscalGrantedTotal);

  const shortfallDays = guaranteedTotal - usedOrPaidTotal;

  const groundNote =
    favourable === "hire-date"
      ? "입사일 기준이 더 많으므로 그 차이를 정산해야 합니다(근로기준과-5802 · 근기 68207-620 — 퇴직시점 총 휴가일수가 입사일 기준에 미달하면 미달분을 미사용수당으로 정산)."
      : favourable === "equal"
        ? "두 기준이 같습니다."
        : hasRecalcClause
          ? "회계연도 부여분이 더 많지만, 취업규칙에 퇴직 시 입사일 기준 재산정 규정이 있어 입사일 기준으로 산정했습니다(최영우 산정 예). 실제 적용 가능 여부는 규정 문언과 관행을 확인해야 합니다."
          : "회계연도 부여분이 더 많고 재산정 규정이 없으므로 그대로 둡니다. 회계연도 운영이 근로자에게 불리하지 않습니다(근로기준과-5802).";
  const firstYearNote =
    ledger.firstYearMonthly === "included-in-15"
      ? " 1년차 15일이 2018. 5. 29. 이전에 생겨 첫해 월 단위 연차는 그 15일에 포함해 셉니다(구 제60조제3항, 법제처 18-0067)."
      : " 첫해 월 단위 연차(최대 11일)는 입사일 기준 누계에 따로 셉니다(제60조제2항). 회계연도 부여 누계에도 그 일수를 넣어야 같은 기준으로 비교됩니다.";
  const promotionNote = " 사용촉진(제61조)으로 보상 의무가 없어진 일수는 이 계산에서 빼지 않으니 따로 확인해 주세요.";

  return {
    hireDateTotal,
    fiscalGrantedTotal,
    guaranteedTotal,
    favourable,
    usedOrPaidTotal,
    shortfallDays,
    verdict: shortfallDays > 0 ? "shortfall" : "no-shortfall",
    ledger: ledger.entries,
    groundNote: groundNote + firstYearNote + promotionNote,
  };
}
