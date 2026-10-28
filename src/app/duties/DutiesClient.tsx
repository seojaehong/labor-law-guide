'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import TierStair from './TierStair';
import BizNoLookup from '@/components/BizNoLookup';
import { tierFor } from '@/lib/workplace-lookup';
import { CHECKED, COUNT_RULES, DUTIES, GROUPS, SOURCES, TIERS, type Duty, type Group, type TierMin } from '@/content/duties-data';

const TIER_MINS = TIERS.map(t => t.min) as TierMin[];

function tierOf(min: TierMin) {
  return TIERS.find(t => t.min === min)!;
}

// 고른 규모에서 적용되는 이행 방법 — by 의 키 중 고른 규모 이하에서 가장 큰 것
function howAt(d: Duty, tier: TierMin) {
  if (!d.by) return null;
  const keys = (Object.keys(d.by).map(Number) as TierMin[]).filter(k => k <= tier).sort((a, b) => b - a);
  return keys.length ? d.by[keys[0]] ?? null : null;
}

function fromLabel(min: TierMin) {
  return min === 1 ? '규모 무관' : `${min}명 이상부터`;
}

export default function DutiesClient() {
  const [tier, setTier] = useState<TierMin>(1);
  const [group, setGroup] = useState<Group | null>(null);
  const [toast, setToast] = useState('');

  // ?size=5 로 공유한 주소를 그대로 연다
  useEffect(() => {
    const restore = () => {
      const n = Number(new URLSearchParams(window.location.search).get('size'));
      setTier(TIER_MINS.includes(n as TierMin) ? (n as TierMin) : 1);
    };
    restore();
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);

  const pick = (min: TierMin) => {
    setTier(min);
    const url = new URL(window.location.href);
    url.searchParams.set('size', String(min));
    window.history.replaceState(null, '', url);
  };

  const applies = useMemo(() => DUTIES.filter(d => d.min <= tier), [tier]);
  const shown = useMemo(() => applies.filter(d => !group || d.group === group), [applies, group]);
  const fresh = applies.filter(d => d.min === tier && tier !== 1);
  const nextMin = TIER_MINS.find(m => m > tier);
  const upcoming = nextMin ? DUTIES.filter(d => d.min === nextMin) : [];
  const changedHow = nextMin ? DUTIES.filter(d => d.by?.[nextMin]) : [];
  const t = tierOf(tier);

  const say = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2400);
  };

  const copyList = async () => {
    const lines = [
      `[상시 근로자 ${t.label} 사업장 — 사업주 의무 ${applies.length}개] (법제처 원문 기준 ${CHECKED})`,
      ...GROUPS.flatMap(g => {
        const ds = applies.filter(d => d.group === g);
        if (!ds.length) return [];
        return [``, `■ ${g}`, ...ds.map(d => `- ${d.title} (${d.basis})${howAt(d, tier) ? ` — ${howAt(d, tier)}` : ''}`)];
      }),
      ``,
      window.location.href,
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      say(`${applies.length}개 목록을 복사했습니다. 메신저·메일에 바로 붙이세요`);
    } catch {
      say('복사하지 못했습니다. 브라우저 권한을 확인해 주세요');
    }
  };

  return (
    <div className="ed">
      <div className="ed-wrap">
        <header className="ed-hero">
          <div className="ed-eyebrow">사업주 의무 · 법제처 현행 법령 원문 기준 · {CHECKED} 확인</div>
          <h1 className="ed-h1">사업장 규모별 사업주 의무</h1>
          <p className="ed-lead">
            상시 근로자 수를 고르면 그 규모에서 지켜야 할 노동법 의무와 법정 의무교육, 위반 시 제재를 보여줍니다.
            5인 미만부터 50인 이상까지, 규모가 커질 때 새로 생기는 것도 함께 표시합니다.
          </p>
          <p className="ed-note">
            일반 기준을 정리한 참고 자료입니다. 업종·고용형태에 따라 달라질 수 있으니 구체적인 사안은 원문과 함께 확인하세요.
          </p>
        </header>

        <section aria-label="사업장 규모 고르기">
          <div className="ed-eyebrow">상시 근로자 수</div>
          <BizNoLookup onFound={w => pick(tierFor(w.headcount))} />
          <div className="ed-tiers" role="group" aria-label="상시 근로자 수">
            {TIERS.map(x => (
              <button key={x.min} aria-pressed={tier === x.min} onClick={() => pick(x.min)}>
                <span className="n">{x.label}</span>
                <span className="m">의무 {DUTIES.filter(d => d.min <= x.min).length}개</span>
              </button>
            ))}
          </div>

          <TierStair tier={tier} onPick={pick} />

          <div className="ed-sum" aria-live="polite">
            <div>
              <div className="ed-sum-k">{t.note} 사업장</div>
              <div className="ed-sum-big">{applies.length}<small>개</small></div>
            </div>
            <div>
              <div className="ed-sum-title">
                {tier === 1
                  ? '근로기준법은 일부만 적용되지만, 근로계약서·최저임금·퇴직금·의무교육은 그대로입니다'
                  : `${t.label} 사업장부터 새로 생기는 의무 ${fresh.length}개`}
              </div>
              <div className="ed-sum-meta">
                {fresh.length > 0 && <>새로 생김 · {fresh.map(d => d.title).join(' · ')}<br /></>}
                {tier !== 1 && DUTIES.some(d => d.by?.[tier]) && <>방법이 바뀜 · {DUTIES.filter(d => d.by?.[tier]).map(d => d.title).join(' · ')}<br /></>}
                의무교육 {applies.filter(d => d.group === '의무교육').length}개 포함 · 해당하는 사업장만 적용되는 {applies.filter(d => d.cond).length}개 포함
                {nextMin && <> · {tierOf(nextMin).label} 사업장이 되면 {upcoming.length}개가 더 생깁니다</>}
              </div>
              <div className="ed-sum-actions">
                <button className="ed-btn" onClick={copyList}>목록 복사하기</button>
                <a className="ed-btn ed-btn-ghost" href="#count">근로자 수 세는 법</a>
              </div>
            </div>
          </div>
        </section>

        <div className="ed-chips" role="group" aria-label="분야 필터">
          <button className="ed-chip" aria-pressed={group === null} onClick={() => setGroup(null)}>
            전체<span className="c">{applies.length}</span>
          </button>
          {GROUPS.map(g => {
            const c = applies.filter(d => d.group === g).length;
            return c ? (
              <button key={g} className="ed-chip" aria-pressed={group === g} onClick={() => setGroup(group === g ? null : g)}>
                {g}<span className="c">{c}</span>
              </button>
            ) : null;
          })}
        </div>

        <section aria-label="적용되는 의무">
          {GROUPS.filter(g => !group || g === group).map(g => {
            const ds = shown.filter(d => d.group === g);
            if (!ds.length) return null;
            return (
              <div key={g}>
                <div className="ed-group">
                  <h2>{g}</h2>
                  <span className="ed-eyebrow">{ds.length}개</span>
                </div>
                {ds.map(d => {
                  const how = howAt(d, tier);
                  return (
                    <details key={d.id} className="ed-card" id={d.id}>
                      <summary>
                        <div className="ed-from">
                          <span className={`ed-badge ${d.min === tier && tier !== 1 ? 'new' : d.min === 1 ? 'all' : ''}`}>
                            {d.min === tier && tier !== 1 ? '이 규모부터' : fromLabel(d.min)}
                          </span>
                          {d.cond && <span className="ed-badge cond">{d.cond}</span>}
                        </div>
                        <div>
                          <div className="ed-title">{d.title}</div>
                          <div className="ed-basis">{d.basis}</div>
                          <p className="ed-what">{d.what}</p>
                        </div>
                        <ChevronDown size={18} className="ed-chev" aria-hidden />
                      </summary>
                      <div className="ed-detail">
                        {how && <div className="ed-how"><b>{t.label} 사업장 이행 방법</b> · {how}</div>}
                        <div className="ed-pen"><b>위반 시</b> · {d.penalty}</div>
                      </div>
                    </details>
                  );
                })}
              </div>
            );
          })}
        </section>

        {nextMin && (
          <section className="ed-next" aria-label="다음 규모에서 바뀌는 것">
            <h2>{tierOf(nextMin).label} 사업장이 되면</h2>
            <p>인원이 늘기 전에 미리 준비해 두면 전환이 수월합니다.</p>
            <ul>
              {upcoming.map(d => (
                <li key={d.id}><b>{d.title}</b><span>{d.basis}</span></li>
              ))}
              {changedHow.map(d => (
                <li key={d.id}><b>{d.title} 방법이 바뀜</b><span>{d.by?.[nextMin]}</span></li>
              ))}
            </ul>
          </section>
        )}

        <section className="ed-sec" id="count" style={{ scrollMarginTop: 'var(--reading-anchor-offset)' }}>
          <h2>상시 근로자 수 세는 법</h2>
          <ul className="ed-list">
            {COUNT_RULES.map(r => <li key={r}>{r}</li>)}
          </ul>
          <p className="ed-note">
            아르바이트를 빼고 세다가 실제로는 5명 이상으로 판정되는 일이 많습니다. 그러면 연차·가산수당이 소급해서 문제가 됩니다.
            주 15시간 미만 근로자도 인원에는 들어갑니다.
          </p>
          <p className="ed-note">
            날짜별로 세어 보려면 <Link href="/tools/headcount">상시 근로자 수 계산기</Link>를 씁니다.
          </p>
        </section>

        <section className="ed-sec">
          <h2>1년 점검표</h2>
          <ul className="ed-list">
            <li><b>채용할 때</b> — 근로계약서 작성·교부, 4대보험 취득 신고</li>
            <li><b>매달 급여일</b> — 임금명세서 교부, 최저임금 이상인지 확인, 임금대장 작성</li>
            <li><b>1월</b> — 새해 최저임금 게시, 시급·월급이 새 최저임금에 맞는지 확인</li>
            <li><b>연 1회</b> — 성희롱 예방교육, 장애인 인식개선 교육. 자료를 게시·배포했다면 날짜·자료·대상을 기록하고 확인 서명을 받아 둡니다</li>
            <li><b>퇴직할 때</b> — 14일 이내 임금·퇴직금 정산, 4대보험 상실 신고</li>
            <li><b>인원이 늘 때</b> — 지난 1개월 근로자 수를 다시 세어 규모가 바뀌었는지 확인</li>
          </ul>
        </section>

        <footer className="ed-foot">
          <b>근거 원문</b>
          <ul>
            {SOURCES.map(s => (
              <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a></li>
            ))}
          </ul>
          벌칙은 법정 상한이며, 실제 부과액은 위반 정도와 시행령 부과기준에 따라 달라집니다. 구체적인 사안은 <Link href="/contact">문의</Link>해 주세요.
        </footer>
      </div>
      {toast && <div className="ed-toast" role="status">{toast}</div>}
    </div>
  );
}
