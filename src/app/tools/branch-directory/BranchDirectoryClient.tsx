'use client';

import { useState } from 'react';
import {
  ADDR_TIP, AGENCY_LABEL, FILTERS, HIT_LABEL, INPUT_LABEL, MO_LABEL, PLACEHOLDER, PRIVACY, SHOW_ALL,
  SOURCE_LABEL, STATUS_LINE, failLine, noticeLines,
} from './copy';

type Key = 'comwel' | 'nhis' | 'nps';
interface Row { dept: string; pos: string; work: string; mid: string; tel: string; fax: string; sub: string; table: string; hit: boolean }
interface Cand { code: string; name: string; hq: string; addr: string; juris: string; src: string; mo: string; rows: Row[] }
interface AgencyResult { status: 'confirmed' | 'candidates' | 'none'; candidates: Cand[] }
interface Found { address: string; result: Record<Key, AgencyResult>; dates: Record<Key, string> }

const ORDER: Key[] = ['comwel', 'nhis', 'nps'];
const LIMIT = 12;

const card: React.CSSProperties = { border: '1px solid var(--color-border)', borderRadius: 12, padding: '14px 16px', margin: '0 0 16px' };
const small: React.CSSProperties = { fontSize: 13, lineHeight: 1.6, color: 'var(--grey-700)' };
const ink: React.CSSProperties = { color: 'var(--color-text-primary)' };
const btn: React.CSSProperties = {
  border: '1px solid var(--color-border)', borderRadius: 8, padding: '6px 12px', fontSize: 13,
  background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)', cursor: 'pointer',
};
const on: React.CSSProperties = { ...btn, background: 'var(--color-text-primary)', color: 'var(--color-bg-primary)', borderColor: 'var(--color-text-primary)' };

function Phones({ v }: { v: string }) {
  const nums = v.match(/\d{2,4}-\d{3,4}-\d{4}|1[0-9]{3}-\d{4}/g);
  if (!nums) return <>{v}</>;
  return <>{nums.map((n, i) => <a key={i} href={`tel:${n}`} className="underline underline-offset-2" style={{ display: 'block', whiteSpace: 'nowrap' }}>{n}</a>)}</>;
}

function Branch({ c }: { c: Cand }) {
  const [filter, setFilter] = useState<string>('all');
  const [all, setAll] = useState(false);
  const re = FILTERS.find(f => f.id === filter)?.re ?? null;
  const rows = c.rows.filter(r => r.hit || !re || re.test(`${r.dept} ${r.mid} ${r.work}`));
  const shown = all ? rows : rows.slice(0, LIMIT);
  return (
    <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 10, marginTop: 10 }} data-branch={c.code}>
      <p style={{ ...ink, fontWeight: 600, fontSize: 15 }}>{c.name}{c.hq ? <span style={small}> · {c.hq}</span> : null}</p>
      <p style={small}>관할: <span data-official>{c.juris}</span></p>
      <p style={small} data-official>{c.addr}</p>
      {c.mo ? <p style={small}>{MO_LABEL}: <span data-official>{c.mo}</span></p> : null}
      <p style={small}><a href={c.src} target="_blank" rel="noreferrer" className="underline underline-offset-2">{SOURCE_LABEL}</a></p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '10px 0 6px' }}>
        {FILTERS.map(f => <button key={f.id} type="button" style={filter === f.id ? on : btn} onClick={() => setFilter(f.id)}>{f.label}</button>)}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ ...small, textAlign: 'left' }}>
              <th style={{ padding: '4px 6px', minWidth: 72 }}>부서</th>
              <th style={{ padding: '4px 6px' }}>담당업무</th>
              <th style={{ padding: '4px 6px', minWidth: 104 }}>전화</th>
              <th style={{ padding: '4px 6px', minWidth: 104 }}>팩스</th>
            </tr>
          </thead>
          <tbody data-official>
            {shown.map((r, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--color-border)', background: r.hit ? 'var(--color-bg-secondary, rgba(0,0,0,0.04))' : undefined }} data-hit={r.hit ? '1' : undefined}>
                <td style={{ padding: '6px', verticalAlign: 'top', ...ink }}>{r.sub ? `${r.sub} ` : ''}{r.dept}{r.pos ? ` ${r.pos}` : ''}</td>
                <td style={{ padding: '6px', verticalAlign: 'top', ...ink }}>
                  {r.hit ? <span style={{ ...small, fontWeight: 600, display: 'block' }}>{HIT_LABEL}</span> : null}
                  {r.mid ? <span style={small}>[{r.mid}] </span> : null}{r.work}
                </td>
                <td style={{ padding: '6px', verticalAlign: 'top', ...ink }}><Phones v={r.tel} /></td>
                <td style={{ padding: '6px', verticalAlign: 'top', ...small }}>{r.fax}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!all && rows.length > LIMIT ? <button type="button" style={{ ...btn, marginTop: 8 }} onClick={() => setAll(true)}>{SHOW_ALL(rows.length)}</button> : null}
    </div>
  );
}

export default function BranchDirectoryClient() {
  const [mode, setMode] = useState<'biz' | 'addr'>('addr');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<string | null>(null);
  const [pick, setPick] = useState<{ name: string; address: string }[] | null>(null);
  const [found, setFound] = useState<Found | null>(null);

  const run = async (q: string) => {
    setBusy(true); setFail(null); setPick(null); setFound(null);
    try {
      const res = await (await fetch(`/api/tools/branch-directory?${q}`)).json();
      if (!res.ok) setFail(failLine(res.reason));
      else if (res.pick) setPick(res.pick);
      else setFound(res);
    } catch {
      setFail(failLine('upstream'));
    } finally {
      setBusy(false);
    }
  };
  const submit = () => {
    const v = value.trim();
    if (!v) return;
    run(mode === 'biz' ? `bizNo=${encodeURIComponent(v)}` : `address=${encodeURIComponent(v)}`);
  };

  return (
    <div data-branch-directory>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {(['addr', 'biz'] as const).map(m => (
          <button key={m} type="button" style={mode === m ? on : btn} onClick={() => { setMode(m); setValue(''); }}>{INPUT_LABEL[m]}</button>
        ))}
      </div>
      <form style={{ display: 'flex', gap: 6 }} onSubmit={e => { e.preventDefault(); submit(); }}>
        <input
          aria-label={INPUT_LABEL[mode]} inputMode={mode === 'biz' ? 'numeric' : 'text'} autoComplete="off"
          placeholder={PLACEHOLDER[mode]} value={value} onChange={e => setValue(e.target.value)}
          style={{ flex: 1, minWidth: 0, border: '1px solid var(--color-border)', borderRadius: 8, padding: '8px 10px', fontSize: 16, background: 'var(--color-bg-primary)', ...ink }}
        />
        <button type="submit" style={on} disabled={busy}>{busy ? '찾는 중' : '찾기'}</button>
      </form>
      <p style={{ ...small, fontSize: 12, marginTop: 6 }}>{mode === 'addr' ? `${ADDR_TIP} ` : ''}{PRIVACY}</p>

      {fail ? <p style={{ ...small, ...ink, marginTop: 12 }} role="alert">{fail}</p> : null}

      {pick ? (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {pick.map((p, i) => <button key={i} type="button" style={{ ...btn, textAlign: 'left' }} onClick={() => run(`address=${encodeURIComponent(p.address)}`)}>{p.name} · {p.address}</button>)}
        </div>
      ) : null}

      {found ? (
        <div style={{ marginTop: 16 }} aria-live="polite">
          <div style={{ ...card, borderColor: 'var(--color-text-primary)' }} data-notice>
            {noticeLines(found.dates).map((l, i) => <p key={i} style={{ ...small, ...ink, marginTop: i ? 6 : 0 }}>{l}</p>)}
          </div>
          <p style={{ ...small, marginBottom: 12 }}>주소: {found.address}</p>
          {ORDER.map(k => {
            const r = found.result[k];
            return (
              <section key={k} style={card} data-agency={k} data-status={r.status}>
                <h2 style={{ ...ink, fontSize: 16, fontWeight: 700 }}>{AGENCY_LABEL[k]}</h2>
                <p style={{ ...small, ...ink, marginTop: 4 }}>
                  {r.status === 'confirmed' ? STATUS_LINE.confirmed : r.status === 'candidates' ? STATUS_LINE.candidates(r.candidates.length) : STATUS_LINE.none}
                </p>
                {r.candidates.map(c => <Branch key={c.code} c={c} />)}
              </section>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
