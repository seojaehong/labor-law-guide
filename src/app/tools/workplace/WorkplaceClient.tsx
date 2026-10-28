'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { TIERS } from '@/content/duties-data';
import { normalizeBizNo, profileFor, type LookupFail, type Workplace } from '@/lib/workplace-lookup';
import { HEADCOUNT_LINK, PRIVACY_NOTE, SOURCE_NOTE, failLine, freshTitle, headline, nextLine, pickLine, workplaceMeta } from './copy';

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'fail'; reason: LookupFail | 'invalid' | 'limit' }
  | { kind: 'found'; rows: Workplace[]; picked: number | null };

const card = 'rounded-xl border border-[var(--color-border)] p-4 sm:p-5';
const inputCls =
  'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-base focus:border-[var(--color-accent)] focus:outline-none';
const small = 'text-sm leading-relaxed';
const muted = { color: 'var(--grey-700)' };
const ink = { color: 'var(--color-text-primary)' };
const solid = { backgroundColor: 'var(--color-text-primary)', color: 'var(--color-bg-primary)' };

function ProfileCard({ headcount, workplace }: { headcount: number; workplace?: Workplace }) {
  const p = profileFor(headcount);
  const next = nextLine(p);
  const fresh = freshTitle(p);
  return (
    <section aria-live="polite" className={card}>
      {workplace && (
        <div className="mb-3">
          <div className="text-base font-semibold" style={ink}>{workplace.name}</div>
          <div className={small} style={muted}>{workplaceMeta(workplace)}</div>
          <div className="text-xs" style={muted}>{workplace.address}</div>
        </div>
      )}
      <p className="text-lg font-semibold leading-snug" style={ink}>{headline(p)}</p>

      <ol className="mt-4 grid grid-cols-5 gap-1" aria-label="규모 구간">
        {TIERS.map(t => {
          const on = t.min === p.tier;
          return (
            <li key={t.min} className="rounded-md border border-[var(--color-border)] px-1 py-2 text-center text-xs font-semibold"
              style={on ? solid : muted} aria-current={on ? 'true' : undefined}>
              {t.label}
            </li>
          );
        })}
      </ol>
      {next && <p className={`${small} mt-3`} style={ink}>{next}</p>}

      {fresh && (
        <div className="mt-4">
          <div className="text-sm font-semibold" style={ink}>{fresh}</div>
          <ul className="mt-1 space-y-1">
            {p.fresh.map(d => (
              <li key={d.id} className={small} style={muted}>· {d.title} <span className="text-xs">({d.basis})</span></li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Link href={`/duties?size=${p.tier}`} className="rounded-lg px-4 py-2.5 text-center text-sm font-semibold" style={solid}>
          이 규모 의무 {p.total}가지 전부 보기
        </Link>
        <Link href="/tools/headcount" className="rounded-lg border border-[var(--color-border)] px-4 py-2.5 text-center text-sm" style={ink}>
          {HEADCOUNT_LINK}
        </Link>
      </div>
      <p className="mt-4 text-xs leading-relaxed" style={muted}>{SOURCE_NOTE}</p>
    </section>
  );
}

export default function WorkplaceClient() {
  const [bizNo, setBizNo] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [manual, setManual] = useState('');

  const lookup = async () => {
    const n = normalizeBizNo(bizNo);
    if (!n) return setState({ kind: 'fail', reason: 'invalid' });
    setState({ kind: 'loading' });
    try {
      const res = await fetch(`/api/tools/workplace?bizNo=${n}`);
      const data = await res.json();
      if (data.ok) setState({ kind: 'found', rows: data.rows, picked: data.rows.length === 1 ? 0 : null });
      else setState({ kind: 'fail', reason: data.reason ?? 'upstream' });
    } catch {
      setState({ kind: 'fail', reason: 'upstream' });
    }
  };

  const manualCount = useMemo(() => {
    const n = Number(manual);
    return manual !== '' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
  }, [manual]);

  return (
    <div className="space-y-4">
      <form className={card} onSubmit={e => { e.preventDefault(); lookup(); }}>
        <label htmlFor="bizno" className="text-sm font-semibold" style={ink}>사업자등록번호</label>
        <div className="mt-2 flex gap-2">
          <input id="bizno" inputMode="numeric" autoComplete="off" placeholder="123-45-67890" className={inputCls}
            value={bizNo} onChange={e => setBizNo(e.target.value)} />
          <button type="submit" disabled={state.kind === 'loading'} className="shrink-0 rounded-lg px-5 text-sm font-semibold" style={solid}>
            {state.kind === 'loading' ? '조회 중' : '조회'}
          </button>
        </div>
        <p className="mt-2 text-xs" style={muted}>{PRIVACY_NOTE}</p>
      </form>

      {state.kind === 'fail' && (
        <p className={`${small} rounded-lg bg-[var(--grey-100)] p-3`} style={ink}>
          {state.reason === 'limit' ? '오늘 조회 횟수를 넘었습니다. 아래에서 인원을 직접 골라 보세요.' : failLine(state.reason)}
        </p>
      )}

      {state.kind === 'found' && state.rows.length > 1 && (
        <div className={card}>
          <p className={small} style={ink}>{pickLine(state.rows.length)}</p>
          <ul className="mt-2 space-y-1">
            {state.rows.map((w, i) => (
              <li key={`${w.name}-${i}`}>
                <button type="button" aria-pressed={state.picked === i}
                  className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-left text-sm"
                  style={state.picked === i ? solid : ink}
                  onClick={() => setState({ ...state, picked: i })}>
                  {w.name} · 상시 {w.headcount.toLocaleString('ko-KR')}명
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.kind === 'found' && state.picked !== null && (
        <ProfileCard headcount={state.rows[state.picked].headcount} workplace={state.rows[state.picked]} />
      )}

      <details className={card} open={state.kind === 'fail'}>
        <summary className="cursor-pointer text-sm font-semibold" style={ink}>인원을 직접 넣어 보기</summary>
        <div className="mt-3 flex items-center gap-2">
          <input type="number" min={0} inputMode="numeric" aria-label="상시 근로자 수" className={`${inputCls} max-w-[8rem]`}
            value={manual} onChange={e => setManual(e.target.value)} />
          <span className={small} style={muted}>명</span>
        </div>
        {manualCount !== null && <div className="mt-3"><ProfileCard headcount={manualCount} /></div>}
      </details>
    </div>
  );
}
