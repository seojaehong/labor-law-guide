'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Download, FileUp, MonitorSmartphone } from 'lucide-react';
import type { RhwpEditor } from '@rhwp/editor';
import type { HwpKind } from '@/lib/hwp/hwp-doc';

/** public/hwp-editor/ 의 편집기(rhwp-studio). 같은 출처라 next.config 의 SAMEORIGIN 헤더로 iframe 에 뜬다 */
const STUDIO_URL = '/hwp-editor/index.html?chrome=embed&lang=ko';
const HWP_WARNING = 'hwp 저장은 바탕쪽(둘째 이후)·메모·수식 캡션이 빠질 수 있습니다(rhwp 0.8.7 알려진 한계). 제출본은 hwpx 를 권합니다';

type Msg = { kind: 'info' | 'error'; text: string };

/** 편집기의 자동 복구(문서 초안을 이 브라우저 저장소에 남기는 기능)를 끄고, 첫 실행 안내를 건너뛴다.
 *  편집기는 같은 출처라 localStorage 'rhwp-settings' 를 함께 본다. 다른 설정은 그대로 둔다 */
function prepareStudioSettings() {
  try {
    const raw = localStorage.getItem('rhwp-settings');
    const s = raw ? JSON.parse(raw) : { version: 1 };
    s.autosave = { ...(s.autosave ?? {}), recoveryEnabled: false, idleSaveEnabled: false };
    s.theme = { ...(s.theme ?? {}), skinChosen: true };
    localStorage.setItem('rhwp-settings', JSON.stringify(s));
  } catch { /* 저장소를 못 쓰면 편집기 기본값으로 뜬다 */ }
}

function download(bytes: Uint8Array, fileName: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes.slice()], { type: 'application/octet-stream' }));
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function HwpEditorClient() {
  const fileRef = useRef<HTMLInputElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Promise<RhwpEditor> | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<HwpKind | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState<'' | 'engine' | 'open' | 'save'>('');
  const [msg, setMsg] = useState<Msg | null>(null);

  useEffect(() => () => { editorRef.current?.then((e) => e.destroy()).catch(() => {}); }, []);

  /** 편집기는 처음 파일을 열 때 만든다 — 페이지만 보고 가는 사람에게 엔진(약 5MB)을 받게 하지 않는다 */
  const getEditor = () => {
    if (!editorRef.current) {
      prepareStudioSettings();
      editorRef.current = import('@rhwp/editor').then((m) => m.createEditor(hostRef.current!, { studioUrl: STUDIO_URL }));
      editorRef.current.catch(() => { editorRef.current = null; hostRef.current?.replaceChildren(); });
    }
    return editorRef.current;
  };

  const onFile = async (f: File | undefined) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!f) return;
    setMsg(null);
    try {
      const { sniffKind, hasViewText, MAX_EDIT_BYTES } = await import('@/lib/hwp/hwp-doc');
      if (f.size > MAX_EDIT_BYTES) throw new Error('파일은 20MB 이하만 엽니다');
      const bytes = new Uint8Array(await f.arrayBuffer());
      const k = sniffKind(bytes);
      if (!k) throw new Error('한글(hwp·hwpx) 파일 형식이 아닙니다');
      const viewText = hasViewText(bytes);

      if (!editorRef.current) setBusy('engine');
      const editor = await getEditor();
      if (kind) {
        const ctx = await editor.commands.context().catch(() => ({} as Record<string, unknown>));
        if (ctx.isDirty && !window.confirm('지금 문서에 저장하지 않은 수정이 있습니다. 버리고 새 파일을 열까요?')) return;
      }
      setBusy('open');
      // 원본 바이트는 넘기지 않고 사본을 넘긴다 — 원본 파일은 그대로다
      const r = await editor.loadFile(bytes.slice(), f.name, { skipUnsavedGuard: true });
      setName(f.name); setKind(k); setPageCount(r.pageCount); setBlocked(viewText);
      setMsg(viewText
        ? { kind: 'error', text: `${f.name} — 변경 내용 추적 또는 배포용 문서라 저장은 막아 두었습니다. 이 형식의 기록을 다시 쓰지 못해 한글이 저장본을 거부하기 때문입니다. 보기와 글자 복사만 됩니다` }
        : { kind: 'info', text: `${f.name} — ${r.pageCount}쪽을 열었습니다. 편집기 안을 눌러 고치세요` });
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error && e.message ? e.message : '문서를 열지 못했습니다. 암호가 걸렸거나 손상된 파일일 수 있습니다' });
    } finally { setBusy(''); }
  };

  const onSave = async (target: HwpKind) => {
    if (!editorRef.current || blocked) return;
    setBusy('save'); setMsg(null);
    try {
      const editor = await editorRef.current;
      const ctx = await editor.commands.context();
      if (ctx.passwordProtected) {
        setMsg({ kind: 'error', text: '암호가 걸린 문서입니다. 이 편집기는 저장할 때 암호를 다시 걸지 못해 암호 없는 사본이 나가므로 저장을 막았습니다. 한글에서 저장하세요' });
        return;
      }
      const { editedName } = await import('@/lib/hwp/hwp-doc');
      const fileName = editedName(name, target);
      if (target === 'hwp') {
        const v = await editor.exportHwpVerify();
        if (!v.recovered) throw new Error('hwp 로 저장한 결과를 다시 열지 못했습니다. hwpx 로 저장하세요');
        if (v.pageCountAfter !== v.pageCountBefore
          && !window.confirm(`hwp 로 저장하면 쪽수가 ${v.pageCountBefore}쪽에서 ${v.pageCountAfter}쪽으로 달라집니다. 그래도 저장할까요?`)) return;
        download(await editor.exportHwp(), fileName);
        setMsg({ kind: 'info', text: `${fileName} 을 내려받았습니다. ${HWP_WARNING}` });
      } else {
        download(await editor.exportHwpx(), fileName);
        setMsg({ kind: 'info', text: `${fileName} 을 내려받았습니다. 제출 전에 한글에서 한 번 열어 쪽 나눔을 확인하세요` });
      }
      await editor.notifySaved(fileName).catch(() => {});
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message || '저장하지 못했습니다' });
    } finally { setBusy(''); }
  };

  const label = busy === 'engine' ? '처음 한 번 편집기(약 5MB)를 받는 중…' : busy === 'open' ? '여는 중…' : name ? '다른 파일 열기' : 'hwp·hwpx 파일 열기';

  return (
    <main className="he">
      <div className="he-wrap">
        <header className="he-hero">
          <p className="he-eyebrow"><Link href="/tools">계산·점검 도구</Link> · 한글 문서</p>
          <h1 className="he-h1">한글 문서 편집기</h1>
          <p className="he-lead">hwp·hwpx 문서를 브라우저에서 열어 쪽 모양 그대로 글자를 고치고 내려받습니다. 한글 프로그램이 없어도 됩니다. 글자만 찾아 바꾸려면 <Link href="/tools/hwp">한글 문서 열기·고치기</Link>가 더 빠릅니다.</p>
          <ul className="he-note">
            <li>원본 파일은 바뀌지 않습니다. 수정본은 「_수정」을 붙인 새 파일로 내려받습니다.</li>
            <li>저장은 hwpx 를 권합니다. hwp 저장은 바탕쪽(둘째 이후)·메모·수식 캡션이 빠질 수 있습니다.</li>
            <li>쪽 나눔과 글꼴은 한컴 한글과 다르게 보일 수 있습니다. 제출 전에는 한글에서 한 번 열어 확인하세요.</li>
            <li>처음 한 번 편집기 엔진(약 5MB)을 받습니다. 파일은 서버로 보내지 않고 이 브라우저 안에서만 다루며, 편집 중 초안도 브라우저에 남기지 않습니다.</li>
          </ul>
          <p className="he-mobile"><MonitorSmartphone size={16} aria-hidden /> 화면이 좁으면 편집이 불편합니다. 고치는 일은 데스크톱 브라우저를 권합니다.</p>
        </header>

        <section className="he-bar">
          <input ref={fileRef} type="file" accept=".hwp,.hwpx" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          <button className="he-btn he-btn-primary" onClick={() => fileRef.current?.click()} disabled={!!busy}><FileUp size={16} /> {label}</button>
          {kind && <>
            <span className="he-file">{name} · {pageCount}쪽</span>
            <span className="sp" />
            <button className="he-btn he-btn-primary" onClick={() => onSave('hwpx')} disabled={!!busy || blocked}><Download size={15} /> hwpx 로 저장</button>
            <button className="he-btn" onClick={() => onSave('hwp')} disabled={!!busy || blocked} title={HWP_WARNING}><Download size={15} /> hwp 로 저장</button>
          </>}
        </section>
        {msg && <p className={`he-msg ${msg.kind === 'error' ? 'is-error' : ''}`} role={msg.kind === 'error' ? 'alert' : 'status'}>{msg.text}</p>}

        <section className="he-frame" aria-label="한글 문서 편집 영역">
          <div ref={hostRef} className="he-host" />
          {!kind && (
            <div className="he-empty">
              <p>{busy === 'engine' ? '편집기를 준비하고 있습니다…' : '위의 「hwp·hwpx 파일 열기」로 문서를 고르세요.'}</p>
            </div>
          )}
        </section>

        <footer className="he-foot">
          편집기는 오픈소스 <a href="https://github.com/edwardkim/rhwp" target="_blank" rel="noreferrer">rhwp</a>(<a href="/hwp-editor/LICENSE-rhwp.txt" target="_blank">MIT</a>)의 rhwp-studio 를 이 사이트에서 빌드해 씁니다.
          글꼴은 Noto Sans KR(<a href="/hwp-editor/fonts/OFL-NotoSansKR.txt" target="_blank">SIL OFL 1.1</a>)·Noto Serif KR(<a href="/hwp-editor/fonts/OFL-NotoSerifKR.txt" target="_blank">SIL OFL 1.1</a>)입니다.
          빌드 방식은 <a href="https://github.com/pblsketch/openoffice" target="_blank" rel="noreferrer">이음오피스</a>(Apache-2.0)를 참고했습니다.
          본 제품은 한글과컴퓨터의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.
        </footer>
      </div>
    </main>
  );
}
