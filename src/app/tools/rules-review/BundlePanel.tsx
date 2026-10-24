'use client';
// 결재 묶음 — 결재에 올릴 본문(신·구조문대비표·보류·직접 고칠 곳·부서 협의)과 반영본·검토표·작업 파일을 받는다.
// 받기 전에 남은 일(미확인·조율 전 이견·사유 없는 보류)을 먼저 보여 준다. 막지는 않는다 — 결재 전 검토용 초안을 뽑을 수도 있다.
import { useState, type MutableRefObject } from 'react';
import { CircleAlert, CircleCheck, Download, FileSpreadsheet, FileText, Save, Trash2 } from 'lucide-react';
import type { Source } from '@/lib/rules-review/ingest';
import { ownText, stateOf, stats, replacement, type Workspace } from '@/lib/rules-review/workspace';
import { download, safeName, today } from './download';

interface Result { reg: string; applied: number; manual: number; error?: string }

export default function BundlePanel({ ws, setWs, sources, onReset }: {
  ws: Workspace;
  setWs: (fn: (w: Workspace | null) => Workspace | null) => void;
  sources: MutableRefObject<Record<string, Source>>;
  onReset: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [wipe, setWipe] = useState(false);
  const st = stats(ws);
  const holdNoReason = ws.findings.filter((f) => { const s = stateOf(ws, f.id); return s.decision === '보류' && !s.note.trim(); }).length;
  const manual = ws.findings.filter((f) => { const s = stateOf(ws, f.id); return s.decision === '반영' && replacement(ws, f) === null && !s.text?.trim(); }).length;
  const written = ws.findings.filter((f) => stateOf(ws, f.id).decision === '반영' && ownText(ws, f) !== null).length;
  const name = safeName(ws.institution);
  const set = (p: Partial<Workspace>) => setWs((w) => (w ? { ...w, ...p } : w));
  const hasSources = Object.keys(sources.current).length > 0;

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setMsg(null);
    try { await fn(); } catch (e) { setMsg(`${label}을(를) 만들지 못했습니다: ${(e as Error).message}`); } finally { setBusy(null); }
  };

  const docx = () => run('신·구조문대비표', async () => {
    const { bundleDocx } = await import('@/lib/rules-review/outputs');
    download(`${name}_제규정정비_신구조문대비표_${today()}.docx`, await bundleDocx(ws));
  });
  const xlsx = () => run('정비 검토표', async () => {
    const { reviewXlsx } = await import('@/lib/rules-review/outputs');
    download(`${name}_제규정정비_검토표_${today()}.xlsx`, await reviewXlsx(ws));
  });
  const hwpx = () => run('개정안 반영본', async () => {
    const { applyToSources, zipOf } = await import('@/lib/rules-review/outputs');
    const out = await applyToSources(ws, sources.current);
    setResults(out.map((r) => ({ reg: r.reg, applied: r.bytes ? r.applied : 0, manual: r.manual.length, error: r.error })));
    const files = out.filter((r) => r.bytes).map((r) => ({ name: r.fileName, data: r.bytes! }));
    if (!files.length) { setMsg('반영본을 만들 규정이 없습니다. 고칠 문안이 있는 항목을 「반영」으로 고르세요.'); return; }
    download(`${name}_제규정정비_개정안반영본_${today()}.zip`, await zipOf(files));
  });
  const save = () => download(`${name}_제규정정비_작업파일_${today()}.json`, new Blob([JSON.stringify({ ...ws, savedAt: new Date().toISOString() })], { type: 'application/json' }));

  const todo = [
    { ok: st.by.미확인 === 0, text: st.by.미확인 ? `미확인 ${st.by.미확인}건이 남아 있습니다 — 결재 묶음에는 반영한 항목만 실립니다` : '모든 항목을 확인했습니다' },
    { ok: st.unsettled === 0, text: st.unsettled ? `부서 이견 ${st.unsettled}건의 조율 결과가 비어 있습니다` : st.disputed ? `부서 이견 ${st.disputed}건 모두 조율 결과를 적었습니다` : '부서 이견이 없습니다' },
    { ok: holdNoReason === 0, text: holdNoReason ? `사유 없는 보류 ${holdNoReason}건 — 보류 목록에 「사유 미기재」로 실립니다` : '보류 항목에 모두 사유가 있습니다' },
    { ok: manual === 0, text: manual ? `자동으로 고칠 문안이 없는 반영 ${manual}건 — 「직접 고칠 곳」으로 실립니다(확인 탭의 「개정 문안 직접 쓰기」나 「조문 고치기」 탭에서 고치면 대비표에 들어갑니다)` : '반영 항목은 모두 고칠 문안이 있습니다' },
    { ok: written === 0, text: written ? `담당자가 개정 문안을 쓴 반영 ${written}건 — 대비표에는 실리지만 반영본(hwpx)에는 자동으로 넣지 못해 「직접 고칠 곳」으로 실립니다(한글에서 옮겨 적으세요)` : '반영본에 직접 옮길 담당자 개정 문안이 없습니다' },
  ];

  return (
    <section className="rr-panel" aria-labelledby="rr-bundle">
      <h2 id="rr-bundle" className="rr-h2"><FileText size={20} aria-hidden /> 결재 묶음</h2>

      <ul className="rr-todo">
        {todo.map((t) => <li key={t.text} className={t.ok ? 'ok' : 'warn'}>{t.ok ? <CircleCheck size={16} aria-hidden /> : <CircleAlert size={16} aria-hidden />} {t.text}</li>)}
      </ul>

      <div className="rr-row wrap">
        <label className="rr-field"><span>기관 이름</span><input value={ws.institution} onChange={(e) => set({ institution: e.target.value })} placeholder="예: ○○공단" maxLength={40} /></label>
        <label className="rr-field"><span>시행일(부칙·개정 표시에 씁니다)</span><input type="date" value={ws.effective} onChange={(e) => set({ effective: e.target.value })} /></label>
      </div>

      <div className="rr-outs">
        <div className="rr-out">
          <b>신·구조문대비표(docx)</b>
          <p>결재에 붙이는 본문입니다. 정비 요약 · 규정별 신·구조문대비표(현 행 | 개정안 | 사유) · 직접 고칠 곳 · 보류 목록 · 소관 부서 협의 내역. 한글에서도 열립니다.</p>
          <button className="rr-btn" onClick={docx} disabled={!!busy}><Download size={16} aria-hidden /> {busy === '신·구조문대비표' ? '만드는 중…' : '받기'}</button>
        </div>
        <div className="rr-out">
          <b>개정안 반영본(hwpx · 규정별 zip)</b>
          <p>원본 한글 파일에 반영한 글자만 고친 파일입니다. 서식은 원본 그대로이고, 표·그림이 든 문단은 고치지 않고 「직접 고칠 곳」으로 남깁니다.</p>
          {!hasSources && <p className="rr-warn">원본 파일이 이 브라우저에 없습니다(작업 파일로 연 경우). 「규정 묶음 다시 올리기」로 원본을 올리면 만들 수 있습니다.</p>}
          <button className="rr-btn" onClick={hwpx} disabled={!!busy || !hasSources}><Download size={16} aria-hidden /> {busy === '개정안 반영본' ? '만드는 중…' : '받기'}</button>
          {results && (
            <table className="rr-table small">
              <thead><tr><th>규정</th><th>고친 곳</th><th>직접 고칠 곳</th><th>비고</th></tr></thead>
              <tbody>{results.map((r) => <tr key={r.reg}><td>{r.reg}</td><td>{r.applied}</td><td>{r.manual || '-'}</td><td>{r.error ?? ''}</td></tr>)}</tbody>
            </table>
          )}
        </div>
        <div className="rr-out">
          <b>정비 검토표(xlsx)</b>
          <p>모든 항목과 결정·사유·소관 부서·부서 의견·조율 결과. 「해당 없음」으로 둔 이유까지 남아 감사 때 근거가 됩니다.</p>
          <button className="rr-btn ghost" onClick={xlsx} disabled={!!busy}><FileSpreadsheet size={16} aria-hidden /> {busy === '정비 검토표' ? '만드는 중…' : '받기'}</button>
        </div>
        <div className="rr-out">
          <b>작업 파일(.json)</b>
          <p>다른 컴퓨터에서 이어서 하거나 백업할 때 씁니다. 규정 글자와 결정이 들어 있고 원본 파일은 들어 있지 않습니다.</p>
          <button className="rr-btn ghost" onClick={save}><Save size={16} aria-hidden /> 받기</button>
        </div>
      </div>
      {msg && <p className="rr-error" role="alert">{msg}</p>}

      <div className="rr-danger">
        <button className={`rr-btn small ${wipe ? 'warn' : 'ghost'}`} onClick={() => (wipe ? onReset() : setWipe(true))}><Trash2 size={15} aria-hidden /> {wipe ? '한 번 더 누르면 이 브라우저의 작업을 지웁니다' : '이 작업 지우고 새로 시작'}</button>
        {wipe && <button className="rr-link" onClick={() => setWipe(false)}>취소</button>}
      </div>
    </section>
  );
}
