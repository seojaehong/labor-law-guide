'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CHECKED, COUNTING_NOTE, ESTIMATE_LIMITS, PHASES, SOURCES, STEPS, type Step } from '@/content/exit-worker-data';
import { calculateEntitlement } from '@/lib/leave/annual-leave';
import {
  estimateBlockers,
  estimateLeavePay,
  estimateSeverance,
  milestones,
  parseYmd,
  severanceCheck,
  validate,
  type Input,
} from './exit-calc';
import ResultBlock from '@/components/tool-result/ResultBlock';
import { exitResultView } from './result';

function dateLabel(s: string) {
  const d = parseYmd(s);
  if (!d) return s;
  const w = '일월화수목금토'[d.getUTCDay()];
  return `${d.getUTCFullYear()}.${d.getUTCMonth() + 1}.${d.getUTCDate()}.(${w})`;
}

const num = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(/,/g, '')));

export default function ExitClient() {
  const [hireDate, setHireDate] = useState('');
  const [lastDay, setLastDay] = useState('');
  const [wage, setWage] = useState('');
  const [hours, setHours] = useState('40');
  const [leave, setLeave] = useState('');
  // 재직 중 주 15시간 이상·미만이 바뀐 적 — 켜면 퇴직금은 엔진 문장으로 멈춘다(261126 재홍님 결정 E3). 주소에는 남기지 않는다
  const [hoursChanged, setHoursChanged] = useState(false);
  const [toast, setToast] = useState('');

  // ?last=YYYY-MM-DD 로 공유한 주소를 그대로 연다 — 급여·입사일은 주소에 남기지 않는다
  useEffect(() => {
    const restore = () => {
      const v = new URLSearchParams(window.location.search).get('last') ?? '';
      setLastDay(parseYmd(v) ? v : '');
    };
    restore();
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);

  const pickLast = (v: string) => {
    setLastDay(v);
    const url = new URL(window.location.href);
    if (parseYmd(v)) url.searchParams.set('last', v);
    else url.searchParams.delete('last');
    window.history.replaceState(null, '', url);
  };

  const input: Input = {
    hireDate,
    lastDay,
    monthlyWage: num(wage),
    weeklyHours: num(hours),
    unusedLeaveDays: leave.trim() === '' ? undefined : num(leave),
  };
  const errs = validate(input);
  const lastOk = !!parseYmd(lastDay);
  const ready = errs.length === 0;

  const dates = useMemo(() => (lastOk ? Object.fromEntries(milestones(lastDay).map(m => [m.key, m.date])) : {}), [lastDay, lastOk]);

  const check = ready ? severanceCheck(hireDate, lastDay, input.weeklyHours) : null;
  const sev = ready && check?.eligible && !hoursChanged ? estimateSeverance(hireDate, lastDay, input.monthlyWage) : null;
  const lv = ready && input.unusedLeaveDays !== undefined ? estimateLeavePay(input.monthlyWage, input.weeklyHours, input.unusedLeaveDays) : null;
  const ent = ready ? (() => { try { return calculateEntitlement({ hireDate, asOf: lastDay }); } catch { return null; } })() : null;

  const say = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2400);
  };

  const stepDate = (s: Step) => (s.milestone && dates[s.milestone] ? dates[s.milestone] : null);

  const copyList = async () => {
    const lines = [
      `[퇴사 점검표] 마지막 근무일 ${lastOk ? dateLabel(lastDay) : '미입력'} (법제처 원문 기준 ${CHECKED})`,
      ...PHASES.flatMap(p => {
        const ss = STEPS.filter(s => s.phase === p);
        return [``, `■ ${p}`, ...ss.map(s => `- [ ] ${s.title}${stepDate(s) ? ` · ${dateLabel(stepDate(s)!)}` : ''} (${s.basis})`)];
      }),
      ``,
      window.location.href,
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      say('점검표를 복사했습니다. 메모장이나 메신저에 붙여 두세요');
    } catch {
      say('복사하지 못했습니다. 브라우저 권한을 확인해 주세요');
    }
  };

  const err = (k: string) => errs.includes(k as never);
  const touched = hireDate || lastDay || wage || leave;

  return (
    <div className="ex">
      <div className="ex-wrap">
        <header className="ex-hero">
          <div className="ex-eyebrow">근로자 퇴사 점검 · 법제처 현행 법령 원문 기준 · {CHECKED} 확인</div>
          <h1 className="ex-h1">퇴사 점검표</h1>
          <p className="ex-lead">
            마지막 근무일을 넣으면 퇴사 전부터 금품 청산·4대보험 상실 신고·실업급여까지 날짜순으로 정리합니다.
            입사일·월 급여·주 소정근로시간을 더 넣으면 퇴직금 요건과 확인용 추정 금액을 함께 보여줍니다.
          </p>
          <p className="ex-note">
            입력한 내용은 이 브라우저 안에서만 계산하고 서버로 보내지 않습니다. 주소창에는 마지막 근무일만 남고 급여·입사일은 남지 않습니다.
            일반 기준을 정리한 참고 자료이므로 구체적인 사안은 근거 원문과 함께 확인하세요.
          </p>
        </header>

        <section className="ex-form" aria-label="입력">
          <label className="ex-field">
            <span className="k">마지막 근무일<b>필수</b></span>
            <input type="date" value={lastDay} onChange={e => pickLast(e.target.value)} aria-invalid={!!lastDay && err('last')} />
          </label>
          <label className="ex-field">
            <span className="k">입사일</span>
            <input type="date" value={hireDate} onChange={e => setHireDate(e.target.value)} aria-invalid={!!hireDate && (err('hire') || err('order'))} />
          </label>
          <label className="ex-field">
            <span className="k">월 급여(세전, 최근 3개월 평균)</span>
            <input inputMode="numeric" placeholder="예: 2,500,000" value={wage} onChange={e => setWage(e.target.value)} aria-invalid={!!wage && err('wage')} />
          </label>
          <label className="ex-field">
            <span className="k">주 소정근로시간(4주 평균)</span>
            <input inputMode="decimal" value={hours} onChange={e => setHours(e.target.value)} aria-invalid={!!hours && err('hours')} />
          </label>
          <label className="ex-field">
            <span className="k">남은 연차 일수(선택)</span>
            <input inputMode="decimal" placeholder="회사에 확인한 일수" value={leave} onChange={e => setLeave(e.target.value)} aria-invalid={!!leave && err('leave')} />
          </label>
          <label className="ex-check">
            <input type="checkbox" checked={hoursChanged} onChange={e => setHoursChanged(e.target.checked)} />
            <span>재직 중 1주 소정근로시간이 15시간 이상과 미만 사이에서 바뀐 적이 있다</span>
          </label>
          {touched && err('order') && <p className="ex-err" role="alert">마지막 근무일이 입사일보다 빠릅니다.</p>}
          {/* 칸이 틀려 「확인용 추정」 카드가 빠질 때 말없이 사라지지 않게 까닭을 남긴다(261112) */}
          {estimateBlockers(errs, { wage, hours, leave }).map(line => (
            <p key={line} className="ex-err" role="status">{line}</p>
          ))}
        </section>

        {ready && check && (
          <div className="ex-result">
            <ResultBlock label="확인용 추정" view={exitResultView({ check, sev, lv, ent, unusedLeaveDays: input.unusedLeaveDays, weeklyHours: input.weeklyHours, hoursChanged })} />
          </div>
        )}

        <section aria-label="날짜순 점검표" id="checklist" style={{ scrollMarginTop: 'var(--reading-anchor-offset)' }}>
          <div className="ex-group">
            <h2>날짜순 점검표</h2>
            <button className="ex-btn ex-btn-ghost ex-copy" onClick={copyList}>점검표 복사하기</button>
          </div>
          {!lastOk && <p className="ex-hint">마지막 근무일을 넣으면 항목마다 날짜가 붙습니다.</p>}
          <ol className="ex-line">
            {PHASES.map(p => (
              <li key={p} className="ex-phase">
                <div className="ex-phase-k">{p}</div>
                {STEPS.filter(s => s.phase === p).map(s => {
                  const d = stepDate(s);
                  return (
                    <details key={s.id} className="ex-card" id={s.id}>
                      <summary>
                        <div className="ex-when">{d ? dateLabel(d) : s.milestone ? '날짜 입력 시' : ''}</div>
                        <div>
                          <div className="ex-title">{s.title}</div>
                          <div className="ex-basis">{s.basis}</div>
                        </div>
                      </summary>
                      <div className="ex-detail">
                        <p>{s.what}</p>
                        {s.penalty && <p className="ex-pen"><b>회사가 지키지 않으면</b> · {s.penalty}</p>}
                      </div>
                    </details>
                  );
                })}
              </li>
            ))}
          </ol>
          <p className="ex-foot-note">{COUNTING_NOTE}</p>
        </section>

        <section className="ex-sec" id="limits" style={{ scrollMarginTop: 'var(--reading-anchor-offset)' }}>
          <h2>추정치의 한계</h2>
          <ul className="ex-list">
            {ESTIMATE_LIMITS.map(r => <li key={r}>{r}</li>)}
          </ul>
        </section>

        <footer className="ex-foot">
          <b>근거 원문</b>
          <ul>
            {SOURCES.map(s => (
              <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a></li>
            ))}
          </ul>
          벌칙은 법정 상한입니다. 구체적인 사안은 <Link href="/contact">문의</Link>해 주세요.
        </footer>
      </div>
      {toast && <div className="ex-toast" role="status">{toast}</div>}
    </div>
  );
}
