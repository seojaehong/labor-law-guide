'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Download, FileUp, RotateCcw, Undo2, Replace } from 'lucide-react';
import type { HwpEditDoc, HwpKind, Replacement } from '@/lib/hwp/hwp-doc';

type Step = Replacement & { count: number };
const PAGE_BATCH = 20;

export default function HwpToolClient() {
  const fileRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HwpEditDoc | null>(null);
  const original = useRef<Uint8Array | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<HwpKind | null>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [shown, setShown] = useState(PAGE_BATCH);
  const [steps, setSteps] = useState<Step[]>([]);
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(true);
  const [view, setView] = useState<'page' | 'text'>('page');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);

  // 쪽 그림(svg)은 blob 주소로 img 에 넣는다 — 문서 안의 무엇도 페이지 스크립트로 실행되지 않는다
  const draw = (doc: HwpEditDoc, upto: number) => {
    setPages((prev) => {
      prev.forEach((u) => URL.revokeObjectURL(u));
      const n = Math.min(doc.pageCount, upto);
      return Array.from({ length: n }, (_, i) => URL.createObjectURL(new Blob([doc.pageSvg(i)], { type: 'image/svg+xml' })));
    });
    setPageCount(doc.pageCount);
    setText(doc.text());
  };

  useEffect(() => () => { docRef.current?.free(); }, []);
  useEffect(() => () => { pages.forEach((u) => URL.revokeObjectURL(u)); }, [pages]);

  const swap = (doc: HwpEditDoc, upto = shown) => {
    docRef.current?.free();
    docRef.current = doc;
    draw(doc, upto);
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (fileRef.current) fileRef.current.value = '';
    setBusy(true); setMsg(null);
    try {
      const { HwpEditDoc } = await import('@/lib/hwp/hwp-doc');
      const bytes = new Uint8Array(await f.arrayBuffer());
      const doc = await HwpEditDoc.open(bytes);
      original.current = bytes;
      setName(f.name); setKind(doc.kind); setBlocked(doc.saveBlocked); setSteps([]); setShown(PAGE_BATCH);
      swap(doc, PAGE_BATCH);
      setMsg(doc.saveBlocked
        ? { kind: 'error', text: `${f.name} — 변경 내용 추적 또는 배포용 문서라 저장은 막아 두었습니다. 보기와 글자 복사만 됩니다` }
        : { kind: 'info', text: `${f.name} — ${doc.pageCount}쪽을 열었습니다` });
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message });
    } finally { setBusy(false); }
  };

  const onReplace = () => {
    const doc = docRef.current;
    if (!doc) return;
    try {
      const step = { find, replace, caseSensitive };
      const count = doc.replaceAll(step);
      if (!count) { setMsg({ kind: 'info', text: `「${find}」를 찾지 못했습니다` }); return; }
      setSteps((s) => [...s, { ...step, count }]);
      draw(doc, shown);
      setMsg({ kind: 'info', text: `${count}곳을 바꿨습니다` });
    } catch (e) { setMsg({ kind: 'error', text: (e as Error).message }); }
  };

  const rebuild = async (next: Step[]) => {
    if (!original.current) return;
    setBusy(true);
    try {
      const { HwpEditDoc } = await import('@/lib/hwp/hwp-doc');
      const { doc } = await HwpEditDoc.replay(original.current, next);
      setSteps(next); swap(doc);
      setMsg({ kind: 'info', text: next.length ? '마지막 바꾸기를 되돌렸습니다' : '원본 상태로 돌렸습니다' });
    } catch (e) { setMsg({ kind: 'error', text: (e as Error).message }); } finally { setBusy(false); }
  };

  const onMore = () => {
    const doc = docRef.current;
    if (!doc) return;
    const upto = shown + PAGE_BATCH;
    setShown(upto); draw(doc, upto);
  };

  const onSave = async (k: HwpKind) => {
    const doc = docRef.current;
    if (!doc) return;
    const { editedName } = await import('@/lib/hwp/hwp-doc');
    const blob = new Blob([doc.export(k).slice()], { type: 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = editedName(name, k); a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <main className="hw">
      <div className="hw-wrap">
        <header className="hw-hero">
          <p className="hw-eyebrow"><Link href="/tools">계산·점검 도구</Link> · 한글 문서</p>
          <h1 className="hw-h1">한글 문서 열기·고치기</h1>
          <p className="hw-lead">hwp·hwpx 파일을 브라우저에서 열어 쪽 모양으로 보고, 글자를 찾아 바꾼 뒤 hwp 또는 hwpx 로 내려받습니다. 한글 프로그램이 없어도 됩니다. 쪽 위에서 직접 글자를 고치려면 <Link href="/hwp-editor">한글 문서 편집기</Link>를 쓰세요.</p>
          <p className="hw-note">원본 파일은 바뀌지 않습니다. 수정본은 「_수정」을 붙인 새 파일로 내려받습니다. 쪽 나눔과 글꼴은 한컴 한글과 다르게 보일 수 있으니, 제출 전에는 한글에서 한 번 열어 확인하세요.</p>
        </header>

        <section className="hw-bar">
          <input ref={fileRef} type="file" accept=".hwp,.hwpx" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          <button className="hw-btn hw-btn-primary" onClick={() => fileRef.current?.click()} disabled={busy}><FileUp size={16} /> {busy ? (name ? '여는 중…' : '처음 한 번 문서 엔진(약 4MB)을 받는 중…') : name ? '다른 파일 열기' : 'hwp·hwpx 파일 열기'}</button>
          {kind && <>
            <span className="hw-file">{name} · {pageCount}쪽</span>
            <span className="sp" />
            <button className="hw-btn" onClick={() => onSave('hwp')} disabled={busy || blocked}><Download size={15} /> hwp 로 저장</button>
            <button className="hw-btn" onClick={() => onSave('hwpx')} disabled={busy || blocked}><Download size={15} /> hwpx 로 저장</button>
          </>}
        </section>
        {msg && <p className={`hw-msg ${msg.kind === 'error' ? 'is-error' : ''}`} role={msg.kind === 'error' ? 'alert' : 'status'}>{msg.text}</p>}

        {kind && (
          <div className="hw-body">
            <aside className="hw-side">
              <h2 className="hw-h2">찾아 바꾸기</h2>
              <label className="hw-field"><span>찾을 글자</span><input value={find} onChange={(e) => setFind(e.target.value)} placeholder="예: 회사" /></label>
              <label className="hw-field"><span>바꿀 글자</span><input value={replace} onChange={(e) => setReplace(e.target.value)} placeholder="비우면 지웁니다" /></label>
              <label className="hw-check"><input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} /> 영문 대소문자 구분</label>
              <button className="hw-btn hw-btn-primary hw-full" onClick={onReplace} disabled={busy || !find}><Replace size={15} /> 모두 바꾸기</button>

              <h2 className="hw-h2">바꾼 기록</h2>
              {steps.length ? (
                <ol className="hw-steps">
                  {steps.map((s, i) => <li key={i}><b>{s.find}</b> → {s.replace ? <b>{s.replace}</b> : <em>(지움)</em>} <span>{s.count}곳</span></li>)}
                </ol>
              ) : <p className="hw-empty">아직 바꾼 것이 없습니다.</p>}
              <div className="hw-row">
                <button className="hw-btn" onClick={() => rebuild(steps.slice(0, -1))} disabled={busy || !steps.length}><Undo2 size={15} /> 마지막 되돌리기</button>
                <button className="hw-btn" onClick={() => rebuild([])} disabled={busy || !steps.length}><RotateCcw size={15} /> 원본으로</button>
              </div>
            </aside>

            <section className="hw-view" aria-live="polite">
              <div className="hw-tabs" role="tablist">
                <button role="tab" aria-selected={view === 'page'} onClick={() => setView('page')}>쪽 보기</button>
                <button role="tab" aria-selected={view === 'text'} onClick={() => setView('text')}>글자만 보기</button>
              </div>
              {view === 'page' ? (
                <div className="hw-pages">
                  {pages.map((u, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <figure key={u} className="hw-page"><img src={u} alt={`${i + 1}쪽`} /><figcaption>{i + 1} / {pageCount}</figcaption></figure>
                  ))}
                  {pages.length < pageCount && <button className="hw-btn hw-full" onClick={onMore}>다음 {Math.min(PAGE_BATCH, pageCount - pages.length)}쪽 더 보기</button>}
                </div>
              ) : <pre className="hw-text">{text}</pre>}
            </section>
          </div>
        )}

        <footer className="hw-foot">
          한글 문서 처리는 오픈소스 <a href="https://github.com/edwardkim/rhwp" target="_blank" rel="noreferrer">rhwp</a>(<a href="/rhwp/LICENSE.txt" target="_blank">MIT</a>)를 씁니다. 본 제품은 한글과컴퓨터의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다. 파일은 이 브라우저 안에서 처리합니다.
        </footer>
      </div>
    </main>
  );
}
