// 다른 화면(/exit-employer)에서 신고서 도구로 넘어올 때 마지막 근무일을 미리 채운다.
// 값은 주소의 # 뒤(해시)에 싣는다 — 해시는 서버 요청·Referer 에 실리지 않는다.
// 종류와 날짜만 다룬다. 이름·주민등록번호 같은 값은 읽지도 만들지도 않는다.
import { parseYmd } from './dates';

const PATH = '/tools/nhis-report-form';

/** 상실 미리 채움이 아니면 null. 날짜가 틀리면 last 없이 돌려준다 */
export function readPrefill(hash: string): { last?: string } | null {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  if (p.get('kind') !== 'loss') return null;
  const d = p.get('last') ?? '';
  return parseYmd(d) ? { last: d } : {};
}

export function nhisLossHref(lastWorkDay: string): string {
  return parseYmd(lastWorkDay) ? `${PATH}#kind=loss&last=${lastWorkDay}` : `${PATH}#kind=loss`;
}
