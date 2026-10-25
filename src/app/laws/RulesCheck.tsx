'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import type { HwpSource } from './HwpApply';
import { canApplyText } from '@/lib/hwp/apply-guard';
import ObservationCapture, { ObservationNotice } from './ObservationCapture';
import { useObservationAvailability, type ObservationAvailability } from './observation-availability';
import { MATCHER_VERSION, RULE_VERSION } from '@/lib/laws/observation-version';
import type { CaptureContext, Observation } from '@/lib/laws/observation-payload';
import { CalendarClock, ClipboardCopy, FileDown, FileUp, ShieldCheck, X } from 'lucide-react';
import { type Verdict } from '@/lib/laws/rules-check';
import { periodCheck, splitArticles, STD_ASOF, type Art93Item, type PeriodItem, type StdArticle, type StdRule } from '@/lib/laws/standard-check';
import { compareDocx, MAX_FILE_BYTES, kindOf, readDocText } from '@/lib/laws/doc-io';
import {
  citation,
  compareTable,
  copyRich,
  ddayLabel,
  download,
  fmtDate,
  icsCalendar,
  prepCalItems,
  todayKST,
  type LawEvent,
} from '@/lib/laws/format';
import PreciseCheck, { PRECISE_ENABLED } from './PreciseCheck';

export const SAMPLE = `제22조(휴게) ① 회사는 근로시간이 4시간인 경우에는 30분 이상, 8시간인 경우에는 1시간 이상의 휴게시간을 근로시간 도중에 준다.
제30조(연차유급휴가) ① 회사는 1년간 80퍼센트 이상 출근한 근로자에게 15일의 유급휴가를 준다.
제40조(배우자 출산휴가) ① 회사는 근로자가 배우자의 출산을 이유로 휴가를 청구하는 경우 10일의 유급휴가를 준다.
② 배우자 출산휴가는 배우자가 출산한 날부터 90일이 지나면 사용할 수 없다.
제41조(난임치료휴가) ① 회사는 근로자가 난임치료를 받기 위하여 휴가를 청구하는 경우 연간 3일 이내의 휴가를 주며, 이 경우 최초 1일은 유급으로 한다.
제42조(육아휴직) ① 회사는 근로자가 만 8세 이하 또는 초등학교 2학년 이하의 자녀를 양육하기 위하여 휴직을 신청하는 경우에 이를 허용한다.
제43조(육아기 근로시간 단축) ① 회사는 근로자가 근로시간의 단축을 신청하는 경우에 이를 허용한다. 다만, 대체인력 채용이 불가능한 경우에는 그러하지 아니하다.`;

export interface Data {
  std: StdArticle[];
  events: LawEvent[];
  rules: StdRule[];
  art93: Art93Item[];
  since: string;
  rulesVersion: string;
}

let dataPromise: Promise<Data> | null = null;
const readData = async (path: string) => {
  const response = await fetch(path);
  if (!response.ok) throw new Error('점검 자료를 불러오지 못했습니다');
  return response.json();
};
const loadData = () => (dataPromise ??= Promise.all([
  readData('/data/laws/standard.json'), readData('/data/laws/index.json'), readData('/data/laws/rules.json'),
]).then(async ([s, i, r]) => {
  if (!Array.isArray(s.articles) || !s.articles.length || !Array.isArray(i.events) || !Array.isArray(r.rules) || !r.rules.length || !/^\d{8}$/.test(i.since)) throw new Error('Invalid review data');
  const bytes = new TextEncoder().encode(JSON.stringify([s, i, r]));
  const rulesVersion = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
  return { std: s.articles, events: i.events, rules: r.rules, art93: s.art93 ?? [], since: i.since, rulesVersion };
}).catch(error => { dataPromise = null; throw error; }));

/** 점검 자료(표준취업규칙·개정 이벤트·매핑)를 한 번 읽는다 — 창(/laws)과 챗 화면(/tools/work-rules)이 같이 쓴다 */
export function useReviewData() {
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    loadData().then(d => { if (active) setData(d); }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [attempt]);
  return { data, loadError, retry: () => { setLoadError(false); setAttempt((n) => n + 1); } };
}

export type RulesSource = HwpSource & { text: string };

/** 올린 hwp·hwpx·docx 를 이 브라우저 안에서 글자로 읽는다. hwp·hwpx 는 반영 단계용 원본 바이트도 돌려준다 */
/** pdf 본문 — rules-review 가 이미 만들어 둔 것을 그대로 쓴다(2026-10-25).
 *
 *  따로 만들지 않는 이유. `src/lib/rules-review/pdf.ts` 는 머리말·꼬리말을 빼고
 *  한국어 조사를 보며 끊긴 줄을 다시 잇는다. 같은 것을 여기 또 만들면 두 벌이 갈린다.
 *  스캔 쪽은 **OCR 로 넘기지 않는다** — 여기서는 글자만 읽고, 그림뿐이면 붙여넣으라고 말한다.
 *  (OCR 은 /tools/rules-review 에서 담당자 동의를 받고 돈다. 이 화면은 그 동의 절차가 없다.) */
async function readPdfPlainText(bytes: Uint8Array): Promise<string> {
  const { loadPdfLib } = await import('@/lib/rules-review/pdf-browser');
  const { readPdf, SCANNED_BELOW } = await import('@/lib/rules-review/pdf');
  const { lines, pages } = await readPdf(bytes, await loadPdfLib());
  const text = lines.map((l) => l.text).join('\n');
  const scanned = pages.filter((p) => p.scanned).length;
  if (!text.trim()) {
    throw new Error(scanned
      ? `글자 없이 그림만 있는 쪽이 ${scanned}쪽입니다. 글자를 직접 붙여넣으세요`
      : '본문에서 읽을 수 있는 글자가 없습니다. 글자를 직접 붙여넣으세요');
  }
  if (scanned) throw new Error(`${pages.length}쪽 중 ${scanned}쪽이 그림입니다(글자 ${SCANNED_BELOW}자 미만). 그 쪽은 빠지므로 글자를 직접 붙여넣으세요`);
  return text;
}

export async function readRulesFile(f: File): Promise<{ text: string; source: RulesSource | null }> {
  if (f.size > MAX_FILE_BYTES) throw new Error('파일은 10MB 이하만 읽습니다');
  const kind = kindOf(f.name);
  if (!kind) throw new Error('hwp·hwpx·docx·pdf 파일만 읽습니다');
  const buf = await f.arrayBuffer();
  const t = kind === 'hwp'
    ? await (await import('@/lib/laws/hwp-read')).readHwpText(buf.slice(0))
    : kind === 'pdf'
      ? await readPdfPlainText(new Uint8Array(buf.slice(0)))
      : await readDocText(buf.slice(0), kind);
  if (!t.trim()) throw new Error('본문에서 읽을 수 있는 글자가 없습니다. 이미지 문서는 글자를 직접 붙여넣으세요. 기존 입력은 유지됩니다.');
  // 반영(HwpApply)은 한글 파일만 — docx·pdf 는 원본에 되쓰지 않는다
  return { text: t, source: kind === 'docx' || kind === 'pdf' ? null : { bytes: new Uint8Array(buf), name: f.name, kind, text: t } };
}

// 반영 단계는 rhwp WASM 을 쓰므로 파일을 올리고 결과가 나온 뒤에만 불러온다
const HwpApply = dynamic(() => import('./HwpApply'), { ssr: false, loading: () => <div className="lr-check-empty">반영 도구를 불러오는 중…</div> });

const toIso = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
const fromIso = (d: string) => d.replace(/-/g, '');

const LABEL: Record<PeriodItem['status'], string> = {
  '고칠 것': 'fix',
  '조문 추가': 'fix',
  선택: 'opt',
  '법령 확인': 'info',
  반영됨: 'ok',
};

// 제안 문안은 **법이 정한 최저 기준**이다. 회사 규정이 이미 더 유리한데 이대로 바꾸면 낮아진다.
// 2026-10-21 실사용 검토에서 실제로 났다 — 육아기 근로시간 단축을 3년 주던 회사가
// 제안 문안(1년+α)으로 바꿔 깎였다. 도구가 불이익 변경을 유도한 셈이다.
// 자동으로 가려내려면 조문별 유불리 비교가 필요하고 그건 아직 없다. 그때까지는 **붙여넣는 글에 같이 따라가게** 둔다.
export const FLOOR_NOTE =
  '[확인] 이 문안은 법이 정한 최저 기준입니다. 회사 규정이 이미 이보다 유리하면 그대로 두십시오. '
  + '낮추면 근로기준법 제94조제1항 단서의 불이익 변경이 되어 과반수의 동의가 필요합니다.';

function clauseText(v: Verdict) {
  const p = v.rule.mst ? { date: '', no: '', kind: '', mst: v.rule.mst } : undefined;
  return `${v.rule.clause}\n\n(근거) ${v.rule.law} ${v.rule.article}, ${fmtDate(v.rule.effective)} 시행\n${citation(v.rule.law, p, v.rule.effective).split('\n')[1]}\n${FLOOR_NOTE}`;
}

/** 근거 한 줄씩 — 개정 이벤트(바뀐 조문) + 매핑 */
function basis(it: PeriodItem): string[] {
  const lines = it.events.map(({ event: e, articles }) => `${e.short} ${articles.join('·')} (${fmtDate(e.date)} 시행)`);
  for (const v of it.verdicts) {
    const l = `${v.rule.law} ${v.rule.article} (${fmtDate(v.rule.effective)} 시행)`;
    if (!lines.some((x) => x.startsWith(`${v.rule.law} ${v.rule.article}`))) lines.push(l);
  }
  return lines;
}

const mine = (it: PeriodItem) => it.user.map((u) => u.text).join('\n');
const proposal = (it: PeriodItem) =>
  it.proposal ?? '바뀐 법령 조문을 확인해 반영 여부를 정하세요(자동 문안 없음)';

export default function RulesCheck({ onClose, toast }: { onClose: () => void; toast: (m: string) => void }) {
  const today = todayKST();
  const { data, loadError, retry } = useReviewData();
  const [text, updateText] = useState('');
  const [runId, setRunId] = useState(() => crypto.randomUUID());
  const currentRun = useRef(runId);
  const freshRun = () => { const next=crypto.randomUUID();currentRun.current=next;setRunId(next); };
  const setText = (value: string) => { updateText(value); freshRun(); };
  // 수집 시작이 2023.1.1. 로 내려가 기본값을 「2025년 초에 고친 취업규칙」으로 둔다(재홍님 예시)
  const [from, updateFrom] = useState('20250101');
  const setFrom = (value: string) => { updateFrom(value); freshRun(); };
  const [to, updateTo] = useState(today);
  const setTo = (value: string) => { updateTo(value); freshRun(); };
  const [busy, setBusy] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  // 올린 한글 파일 — 반영 단계가 원본 바이트에서 새 파일을 만든다. text = 그 파일에서 읽은 글자(본문 칸과 같을 때만 반영)
  const [source, setSource] = useState<RulesSource | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const nodes = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea, a[href], input:not(:disabled), summary') ?? [])].filter(el => el.getClientRects().length);
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; previous?.focus(); };
  }, [onClose]);

  const lastUpcoming = data?.events.reduce((m, e) => (e.date > m ? e.date : m), today) ?? today;

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (fileRef.current) fileRef.current.value = '';
    setFileError(null);
    setBusy(true);
    try {
      const r = await readRulesFile(f);
      setText(r.text);
      setSource(r.source);
      toast(`${f.name} — 이 브라우저 안에서 글자만 읽었습니다`);
    } catch (e) {
      setFileError((e as Error).message);
      toast(`파일을 읽지 못했습니다: ${(e as Error).message}`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="lr-modal" role="dialog" aria-modal="true" aria-label="취업규칙 점검" onClick={onClose}>
      <div ref={dialogRef} className="lr-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="lr-modal-head">
          <div>
            <div className="lr-eyebrow">취업규칙 점검</div>
            <h2>기간별 개정 관련 항목 확인</h2><p className="lr-review-note">법령 검수 전 · 자동 문구 대조 결과는 법률 판단이 아닙니다.</p>
          </div>
          <button className="lr-icon-btn" onClick={onClose} aria-label="닫기"><X size={18} /></button>
        </div>

        <PeriodControls data={data} from={from} to={to} today={today} lastUpcoming={lastUpcoming} setFrom={setFrom} setTo={setTo} />

        <div className="lr-check">
          <div className="lr-check-in"><h3 className="lr-input-title">1. 취업규칙 본문 입력</h3>
            <textarea
              ref={ref}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'취업규칙 본문을 붙여넣거나 hwp·hwpx·docx 파일을 올리세요.\n비워 두면 이 기간 개정의 바꿀 문안만 모아 드립니다.\n조문 머리(제○조(…))가 줄 머리에 있으면 표준취업규칙 조문과 짝지어 판정합니다.\nPDF에서 복사한 본문은 글자 순서가 섞여 판정이 틀릴 수 있습니다. 한글·워드 원본을 권합니다.'}
              aria-label="취업규칙 본문"
            />
            {fileError && <p className="lr-file-error" role="alert">파일을 읽지 못했습니다: {fileError}</p>}
            <div className="lr-check-meta">
              <ShieldCheck size={14} /> {PRECISE_ENABLED
                ? '기본 점검은 이 브라우저 안에서만 합니다. 아래 「정밀 점검」을 실행할 때만 본문 전체가 외부 AI 제공사로 전송됩니다.'
                : '본문과 파일은 이 브라우저 안에서만 읽고 판정합니다. 서버로 보내지 않습니다.'}
              <span className="sp" />
              <input ref={fileRef} type="file" accept=".hwpx,.docx,.hwp,.pdf" hidden onChange={(e) => onFile(e.target.files?.[0])} />
              <button className="lr-btn lr-btn-ghost lr-btn-sm" onClick={() => fileRef.current?.click()} disabled={busy}><FileUp size={14} /> {busy ? '읽는 중…' : 'hwp·hwpx·docx 올리기'}</button>
              {!text && <button className="lr-btn lr-btn-ghost lr-btn-sm" onClick={() => setText(SAMPLE)}>예시로 해보기</button>}
              {text && <button className="lr-btn lr-btn-ghost lr-btn-sm" onClick={() => setText('')}>지우기</button>}
            </div>
            <HwpNotice />
          </div>

          <div className="lr-check-out" aria-live="polite">
            <h3 className="lr-output-title">2. 원문과 대조할 항목</h3>
            <PeriodResults data={data} loadError={loadError} onRetry={() => { retry(); freshRun(); }} text={text} from={from} to={to} source={source}
              runId={runId} currentRun={currentRun} onFresh={freshRun} toast={toast} onLeave={onClose} />
          </div>
        </div>
        {PRECISE_ENABLED && <PreciseCheck mainText={text} since={from} toast={toast} />}
      </div>
    </div>
  );
}

export function HwpNotice() {
  return <p className="lr-hwp-notice">hwp 파일은 오픈소스 <a href="https://github.com/edwardkim/rhwp" target="_blank" rel="noreferrer">rhwp</a>(<a href="/rhwp/LICENSE.txt" target="_blank">MIT</a>)로 읽습니다. 본 제품은 한글과컴퓨터의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.</p>;
}

/** 점검 기간 — 내 취업규칙 최종 개정일 ~ 기준일 */
export function PeriodControls({ data, from, to, today, lastUpcoming, setFrom, setTo }: {
  data: Data | null; from: string; to: string; today: string; lastUpcoming: string; setFrom: (v: string) => void; setTo: (v: string) => void;
}) {
  return (
    <>
      <div className="lr-period">
        <label>
          <span>내 취업규칙 최종 개정일</span>
          <input type="date" value={toIso(from)} min={data ? toIso(data.since) : undefined} max={toIso(to)} onChange={(e) => e.target.value && setFrom(fromIso(e.target.value))} />
        </label>
        <span className="lr-period-sep">~</span>
        <label>
          <span>기준일</span>
          <input type="date" value={toIso(to)} min={toIso(from)} onChange={(e) => e.target.value && setTo(fromIso(e.target.value))} />
        </label>
        <div className="lr-seg" role="group" aria-label="기준일 빠른 선택">
          <button type="button" aria-pressed={to === today} onClick={() => setTo(today)}>오늘</button>
          <button type="button" aria-pressed={to === `${today.slice(0, 4)}1231`} onClick={() => setTo(`${today.slice(0, 4)}1231`)}>올해 말 예정분까지</button>
          <button type="button" aria-pressed={to === lastUpcoming} onClick={() => setTo(lastUpcoming)}>공포된 예정분 전부</button>
        </div>
      </div>
      {from >= to && <p role="status">점검 시작일은 기준일보다 빨라야 합니다. 기간을 수정하면 기록할 수 있습니다.</p>}
      {data && from < data.since && <p className="lr-period-warn">{fmtDate(data.since)} 이전 개정은 아직 모으지 않았습니다. 그보다 오래된 취업규칙은 표준취업규칙 전체와 대조하는 것을 권합니다.</p>}
    </>
  );
}

/** 기간별 대조 결과 — 요약·내려받기·조문 카드·놓친 개정·제93조. 창과 챗 화면이 같이 쓴다 */
export function PeriodResults({ data, loadError, onRetry, text, from, to, source, runId, currentRun, onFresh, toast, onLeave, ownNotice = true }: {
  data: Data | null; loadError: boolean; onRetry: () => void; text: string; from: string; to: string; source: RulesSource | null;
  runId: string; currentRun: { current: string }; onFresh: () => void; toast: (m: string) => void; onLeave?: () => void;
  /** false 면 기록 기능 안내를 이 결과 안에 두지 않는다 — 결과가 여러 번 쌓이는 챗 화면은 화면에 한 번만 둔다 */
  ownNotice?: boolean;
}) {
  const today = todayKST();
  const observationAvailability = useObservationAvailability();
  const [captureStore] = useState(() => new Map<string, Observation>());
  const exporting = useRef(false);
  const captureContext: CaptureContext = { run_id: runId, period_from: from, period_to: to, matcher_version: MATCHER_VERSION, rule_version: data?.rulesVersion ?? RULE_VERSION };
  const [showOk, setShowOk] = useState(false);
  const leave = onLeave ?? (() => {});

  const result = useMemo(
    () => (data && from < to && (!text.trim() || splitArticles(text).length > 0) ? periodCheck({ text, std: data.std, events: data.events, rules: data.rules, art93: data.art93, from, to }) : null),
    [data, text, from, to],
  );
  const open = result?.items.filter((i) => i.status !== '반영됨') ?? [];
  const ok = result?.items.filter((i) => i.status === '반영됨') ?? [];
  const fixN = open.filter((i) => i.status === '고칠 것' || i.status === '조문 추가').length;
  const hasText = splitArticles(text).length > 0;
  const unrecognized = !!text.trim() && !hasText;
  const period = `${fmtDate(from)} 다음 날 ~ ${fmtDate(to)}`;

  const rows = open.map((it) => [`${it.std.no}(${it.std.title})`, mine(it) || (hasText ? '(해당 조문 없음)' : ''), proposal(it), basis(it).join('\n'), it.status]);
  const intro = [
    `점검 기간: ${period} 시행분 · 기준: 고용노동부 표준취업규칙(2026년 배포) 일반 근로자용, 국가법령정보센터(법제처) 원문`,
    hasText ? `판정: 고칠 것·조문 추가 ${fixN}건 / 전체 ${open.length}건` : '취업규칙 본문 없이 기간만으로 만든 문안 묶음입니다',
  ];
  const foot = [
    '1차 자동 점검입니다. 표준취업규칙 2026(고용노동부)과 법제처 원문을 기준으로 하며 공인노무사 검수 전입니다.',
    '개정안 작성 → 근로자 과반수 의견 청취(불이익 변경은 동의) → 관할 지방고용노동관서 변경 신고 순서로 진행하세요.',
  ];
  const fileStem = `취업규칙_신구대조_${from}-${to}`;

  const downloadDocx = async () => {
    if(exporting.current)return;exporting.current=true;const expected=currentRun.current;
    try {
      const blob = await compareDocx({ title: '취업규칙 신구대조표', intro, head: ['표준 조문', '현행(내 취업규칙)', '개정안', '근거', '판정'], widths: [1700, 4300, 4300, 3200, 1200], rows, foot });
      if(expected!==currentRun.current){toast('본문 또는 검사기간이 바뀌어 이전 결과의 다운로드를 취소했습니다.');return;}
      download(`${fileStem}.docx`, blob, blob.type);
      toast(`신구대조표 ${rows.length}건을 docx 로 받았습니다(한글에서 열립니다)`);
    }catch{toast('신구대조표를 만들지 못했습니다. 입력과 결과를 보존했습니다.');}
    finally{exporting.current=false;}
  };
  const downloadXlsx = async () => {
    if(exporting.current)return;exporting.current=true;const expected=currentRun.current;
    try {
      const {comparisonXlsx}=await import('@/lib/laws/comparison-xlsx');
      const blob=await comparisonXlsx({title:'취업규칙 신구대조표',intro,head:['표준 조문','현행(내 취업규칙)','개정안','근거','판정'],rows,widths:[20,52,52,38,16],foot});
      if(expected!==currentRun.current){toast('본문 또는 검사기간이 바뀌어 이전 결과의 다운로드를 취소했습니다.');return;}
      download(`${fileStem}.xlsx`,blob,blob.type);
    }catch{toast('신구대조표를 만들지 못했습니다. 입력과 결과를 보존했습니다.');}
    finally{exporting.current=false;}
  };
  const copyTable = async () => {
    const t = compareTable(open.map((it) => ({ article: `${it.std.no}(${it.std.title})`, before: mine(it) || null, after: proposal(it) })), foot[0]);
    if (await copyRich(t.text, t.html)) toast('신구대조표를 복사했습니다. 한글·엑셀에 붙이면 표로 들어갑니다');
  };
  const downloadPrep = () => {
    const targets = open.flatMap((it) =>
      it.verdicts
        .filter((v) => v.status !== '반영됨')
        .map((v) => ({ key: `${v.rule.lawId}-${v.rule.article}-${v.rule.effective}`, topic: v.rule.topic, law: v.rule.law, article: v.rule.article, effective: v.rule.effective, required: v.rule.required })),
    );
    download('취업규칙_대응일정.ics', icsCalendar(prepCalItems(targets, today)), 'text/calendar;charset=utf-8');
    toast(`${targets.length}건의 개정안 작성·의견 청취·변경 신고 일정을 캘린더 파일로 받았습니다`);
  };

  return (
    <>
      {loadError && <div className="lr-check-empty" role="alert">점검 자료를 불러오지 못했습니다. 입력은 유지됩니다.<button className="lr-btn" onClick={onRetry}>다시 시도</button></div>}
      {unrecognized && <p role="alert">조문을 인식하지 못했습니다. 제1조(제목)처럼 조문 번호가 줄 처음에 오도록 입력하세요. 현재 본문은 판정하지 않습니다.</p>}
      {!loadError && !unrecognized && !result && <div className="lr-check-empty">{data ? '기준일이 최종 개정일보다 뒤여야 합니다.' : '개정 자료를 불러오는 중…'}</div>}
      {result && (
        <>
          <div className="lr-check-sum">
            <div><span className="n fix">{fixN}</span>{hasText ? '고칠 것' : '바꿀 조문'}</div>
            <div><span className="n">{open.length - fixN}</span>확인·선택</div>
            {hasText && <div><span className="n ok">{ok.length}</span>문구 일치</div>}
            <span className="sp" />
          </div>
          <div className="lr-check-actions">
            <button className="lr-btn lr-btn-ghost lr-btn-sm" onClick={onFresh}>새 점검 실행</button>
            <button className="lr-btn lr-btn-sm" onClick={downloadDocx} disabled={!open.length}><FileDown size={14} /> 신구대조표 docx</button>
            <button className="lr-btn lr-btn-ghost lr-btn-sm" onClick={downloadXlsx} disabled={!open.length}>엑셀</button>
            <button className="lr-btn lr-btn-ghost lr-btn-sm" onClick={copyTable} disabled={!open.length}><ClipboardCopy size={14} /> 표 복사</button>
            {open.some((i) => i.verdicts.length) && (
              <button className="lr-btn lr-btn-ghost lr-btn-sm" onClick={downloadPrep} title="시행일에서 거꾸로 세운 개정안 작성·의견 청취·변경 신고 일정">
                <CalendarClock size={14} /> 대응 일정
              </button>
            )}
          </div>
          <div className="lr-verdict-meta">{period} 시행 개정 중 표준취업규칙 조문에 걸리는 것</div>
          {ownNotice && hasText && open.some((i) => i.verdicts.length) && <ObservationNotice availability={observationAvailability} />}
          {!open.length && <div className="lr-check-empty" style={{ marginTop: 10 }}>이 기간에 취업규칙 조문에 걸리는 개정이 없습니다.</div>}
          {[...open, ...(showOk ? ok : [])].map((it) => (
            <ItemCard key={it.std.id} it={it} captureContext={captureContext} captureStore={captureStore} observationAvailability={observationAvailability} today={today} hasText={hasText} toast={toast} onClose={leave} />
          ))}
          {ok.length > 0 && (
            <button className="lr-fold-btn" onClick={() => setShowOk(!showOk)}>
              {showOk ? '문구가 일치한 항목 접기' : `문구가 일치한 ${ok.length}건 보기`}
            </button>
          )}
          {result.earlier.length > 0 && (
            <details className="lr-missing" open>
              <summary>최종 개정일 이전에 시행됐는데 옛 문구가 남아 있는 개정 {result.earlier.length}건</summary>
              <ul>
                {result.earlier.map(({ std: s, verdict: v }) => (
                  <li key={v.rule.lawId + v.rule.article + v.rule.topic}>
                    <b>{v.rule.topic}</b> · {v.rule.law} {v.rule.article} {fmtDate(v.rule.effective)} 시행 · 현행 {v.where ?? s.title} · 남은 옛 문구: {v.stale.map((x) => <del key={x}>{x}</del>)}
                  </li>
                ))}
              </ul>
              <p className="lr-check-note">기간 안의 개정만 보면 빠지는 것들입니다. 지난 개정 때 함께 고쳤어야 할 조문입니다.</p>
            </details>
          )}
          {result.missing93.length > 0 && (
            <details className="lr-missing" open>
              <summary>근로기준법 제93조 필수기재 중 관련 낱말이 안 보이는 {result.missing93.length}개 호</summary>
              <ul>
                {result.missing93.map((i) => (
                  <li key={i.no}><b>제{i.no}호</b> {i.label}</li>
                ))}
              </ul>
              <p className="lr-check-note">상시 10명 이상 사업장은 이 사항을 취업규칙에 적어 신고해야 합니다. 낱말로만 찾은 1차 점검이라 다른 표현으로 적혀 있으면 무시하세요.</p>
            </details>
          )}
          {result.missingRequired.length > 0 && (
            <details className="lr-missing">
              <summary>표준취업규칙 [필수] 조문 중 짝을 못 찾은 {result.missingRequired.length}개 — 기간과 무관한 전체 점검</summary>
              <ul>
                {result.missingRequired.map((s) => (
                  <li key={s.id}><b>{s.no}({s.title})</b>{s.laws.length > 0 && <> · {s.laws.slice(0, 3).map((l) => `${l.law} ${l.article}`).join(', ')}</>}</li>
                ))}
              </ul>
              <p className="lr-check-note">조문 제목이 달라 짝을 못 찾았을 수도 있습니다. 같은 내용이 다른 조문에 있으면 무시하세요.</p>
            </details>
          )}
          {hasText && source && <HwpApply key={`${source.name}:${source.bytes.byteLength}`} source={source} items={result.items} enabled={canApplyText(source, text)} floorNote={FLOOR_NOTE} toast={toast} />}
          {hasText && !source && open.some((i) => i.proposal) && <p className="lr-check-note">hwp·hwpx 파일을 올리면 바꿀 문안 제안을 그 파일에 넣은 새 파일을 받을 수 있습니다.</p>}
          <p className="lr-check-note">
            문구 일치는 키워드 대조 결과이며 법률 검수 완료를 뜻하지 않습니다. 표준취업규칙 2026(고용노동부, 2026. 2. 배포)과 법제처 원문을 기준으로 하며 공인노무사 검수 전입니다.
            표준 조문과 법령의 연결은 자동 추출본이라 빠진 연결이 있을 수 있습니다.{' '}<Link href="/contact">노무사 검토 요청</Link>
          </p>
        </>
      )}
    </>
  );
}

function ItemCard({ it, captureContext, captureStore, observationAvailability, today, hasText, toast, onClose }: { it: PeriodItem; captureContext: CaptureContext; captureStore: Map<string, Observation>; observationAvailability: ObservationAvailability; today: string; hasText: boolean; toast: (m: string) => void; onClose: () => void }) {
  const cls = LABEL[it.status];
  const shown = hasText ? (it.status === '반영됨' ? '문구 일치' : it.status) : it.verdicts.length ? '바꿀 문안' : '법령 확인';
  return (
    <div className={`lr-verdict ${cls}`}>
      <div className="lr-rule-head">
        <span className={`lr-badge v-${cls}`}>{shown}</span>
        <b>{it.std.no}({it.std.title})</b>
        <span className="lr-verdict-meta" style={{ marginTop: 0 }}>표준취업규칙 [{it.std.kind}]</span>
      </div>
      {hasText && it.verdicts.map(v => <ObservationCapture key={v.rule.lawId+v.rule.article+v.rule.effective+v.rule.topic+v.status+v.missing.length+":"+v.stale.length+":"+it.user.map(u=>u.no).join(",")} verdict={v} clauseIds={it.user.map(u=>u.no)} context={captureContext} standardId={it.std.id} store={captureStore} availability={observationAvailability} />)}
      <div className="lr-verdict-meta">
        {it.events.map(({ event: e, articles }) => (
          <span key={e.id} className="lr-period-ev">
            <a href={`/laws#${encodeURIComponent(e.id)}`} onClick={onClose}>{e.short} {articles.join('·')}</a> {fmtDate(e.date)} {e.date > today ? `시행 예정(${ddayLabel(e.date, today)})` : '시행'}
          </span>
        ))}
        {hasText && (
          <> · 현행 {it.user.length ? <b>{it.user.map((u) => u.no + (u.title ? `(${u.title})` : '')).join(', ')}</b>
            : it.verdicts.some((v) => v.where) ? <><b>{[...new Set(it.verdicts.map((v) => v.where).filter(Boolean))].join(', ')}</b> 안(조문 제목이 표준과 다름)</>
            : '해당 조문 없음'}</>
        )}
      </div>
      {it.status !== '반영됨' && (
        <>
          {it.verdicts.filter((v) => v.status !== '반영됨').map((v) => (
            <div key={v.rule.topic} className="lr-period-rule">
              <b>{v.rule.topic}</b>
              {v.stale.length > 0 && <> · 남은 옛 문구: {v.stale.map((s) => <del key={s}>{s}</del>)}</>}
              <p>{v.rule.point}</p>
            </div>
          ))}
          {it.proposal ? (
            <>
              <div className="lr-verdict-meta">개정안 출처: {it.proposalFrom === '매핑' ? '바뀐 조문 원문 대조 문안' : `표준취업규칙 2026 문안(${fmtDate(STD_ASOF)} 이전 시행분 반영)`}</div>
              <div className="lr-clause">{it.proposal}</div>
              <p className="lr-review-note">{FLOOR_NOTE}</p>
              <div style={{ marginTop: 8 }}>
                <button
                  className="lr-btn lr-btn-ghost lr-btn-sm"
                  onClick={async () => {
                    const body = it.verdicts.length ? it.verdicts.map(clauseText).join('\n\n') : `${it.proposal}\n\n(근거) ${basis(it).join(', ')}\n${FLOOR_NOTE}`;
                    if (await copyRich(body)) toast('문안을 복사했습니다. 회사 조문 번호에 맞춰 붙이세요');
                  }}
                >
                  <ClipboardCopy size={14} /> 문안 복사
                </button>
              </div>
            </>
          ) : (
            <p>자동 문안이 없습니다. 바뀐 조문을 눌러 전후 비교를 보고 반영 여부를 정하세요.</p>
          )}
        </>
      )}
    </div>
  );
}
