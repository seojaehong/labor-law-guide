'use client';

// 🔴 이 화면은 서버로 아무것도 보내지 않는다 — fetch·/api 호출이 0건이다(#311 §3).
//    명단은 브라우저 메모리에만 있고 새로고침하면 사라진다. 그렇게 화면에도 적는다.
import { useMemo, useState } from 'react';
import {
  simulate, CURRENT_STEPS, PROPOSED_STEPS, NO_GROUP,
  type AgeStep, type Boundary, type Scenario, type SimResult,
} from '@/lib/calc/retirement-plan';
import { parseRoster, EXAMPLE_ROSTER } from '@/lib/calc/roster-parse';
import FoldedDetail from '@/components/tool/FoldedDetail';
import { card, inputCls, ink, muted, small } from '@/lib/tool-kit';

const won = (n: number) => n.toLocaleString('ko-KR');
/** 큰 금액은 억·만 원으로 줄여 읽는다 */
function brief(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString('ko-KR')}만`;
  return won(n);
}

const chip = (on: boolean) =>
  on
    ? { backgroundColor: 'var(--color-text-primary)', color: 'var(--color-bg-primary)', borderColor: 'var(--color-text-primary)' }
    : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' };

/** 연도 표 기본값 — 사용자가 고쳐 쓴다. 입법 전 안이라 코드에 박지 않는다 */
const DEFAULT_ROWS = PROPOSED_STEPS.filter((s) => s.fromYear > 0);

function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.max(1, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-4 flex-1 rounded-sm" style={{ backgroundColor: 'var(--color-border)' }}>
        <div className="h-4 rounded-sm" style={{ width: `${pct}%`, backgroundColor: 'var(--color-text-primary)' }} />
      </div>
      <span className="w-20 shrink-0 text-right text-xs tabular-nums" style={muted}>{label}</span>
    </div>
  );
}

export default function RetirementPlanClient() {
  const [text, setText] = useState('');
  const [boundary, setBoundary] = useState<Boundary>('monthEnd');
  const [useRate, setUseRate] = useState(false);
  const [rate, setRate] = useState('11.3');
  const [rows, setRows] = useState<AgeStep[]>(DEFAULT_ROWS);
  const [onExt, setOnExt] = useState(true);
  const [onRehire, setOnRehire] = useState(false);
  const [rehireYears, setRehireYears] = useState('1');
  const [rehirePay, setRehirePay] = useState('70');
  const [tab, setTab] = useState<'year' | 'group' | 'person'>('year');

  const parsed = useMemo(() => parseRoster(text), [text]);
  const employerRate = useRate ? Number(rate) : undefined;

  const scenarios = useMemo<Scenario[]>(() => {
    const out: Scenario[] = [{ key: 'cur', label: '현행 60세', steps: CURRENT_STEPS }];
    const steps: AgeStep[] = [{ fromYear: 0, age: 60 }, ...rows.filter((r) => r.fromYear > 0 && r.age > 0)];
    if (onExt) out.push({ key: 'ext', label: '단계적 연장안', steps });
    if (onRehire) {
      const years = Math.max(0, Number(rehireYears) || 0);
      const payRate = Math.max(0, Number(rehirePay) || 0);
      out.push({ key: 're', label: `재고용(정년 후 ${years}년 · 임금 ${payRate}%)`, steps: CURRENT_STEPS, rehire: { years, payRate } });
    }
    return out;
  }, [rows, onExt, onRehire, rehireYears, rehirePay]);

  const span = useMemo(() => {
    if (!parsed.rows.length) return { from: 2027, to: 2040 };
    const years = parsed.rows.map((e) => Number(e.birthYM.slice(0, 4)));
    return { from: Math.min(...years) + 58, to: Math.max(...years) + 67 };
  }, [parsed.rows]);

  const results = useMemo(() => {
    if (!parsed.rows.length) return [] as { s: Scenario; r: SimResult }[];
    const out: { s: Scenario; r: SimResult }[] = [];
    for (const s of scenarios) {
      try {
        out.push({ s, r: simulate(parsed.rows, s, { boundary, fromYear: span.from, toYear: span.to, employerRate }) });
      } catch {
        // 연도 표가 잘못되면 그 시나리오만 뺀다 — 나머지는 계속 보여준다
      }
    }
    return out;
  }, [parsed.rows, scenarios, boundary, span, employerRate]);

  const base = results.find((x) => x.s.key === 'cur');
  const maxRetiring = Math.max(1, ...results.flatMap((x) => x.r.years.map((y) => y.retiring)));
  const maxPayroll = Math.max(1, ...results.flatMap((x) => x.r.years.map((y) => y.payroll)));

  const csv = useMemo(() => {
    if (!results.length) return '';
    const head = ['사번', '직군', '출생연월', '입사일', ...results.map((x) => `${x.s.label} 정년`), ...results.map((x) => `${x.s.label} 마지막근무일`), ...results.map((x) => `${x.s.label} 퇴직금추정`)];
    const lines = [head.join(',')];
    for (let i = 0; i < parsed.rows.length; i++) {
      const e = parsed.rows[i];
      const ps = results.map((x) => x.r.people[i]);
      lines.push([e.id, e.group ?? '', e.birthYM, e.hireDate,
        ...ps.map((p) => p.retireAge), ...ps.map((p) => p.lastWorkDate), ...ps.map((p) => p.severance)].join(','));
    }
    return lines.join('\n');
  }, [results, parsed.rows]);

  return (
    <div className="space-y-5">
      {/* ① 명단 */}
      <section className={card}>
        <h2 className="mb-1 text-base font-semibold" style={ink}>① 명단</h2>
        <p className={small} style={muted}>
          한 줄에 한 사람. <strong>사번 · 출생연월 · 입사일 · 연봉</strong> 순서로, 직군은 넣어도 되고 안 넣어도 됩니다.
          엑셀에서 그대로 복사해 붙여도 됩니다.
        </p>
        <p className="mt-1 text-sm font-semibold" style={ink}>
          주민등록번호와 이름은 넣는 칸이 없습니다. 생년은 연월까지만 받습니다. 넣은 명단은 이 브라우저에만 있고 새로고침하면 사라집니다.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          spellCheck={false}
          aria-label="명단"
          placeholder={'A-001,1966-04,1996-03-01,78000000,관리\nA-002,1967-11,2001-07-01,72000000,관리'}
          className={`${inputCls} mt-3 w-full font-mono text-sm`}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" className="min-h-[44px] rounded-md border px-3 text-sm font-semibold" style={chip(false)} onClick={() => setText(EXAMPLE_ROSTER)}>
            예시 10명 채우기
          </button>
          {text ? (
            <button type="button" className="min-h-[44px] rounded-md border px-3 text-sm" style={chip(false)} onClick={() => setText('')}>
              비우기
            </button>
          ) : null}
          <span className={small} style={muted}>
            {parsed.rows.length ? `${parsed.rows.length}명 읽었습니다` : '아직 읽은 사람이 없습니다'}
          </span>
        </div>
        {parsed.errors.length ? (
          <div className="mt-3 rounded-md border p-3" style={{ borderColor: 'var(--color-border)' }}>
            <p className="text-sm font-semibold" style={ink}>읽지 못한 줄 {parsed.errors.length}개 — 건너뛰지 않고 모두 적습니다</p>
            <ul className="mt-1 space-y-1">
              {parsed.errors.slice(0, 20).map((e) => (
                <li key={e.line} className="text-sm" style={muted}>
                  <span className="tabular-nums">{e.line}번째 줄</span> — {e.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {/* ② 기준과 시나리오 */}
      <section className={card}>
        <h2 className="mb-1 text-base font-semibold" style={ink}>② 가정</h2>
        <p className={small} style={muted}>
          정년연장은 <strong>입법 전 안</strong>입니다. 그래서 연도 표를 고정하지 않고 여기서 고쳐 쓰게 두었습니다.
          안이 바뀌면 숫자만 고치면 됩니다.
        </p>

        <div className="mt-4 space-y-2">
          <p className="text-sm font-semibold" style={ink}>정년 도달일을 언제로 보나</p>
          <div className="flex flex-wrap gap-1">
            {([['monthEnd', '생월 말일'], ['yearEnd', '그 해 말일']] as [Boundary, string][]).map(([v, l]) => (
              <button key={v} type="button" aria-pressed={boundary === v} className="min-h-[44px] rounded-md border px-3 text-sm font-semibold" style={chip(boundary === v)} onClick={() => setBoundary(v)}>
                {l}
              </button>
            ))}
          </div>
          <p className={small} style={muted}>취업규칙에 적힌 대로 고릅니다. 생년월일을 받지 않으므로 생일 당일은 고를 수 없습니다.</p>
        </div>

        <div className="mt-4 space-y-2">
          <label className="flex min-h-[44px] cursor-pointer items-center gap-2">
            <input type="checkbox" checked={useRate} onChange={(e) => setUseRate(e.target.checked)} />
            <span className="text-sm font-semibold" style={ink}>인건비에 4대보험 사용자부담분을 얹는다</span>
          </label>
          {useRate ? (
            <div className="flex items-center gap-2">
              <input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" aria-label="사용자부담 요율" className={`${inputCls} w-24`} />
              <span className={small} style={muted}>
                % — 요율은 해마다 바뀝니다. 회사가 실제로 내는 비율을 넣으세요(기본값은 참고용입니다).
              </span>
            </div>
          ) : null}
        </div>

        <div className="mt-5 space-y-3">
          <p className="text-sm font-semibold" style={ink}>겹쳐 볼 시나리오</p>
          <label className="flex min-h-[44px] cursor-pointer items-center gap-2">
            <input type="checkbox" checked={onExt} onChange={(e) => setOnExt(e.target.checked)} />
            <span className="text-sm" style={ink}>단계적 연장안 <span style={muted}>(입법 전 안)</span></span>
          </label>
          {onExt ? (
            <div className="rounded-md border p-3" style={{ borderColor: 'var(--color-border)' }}>
              <p className={small} style={muted}>그 해부터 적용되는 정년을 적습니다. 기본값은 2026년 11월 보도된 안입니다.</p>
              <div className="mt-2 space-y-2">
                {rows.map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={r.fromYear || ''} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, fromYear: Number(e.target.value) || 0 } : x)))}
                      inputMode="numeric" aria-label={`${i + 1}번째 적용 연도`} className={`${inputCls} w-24 tabular-nums`} />
                    <span className={small} style={muted}>년부터</span>
                    <input value={r.age || ''} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, age: Number(e.target.value) || 0 } : x)))}
                      inputMode="numeric" aria-label={`${i + 1}번째 정년`} className={`${inputCls} w-20 tabular-nums`} />
                    <span className={small} style={muted}>세</span>
                    <button type="button" className="min-h-[44px] px-2 text-sm underline" style={muted} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                      지우기
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className="min-h-[44px] rounded-md border px-3 text-sm" style={chip(false)} onClick={() => setRows([...rows, { fromYear: 0, age: 0 }])}>
                  줄 추가
                </button>
                <button type="button" className="min-h-[44px] rounded-md border px-3 text-sm" style={chip(false)} onClick={() => setRows(DEFAULT_ROWS)}>
                  기본값으로
                </button>
              </div>
            </div>
          ) : null}

          <label className="flex min-h-[44px] cursor-pointer items-center gap-2">
            <input type="checkbox" checked={onRehire} onChange={(e) => setOnRehire(e.target.checked)} />
            <span className="text-sm" style={ink}>정년 후 재고용 <span style={muted}>(정년은 현행 60세 그대로 두고 다시 쓰는 경우)</span></span>
          </label>
          {onRehire ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border p-3" style={{ borderColor: 'var(--color-border)' }}>
              <span className={small} style={muted}>정년 후</span>
              <input value={rehireYears} onChange={(e) => setRehireYears(e.target.value)} inputMode="numeric" aria-label="재고용 기간(년)" className={`${inputCls} w-20 tabular-nums`} />
              <span className={small} style={muted}>년 · 임금은 정년 전의</span>
              <input value={rehirePay} onChange={(e) => setRehirePay(e.target.value)} inputMode="numeric" aria-label="재고용 임금률(%)" className={`${inputCls} w-20 tabular-nums`} />
              <span className={small} style={muted}>%</span>
              <p className={`${small} w-full`} style={muted}>
                재고용 기간이 1년 이상이면 그 기간에 대한 퇴직금이 한 번 더 발생합니다. 결과에 그렇게 반영됩니다.
              </p>
            </div>
          ) : null}
        </div>
      </section>

      {/* ③ 결과 */}
      {results.length && base ? (
        <section className={card} aria-live="polite">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold" style={ink}>③ 결과</h2>
            <div className="flex gap-1">
              {(([['year', '연도별'], ...(base.r.groups.length > 1 ? [['group', '직군별'] as const] : []), ['person', '개인별']] as ['year' | 'group' | 'person', string][])).map(([v, l]) => (
                <button key={v} type="button" aria-pressed={tab === v} className="min-h-[44px] rounded-md border px-3 text-sm font-semibold" style={chip(tab === v)} onClick={() => setTab(v)}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {results.map((x) => (
              <div key={x.s.key} className="rounded-md border p-3" style={{ borderColor: 'var(--color-border)' }}>
                <p className="text-sm font-semibold" style={ink}>{x.s.label}</p>
                <p className="mt-1 text-sm tabular-nums" style={muted}>
                  기간 인건비 <strong style={ink}>{brief(x.r.totals.payroll)}원</strong>
                </p>
                <p className="text-sm tabular-nums" style={muted}>
                  퇴직금 <strong style={ink}>{brief(x.r.totals.severancePaid)}원</strong>
                </p>
                {x.s.key !== 'cur' ? (
                  <p className="mt-1 text-sm tabular-nums" style={muted}>
                    현행과 차이 {x.r.totals.payroll + x.r.totals.severancePaid >= base.r.totals.payroll + base.r.totals.severancePaid ? '+' : '−'}
                    {brief(Math.abs(x.r.totals.payroll + x.r.totals.severancePaid - base.r.totals.payroll - base.r.totals.severancePaid))}원
                  </p>
                ) : null}
              </div>
            ))}
          </div>

          {tab === 'group' ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <caption className="sr-only">직군별 정년 도달 인원</caption>
                <thead>
                  <tr>
                    <th scope="col" className="py-2 text-left" style={muted}>연도</th>
                    {base.r.groups.map((g) => (
                      <th key={g} scope="col" className="py-2 text-left" style={muted}>{g}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {base.r.years.map((y, i) => {
                    const any = results.some((x) => x.r.years[i].retiring > 0);
                    if (!any) return null;
                    return (
                      <tr key={y.year} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                        <th scope="row" className="py-2 text-left font-semibold tabular-nums" style={ink}>{y.year}</th>
                        {base.r.groups.map((g) => (
                          <td key={g} className="py-2 align-top tabular-nums">
                            {results.map((x) => {
                              const row = x.r.years[i].byGroup[g];
                              if (!row || !row.retiring) return null;
                              return (
                                <div key={x.s.key} style={ink}>
                                  <span style={muted}>{x.s.label}</span> {row.retiring}명
                                  {row.severancePaid ? <span style={muted}> · {brief(row.severancePaid)}원</span> : null}
                                </div>
                              );
                            })}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className={`${small} mt-2`} style={muted}>
                정년 도달자가 있는 해만 보여줍니다. 직군을 넣지 않은 사람은 「{NO_GROUP}」으로 묶입니다.
                한 직군에서 같은 해에 여럿이 빠지면 그 자리를 어떻게 메울지가 전체 인원보다 먼저 걸립니다.
              </p>
            </div>
          ) : tab === 'year' ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <caption className="sr-only">연도별 정년 도달 인원과 인건비</caption>
                <thead>
                  <tr>
                    <th scope="col" className="py-2 text-left" style={muted}>연도</th>
                    {results.map((x) => (
                      <th key={x.s.key} scope="col" className="py-2 text-left" style={muted}>{x.s.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {base.r.years.map((y, i) => (
                    <tr key={y.year} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                      <th scope="row" className="py-2 text-left font-semibold tabular-nums" style={ink}>{y.year}</th>
                      {results.map((x) => {
                        const row = x.r.years[i];
                        return (
                          <td key={x.s.key} className="py-2 align-top">
                            <div className="tabular-nums" style={ink}>
                              {row.retiring ? `정년 ${row.retiring}명 · ` : ''}재직 {row.headcount}명
                            </div>
                            <Bar value={row.payroll} max={maxPayroll} label={`${brief(row.payroll)}원`} />
                            {row.severancePaid ? (
                              <div className="mt-1 text-xs tabular-nums" style={muted}>퇴직금 {brief(row.severancePaid)}원</div>
                            ) : null}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className={`${small} mt-2`} style={muted}>
                정년 도달 인원이 가장 많은 해는 {base.r.years.reduce((a, b) => (b.retiring > a.retiring ? b : a)).year}년입니다(현행 기준, 최대 {maxRetiring}명).
              </p>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <caption className="sr-only">개인별 정년과 퇴직금 추정</caption>
                <thead>
                  <tr>
                    <th scope="col" className="py-2 text-left" style={muted}>사번</th>
                    <th scope="col" className="py-2 text-left" style={muted}>출생연월</th>
                    <th scope="col" className="py-2 text-left" style={muted}>입사일</th>
                    {results.map((x) => (
                      <th key={x.s.key} scope="col" className="py-2 text-left" style={muted}>{x.s.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.map((e, i) => (
                    <tr key={e.id} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                      <th scope="row" className="py-2 text-left font-semibold" style={ink}>
                        {e.id}{e.group ? <span className="ml-1 font-normal" style={muted}>{e.group}</span> : null}
                      </th>
                      <td className="py-2 tabular-nums" style={muted}>{e.birthYM}</td>
                      <td className="py-2 tabular-nums" style={muted}>{e.hireDate}</td>
                      {results.map((x) => {
                        const p = x.r.people[i];
                        return (
                          <td key={x.s.key} className="py-2 align-top tabular-nums" style={ink}>
                            <div>{p.retireAge}세 · {p.lastWorkDate}</div>
                            <div className="text-xs" style={muted}>
                              근속 {p.serviceYears}년 · 퇴직금 {brief(p.severance)}원
                              {p.rehireLastWorkDate ? ` → 재고용 ${p.rehireLastWorkDate}까지, 퇴직금 ${brief(p.rehireSeverance ?? 0)}원` : ''}
                            </div>
                            {p.note ? <div className="text-xs" style={muted}>{p.note}</div> : null}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <button type="button" className="mt-3 min-h-[44px] rounded-md border px-3 text-sm font-semibold" style={chip(false)}
                onClick={() => { void navigator.clipboard?.writeText(csv); }}>
                표를 쉼표 구분으로 복사
              </button>
            </div>
          )}

          <FoldedDetail summary="이 숫자를 어떻게 읽나">
            <ul className={`${small} space-y-2`} style={muted}>
              <li>
                <strong style={ink}>퇴직금은 추정입니다.</strong> 연봉을 평균임금 산정기간에 비례해 나눈 값으로 계산했습니다.
                실제 금액은 마지막 3개월에 실제로 받은 임금으로 갈립니다. 상여·연차수당이 있으면 더 커집니다.
              </li>
              <li>
                <strong style={ink}>단계적 연장은 한 번만 밀리는 게 아닙니다.</strong> 60세가 되는 해에 정년이 이미 올라가 있으면
                그 사람의 정년도 올라가고, 그 나이가 되는 해에 또 올라가 있으면 다시 밀립니다. 개인별 표의 정년 나이가 그 결과입니다.
              </li>
              <li>
                <strong style={ink}>정년이 밀리면 퇴직금 지급도 밀립니다.</strong> 연도별 표의 퇴직금 줄이 그것입니다 — 현금이 나가는 시점이 바뀝니다.
              </li>
              <li>
                <strong style={ink}>재고용은 퇴직금이 두 번 날 수 있습니다.</strong> 정년에 한 번, 재고용 기간이 1년 이상이면 그 기간에 대해 또 한 번입니다.
              </li>
              <li>전일제(주 15시간 이상)를 전제로 계산했습니다. 단시간 근로자가 섞여 있으면 그 사람은 따로 보셔야 합니다.</li>
              <li>임금 인상·승급은 넣지 않았습니다. 지금 연봉이 그대로 간다고 보고 계산한 값입니다.</li>
            </ul>
          </FoldedDetail>
        </section>
      ) : null}
    </div>
  );
}
