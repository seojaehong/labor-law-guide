'use client';

// 입력값(주민등록번호 포함)은 이 컴포넌트 안에서만 PDF 로 만든다. 서버로 가는 요청은 지사 찾기(사업장 주소)와 같은 출처 정적 자산뿐이다.
import { useState } from 'react';
import { buildPacket, lossDateOf, type AcqPerson, type LossPerson } from '@/lib/nhis-forms/build';
import {
  ACQ_CODES, ACQ_NOTE, ATTACH_SIZE, BRANCH_LINE, BUTTON, CHECK_BEFORE, FIELD, KIND_LABEL, LOSS_CODES,
  LOSS_DATE_LINE, PRIVACY, STEP, failLine,
} from './copy';

type Kind = 'loss' | 'acq';
interface P { name: string; rrn: string; date: string; code: string; payCur: string; monthsCur: string; payPrev: string; monthsPrev: string; monthly: string }
const blank = (k: Kind): P => ({ name: '', rrn: '', date: '', code: k === 'loss' ? '01' : '00', payCur: '', monthsCur: '', payPrev: '', monthsPrev: '', monthly: '' });

const small: React.CSSProperties = { fontSize: 13, lineHeight: 1.6, color: 'var(--grey-700)' };
const ink: React.CSSProperties = { color: 'var(--color-text-primary)' };
const card: React.CSSProperties = { border: '1px solid var(--color-border)', borderRadius: 12, padding: '14px 16px', margin: '0 0 14px' };
const inp: React.CSSProperties = { width: '100%', minWidth: 0, border: '1px solid var(--color-border)', borderRadius: 8, padding: '7px 9px', fontSize: 16, background: 'var(--color-bg-primary)', ...ink };
const btn: React.CSSProperties = { border: '1px solid var(--color-border)', borderRadius: 8, padding: '6px 12px', fontSize: 13, background: 'var(--color-bg-primary)', ...ink, cursor: 'pointer' };
const on: React.CSSProperties = { ...btn, background: 'var(--color-text-primary)', color: 'var(--color-bg-primary)', borderColor: 'var(--color-text-primary)' };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 };
const h: React.CSSProperties = { ...ink, fontSize: 15, fontWeight: 700, marginBottom: 8 };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: 'block', ...small }}>{label}{children}</label>;
}
const num = (s: string) => (s.replace(/[^0-9]/g, '') === '' ? undefined : Number(s.replace(/[^0-9]/g, '')));
const bytes = async (url: string) => new Uint8Array(await (await fetch(url)).arrayBuffer());

export default function NhisReportFormClient() {
  const [kind, setKind] = useState<Kind>('loss');
  const [addr, setAddr] = useState('');
  const [cands, setCands] = useState<string[] | null>(null);
  const [branchStatus, setBranchStatus] = useState<'confirmed' | 'candidates' | 'none' | null>(null);
  const [branch, setBranch] = useState('');
  const [biz, setBiz] = useState({ mgmtNo: '', name: '', ownerName: '', tel: '', fax: '', zip: '' });
  const [people, setPeople] = useState<P[]>([blank('loss')]);
  const [reason, setReason] = useState('');
  const [stamp, setStamp] = useState<Uint8Array | undefined>();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  const switchKind = (k: Kind) => { setKind(k); setPeople([blank(k)]); setDone(null); };
  const setP = (i: number, patch: Partial<P>) => setPeople(ps => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  const find = async () => {
    if (!addr.trim()) return;
    setCands(null); setBranchStatus(null);
    try {
      const r = await (await fetch(`/api/tools/branch-directory?address=${encodeURIComponent(addr.trim())}`)).json();
      const n = r.ok ? r.result.nhis : { status: 'none', candidates: [] };
      const names: string[] = n.candidates.map((c: { name: string }) => c.name);
      setBranchStatus(n.status); setCands(names); setBranch(names.length === 1 ? names[0] : '');
    } catch {
      setBranchStatus('none'); setCands([]);
    }
  };

  const make = async () => {
    setBusy(true); setMsg(null); setDone(null);
    try {
      const [lossPdf, acqPdf, font] = await Promise.all([
        bytes('/forms/nhis/NHIS_8_LOSS.pdf'), bytes('/forms/nhis/NHIS_6_ACQ.pdf'), bytes('/fonts/llg-forms/LLGFormsSans-Regular.ttf'),
      ]);
      const list = people.filter(p => p.name.trim());
      const ps: LossPerson[] | AcqPerson[] = kind === 'loss'
        ? list.map(p => ({ name: p.name.trim(), rrn: p.rrn.trim(), lastWorkDay: p.date, nhisCode: p.code, payCur: num(p.payCur), monthsCur: num(p.monthsCur), payPrev: num(p.payPrev), monthsPrev: num(p.monthsPrev) }))
        : list.map(p => ({ name: p.name.trim(), rrn: p.rrn.trim(), acqDate: p.date, nhisCode: p.code, monthlyPay: num(p.monthly) ?? 0 }));
      const { bytes: pdf } = await buildPacket({ lossPdf, acqPdf, font }, {
        kind, people: ps, reason: reason.trim(), branchName: branch.trim() || undefined, stamp,
        biz: { ...biz, addr: addr.trim() },
      });
      const url = URL.createObjectURL(new Blob([pdf.slice().buffer], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `건강보험_${kind === 'loss' ? '자격상실' : '자격취득'}_신고서_${biz.name || '사업장'}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setDone(Math.round(pdf.length / 1024));
    } catch (e) {
      setMsg(failLine(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-nhis-report-form>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {(['loss', 'acq'] as const).map(k => <button key={k} type="button" style={kind === k ? on : btn} onClick={() => switchKind(k)}>{KIND_LABEL[k]}</button>)}
      </div>
      <p style={{ ...small, fontSize: 12, marginBottom: 12 }}>{PRIVACY}</p>

      <section style={card} data-step="branch">
        <h2 style={h}>{STEP.branch}</h2>
        <form style={{ display: 'flex', gap: 6 }} onSubmit={e => { e.preventDefault(); find(); }}>
          <input aria-label={FIELD.addr} style={{ ...inp, flex: 1 }} value={addr} onChange={e => setAddr(e.target.value)} placeholder="예: 충북 청주시 상당구 상당로81번길 63 (서문동)" autoComplete="off" />
          <button type="submit" style={on}>{BUTTON.find}</button>
        </form>
        {branchStatus === 'none' ? <p style={{ ...small, marginTop: 6 }}>{BRANCH_LINE.none}</p> : null}
        {branchStatus === 'candidates' ? <p style={{ ...small, marginTop: 6 }}>{BRANCH_LINE.candidates}</p> : null}
        {cands && cands.length > 1 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {cands.map(c => <button key={c} type="button" style={branch === c ? on : btn} onClick={() => setBranch(c)}>{c}</button>)}
          </div>
        ) : null}
        <div style={{ marginTop: 8 }}>
          <Field label={BRANCH_LINE.manual}><input aria-label={BRANCH_LINE.manual} style={inp} value={branch} onChange={e => setBranch(e.target.value)} data-branch-name /></Field>
        </div>
        <p style={{ ...small, fontSize: 12, marginTop: 6 }}>{BRANCH_LINE.notice}</p>
      </section>

      <section style={card}>
        <h2 style={h}>{STEP.biz}</h2>
        <div style={grid}>
          {(['mgmtNo', 'name', 'ownerName', 'tel', 'fax', 'zip'] as const).map(k => {
            const label = k === 'name' ? FIELD.bizName : k === 'ownerName' ? FIELD.owner : FIELD[k];
            return <Field key={k} label={label}><input aria-label={label} style={inp} value={biz[k]} onChange={e => setBiz({ ...biz, [k]: e.target.value })} autoComplete="off" /></Field>;
          })}
        </div>
      </section>

      <section style={card}>
        <h2 style={h}>{STEP.people}</h2>
        {kind === 'acq' ? <p style={{ ...small, marginBottom: 8 }}>{ACQ_NOTE}</p> : null}
        {people.map((p, i) => (
          <div key={i} style={{ borderTop: i ? '1px solid var(--color-border)' : undefined, paddingTop: i ? 10 : 0, marginTop: i ? 10 : 0 }} data-person={i + 1}>
            <div style={grid}>
              <Field label={FIELD.name}><input aria-label={`${FIELD.name} ${i + 1}`} style={inp} value={p.name} onChange={e => setP(i, { name: e.target.value })} autoComplete="off" /></Field>
              <Field label={FIELD.rrn}><input aria-label={`${FIELD.rrn} ${i + 1}`} style={inp} value={p.rrn} onChange={e => setP(i, { rrn: e.target.value })} autoComplete="off" inputMode="numeric" /></Field>
              <Field label={kind === 'loss' ? FIELD.lastWorkDay : FIELD.acqDate}>
                <input aria-label={`${kind === 'loss' ? FIELD.lastWorkDay : FIELD.acqDate} ${i + 1}`} type="date" style={inp} value={p.date} onChange={e => setP(i, { date: e.target.value })} />
              </Field>
              <Field label={kind === 'loss' ? FIELD.nhisLossCode : FIELD.nhisAcqCode}>
                <select aria-label={`${kind === 'loss' ? FIELD.nhisLossCode : FIELD.nhisAcqCode} ${i + 1}`} style={inp} value={p.code} onChange={e => setP(i, { code: e.target.value })}>
                  {(kind === 'loss' ? LOSS_CODES : ACQ_CODES).map(c => <option key={c.v} value={c.v}>{c.label}</option>)}
                </select>
              </Field>
              {kind === 'loss' ? (
                (['payCur', 'monthsCur', 'payPrev', 'monthsPrev'] as const).map(k => (
                  <Field key={k} label={FIELD[k]}><input aria-label={`${FIELD[k]} ${i + 1}`} style={inp} inputMode="numeric" value={p[k]} onChange={e => setP(i, { [k]: e.target.value })} /></Field>
                ))
              ) : (
                <Field label={FIELD.monthlyPay}><input aria-label={`${FIELD.monthlyPay} ${i + 1}`} style={inp} inputMode="numeric" value={p.monthly} onChange={e => setP(i, { monthly: e.target.value })} /></Field>
              )}
            </div>
            {kind === 'loss' && /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? <p style={{ ...small, marginTop: 4 }} data-loss-date>{LOSS_DATE_LINE(lossDateOf(p.date).replace(/-/g, '.'))}</p> : null}
            {people.length > 1 ? <button type="button" style={{ ...btn, marginTop: 6 }} onClick={() => setPeople(ps => ps.filter((_, j) => j !== i))}>{BUTTON.remove}</button> : null}
          </div>
        ))}
        {people.length < 4 ? <button type="button" style={{ ...btn, marginTop: 10 }} onClick={() => setPeople(ps => [...ps, blank(kind)])}>{BUTTON.add}</button> : null}
      </section>

      <section style={card}>
        <h2 style={h}>{STEP.reason}</h2>
        <textarea aria-label={FIELD.reason} style={{ ...inp, minHeight: 80 }} value={reason} onChange={e => setReason(e.target.value)} />
      </section>

      <section style={card}>
        <h2 style={h}>{STEP.stamp}</h2>
        <input aria-label={FIELD.stamp} type="file" accept="image/png" onChange={async e => {
          const f = e.target.files?.[0];
          setStamp(f ? new Uint8Array(await f.arrayBuffer()) : undefined);
        }} />
      </section>

      <button type="button" style={{ ...on, padding: '10px 18px', fontSize: 15 }} disabled={busy} onClick={make}>{busy ? BUTTON.making : BUTTON.make}</button>
      <section aria-live="polite" style={{ marginTop: 10 }} data-result>
        {msg ? <p role="alert" style={{ ...small, ...ink }}>{msg}</p> : null}
        {done !== null ? <><p style={{ ...small, ...ink }}>{ATTACH_SIZE(done)}</p><p style={small}>{CHECK_BEFORE}</p></> : null}
      </section>
    </div>
  );
}
