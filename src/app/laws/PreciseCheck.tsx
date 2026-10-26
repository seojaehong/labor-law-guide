'use client';
// AI 정밀 점검(시험 운영) — 파일을 이 창에 바로 올리고, 보고 싶은 내용·넣고 싶은 내용을 적어 조문별 AI 대조 결과를 받는다.
// 기본 점검(브라우저 안 낱말 대조)과 따로 움직인다. 결과는 노무사 검수 전 초안이고, 조문마다 맞음·틀림·애매 반응을 모은다.
import { useEffect, useId, useMemo, useRef, useState, type DragEvent } from 'react';
import Link from 'next/link';
import { Check, ClipboardCopy, FileDown, FileUp, Sparkles, X } from 'lucide-react';
import TurnstileWidget from '@/components/TurnstileWidget';
import { kindOf, MAX_FILE_BYTES, readDocText } from '@/lib/laws/doc-io';
import { splitArticles } from '@/lib/laws/precise/articles';
import { BATCH_RUNS, groupCount, NO_BASELINE } from '@/lib/laws/precise/judge';

export const PRECISE_ENABLED = process.env.NEXT_PUBLIC_WORK_RULES_PRECISE === '1';

type Row = Record<'조문' | '현행' | '개정안' | '개정 사유' | '근거·시행일' | '불이익변경' | '점검 결과' | '운영 메모' | '제안 문안', string>;
type Verdict = 'right' | 'wrong' | 'unsure';
type Doc = { name: string; text: string; articles: number };
/** 실행할 때의 입력 — 결과와 묶어 둔다. 화면 입력이 이것과 다르면 결과는 다른 조건의 것이다 */
type Snap = { name: string; doc: string; old: string | null; since: string; headcount: string; focus: string };
type Res = { runId: string; rows: Row[]; articles: number; input: Snap };

/** 문서 대조용 지문(FNV-1a 32비트). 본문을 상태에 두 벌 들고 있지 않으려고 쓴다 — 보안 용도가 아니다 */
function fingerprint(t: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 0x01000193);
  return `${t.length}:${(h >>> 0).toString(16)}`;
}
const sameSnap = (a: Snap, b: Snap | null) => !!b && a.doc === b.doc && a.old === b.old && a.since === b.since
  && a.headcount === b.headcount && a.focus === b.focus;
const ORDER = ['현행 수정 필요', '시행 예정', '회사 선택', '추가 확인'] as const;
const TONE: Record<string, string> = { '현행 수정 필요': 'fix', '시행 예정': 'soon', '회사 선택': 'choice', '추가 확인': 'check' };
const VERDICT_LABEL: [Verdict, string][] = [['right', '맞음'], ['wrong', '틀림'], ['unsure', '애매']];
const FOCUS_EXAMPLES = ['징계 절차가 우리 회사 규모로 운영 가능한지', '재택근무 조항을 넣고 싶다', '종전보다 불리해진 조문 위주로', '육아·모성보호 조항'];

async function readFile(f: File): Promise<Doc> {
  if (f.size > MAX_FILE_BYTES) throw new Error('파일은 10MB 이하만 읽습니다');
  const kind = kindOf(f.name);
  // kindOf 가 2026-10-25 부터 'pdf' 도 돌려준다(규칙표 점검은 읽는다).
  // 정밀 점검은 본문을 서버로 보내므로 **여기서는 지금까지대로 받지 않는다** — 읽기 품질이
  // 판단에 그대로 실리고, 스캔 쪽이 섞이면 조문이 빠진 채 판단이 나간다. 넓히려면 따로 정한다.
  if (!kind || kind === 'pdf') throw new Error('hwp·hwpx·docx 파일만 읽습니다. PDF 는 글자를 복사해 붙여넣어 주세요');
  const buf = await f.arrayBuffer();
  const text = kind === 'hwp' ? await (await import('@/lib/laws/hwp-read')).readHwpText(buf) : await readDocText(buf, kind);
  const articles = splitArticles(text).filter((a) => a.body.trim()).length;
  if (!articles) throw new Error('조문(제N조)을 찾지 못했습니다. 이미지로 된 문서는 글자를 직접 붙여넣어 주세요');
  return { name: f.name, text, articles };
}

function Drop({ label, hint, doc, onDoc, onClear, compact }: {
  label: string; hint: string; doc: Doc | null; onDoc: (d: Doc) => void; onClear: () => void; compact?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const take = async (f?: File) => {
    if (!f) return;
    setBusy(true); setErr(null);
    try { onDoc(await readFile(f)); } catch (e) { setErr((e as Error).message); } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files?.[0]); };
  if (doc) {
    return (
      <div className="lr-pc-file">
        <Check size={16} aria-hidden />
        <span className="name">{doc.name}</span>
        <span className="meta">조문 {doc.articles}개 인식</span>
        <button className="lr-icon-btn" onClick={onClear} aria-label={`${label} 지우기`}><X size={16} /></button>
      </div>
    );
  }
  return (
    <>
      <button type="button" className={`lr-pc-drop${over ? ' over' : ''}${compact ? ' compact' : ''}`} disabled={busy}
        onClick={() => ref.current?.click()} onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)} onDrop={onDrop}>
        <FileUp size={compact ? 16 : 22} aria-hidden />
        <span className="t">{busy ? '읽는 중…' : label}</span>
        <span className="h">{hint}</span>
      </button>
      <input ref={ref} type="file" accept=".hwp,.hwpx,.docx" hidden onChange={(e) => take(e.target.files?.[0])} />
      {err && <p className="lr-file-error" role="alert">{err}</p>}
    </>
  );
}

export type PreciseStatus = 'idle' | 'busy' | 'done';

// archived = 챗 화면에서 다음 질문이 온 뒤의 지난 결과. 입력·실행 칸은 접고 결과와 진행 상태만 남긴다
export default function PreciseCheck({ mainText, since, toast, archived = false, onStatus }: {
  mainText: string; since: string; toast: (m: string) => void; archived?: boolean; onStatus?: (s: PreciseStatus) => void;
}) {
  const titleId = useId();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [oldDoc, setOldDoc] = useState<Doc | null>(null);
  const [showOld, setShowOld] = useState(false);
  const [focus, setFocus] = useState('');
  const [headcount, setHeadcount] = useState('');
  const [store, setStore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<Res | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, Verdict>>({});
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const runSeq = useRef(0);

  // 파일이 없으면 위 「1. 취업규칙 본문」에 넣은 글을 쓴다
  const mainArticles = splitArticles(mainText).filter((a) => a.body.trim()).length;
  const source: Doc | null = doc ?? (mainArticles ? { name: '위에 입력한 본문', text: mainText, articles: mainArticles } : null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);
  useEffect(() => { onStatus?.(busy ? 'busy' : res ? 'done' : 'idle'); }, [busy, res, onStatus]);
  // 지금 화면의 입력 — 결과에 묶인 실행 당시 입력과 하나라도 다르면(진행 중에 바뀐 것 포함) 「다시 점검 필요」로 표시한다
  const sourceText = source?.text ?? '';
  const docPrint = useMemo(() => (sourceText ? fingerprint(sourceText) : ''), [sourceText]);
  const oldPrint = useMemo(() => (oldDoc ? fingerprint(oldDoc.text) : null), [oldDoc]);
  const now: Snap | null = source
    ? { name: source.name, doc: docPrint, old: oldPrint, since, headcount: headcount.trim(), focus: focus.trim() } : null;
  const stale = !!res && !(now && sameSnap(now, res.input));

  const run = async () => {
    if (!source || !now) return;
    const input = now; // 이 실행의 입력 — 응답이 오기 전에 화면 입력이 바뀌어도 결과는 이 값에 묶인다
    setBusy(true); setError(null); setRes(null); setMarks({}); setFilter(null); setElapsed(0);
    const seq = ++runSeq.current;
    const t0 = Date.now();
    timer.current = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    try {
      const r = await fetch('/api/tools/work-rules-precise', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rules: source.text, old: oldDoc?.text ?? null, since: input.since, headcount: input.headcount, focus: input.focus, store, turnstileToken }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.message ?? '정밀 점검을 하지 못했습니다.');
      if (seq !== runSeq.current) return; // 더 나중 실행이 있다
      setRes({ runId: body.runId, rows: body.rows, articles: body.articles, input });
      toast(`정밀 점검을 마쳤습니다 — 조문 ${body.articles}개 중 ${body.rows.filter((x: Row) => x['조문'] !== '신설 필요').length}건을 확인할 항목으로 올렸습니다`);
    } catch (e) {
      if (seq === runSeq.current) setError((e as Error).message);
    } finally {
      if (timer.current) clearInterval(timer.current);
      setBusy(false);
      // Turnstile 토큰은 1회용 — 비우고 재발급시킨다(PhotoUploadCard 와 같다)
      setTurnstileToken(null);
      try { window.turnstile?.reset(); } catch { /* ignore */ }
    }
  };

  const mark = async (article: string, verdict: Verdict) => {
    if (!res) return;
    setMarks((m) => ({ ...m, [article]: verdict }));
    const r = await fetch('/api/tools/work-rules-precise/feedback', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId: res.runId, article, verdict }),
    }).catch(() => null);
    if (!r?.ok) toast('의견을 저장하지 못했습니다. 화면 표시는 남겨 둡니다.');
  };

  // 내보내기는 화면의 현재 입력이 아니라 결과에 묶인 실행 당시 입력을 쓴다 — 다른 실행의 입력·결과가 섞이지 않게
  const downloadXlsx = async () => {
    if (!res) return;
    const { comparisonXlsx } = await import('@/lib/laws/comparison-xlsx');
    const head = ['조문', '현행', '개정안', '개정 사유', '근거·시행일', '불이익변경', '점검 결과', '운영 메모', '제안 문안'] as const;
    const s = res.input;
    const blob = await comparisonXlsx({
      title: '취업규칙 AI 정밀 점검 대조표',
      intro: [
        `점검 시작일 ${s.since.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')} 이후 시행 법령 기준 · AI 대조 초안(노무사 검수 전)`,
        `점검 대상: ${s.name}${s.old ? ' · 종전 규칙과 대조' : ' · 종전 규칙 미제공(불이익변경 비교 불가)'}${s.headcount ? ` · 상시 근로자 ${s.headcount}명` : ''}`,
        ...(s.focus ? [`점검 요청: ${s.focus}`] : []),
      ],
      head: [...head], rows: res.rows.map((x) => head.map((h) => x[h])), widths: [14, 40, 40, 36, 24, 12, 14, 30, 40],
      foot: ['AI 대조 결과는 노무사 검수 전 초안입니다. 불이익변경 여부와 최종 문안은 노무사 검토를 거쳐 정하세요.'],
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = '취업규칙_AI정밀점검.xlsx'; a.click();
    URL.revokeObjectURL(a.href);
  };

  const copy = async (t: string) => {
    try { await navigator.clipboard.writeText(t); toast('제안 문안을 복사했습니다'); } catch { toast('복사하지 못했습니다'); }
  };

  // 「신설 필요」는 본문에서 조문을 못 찾은 법령 기준이다 — 조문 판단과 섞지 않고 한 묶음으로 접는다
  const absent = res ? res.rows.filter((x) => x['조문'] === '신설 필요') : [];
  const rows = res ? res.rows.filter((x) => x['조문'] !== '신설 필요')
    .sort((a, b) => ORDER.indexOf(a['점검 결과'] as never) - ORDER.indexOf(b['점검 결과'] as never)) : [];
  const shown = filter ? rows.filter((x) => x['점검 결과'] === filter) : rows;
  const count = (k: string) => rows.filter((x) => x['점검 결과'] === k).length;
  const groups = source ? groupCount(source.articles) : 0;

  return (
    <section className="lr-pc" aria-labelledby={titleId}>
      <div className="lr-pc-head">
        <Sparkles size={18} aria-hidden />
        <h3 id={titleId}>AI 정밀 점검</h3>
        <span className="lr-badge rule">시험 운영 · 무료</span>
      </div>
      <p className="lr-pc-lead">조문마다 법령 기준 충족·종전 대비 불이익변경·운영 가능성을 AI 가 대조합니다. 보고 싶은 내용을 적으면 그 관점으로 함께 봅니다.</p>

      {!archived && <>
      <div className="lr-pc-step"><span className="n">1</span>취업규칙</div>
      {doc || !mainArticles
        ? <Drop label="취업규칙 파일 올리기" hint="hwp·hwpx·docx · 끌어다 놓거나 눌러서 선택" doc={doc} onDoc={setDoc} onClear={() => setDoc(null)} />
        : (
          <div className="lr-pc-file">
            <Check size={16} aria-hidden /><span className="name">위에 입력한 본문</span><span className="meta">조문 {mainArticles}개 인식</span>
            <Drop label="다른 파일로" hint="" doc={null} onDoc={setDoc} onClear={() => {}} compact />
          </div>
        )}
      {showOld || oldDoc
        ? <Drop label="종전(개정 전) 취업규칙 올리기" hint="넣으면 근로조건이 낮아진 조문(불이익변경)을 함께 대조합니다" doc={oldDoc} onDoc={setOldDoc} onClear={() => { setOldDoc(null); setShowOld(false); }} compact />
        : <button className="lr-pc-link" onClick={() => setShowOld(true)}>+ 종전 규칙과 비교하기(불이익변경 대조)</button>}
      {/* 한 벌만 올리면 결과가 넓어진다 — 그 사실을 결과가 아니라 올리기 전에 알린다(2026-10-26) */}
      {source && !oldDoc && (
        <p className="lr-pc-hint">
          <b>종전 규칙도 올리시면 결과가 좁아집니다.</b> 두 벌을 대조하면 <b>근로조건이 낮아진 조문</b>만
          골라낼 수 있습니다. 한 벌만 올리면 법령 기준으로 전체를 훑기 때문에 확인할 조문이 많아집니다.
        </p>
      )}

      <div className="lr-pc-step"><span className="n">2</span>보고 싶은 내용·넣고 싶은 내용 <span className="opt">선택</span></div>
      <textarea className="lr-pc-focus" value={focus} onChange={(e) => setFocus(e.target.value.slice(0, 1000))} rows={3}
        aria-label="보고 싶은 내용이나 넣고 싶은 내용"
        placeholder="예) 징계위원회·재심 절차를 우리 규모로 운영할 수 있는지 봐 주세요. 재택근무 조항도 넣고 싶습니다." />
      <div className="lr-pc-chips">
        {FOCUS_EXAMPLES.map((x) => (
          <button key={x} className="lr-chip" onClick={() => setFocus((f) => (f.trim() ? `${f.trim()}\n${x}` : x))}>+ {x}</button>
        ))}
      </div>

      <div className="lr-pc-step"><span className="n">3</span>사업장 정보</div>
      <label className="lr-pc-field">상시 근로자 수
        <input value={headcount} onChange={(e) => setHeadcount(e.target.value.replace(/[^\d]/g, '').slice(0, 6))} inputMode="numeric" placeholder="예) 24" aria-label="상시 근로자 수" /> 명
        <span className="h">위원회·재심 인원처럼 규모에 따라 달라지는 조문을 보는 데 씁니다</span>
      </label>

      <div className="lr-pc-run">
        <p className="lr-pc-notice">
          실행하면 본문 전체가 우리 서버를 거쳐 외부 AI 제공사(Anthropic)로 전송됩니다. 보관에 동의하지 않으면 조문 본문은 저장하지 않고 점검 결과만 남깁니다.
        </p>
        <label className="lr-pc-consent"><input type="checkbox" checked={store} onChange={(e) => setStore(e.target.checked)} /> 점검 개선을 위해 본문 보관에 동의합니다(선택 · 체크하지 않으면 본문은 저장하지 않습니다)</label>
        <TurnstileWidget onToken={setTurnstileToken} />
        <button className="lr-btn lr-pc-go" onClick={run} disabled={busy || !source}>
          <Sparkles size={16} aria-hidden /> {busy ? `대조하는 중… ${elapsed}초` : source ? `AI 정밀 점검 실행 (조문 ${source.articles}개)` : '취업규칙을 먼저 올려 주세요'}
        </button>
      </div>
      </>}
      <div className="lr-pc-status">
        {busy && (
          // 서버가 진행 정보를 주지 않으므로 완료율처럼 보이는 막대 대신 흐르는 막대와 경과 초만 보인다
          <div className="lr-pc-progress" role="status">
            <div className="bar indeterminate" aria-hidden><i /></div>
            <span>경과 {elapsed}초 · 조문 {source?.articles}개를 {groups}묶음으로 나눠 묶음마다 {BATCH_RUNS}번씩 대조하고 있습니다. 보통 1~2분 걸립니다.</span>
          </div>
        )}
        {error && <p className="lr-file-error" role="alert">{error}</p>}
      </div>

      {res && (
        <div className="lr-pc-result" aria-live="polite">
          {stale && (
            <p className="lr-pc-stale" role="status">
              조건이 바뀌어 다시 점검이 필요합니다. 아래 결과와 대조표 엑셀은 실행할 때의 조건(파일·종전 규칙·점검 시작일·상시 근로자 수·점검 요청)으로 대조한 것입니다.
            </p>
          )}
          <p className="lr-pc-basis">
            실행 조건 · {res.input.name} · 점검 시작일 {res.input.since.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1. $2. $3.')} 이후 시행 법령
            {res.input.old ? ' · 종전 규칙과 대조' : ''}{res.input.headcount ? ` · 상시 근로자 ${res.input.headcount}명` : ''}{res.input.focus ? ' · 점검 요청 있음' : ''}
          </p>
          {!res.input.old && (
            <p className="lr-check-note">종전 규칙을 넣지 않아 불이익변경은 대조하지 않았습니다(비교 불가 — 종전 규칙 미제공). 불리해진 조문이 없다는 뜻이 아닙니다.</p>
          )}
          <div className="lr-pc-sum" role="group" aria-label="점검 결과로 거르기">
            {ORDER.map((k) => (
              <button key={k} className={`t-${TONE[k]}`} aria-pressed={filter === k} onClick={() => setFilter(filter === k ? null : k)}>
                <b>{count(k)}</b>{k}
              </button>
            ))}
            <span className="sp" />
            <button className="lr-btn lr-btn-ghost lr-btn-sm" onClick={downloadXlsx}><FileDown size={14} /> 대조표 엑셀</button>
          </div>
          {!rows.length && <p className="lr-check-empty">확인할 조문이 없습니다.</p>}
          {shown.map((x) => (
            <article key={x['조문'] + x['개정 사유']} className={`lr-pc-row t-${TONE[x['점검 결과']] ?? 'check'}`}>
              <header>
                <b>{x['조문']}</b>
                <span className="lr-pc-tag">{x['점검 결과']}</span>
                {/* 「비교 불가」는 경고가 아니다 — 위 안내 한 줄로 알리고 조문마다 붙이지 않는다 */}
                {x['불이익변경'] !== '해당 없음' && x['불이익변경'] !== NO_BASELINE
                  && <span className="lr-pc-tag warn">불이익변경 {x['불이익변경']}</span>}
                <span className="sp" />
                <span className="lr-pc-vote" role="group" aria-label={`${x['조문']} 점검 결과가 맞는지`}>
                  {VERDICT_LABEL.map(([v, label]) => (
                    <button key={v} aria-pressed={marks[x['조문']] === v} onClick={() => mark(x['조문'], v)}>{label}</button>
                  ))}
                </span>
              </header>
              {x['개정 사유'] && <p className="why">{x['개정 사유']}</p>}
              <dl>
                {x['근거·시행일'] && <><dt>근거</dt><dd>{x['근거·시행일']}</dd></>}
                {x['운영 메모'] && <><dt>운영 메모</dt><dd>{x['운영 메모']}</dd></>}
              </dl>
              {x['제안 문안'] && (
                <details>
                  <summary>제안 문안 보기</summary>
                  <pre className="lr-precise-text">{x['제안 문안']}</pre>
                  <button className="lr-btn lr-btn-ghost lr-btn-sm" onClick={() => copy(x['제안 문안'])}><ClipboardCopy size={14} /> 복사</button>
                </details>
              )}
              {(x['현행'] || x['개정안']) && (
                <details>
                  <summary>원문 보기</summary>
                  <div className="lr-pc-src">
                    {x['현행'] && <div><span>종전</span><pre>{x['현행']}</pre></div>}
                    {x['개정안'] && <div><span>{x['현행'] ? '개정안' : '현행'}</span><pre>{x['개정안']}</pre></div>}
                  </div>
                </details>
              )}
            </article>
          ))}
          {absent.length > 0 && (
            <details className="lr-missing">
              <summary>본문에서 해당 조문을 찾지 못한 법령 기준 {absent.length}건</summary>
              <ul>{absent.map((x) => <li key={x['개정 사유']}><b>{x['개정 사유']}</b> · {x['근거·시행일']}</li>)}</ul>
              <p className="lr-check-note">조문이 없거나 다른 표현으로 적혀 있을 수 있습니다. 해당 제도를 운영하지 않으면 무시하세요.</p>
            </details>
          )}
          <p className="lr-check-note">
            AI 대조 결과는 노무사 검수 전 초안입니다. 조문마다 「맞음·틀림·애매」를 눌러 주시면 점검 기준을 고치는 데 씁니다.{' '}
            <Link href="/contact">노무사 검토 신청</Link>
          </p>
        </div>
      )}
    </section>
  );
}
