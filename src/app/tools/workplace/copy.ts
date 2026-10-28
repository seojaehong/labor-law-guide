// 사업장 규모 카드의 문장은 모두 여기서 만든다. 시험이 이 함수들의 출력 전부를 금지어로 훑는다.
import { TIERS } from '@/content/duties-data';
import { profileFor, type LookupFail, type Profile, type Workplace } from '@/lib/workplace-lookup';

export const FORBIDDEN = ['판정', '진단', '자문', '상담', '노무사', '적법', '확률'] as const;

export const SOURCE_NOTE =
  '상시인원은 근로복지공단에 보험으로 신고된 숫자입니다. 근로기준법은 기준일 전 1개월 연인원을 가동 일수로 나눠 세므로 결과가 다를 수 있습니다.';

export const PRIVACY_NOTE = '입력한 사업자등록번호는 저장하지 않습니다. 공단이 공개하는 사업장 정보만 보여 줍니다.';

export function failLine(reason: LookupFail | 'invalid'): string {
  switch (reason) {
    case 'invalid': return '사업자등록번호 10자리를 확인해 주세요. 끝자리 검증 숫자가 맞지 않습니다.';
    case 'none': return '이 번호로 고용·산재보험에 성립된 사업장이 없습니다. 아직 직원을 신고하지 않았거나 번호가 다를 수 있습니다.';
    case 'no-key':
    case 'upstream':
    case 'mismatch': return '지금 공단 조회가 되지 않습니다. 잠시 뒤 다시 해 보거나 아래에서 인원을 직접 골라 보세요.';
  }
}

const tierLabel = (min: number) => TIERS.find(t => t.min === min)!.note;

export function headline(p: Profile): string {
  return `상시 ${p.headcount.toLocaleString('ko-KR')}명 · ${tierLabel(p.tier)} 사업장 의무 ${p.total}가지가 해당합니다.`;
}

export function nextLine(p: Profile): string | null {
  if (!p.next) return null;
  return `${p.next.gap.toLocaleString('ko-KR')}명이 늘어 ${tierLabel(p.next.min)}이 되면 의무 ${p.next.added}가지가 더 생깁니다.`;
}

export function freshTitle(p: Profile): string | null {
  return p.fresh.length ? `${tierLabel(p.tier)}부터 새로 생기는 것` : null;
}

export function workplaceMeta(w: Workplace): string {
  return [w.industry, w.since ? `보험 성립 ${w.since.replace(/-/g, '.')}.` : null].filter(Boolean).join(' · ');
}

export function pickLine(count: number): string {
  return `이 번호로 사업장이 ${count}곳 있습니다. 볼 사업장을 고르세요.`;
}

export const HEADCOUNT_LINK = '사람을 더 쓰거나 줄일 예정이면 법이 정한 방식으로 기간을 세어 보세요';

/** 금지어 시험용 — 화면에 나올 수 있는 문장 전부 */
export function allCopy(): string {
  const ps = [0, 4, 7, 12, 35, 60].map(profileFor);
  const w: Workplace = { bizNo: '', name: '', address: '', headcount: 1, since: '2011-01-01', industry: '제조업' };
  return [
    SOURCE_NOTE, PRIVACY_NOTE, HEADCOUNT_LINK, workplaceMeta(w), pickLine(3),
    ...(['invalid', 'none', 'no-key', 'upstream', 'mismatch'] as const).map(failLine),
    ...ps.flatMap(p => [headline(p), nextLine(p) ?? '', freshTitle(p) ?? '']),
  ].join('\n');
}
