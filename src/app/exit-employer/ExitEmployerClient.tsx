'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { TIERS, type TierMin } from '@/content/duties-data';
import {
  CHECKED, DATE_RULES, PHASES, REASONS, REASON_NOTES, SOURCES, STEPS,
  type ExitStep, type ReasonId,
} from '@/content/exit-employer-data';
import { computeExitDates, fmtIso, fmtKo, isWeekend, parseYmd, servedMonths, type ExitDates } from './exit-dates';
import BizNoLookup from '@/components/BizNoLookup';
import { tierFor } from '@/lib/workplace-lookup';

const TIER_MINS = TIERS.map(t => t.min) as TierMin[];
const REASON_IDS = REASONS.map(r => r.id) as ReasonId[];

function tierOf(min: TierMin) {
  return TIERS.find(t => t.min === min)!;
}

function readParams() {
  const p = new URLSearchParams(window.location.search);
  const n = Number(p.get('size'));
  const r = p.get('reason') as ReasonId | null;
  return {
    exit: parseYmd(p.get('exit')) ? p.get('exit')! : '',
    hire: parseYmd(p.get('hire')) ? p.get('hire')! : '',
    pay: parseYmd(p.get('pay')) ? p.get('pay')! : '',
    tier: TIER_MINS.includes(n as TierMin) ? (n as TierMin) : 1,
    reason: r && REASON_IDS.includes(r) ? r : 'quit',
  };
}

// 입사일로 판정할 수 있는 조건 — 판정할 수 없으면 null
function serviceNote(s: ExitStep, hire: ReturnType<typeof parseYmd>, last: ReturnType<typeof parseYmd>) {
  if (!hire || !last) return null;
  if (s.id === 'severance') {
    return servedMonths(hire, last, 12)
      ? '입사일 기준 계속근로 1년 이상입니다. 주 15시간 이상인지 확인하세요.'
      : '입사일 기준 계속근로 1년 미만입니다. 퇴직금 지급 대상이 아닐 수 있습니다(§4① 단서).';
  }
  if (s.id === 'notice') {
    return servedMonths(hire, last, 3)
      ? '입사일 기준 계속근로 3개월 이상입니다. 해고 예고가 적용됩니다.'
      : '입사일 기준 계속근로 3개월 미만입니다. 해고 예고가 적용되지 않습니다(§26 제1호).';
  }
  return null;
}

function dueText(s: ExitStep, dates: ExitDates | null) {
  if (s.dueLabel) return s.dueLabel;
  if (!s.due || !dates) return null;
  return fmtKo(dates[s.due]);
}

export default function ExitEmployerClient() {
  const [exit, setExit] = useState('');
  const [hire, setHire] = useState('');
  const [pay, setPay] = useState('');
  const [tier, setTier] = useState<TierMin>(1);
  const [reason, setReason] = useState<ReasonId>('quit');
  const [toast, setToast] = useState('');
  const [done, setDone] = useState<Record<string, boolean>>({});

  // ?exit=2026-10-31&hire=2024-03-02&size=5&reason=dismiss 로 공유한 주소를 그대로 연다
  useEffect(() => {
    const restore = () => {
      const v = readParams();
      setExit(v.exit);
      setHire(v.hire);
      setPay(v.pay);
      setTier(v.tier);
      setReason(v.reason);
    };
    restore();
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);

  const sync = (patch: Record<string, string>) => {
    const url = new URL(window.location.href);
    for (const [k, v] of Object.entries(patch)) {
      if (v) url.searchParams.set(k, v);
      else url.searchParams.delete(k);
    }
    window.history.replaceState(null, '', url);
  };

  const last = parseYmd(exit);
  const hired = parseYmd(hire);
  const paid = parseYmd(pay);
  const dates = useMemo(() => (last ? computeExitDates(last, paid) : null), [last, paid]);
  const hireAfter = last && hired && fmtIso(hired) > fmtIso(last);

  const steps = useMemo(
    () => STEPS.filter(s => s.min <= tier && (!s.reasons || s.reasons.includes(reason))),
    [tier, reason],
  );
  const hiddenBySize = STEPS.filter(s => s.min > tier && (!s.reasons || s.reasons.includes(reason)));
  const t = tierOf(tier);
  const r = REASONS.find(x => x.id === reason)!;

  const say = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2400);
  };

  const copyList = async () => {
    const lines = [
      `[직원 퇴사 처리 점검 — ${t.note} 사업장 · ${r.label}${last ? ` · 마지막 근무일 ${fmtKo(last)}` : ''}] (법제처 원문 기준 ${CHECKED})`,
      ...PHASES.flatMap(p => {
        const ss = steps.filter(s => s.phase === p);
        if (!ss.length) return [];
        return [``, `■ ${p}`, ...ss.map(s => {
          const d = dueText(s, dates);
          return `- [${done[s.id] ? 'x' : ' '}] ${s.title}${d ? ` — ${d}` : ''} (${s.basis})`;
        })];
      }),
      ``,
      window.location.href,
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      say(`${steps.length}개 항목을 복사했습니다. 메신저·메일에 바로 붙이세요`);
    } catch {
      say('복사하지 못했습니다. 브라우저 권한을 확인해 주세요');
    }
  };

  const doneCount = steps.filter(s => done[s.id]).length;

  return (
    <div className="ee">
      <div className="ee-wrap">
        <header className="ee-hero">
          <div className="ee-eyebrow">사업장용 · 법제처 현행 법령 원문 기준 · {CHECKED} 확인</div>
          <h1 className="ee-h1">직원 퇴사 처리 점검</h1>
          <p className="ee-lead">
            마지막 근무일과 사업장 규모, 퇴사 사유를 고르면 퇴사 전 절차부터 금품 청산, 4대보험 상실 신고, 서류 발급, 세금, 서류 보존까지
            처리할 일을 날짜순으로 보여줍니다.
          </p>
          <p className="ee-note">
            입력한 날짜는 이 브라우저 안에서만 계산하고 서버로 보내지 않습니다. 일반 기준을 정리한 참고 자료이므로 구체적인 사안은 원문과 함께 확인하세요.
          </p>
        </header>

        <section className="ee-form" aria-label="퇴사 정보 입력">
          <div className="ee-fields">
            <label className="ee-field">
              <span className="k">마지막 근무일 <b>필수</b></span>
              <input type="date" value={exit} onChange={e => { setExit(e.target.value); sync({ exit: e.target.value }); }} />
            </label>
            <label className="ee-field">
              <span className="k">입사일 <em>선택</em></span>
              <input type="date" value={hire} onChange={e => { setHire(e.target.value); sync({ hire: e.target.value }); }} />
            </label>
            <label className="ee-field">
              <span className="k">금품 지급일 <em>선택 · 비우면 14일째</em></span>
              <input type="date" value={pay} onChange={e => { setPay(e.target.value); sync({ pay: e.target.value }); }} />
            </label>
          </div>
          {hireAfter && <p className="ee-warn" role="alert">입사일이 마지막 근무일보다 늦습니다. 날짜를 확인해 주세요.</p>}

          <div className="ee-eyebrow ee-label">상시 근로자 수</div>
          <BizNoLookup onFound={w => { const t = tierFor(w.headcount); setTier(t); sync({ size: String(t) }); }} />
          <div className="ee-tiers" role="group" aria-label="상시 근로자 수">
            {TIERS.map(x => (
              <button key={x.min} aria-pressed={tier === x.min} onClick={() => { setTier(x.min); sync({ size: String(x.min) }); }}>
                <span className="n">{x.label}</span>
                <span className="m">{x.note}</span>
              </button>
            ))}
          </div>

          <div className="ee-eyebrow ee-label">퇴사 사유</div>
          <div className="ee-reasons" role="group" aria-label="퇴사 사유">
            {REASONS.map(x => (
              <button key={x.id} aria-pressed={reason === x.id} onClick={() => { setReason(x.id); sync({ reason: x.id }); }}>
                <span className="n">{x.label}</span>
                <span className="m">{x.note}</span>
              </button>
            ))}
          </div>
        </section>

        <div className="ee-sum" aria-live="polite">
          <div>
            <div className="ee-sum-k">{t.note} · {r.label}</div>
            <div className="ee-sum-big">{steps.length}<small>개</small></div>
          </div>
          <div>
            <div className="ee-sum-title">
              {dates
                ? `금품 청산 기한 ${fmtKo(dates.settle)} · 고용보험·국민연금 상실 신고 ${fmtKo(dates.report15)}까지`
                : '마지막 근무일을 넣으면 항목마다 기한 날짜가 붙습니다'}
            </div>
            <div className="ee-sum-meta">
              {dates && <>퇴직일·자격 상실일 {fmtKo(dates.lossDay)} · 서류 보존 {fmtKo(dates.keepUntil)}까지<br /></>}
              점검 완료 {doneCount}/{steps.length}
              {hiddenBySize.length > 0 && <> · 5명 이상 사업장이면 {hiddenBySize.length}개가 더 적용됩니다</>}
            </div>
            <div className="ee-sum-actions">
              <button className="ee-btn" onClick={copyList}>점검표 복사하기</button>
              <a className="ee-btn ee-btn-ghost" href="#rules">날짜 세는 법</a>
            </div>
          </div>
        </div>

        <section className="ee-reason" aria-label="퇴사 사유별 확인할 것">
          <h2>{r.label}일 때 확인할 것</h2>
          <ul className="ee-list">
            {REASON_NOTES[reason].map(n => <li key={n}>{n}</li>)}
          </ul>
        </section>

        <section aria-label="처리 순서">
          {PHASES.map(p => {
            const ss = steps.filter(s => s.phase === p);
            if (!ss.length) return null;
            return (
              <div key={p}>
                <div className="ee-group">
                  <h2>{p}</h2>
                  <span className="ee-eyebrow">{ss.length}개</span>
                </div>
                {ss.map(s => {
                  const d = dueText(s, dates);
                  const due = s.due && dates ? dates[s.due] : null;
                  const note = serviceNote(s, hired, last);
                  return (
                    <details key={s.id} className={`ee-card${done[s.id] ? ' is-done' : ''}`} id={s.id}>
                      <summary>
                        <div className="ee-from">
                          <span className={`ee-badge ${s.min === 1 ? 'all' : 'new'}`}>{s.min === 1 ? '규모 무관' : '5인 이상'}</span>
                          {s.cond && <span className="ee-badge cond">{s.cond}</span>}
                        </div>
                        <div>
                          <div className="ee-title">{s.title}</div>
                          <div className="ee-basis">{s.basis}</div>
                          {d && (
                            <div className="ee-due">
                              기한 <b>{d}</b>
                              {due && isWeekend(due) && <span className="ee-wk">주말 · 앞선 평일에 처리 권장</span>}
                            </div>
                          )}
                        </div>
                        <ChevronDown size={18} className="ee-chev" aria-hidden />
                      </summary>
                      <div className="ee-detail">
                        <p className="ee-what">{s.what}</p>
                        {note && <div className="ee-how">{note}</div>}
                        <div className="ee-pen"><b>법정 상한·효과</b> · {s.penalty}</div>
                        <label className="ee-check">
                          <input
                            type="checkbox"
                            checked={!!done[s.id]}
                            onChange={e => setDone(prev => ({ ...prev, [s.id]: e.target.checked }))}
                          />
                          처리했습니다
                        </label>
                      </div>
                    </details>
                  );
                })}
              </div>
            );
          })}
        </section>

        {hiddenBySize.length > 0 && (
          <section className="ee-next" aria-label="5명 이상 사업장에 더 적용되는 것">
            <h2>5명 이상 사업장이면 더 적용되는 것</h2>
            <p>상시 근로자 수는 퇴사 사유가 생긴 날 전 1개월을 기준으로 셉니다(근로기준법 시행령 §7의2). <Link href="/duties">규모별 사업주 의무</Link>에서 세는 법을 볼 수 있습니다.</p>
            <ul>
              {hiddenBySize.map(s => (
                <li key={s.id}><b>{s.title}</b><span>{s.basis}</span></li>
              ))}
            </ul>
          </section>
        )}

        <section className="ee-sec" id="rules" style={{ scrollMarginTop: 'var(--reading-anchor-offset)' }}>
          <h2>날짜 세는 법</h2>
          <ul className="ee-list">
            {DATE_RULES.map(x => <li key={x}>{x}</li>)}
          </ul>
        </section>

        <footer className="ee-foot">
          <b>근거 원문</b>
          <ul>
            {SOURCES.map(s => (
              <li key={s.url + s.label}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a></li>
            ))}
          </ul>
          벌칙·과태료는 법정 상한이며, 실제 부과액은 위반 정도와 시행령 부과기준에 따라 달라집니다. 구체적인 사안은 <Link href="/contact">문의</Link>해 주세요.
        </footer>
      </div>
      {toast && <div className="ee-toast" role="status">{toast}</div>}
    </div>
  );
}
