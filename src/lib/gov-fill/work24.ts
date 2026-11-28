/**
 * 고용24(www.work24.go.kr) 「육아기 근로시간 단축 확인서」 칸 대응표와 채울 계획.
 * 사이트 계산 화면이 계획을 만들고, 크롬 확장(extensions/work24-fill)이 사용자 브라우저에서 칸 id 대로 채운다.
 * 저장·신청은 사용자가 고용24 화면에서 누른다. 주민등록번호·비밀번호·첨부 칸은 대응표에 없다.
 * 칸 id = 2026-11-27 고용24 기업 화면 실측. 같은 대응표가 insconn work24_fill.py(파이썬)에도 있다 — 두 벌(시험은 확장과만 대조).
 * 시작일이 신청일(오늘)보다 늦으면 고용24 가 「시작일자는 신청일 보다 작아야합니다」로 막는다(화면 동작, 법령 아님).
 */
import { parseYmd } from '@/lib/hr-forms/dates';

export type FillKind = 'text' | 'radio';
export interface FillStep { id: string; value: string; kind: FillKind; label: string }
export type WageUnit = 'hour' | 'day' | 'week' | 'month';
export interface ChildcareReductionFillSpec {
  start: string;
  end: string;
  weeklyBefore: string;
  weeklyAfter: string;
  ordinaryWage: string;
  /** 기본 month */
  wageUnit?: WageUnit;
  /** 산정기준 단위기간의 월 소정근로시간 — 엔진 입력에 없어 사용자가 넣는다 */
  monthlyHours: string;
}

const UNIT_RADIO: Record<WageUnit, string> = { hour: 'odygsAmSelB', day: 'odygsAmSelC', week: 'odygsAmSelD', month: 'odygsAmSelE' };

export const WORK24_CHILDCARE_REDUCTION = {
  target: 'work24-childcare-reduction',
  host: 'www.work24.go.kr',
  path: '/ei/b/b/1500/openHPEIBB1500M06.do',
  /** 화면이 「적용」으로 채우는 칸 — 되읽기만 한다 */
  auto: ['layoffAlwncPdMonthCo', 'layoffAlwncPdDyct'],
  labels: {
    layoffAlwncPdBeginDe: '단축 시작일',
    layoffAlwncPdEndDe: '단축 종료일',
    bfeAppontWorkhr: '단축 전 주 소정근로시간',
    afAppontWorkhr: '단축 후 주 소정근로시간',
    odygsAm: '통상임금',
    appontWorkhr: '월 소정근로시간',
    odygsAmSelB: '통상임금 종류: 시급',
    odygsAmSelC: '통상임금 종류: 일급',
    odygsAmSelD: '통상임금 종류: 주급',
    odygsAmSelE: '통상임금 종류: 월급',
  } as Record<string, string>,
} as const;

export const ALLOWED_IDS: readonly string[] = Object.keys(WORK24_CHILDCARE_REDUCTION.labels);

const HOURS = /^\d{1,3}(\.\d)?$/;
const AMOUNT = /^\d+$/;

export function childcareReductionFillPlan(spec: ChildcareReductionFillSpec, today: string): { steps: FillStep[]; problems: string[] } {
  const problems: string[] = [];
  const s = parseYmd(spec.start ?? '');
  const e = parseYmd(spec.end ?? '');
  const t = parseYmd(today);
  if (!s) problems.push('단축 시작일을 YYYY-MM-DD 로 넣어 주세요.');
  if (!e) problems.push('단축 종료일을 YYYY-MM-DD 로 넣어 주세요.');
  if (s && e && e < s) problems.push('단축 종료일이 시작일보다 앞섭니다.');
  if (s && t && s > t) problems.push('고용24 확인서는 단축이 시작된 뒤에 냅니다 — 시작일이 오늘보다 늦으면 고용24 화면이 받지 않습니다.');
  const clean = (v: string | undefined) => (v ?? '').replace(/[,\s]/g, '');
  const wb = clean(spec.weeklyBefore);
  const wa = clean(spec.weeklyAfter);
  const mh = clean(spec.monthlyHours);
  const wage = clean(spec.ordinaryWage);
  if (!HOURS.test(wb)) problems.push('단축 전 주 소정근로시간을 숫자로 넣어 주세요(소수는 한 자리).');
  if (!HOURS.test(wa)) problems.push('단축 후 주 소정근로시간을 숫자로 넣어 주세요(소수는 한 자리).');
  if (!HOURS.test(mh)) problems.push('월 소정근로시간을 숫자로 넣어 주세요(근로계약서·취업규칙의 값).');
  if (!AMOUNT.test(wage)) problems.push('통상임금을 숫자로 넣어 주세요.');
  const unit = spec.wageUnit ?? 'month';
  if (!(unit in UNIT_RADIO)) problems.push('통상임금 종류는 시급·일급·주급·월급 중 하나입니다.');
  if (problems.length) return { steps: [], problems };
  const L = WORK24_CHILDCARE_REDUCTION.labels;
  const step = (id: string, value: string, kind: FillKind = 'text'): FillStep => ({ id, value, kind, label: L[id] });
  return {
    steps: [
      step('layoffAlwncPdBeginDe', spec.start),
      step('layoffAlwncPdEndDe', spec.end),
      step('bfeAppontWorkhr', wb),
      step('afAppontWorkhr', wa),
      step(UNIT_RADIO[unit], '', 'radio'),
      step('odygsAm', wage),
      step('appontWorkhr', mh),
    ],
    problems,
  };
}
