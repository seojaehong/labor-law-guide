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

export interface SettlementInput {
  hireDate: string;
  /** 퇴사일 */
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

  // ── 근속 1년 미만인가. 여기서는 1년 미만 월차만 존재하므로 차감 논란이 없다.
  const servedUnderOneYear = parse(input.endDate) < addYears(parse(input.hireDate), 1);

  // ── 1년 미만 월차를 입사일 기준 누계에 넣을지
  //    1년 미만 근속: 항상 넣는다(그것 말고는 발생한 것이 없다)
  //    1년 이상 근속: 입력이 있어야 넣는다. 없으면 아래에서 「확인 필요」로 끝낸다.
  const includeMonthly = servedUnderOneYear ? true : input.includeFirstYearMonthly === true;

  const ledger = buildHireDateLedger(input.hireDate, input.endDate, {
    includeFirstYearMonthly: includeMonthly,
  });
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

  if (!servedUnderOneYear && input.includeFirstYearMonthly === undefined) {
    return {
      hireDateTotal,
      fiscalGrantedTotal,
      guaranteedTotal: hireDateTotal,
      favourable: "equal",
      usedOrPaidTotal,
      shortfallDays: NaN,
      verdict: "insufficient-input",
      ledger: ledger.entries,
      groundNote:
        "입사 후 1년 미만 기간에 월 단위로 발생한 연차(최대 11일)를 입사일 기준 누계에 포함할지 선택해 주세요. 회계연도로 부여한 누계에 그 일수가 들어가 있다면 포함해야 같은 기준으로 비교됩니다(최영우 『실무노동법』 산정 예 — 입사일 기준 11일 / 6일). 적법한 사용촉진으로 이미 소멸한 경우에는 제외합니다.",
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

  return {
    hireDateTotal,
    fiscalGrantedTotal,
    guaranteedTotal,
    favourable,
    usedOrPaidTotal,
    shortfallDays,
    verdict: shortfallDays > 0 ? "shortfall" : "no-shortfall",
    ledger: ledger.entries,
    groundNote,
  };
}
