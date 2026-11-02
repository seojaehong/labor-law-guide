// 임금 수치 규칙 — 최저임금·산출근거 정합·연장수당 가산율/충분성·휴일 포괄 충분성.
//
// MINWAGE(261101 재홍님 확정 법리 A~D, minwageAssessment):
//   형태(payBasis) — 기본급이 시급 띠(최저시급 0.5~5배) 안이면 그 금액이 곧 시급(시급제). 산출근거 시간이 주휴가 들어간
//     월 시간(±1H, 포괄이면 월 시간 + 주 연장×4.345×1.5 도)이면 pay_type·주휴 포함 표시와 관계없이 월급제. 그 밖은
//     pay_type, 없으면 산출근거 시간이 있으면 시급제.
//   A 시급제 — 계약 시급(normalize.hourlyRateOf: 띠 안 기본급, 아니면 BASE.amount ÷ basis_hours, 원 단위 반올림)만
//     최저시급과 비교. 포괄이어도 같다(연장 충분성은 OT-COVER). 주휴수당은
//     근기법 §55① 법정 발생이라 항목이 없어도 위반이 아니다. 1주 소정 15H 이상인데 주휴 산정·지급 방법(WEEKLY_HOLIDAY
//     항목)이 없으면 근기법 §17② 서면 명시 확인 필요 → risk(minor). 1주 소정 미상이면 그 확인은 내지 않는다.
//     pay_type hourly 인데 basis_hours 가 없고 기본급이 띠 밖이면 needs_data.
//   B 시급에 주휴 포함 표시(BASE.includes_weekly_holiday 또는 「주휴…포함」 문구, includesWeeklyHoliday) — 시급 ≥ 최저시급 ×
//     (1주 소정 + 주휴)/1주 소정(반올림 전 주휴시간으로 계산). 주휴 = 1일 소정(40H 로 자르기 전 1주 소정 ÷ 소정근로일,
//     8H 상한), 단시간은 ÷5(시행령 별표2 2.나, 통상 근로자 주 5일 가정), 15H 미만은 0.
//   C 월급제 — 산입 임금 합계 ÷ 최저임금 적용기준 월 시간(시행령 §5①3호, normalize.monthlyStandardHours).
//     산입 제외 = OT_*·NIGHT·HOLIDAY_EXTRA·ANNUAL_LEAVE(최저임금법 §6④1호, 시행규칙 §2①). BONUS·MEAL 은 연도별 산입
//     비율(법 부칙)을 원문으로 확인하지 못해 보수적으로 — 빼고 충족 ok, 넣어야만 충족 risk, 넣어도 미달 violation.
//     pay_type·basis_hours 가 모두 없어 형태를 알 수 없는 단시간(1주 소정 < 40H)은 미달이면(식대·상여를 넣어야 충족이어도)
//     violation·risk 대신 needs_data.
//   D 포괄(inclusive_wage=true, 월급제) — 연장·야간·휴일 항목이 나뉘어 있으면 C 와 같고(그 수당의 충분성은
//     OT-COVER·WAGE-MATH). 총액만이면 (총액 − 산입 제외 항목) ÷ (월 시간 + 주 연장 × 4.345 × 1.5),
//     BONUS·MEAL 은 C 와 같은 3단계. 단시간(5인 이상 전제)은 주 연장 대신 소정 초과(normalize.partTimeExcessHours,
//     법리 E 와 같은 함수). 근로시간을 모르거나 야간근로가 있거나 그 여부를 모르면, 총액이 산입 제외 항목 합계 이하이면 needs_data.
// WAGE-MATH: item.amount ≟ 통상시급 × basis_hours × (rate_multiplier or 1.0) ±10원. BASE 는 통상시급의 출처라 보지 않는다.
// OT-RATE: OT_* 항목 rate_multiplier 미표기 → risk
// OT-COVER: OT_* basis_hours 합 ≥ weekly_overtime_hours × 4.345 × 1.5
// HOLIDAY-COVER: HOLIDAY_EXTRA 환산H(amount÷통상시급) ≥ 공휴일 예정 근무H × 1.5
//   (public_holiday_note "N일/M.MH" 파싱, 불가 시 needs_data)

import {
  MINWAGE_TABLE,
  MONTHLY_BASE_HOURS,
  OT_PREMIUM_RATE,
  PART_TIME_TYPES,
  WAGE_MATH_TOLERANCE,
  WEEKLY_STANDARD_HOURS,
  WEEKS_PER_MONTH,
  hourlyRateOf,
  monthlyStandardHours,
  partTimeExcessHours,
  weeklyHoliday,
} from '../normalize';
import type { Contract, Finding, FindingSeverity, FindingStatus, WageItem } from '../types';
import { makeFinding, type RuleFn } from './index';

export { MINWAGE_TABLE, OT_PREMIUM_RATE, WAGE_MATH_TOLERANCE, WEEKS_PER_MONTH };

export const HOLIDAY_PREMIUM_RATE = 1.5;
const HOLIDAY_NOTE_RE = /(\d+)\s*일\s*\/\s*(\d+(?:\.\d+)?)\s*H/;

const round1 = (x: number) => Math.round(x * 10) / 10;
const fmt = (n: number) => n.toLocaleString('ko-KR');
const fmtH = (h: number) => String(Math.round(h * 100) / 100);

/** 산출근거 시간이 최저임금 적용기준 월 시간과 이 폭 안이면 주휴가 들어간 월급 산출근거로 본다 */
const MONTHLY_BASIS_TOLERANCE_H = 1;
/** 최저임금 산입에서 빼는 항목(최저임금법 §6④1호, 시행규칙 §2① — 연장·야간·휴일 가산, 연차 미사용수당) */
const NOT_INCLUDED = new Set(['OT_WEEKDAY', 'OT_WEEKEND', 'NIGHT', 'HOLIDAY_EXTRA', 'ANNUAL_LEAVE']);
/** 산입 비율을 원문으로 확인하지 못한 항목(상여금·복리후생비 — 최저임금법 §6④2·3호와 부칙) */
const RATIO_UNCONFIRMED = new Set(['BONUS', 'MEAL']);
/** 포괄 구성항목 — 연장·야간·휴일 */
const INCLUSIVE_PARTS = new Set(['OT_WEEKDAY', 'OT_WEEKEND', 'NIGHT', 'HOLIDAY_EXTRA']);
/** 「주휴」·「주휴수당」 — 주휴일(쉬는 날)은 임금이 아니므로 뺀다 */
const WH_TOKEN = /주휴(?!일)/g;
const WH_TOKEN_ONE = /주휴(?!일)/;
/** 괄호 안에 주휴 낱말만 있으면 괄호를 걷는다 — 「시급 12,384 (주휴수당) 포함」 */
const WH_BARE_PAREN = /[(（]\s*(주휴(?:수당)?)\s*[)）]/g;
/** 주휴 낱말 꼬리(수당·조사) — 「주휴수당은」「주휴수당이」 */
const WH_TAIL = /^(?:수당)?(?:은|는|이|가|을|를|도|과|와|에)?/;
/** 주휴 뒤 이 낱말 수 안만 주휴에 대한 말로 본다 — 「주휴수당은 별도로 지급하지 않고 포함」 */
const WH_REACH_WORDS = 6;
/** 미포함·불포함·비포함 — 「포함」과 한 낱말일 때만 부정 */
const NEG_PREFIX_INCLUDE = /^[미불비]포함/;
/** 낱말 안의 부정 꼬리 — 「포함하지않음」「별도없이」 */
const NEG_IN_WORD = /(?:않|아니|아님|안됨|안돼|없)/;
/** 뒤따르는 부정 낱말 — 않음·않습니다·아니함·아님·안(됨)·없이·없음 */
const NEG_WORD = /^(?:않|아니|아님|안$|안됨|안돼|없)/;
/** 주휴에 대한 제외 — 별도·제외·없음 */
const EXCLUDE = /별도|제외|없음/;
/** 부정 낱말을 찾는 거리(쉼표를 넘지 않음) */
const NEG_LOOKAHEAD = 2;

function scanWords(s: string): string[] {
  return s
    .replace(/[,，、]/g, ' , ')
    .replace(/[·ㆍ/]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** ws[i] 뒤 쉼표 전 NEG_LOOKAHEAD 낱말 안의 부정 낱말 위치, 없으면 -1 */
function negationAfter(ws: string[], i: number): number {
  for (let j = i + 1; j < ws.length && j <= i + NEG_LOOKAHEAD; j++) {
    if (ws[j] === ',') break;
    if (NEG_WORD.test(ws[j])) return j;
  }
  return -1;
}

/** 주휴 낱말 하나 뒤를 낱말 단위로 읽는다. 「포함」에 이르면 그 낱말(미·불·비 접두, 꼬리 부정)이나 뒤 부정 낱말로
 * 긍정·부정을 정하고 멈춘다. 별도·제외·없음은 바로 뒤에 부정(없이·않고 등)이 오면 지우고(「별도 없이 포함」), 아니면
 * 부정으로 세며 그 뒤 쉼표에서 멈춘다(「주휴수당 별도, 식대 포함」). 다른 주휴 낱말이 나오면 멈춘다. */
function scanWeeklyHoliday(rest: string): { yes: boolean; no: boolean } {
  const ws = scanWords(rest.replace(WH_TAIL, ''));
  let yes = false;
  let no = false;
  let count = 0;
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i];
    if (w === ',') {
      if (no) break;
      continue;
    }
    if (WH_TOKEN_ONE.test(w) || ++count > WH_REACH_WORDS) break;
    const at = w.indexOf('포함');
    if (at >= 0) {
      if (NEG_PREFIX_INCLUDE.test(w) || NEG_IN_WORD.test(w.slice(at + 2)) || negationAfter(ws, i) >= 0) no = true;
      else yes = true;
      break;
    }
    const ex = EXCLUDE.exec(w);
    if (!ex) continue;
    if (NEG_IN_WORD.test(w.slice(ex.index + ex[0].length))) continue;
    const j = negationAfter(ws, i);
    if (j >= 0) i = j;
    else no = true;
  }
  return { yes, no };
}

/** 시급에 주휴 포함 표시 — 구조화 칸 우선, 없으면 label·basis_text 문구를 낱말 단위로 읽는다(scanWeeklyHoliday).
 * 괄호에서 끊되(「주휴 포함(연장 별도)」의 별도는 주휴 말이 아니다) 주휴 낱말만 든 괄호는 걷는다. 긍정·부정이 둘 다
 * 잡히면 어느 쪽인지 알 수 없어 null. */
export function includesWeeklyHoliday(item: WageItem | undefined): boolean | null {
  if (!item) return null;
  if (typeof item.includes_weekly_holiday === 'boolean') return item.includes_weekly_holiday;
  const text = `${item.label ?? ''} ${item.basis_text ?? ''}`.replace(WH_BARE_PAREN, ' $1 ');
  let yes = false;
  let no = false;
  for (const segment of text.split(/[()（）[\]]/)) {
    for (const m of segment.matchAll(WH_TOKEN)) {
      const rest = segment.slice((m.index ?? 0) + m[0].length).split(/[.;。\n]/)[0];
      const r = scanWeeklyHoliday(rest);
      yes ||= r.yes;
      no ||= r.no;
    }
  }
  if (yes && no) return null;
  if (yes) return true;
  return no ? false : null;
}

/** BASE 산출근거 시간이 주휴가 들어간 월 시간인가 — 최저임금 적용기준 월 시간(근로시간 미상이면 209H) ±1H.
 * 포괄이면 월 시간 + 주 연장 × 4.345 × 1.5 ±1H 도 월 시간이다(「시급 × 241.6H(주휴·연장 포함)」). */
function isMonthlyBasisHours(contract: Contract, basis: number): boolean {
  const monthly = monthlyStandardHours(contract) ?? MONTHLY_BASE_HOURS;
  if (Math.abs(basis - monthly) <= MONTHLY_BASIS_TOLERANCE_H) return true;
  const ot = contract.work_time?.weekly_overtime_hours;
  if (contract.wage?.inclusive_wage !== true || ot == null || ot <= 0) return false;
  return Math.abs(basis - (monthly + ot * WEEKS_PER_MONTH * OT_PREMIUM_RATE)) <= MONTHLY_BASIS_TOLERANCE_H;
}

/** 임금 형태. ①기본급이 시급 띠 안(hourlyRateOf from amount)이면 hourly ②산출근거 시간이 주휴가 들어간 월 시간이면
 * pay_type·주휴 포함 표시와 관계없이 monthly ③pay_type 명시값 ④산출근거 시간이 있으면 hourly, 없으면 monthly. */
export function payBasis(contract: Contract): 'hourly' | 'monthly' {
  if (hourlyRateOf(contract)?.from === 'amount') return 'hourly';
  const base = (contract.wage?.items ?? []).find((i) => i.code === 'BASE');
  const basis = base?.basis_hours;
  const hasBasis = basis != null && basis > 0;
  if (hasBasis && isMonthlyBasisHours(contract, basis)) return 'monthly';
  const explicit = contract.wage?.pay_type;
  if (explicit === 'hourly' || explicit === 'monthly') return explicit;
  return hasBasis ? 'hourly' : 'monthly';
}

export interface MinwageAssessment {
  status: FindingStatus;
  detail: string;
  severity?: FindingSeverity;
  /** 수정 방향(위반·리스크일 때만 의미) */
  amendment: string;
}

const won = (n: number) => `${fmt(Math.ceil(n))}원`;

/** 시급제(A·B). hourlyRaw = BASE.amount ÷ basis_hours(또는 산출시간 없는 시급제의 기본급). 비교는 원 단위로
 * 반올림한 시급으로 한다(월급제 경로와 같게 — 179,361÷17.38H = 10,319.96 은 10,320). note 는 판독 근거 한 구절. */
function assessHourly(
  contract: Contract,
  hourlyRaw: number,
  minimum: number,
  year: string,
  note = '',
): MinwageAssessment {
  const items = contract.wage?.items ?? [];
  const base = items.find((i) => i.code === 'BASE')!;
  const hourly = Math.round(hourlyRaw);
  const hourlyText = `${fmt(hourly)}${note}`;
  const wh = weeklyHoliday(contract);
  if (includesWeeklyHoliday(base) === true) {
    if (!wh) {
      return {
        status: 'needs_data',
        detail: `주휴 포함 시급 ${hourlyText} — 1주 소정근로시간을 알 수 없어 주휴 포함 기준액 산정 불가`,
        amendment: '',
      };
    }
    // 기준액은 반올림하지 않은 주휴시간으로 계산하고(40÷6 = 6.666…H), 비교·표시만 소수 둘째 자리로 맞춘다
    const required = Math.round(((minimum * (wh.weekly + wh.holiday)) / wh.weekly) * 100) / 100;
    const basisText =
      wh.holiday === 0
        ? `1주 소정 ${fmtH(wh.weekly)}H < 15H — 주휴 없음(근로기준법 §18③), 기준액 = 최저시급 ${fmt(minimum)}`
        : `기준액 = 최저시급 ${fmt(minimum)} × (소정 ${fmtH(wh.weekly)}H+주휴 ${fmtH(wh.holiday)}H)/${fmtH(wh.weekly)}H` +
          ` = ${fmt(required)}` +
          (wh.assumedFiveDays ? ' (주휴 = 1주 소정 ÷ 5 — 통상 근로자 주 5일 가정, 근로기준법 시행령 별표2 2.나)' : '');
    if (hourly >= required) {
      return { status: 'ok', detail: `주휴 포함 시급 ${hourlyText} ≥ ${basisText}`, amendment: '' };
    }
    return {
      status: 'violation',
      detail: `주휴 포함 시급 ${hourlyText} < ${basisText} (최저임금법 시행령 §5①2호)`,
      amendment: `주휴 포함 시급을 ${year}년 최저시급 × (소정+주휴)/소정 = ${won(required)} 이상으로 인상하거나, 주휴수당을 시급과 따로 산정해 명시`,
    };
  }
  if (hourly < minimum) {
    return {
      status: 'violation',
      detail: `계약 시급 ${hourlyText} < ${year}년 최저시급 ${fmt(minimum)} (시간당 ${fmt(minimum - hourly)}원 미달)`,
      amendment: `시급을 ${year}년 최저시급 ${fmt(minimum)}원 이상으로 인상`,
    };
  }
  const ok = `계약 시급 ${hourlyText} ≥ ${year}년 최저시급 ${fmt(minimum)}`;
  if (items.some((i) => i.code === 'WEEKLY_HOLIDAY')) {
    return { status: 'ok', detail: `${ok}, 주휴수당 항목 별도 명시`, amendment: '' };
  }
  if (!wh) {
    // 1주 소정을 모르면 주휴 발생 여부(15H 이상)도 알 수 없다 — §17② 확인 필요를 내지 않는다
    return { status: 'ok', detail: `${ok} (1주 소정근로시간 미상 — 주휴수당 명시 여부는 보지 않음)`, amendment: '' };
  }
  if (wh.holiday === 0) {
    return { status: 'ok', detail: `${ok} (1주 소정 ${fmtH(wh.weekly)}H < 15H — 주휴 없음)`, amendment: '' };
  }
  return {
    status: 'risk',
    severity: 'minor',
    detail:
      `${ok} — 최저임금은 충족. 주휴수당 산정·지급 방법이 계약서에 없음 — 서면 명시 확인 필요(근로기준법 §17②).` +
      ' 주휴수당은 근로기준법 §55①에 따라 법정 발생하므로 미지급·위반으로 보지 않음',
    amendment:
      '주휴수당(1주 소정근로일 개근 시 1일 소정근로시간분 유급, 근로기준법 §55①)의 산정·지급 방법을 임금 구성항목 또는 산출근거에 명시',
  };
}

function sumAmount(items: WageItem[]): number {
  return items.reduce((s, i) => s + (i.amount ?? 0), 0);
}

function assessMonthly(contract: Contract, minimum: number, year: string): MinwageAssessment {
  const wage = contract.wage ?? {};
  const items = wage.items ?? [];
  const standard = monthlyStandardHours(contract);
  const hours = standard ?? MONTHLY_BASE_HOURS;
  const hoursNote = standard == null ? ' (1주 소정근로시간 미상 — 주 40H 기준 209H 가정)' : '';
  const inclusive = wage.inclusive_wage === true;
  const parts = items.filter((i) => INCLUSIVE_PARTS.has(i.code));

  if (inclusive && parts.length === 0) {
    // 포괄 총액만 — (총액 − 산입 제외 항목) ÷ (월 시간 + 연장 × 1.5). 단시간(5인 이상 전제)은 연장 항에 소정 초과(E)를 쓴다.
    const total = wage.monthly_total ?? sumAmount(items);
    if (!total) return { status: 'needs_data', detail: '포괄임금 총액 미기재', amendment: '' };
    const wt = contract.work_time ?? {};
    const partTime =
      PART_TIME_TYPES.has(contract.employee?.employment_type ?? '') && contract.workplace?.employee_count_5plus !== false;
    const partExcess = partTime ? partTimeExcessHours(contract) : null;
    const otWeekly = partExcess ?? wt.weekly_overtime_hours;
    if (standard == null || otWeekly == null) {
      return { status: 'needs_data', detail: '포괄임금 총액만 있고 근로시간 정보가 없어 시간당 임금 역산 불가', amendment: '' };
    }
    if (wt.night_work !== false) {
      const why = wt.night_work === true ? '야간근로시간을 알 수 없어' : '야간근로 여부를 알 수 없어';
      return { status: 'needs_data', detail: `포괄임금 총액만 있고 ${why} 역산 불가`, amendment: '' };
    }
    const excluded = items.filter((i) => NOT_INCLUDED.has(i.code));
    const pending = items.filter((i) => RATIO_UNCONFIRMED.has(i.code));
    const excludedSum = sumAmount(excluded);
    const pendingSum = sumAmount(pending);
    if (total <= excludedSum + pendingSum) {
      // 총액이 그 안의 항목 합계보다 작거나 같다 — 금액이 서로 맞지 않아 역산하지 않는다(「시간당 0」을 내지 않는다)
      return {
        status: 'needs_data',
        detail: `포괄 총액 ${fmt(total)}이 산입 제외·확인 항목 합계 ${fmt(excludedSum + pendingSum)} 이하 — 총액·항목 금액 확인 필요`,
        amendment: '',
      };
    }
    const core = total - excludedSum - pendingSum;
    const otHours = round1(otWeekly * WEEKS_PER_MONTH * OT_PREMIUM_RATE);
    const denom = round1(hours + otHours);
    const rate = Math.round(core / denom);
    const minus = [...excluded, ...pending].map((i) => `${i.label ?? i.code} ${fmt(i.amount ?? 0)}`).join(' − ');
    const coreText = minus ? `포괄 총액 ${fmt(total)} − ${minus} = ${fmt(core)}` : `포괄 총액 ${fmt(total)}`;
    const otText = partExcess != null ? `소정 초과 주 ${fmtH(partExcess)}H` : `연장 주 ${fmtH(otWeekly)}H`;
    const calc = `${coreText} ÷ ${denom}H(월 ${hours}H + ${otText}×4.345×1.5) = 시간당 ${fmt(rate)}`;
    if (rate >= minimum) return { status: 'ok', detail: `${calc} ≥ ${year}년 최저시급 ${fmt(minimum)}`, amendment: '' };
    if (pendingSum > 0 && Math.round((core + pendingSum) / denom) >= minimum) {
      return {
        status: 'risk',
        detail:
          `${calc} < ${year}년 최저시급 ${fmt(minimum)}. ${pending.map((i) => i.label ?? i.code).join('·')}` +
          ` ${fmt(pendingSum)}을 넣으면 충족 — 상여금·복리후생비 최저임금 산입 비율 확인 필요(최저임금법 §6④2·3호)`,
        amendment: `상여금·복리후생비 산입 비율을 확인하고, 미달이면 포괄 총액 중 산입 임금을 ${year}년 최저시급 × ${denom}H = ${won(minimum * denom)} 이상으로 인상`,
      };
    }
    return {
      status: 'violation',
      detail: `${calc} < ${year}년 최저시급 ${fmt(minimum)} (최저임금법 시행령 §5①3호)`,
      amendment: `${minus ? '포괄 총액 중 산입 임금을' : '포괄 총액을'} ${year}년 최저시급 × ${denom}H = ${won(minimum * denom)} 이상으로 인상하고, 기본급과 고정 연장수당을 나눠 명시`,
    };
  }

  const core = items.filter((i) => !NOT_INCLUDED.has(i.code) && !RATIO_UNCONFIRMED.has(i.code));
  const pending = items.filter((i) => RATIO_UNCONFIRMED.has(i.code));
  const coreSum = sumAmount(core);
  if (!coreSum) return { status: 'needs_data', detail: '기본급 등 최저임금 산입 임금 미기재', amendment: '' };
  const lead = inclusive ? '포괄(구성항목 구분) — ' : '';
  const names = core.map((i) => i.label ?? i.code).join('+');
  const rate = Math.round(coreSum / hours);
  const calc = `${lead}월 산입 임금 ${fmt(coreSum)}(${names}) ÷ 최저임금 적용기준 월 ${hours}H = 시간당 ${fmt(rate)}${hoursNote}`;
  const otNote = inclusive ? ' — 고정 연장·야간·휴일수당의 충분성은 OT-COVER·WAGE-MATH 에서 봄' : '';
  if (rate >= minimum) {
    return { status: 'ok', detail: `${calc} ≥ ${year}년 최저시급 ${fmt(minimum)}${otNote}`, amendment: '' };
  }
  const scheduled = contract.work_time?.weekly_scheduled_hours;
  const base = items.find((i) => i.code === 'BASE');
  const formUnknown =
    !inclusive && wage.pay_type == null && !(base?.basis_hours != null && base.basis_hours > 0);
  if (formUnknown && scheduled != null && scheduled < WEEKLY_STANDARD_HOURS) {
    // 단시간 기본급에 산출근거 시간이 없으면 시급제(시급 × 시간, 법리 A)인지 월급제(C)인지 계약서만으로 갈리지 않는다.
    // 식대·상여를 넣어야 충족(3단계)인지 따지기 전에 이것부터 묻는다 — 형태가 정해져야 그 비교가 의미 있다.
    return {
      status: 'needs_data',
      detail:
        `시급제·월급제 확인 필요 — 1주 소정 ${fmtH(scheduled)}H 단시간이고 기본급 산출근거 시간이 없음.` +
        ` 월급제라면 ${calc} < ${year}년 최저시급 ${fmt(minimum)}, 시급제라면 계약 시급으로 비교`,
      amendment: '',
    };
  }
  const need = won(minimum * hours);
  const pendingSum = sumAmount(pending);
  if (pendingSum > 0 && Math.round((coreSum + pendingSum) / hours) >= minimum) {
    return {
      status: 'risk',
      detail:
        `${calc} < ${year}년 최저시급 ${fmt(minimum)}. ${pending.map((i) => i.label ?? i.code).join('·')}` +
        ` ${fmt(pendingSum)}을 넣으면 충족 — 상여금·복리후생비 최저임금 산입 비율 확인 필요(최저임금법 §6④2·3호)`,
      amendment: `상여금·복리후생비 산입 비율을 확인하고, 미달이면 기본급 등 산입 임금을 ${year}년 최저시급 × 월 ${hours}H = ${need} 이상으로 인상`,
    };
  }
  return {
    status: 'violation',
    detail: `${calc} < ${year}년 최저시급 ${fmt(minimum)} (시간당 ${fmt(minimum - rate)}원 미달, 최저임금법 시행령 §5①3호)`,
    amendment: `기본급 등 산입 임금을 ${year}년 최저시급 × 월 ${hours}H = ${need} 이상으로 인상`,
  };
}

/** MINWAGE 판정과 수정 방향 — 규칙과 수정안(amendments.ts)이 같은 계산을 쓴다. */
export function minwageAssessment(contract: Contract): MinwageAssessment {
  const start = contract.period?.start_date;
  const items = contract.wage?.items ?? [];
  const base = items.find((i) => i.code === 'BASE');
  const inclusiveTotal = contract.wage?.inclusive_wage === true && (contract.wage?.monthly_total ?? 0) > 0;
  if (!start || (!base?.amount && !inclusiveTotal)) {
    return { status: 'needs_data', detail: '기본급(또는 포괄 총액) 또는 계약 시작일 미기재', amendment: '' };
  }
  const year = start.slice(0, 4);
  const minimum = MINWAGE_TABLE[year];
  if (minimum === undefined) {
    return { status: 'needs_data', detail: `${year}년 최저시급 미등록 — minwage_table.json 갱신 필요`, amendment: '' };
  }
  // 시급제는 A·B — 포괄이고 연장·야간·휴일 항목이 있어도 같다(그 수당의 충분성은 OT-COVER 몫).
  if (payBasis(contract) === 'hourly' && base?.amount) {
    const hr = hourlyRateOf(contract);
    if (hr?.from === 'basis') return assessHourly(contract, hr.rate, minimum, year);
    if (hr) {
      // 기본급이 시급 띠 안 — 그 금액이 곧 시급이다(산출근거 시간이 있어도 그 시간으로 나누지 않는다)
      const basis = base.basis_hours != null && base.basis_hours > 0 ? base.basis_hours : null;
      const note =
        basis != null
          ? ` (기본급이 시급 금액 — 산출근거 ${fmtH(basis)}H 로 나누지 않음)`
          : contract.wage?.pay_type === 'hourly'
            ? ' (시급제·산출근거 시간 없음 — 기본급을 시급으로 봄)'
            : ' (산출근거 시간 없음 — 기본급이 시급 금액이라 시급으로 봄)';
      return assessHourly(contract, hr.rate, minimum, year, note);
    }
    // pay_type hourly 인데 산출근거 시간이 없고 기본급이 시급으로 볼 수 없는 값 — 자료 필요
    return {
      status: 'needs_data',
      detail: `시급제인데 산출근거 시간 없음 — 기본급 ${fmt(base.amount)}원을 시급으로 볼 수 없어 시간당 임금 산정 불가`,
      amendment: '',
    };
  }
  return assessMonthly(contract, minimum, year);
}

export const ruleMinwage: RuleFn = (contract) => {
  const a = minwageAssessment(contract);
  return makeFinding('MINWAGE', a.status, a.detail, a.severity);
};

export const ruleWageMath: RuleFn = (contract) => {
  const wage = contract.wage ?? {};
  const rate = wage.ordinary_hourly_rate;
  const items = wage.items ?? [];
  if (rate == null || items.length === 0) {
    return makeFinding('WAGE-MATH', 'needs_data', '통상시급 또는 임금 구성항목 없음');
  }
  const mismatches: string[] = [];
  for (const item of items) {
    // 기본급은 통상시급을 끌어낸 출처라 다시 맞춰 보면 반올림 차이만 나온다(2,200,000 ÷ 209 → 10,526 × 209 = 2,199,934)
    if (item.code === 'BASE') continue;
    const { amount, basis_hours: hours } = item;
    if (amount == null || hours == null) continue;
    const expected = Math.round(rate * hours * (item.rate_multiplier ?? 1.0));
    const diff = amount - expected;
    if (Math.abs(diff) > WAGE_MATH_TOLERANCE) {
      mismatches.push(
        `${item.code} ${fmt(amount)} ≠ 기대 ${fmt(expected)} (차액 ${diff > 0 ? '+' : ''}${fmt(diff)})`,
      );
    }
  }
  if (mismatches.length > 0) {
    return makeFinding('WAGE-MATH', 'violation', mismatches.join(' / '));
  }
  return makeFinding('WAGE-MATH', 'ok', '전 항목 산출근거-금액 정합 (±10원)');
};

function otItems(contract: Contract): WageItem[] {
  return (contract.wage?.items ?? []).filter((i) => String(i.code ?? '').startsWith('OT_'));
}

export const ruleOtRate: RuleFn = (contract) => {
  const ots = otItems(contract);
  if (ots.length === 0) return makeFinding('OT-RATE', 'ok', '연장근로 항목 없음');
  const missing = ots.filter((i) => i.rate_multiplier == null).map((i) => i.code);
  if (missing.length > 0) {
    return makeFinding('OT-RATE', 'risk', `${missing.join('·')} 가산율 미표기 — 환산시간 여부 불명`);
  }
  return makeFinding('OT-RATE', 'ok', '연장 항목 가산율 명시됨');
};

export const ruleOtCover: RuleFn = (contract) => {
  const weeklyOt = contract.work_time?.weekly_overtime_hours;
  if (weeklyOt == null) {
    return makeFinding('OT-COVER', 'needs_data', '주간 연장근로시간 산정 불가');
  }
  const required = round1(weeklyOt * WEEKS_PER_MONTH * OT_PREMIUM_RATE);
  const agreed = round1(otItems(contract).reduce((sum, i) => sum + (i.basis_hours ?? 0), 0));
  if (agreed >= required) {
    return makeFinding('OT-COVER', 'ok', `필요 ${required}H ≤ 약정 ${agreed}H (환산시간 해석 시)`);
  }
  return makeFinding(
    'OT-COVER',
    'violation',
    `약정 연장환산 ${agreed}H < 필요 ${required}H (부족 ${round1(required - agreed)}H)`,
  );
};

export const ruleHolidayCover: RuleFn = (contract) => {
  const wage = contract.wage ?? {};
  const extras = (wage.items ?? []).filter((i) => i.code === 'HOLIDAY_EXTRA');
  const note = wage.public_holiday_note;
  if (extras.length === 0 && !note && !wage.inclusive_wage) {
    return makeFinding('HOLIDAY-COVER', 'ok', '포괄임금 휴일근로 약정 없음 — 비적용');
  }
  const match = HOLIDAY_NOTE_RE.exec(note ?? '');
  if (!match) {
    return makeFinding(
      'HOLIDAY-COVER',
      'needs_data',
      "공휴일 예정 근무('N일/M.MH') 파싱 불가 — public_holiday_note 확인 필요",
    );
  }
  const days = parseInt(match[1], 10);
  const planned = parseFloat(match[2]);
  const rate = wage.ordinary_hourly_rate;
  if (rate == null) {
    return makeFinding('HOLIDAY-COVER', 'needs_data', '통상시급 미기재 — 환산 불가');
  }
  const required = round1(planned * HOLIDAY_PREMIUM_RATE);
  const agreed = round1(extras.reduce((sum, i) => sum + (i.amount ?? 0), 0) / rate);
  if (agreed >= required) {
    return makeFinding(
      'HOLIDAY-COVER',
      'ok',
      `공휴일 ${days}일 ${planned}H×1.5=${required}H ≤ HOLIDAY_EXTRA 환산 ${agreed}H`,
    );
  }
  return makeFinding(
    'HOLIDAY-COVER',
    'violation',
    `HOLIDAY_EXTRA 환산 ${agreed}H < 필요 ${required}H` +
      ` (공휴일 ${days}일 ${planned}H×1.5) — 부족 ${round1(required - agreed)}H`,
  );
};

export const WAGE_RULES: RuleFn[] = [
  ruleMinwage,
  ruleWageMath,
  ruleOtRate,
  ruleOtCover,
  ruleHolidayCover,
];

export function runWageRules(contract: Contract): Finding[] {
  return WAGE_RULES.map((rule) => rule(contract));
}
