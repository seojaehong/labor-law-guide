'use client';
// 계산한 값을 크롬 확장(extensions/work24-fill)으로 넘긴다 — 확장이 사용자 브라우저의 고용24 확인서 화면에서 칸에 넣는다.
// 넘기는 값 = 기간·주 소정근로시간·통상임금·월 소정근로시간(주민등록번호 없음). 서버로 보내지 않는다(같은 창 postMessage).
import { useEffect, useState } from 'react';
import { inputCls, muted, small } from '@/lib/tool-kit';
import { childcareReductionFillPlan } from '@/lib/gov-fill/work24';
import type { FormState } from './result';

export const HANDOFF_COPY = {
  summary: '고용24 확인서에 넣기(크롬 확장 시험판)',
  lead: '사업주가 고용24에서 쓰는 「육아기 근로시간 단축 확인서」 칸에 이 값을 넣습니다. 고용24 로그인은 본인 브라우저에서 직접 하고, 저장·신청도 직접 누릅니다.',
  monthlyHours: '산정기준 단위기간의 월 소정근로시간(근로계약서·취업규칙의 값, 시간)',
  button: '확장으로 보내기',
  noExtension: '크롬 확장 「일의 무늬 — 고용24 확인서 채우기」가 설치돼 있지 않습니다.',
  sent: '보냈습니다. 고용24에서 육아기 근로시간 단축 확인서 화면을 열면 오른쪽 아래에 넣을 값과 「칸에 넣기」 버튼이 보입니다(30분 안에).',
  failed: '확장이 값을 받지 못했습니다. 확장을 다시 켠 뒤 시도해 주세요.',
};

const todayKst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

export default function Work24Handoff({ f }: { f: FormState }) {
  const [monthlyHours, setMonthlyHours] = useState('');
  const [state, setState] = useState<'' | 'sent' | 'failed' | 'none'>('');
  const plan = childcareReductionFillPlan(
    { start: f.start, end: f.end, weeklyBefore: f.before, weeklyAfter: f.after, ordinaryWage: f.wage, monthlyHours },
    todayKst(),
  );

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (ev.source === window && ev.origin === window.location.origin && ev.data?.type === 'llg-gov-fill-ack') setState(ev.data.ok ? 'sent' : 'failed');
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const send = () => {
    if (document.documentElement.dataset.llgGovFill !== '1') return setState('none');
    setState('');
    window.postMessage({ type: 'llg-gov-fill', version: 1, target: 'work24-childcare-reduction', steps: plan.steps }, window.location.origin);
  };

  return (
    <div className="space-y-3">
      <p className={small} style={muted}>{HANDOFF_COPY.lead}</p>
      <label className={small} style={muted}>
        {HANDOFF_COPY.monthlyHours}
        <input inputMode="decimal" className={inputCls} value={monthlyHours} onChange={(e) => setMonthlyHours(e.target.value)} />
      </label>
      {plan.problems.length > 0 && (
        <ul className={`${small} list-disc space-y-1 pl-5`} style={muted}>
          {plan.problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
      <button type="button" disabled={plan.steps.length === 0} onClick={send}
        className="min-h-11 rounded-md border px-4 disabled:opacity-50">
        {HANDOFF_COPY.button}
      </button>
      <p className={small} aria-live="polite">
        {state === 'sent' ? HANDOFF_COPY.sent : state === 'failed' ? HANDOFF_COPY.failed : state === 'none' ? HANDOFF_COPY.noExtension : ''}
      </p>
    </div>
  );
}
