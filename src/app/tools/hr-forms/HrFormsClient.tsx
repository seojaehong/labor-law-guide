'use client';

// 입력값은 이 컴포넌트 안에서만 한글(hwpx) 파일로 만든다. 서버로 보내는 요청은 없다.
// 한글 엔진(md-hwpx)은 「내려받기」를 누를 때 불러온다.
import { useMemo, useState } from 'react';
import { buildForm, FormError, HR_FORMS, review, type FormField, type Values } from '@/lib/hr-forms';
import { AI_LINE, BUTTON, DONE, FAIL, NOTES_FOOT, NOTES_HEAD, PRIVACY, PROBLEMS_HEAD, REQUIRED_MARK, STEP, WRITER } from './copy';

const small: React.CSSProperties = { fontSize: 13, lineHeight: 1.6, color: 'var(--grey-700)' };
const ink: React.CSSProperties = { color: 'var(--color-text-primary)' };
const card: React.CSSProperties = { border: '1px solid var(--color-border)', borderRadius: 12, padding: '14px 16px', margin: '0 0 14px' };
const inp: React.CSSProperties = { width: '100%', minWidth: 0, boxSizing: 'border-box', border: '1px solid var(--color-border)', borderRadius: 8, padding: '7px 9px', fontSize: 16, background: 'var(--color-bg-primary)', ...ink };
const btn: React.CSSProperties = { border: '1px solid var(--color-border)', borderRadius: 8, padding: '6px 12px', fontSize: 13, background: 'var(--color-bg-primary)', ...ink, cursor: 'pointer' };
const on: React.CSSProperties = { ...btn, background: 'var(--color-text-primary)', color: 'var(--color-bg-primary)', border: '1px solid var(--color-text-primary)' };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 };
const h: React.CSSProperties = { ...ink, fontSize: 15, fontWeight: 700, marginBottom: 8 };

const isReq = (f: FormField, v: Values) => (typeof f.required === 'function' ? f.required(v) : !!f.required);

function Input({ f, value, set }: { f: FormField; value: string; set: (s: string) => void }) {
  if (f.type === 'choice')
    return (
      <select style={inp} value={value} onChange={(e) => set(e.target.value)}>
        <option value="">선택</option>
        {f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  if (f.type === 'multiline') return <textarea style={{ ...inp, minHeight: 72 }} value={value} maxLength={f.max} onChange={(e) => set(e.target.value)} />;
  return <input style={inp} type={f.type === 'date' ? 'date' : 'text'} value={value} maxLength={f.max} onChange={(e) => set(e.target.value)} />;
}

export default function HrFormsClient() {
  const [id, setId] = useState(HR_FORMS[0].id);
  const [all, setAll] = useState<Record<string, Values>>({});
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const form = HR_FORMS.find((f) => f.id === id)!;
  const v = useMemo(() => all[id] ?? {}, [all, id]);
  const set = (k: string, s: string) => {
    setAll((a) => ({ ...a, [id]: { ...(a[id] ?? {}), [k]: s } }));
    setMsg('');
  };
  const r = useMemo(() => review(form, v), [form, v]);
  const touched = Object.values(v).some((s) => s.trim());

  async function make() {
    setTried(true);
    if (r.problems.length) return;
    setBusy(true);
    try {
      const b = await buildForm(id, v);
      const who = (v.name || v.employee || '').trim();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([b.hwpx.slice().buffer], { type: 'application/hwp+zip' }));
      a.download = `${b.title}${who ? `_${who}` : ''}.hwpx`.replace(/[\\/:*?"<>|]/g, '_');
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      setMsg(DONE);
    } catch (e) {
      setMsg(e instanceof FormError ? e.problems.join(' ') : FAIL);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <section style={card}>
        <div style={h}>{STEP.pick}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {HR_FORMS.map((f) => (
            <button key={f.id} type="button" style={f.id === id ? on : btn} aria-pressed={f.id === id} onClick={() => { setId(f.id); setTried(false); setMsg(''); }}>
              {f.title}
            </button>
          ))}
        </div>
        <p style={{ ...small, margin: '10px 0 0' }}>{WRITER[form.writer]} · {form.summary}</p>
        <p style={{ ...small, margin: '4px 0 0' }}>근거: {form.basis.join(' · ')}</p>
      </section>

      <section style={card}>
        <div style={h}>{STEP.fill}</div>
        <div style={grid}>
          {form.fields.map((f) => (
            <label key={f.key} style={{ display: 'block', ...small, ...(f.type === 'multiline' ? { gridColumn: '1 / -1' } : {}) }}>
              {f.label} {isReq(f, v) && <span style={{ color: 'var(--color-danger, #c0392b)' }}>{REQUIRED_MARK}</span>}
              <Input f={f} value={v[f.key] ?? ''} set={(s) => set(f.key, s)} />
              {f.help && <span style={{ fontSize: 12 }}>{f.help}</span>}
            </label>
          ))}
        </div>
        <p style={{ ...small, margin: '10px 0 0' }}>{PRIVACY}</p>
      </section>

      <section style={card}>
        <div style={h}>{STEP.check}</div>
        {(tried || touched) && r.problems.length > 0 && (tried || r.problems.length < form.fields.length) && (
          <div role="alert" style={{ marginBottom: 10 }}>
            <div style={{ ...ink, fontWeight: 700, fontSize: 14 }}>{PROBLEMS_HEAD}</div>
            <ul style={{ ...small, margin: '4px 0 0', paddingLeft: 18 }}>{r.problems.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        )}
        {r.problems.length === 0 && r.notes.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ ...ink, fontWeight: 700, fontSize: 14 }}>{NOTES_HEAD}</div>
            <ul style={{ ...small, margin: '4px 0 0', paddingLeft: 18 }}>{r.notes.map((p) => <li key={p}>{p}</li>)}</ul>
            <p style={{ ...small, margin: '4px 0 0' }}>{NOTES_FOOT}</p>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={on} disabled={busy} onClick={make}>{busy ? BUTTON.making : BUTTON.make}</button>
          <button type="button" style={btn} onClick={() => { setAll((a) => ({ ...a, [id]: {} })); setTried(false); setMsg(''); }}>{BUTTON.reset}</button>
        </div>
        {msg && <p role="status" style={{ ...small, margin: '8px 0 0' }}>{msg}</p>}
        <p style={{ ...small, margin: '12px 0 0' }}>{AI_LINE}</p>
      </section>
    </div>
  );
}
