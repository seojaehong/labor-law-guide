// 통상임금 점검 — 임금 항목마다 세 요소(소정근로 대가성·정기성·일률성)를 묻고, 통상임금에 「들어가는 쪽 / 빠지는 쪽」으로
// 볼 요소가 있는지와 그 근거를 보인다. 「산입된다·안 된다」로 단정하지 않는다 — 판결도 조건을 「요소 중 하나로」
// 실질 판단하라고 남겼다(2020다247190, SOURCES.Q02). 규정 원문과 운용 실태를 보지 않고는 정할 수 없다.
//
// 새 기준: 대법원 2024. 12. 19. 선고 2020다247190·2023다302838 전원합의체 — 고정성을 뺐다.
// 적용 시점: 2024. 12. 19. 이후 「제공한」 연장근로 등 = 새 기준, 2024. 12. 18.까지 = 종전 기준(고정성, 2012다89399).
//   이 사건·병행사건은 새 기준을 소급하지만(Q12) 입력으로 가릴 수 없어 안내문만 낸다.
// 시간급(참고): 들어가는 쪽 항목의 1년 금액 합 ÷ 12 ÷ 월 기준시간(근로기준법 시행령 §6② 4·5·7호 — 월 밖의 기간으로 정한
//   임금은 같은 방식으로 환산해 합산). 끝수는 sumIncluded 주석. 월 기준시간은 법정 숫자가 아니라 사용자 입력이다
//   (시행령에 숫자 없음. 최저임금 고시·min-wage.ts unitHours 는 같은 식을 정수로 반올림한 209, 지침 예시 208.56).
import type { SourceId } from './ordinary-wage-sources';
import { SOURCES } from './ordinary-wage-sources';

export type Answer = 'yes' | 'no' | 'unknown';
export type Era = 'new' | 'old';
export type Direction = 'in' | 'out' | 'unclear';

/** 판결이 따로 다룬 종류 — 고른 종류에 맞는 근거를 붙인다. 판단은 답과 조건으로 한다(주휴수당 같은 법정수당만 예외) */
export type ItemKind =
  | 'base' | 'allowance' | 'tenure' | 'bonus' | 'holiday' | 'attendance'
  | 'performance' | 'business' | 'family' | 'extra' | 'disability' | 'statutory' | 'other';

export const KIND_LABEL: Record<ItemKind, string> = {
  base: '기본급',
  allowance: '직무·직책수당',
  tenure: '근속수당',
  bonus: '정기상여금',
  holiday: '명절상여·휴가비',
  attendance: '근무일수(만근·출근율) 조건 수당',
  performance: '성과급',
  business: '경영성과급·격려금',
  family: '가족수당',
  extra: '무사고수당 등 추가 요건 수당',
  disability: '장애인수당',
  statutory: '주휴수당 등 법정수당',
  other: '그 밖의 수당',
};

/** 1년에 지급하는 횟수 — 12 매달 · 6 격월 · 4 분기 · 3 연 3회(설·추석·하계 등) · 2 반기·명절 · 1 연 1회 */
export const TIMES = [12, 6, 4, 3, 2, 1] as const;
export type TimesPerYear = (typeof TIMES)[number];

/**
 * 성과급 실적 기간. 판결은 최소지급분이 어느 해 통상임금인지를 지급 시기가 아니라 「지급 대상기간」으로 정했다(2023다216777, S01).
 * current = 점검 기준일이 속한 해의 실적분 — 지급이 다음 해여도 그해 통상임금 쪽. previous = 전년도 실적분을 지급 시기만 기준일이 속한 해로 정함.
 */
export const PERF_YEAR_LABEL = {
  current: '점검 기준일이 속한 해의 실적분(지급이 다음 해여도)',
  previous: '전년도 실적분(지급 시기만 기준일이 속한 해)',
  unknown: '모름',
} as const;

export interface WageItem {
  kind: ItemKind;
  name: string;
  /** 1회 지급액(원) — 소정근로를 온전히 제공했을 때 정해진 금액 */
  amount: number;
  timesPerYear: TimesPerYear;
  /** 정기성 — 매달 또는 정해진 주기마다 지급하도록 정해져 있나 */
  regular: Answer;
  /** 일률성 — 모두에게, 또는 일의 가치와 관련된 조건을 갖춘 사람 모두에게 주나 */
  uniform: Answer;
  /** 소정근로 대가성 — 정해진 근무시간을 빠짐없이 일하면 그 대가로 받나. 성과급·가족수당 기본금액은 묻지 않는다 */
  forWork: Answer;
  /** 지급일에 재직 중이어야 받는다 */
  employedOnPayday?: boolean;
  /** 근무일수 조건 — 조건 일수와 그 기준기간의 소정근로일수 */
  workDays?: { required: number; scheduled: number };
  /** 출근율 조건 — 전액을 주는 출근율(%) */
  attendanceRate?: number;
  /** 지급일 전에 퇴직해도 그때까지 근무일수에 비례해 지급한다(종전 기준에서만 갈린다, U09) */
  proRataOnLeave?: boolean;
  /** 정한 일수·출근율을 못 채워도 근무일수에 비례해(일할) 지급한다(종전 기준에서만 갈린다, U08) */
  proRataOnShortDays?: boolean;
  /** 휴직자·복직자·징계대상자에게 지급을 제한하는 규정이 있다 */
  leaveOrDisciplineOnly?: boolean;
  /** 성과급 — 평가와 무관하게 보장된 1회 최소 금액(원) */
  minimum?: number;
  /** 성과급 — 실적 기간(PERF_YEAR_LABEL) */
  performanceYear?: keyof typeof PERF_YEAR_LABEL;
  /** 가족수당 — 부양가족과 상관없이 모두에게 주는 1회 기본금액(원) */
  baseForAll?: number;
}

/** 보류의 이유가 되는 빈칸 — amount 는 1회 지급액이 0(비어 있음) */
export type Question = 'amount' | 'regular' | 'uniform' | 'forWork' | 'performanceYear';

export interface ItemCheck {
  direction: Direction;
  /** 통상임금 쪽으로 볼 1년 금액(원). 일부만 들어가면 그 부분, 빠지거나 보류면 0 */
  annual: number;
  /** 일부만 — 성과급 최소 보장분·가족수당 기본금액 */
  partial: boolean;
  /** 전년도 실적분 성과급의 최소분 — 전년도 통상임금 쪽이라 기준일이 속한 해 합계에 넣지 않는다(2023다216777, S01) */
  priorYear: boolean;
  /** 보류일 때 비어 있는 칸. 비어 있는데 보류면 답끼리 부딪힌 것(itemNotes) */
  open: Question[];
  reasons: SourceId[];
}

/** 새 기준을 적용하는 첫날 — 판결 선고일(Q12) */
export const NEW_RULE_FROM = '2024-12-19';

/** 연장근로 등을 제공한 날(YYYY-MM-DD)에 적용하는 기준 */
export function eraOn(date: string): Era {
  const t = /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? Date.parse(`${date}T00:00:00Z`) : NaN;
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== date) throw new Error('날짜를 확인해 주세요');
  return date >= NEW_RULE_FROM ? 'new' : 'old';
}

const won = (n: number | undefined) => n === undefined || (Number.isInteger(n) && n >= 0);

function validate(i: WageItem) {
  if (!won(i.amount) || !won(i.minimum) || !won(i.baseForAll)) throw new Error('금액은 0 이상의 원 단위로 넣어 주세요');
  // 1회 지급액이 비어 있으면(0) 보류로 두고, 들어 있으면 그 일부가 전액을 넘을 수 없다
  if (i.amount > 0 && (i.minimum ?? 0) > i.amount) throw new Error('최소 보장액은 1회 지급액보다 클 수 없습니다');
  if (i.amount > 0 && (i.baseForAll ?? 0) > i.amount) throw new Error('모두에게 주는 기본금액은 1회 지급액보다 클 수 없습니다');
  if (!(TIMES as readonly number[]).includes(i.timesPerYear)) throw new Error('지급 횟수를 확인해 주세요');
  const d = i.workDays;
  if (d && !(Number.isInteger(d.required) && Number.isInteger(d.scheduled) && d.required > 0 && d.scheduled > 0)) {
    throw new Error('근무일수 조건을 확인해 주세요');
  }
  if (i.attendanceRate !== undefined && !(i.attendanceRate > 0 && Number.isFinite(i.attendanceRate))) throw new Error('출근율을 확인해 주세요');
}

const out = (reasons: SourceId[]): ItemCheck => ({ direction: 'out', annual: 0, partial: false, priorYear: false, open: [], reasons });
const unclear = (open: Question[], reasons: SourceId[]): ItemCheck => ({ direction: 'unclear', annual: 0, partial: false, priorYear: false, open, reasons });

/** 소정근로 대가성이 없다고 답했을 때의 근거 */
function notForWork(kind: ItemKind): SourceId[] {
  if (kind === 'extra') return ['Q11', 'G_P7'];
  if (kind === 'disability') return ['T01'];
  if (kind === 'business') return ['Q04', 'G_P15'];
  return ['U01', 'G_P7'];
}

/** 일률성이 없다고 답했을 때의 근거 */
function notUniform(kind: ItemKind): SourceId[] {
  if (kind === 'family') return ['U05', 'G_Q9'];
  if (kind === 'disability') return ['T01'];
  return ['U04'];
}

/** 근무일수·출근율 조건이 소정근로일수를 넘나. 출근율은 100%를 넘으면 넘는다 */
function overScheduled(i: WageItem): boolean {
  if (i.workDays && i.workDays.required > i.workDays.scheduled) return true;
  return i.attendanceRate !== undefined && i.attendanceRate > 100;
}

const dayConditioned = (i: WageItem) => Boolean(i.workDays || i.attendanceRate !== undefined);

/** 가족수당 중 모두에게 주는 기본금액 — 판결이 그 금액을 소정근로의 대가로 봤다(U05) */
const familyBase = (i: WageItem) => i.kind === 'family' && (i.baseForAll ?? 0) > 0;

/**
 * 「근무시간의 대가」에 「아니오」인데 지급일 재직이나 소정근로일수 이내의 근무일수·출근율 조건이 붙어 있다.
 * 그 조건만으로는 대가성이 부정되지 않으므로(Q06·Q07) 「아니오」가 조건 때문인지 가릴 수 없다 — 보류한다.
 */
const forWorkConflict = (i: WageItem) =>
  i.kind !== 'performance' && !familyBase(i) && i.forWork === 'no' && (Boolean(i.employedOnPayday) || dayConditioned(i)) && !overScheduled(i);

export function checkItem(item: WageItem, era: Era): ItemCheck {
  validate(item);
  const { kind } = item;
  // 주휴수당 같은 법정수당은 통상임금으로 계산하는 수당이라 개념상 통상임금이 될 수 없다 — 답과 상관없다(Q05)
  if (kind === 'statutory') return out(['Q05']);

  const perf = kind === 'performance';
  const minimum = item.minimum ?? 0;
  // 성과급은 「대가성」을 묻지 않는다 — 순수 성과급은 대가성이 없고, 평가와 무관한 최소 보장분만 대가다(Q10)
  if (perf && minimum === 0) return out(['Q10', 'G_P15']);

  // 가족수당 기본금액은 모두에게 주는 근로의 대가(U05) — 지급 대상·대가 답은 부양가족 가산분에 관한 것이라 보지 않는다
  const base = familyBase(item);
  const forWork = perf || base ? 'yes' : item.forWork;
  const uniform = base ? 'yes' : item.uniform;
  const conflict = forWorkConflict(item);

  // 「아니오」 하나면 빠지는 쪽 — 「모름」이 섞여 있어도 그렇다. 조건과 부딪힌 「아니오」는 다른 「아니오」가 없을 때 보류
  if (forWork === 'no' && !conflict) return out(notForWork(kind));
  if (uniform === 'no') return out(notUniform(kind));
  if (item.regular === 'no') return out(kind === 'business' ? ['Q04', 'G_P15'] : ['Q04']);
  if (overScheduled(item)) {
    // 새 기준: 소정근로일수를 넘는 조건은 추가 근로의 대가(Q07 후단). 잠탈 목적의 소정근로일수는 효력이 부정될 수 있다(Q09 — itemNotes 가 단서로 적는다).
    // 종전 기준: 비례 지급이 없으면 고정성이 없고(Q17), 있어도 소정근로를 넘는 근로의 대가는 소정근로의 대가가 아니다(U01).
    if (era === 'new') return out(['Q07', 'Q09']);
    return out(item.proRataOnShortDays ? ['U01'] : ['Q17']);
  }
  if (conflict) {
    const why: SourceId[] = era === 'new'
      ? [...(item.employedOnPayday ? (['Q06'] as const) : []), ...(dayConditioned(item) ? (['Q07'] as const) : [])]
      : ['U01'];
    return unclear([], why);
  }

  const open: Question[] = [];
  if (item.amount === 0) open.push('amount');
  if (item.regular === 'unknown') open.push('regular');
  if (uniform === 'unknown') open.push('uniform');
  if (forWork === 'unknown') open.push('forWork');
  if (perf && (item.performanceYear ?? 'unknown') === 'unknown') open.push('performanceYear');
  if (open.length) return unclear(open, open.some((q) => q !== 'amount') ? ['Q02'] : []);

  // 일부만 들어가는 둘 — 성과급 최소 보장분, 가족수당 중 모두에게 주는 기본금액
  const partial = perf || base;
  const once = perf ? minimum : base ? item.baseForAll! : item.amount;
  const annual = once * item.timesPerYear;
  const priorYear = perf && item.performanceYear === 'previous';

  const reasons: SourceId[] = [];
  if (perf) reasons.push(...(era === 'new' ? (['Q10', 'Q16'] as const) : (['U10'] as const)), ...(priorYear ? (['S01'] as const) : []));
  else if (base) reasons.push('U05', ...(era === 'new' ? (['G_Q9'] as const) : []));
  else reasons.push(era === 'new' ? 'Q01' : 'U01');
  if (item.timesPerYear < 12) reasons.push('U02');
  if (kind === 'tenure') reasons.push('U06');
  if (kind === 'holiday' && era === 'new') reasons.push('G_P15', 'G_Q6');
  if (item.leaveOrDisciplineOnly) reasons.push('U07');
  // 종류 이름이 가리키는 반대 근거 — 세 질문에 「예」로 답했어도 판결·지침이 따로 다룬 종류다(itemNotes 가 주의 문장을 단다)
  if (kind === 'extra') reasons.push('Q11');
  if (kind === 'disability') reasons.push('T01');
  if (kind === 'business') reasons.push('Q04', 'G_P15');

  if (era === 'old') {
    // 종전 기준 — 재직·근무일수 조건은 「조건 성취가 불확실」해 고정성이 없다고 봤다(Q17).
    // 다만 지급일 전에 퇴직해도 근무일수에 비례해 주면(U09), 일수를 못 채워도 일할해 주면(U08) 그 한도에서는 고정성이 있다.
    // 두 조건은 따로 본다 — 붙은 조건마다 그 조건의 비례 지급이 있어야 한다.
    const leaveFixed = !item.employedOnPayday || item.proRataOnLeave;
    const daysFixed = !dayConditioned(item) || item.proRataOnShortDays;
    if (!leaveFixed || !daysFixed) return out(['Q17']);
    if (item.employedOnPayday) reasons.push('U09');
    if (dayConditioned(item)) reasons.push('U08');
  } else {
    if (item.employedOnPayday) reasons.push('Q06', ...(kind === 'bonus' ? (['Q15', 'G_Q4'] as const) : []));
    if (item.workDays) reasons.push('Q07', 'Q13', 'R01', 'G_Q5');
    if (item.attendanceRate !== undefined) reasons.push('Q13', 'Q08', 'V01');
    if (kind === 'bonus' || item.employedOnPayday) reasons.push('G_Q7');
  }
  return { direction: 'in', annual, partial, priorYear, open: [], reasons: [...new Set(reasons)] };
}

/**
 * num ÷ den 을 소수 셋째 자리에서 반올림(사사오입)해 둘째 자리까지. num·den 이 정수면 한 번의 나눗셈이라
 * 정확히 .xx5 인 값은 이진 부동소수로도 정확히 표현돼 내려가지 않는다(Math.round(1.005 * 100) / 100 = 1 문제를 피한다).
 */
const hundredths = (num: number, den: number) => Math.round((num * 100) / den) / 100;

/**
 * 들어가는 쪽 항목의 1년 합계와 시간급(참고). 보류·빠지는 쪽·전년도 실적분은 넣지 않는다.
 * 끝수: 시행령에 시간급 끝수 규정이 없어 소수 셋째 자리에서 반올림한 참고값(지침 Q8 「2,397원39전」과 같은 자리).
 * 1년 금액(정수 원)과 월 기준시간 × 100(정수, 소수 둘째 자리까지만 받는다)을 정수끼리 한 번에 나눈다.
 */
export function sumIncluded(items: WageItem[], era: Era, unitHours: number): { annual: number; hourly: number; count: number } {
  const hours100 = Math.round(unitHours * 100);
  if (!(unitHours > 0) || !Number.isFinite(unitHours) || Math.abs(unitHours * 100 - hours100) > 1e-6) {
    throw new Error('월 기준시간을 확인해 주세요(소수 둘째 자리까지)');
  }
  let annual = 0;
  let count = 0;
  for (const i of items) {
    const c = checkItem(i, era);
    if (c.direction !== 'in' || c.priorYear) continue;
    annual += c.annual;
    count += 1;
  }
  // 1년 금액 ÷ 12 ÷ 월 기준시간 — 월 환산을 중간에 반올림하지 않고 한 번에 나눈다
  return { annual, hourly: hundredths(annual * 100, 12 * hours100), count };
}

/**
 * 월 기준시간 = 1주 기준시간 × 1년 평균 주 수 ÷ 12(시행령 §6② 4호). 1주 기준시간 = 1주 소정근로시간 + 유급 처리 시간(3호).
 * 평균 주 수는 법령에 숫자가 없다 — 365 ÷ 7, 윤년 366 ÷ 7, 지침 Q8 의 약 52.14주 셋을 보인다. 소수 셋째 자리에서 반올림.
 * min-wage.ts unitHours 는 같은 식(365 ÷ 7)을 정수로 반올림한다(209) — 시험 B3-b 가 둘을 잇는다.
 */
export function baseHours(weekHours: number, year: '365' | '366' | '52.14'): number {
  if (year === '52.14') return hundredths(weekHours * 5214, 1200);
  return hundredths(weekHours * Number(year), 84);
}

/**
 * 2024년 12월에 걸친 연장근로를 제공한 날로 나눠 센다(지침 Q11 방식). 가산 = 통상임금의 100분의 50(근로기준법 §56①, 「이상」).
 * 원 미만 끝수 규정이 없어 반올림 참고값. 화면에는 지침 예시 숫자로만 보인다 — 사용자 금액의 법정수당은 계산하지 않는다(범위 밖).
 */
export function splitOvertime(i: { oldHourly: number; newHourly: number; hoursBefore: number; hoursAfter: number }) {
  const before = Math.round(i.oldHourly * 1.5 * i.hoursBefore);
  const after = Math.round(i.newHourly * 1.5 * i.hoursAfter);
  return { before, after, total: before + after };
}

// ── 화면 문장. 단정하지 않는 점검형(리서치 R9). 판결·지침이 정한 것은 출처를 밝혀 적는다. 시험이 allCopy() 전부를 금지어로 훑는다 ──

export function eraLabel(era: Era): string {
  return era === 'new' ? '새 기준(2024. 12. 19. 이후 제공분)' : '종전 기준(2024. 12. 18.까지 제공분)';
}

export function directionSentence(d: Direction, era: Era): string {
  if (d === 'unclear') return '입력만으로는 어느 쪽인지 가리기 어렵습니다. 지급 규정 원문을 확인해 주세요.';
  if (era === 'new') {
    return d === 'in' ? `${eraLabel(era)}으로는 통상임금에 들어가는 쪽으로 볼 요소가 있습니다.` : '새 기준으로도 통상임금에서 빠지는 쪽으로 볼 요소가 있습니다.';
  }
  return d === 'in' ? `${eraLabel(era)}으로도 통상임금에 들어가는 쪽으로 볼 요소가 있습니다.` : `${eraLabel(era)}으로는 통상임금에서 빠지는 쪽으로 볼 요소가 있습니다.`;
}

const QUESTION_LABEL: Record<Question, string> = {
  amount: '1회 지급액',
  regular: '정해진 주기',
  uniform: '지급 대상',
  forWork: '근무시간의 대가',
  performanceYear: '어느 해 실적분인지',
};

/** 종류 이름이 판결·지침이 따로 다룬 것인데 세 질문에 「예」로 답했을 때의 주의 문장 */
const KIND_CAUTION: Partial<Record<ItemKind, string>> = {
  extra: '무사고처럼 정해진 근무 밖의 요건을 달성해야 받는 수당은 판결이 근무시간의 대가가 아니라고 보았습니다(2020다247190). 그런 요건 없이 정해진 근무만으로 받는지 규정을 확인해 주세요.',
  disability: '장애인수첩을 가진 사람에게만 주는 장애인수당은 판결이 근무의 대가로 볼 수 없다고 보았습니다(2019다204876). 모두에게 주는지 「지급 대상」 답을 다시 확인해 주세요.',
  business: '기업 실적에 따라 주거나 그때그때 지급 여부·금액을 정하는 경영성과급·격려금은 지침이 통상임금이 아니라고 정리합니다. 해마다 정해진 금액을 주도록 규정돼 있는지 확인해 주세요.',
};

/** 항목 결과 아래 덧붙이는 문장 */
export function itemNotes(i: WageItem, c: ItemCheck): string[] {
  const n: string[] = [];
  const asked = c.open.filter((q) => q !== 'amount');
  if (c.open.includes('amount')) n.push('1회 지급액이 비어 있어 합계에서 뺐습니다.');
  if (c.direction === 'unclear' && asked.length) n.push(`답이 비어 있는 질문: ${asked.map((q) => QUESTION_LABEL[q]).join(', ')}`);
  if (c.direction === 'unclear' && !c.open.length && forWorkConflict(i)) {
    n.push('지급일 재직 조건이나 소정근로일수 이내의 근무일수·출근율 조건이 붙었다는 사정만으로는 통상임금성이 부정되지 않는다고 판결은 보았습니다(2020다247190). 그 조건 때문에 「아니오」로 답했다면 「근무시간의 대가」는 「예」로 다시 확인해 주세요. 조건은 ‘붙어 있는 조건’에서 따로 봅니다.');
  }
  if (c.direction === 'in' && i.kind === 'performance') n.push('평가와 무관하게 보장된 최소 금액만 그렇습니다.');
  if (familyBase(i)) n.push('모두에게 주는 기본금액은 판결이 근무의 대가로 보았기 때문에(2012다89399) 지급 대상·근무시간의 대가 답과 상관없이 정해진 주기만 봅니다.');
  if (c.direction === 'in' && c.partial && i.kind === 'family') n.push('기본금액만 들어가는 쪽으로 볼 요소가 있습니다. 부양가족에 따라 더 주는 금액은 빠지는 쪽으로 볼 요소가 있습니다.');
  if (c.priorYear) n.push('전년도 실적분이라 그 최소 금액은 전년도 통상임금 쪽으로 볼 요소가 있어 합계에 넣지 않았습니다. 점검 기준일이 속한 해의 실적분(지급이 다음 해여도)의 최소 보장액을 따로 넣어 보세요(2023다216777).');
  if (c.direction === 'in' && KIND_CAUTION[i.kind]) n.push(KIND_CAUTION[i.kind]!);
  if (i.kind === 'statutory') n.push('주휴수당 같은 법정수당은 통상임금을 바탕으로 계산하는 수당이라 합계에 넣지 않습니다.');
  if (i.leaveOrDisciplineOnly) n.push('휴직자·징계 대상자에게 주지 않는 규정만으로는 「모두에게」가 부정되지 않습니다. 지급 대상 질문은 그 사람들을 빼고 답해 주세요.');
  if (overScheduled(i)) n.push('조건 일수가 그 기간의 소정근로일수를 넘으면 정해진 근무를 넘는 추가 근로의 대가로 볼 요소가 있습니다.');
  if (c.reasons.includes('Q09')) n.push('다만 통상임금에서 빼려고 근무실태와 동떨어진 소정근로일수를 정했다면 그 합의의 효력이 부정될 수 있다고 판결은 보았습니다(2020다247190).');
  return n;
}

export const OLD_ERA_NOTICE =
  '2024. 12. 18.까지 제공한 연장근로 등에는 종전 기준(고정성)을 적용하도록 판결이 정해 결과가 달라질 수 있습니다. 다만 그 사건과, 판결 선고 시점에 통상임금 해당 여부가 재판의 전제가 되어 다투어지며 이미 법원에 계속 중이던 사건(병행사건)에는 새 기준을 소급 적용하도록 했습니다(2020다247190).';
export const RIGHT_TO_PAY_NOTICE =
  '통상임금 계산에 넣는 것과, 퇴직자가 그 임금을 받을 권리는 별개입니다. 지급일 재직 조건은 특별한 사정이 없는 한 무효로 볼 수 없다고 본 판결(2019다204876)이 있고, 지침은 퇴직 등으로 지급조건을 채우지 못하면 줄 의무가 생기지 않는다고 정리합니다. 판결은 그 조건이 현저히 합리성을 잃었는지도 따로 살폈습니다.';
export const AGREED_WAGE_NOTICE =
  '회사 규정에서 통상임금에서 뺀다고 정해 두었어도, 판결은 근로기준법 기준과 전체적으로 비교해 그에 못 미치는 부분만 무효로 보았습니다(2019다204876). 항목별로 유리한 것만 골라 계산하는 것도 허용되지 않는다고 보았습니다.';
export const UNIT_HOURS_NOTE =
  '월 기준시간 = (1주 소정근로시간 + 유급 처리 시간) × 1년 평균 주 수 ÷ 12(시행령 제6조 제2항 제4호). 시행령에 숫자는 없습니다. 주 40시간(주휴 포함 48시간)을 365일로 셈하면 208.57시간이고, 최저임금 고시와 이 사이트의 최저임금·해고예고수당 도구는 이를 반올림한 209시간을 씁니다. 지침 예시는 약 52.14주로 셈한 208.56시간입니다.';
export const ROUNDING_NOTE = '시간급의 끝수를 정한 규정이 없어 소수 셋째 자리에서 반올림해 둘째 자리까지 참고로 보입니다.';

/** 답 카드 맨 위 문장. invalid = 입력 오류로 점검하지 못한 항목 수(합계에서 뺐다) */
export function summaryLines(era: Era, checks: ItemCheck[], hourly: number, invalid = 0): string[] {
  const inCount = checks.filter((c) => c.direction === 'in' && !c.priorYear).length;
  const unclearCount = checks.filter((c) => c.direction === 'unclear').length;
  const lines = [
    inCount === 0
      ? `${eraLabel(era)}으로 통상임금에 들어가는 쪽으로 볼 요소가 있는 항목이 없습니다.`
      : `${eraLabel(era)}으로 통상임금에 들어가는 쪽으로 볼 요소가 있는 항목은 ${inCount}개입니다.`,
  ];
  if (inCount > 0) lines.push(`그 항목만 더해 시간급을 내면 시간당 ${fmt2(hourly)}원입니다(참고).`);
  if (unclearCount > 0) lines.push(`${unclearCount}개는 입력만으로 가리기 어려워 합계에서 뺐습니다.`);
  if (invalid > 0) lines.push(`${invalid}개 항목은 입력을 확인해 주세요. 합계에서 뺐습니다.`);
  return lines;
}

export const fmt2 = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 시험용 — 화면에 나올 수 있는 문장 전부(근거 원문·요지 포함) */
export function allCopy(): string[] {
  const kinds = Object.keys(KIND_LABEL) as ItemKind[];
  const sample = (kind: ItemKind, o: Partial<WageItem> = {}): WageItem => ({
    kind, name: KIND_LABEL[kind], amount: 100_000, timesPerYear: 12, regular: 'yes', uniform: 'yes', forWork: 'yes', ...o,
  });
  const items: WageItem[] = [
    ...kinds.map((k) => sample(k)),
    sample('other', { regular: 'unknown', uniform: 'unknown', forWork: 'unknown' }),
    sample('base', { amount: 0 }),
    sample('performance', { minimum: 10_000, performanceYear: 'previous' }),
    sample('performance', { minimum: 10_000 }),
    sample('family', { uniform: 'no', baseForAll: 20_000 }),
    sample('family', { regular: 'unknown', baseForAll: 20_000 }),
    sample('allowance', { leaveOrDisciplineOnly: true }),
    sample('attendance', { workDays: { required: 22, scheduled: 21 } }),
    sample('attendance', { forWork: 'no', workDays: { required: 15, scheduled: 21 } }),
  ];
  const lines: string[] = [];
  for (const era of ['new', 'old'] as const) {
    for (const d of ['in', 'out', 'unclear'] as const) lines.push(directionSentence(d, era));
    const checks = items.map((i) => checkItem(i, era));
    items.forEach((i, k) => lines.push(...itemNotes(i, checks[k])));
    lines.push(...summaryLines(era, checks, 1234.5, 2), ...summaryLines(era, [], 0), eraLabel(era));
  }
  lines.push(...Object.values(KIND_LABEL), ...Object.values(QUESTION_LABEL), ...Object.values(PERF_YEAR_LABEL));
  lines.push(OLD_ERA_NOTICE, RIGHT_TO_PAY_NOTICE, AGREED_WAGE_NOTICE, UNIT_HOURS_NOTE, ROUNDING_NOTE);
  for (const s of Object.values(SOURCES)) lines.push(s.cite, ...(s.quote ? [s.quote] : []), ...(s.note ? [s.note] : []));
  return [...new Set(lines)];
}
