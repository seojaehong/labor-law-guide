'use client';

// 도구용 도구 — 사업자등록번호로 공단 신고 상시인원을 불러와 각 도구의 인원 칸에 넣는다.
// 쓰는 곳: /duties · /exit-employer · /tools/headcount · /laws 정밀점검 · /tools/holiday-pay
// 화면마다 CSS 가 달라서 색은 공용 변수만 쓴다.

import { useState } from 'react';
import { normalizeBizNo, type LookupFail, type Workplace } from '@/lib/workplace-lookup';
import { OPEN_LABEL, PRIVACY_NOTE, appliedLine, failLine, pickLine, rowLabel } from './biz-no-lookup-copy';

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'fail'; reason: LookupFail | 'invalid' | 'limit' }
  | { kind: 'pick'; rows: Workplace[] }
  | { kind: 'done'; workplace: Workplace };

const box: React.CSSProperties = { border: '1px solid var(--color-border)', borderRadius: 10, padding: '10px 12px', margin: '8px 0 12px' };
const text: React.CSSProperties = { fontSize: 13, lineHeight: 1.6, color: 'var(--grey-700)' };
const ink: React.CSSProperties = { color: 'var(--color-text-primary)' };
const btn: React.CSSProperties = {
  border: '1px solid var(--color-border)', borderRadius: 8, padding: '6px 12px', fontSize: 13,
  background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)', cursor: 'pointer',
};
const solid: React.CSSProperties = { ...btn, background: 'var(--color-text-primary)', color: 'var(--color-bg-primary)', borderColor: 'var(--color-text-primary)' };

export default function BizNoLookup({ onFound }: { onFound: (w: Workplace) => void }) {
  const [open, setOpen] = useState(false);
  const [bizNo, setBizNo] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });

  const apply = (w: Workplace) => {
    setState({ kind: 'done', workplace: w });
    onFound(w);
  };

  const lookup = async () => {
    const n = normalizeBizNo(bizNo);
    if (!n) return setState({ kind: 'fail', reason: 'invalid' });
    setState({ kind: 'loading' });
    try {
      const data = await (await fetch(`/api/tools/workplace?bizNo=${n}`)).json();
      if (!data.ok) return setState({ kind: 'fail', reason: data.reason ?? 'upstream' });
      if (data.rows.length === 1) apply(data.rows[0]);
      else setState({ kind: 'pick', rows: data.rows });
    } catch {
      setState({ kind: 'fail', reason: 'upstream' });
    }
  };

  if (!open) {
    return (
      <button type="button" style={{ ...btn, margin: '6px 0 10px' }} onClick={() => setOpen(true)} data-bizno-open>
        {OPEN_LABEL}
      </button>
    );
  }

  return (
    <div style={box} data-bizno>
      <form style={{ display: 'flex', gap: 6 }} onSubmit={e => { e.preventDefault(); lookup(); }}>
        <input
          aria-label="사업자등록번호" inputMode="numeric" autoComplete="off" placeholder="123-45-67890"
          value={bizNo} onChange={e => setBizNo(e.target.value)}
          style={{ flex: 1, minWidth: 0, border: '1px solid var(--color-border)', borderRadius: 8, padding: '6px 10px', fontSize: 16, background: 'var(--color-bg-primary)', ...ink }}
        />
        <button type="submit" style={solid} disabled={state.kind === 'loading'}>{state.kind === 'loading' ? '불러오는 중' : '불러오기'}</button>
      </form>

      {state.kind === 'fail' && <p style={{ ...text, ...ink, marginTop: 8 }} role="alert">{failLine(state.reason)}</p>}

      {state.kind === 'pick' && (
        <div style={{ marginTop: 8 }}>
          <p style={{ ...text, ...ink }}>{pickLine(state.rows.length)}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
            {state.rows.map((w, i) => (
              <button key={`${w.name}-${i}`} type="button" style={{ ...btn, textAlign: 'left' }} onClick={() => apply(w)}>{rowLabel(w)}</button>
            ))}
          </div>
        </div>
      )}

      {state.kind === 'done' && <p style={{ ...text, marginTop: 8 }} aria-live="polite" data-bizno-applied>{appliedLine(state.workplace)}</p>}

      <p style={{ ...text, fontSize: 12, marginTop: 6 }}>{PRIVACY_NOTE}</p>
    </div>
  );
}
