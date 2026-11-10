// 다른 화면(/exit-employer 등)에서 신고서 도구로 넘어올 때 주소창 값으로 칸을 미리 채운다.
// 주소창에는 종류와 날짜만 싣는다 — 이름·주민등록번호 같은 값은 읽지도 만들지도 않는다.
import { parseYmd } from './dates';

export type PrefillKind = 'loss' | 'acq';
export interface Prefill {
  kind?: PrefillKind;
  /** 상실이면 마지막 근무일, 취득이면 취득일 (YYYY-MM-DD) */
  last?: string;
}

const PATH = '/tools/nhis-report-form';

export function readPrefill(search: string): Prefill {
  const p = new URLSearchParams(search);
  const k = p.get('kind');
  if (k !== 'loss' && k !== 'acq') return {};
  const out: Prefill = { kind: k };
  const d = p.get('last') ?? '';
  if (parseYmd(d)) out.last = d;
  return out;
}

export function nhisLossHref(lastWorkDay: string): string {
  return parseYmd(lastWorkDay) ? `${PATH}?kind=loss&last=${lastWorkDay}` : `${PATH}?kind=loss`;
}
