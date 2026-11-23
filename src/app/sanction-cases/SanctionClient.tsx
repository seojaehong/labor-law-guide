'use client';

// 판결은 열쇠(Bearer)를 붙여 /api/sanction-cases 에서 불러온다. 고른 판결로 파일을 만드는 일은 이 브라우저 안에서 한다.
// 한글 엔진(md-hwpx)은 「내려받기」를 누를 때 불러온다(sanction-export 가 동적 import).
import { useEffect, useState } from 'react';
import { exportSelection, LONG_NOTE, SANCTION_FONTS, selectable, type SanctionFontId, type SanctionFormat, type SanctionRow } from '@/lib/sanction-export';
import { SANCTION_TYPES, type SanctionType } from '@/lib/sanction-types';
import { blockHeader, TYPE_LABEL } from '../../../tools/k-labor/lib/sanction-format.mjs';
import * as C from './copy';

const small: React.CSSProperties = { fontSize: 13, lineHeight: 1.6, color: 'var(--grey-700)' };
const ink: React.CSSProperties = { color: 'var(--color-text-primary)' };
const card: React.CSSProperties = { border: '1px solid var(--color-border)', borderRadius: 12, padding: '14px 16px', margin: '0 0 14px' };
const inp: React.CSSProperties = { minWidth: 0, boxSizing: 'border-box', border: '1px solid var(--color-border)', borderRadius: 8, padding: '7px 9px', fontSize: 16, background: 'var(--color-bg-primary)', ...ink };
const btn: React.CSSProperties = { border: '1px solid var(--color-border)', borderRadius: 8, padding: '6px 12px', fontSize: 13, background: 'var(--color-bg-primary)', ...ink, cursor: 'pointer' };
const on: React.CSSProperties = { ...btn, background: 'var(--color-text-primary)', color: 'var(--color-bg-primary)', border: '1px solid var(--color-text-primary)' };
const h: React.CSSProperties = { ...ink, fontSize: 15, fontWeight: 700, marginBottom: 8 };
const row: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' };
const quote: React.CSSProperties = { ...ink, fontSize: 14, lineHeight: 1.8, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: '6px 0 0' };

const KEY_STORE = 'llg.sanctionKey';
const PAGE = 30;
const label = (t: string) => (TYPE_LABEL as Record<string, string>)[t] ?? t;
const readKey = () => { try { return localStorage.getItem(KEY_STORE) ?? ''; } catch { return ''; } };
const writeKey = (v: string) => { try { if (v) localStorage.setItem(KEY_STORE, v); else localStorage.removeItem(KEY_STORE); } catch { /* 저장이 막힌 브라우저 — 이번 화면에서만 쓴다 */ } };

function save(name: string, data: BlobPart, mime: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type: mime }));
  a.download = name.replace(/[\\/:*?"<>|]/g, '_');
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

function Body({ r }: { r: SanctionRow }) {
  const [open, setOpen] = useState(false);
  if (r.block_status === 'pass') return <p style={quote}>{r.block_body}</p>;
  const t = r.long_text ?? '';
  return (
    <>
      <p style={quote}>{open || t.length <= 300 ? t : `${t.slice(0, 300)}…`}</p>
      {t.length > 300 && <button type="button" style={{ ...btn, marginTop: 6 }} onClick={() => setOpen(!open)}>{open ? '접기' : '원문 전체 펼치기'}</button>}
    </>
  );
}

export default function SanctionClient() {
  const [key, setKey] = useState('');
  const [keyDraft, setKeyDraft] = useState('');
  const [keyBad, setKeyBad] = useState(false);
  const [type, setType] = useState<SanctionType>('harass');
  const [sanction, setSanction] = useState<'' | '적정' | '과중'>('');
  const [keyword, setKeyword] = useState('');
  const [withLong, setWithLong] = useState(false);
  const [rows, setRows] = useState<SanctionRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [fetched, setFetched] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState('');
  const [picked, setPicked] = useState<SanctionRow[]>([]);
  const [format, setFormat] = useState<SanctionFormat>('hwpx');
  const [font, setFont] = useState<SanctionFontId>('canon');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { setKey(readKey()); }, []);

  async function load(offset: number, k = key) {
    if (!k) return;
    setLoading(true);
    setLoadMsg('');
    try {
      const q = new URLSearchParams({ type, limit: String(PAGE), offset: String(offset) });
      if (sanction) q.set('sanction', sanction);
      if (keyword.trim()) q.set('keyword', keyword.trim());
      if (withLong) q.set('with_long', 'true');
      const res = await fetch(`/api/sanction-cases?${q}`, { headers: { authorization: `Bearer ${k}` }, cache: 'no-store' });
      if (res.status === 401) {
        writeKey('');
        setKey('');
        setKeyBad(true);
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const got = ((await res.json()).rows ?? []) as SanctionRow[];
      const usable = got.filter(selectable);
      setRows((prev) => (offset ? [...prev, ...usable] : usable));
      // 화면 목록은 고를 수 없는 행(채점 불합격 등)을 걸러 내므로, 서버 쪽 다음 위치는 받은 행 수로 센다
      setFetched(offset + got.length);
      setHasMore(got.length === PAGE);
      if (!offset && !usable.length) setLoadMsg(C.EMPTY);
    } catch {
      setLoadMsg(C.LOAD_FAIL);
    } finally {
      setLoading(false);
    }
  }

  // 유형·양정·긴 판단을 바꾸면 처음부터 다시 불러온다(낱말은 「찾기」를 눌러야)
  useEffect(() => { if (key) void load(0); }, [key, type, sanction, withLong]); // eslint-disable-line react-hooks/exhaustive-deps

  const isPicked = (r: SanctionRow) => picked.some((p) => p.id === r.id);
  const toggle = (r: SanctionRow) => { setPicked((p) => (p.some((x) => x.id === r.id) ? p.filter((x) => x.id !== r.id) : [...p, r])); setMsg(''); };
  const move = (i: number, d: -1 | 1) => setPicked((p) => { const n = [...p]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });

  async function make() {
    setBusy(true);
    setMsg('');
    try {
      const out = await exportSelection(picked, format, { font });
      if (format === 'ai') {
        try {
          await navigator.clipboard.writeText(out.text!);
          setMsg(C.DONE.copy);
        } catch {
          save(out.filename, out.text!, out.mime);
          setMsg(C.DONE.copyFail);
        }
      } else {
        save(out.filename, out.bytes ? out.bytes.slice().buffer : out.text!, out.mime);
        setMsg(C.DONE.file);
      }
    } catch {
      setMsg(C.FAIL);
    } finally {
      setBusy(false);
    }
  }

  if (!key)
    return (
      <section style={card}>
        <div style={h}>{C.KEY.head}</div>
        <form style={row} onSubmit={(e) => { e.preventDefault(); const v = keyDraft.trim(); if (!v) return; writeKey(v); setKeyBad(false); setKeyDraft(''); setKey(v); }}>
          <input id="sanction-key" style={{ ...inp, flex: '1 1 220px' }} type="password" autoComplete="off" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} aria-label={C.KEY.head} />
          <button type="submit" style={on}>{C.KEY.save}</button>
        </form>
        {keyBad && <p role="alert" style={{ ...small, margin: '8px 0 0', color: 'var(--color-danger, #c0392b)' }}>{C.KEY.wrong}</p>}
        <p style={{ ...small, margin: '8px 0 0' }}>{C.KEY.help}</p>
      </section>
    );

  const fmt = C.FORMATS.find((f) => f.id === format)!;
  return (
    <div>
      <section style={card}>
        <div style={h}>{C.STEP.find}</div>
        <div style={row} role="group" aria-label="비위 유형">
          {SANCTION_TYPES.map((t) => (
            <button key={t} type="button" style={t === type ? on : btn} aria-pressed={t === type} onClick={() => setType(t)}>{label(t)}</button>
          ))}
        </div>
        <div style={{ ...row, marginTop: 8 }} role="group" aria-label="양정 판단">
          {([['', C.SANCTION_LABEL.all], ['적정', C.SANCTION_LABEL.ok], ['과중', C.SANCTION_LABEL.heavy]] as const).map(([v, l]) => (
            <button key={l} type="button" style={v === sanction ? on : btn} aria-pressed={v === sanction} onClick={() => setSanction(v)}>{l}</button>
          ))}
          <label style={{ ...small, display: 'inline-flex', gap: 6, alignItems: 'center', marginLeft: 6 }}>
            <input id="sanction-long" type="checkbox" checked={withLong} onChange={(e) => setWithLong(e.target.checked)} /> {C.LONG_TOGGLE}
          </label>
        </div>
        <form style={{ ...row, marginTop: 8 }} onSubmit={(e) => { e.preventDefault(); void load(0); }}>
          <input id="sanction-keyword" style={{ ...inp, flex: '1 1 200px' }} value={keyword} maxLength={40} placeholder={C.KEYWORD} aria-label={C.KEYWORD} onChange={(e) => setKeyword(e.target.value)} />
          <button type="submit" style={btn}>{C.SEARCH}</button>
          <button type="button" style={btn} onClick={() => { writeKey(''); setKey(''); }}>{C.KEY.clear}</button>
        </form>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
          {rows.map((r) => {
            const sel = isPicked(r);
            return (
              <label key={r.id} style={{ ...card, margin: 0, display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', borderColor: sel ? 'var(--color-text-primary)' : 'var(--color-border)' }}>
                <input type="checkbox" checked={sel} onChange={() => toggle(r)} style={{ marginTop: 4 }} aria-label={`${r.case_number} 고르기`} />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ ...small, display: 'block' }}>
                    {label(r.type)}{r.sanction ? ` · ${r.sanction}` : ''}{r.block_status === 'long_judgment' ? ` · ${C.LONG_BADGE}` : ''}
                  </span>
                  <span style={{ ...ink, fontSize: 14, fontWeight: 700, display: 'block', marginTop: 2 }}>{blockHeader(r)}</span>
                  <Body r={r} />
                </span>
              </label>
            );
          })}
        </div>
        {loading && <p style={{ ...small, margin: '10px 0 0' }}>불러오는 중…</p>}
        {loadMsg && <p role="status" style={{ ...small, margin: '10px 0 0' }}>{loadMsg}</p>}
        {hasMore && !loading && <button type="button" style={{ ...btn, marginTop: 10 }} onClick={() => void load(fetched)}>{C.MORE}</button>}
      </section>

      <section style={card}>
        <div style={h}>{C.STEP.pick} {picked.length ? `${picked.length}건` : ''}</div>
        {!picked.length && <p style={{ ...small, margin: 0 }}>{C.PICK_EMPTY}</p>}
        <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {picked.map((r, i) => (
            <li key={r.id} style={{ ...small, ...ink }}>
              <span style={{ overflowWrap: 'anywhere' }}>{blockHeader(r)}{r.block_status === 'long_judgment' ? ` · ${C.LONG_BADGE}` : ''}</span>
              <span style={{ ...row, marginTop: 4 }}>
                <button type="button" style={btn} disabled={i === 0} onClick={() => move(i, -1)}>{C.BUTTON.up}</button>
                <button type="button" style={btn} disabled={i === picked.length - 1} onClick={() => move(i, 1)}>{C.BUTTON.down}</button>
                <button type="button" style={btn} onClick={() => toggle(r)}>{C.BUTTON.remove}</button>
              </span>
            </li>
          ))}
        </ol>
        {picked.length > 1 && <button type="button" style={{ ...btn, marginTop: 10 }} onClick={() => setPicked([])}>{C.BUTTON.clearAll}</button>}
        {picked.some((r) => r.block_status === 'long_judgment') && <p style={{ ...small, margin: '10px 0 0' }}>{LONG_NOTE}</p>}
      </section>

      <section style={card}>
        <div style={h}>{C.STEP.out}</div>
        <div style={row} role="group" aria-label="파일 형식">
          {C.FORMATS.map((f) => (
            <button key={f.id} type="button" style={f.id === format ? on : btn} aria-pressed={f.id === format} onClick={() => { setFormat(f.id); setMsg(''); }}>{f.label}</button>
          ))}
        </div>
        <p style={{ ...small, margin: '8px 0 0' }}>{fmt.help}</p>
        {format === 'hwpx' && (
          <div style={{ marginTop: 10 }}>
            <div style={{ ...small, ...ink, fontWeight: 700 }}>{C.FONT_HEAD}</div>
            <div style={{ ...row, marginTop: 4 }} role="group" aria-label={C.FONT_HEAD}>
              {SANCTION_FONTS.map((f) => (
                <button key={f.id} type="button" style={f.id === font ? on : btn} aria-pressed={f.id === font} onClick={() => setFont(f.id)}>{f.label}</button>
              ))}
            </div>
            <p style={{ ...small, margin: '6px 0 0' }}>{C.FONT_NOTE}</p>
          </div>
        )}
        <div style={{ ...row, marginTop: 12 }}>
          <button type="button" style={on} disabled={busy || !picked.length} onClick={make}>
            {busy ? C.BUTTON.making : format === 'ai' ? C.BUTTON.copy : C.BUTTON.download}
          </button>
        </div>
        {msg && <p role="status" style={{ ...small, margin: '8px 0 0' }}>{msg}</p>}
      </section>
    </div>
  );
}
