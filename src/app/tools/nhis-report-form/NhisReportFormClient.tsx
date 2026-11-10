'use client';

// 입력값(주민등록번호 포함)은 이 컴포넌트 안에서만 PDF 로 만든다. 서버로 가는 요청은 지사 찾기(사업장 주소)와 같은 출처 정적 자산뿐이다.
// PDF 엔진(pdf-lib·글꼴·서식 지도)은 「PDF 만들기」를 누를 때 받는다.
import { useEffect, useState } from 'react';
import { MAX_PEOPLE, lossDateOf, parseYmd } from '@/lib/nhis-forms/dates';
import { readPrefill } from '@/lib/nhis-forms/prefill';
import type { AcqPerson, LossPerson, PacketInput } from '@/lib/nhis-forms/build';
import {
  ACQ_CODES, ACQ_NOTE, BIZ_PICK, ATTACH_SIZE, BRANCH_ERROR, BRANCH_LINE, BUTTON, CEO, CHECK_BEFORE, FIELD, INPUT_ERROR, KIND_LABEL,
  LOSS_CODES, LOSS_DATE_LINE, PRIVACY, REASON_COUNT, REASON_MAX, STEP, failLine,
} from './copy';

type Kind = 'loss' | 'acq';
type Ceo = '' | 'yes' | 'no';
interface P { name: string; rrn: string; date: string; code: string; payCur: string; monthsCur: string; payPrev: string; monthsPrev: string; monthly: string; ceo: Ceo }
const blank = (k: Kind): P => ({ name: '', rrn: '', date: '', code: k === 'loss' ? '01' : '00', payCur: '', monthsCur: '', payPrev: '', monthsPrev: '', monthly: '', ceo: '' });
const touched = (p: P) => [p.name, p.rrn, p.date, p.payCur, p.monthsCur, p.payPrev, p.monthsPrev, p.monthly].some(s => s.trim()) || p.ceo !== '';

const small: React.CSSProperties = { fontSize: 13, lineHeight: 1.6, color: 'var(--grey-700)' };
const ink: React.CSSProperties = { color: 'var(--color-text-primary)' };
const card: React.CSSProperties = { border: '1px solid var(--color-border)', borderRadius: 12, padding: '14px 16px', margin: '0 0 14px' };
const inp: React.CSSProperties = { width: '100%', minWidth: 0, border: '1px solid var(--color-border)', borderRadius: 8, padding: '7px 9px', fontSize: 16, background: 'var(--color-bg-primary)', ...ink };
const btn: React.CSSProperties = { border: '1px solid var(--color-border)', borderRadius: 8, padding: '6px 12px', fontSize: 13, background: 'var(--color-bg-primary)', ...ink, cursor: 'pointer' };
const on: React.CSSProperties = { ...btn, background: 'var(--color-text-primary)', color: 'var(--color-bg-primary)', border: '1px solid var(--color-text-primary)' };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 };
const h: React.CSSProperties = { ...ink, fontSize: 15, fontWeight: 700, marginBottom: 8 };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: 'block', ...small }}>{label}{children}</label>;
}

/** 쉼표·공백만 허용한 정수. 빈칸 = undefined, 그 밖의 글자(「250만」 등) = NaN → 오류로 돌린다 */
const num = (s: string): number | undefined => {
  const t = s.replace(/[,\s]/g, '');
  if (!t) return undefined;
  return /^\d+$/.test(t) ? Number(t) : NaN;
};

async function bytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

/** 도장 PNG 를 긴 변 300px 이하로 줄인다(원본 크기 그대로면 PDF 가 EDI 첨부 한도를 넘는다) */
async function shrinkStamp(file: File): Promise<Uint8Array> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 300 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * k));
  c.height = Math.max(1, Math.round(bmp.height * k));
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/png'));
  if (!blob) throw new Error('png');
  return new Uint8Array(await blob.arrayBuffer());
}

export default function NhisReportFormClient() {
  const [kind, setKind] = useState<Kind>('loss');
  const [addr, setAddr] = useState('');
  const [cands, setCands] = useState<string[] | null>(null);
  const [branchStatus, setBranchStatus] = useState<'confirmed' | 'candidates' | 'none' | 'limit' | 'failed' | 'bizNone' | 'bizInvalid' | null>(null);
  const [bizNo, setBizNo] = useState('');
  const [bizPick, setBizPick] = useState<{ name: string; address: string }[] | null>(null);
  const [branch, setBranch] = useState('');
  const [biz, setBiz] = useState({ mgmtNo: '', name: '', ownerName: '', tel: '', fax: '', zip: '' });
  const [people, setPeople] = useState<P[]>([blank('loss')]);
  const [reason, setReason] = useState('');
  const [stamp, setStamp] = useState<Uint8Array | undefined>();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string[] | null>(null);
  const [done, setDone] = useState<number | null>(null);

  const switchKind = (k: Kind) => { setKind(k); setPeople([blank(k)]); setDone(null); setMsg(null); };

  // 퇴사 체크리스트(/exit-employer)에서 넘어오면 종류와 날짜만 채운다
  useEffect(() => {
    const pre = readPrefill(window.location.search);
    if (!pre.kind) return;
    setKind(pre.kind);
    setPeople([{ ...blank(pre.kind), date: pre.last ?? '' }]);
  }, []);
  const setP = (i: number, patch: Partial<P>) => setPeople(ps => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  /** q = address=… 또는 bizNo=… . 사업자번호면 서버가 근복 공개 사업장 주소로 바꿔 찾는다(여럿이면 고를 목록) */
  const lookup = async (q: string) => {
    setCands(null); setBranchStatus(null); setBizPick(null);
    try {
      const res = await fetch(`/api/tools/branch-directory?${q}`);
      if (res.status === 429) { setBranchStatus('limit'); return; }
      const r = await res.json();
      if (res.status === 400 && q.startsWith('bizNo=')) { setBranchStatus('bizInvalid'); return; }
      if (!r.ok && (r.reason === 'none' || r.reason === 'mismatch')) { setBranchStatus('bizNone'); return; }
      if (!res.ok || !r.ok) { setBranchStatus('failed'); return; }
      if (r.pick) { setBizPick(r.pick); return; }
      setAddr(r.address);
      const n: { status: 'confirmed' | 'candidates' | 'none'; candidates: { name: string }[] } = r.result.nhis;
      const names = n.candidates.map(c => c.name);
      setBranchStatus(n.status); setCands(names);
      // 한 곳으로 확정된 경우에만 채운다 — 후보 하나라도 확정이 아니면 사용자가 고른다
      setBranch(n.status === 'confirmed' && names.length === 1 ? names[0] : '');
    } catch {
      setBranchStatus('failed');
    }
  };
  const find = () => { if (addr.trim()) lookup(`address=${encodeURIComponent(addr.trim())}`); };
  const findBiz = () => {
    const d = bizNo.replace(/[\s-]/g, '');
    if (!d) return;
    if (!/^\d{10}$/.test(d)) { setBizPick(null); setCands(null); setBranchStatus('bizInvalid'); return; }
    lookup(`bizNo=${d}`);
  };
  const choose = (w: { name: string; address: string }) => {
    setBiz(b => ({ ...b, name: b.name.trim() ? b.name : w.name }));
    lookup(`address=${encodeURIComponent(w.address)}`);
  };

  /** 화면 값 → 엔진 입력. 화면에서만 알 수 있는 문제(숫자 아닌 글자, 성명 없이 채운 줄, 대표자 여부)는 여기서 잡는다 */
  const collect = (): { input?: PacketInput; problems: string[] } => {
    const problems: string[] = [];
    const rows = people.map((p, i) => ({ p, n: i + 1 })).filter(({ p }) => touched(p));
    rows.forEach(({ p, n }) => { if (!p.name.trim()) problems.push(INPUT_ERROR.noName(n)); });
    const checkNum = (s: string, label: string, n: number) => {
      const v = num(s);
      if (Number.isNaN(v)) problems.push(INPUT_ERROR.number(label, n));
      return v;
    };
    const base = { reason: reason.normalize('NFC').trim(), branchName: branch.trim() || undefined, stamp, biz: { ...biz, addr: addr.trim() } };
    let input: PacketInput;
    if (kind === 'loss') {
      const ps: LossPerson[] = rows.map(({ p, n }) => ({
        name: p.name.trim(), rrn: p.rrn.trim(), lastWorkDay: p.date, nhisCode: p.code,
        payCur: checkNum(p.payCur, FIELD.payCur, n), monthsCur: checkNum(p.monthsCur, FIELD.monthsCur, n),
        payPrev: checkNum(p.payPrev, FIELD.payPrev, n), monthsPrev: checkNum(p.monthsPrev, FIELD.monthsPrev, n),
      }));
      input = { ...base, kind, people: ps };
    } else {
      const ps: AcqPerson[] = rows.map(({ p, n }) => {
        if (p.ceo === '') problems.push(INPUT_ERROR.ceo(n));
        return { name: p.name.trim(), rrn: p.rrn.trim(), acqDate: p.date, nhisCode: p.code, ceo: p.ceo === 'yes', monthlyPay: checkNum(p.monthly, FIELD.monthlyPay, n) ?? 0 };
      });
      input = { ...base, kind, people: ps };
    }
    return problems.length ? { problems } : { input, problems };
  };

  const make = async () => {
    setBusy(true); setMsg(null); setDone(null);
    try {
      const { input, problems } = collect();
      if (!input) { setMsg(problems); return; }
      const { buildPacket, validate, PacketError } = await import('@/lib/nhis-forms/build');
      const bad = validate(input);
      if (bad.length) { setMsg(bad); return; }
      const form = kind === 'loss' ? '/forms/nhis/NHIS_8_LOSS.pdf' : '/forms/nhis/NHIS_6_ACQ.pdf';
      const [formPdf, font] = await Promise.all([bytes(form), bytes('/fonts/llg-forms/LLGFormsSans-Regular.ttf')]);
      try {
        const { bytes: pdf } = await buildPacket({ formPdf, font }, input);
        const url = URL.createObjectURL(new Blob([pdf.slice().buffer], { type: 'application/pdf' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `건강보험_${kind === 'loss' ? '자격상실' : '자격취득'}_신고서_${biz.name.trim() || '사업장'}.pdf`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        setDone(pdf.length);
      } catch (e) {
        if (e instanceof PacketError) setMsg(e.problems);
        else throw e;
      }
    } catch (e) {
      setMsg([failLine(e instanceof Error ? e.message : String(e))]);
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
        <form style={{ display: 'flex', gap: 6, marginBottom: 6 }} onSubmit={e => { e.preventDefault(); findBiz(); }}>
          <input aria-label={FIELD.bizNo} style={{ ...inp, flex: 1 }} value={bizNo} onChange={e => setBizNo(e.target.value)} placeholder="123-45-67890" inputMode="numeric" autoComplete="off" />
          <button type="submit" style={btn}>{BUTTON.findBiz}</button>
        </form>
        {bizPick ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }} data-biz-pick>
            <p style={small}>{BIZ_PICK}</p>
            {bizPick.map((w, i) => <button key={i} type="button" style={{ ...btn, textAlign: 'left' }} onClick={() => choose(w)}>{w.name} · {w.address}</button>)}
          </div>
        ) : null}
        <form style={{ display: 'flex', gap: 6 }} onSubmit={e => { e.preventDefault(); find(); }}>
          <input aria-label={FIELD.addr} style={{ ...inp, flex: 1 }} value={addr} onChange={e => setAddr(e.target.value)} placeholder="예: 충북 청주시 상당구 상당로81번길 63 (서문동)" autoComplete="off" />
          <button type="submit" style={on}>{BUTTON.find}</button>
        </form>
        {branchStatus === 'none' ? <p style={{ ...small, marginTop: 6 }}>{BRANCH_LINE.none}</p> : null}
        {branchStatus === 'candidates' ? <p style={{ ...small, marginTop: 6 }}>{BRANCH_LINE.candidates}</p> : null}
        {branchStatus === 'limit' || branchStatus === 'failed' || branchStatus === 'bizNone' || branchStatus === 'bizInvalid' ? <p style={{ ...small, marginTop: 6 }}>{BRANCH_ERROR[branchStatus]}</p> : null}
        {cands && cands.length && branchStatus === 'candidates' ? (
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
                <>
                  <Field label={FIELD.monthlyPay}><input aria-label={`${FIELD.monthlyPay} ${i + 1}`} style={inp} inputMode="numeric" value={p.monthly} onChange={e => setP(i, { monthly: e.target.value })} /></Field>
                  <Field label={CEO.label}>
                    <select aria-label={`${CEO.label} ${i + 1}`} style={inp} value={p.ceo} onChange={e => setP(i, { ceo: e.target.value as Ceo })}>
                      <option value="">{CEO.pick}</option>
                      <option value="no">{CEO.no}</option>
                      <option value="yes">{CEO.yes}</option>
                    </select>
                  </Field>
                </>
              )}
            </div>
            {kind === 'loss' && parseYmd(p.date) ? <p style={{ ...small, marginTop: 4 }} data-loss-date>{LOSS_DATE_LINE(lossDateOf(p.date).replace(/-/g, '.'))}</p> : null}
            {people.length > 1 ? <button type="button" style={{ ...btn, marginTop: 6 }} onClick={() => setPeople(ps => ps.filter((_, j) => j !== i))}>{BUTTON.remove}</button> : null}
          </div>
        ))}
        {people.length < MAX_PEOPLE ? <button type="button" style={{ ...btn, marginTop: 10 }} onClick={() => setPeople(ps => [...ps, blank(kind)])}>{BUTTON.add}</button> : null}
      </section>

      <section style={card}>
        <h2 style={h}>{STEP.reason}</h2>
        <textarea aria-label={FIELD.reason} style={{ ...inp, minHeight: 80 }} maxLength={REASON_MAX} value={reason} onChange={e => setReason(e.target.value)} />
        <p style={{ ...small, fontSize: 12, textAlign: 'right' }}>{REASON_COUNT(reason.length)}</p>
      </section>

      <section style={card}>
        <h2 style={h}>{STEP.stamp}</h2>
        <input aria-label={FIELD.stamp} type="file" accept="image/png" onChange={async e => {
          const f = e.target.files?.[0];
          if (!f) { setStamp(undefined); return; }
          try { setStamp(await shrinkStamp(f)); } catch { setStamp(undefined); setMsg([INPUT_ERROR.stamp]); }
        }} />
      </section>

      <button type="button" style={{ ...on, padding: '10px 18px', fontSize: 15 }} disabled={busy} onClick={make}>{busy ? BUTTON.making : BUTTON.make}</button>
      <section aria-live="polite" style={{ marginTop: 10 }} data-result>
        {msg ? <div role="alert" style={{ ...small, ...ink }}>{msg.map(m => <p key={m}>{m}</p>)}</div> : null}
        {done !== null ? <><p style={{ ...small, ...ink }}>{ATTACH_SIZE(done)}</p><p style={small}>{CHECK_BEFORE}</p></> : null}
      </section>
    </div>
  );
}
