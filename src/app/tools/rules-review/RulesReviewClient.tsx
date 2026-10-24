'use client';
// 규정 정비 점검 — 기관 규정 묶음을 올리면 규정끼리 맞춰 보고(브라우저 안), 담당자가 항목마다 확인해 결재 묶음을 만든다.
// 흐름: 올리기 → 읽은 결과 → 확인(작업대) → 부서 의견 → 결재 묶음. 작업은 이 브라우저에 자동 저장한다.
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { FileArchive, FolderOpen, Files, ShieldCheck, Upload as UploadIcon } from 'lucide-react';
import type { Ingested, PdfReader, Source, Upload } from '@/lib/rules-review/ingest';
import { loadPdfLib, ocrPage, pageImage } from '@/lib/rules-review/pdf-browser';
import { runChecks } from '@/lib/rules-review/checks';
import { carryOver, newWorkspace, stats, type ItemState, type Workspace } from '@/lib/rules-review/workspace';
import { clearAll, loadAll, saveSources, saveWorkspace } from '@/lib/rules-review/store';
import Workbench from './Workbench';
import DeptPanel from './DeptPanel';
import AmendPanel from './AmendPanel';
import BundlePanel from './BundlePanel';
import ReadReport from './ReadReport';
import TurnstileWidget from '@/components/TurnstileWidget';

type Tab = '확인' | '조문 고치기' | '부서 의견' | '결재 묶음' | '읽은 파일';
const TABS: Tab[] = ['확인', '조문 고치기', '부서 의견', '결재 묶음', '읽은 파일'];

async function toUploads(files: FileList | File[]): Promise<Upload[]> {
  return Promise.all([...files].map(async (f) => ({ path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
}

export default function RulesReviewClient() {
  const [ws, setWs] = useState<Workspace | null>(null);
  const sources = useRef<Record<string, Source>>({});
  const [tab, setTab] = useState<Tab>('확인');
  const [busy, setBusy] = useState<{ done: number; total: number; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ ok: boolean; at: string } | null>(null);
  const [restore, setRestore] = useState<Workspace | null>(null);
  const [institution, setInstitution] = useState('');
  const [over, setOver] = useState(false);
  const [pending, setPending] = useState<{ next: Workspace; src: Record<string, Source> } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);

  // 지난 작업이 있으면 이어서 할지 묻는다(자동으로 열지 않는다 — 다른 기관 작업일 수 있다)
  useEffect(() => {
    let live = true;
    loadAll().then(({ ws: prev, sources: src }) => {
      if (!live || !prev) return;
      sources.current = src;
      setRestore(prev);
    });
    return () => { live = false; };
  }, []);

  // 자동 저장 — 결정을 바꿀 때마다 잠깐 기다렸다 한 번. 창을 닫거나 다른 탭으로 가면 기다리지 않고 바로 저장한다
  const latest = useRef<Workspace | null>(null);
  useEffect(() => {
    latest.current = ws;
    if (!ws) return;
    const t = setTimeout(() => {
      saveWorkspace(ws).then((ok) => setSaved({ ok, at: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) }));
    }, 500);
    return () => clearTimeout(t);
  }, [ws]);
  useEffect(() => {
    const flush = () => { if (latest.current) void saveWorkspace(latest.current); };
    const hidden = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', hidden);
    return () => { window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', hidden); };
  }, []);

  const apply = async (next: Workspace, src: Record<string, Source>) => {
    sources.current = src;
    await saveSources(src);
    setPending(null);
    if (ws) {
      const m = carryOver(ws, next);
      setWs(m.ws);
      setNotice(`다시 읽었습니다. 지난 결정 ${m.kept}건을 그대로 붙였습니다${m.lost ? `. 이번 묶음에서 짝을 찾지 못한 결정 ${m.lost}건은 지우지 않고 보관합니다(그 규정을 다시 올리면 다시 붙습니다)` : ''}.`);
    } else {
      setWs(next);
      setTab('읽은 파일');
    }
  };

  // 마지막으로 올린 파일 — 스캔 쪽 읽기에 동의하면 같은 파일을 다시 읽는다
  const lastUploads = useRef<Upload[]>([]);

  // 자동 확인(turnstile) 토큰은 한 번만 쓸 수 있다 — 스캔 쪽마다 새로 받는다. 사이트 키가 없으면(개발) 보내지 않는다
  const token = useRef<string | null>(null);
  const waiters = useRef<((t: string) => void)[]>([]);
  const take = (t: string) => {
    token.current = null;
    try { window.turnstile?.reset(); } catch { /* 다음 토큰은 다시 발급된다 */ }
    return t;
  };
  const onToken = useCallback((t: string | null) => {
    const w = waiters.current.shift();
    if (t && w) w(take(t));
    else token.current = t;
  }, []);
  const nextToken = (): Promise<string | null> => {
    if (!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()) return Promise.resolve(null);
    if (token.current) return Promise.resolve(take(token.current));
    return new Promise((res) => {
      const w = (t: string) => { clearTimeout(timer); res(t); };
      const timer = setTimeout(() => { waiters.current = waiters.current.filter((x) => x !== w); res(null); }, 20_000);
      waiters.current.push(w);
    });
  };

  /** ocr 이면 스캔 쪽을 서버로 보내 읽는다(담당자가 「보내 읽기」를 누른 뒤에만) */
  const read = async (uploads: Upload[], name = institution, ocr = false) => {
    if (!uploads.length) return;
    lastUploads.current = uploads;
    setError(null);
    setNotice(null);
    setBusy({ done: 0, total: 1, name: '' });
    const tally = { haiku: 0, sonnet: 0, failed: 0, stopped: '' };
    let progress = { done: 0, total: 1 };
    const pdf: PdfReader = {
      lib: loadPdfLib,
      onScanned: ocr ? async (page, no, path) => {
        if (tally.stopped) return null;
        setBusy({ ...progress, name: `${path.split('/').pop()} ${no}쪽 — 스캔 쪽 읽는 중` });
        try {
          const r = await ocrPage(await pageImage(page), await nextToken());
          if ('lines' in r) { tally[r.model]++; return r.lines; }
          tally.failed++;
          if (r.stop) tally.stopped = r.message;
        } catch { tally.failed++; }
        return null;
      } : undefined,
    };
    try {
      const { ingest } = await import('@/lib/rules-review/ingest');
      const got: Ingested = await ingest(uploads, { pdf, onProgress: (done, total, name) => { progress = { done, total }; setBusy({ done, total, name }); } });
      if (!got.regs.length) {
        setError(got.report.skipped.length || got.report.failed.length
          ? '읽을 수 있는 규정 파일이 없습니다. hwp·hwpx·docx·txt·pdf 파일이나 그것을 담은 zip 을 올려 주세요.'
          : '규정 파일을 찾지 못했습니다.');
        return;
      }
      const next = newWorkspace(got.regs, runChecks(got.regs), got.report, name.trim());
      // 다시 올린 규정이 지난번보다 적으면 바꾸기 전에 묻는다(일부 파일만 고른 실수일 수 있다)
      if (ws && next.regs.length < ws.regs.length) { setPending({ next, src: got.sources }); return; }
      await apply(next, got.sources);
      if (ocr) {
        const done = tally.haiku + tally.sonnet;
        setNotice((n) => `${n ? `${n} ` : ''}스캔 쪽 ${done}쪽을 읽었습니다(하이쿠 ${tally.haiku}쪽${tally.sonnet ? ` · 덜 읽혀 소넷으로 다시 읽은 쪽 ${tally.sonnet}쪽` : ''})${tally.failed ? `. 읽지 못한 쪽 ${tally.failed}쪽` : ''}${tally.stopped ? ` — ${tally.stopped.replace(/.$/, '')}` : ''}. 스캔에서 읽은 글자는 원문과 한 번 대조하세요.`);
      }
    } catch (e) {
      setError(`파일을 읽지 못했습니다: ${(e as Error).message}`);
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
      if (dirRef.current) dirRef.current.value = '';
    }
  };

  const onFiles = async (files: FileList | null) => { if (files?.length) await read(await toUploads(files)); };
  const onDrop = async (e: DragEvent) => { e.preventDefault(); setOver(false); await onFiles(e.dataTransfer.files); };
  const sample = async () => {
    const { sampleUploads } = await import('@/lib/rules-review/sample');
    const name = institution.trim() || '시험공단(예시)';
    setInstitution(name);
    await read(sampleUploads(), name);
  };

  const patch = useCallback((id: string, p: Partial<ItemState>) => {
    setWs((w) => (w ? { ...w, states: { ...w.states, [id]: { ...(w.states[id] ?? { decision: '미확인', note: '' }), ...p } } } : w));
  }, []);
  const patchMany = useCallback((ids: string[], p: Partial<ItemState>) => {
    setWs((w) => {
      if (!w) return w;
      const states = { ...w.states };
      for (const id of ids) states[id] = { ...(states[id] ?? { decision: '미확인', note: '' }), ...p };
      return { ...w, states };
    });
  }, []);

  const openFile = async (f?: File) => {
    if (!f) return;
    try {
      const w = JSON.parse(await f.text()) as Workspace;
      if (w?.version !== 1 || !Array.isArray(w.regs) || !Array.isArray(w.findings)) throw new Error('규정 정비 작업 파일이 아닙니다');
      sources.current = {};
      setWs(w);
      setInstitution(w.institution);
      setTab('확인');
      setNotice('작업 파일을 열었습니다. 개정안 반영본(hwpx)을 만들려면 원본 규정 파일을 「규정 묶음 다시 올리기」로 올리세요.');
    } catch (e) {
      setError(`작업 파일을 열지 못했습니다: ${(e as Error).message}`);
    }
  };

  const reset = async () => { await clearAll(); sources.current = {}; setWs(null); setRestore(null); setSaved(null); setTab('확인'); setNotice(null); };

  const picker = (
    <>
      <input ref={fileRef} type="file" hidden multiple accept=".zip,.hwp,.hwpx,.docx,.txt,.pdf" onChange={(e) => onFiles(e.target.files)} />
      <input ref={dirRef} type="file" hidden multiple {...{ webkitdirectory: '', directory: '' }} onChange={(e) => onFiles(e.target.files)} />
    </>
  );

  if (!ws) {
    return (
      <main className="rr">
        <div className="rr-wrap">
          <header className="rr-hero">
            <div className="rr-eyebrow">기관 제규정 정비</div>
            <h1 className="rr-h1">규정 묶음을 올리면, 규정끼리 맞춰 보고 결재 묶음까지 정리합니다</h1>
            <p className="rr-lead">
              정관·학칙·인사·복무·보수·회계 규정을 zip 하나로 올리세요. 서로 인용한 규정과 조문이 실제로 있는지, 위임한 규정이 있는지,
              부르는 별표·서식이 실려 있는지, 조·항 번호와 용어가 맞는지 맞춰 봅니다. 담당자가 항목마다 반영·보류·해당 없음을 고르면
              신·구조문대비표와 원본 한글 파일에 고친 글자를 넣은 반영본을 만듭니다.
            </p>
            <p className="rr-note"><ShieldCheck size={16} aria-hidden /> 파일은 이 브라우저 안에서만 읽습니다. 서버로 보내지 않고, 작업은 이 컴퓨터의 브라우저에 저장됩니다. 글자층이 없는 스캔 pdf 쪽만, 담당자가 동의하면 그 쪽 그림을 보내 글자로 읽습니다.</p>
          </header>

          {restore && (
            <section className="rr-restore" aria-label="지난 작업">
              <div>
                <b>{restore.institution || '이름 없는 기관'}</b> 작업이 이 브라우저에 남아 있습니다
                <span> · 규정 {restore.regs.length}개 · 확인 {stats(restore).done}/{stats(restore).total}건</span>
              </div>
              <div className="rr-row">
                <button className="rr-btn" onClick={() => { setWs(restore); setInstitution(restore.institution); setRestore(null); setTab('확인'); }}>이어서 하기</button>
                <button className="rr-btn ghost" onClick={reset}>지우고 새로 시작</button>
              </div>
            </section>
          )}

          <section className="rr-step" aria-labelledby="rr-up">
            <h2 id="rr-up"><span>1</span>규정 올리기</h2>
            <label className="rr-field">
              <span>기관 이름(결재 묶음 제목에 씁니다 · 선택)</span>
              <input value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="예: ○○공단" maxLength={40} />
            </label>
            <div
              className={`rr-drop${over ? ' over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={onDrop}
            >
              {busy ? (
                <div className="rr-progress" role="status" aria-live="polite">
                  <b>읽는 중 {busy.done}/{busy.total}</b>
                  <span>{busy.name}</span>
                  <div className="rr-bar"><i style={{ width: `${busy.total ? (busy.done / busy.total) * 100 : 0}%` }} /></div>
                </div>
              ) : (
                <>
                  <FileArchive size={32} aria-hidden />
                  <p><b>규정 zip 이나 파일을 여기에 끌어 놓으세요</b></p>
                  <p className="rr-mute">hwp · hwpx · docx · txt · pdf, 그리고 그것을 담은 zip(안의 zip 한 단계까지). 같은 규정의 한글 파일과 pdf 가 함께 있으면 한글 파일을 읽습니다(반영본은 한글 파일로만 만듭니다).</p>
                  <div className="rr-row center">
                    <button className="rr-btn" onClick={() => fileRef.current?.click()}><UploadIcon size={16} aria-hidden /> zip·파일 고르기</button>
                    <button className="rr-btn ghost" onClick={() => dirRef.current?.click()}><FolderOpen size={16} aria-hidden /> 폴더 통째로 고르기</button>
                  </div>
                </>
              )}
            </div>
            {picker}
            {error && <p className="rr-error" role="alert">{error}</p>}
            <p className="rr-mute">규정 파일이 없으면 <button className="rr-link" onClick={sample} disabled={!!busy}>예시 규정으로 먼저 보기</button>(결함을 심어 둔 합성 규정 5개).
              {' '}다른 컴퓨터에서 받아 둔 <label className="rr-link">작업 파일(.json) 열기<input type="file" hidden accept=".json,application/json" onChange={(e) => { openFile(e.target.files?.[0]); e.target.value = ''; }} /></label>.</p>
          </section>

          <section className="rr-step" aria-labelledby="rr-what">
            <h2 id="rr-what"><span>2</span>무엇을 맞춰 보나</h2>
            <div className="rr-grid">
              {[
                ['위임·인용', '「○○규정」 제N조처럼 인용한 규정·조문·항이 묶음 안에 실제로 있는지, 삭제된 조문을 부르지 않는지, 세칙의 상위 규정이 있는지'],
                ['별표·서식', '본문이 부르는 별표·별지 서식이 규정에 실려 있는지, 실린 별표를 본문이 부르는지'],
                ['체계', '조 번호 빠짐·겹침, 항 번호 건너뜀, 모양만 같은 다른 글자(➂)로 적은 항 번호'],
                ['규정 간 충돌', '같은 용어를 규정마다 다르게 정의한 곳, 규정과 그 시행세칙에서 같은 제목 조문의 숫자 기준이 다른 곳'],
                ['용어·문장', '법제처 「알기 쉬운 법령 정비기준」에서 문맥과 관계없이 바꿀 수 있는 말, 날짜가 깨진 개정 표시'],
              ].map(([t, d]) => (
                <div key={t} className="rr-card"><b>{t}</b><p>{d}</p></div>
              ))}
            </div>
            <p className="rr-mute">상위법령(근로기준법·고등교육법 등)과의 대조는 이 단계에 들어 있지 않습니다. 걸린 곳은 확인할 곳 목록이며 위반 여부를 정한 것이 아닙니다.</p>
          </section>

          <section className="rr-step" aria-labelledby="rr-get">
            <h2 id="rr-get"><span>3</span>받는 것</h2>
            <ul className="rr-list">
              <li><b>신·구조문대비표(docx)</b> — 현 행 | 개정안 | 사유. 고친 항만 전문, 나머지는 「(현행과 같음)」, 끝에 부칙 시행일. 보류 목록·직접 고칠 곳·부서 협의 내역을 함께 싣습니다.</li>
              <li><b>개정안 반영본(hwpx)</b> — 원본 한글 파일에 반영한 글자만 고친 파일. 서식은 원본 그대로입니다.</li>
              <li><b>정비 검토표(xlsx)</b> — 모든 항목과 결정·사유·부서 의견·조율 결과.</li>
              <li><b>부서 의견 요청(xlsx)</b> — 소관 부서별 파일. 회신 파일을 다시 올리면 항목에 의견이 붙고, 다른 의견은 「이견」으로 표시됩니다.</li>
            </ul>
          </section>
        </div>
      </main>
    );
  }

  const st = stats(ws);
  return (
    <main className="rr">
      {picker}
      <TurnstileWidget onToken={onToken} />
      <div className="rr-top">
        <div className="rr-wrap wide rr-top-in">
          <div className="rr-title">
            <b>{ws.institution || '이름 없는 기관'}</b>
            <span>규정 {ws.regs.length}개 · 항목 {st.total}건</span>
          </div>
          <div className="rr-meter" aria-label={`확인 ${st.done}/${st.total}건`}>
            <div className="rr-bar"><i style={{ width: `${st.total ? (st.done / st.total) * 100 : 0}%` }} /></div>
            <span>확인 {st.done}/{st.total} · 반영 {st.by.반영} · 보류 {st.by.보류} · 해당 없음 {st.by['해당 없음']}{st.disputed ? ` · 이견 ${st.disputed}` : ''}</span>
          </div>
          <div className="rr-row">
            <button className="rr-btn ghost small" onClick={() => fileRef.current?.click()} disabled={!!busy}><Files size={15} aria-hidden /> {busy ? `읽는 중 ${busy.done}/${busy.total}` : '규정 묶음 다시 올리기'}</button>
            <span className={`rr-saved${saved && !saved.ok ? ' bad' : ''}`} role="status">{saved ? (saved.ok ? `이 브라우저에 저장됨 ${saved.at}` : '이 브라우저에 저장하지 못했습니다 — 결재 묶음 탭에서 작업 파일을 받아 두세요') : ''}</span>
          </div>
        </div>
        <nav className="rr-wrap wide rr-tabs" role="tablist" aria-label="작업 단계">
          {TABS.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              {t}{t === '확인' && st.by.미확인 ? <em>{st.by.미확인}</em> : null}{t === '부서 의견' && st.unsettled ? <em className="warn">{st.unsettled}</em> : null}
            </button>
          ))}
        </nav>
      </div>
      {pending && (
        <div className="rr-wrap wide">
          <div className="rr-warn" role="alert">
            이번에 올린 규정은 {pending.next.regs.length}개로 지금 작업({ws.regs.length}개)보다 적습니다. 바꾸면 빠진 규정의 항목이 목록에서 사라집니다(결정은 보관해 두었다가 그 규정을 다시 올리면 다시 붙습니다).
            <div className="rr-row" style={{ marginTop: 8 }}>
              <button className="rr-btn small" onClick={() => apply(pending.next, pending.src)}>그래도 바꾸기</button>
              <button className="rr-btn small ghost" onClick={() => setPending(null)}>취소 — 지금 작업 유지</button>
            </div>
          </div>
        </div>
      )}
      {notice && <div className="rr-wrap wide"><p className="rr-note" role="status">{notice}</p></div>}
      {error && <div className="rr-wrap wide"><p className="rr-error" role="alert">{error}</p></div>}
      <div className="rr-wrap wide rr-body">
        {tab === '읽은 파일' && <ReadReport ws={ws} onStart={() => setTab('확인')} busy={busy ? `${busy.done}/${busy.total} ${busy.name}` : null}
          onOcr={lastUploads.current.length ? () => read(lastUploads.current, institution, true) : null} />}
        {tab === '확인' && <Workbench ws={ws} patch={patch} patchMany={patchMany} />}
        {tab === '조문 고치기' && <AmendPanel ws={ws} setWs={setWs} />}
        {tab === '부서 의견' && <DeptPanel ws={ws} setWs={setWs} />}
        {tab === '결재 묶음' && <BundlePanel ws={ws} setWs={setWs} sources={sources} onReset={reset} />}
      </div>
    </main>
  );
}
