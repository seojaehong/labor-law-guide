'use client';

import { useMemo, useState } from 'react';
import {
  AGREED_WAGE_NOTICE, KIND_LABEL, OLD_ERA_NOTICE, PERF_YEAR_LABEL, RIGHT_TO_PAY_NOTICE, ROUNDING_NOTE, TIMES, UNIT_HOURS_NOTE,
  baseHours, checkItem, directionSentence, eraLabel, eraOn, fmt2, itemNotes, splitOvertime, sumIncluded, summaryLines,
  type Answer, type Era, type ItemCheck, type ItemKind, type TimesPerYear, type WageItem,
} from '@/lib/calc/ordinary-wage-check';
import { SOURCES, type SourceId } from '@/lib/calc/ordinary-wage-sources';
import AnswerCard from '@/components/tool/AnswerCard';
import FoldedDetail from '@/components/tool/FoldedDetail';
import { card, inputCls, ink, muted, small, todayKst } from '@/lib/tool-kit';

const TIMES_LABEL: Record<TimesPerYear, string> = {
  12: '매달(연 12번)', 6: '격월(연 6번)', 4: '분기(연 4번)', 3: '연 3번(설·추석·하계 등)', 2: '반기·명절(연 2번)', 1: '연 1번',
};
const DEFAULT_TIMES: Partial<Record<ItemKind, TimesPerYear>> = { bonus: 6, holiday: 2, performance: 1, business: 1 };
const defaultTimes = (k: ItemKind): TimesPerYear => DEFAULT_TIMES[k] ?? 12;
const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
const num = (s: string) => Number(s.replace(/,/g, '').trim() || '0');

interface Row {
  id: number;
  kind: ItemKind;
  name: string;
  amount: string;
  times: TimesPerYear;
  regular: Answer;
  uniform: Answer;
  forWork: Answer;
  payday: boolean;
  dayMode: 'none' | 'days' | 'rate';
  required: string;
  scheduled: string;
  rate: string;
  /** 지급일 전에 퇴직해도 근무일수에 비례해 지급(U09) */
  proRataLeave: boolean;
  /** 일수·출근율을 못 채워도 근무일수에 비례해 지급(U08) */
  proRataDays: boolean;
  restrict: boolean;
  minimum: string;
  perfYear: keyof typeof PERF_YEAR_LABEL;
  baseForAll: string;
}

function newRow(id: number, kind: ItemKind, o: Partial<Row> = {}): Row {
  return {
    id, kind, name: KIND_LABEL[kind], amount: '', times: defaultTimes(kind),
    regular: 'unknown', uniform: 'unknown', forWork: 'unknown',
    payday: false, dayMode: 'none', required: '', scheduled: '', rate: '', proRataLeave: false, proRataDays: false, restrict: false,
    minimum: '', perfYear: 'unknown', baseForAll: '', ...o,
  };
}

/** 종류를 바꾸면 손대지 않은 이름·지급 횟수는 새 종류의 기본값으로 */
function changeKind(r: Row, kind: ItemKind): Partial<Row> {
  return {
    kind,
    ...(r.name === KIND_LABEL[r.kind] ? { name: KIND_LABEL[kind] } : {}),
    ...(r.times === defaultTimes(r.kind) ? { times: defaultTimes(kind) } : {}),
  };
}

// 첫 화면 예시 — 기본급과 지급일 재직자에게만 주는 격월 정기상여금(합성 값). 기준일에 따라 두 기준이 갈리는 모습을 바로 보인다.
const START: Row[] = [
  newRow(1, 'base', { amount: '2500000', regular: 'yes', uniform: 'yes', forWork: 'yes' }),
  newRow(2, 'bonus', { amount: '2500000', regular: 'yes', uniform: 'yes', forWork: 'yes', payday: true }),
];

function toItem(r: Row): WageItem {
  return {
    kind: r.kind, name: r.name, amount: num(r.amount), timesPerYear: r.times,
    regular: r.regular, uniform: r.uniform, forWork: r.forWork,
    employedOnPayday: r.payday,
    workDays: r.dayMode === 'days' ? { required: num(r.required), scheduled: num(r.scheduled) } : undefined,
    attendanceRate: r.dayMode === 'rate' ? num(r.rate) : undefined,
    proRataOnLeave: r.payday && r.proRataLeave,
    proRataOnShortDays: r.dayMode !== 'none' && r.proRataDays,
    leaveOrDisciplineOnly: r.restrict,
    minimum: r.kind === 'performance' ? num(r.minimum) : undefined,
    performanceYear: r.kind === 'performance' ? r.perfYear : undefined,
    baseForAll: r.kind === 'family' ? num(r.baseForAll) : undefined,
  };
}

const ANSWERS: [Answer, string][] = [['yes', '예'], ['no', '아니오'], ['unknown', '모름']];

function Ask({ name, legend, hint, value, onChange }: { name: string; legend: string; hint?: string; value: Answer; onChange: (a: Answer) => void }) {
  return (
    <fieldset className={small} style={muted}>
      <legend className="mb-1" style={ink}>{legend}</legend>
      {hint && <p className="mb-1">{hint}</p>}
      <div className="flex flex-wrap gap-4">
        {ANSWERS.map(([a, label]) => (
          <label key={a} className="flex items-center gap-2">
            <input type="radio" name={name} checked={value === a} onChange={() => onChange(a)} /> {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Sources({ ids }: { ids: SourceId[] }) {
  return (
    <ul className="space-y-3">
      {ids.map((id) => {
        const s = SOURCES[id];
        return (
          <li key={id} className={small} style={muted}>
            <div className="font-semibold" style={ink}>{s.cite}</div>
            {s.quote ? (
              <blockquote className="mt-1 border-l-2 border-[var(--color-border)] pl-3">{s.quote}</blockquote>
            ) : (
              <p className="mt-1">요지: {s.note}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** now = 기준일의 기준, other = 다른 쪽 기준(결과가 다르면 한 줄 더 보인다) */
type Checked = { row: Row; item: WageItem; now: ItemCheck; other: ItemCheck } | { row: Row; error: string };

export default function OrdinaryWageClient() {
  const [date, setDate] = useState(todayKst());
  const [hours, setHours] = useState('209');
  const [rows, setRows] = useState<Row[]>(START);
  const [nextId, setNextId] = useState(3);
  const [adding, setAdding] = useState<ItemKind>('allowance');

  const set = (id: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const era = useMemo<Era | null>(() => {
    try {
      return eraOn(date);
    } catch {
      return null;
    }
  }, [date]);

  const checked = useMemo<Checked[]>(
    () =>
      rows.map((row) => {
        try {
          const item = toItem(row);
          return { row, item, now: checkItem(item, era ?? 'new'), other: checkItem(item, era === 'old' ? 'new' : 'old') };
        } catch (e) {
          return { row, error: (e as Error).message };
        }
      }),
    [rows, era],
  );

  const summary = useMemo(() => {
    if (!era) return { error: '연장근로 등을 제공한 날을 넣어 주세요.' };
    // 입력 오류가 난 항목은 그 항목 상자에 오류를 보이고 합계에서만 뺀다 — 다른 항목의 답은 그대로 낸다
    const invalid = checked.filter((c) => 'error' in c).length;
    const items = checked.flatMap((c) => ('item' in c ? [c.item] : []));
    try {
      const h = num(hours);
      return {
        era,
        checks: checked.flatMap((c) => ('now' in c ? [c.now] : [])),
        cur: sumIncluded(items, era, h),
        neu: sumIncluded(items, 'new', h),
        old: sumIncluded(items, 'old', h),
        h,
        invalid,
        payday: items.some((i) => i.employedOnPayday),
      };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [checked, era, hours]);

  const add = () => {
    setRows((rs) => [...rs, newRow(nextId, adding)]);
    setNextId((n) => n + 1);
  };

  const example = splitOvertime({ oldHourly: 13_000, newHourly: 15_000, hoursBefore: 15, hoursAfter: 10 });

  return (
    <div className="space-y-4">
      <section className={`${card} grid gap-4 sm:grid-cols-2`}>
        <label className={small} style={muted}>
          연장근로 등을 제공한 날(점검 기준일)
          <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className={small} style={muted}>
          월 기준시간
          <input inputMode="decimal" className={inputCls} value={hours} onChange={(e) => setHours(e.target.value)} />
        </label>
        <p className={`${small} sm:col-span-2`} style={muted}>
          2024. 12. 19.부터 제공한 연장근로 등은 새 기준, 그 전날까지는 종전 기준으로 봅니다. {UNIT_HOURS_NOTE}
        </p>
      </section>

      {checked.map((c, idx) => {
        const r = c.row;
        const q = (k: string) => `${k}-${r.id}`;
        const perf = r.kind === 'performance';
        return (
          <section key={r.id} className={`${card} space-y-4`} aria-label={`항목 ${idx + 1}`}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={small} style={muted}>
                종류
                <select className={inputCls} value={r.kind} onChange={(e) => set(r.id, changeKind(r, e.target.value as ItemKind))}>
                  {(Object.keys(KIND_LABEL) as ItemKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </select>
              </label>
              <label className={small} style={muted}>
                이름(회사에서 부르는 이름)
                <input className={inputCls} value={r.name} onChange={(e) => set(r.id, { name: e.target.value })} />
              </label>
              <label className={small} style={muted}>
                1회 지급액(원, 근무를 빠짐없이 했을 때)
                <input inputMode="numeric" className={inputCls} value={r.amount} onChange={(e) => set(r.id, { amount: e.target.value })} />
              </label>
              <label className={small} style={muted}>
                1년에 몇 번 주나
                <select className={inputCls} value={r.times} onChange={(e) => set(r.id, { times: Number(e.target.value) as TimesPerYear })}>
                  {TIMES.map((t) => <option key={t} value={t}>{TIMES_LABEL[t]}</option>)}
                </select>
              </label>
            </div>

            {r.kind === 'statutory' ? null : (
              <>
                <Ask name={q('regular')} legend="정해진 주기: 매달 또는 정해진 주기(격월·분기·명절·연 단위)마다 지급하도록 정해져 있습니까?"
                  value={r.regular} onChange={(a) => set(r.id, { regular: a })} />
                <Ask name={q('uniform')} legend="지급 대상: 모든 근로자에게, 또는 직무·자격·근속기간처럼 일의 가치와 관련된 조건을 갖춘 사람 모두에게 지급합니까?"
                  hint="부양가족 수나 장애 여부처럼 일과 무관한 조건이면 「아니오」입니다."
                  value={r.uniform} onChange={(a) => set(r.id, { uniform: a })} />
                {perf ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className={small} style={muted}>
                      평가와 무관하게 최소로 보장된 1회 금액(없으면 비움)
                      <input inputMode="numeric" className={inputCls} value={r.minimum} onChange={(e) => set(r.id, { minimum: e.target.value })} />
                    </label>
                    <fieldset className={small} style={muted}>
                      <legend className="mb-1" style={ink}>그 성과급은 어느 기간의 실적분입니까?</legend>
                      <p className="mb-1">
                        점검 기준일이 속한 해의 실적분이면 지급이 다음 해여도 그해 통상임금 쪽으로 봅니다. 판결은 지급 시기가 아니라 지급 대상기간으로 가렸습니다(2023다216777).
                      </p>
                      <div className="flex flex-wrap gap-4">
                        {(Object.keys(PERF_YEAR_LABEL) as (keyof typeof PERF_YEAR_LABEL)[]).map((v) => (
                          <label key={v} className="flex items-center gap-2">
                            <input type="radio" name={q('perfYear')} checked={r.perfYear === v} onChange={() => set(r.id, { perfYear: v })} /> {PERF_YEAR_LABEL[v]}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  </div>
                ) : (
                  <Ask name={q('forWork')} legend="근무시간의 대가: 정해진 근무시간을 빠짐없이 일하면 그 대가로 받는 금액입니까?"
                    hint={r.kind === 'family'
                      ? '부양가족에 따라 주는 금액을 생각해 답합니다. 모두에게 주는 기본금액이 있으면 아래 칸에 넣습니다 — 그 금액은 이 답과 상관없이 봅니다.'
                      : '실적 평가·무사고·추가 근무처럼 정해진 근무 밖의 요건을 달성해야 받는다면 「아니오」입니다. 지급일 재직·근무일수·출근율 조건은 아래 ‘붙어 있는 조건’에 적고, 그 조건만 있다면 여기는 「예」입니다.'}
                    value={r.forWork} onChange={(a) => set(r.id, { forWork: a })} />
                )}
                {r.kind === 'family' && (
                  <label className={`${small} block`} style={muted}>
                    부양가족과 상관없이 모두에게 주는 1회 기본금액(없으면 비움)
                    <input inputMode="numeric" className={inputCls} value={r.baseForAll} onChange={(e) => set(r.id, { baseForAll: e.target.value })} />
                  </label>
                )}

                <fieldset className={`${small} space-y-2`} style={muted}>
                  <legend className="mb-1" style={ink}>붙어 있는 조건</legend>
                  <label className="flex items-start gap-2">
                    <input type="checkbox" className="mt-1" checked={r.payday} onChange={(e) => set(r.id, { payday: e.target.checked })} />
                    지급일에 재직 중이어야 받는다
                  </label>
                  <div className="flex flex-wrap gap-4">
                    <span>일정 근무일수(또는 출근율)를 채워야 받나요</span>
                    {([['none', '조건 없음'], ['days', '일수로 정함'], ['rate', '출근율로 정함']] as const).map(([v, label]) => (
                      <label key={v} className="flex items-center gap-2">
                        <input type="radio" name={q('dayMode')} checked={r.dayMode === v} onChange={() => set(r.id, { dayMode: v })} /> {label}
                      </label>
                    ))}
                  </div>
                  {r.dayMode === 'days' && (
                    <div className="grid gap-3 pl-6 sm:grid-cols-2">
                      <label>
                        조건 일수
                        <input inputMode="numeric" className={inputCls} value={r.required} onChange={(e) => set(r.id, { required: e.target.value })} />
                      </label>
                      <label>
                        그 기간의 소정근로일수
                        <input inputMode="numeric" className={inputCls} value={r.scheduled} onChange={(e) => set(r.id, { scheduled: e.target.value })} />
                      </label>
                      <p className="sm:col-span-2">조건을 2개월마다 따지면 그 2개월의 소정근로일수를 넣습니다.</p>
                    </div>
                  )}
                  {r.dayMode === 'rate' && (
                    <label className="block pl-6">
                      전액을 주는 출근율(%)
                      <input inputMode="decimal" className={inputCls} value={r.rate} onChange={(e) => set(r.id, { rate: e.target.value })} />
                    </label>
                  )}
                  {r.payday && (
                    <label className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" checked={r.proRataLeave} onChange={(e) => set(r.id, { proRataLeave: e.target.checked })} />
                      지급일 전에 퇴직해도 그때까지 근무일수에 비례해 지급한다(2024. 12. 18.까지 제공분에만 영향)
                    </label>
                  )}
                  {r.dayMode !== 'none' && (
                    <label className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" checked={r.proRataDays} onChange={(e) => set(r.id, { proRataDays: e.target.checked })} />
                      정한 일수(출근율)를 못 채워도 일한 날만큼 일할해 지급한다(2024. 12. 18.까지 제공분에만 영향)
                    </label>
                  )}
                  <label className="flex items-start gap-2">
                    <input type="checkbox" className="mt-1" checked={r.restrict} onChange={(e) => set(r.id, { restrict: e.target.checked })} />
                    휴직자·복직자·징계 대상자에게는 주지 않는다는 규정이 있다
                  </label>
                </fieldset>
              </>
            )}

            <div className="rounded-lg bg-[var(--grey-100)] p-3">
              {'error' in c ? (
                <p className={small} style={ink}>{c.error}</p>
              ) : (
                <>
                  <p className={`${small} font-semibold`} style={ink}>{directionSentence(c.now.direction, era ?? 'new')}</p>
                  {c.other.direction !== c.now.direction && (
                    <p className={`${small} mt-1`} style={muted}>{directionSentence(c.other.direction, era === 'old' ? 'new' : 'old')}</p>
                  )}
                  {itemNotes(c.item, c.now).map((n) => <p key={n} className={`${small} mt-1`} style={muted}>{n}</p>)}
                  {c.now.direction === 'in' && (
                    <p className={`${small} mt-1`} style={muted}>
                      1년 {won(c.now.annual)}{c.now.priorYear ? '(전년도분)' : ''}
                    </p>
                  )}
                  <details className="mt-2">
                    <summary className={`${small} cursor-pointer`} style={ink}>근거 원문</summary>
                    <div className="mt-2"><Sources ids={c.now.reasons} /></div>
                  </details>
                </>
              )}
            </div>

            <button type="button" className={`${small} underline underline-offset-2`} style={muted}
              onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}>
              이 항목 빼기
            </button>
          </section>
        );
      })}

      <section className={`${card} flex flex-wrap items-end gap-3`}>
        <label className={`${small} min-w-0 flex-1`} style={muted}>
          더할 항목
          <select className={inputCls} value={adding} onChange={(e) => setAdding(e.target.value as ItemKind)}>
            {(Object.keys(KIND_LABEL) as ItemKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <button type="button" onClick={add}
          className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-semibold" style={ink}>
          항목 더하기
        </button>
      </section>

      {'error' in summary ? (
        <section className={card} aria-live="polite"><p className={small} style={ink}>{summary.error}</p></section>
      ) : (
        <AnswerCard lines={summaryLines(summary.era, summary.checks, summary.cur.hourly, summary.invalid)}>
          <p className={`${small} mt-3`} style={muted}>
            {eraLabel('new')} 시간당 {fmt2(summary.neu.hourly)}원 · {eraLabel('old')} 시간당 {fmt2(summary.old.hourly)}원
          </p>
          {summary.era === 'old' && <p className={`${small} mt-2`} style={ink}>{OLD_ERA_NOTICE}</p>}
          {summary.payday && <p className={`${small} mt-2`} style={muted}>{RIGHT_TO_PAY_NOTICE}</p>}
          <p className={`${small} mt-2`} style={muted}>{AGREED_WAGE_NOTICE}</p>
        </AnswerCard>
      )}

      <FoldedDetail summary="시간급은 어떻게 냈나">
        {!('error' in summary) && (
          <p className={small} style={muted}>
            들어가는 쪽 항목 1년 합계 {won(summary.cur.annual)} ÷ 12 ÷ {summary.h.toLocaleString('ko-KR')}시간 = 시간당 {fmt2(summary.cur.hourly)}원
          </p>
        )}
        <ul className={`${small} list-disc space-y-1 pl-5`} style={muted}>
          <li>격월·분기·명절·연 단위로 주는 금액도 1년 금액으로 바꿔 12로 나눈 뒤 더합니다(시행령 제6조 제2항 제5·7호).</li>
          <li>{UNIT_HOURS_NOTE}</li>
          <li>
            주 40시간 + 주휴 8시간이면 1년을 365일로 보면 {baseHours(48, '365')}시간, 366일이면 {baseHours(48, '366')}시간,
            지침 예시(약 52.14주)는 {baseHours(48, '52.14')}시간입니다.
          </li>
          <li>{ROUNDING_NOTE}</li>
        </ul>
        <Sources ids={['G_Q8']} />
      </FoldedDetail>

      <FoldedDetail summary="2024년 12월에 걸친 연장근로">
        <p className={small} style={muted}>
          새 기준은 연장근로 등을 「제공한 날」로 가릅니다. 같은 달이라도 12. 18.까지 일한 시간은 종전 시간급, 12. 19.부터 일한 시간은 새 시간급으로 셉니다.
        </p>
        <p className={small} style={muted}>
          지침 예시(종전 시간당 13,000원, 새 기준 시간당 15,000원, 12. 18.까지 15시간·12. 19.부터 10시간, 가산 50%)로 나눠 세면{' '}
          {won(example.before)} + {won(example.after)} = {won(example.total)}입니다. 가산율은 근로기준법 제56조 제1항(통상임금의 100분의 50 이상)입니다.
        </p>
        <Sources ids={['Q12', 'G_Q11']} />
      </FoldedDetail>

      <FoldedDetail summary="왜 단정하지 않나 · 지급 조건과의 관계">
        <Sources ids={['Q02', 'Q14', 'T02', 'G_Q12', 'T03', 'T04', 'G_P11']} />
      </FoldedDetail>
    </div>
  );
}
