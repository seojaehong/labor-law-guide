// 사업자번호로 인원 불러오기(BizNoLookup)의 문장. 시험이 allCopy() 전부를 금지어로 훑는다.
import type { LookupFail, Workplace } from '@/lib/workplace-lookup';


export const OPEN_LABEL = '사업자등록번호로 불러오기';

export const PRIVACY_NOTE = '번호는 저장하지 않습니다. 근로복지공단이 공개하는 사업장 정보만 불러옵니다.';

export function failLine(reason: LookupFail | 'invalid' | 'limit'): string {
  switch (reason) {
    case 'invalid': return '사업자등록번호 10자리를 확인해 주세요. 끝자리 검증 숫자가 맞지 않습니다.';
    case 'none': return '이 번호로 고용·산재보험에 성립된 사업장이 없습니다. 직접 골라 주세요.';
    case 'limit': return '오늘 불러오기 횟수를 넘었습니다. 직접 골라 주세요.';
    case 'no-key':
    case 'upstream':
    case 'mismatch': return '지금 공단 조회가 되지 않습니다. 직접 골라 주세요.';
  }
}

export function pickLine(count: number): string {
  return `이 번호로 사업장이 ${count}곳 있습니다. 고르세요.`;
}

export function rowLabel(w: Workplace): string {
  return `${w.name} · 상시 ${w.headcount.toLocaleString('ko-KR')}명`;
}

/** 불러온 뒤 남기는 한 줄 — 출처와 한계를 같이 말한다 */
export function appliedLine(w: Workplace): string {
  return `${w.name}${w.industry ? `(${w.industry})` : ''} · 공단 보험 신고 기준 상시 ${w.headcount.toLocaleString('ko-KR')}명을 넣었습니다. 법이 정한 방식(전 1개월 연인원 ÷ 가동 일수)으로 세면 다를 수 있습니다.`;
}

export function allCopy(): string {
  const w: Workplace = { bizNo: '', name: '가나다', address: '', headcount: 12, since: null, industry: '제조업' };
  return [
    OPEN_LABEL, PRIVACY_NOTE, pickLine(2), rowLabel(w), appliedLine(w),
    ...(['invalid', 'none', 'limit', 'no-key', 'upstream', 'mismatch'] as const).map(failLine),
  ].join('\n');
}
