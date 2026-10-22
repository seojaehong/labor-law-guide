'use client';
// 정밀 점검(시험 운영) — 본문을 서버로 보내 조문별 AI 대조 결과를 받는다. 기본 점검(브라우저 안)과 따로 움직인다.
// 결과는 노무사 검수 전 초안이고, 조문마다 맞음·틀림·애매 반응을 받아 점검 기준을 고치는 데 쓴다.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { FileDown, Send } from 'lucide-react';
import TurnstileWidget from '@/components/TurnstileWidget';

export const PRECISE_ENABLED = process.env.NEXT_PUBLIC_WORK_RULES_PRECISE === '1';

type Row = Record<'조문' | '현행' | '개정안' | '개정 사유' | '근거·시행일' | '불이익변경' | '점검 결과' | '운영 메모' | '제안 문안', string>;
type Verdict = 'right' | 'wrong' | 'unsure';
const ORDER = ['현행 수정 필요', '시행 예정', '회사 선택', '추가 확인'];
const VERDICT_LABEL: [Verdict, string][] = [['right', '맞음'], ['wrong', '틀림'], ['unsure', '애매']];

export default function PreciseCheck({ text, since, toast }: { text: string; since: string; toast: (m: string) => void }) {
  const [old, setOld] = useState('');
  const [headcount, setHeadcount] = useState('');
  const [store, setStore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<{ runId: string; rows: Row[]; articles: number } | null>(null);
  const [marks, setMarks] = useState<Record<string, Verdict>>({});
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const runSeq = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);
  // 본문·기간이 바뀌면 이전 결과(진행 중인 것 포함)는 다른 입력의 것이다
  useEffect(() => { runSeq.current++; setRes(null); setMarks({}); }, [text, since]);

  const run = async () => {
    setBusy(true); setError(null); setRes(null); setMarks({}); setElapsed(0);
    const seq = ++runSeq.current;
    const t0 = Date.now();
    timer.current = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    try {
      const r = await fetch('/api/tools/work-rules-precise', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rules: text, old: old.trim() || null, since, headcount: headcount.trim(), store, turnstileToken }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.message ?? '정밀 점검을 하지 못했습니다.');
      if (seq !== runSeq.current) return; // 그사이 입력이 바뀌었다
      setRes(body);
      toast(`정밀 점검을 마쳤습니다 — 조문 ${body.articles}개 중 ${body.rows.length}건을 확인할 항목으로 올렸습니다`);
    } catch (e) {
      setError((e as Error).message);
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
    if (!r?.ok) toast('반응을 저장하지 못했습니다. 화면 표시는 남겨 둡니다.');
  };

  const downloadXlsx = async () => {
    if (!res) return;
    const { comparisonXlsx } = await import('@/lib/laws/comparison-xlsx');
    const head = ['조문', '현행', '개정안', '개정 사유', '근거·시행일', '불이익변경', '점검 결과', '운영 메모', '제안 문안'] as const;
    const blob = await comparisonXlsx({
      title: '취업규칙 정밀 점검 대조표', intro: [`점검 시작일 ${since} 이후 시행 법령 기준 · AI 대조 초안(노무사 검수 전)`],
      head: [...head], rows: res.rows.map((x) => head.map((h) => x[h])), widths: [14, 40, 40, 36, 24, 12, 14, 30, 40],
      foot: ['AI 대조 결과는 노무사 검수 전 초안입니다. 불이익변경 여부와 최종 문안은 노무사 검토를 거쳐 정하세요.'],
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = '취업규칙_정밀점검.xlsx'; a.click();
    URL.revokeObjectURL(a.href);
  };

  // 「신설 필요」는 본문에서 조문을 못 찾은 법령 기준이다 — 조문 판단과 섞지 않고 한 묶음으로 접는다
  const absent = res ? res.rows.filter((x) => x['조문'] === '신설 필요') : [];
  const sorted = res ? res.rows.filter((x) => x['조문'] !== '신설 필요')
    .sort((a, b) => ORDER.indexOf(a['점검 결과']) - ORDER.indexOf(b['점검 결과'])) : [];
  const count = (k: string) => sorted.filter((x) => x['점검 결과'] === k).length;

  return (
    <section className="lr-precise">
      <h3 className="lr-output-title">3. 정밀 점검 (AI 조문 대조 · 시험 운영)</h3>
      <p className="lr-check-note">
        위 점검은 낱말 대조입니다. 정밀 점검은 조문마다 법령 기준 충족·종전 대비 불이익변경·운영 가능성을 AI 가 대조합니다.
        <b> 실행하면 입력한 본문 전체가 우리 서버를 거쳐 외부 AI 제공사(Anthropic)로 전송됩니다.</b>{' '}
        보관에 동의하지 않으면 조문 본문은 저장하지 않고 점검 결과만 남깁니다. 결과는 노무사 검수 전 초안입니다. 문서 한 벌에 보통 1~2분 걸리고, 하루 이용 횟수가 정해져 있습니다.
      </p>
      <details>
        <summary>종전 취업규칙과 비교하기(선택)</summary>
        <textarea value={old} onChange={(e) => setOld(e.target.value)} aria-label="종전 취업규칙 본문" placeholder="개정 전 취업규칙 본문을 붙여넣으면 불이익변경(근로조건 저하)을 함께 대조합니다." rows={5} />
      </details>
      <div className="lr-check-meta">
        <label>상시 근로자 수 <input value={headcount} onChange={(e) => setHeadcount(e.target.value)} inputMode="numeric" size={5} aria-label="상시 근로자 수" /> 명</label>
        <label><input type="checkbox" checked={store} onChange={(e) => setStore(e.target.checked)} /> 점검 개선을 위해 본문 보관에 동의합니다(선택)</label>
        <span className="sp" />
        <TurnstileWidget onToken={setTurnstileToken} />
        <button className="lr-btn lr-btn-sm" onClick={run} disabled={busy || !text.trim()}><Send size={14} /> {busy ? `점검 중… ${elapsed}초` : '정밀 점검 실행'}</button>
      </div>
      {error && <p className="lr-file-error" role="alert">{error}</p>}
      {res && (
        <>
          <div className="lr-check-sum">
            {ORDER.map((k) => <div key={k}><span className={`n${k === '현행 수정 필요' ? ' fix' : ''}`}>{count(k)}</span>{k}</div>)}
            <span className="sp" />
            <button className="lr-btn lr-btn-ghost lr-btn-sm" onClick={downloadXlsx}><FileDown size={14} /> 대조표 엑셀</button>
          </div>
          {sorted.map((x) => (
            <details key={x['조문'] + x['개정 사유']} className="lr-missing">
              <summary><b>{x['조문']}</b> · {x['점검 결과']}{x['불이익변경'] !== '해당 없음' && ` · 불이익변경 ${x['불이익변경']}`}</summary>
              {x['개정 사유'] && <p>{x['개정 사유']}</p>}
              {x['근거·시행일'] && <p className="lr-check-note">근거: {x['근거·시행일']}</p>}
              {x['운영 메모'] && <p className="lr-check-note">운영 메모: {x['운영 메모']}</p>}
              {x['제안 문안'] && <pre className="lr-precise-text">{x['제안 문안']}</pre>}
              <div className="lr-seg" role="group" aria-label={`${x['조문']} 점검 결과에 대한 의견`}>
                {VERDICT_LABEL.map(([v, label]) => (
                  <button key={v} aria-pressed={marks[x['조문']] === v} onClick={() => mark(x['조문'], v)}>{label}</button>
                ))}
              </div>
            </details>
          ))}
          {absent.length > 0 && (
            <details className="lr-missing">
              <summary>본문에서 해당 조문을 찾지 못한 법령 기준 {absent.length}건</summary>
              <ul>{absent.map((x) => <li key={x['개정 사유']}><b>{x['개정 사유']}</b> · {x['근거·시행일']}</li>)}</ul>
              <p className="lr-check-note">조문이 없거나 다른 표현으로 적혀 있을 수 있습니다. 해당 제도를 운영하지 않으면 무시하세요.</p>
            </details>
          )}
          <p className="lr-check-note">
            AI 대조 결과는 노무사 검수 전 초안입니다. 불이익변경 여부와 최종 문안은 노무사 검토를 거쳐 정하세요.{' '}
            <Link href="/contact">노무사 검토 신청</Link>
          </p>
        </>
      )}
    </section>
  );
}
