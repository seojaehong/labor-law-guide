'use client';
// 취업규칙 점검 — 챗 화면. 아래 입력창에 본문을 붙여넣거나 파일을 올리면 결과가 답변 말풍선으로 쌓인다(261022 재홍님 요청).
// 판정은 창(/laws)과 같은 부품을 쓴다: 기간별 대조(PeriodResults, 브라우저 안) → AI 정밀 점검(PreciseCheck, 실행할 때만 전송).
import { useEffect, useRef, useState, type DragEvent } from 'react';
import Link from 'next/link';
import { FileText, FileUp, Paperclip, Scale, Send, ShieldCheck, Sparkles, X } from 'lucide-react';
import { splitArticles } from '@/lib/laws/standard-check';
import { fmtDate, todayKST } from '@/lib/laws/format';
import { HwpNotice, PeriodControls, PeriodResults, readRulesFile, SAMPLE, useReviewData, type Data, type RulesSource } from '../../laws/RulesCheck';
import PreciseCheck, { PRECISE_ENABLED, type PreciseStatus } from '../../laws/PreciseCheck';
import { ObservationNotice } from '../../laws/ObservationCapture';
import { useObservationAvailability } from '../../laws/observation-availability';

type Turn = { id: string; text: string; name: string; articles: number; source: RulesSource | null; rulesOnly: boolean; from: string; to: string };

function TurnView({ turn, last, data, loadError, retry, toast }: {
  turn: Turn; last: boolean; data: Data | null; loadError: boolean; retry: () => void; toast: (m: string) => void;
}) {
  const [runId, setRunId] = useState(() => crypto.randomUUID());
  const currentRun = useRef(runId);
  const fresh = () => { const next = crypto.randomUUID(); currentRun.current = next; setRunId(next); };
  const [ai, setAi] = useState<PreciseStatus>('idle');
  return (
    <>
      <div className="wr-msg user" id={`wr-turn-${turn.id}`}>
        <div className="wr-bubble">
          <div className="wr-file"><FileText size={15} aria-hidden /> <b>{turn.name}</b>{turn.articles > 0 && <span> · 조문 {turn.articles}개</span>}</div>
          <div className="wr-sub">{fmtDate(turn.from)} 다음 날 ~ {fmtDate(turn.to)} 시행 개정 기준</div>
          {turn.text && (
            <details className="wr-src"><summary>보낸 본문 보기</summary><pre>{turn.text}</pre></details>
          )}
        </div>
      </div>
      <div className="wr-msg bot">
        <span className="wr-avatar" aria-hidden><Scale size={16} /></span>
        <div className="wr-bubble wide">
          <p className="wr-say">
            {turn.articles > 0
              ? '표준취업규칙 조문과 이 기간에 시행된 개정 법령을 맞춰 봤습니다. 고칠 것부터 보여 드립니다.'
              : '본문 없이 이 기간 개정으로 바꿀 문안만 모았습니다. 본문을 보내 주시면 조문마다 맞춰 봅니다.'}
          </p>
          <PeriodResults data={data} loadError={loadError} onRetry={() => { retry(); fresh(); }} text={turn.text} from={turn.from} to={turn.to}
            source={turn.source} runId={runId} currentRun={currentRun} onFresh={fresh} toast={toast} ownNotice={false} />
        </div>
      </div>
      {/* 다음 질문이 와도 지난 AI 결과는 남긴다. 실행하지 않은 지난 차례의 AI 말풍선만 숨긴다(상태 보존을 위해 마운트는 유지) */}
      {turn.rulesOnly && <p className="lr-check-note">PDF에서 읽은 본문은 기본 점검만 합니다. AI 정밀 점검과 원본 반영은 제공하지 않습니다.</p>}
      {PRECISE_ENABLED && !turn.rulesOnly && turn.articles > 0 && (
        <div className="wr-msg bot" hidden={!last && ai === 'idle'}>
          <span className="wr-avatar ai" aria-hidden><Sparkles size={16} /></span>
          <div className="wr-bubble wide">
            <p className="wr-say">
              {last ? '조문마다 AI 로 더 자세히 대조할 수 있습니다. 종전 규칙을 함께 올리면 근로조건이 낮아진 조문(불이익변경)도 봅니다.' : '앞서 보낸 본문으로 실행한 AI 정밀 점검 결과입니다.'}
            </p>
            <p className="wr-basis">
              기준 · <a href={`#wr-turn-${turn.id}`}>{turn.name}{turn.articles > 0 ? `(조문 ${turn.articles}개)` : ''}</a> · {fmtDate(turn.from)} 다음 날부터 시행된 법령
            </p>
            <PreciseCheck mainText={turn.text} since={turn.from} toast={toast} archived={!last} onStatus={setAi} />
          </div>
        </div>
      )}
    </>
  );
}

export default function WorkRulesClient() {
  const today = todayKST();
  const { data, loadError, retry } = useReviewData();
  const observationAvailability = useObservationAvailability();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [attached, setAttached] = useState<{ name: string; source: RulesSource | null; rulesOnly: boolean } | null>(null);
  // 수집 시작이 2023.1.1. 로 내려가 기본값을 「2025년 초에 고친 취업규칙」으로 둔다(재홍님 예시)
  const [from, setFrom] = useState('20250101');
  const [to, setTo] = useState(today);
  const [showPeriod, setShowPeriod] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [message, setMessage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const articles = splitArticles(draft).length;
  const periodOk = from < to;
  const canSend = periodOk && articles > 0 && !busy;
  const lastUpcoming = data?.events.reduce((m, e) => (e.date > m ? e.date : m), today) ?? today;

  // 보낸 직후에는 새 질문 말풍선이 화면 위쪽에 오게 한다(결과는 그 아래로 이어진다)
  const lastId = turns[turns.length - 1]?.id;
  useEffect(() => {
    if (lastId) document.getElementById(`wr-turn-${lastId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [lastId]);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(''), 3500);
    return () => clearTimeout(t);
  }, [message]);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (fileRef.current) fileRef.current.value = '';
    setFileError(null);
    setBusy(true);
    try {
      const r = await readRulesFile(f);
      setDraft(r.text);
      setAttached({ name: f.name, source: r.source, rulesOnly: r.rulesOnly });
      setMessage(`${f.name} — 이 브라우저 안에서 글자만 읽었습니다`);
    } catch (e) {
      setFileError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files?.[0]); };

  const send = (text: string) => {
    const n = splitArticles(text).length;
    const fromFile = !!attached && text === draft;
    const name = fromFile ? attached.name : text === SAMPLE ? '예시 취업규칙' : text.trim() ? '붙여넣은 본문' : '본문 없이 기간만';
    // 반영 단계(HwpApply)는 파일에서 읽은 글자 그대로일 때만 원본 바이트를 쓴다
    const source = fromFile && attached.source?.text === text ? attached.source : null;
    setTurns((t) => [...t, { id: crypto.randomUUID(), text, name, articles: n, source, rulesOnly: !!(fromFile && attached.rulesOnly), from, to }]);
    setDraft('');
    setAttached(null);
    setFileError(null);
  };

  return (
    <div className="lr wr"><div className="lr-wrap wr-wrap">
      <header className="wr-head">
        <h1 className="lr-h1">취업규칙 점검</h1>
        <p className="lr-review-note">법령 검수 전 참고 자료입니다. 결과와 제안 문안은 법령 원문과 대조해 확인하세요.</p>
      </header>

      <div className="wr-thread" aria-live="polite">
        <div className="wr-msg bot">
          <span className="wr-avatar" aria-hidden><Scale size={16} /></span>
          <div className="wr-bubble">
            <p className="wr-say">취업규칙 본문을 아래에 붙여넣거나 hwp·hwpx·docx·pdf 파일을 올려 주세요. PDF는 글자층이 있는 파일을 기본 점검에서만 읽습니다.</p>
            <ul className="wr-list">
              <li>먼저 고용노동부 표준취업규칙과 이 기간에 시행된 개정 법령에 맞춰 고칠 조문을 찾습니다. 이 단계는 이 브라우저 안에서만 합니다.</li>
              {PRECISE_ENABLED && <li>이어서 원하시면 조문마다 AI 정밀 점검을 합니다. 종전 규칙을 함께 올리면 불이익변경도 대조합니다.</li>}
              <li>점검 기간은 「내 취업규칙 최종 개정일」 다음 날부터입니다. 지금은 {fmtDate(from)} ~ {fmtDate(to)}로 잡혀 있습니다.</li>
            </ul>
            <div className="wr-quick">
              <button type="button" className="lr-chip" onClick={() => send(SAMPLE)}>예시 취업규칙으로 해보기</button>
              <button type="button" className="lr-chip" onClick={() => send('')} disabled={!periodOk}>본문 없이 이 기간 바뀐 문안만 보기</button>
              <button type="button" className="lr-chip" onClick={() => setShowPeriod(true)}>점검 기간 바꾸기</button>
            </div>
          </div>
        </div>

        {turns.map((t, i) => (
          <TurnView key={t.id} turn={t} last={i === turns.length - 1} data={data} loadError={loadError} retry={retry} toast={setMessage} />
        ))}
        {/* 관리자 기록 기능 안내는 결과마다 붙이지 않고 대화 끝에 한 번만 */}
        {turns.some((t) => t.articles > 0) && <ObservationNotice availability={observationAvailability} />}
      </div>

      <form className={`wr-composer${over ? ' over' : ''}`} onSubmit={(e) => { e.preventDefault(); if (canSend) send(draft); }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
        {showPeriod && (
          <div className="wr-period">
            <PeriodControls data={data} from={from} to={to} today={today} lastUpcoming={lastUpcoming} setFrom={setFrom} setTo={setTo} />
            <button type="button" className="lr-icon-btn" onClick={() => setShowPeriod(false)} aria-label="점검 기간 닫기"><X size={16} /></button>
          </div>
        )}
        {attached && (
          <div className="wr-attach"><Paperclip size={14} aria-hidden /> {attached.name} · 조문 {articles}개 인식
            <button type="button" className="lr-icon-btn" onClick={() => { setAttached(null); setDraft(''); }} aria-label="올린 파일 빼기"><X size={14} /></button>
          </div>
        )}
        {fileError && <p className="lr-file-error" role="alert">파일을 읽지 못했습니다: {fileError}</p>}
        {draft.trim() && !articles && <p className="lr-file-error" role="status">조문을 인식하지 못했습니다. 제1조(제목)처럼 조문 번호가 줄 처음에 오도록 넣어 주세요.</p>}
        <div className="wr-row">
          <input ref={fileRef} type="file" accept=".hwpx,.docx,.hwp,.pdf" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          <button type="button" className="wr-attach-btn" onClick={() => fileRef.current?.click()} disabled={busy} aria-label="hwp·hwpx·docx·pdf 파일 올리기" title="hwp·hwpx·docx·pdf 파일 올리기">
            <FileUp size={18} />
          </button>
          <textarea value={draft} rows={1} aria-label="취업규칙 본문"
            onChange={(e) => { setDraft(e.target.value); if (attached && e.target.value !== attached.source?.text) setAttached({ ...attached, source: null }); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canSend) { e.preventDefault(); send(draft); } }}
            placeholder={busy ? '파일을 읽는 중…' : '취업규칙 본문을 붙여넣거나 파일을 끌어다 놓으세요'} />
          <button type="submit" className="lr-btn wr-send" disabled={!canSend} aria-label="점검하기"><Send size={16} /> 점검</button>
        </div>
        <div className="wr-meta">
          <button type="button" className="wr-period-btn" onClick={() => setShowPeriod((v) => !v)}>점검 기간 {fmtDate(from)} ~ {fmtDate(to)}</button>
          {/* 좁은 화면에서도 숨기지 않고 짧은 문장으로 바꾼다 */}
          <span className="wr-privacy"><ShieldCheck size={13} aria-hidden />
            <span className="long">{PRECISE_ENABLED ? '기본 점검은 브라우저 안에서만 합니다. AI 정밀 점검을 실행할 때만 본문이 외부 AI 제공사로 전송됩니다.' : '본문과 파일은 이 브라우저 안에서만 읽고 점검합니다.'}</span>
            <span className="short">{PRECISE_ENABLED ? 'AI 점검 실행 때만 본문이 외부 AI로 전송됩니다' : '본문은 이 브라우저 안에서만 읽습니다'}</span>
          </span>
        </div>
      </form>

      <footer className="wr-foot">
        <HwpNotice />
        <p><Link href="/laws">법령 개정 현황</Link> · <Link href="/tools">근로계약서 점검·공휴일 수당·퇴직금 계산</Link></p>
      </footer>
    </div>{message && <div className="lr-toast" role="status">{message}</div>}</div>
  );
}
