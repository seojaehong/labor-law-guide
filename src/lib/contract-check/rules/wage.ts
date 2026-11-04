// 임금 수치 규칙 — 최저임금·산출근거 정합·연장수당 가산율/충분성·휴일 포괄 충분성.
//
// MINWAGE(261101 재홍님 확정 법리 A~D, minwageAssessment):
//   형태·계약 시급·출처는 normalize.wageBasis 하나(사진 추출 매핑도 같은 함수). 시급 = 산출시간이 있으면 「기본급 ÷
//     산출시간」(K1 — 띠 아래면 미달). 산출시간이 월 규모(40H 이상)이고 그 몫이 시급 띠(최저시급 0.5~5배) 밖일 때만 기본급이
//     띠 안이면 기본급, 기본급도 띠 밖이면 「금액과 산출시간이 맞지 않음」. 형태 = pay_type monthly → 월급제,
//     pay_type hourly → 시급제(209±1 창으로 바꾸지 않는다, C3), pay_type 없음 → 산출시간 174±1H(주휴를 뺀 월 소정)이면
//     「시급제·월급제가 갈리지 않음」(F6 — 기본급이 시급 띠 안이면 그 금액이 시급, Q1), 산출시간이 주휴 포함 월 시간(±1H, 포괄이면 월 시간 + 주 연장×4.345×1.5 도)
//     이면 월급제, 기본급이 곧 시급이거나 산출시간이 있으면 시급제, 없으면 월급제.
//   두 해석(P2, bothReadings) — F6·「금액과 산출시간이 맞지 않음」은 시급제(몫을 계약 시급으로 A·B·F7)와 월급제(기본급 ÷
//     최저임금 적용기준 월 시간, C)를 둘 다 본다. 둘 다 미달이면 violation, 둘 다 충족이면 충족(시급제 해석에 §17② 확인이
//     남으면 risk minor), 갈리면 두 값을 적고 needs_data. 새 임계값은 없다.
//   근로일별 행 합이 출근·퇴근 칸 합보다 길면(normalize.dailyHoursConflict, K3) 두 시간을 적고 needs_data — 계약 시급이
//     최저시급 아래인 시급제만 시간과 관계없이 미달이라 그대로 본다.
//   A 시급제 — 계약 시급(원 단위 반올림)만 최저시급과 비교. 포괄이어도 같다(연장 충분성은 OT-COVER). 주휴수당은
//     근기법 §55① 법정 발생이라 항목이 없어도 위반이 아니다. 1주 소정 15H 이상인데 주휴 산정·지급 방법(WEEKLY_HOLIDAY
//     항목)이 없으면 근기법 §17② 서면 명시 확인 필요 → risk(minor). 1주 소정 미상이면 그 확인은 내지 않는다.
//     pay_type hourly 인데 basis_hours 가 없으면 기본급이 띠 아래여도 시급(미달 위반), 5배를 넘으면 needs_data.
//     산출시간이 주휴 포함 월 시간인 시급제(C3)는 주휴가 이미 들어 있어 포함 표시를 보지 않고 계약 시급만(§17② 확인 없음).
//     주휴 항목(WEEKLY_HOLIDAY, 금액 > 0 — P4)이 있으면 그것으로 ok. 없고 구조화 칸이 비었는데 label·basis_text 에 주휴가 보이면(문구를
//     미포함으로 읽은 것은 빼고) risk(minor)「주휴수당 포함 여부 확인 필요」 — 문구 읽기(includesWeeklyHoliday)는 그 분기를
//     건너뛸지와 문장에만 쓰고 위반·적정을 바꾸지 않는다(C1·K6·F3).
//   A·B 식대·상여(F7, 261102 재홍님 확정 — 산입한다): 판정 시급 = 계약 시급(B 는 주휴 제외 환산) + 식대 ÷ 월 소정근로시간
//     (주휴 포함, monthlyStandardHours — 174H·87H 처럼 주휴를 뺀 산출시간도, 포괄의 「월 시간 + 연장 환산」 산출시간도
//     쓰지 않는다. 1주 소정 미상이면 209±1H 산출시간만, P1·Q2) → 「계약 시급 x + 식대 y ÷ zH = 시간당 w」. 월 소정을 모르면 계약 시급만으로
//     미달일 때 needs_data(넣으면·빼면). 상여는 매월 지급인지 알 수 없어 3단계(넣어야만 충족 risk).
//   B 시급에 주휴 포함 표시(구조화 칸 BASE.includes_weekly_holiday === true 일 때만 — 폼 선택·사진 추출이 채운다) — 시급 ≥ 최저시급 ×
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
//     법리 E 와 같은 함수). 근로시간을 모르거나 야간근로가 있거나 그 여부를 모르면, 총액이 산입 제외 항목(OT_*·NIGHT·
//     HOLIDAY_EXTRA·ANNUAL_LEAVE) 합계 이하이거나, 식대·상여 합이 (총액 − 산입 제외 합) 이상이면(남는 기본 임금이 없음,
//     K4·F5) needs_data — 「시간당 0」을 내지 않는다.
// WAGE-MATH: item.amount ≟ 통상시급 × basis_hours × (rate_multiplier or 1.0) ±10원. BASE 는 통상시급의 출처라 보지 않는다.
// OT-RATE: OT_* 항목 rate_multiplier 미표기 → risk
// OT-COVER: OT_* basis_hours 합 ≥ weekly_overtime_hours × 4.345 × 1.5. 상시 5명 미만은 가산 없이 × 1.0(시행령 §7 별표1, 261103)
// HOLIDAY-COVER: HOLIDAY_EXTRA 환산H(amount÷통상시급) ≥ 공휴일 예정 근무H × 1.5
//   (public_holiday_note "N일/M.MH" 파싱, 불가 시 needs_data). 메모가 「8시간 넘는 xH」를 밝히면 그 시간은 × 0.5(연장 1.5 는 OT-COVER, #151)

import {
  MINWAGE_TABLE,
  MONTHLY_BASE_HOURS,
  OT_PREMIUM_RATE,
  PART_TIME_TYPES,
  WAGE_MATH_TOLERANCE,
  WEEKLY_STANDARD_HOURS,
  WEEKS_PER_MONTH,
  dailyHoursConflict,
  monthlyStandardHours,
  partTimeExcessHours,
  wageBasis,
  weeklyHoliday,
  type WageBasis,
  type WeeklyHoliday,
} from '../normalize';
import type { Contract, Finding, FindingSeverity, FindingStatus, WageItem } from '../types';
import { makeFinding, type RuleFn } from './index';

export const HOLIDAY_PREMIUM_RATE = 1.5;
/** 공휴일 하루 8시간 넘는 시간에 휴일 쪽이 더 요구하는 배율 — 연장(OT-COVER) 1.5 와 합해 2.0(근로기준법 제56조 제2항 제2호) */
export const HOLIDAY_OVER8_REST_RATE = 0.5;
const HOLIDAY_NOTE_RE = /(\d+(?:\.\d+)?)\s*일\s*\/\s*(\d+(?:\.\d+)?)\s*H/;
const HOLIDAY_OVER8_RE = /8시간\s*넘는\s*(\d+(?:\.\d+)?)\s*H/;
const HOLIDAY_WEEK_DROP_RE = /공휴일\s*주에\s*빠지는\s*1주\s*연장\s*(\d+(?:\.\d+)?)\s*H/;

const round1 = (x: number) => Math.round(x * 10) / 10;
const fmt = (n: number) => n.toLocaleString('ko-KR');
const fmtH = (h: number) => String(Math.round(h * 100) / 100);

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
/** 낱말 안의 부정 꼬리 — 「포함하지않음」「포함안함」「포함X」「별도없이」 */
const NEG_IN_WORD = /(?:않|아니|아님|안[함됨돼되]|없|^안$|^[XxＸ✕✗]$)/;
/** 뒤따르는 부정 낱말 — 않음·않습니다·아니함·아님·안(함·됨)·없이·없음 */
const NEG_WORD = /^(?:않|아니|아님|안$|안[함됨돼되]|없)/;
/** 「포함 X」의 X — 마지막 낱말이거나 쉼표 앞일 때만 부정(「포함 x 209H」의 x 는 곱하기) */
const NEG_MARK = /^[XxＸ✕✗]$/;
/** 「포함 여부: 미포함」의 「여부」 — 서식 칸 이름이라 그 뒤 답을 읽는다 */
const FIELD_LABEL = /^여부/;
/** 주휴에 대한 제외 — 별도·제외·없음 */
const EXCLUDE = /별도|제외|없음/;
/** 부정 낱말을 찾는 거리(쉼표를 넘지 않음) */
const NEG_LOOKAHEAD = 2;

function scanWords(s: string): string[] {
  return s
    .replace(/[,，、]/g, ' , ')
    .replace(/[·ㆍ/:：\-–—「」『』"“”'‘’<>《》〈〉]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** ws[i] 뒤 쉼표 전 NEG_LOOKAHEAD 낱말 안의 부정 낱말 위치, 없으면 -1 */
function negationAfter(ws: string[], i: number): number {
  for (let j = i + 1; j < ws.length && j <= i + NEG_LOOKAHEAD; j++) {
    if (ws[j] === ',') break;
    if (NEG_WORD.test(ws[j])) return j;
    if (NEG_MARK.test(ws[j]) && (j === ws.length - 1 || ws[j + 1] === ',')) return j;
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
      const tail = w.slice(at + 2);
      // 「포함 여부: 미포함」 — 칸 이름이면 「여부」를 건너 그 뒤 답을 읽는다
      if (FIELD_LABEL.test(tail)) continue;
      if (FIELD_LABEL.test(ws[i + 1] ?? '')) {
        i += 1;
        continue;
      }
      if (NEG_PREFIX_INCLUDE.test(w) || NEG_IN_WORD.test(tail) || negationAfter(ws, i) >= 0) no = true;
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

/** label·basis_text 에 주휴(주휴일 아님) 낱말이 있나 */
function mentionsWeeklyHoliday(item: WageItem): boolean {
  return WH_TOKEN_ONE.test(`${item.label ?? ''} ${item.basis_text ?? ''}`);
}

/** 시급에 주휴 포함 표시 — 구조화 칸 우선, 없으면 label·basis_text 문구를 낱말 단위로 읽는다(scanWeeklyHoliday).
 * 괄호에서 끊되(「주휴 포함(연장 별도)」의 별도는 주휴 말이 아니다) 주휴 낱말만 든 괄호는 걷는다. 긍정·부정이 둘 다
 * 잡히면 어느 쪽인지 알 수 없어 null. 문구 읽기는 위반·적정을 바꾸지 않는다(261102 C1) — 엔진은 「확인 필요」 분기를
 * 건너뛸지(미포함)와 그 문장에만 쓴다. 사진 추출 매핑은 이것으로 포함 칸을 채우지 않는다(K2·F1). 법리 B 는 구조화 칸이
 * true 일 때만 탄다. */
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

/** 임금 형태 — normalize.wageBasis 의 형태(기본급이 없으면 월급제, 갈리지 않으면 unknown). */
export function payBasis(contract: Contract): 'hourly' | 'monthly' | 'unknown' {
  return wageBasis(contract)?.form ?? 'monthly';
}

export interface MinwageAssessment {
  status: FindingStatus;
  detail: string;
  severity?: FindingSeverity;
  /** 수정 방향(위반·리스크일 때만 의미) */
  amendment: string;
}

const won = (n: number) => `${fmt(Math.ceil(n))}원`;

/** 주휴 포함 시급 기준액 = 최저시급 × (1주 소정 + 주휴)/1주 소정 — 반올림하지 않은 주휴시간으로 계산하고(40÷6 = 6.666…H),
 * 비교·표시만 소수 둘째 자리로 맞춘다 */
function includedRequired(minimum: number, wh: { weekly: number; holiday: number }): number {
  return Math.round(((minimum * (wh.weekly + wh.holiday)) / wh.weekly) * 100) / 100;
}

/** 시급제(A·B). hourlyRaw = normalize.wageBasis 의 계약 시급. 비교는 원 단위로 반올림한 시급으로 한다(월급제 경로와
 * 같게 — 179,361÷17.38H = 10,319.96 은 10,320). note 는 판독 근거 한 구절.
 * B 는 구조화 칸 includes_weekly_holiday 가 true 일 때만(261102 C1). monthlyHours(산출시간이 주휴 포함 월 시간, C3)면
 * 주휴가 이미 들어 있어 포함 표시를 보지 않고 A 만. 칸이 비었는데 문구에 주휴가 보이면 「주휴수당 포함 여부 확인 필요」.
 * 식대·상여가 있으면 hourlyWithPending(F7)으로 넣어서 본다. */
function assessHourly(
  contract: Contract,
  hourlyRaw: number,
  minimum: number,
  year: string,
  note = '',
  monthlyHours = false,
): MinwageAssessment {
  const items = contract.wage?.items ?? [];
  const base = items.find((i) => i.code === 'BASE')!;
  const hourly = Math.round(hourlyRaw);
  const hourlyText = `${fmt(hourly)}${note}`;
  const wh = weeklyHoliday(contract);
  const isB = !monthlyHours && base.includes_weekly_holiday === true;
  if (isB && !wh) {
    return {
      status: 'needs_data',
      detail: `주휴 포함 시급 ${hourlyText} — 1주 소정근로시간을 알 수 없어 주휴 포함 기준액 산정 불가`,
      amendment: '',
    };
  }
  // F7 — 식대·상여(산입범위)가 있으면 시급제도 넣어서 본다. 충족이면 그 계산 문장으로 아래를 잇는다
  let included: string | null = null;
  const pending = items.filter((i) => RATIO_UNCONFIRMED.has(i.code));
  if (pending.length > 0) {
    const r = hourlyWithPending(contract, hourlyRaw, minimum, year, note, isB ? wh : null, pending, monthlyHours);
    if ('status' in r) return r;
    included = r.okText;
  }
  if (isB && wh) {
    if (included) return { status: 'ok', detail: included, amendment: '' };
    const required = includedRequired(minimum, wh);
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
  if (!included && hourly < minimum) {
    return {
      status: 'violation',
      detail: `계약 시급 ${hourlyText} < ${year}년 최저시급 ${fmt(minimum)} (시간당 ${fmt(minimum - hourly)}원 미달)`,
      amendment: `시급을 ${year}년 최저시급 ${fmt(minimum)}원 이상으로 인상`,
    };
  }
  const ok = included ?? `계약 시급 ${hourlyText} ≥ ${year}년 최저시급 ${fmt(minimum)}`;
  // C3 — 산출시간(209H 등)에 주휴가 이미 들어 있다. 주휴 산정 방법도 그 시간으로 적혀 있는 셈이라 §17② 확인도 없다
  if (monthlyHours) return { status: 'ok', detail: ok, amendment: '' };
  // K6 — 주휴 항목이 따로 있으면 문구(「주휴수당 별도 지급」)를 볼 것 없이 그것으로 명시돼 있다.
  // 금액이 0 이거나 없는 항목은 근거로 쓰지 않는다(P4)
  if (items.some((i) => i.code === 'WEEKLY_HOLIDAY' && (i.amount ?? 0) > 0)) {
    return { status: 'ok', detail: `${ok}, 주휴수당 항목 별도 명시`, amendment: '' };
  }
  const reading = includesWeeklyHoliday(base);
  if (
    typeof base.includes_weekly_holiday !== 'boolean' &&
    reading !== false &&
    mentionsWeeklyHoliday(base) &&
    !(wh && wh.holiday === 0)
  ) {
    // C1 — 문구 읽기는 위반·적정을 바꾸지 않는다. 미포함으로 읽으면 이 분기를 건너뛰고(F3) 아니면 읽은 결과를 문장에만 적는다
    const readText = reading === true ? '문구상 포함' : '문구로는 알 수 없음';
    const required = wh ? includedRequired(minimum, wh) : null;
    return {
      status: 'risk',
      severity: 'minor',
      detail:
        `${ok} — 주휴수당 포함 여부 확인 필요: 산출근거 문구에 주휴 표시가 있으나(${readText}) 포함 여부가 정해지지 않음` +
        (required != null
          ? `. 시급에 주휴수당이 포함돼 있다면 기준액 ${fmt(required)}(최저시급 × (소정+주휴)/소정) 이상이어야 함(최저임금법 시행령 §5①2호)`
          : ''),
      amendment:
        '시급에 주휴수당이 포함되는지 산출근거에 분명히 적기' +
        (required != null ? ` — 포함이면 시급을 ${year}년 최저시급 × (소정+주휴)/소정 = ${won(required)} 이상으로` : ''),
    };
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

/** F7(261102 재홍님 확정) — 시급제(A·B)의 식대·상여(산입범위, 최저임금법 §6④·시행령 §5①).
 * 판정 시급 = 계약 시급(B 는 × 소정/(소정+주휴) 로 주휴 제외 환산) + 식대 ÷ 월 소정근로시간(주휴 포함). 분모는
 * normalize.monthlyStandardHours — (1주 소정 + 주휴) × 4.345, 15H 미만은 주휴 0(P1). 174H·87H 처럼 주휴를 뺀 산출시간도,
 * 포괄의 「월 시간 + 연장 환산」 산출시간도 쓰지 않는다 — 연장은 소정이 아니다(Q2). 1주 소정을 몰라 그 값이 없을 때만
 * 주휴 포함 월 시간(209±1H, monthlyHours)인 산출시간을 쓴다. 식대는 매월 지급으로
 * 넣고, 상여는 매월 지급인지 알 수 없어 3단계(빼고 충족·넣어야만 충족 risk·넣어도 미달 violation). 결론이 나면
 * MinwageAssessment, 충족이면 { okText } — 계산 문장(식대가 없거나 산입 없이도 충족인데 시간을 모르면 null)으로 §17② 등
 * 이어서 본다. */
function hourlyWithPending(
  contract: Contract,
  hourlyRaw: number,
  minimum: number,
  year: string,
  note: string,
  holiday: WeeklyHoliday | null,
  pending: WageItem[],
  monthlyHours: boolean,
): MinwageAssessment | { okText: string | null } {
  const base = (contract.wage?.items ?? []).find((i) => i.code === 'BASE');
  const own = holiday ? (hourlyRaw * holiday.weekly) / (holiday.weekly + holiday.holiday) : hourlyRaw;
  const ownText = holiday
    ? `계약 시급 ${fmt(Math.round(own))}(주휴 포함 시급 ${fmt(Math.round(hourlyRaw))} × 소정 ${fmtH(holiday.weekly)}H` +
      `/(소정+주휴) ${fmtH(holiday.weekly + holiday.holiday)}H — 주휴 제외 환산)`
    : `계약 시급 ${fmt(Math.round(own))}`;
  const meal = sumAmount(pending.filter((i) => i.code === 'MEAL'));
  const bonus = sumAmount(pending.filter((i) => i.code === 'BONUS'));
  const names = (codes: string[]) =>
    pending
      .filter((i) => codes.includes(i.code))
      .map((i) => i.label ?? i.code)
      .join('·');
  const minText = `${year}년 최저시급 ${fmt(minimum)}`;
  const basis = base?.basis_hours;
  // 연장은 소정근로시간이 아니라 포괄의 「월 시간 + 연장 환산」 산출시간도 분모가 아니다(Q2). 1주 소정을 몰라 월 소정을
  // 구할 수 없을 때만 주휴 포함 월 시간(209±1H)인 산출시간을 쓴다
  const hours = monthlyStandardHours(contract) ?? (monthlyHours && basis != null ? basis : null);
  if (hours == null) {
    if (Math.round(own) >= minimum) return { okText: null };
    return {
      status: 'needs_data',
      detail:
        `${ownText}${note} < ${minText} — ${names(['MEAL', 'BONUS'])} ${fmt(meal + bonus)}을 산입하면 충족할 수 있으나` +
        ' 빼면 미달. 월 소정근로시간을 알 수 없어 시간당 금액 산정 불가',
      amendment: '',
    };
  }
  const calc = (amount: number, codes: string[]) =>
    `${ownText} + ${names(codes)} ${fmt(amount)} ÷ ${fmtH(hours)}H = 시간당 ${fmt(Math.round(own + amount / hours))}${note}`;
  if (Math.round(own + meal / hours) >= minimum) {
    return { okText: meal > 0 ? `${calc(meal, ['MEAL'])} ≥ ${minText}` : null };
  }
  const all = meal + bonus;
  if (bonus > 0 && Math.round(own + all / hours) >= minimum) {
    return {
      status: 'risk',
      detail:
        `${calc(all, ['MEAL', 'BONUS'])} ≥ ${minText} — ${names(['BONUS'])} ${fmt(bonus)}을 넣어야만 충족.` +
        ' 매월 지급하는 상여인지 확인 필요(최저임금법 §6④)',
      amendment: `상여가 매월 지급되는지 확인하고, 아니면 시급을 ${year}년 최저시급 ${fmt(minimum)}원 이상으로 인상`,
    };
  }
  return {
    status: 'violation',
    detail: `${calc(all, ['MEAL', 'BONUS'])} < ${minText} (최저임금법 §6④·시행령 §5①)`,
    amendment: `식대 등을 넣은 시간당 임금이 ${year}년 최저시급 ${fmt(minimum)}원 이상이 되도록 시급 인상`,
  };
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
    if (total <= excludedSum) {
      // 총액이 산입 제외 항목 합계 이하 — 금액이 서로 맞지 않아 역산하지 않는다(「시간당 0」 위반을 내지 않는다)
      return {
        status: 'needs_data',
        detail: `포괄 총액 ${fmt(total)}이 산입 제외 항목 합계 ${fmt(excludedSum)} 이하 — 총액·항목 금액 확인 필요`,
        amendment: '',
      };
    }
    if (pendingSum > 0 && pendingSum >= total - excludedSum) {
      // 식대·상여 합이 (총액 − 산입 제외 합) 이상 — 남는 기본 임금이 없어 「시간당 0」이 된다. 역산하지 않는다(261102 K4·F5)
      return {
        status: 'needs_data',
        detail:
          `포괄 총액 ${fmt(total)} − 산입 제외 항목 ${fmt(excludedSum)} = ${fmt(total - excludedSum)}이` +
          ` ${pending.map((i) => i.label ?? i.code).join('·')} 합계 ${fmt(pendingSum)} 이하 — 총액·항목 금액 확인 필요`,
        amendment: '',
      };
    }
    const core = Math.max(0, total - excludedSum - pendingSum);
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

/** 계약 시급을 어디서 읽었나 한 구절 — 기본급 그대로(amount)면 그 근거, 산출시간이 주휴 포함 월 시간이면(C3) 그 사실 */
function hourlyNote(contract: Contract, wb: WageBasis): string {
  const parts: string[] = [];
  if (wb.from === 'amount') {
    if (wb.basisHours != null) parts.push(`기본급이 시급 금액 — 산출근거 ${fmtH(wb.basisHours)}H 로 나누지 않음`);
    else if (contract.wage?.pay_type === 'hourly') parts.push('시급제·산출근거 시간 없음 — 기본급을 시급으로 봄');
    else parts.push('산출근거 시간 없음 — 기본급이 시급 금액이라 시급으로 봄');
  }
  if (wb.monthlyHours && wb.basisHours != null) {
    parts.push(`산출시간 ${fmtH(wb.basisHours)}H 는 주휴가 들어간 월 시간 — 주휴 포함 표시와 관계없이 계약 시급만 비교`);
  }
  return parts.map((p) => ` (${p})`).join('');
}

/** 최저임금 충족 여부 — 위반이면 false, 충족(ok·주휴 명시 확인 risk minor)이면 true, 그 밖(자료 필요·상여를 넣어야만
 * 충족하는 risk)은 null */
function meets(a: MinwageAssessment): boolean | null {
  if (a.status === 'violation') return false;
  if (a.status === 'ok' || (a.status === 'risk' && a.severity === 'minor')) return true;
  return null;
}

/** P2(261102) — 시급제·월급제가 갈리지 않을 때(F6 174H, K1 몫·기본급 모두 시급 띠 밖) 두 해석을 다 본다. 시급제 = 기본급 ÷
 * 산출시간(몫)을 계약 시급으로 A·B·F7, 월급제 = 기본급을 월급으로 C(÷ 최저임금 적용기준 월 시간). 둘 다 미달이면 위반,
 * 둘 다 충족이면 충족(시급제 해석에 §17② 확인이 남으면 risk minor), 갈리거나 한쪽이 결론을 못 내면 null — 부르는 쪽이 두 값을
 * 적고 자료 필요. 새 임계값은 없다 — 각 해석은 기존 계산 그대로다. */
function bothReadings(
  contract: Contract,
  wb: WageBasis,
  amount: number,
  minimum: number,
  year: string,
  why: string,
): MinwageAssessment | null {
  const basisHours = wb.basisHours as number;
  const h = assessHourly(contract, amount / basisHours, minimum, year, hourlyNote(contract, { ...wb, from: 'basis' }), wb.monthlyHours);
  const m = assessMonthly(contract, minimum, year);
  const met = meets(h);
  if (met == null || met !== meets(m)) return null;
  const detail =
    `${why}. 시급제·월급제 어느 쪽으로 보아도 최저임금 ${met ? '충족' : '미달'} — 시급제라면 ${h.detail}.` +
    ` 월급제라면 ${m.detail}`;
  if (!met) return { status: 'violation', detail, amendment: `시급제라면 ${h.amendment}. 월급제라면 ${m.amendment}` };
  if (h.status === 'risk') return { status: 'risk', severity: 'minor', detail, amendment: `시급제라면 ${h.amendment}` };
  return { status: 'ok', detail, amendment: '' };
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
  // 형태·시급·출처는 normalize.wageBasis 하나에서 온다(사진 추출 매핑과 같은 함수).
  const wb = wageBasis(contract);
  const conflict = dailyHoursConflict(contract);
  if (conflict) {
    // K3 — 근로일별 행과 출근·퇴근 칸이 맞지 않으면 1주 소정을 정하지 않는다. 시급제 계약 시급이 최저시급 아래면
    // 시간과 관계없이 미달이라 그대로 본다
    // (식대·상여가 있으면 시간당 산입액이 시간에 걸려 있어 이 예외도 쓰지 않는다)
    const pendingItems = items.some((i) => RATIO_UNCONFIRMED.has(i.code));
    if (wb && wb.form === 'hourly' && wb.rate != null && base?.amount && !pendingItems && Math.round(wb.rate) < minimum) {
      const a = assessHourly(contract, wb.rate, minimum, year, hourlyNote(contract, wb), wb.monthlyHours);
      return { ...a, detail: `${a.detail} (${conflict})` };
    }
    return {
      status: 'needs_data',
      detail: `${conflict} — 1주 소정근로시간을 정할 수 없어 최저임금 산정 불가`,
      amendment: '',
    };
  }
  if (wb?.form === 'unknown' && base?.amount && wb.basisHours != null) {
    // F6 — 산출시간 174H 는 주휴를 뺀 월 소정이라 「시급 × 소정시간」인지 월급인지 갈리지 않는다. 두 해석이 같은 결론이면
    // 그 결론(P2), 갈리면 두 값을 적고 자료 필요
    const same = bothReadings(
      contract,
      wb,
      base.amount,
      minimum,
      year,
      `산출근거 ${fmtH(wb.basisHours)}H 는 주휴를 뺀 월 소정근로시간이라 시급제·월급제가 갈리지 않음`,
    );
    if (same) return same;
    const hours = monthlyStandardHours(contract) ?? MONTHLY_BASE_HOURS;
    return {
      status: 'needs_data',
      detail:
        `시급제·월급제 확인 필요 — 산출근거 ${fmtH(wb.basisHours)}H 는 주휴를 뺀 월 소정근로시간이라 형태가 갈리지 않음.` +
        ` 시급제라면 계약 시급 ${fmt(Math.round(base.amount / wb.basisHours))},` +
        ` 월급제라면 기본급 ${fmt(base.amount)} ÷ 최저임금 적용기준 월 ${hours}H = 시간당 ${fmt(Math.round(base.amount / hours))}`,
      amendment: '',
    };
  }
  if (wb?.form === 'hourly' && base?.amount) {
    if (wb.rate != null) {
      return assessHourly(contract, wb.rate, minimum, year, hourlyNote(contract, wb), wb.monthlyHours);
    }
    if (wb.basisHours != null) {
      // K1 — 월 규모 산출시간인데 몫도 기본급도 시급 띠 밖. 시급제(몫)·월급제(기본급 ÷ 월 시간) 두 해석이 같은 결론이면
      // 그 결론(P2), 갈리면 두 값을 적고 자료 필요
      const why =
        `금액과 산출시간이 맞지 않음 — 기본급 ${fmt(base.amount)}원 ÷ 산출근거 ${fmtH(wb.basisHours)}H = 시간당` +
        ` ${fmt(Math.round(base.amount / wb.basisHours))}원, 기본급 ${fmt(base.amount)}원도 시급으로 보기 어려운 금액(최저시급의 0.5~5배 밖)`;
      const same = bothReadings(contract, wb, base.amount, minimum, year, why);
      if (same) return same;
      const hours = monthlyStandardHours(contract) ?? MONTHLY_BASE_HOURS;
      return {
        status: 'needs_data',
        detail:
          `${why}. 월급제라면 기본급 ${fmt(base.amount)} ÷ 최저임금 적용기준 월 ${hours}H =` +
          ` 시간당 ${fmt(Math.round(base.amount / hours))}`,
        amendment: '',
      };
    }
    // pay_type hourly 인데 산출근거 시간이 없고 기본급이 최저시급의 5배를 넘어 시급으로 볼 수 없는 값 — 자료 필요
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
  // 단위 올림을 밝힌 계약은 많은 쪽으로 그 단위까지 받아준다(적은 쪽은 그대로 ±10원)
  const roundUp = Math.max(0, wage.amount_rounding_unit ?? 0);
  for (const item of items) {
    // 기본급은 통상시급을 끌어낸 출처라 다시 맞춰 보면 반올림 차이만 나온다(2,200,000 ÷ 209 → 10,526 × 209 = 2,199,934)
    if (item.code === 'BASE') continue;
    const { amount, basis_hours: hours } = item;
    if (amount == null || hours == null) continue;
    const expected = Math.round(rate * hours * (item.rate_multiplier ?? 1.0));
    const diff = amount - expected;
    if (diff < -WAGE_MATH_TOLERANCE || diff > WAGE_MATH_TOLERANCE + roundUp) {
      mismatches.push(
        `${item.code} ${fmt(amount)} ≠ 기대 ${fmt(expected)} (차액 ${diff > 0 ? '+' : ''}${fmt(diff)})`,
      );
    }
  }
  if (mismatches.length > 0) {
    return makeFinding('WAGE-MATH', 'violation', mismatches.join(' / '));
  }
  return makeFinding('WAGE-MATH', 'ok', `전 항목 산출근거-금액 정합 (±10원${roundUp ? `, ${fmt(roundUp)}원 단위 올림` : ''})`);
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
  // 상시 5명 미만은 §56 가산이 적용되지 않는다(시행령 §7 별표1) — 연장 실시간만 덮으면 된다
  const under5 = contract.workplace?.employee_count_5plus === false;
  // 공휴일 메모가 「공휴일 주에 빠지는 1주 연장 zH」(월 합)를 밝히면 그만큼 덜 요구한다 — 공휴일 근로시간은 1주 40시간 초과 연장 가산을
  // 겹치지 않아(제56조 제2항 「제1항에도 불구하고」, 대법원 2018다206899) 공휴일이 든 주의 연장은 나머지 날로만 센다. 밝히지 않은 메모는 종전대로
  const dropMatch = under5 ? null : HOLIDAY_WEEK_DROP_RE.exec(contract.wage?.public_holiday_note ?? '');
  const dropped = dropMatch ? Math.min(parseFloat(dropMatch[1]), weeklyOt * WEEKS_PER_MONTH) : 0;
  const required = round1((weeklyOt * WEEKS_PER_MONTH - dropped) * (under5 ? 1 : OT_PREMIUM_RATE));
  const dropText = dropped > 0 ? `, 공휴일 주에 빠지는 1주 연장 ${dropped}H 제외` : '';
  // 가산율이 적혀 있으면 시간은 실시간이다(WAGE-MATH 와 같은 해석). 없으면 환산시간으로 본다
  const agreed = round1(otItems(contract).reduce((sum, i) => sum + (i.basis_hours ?? 0) * (i.rate_multiplier ?? 1), 0));
  if (agreed >= required) {
    return makeFinding('OT-COVER', 'ok', `필요 ${required}H ≤ 약정 ${agreed}H (환산시간 해석 시${under5 && required > 0 ? ', 상시 5명 미만 — 가산 미적용' : ''}${dropText})`);
  }
  return makeFinding(
    'OT-COVER',
    'violation',
    `약정 연장환산 ${agreed}H < 필요 ${required}H (부족 ${round1(required - agreed)}H${dropText})`,
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
  // 일수는 월 평균이라 소수일 수 있다(1.56일)
  const days = parseFloat(match[1]);
  const planned = parseFloat(match[2]);
  const rate = wage.ordinary_hourly_rate;
  if (rate == null) {
    return makeFinding('HOLIDAY-COVER', 'needs_data', '통상시급 미기재 — 환산 불가');
  }
  // 메모가 「8시간 넘는 xH」(소정근로일 공휴일의 하루 8시간 넘는 시간, 월 합)를 밝히면 그 시간은 × 0.5 만 요구한다(#151).
  // 휴일근로 8시간 넘는 시간은 통상임금의 200%(제56조 제2항 제2호)이고 「제1항에도 불구하고」라 연장 가산을 겹치지 않는다(대법원 2024. 2. 8.
  // 선고 2018다206899 판결 — 2011다112391 전합 인용). 그 시간의 1.5(근로 100% + 가산 50%)는 OT-COVER 가 이미 요구한다 — 공휴일이 든 주도
  // 1주 연장 × 4.345 로 센다. 그래서 여기서 1.5 를 다시 요구하면 3.0 이 된다. ★ 0.5 는 이 전제에 기대므로 OT-COVER 식을 바꾸면 같이 본다.
  // 밝히지 않은 메모(외부 계약서)는 종전대로 전부 × 1.5 — 공휴일이 소정근로일이 아닌 날이면 그 초과시간은 OT-COVER 에 들지 않는다
  const over8Match = HOLIDAY_OVER8_RE.exec(note ?? '');
  const over8 = over8Match ? Math.min(parseFloat(over8Match[1]), planned) : 0;
  const required = round1((planned - over8) * HOLIDAY_PREMIUM_RATE + over8 * HOLIDAY_OVER8_REST_RATE);
  const agreed = round1(extras.reduce((sum, i) => sum + (i.amount ?? 0), 0) / rate);
  const basis =
    over8 > 0
      ? `공휴일 ${days}일 ${planned}H 중 8시간 이내 ${Math.round((planned - over8) * 100) / 100}H×1.5 + 8시간 넘는 ${over8}H×0.5`
      : `공휴일 ${days}일 ${planned}H×1.5`;
  if (agreed >= required) {
    return makeFinding('HOLIDAY-COVER', 'ok', `${basis}=${required}H ≤ HOLIDAY_EXTRA 환산 ${agreed}H`);
  }
  return makeFinding(
    'HOLIDAY-COVER',
    'violation',
    `HOLIDAY_EXTRA 환산 ${agreed}H < 필요 ${required}H` + ` (${basis}) — 부족 ${round1(required - agreed)}H`,
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
