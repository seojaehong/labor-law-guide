'use client';

import { useMemo, useState } from 'react';
import { calcAbsence, calcProration, METHOD_ORDER, type AbsenceResult, type MethodId, type ProrationResult, type RoundingRule } from '@/lib/calc/pay-proration';
import type { Rounding, RoundingUnit } from '@/lib/pay-check/policies';
import AnswerCard from '@/components/tool/AnswerCard';
import FoldedDetail from '@/components/tool/FoldedDetail';
import { card, inputCls, ink, muted, small, todayKst } from '@/lib/tool-kit';
import {
  absenceEffectLines, absenceHeadline, absenceRowLines, effectLines, formulaLines, headline,
  METHOD_HINT, METHOD_NAME, methodLines, NOT_COVERED, referenceLines, type Basis,
} from './copy';

type Mode = 'prorate' | 'absence';
const num = (s: string) => Number(s.replace(/,/g, '').trim() || '0');

/** 「16, 17, 18」 → 그달 날짜. 날짜 확인은 계산 모듈이 한다 */
function dayList(text: string, month: string, what: string): string[] {
  return text
    .split(/[,\s·]+/)
    .filter(Boolean)
    .map((p) => {
      if (!/^\d{1,2}$/.test(p)) throw new Error(`${what}은 그달 날짜를 16, 17처럼 숫자로 넣어 주세요`);
      return `${month}-${p.padStart(2, '0')}`;
    });
}

function Radio({ name, checked, onChange, children }: { name: string; checked: boolean; onChange: () => void; children: string }) {
  return (
    <label className="flex items-center gap-2">
      <input type="radio" name={name} checked={checked} onChange={onChange} /> {children}
    </label>
  );
}

type Out = { error: string } | { p: ProrationResult } | { a: AbsenceResult };

export default function PayProrationClient() {
  const [mode, setMode] = useState<Mode>('prorate');
  const [month, setMonth] = useState(todayKst().slice(0, 7));
  const [pay, setPay] = useState('2508000');
  const [fivePlus, setFivePlus] = useState(true);
  const [holidays, setHolidays] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [known, setKnown] = useState(false);
  const [method, setMethod] = useState<MethodId | null>(null);
  const [how, setHow] = useState<Rounding | 'none'>('none');
  const [unit, setUnit] = useState<RoundingUnit>(1);
  const [payslip, setPayslip] = useState('');
  const [absences, setAbsences] = useState('');
  const [late, setLate] = useState('');
  const [deduction, setDeduction] = useState('');
  const [avgDaily, setAvgDaily] = useState('');

  const basis: Basis = known && method ? method : 'unknown';

  const out = useMemo<Out>(() => {
    if (!/^\d{4}-\d{2}$/.test(month)) return { error: '급여 달을 넣어 주세요.' };
    const rounding: RoundingRule | null = how === 'none' ? null : { how, unit };
    try {
      const hol = dayList(holidays, month, '공휴일');
      if (mode === 'prorate') {
        if (!start && !end) return { error: '그달 중간에 입사했으면 입사일을, 퇴사했으면 퇴사일을 넣어 주세요.' };
        return {
          p: calcProration({
            month, monthlyPay: num(pay), fivePlus, holidays: hol, rounding,
            start: start || undefined, end: end || undefined,
            payslip: payslip.trim() ? num(payslip) : undefined,
          }),
        };
      }
      return {
        a: calcAbsence({
          month, monthlyPay: num(pay), fivePlus, holidays: hol, rounding,
          absences: dayList(absences, month, '결근일'),
          lateHours: late.trim() ? num(late) : undefined,
          companyDeduction: deduction.trim() ? num(deduction) : undefined,
          avgDailyWage: avgDaily.trim() ? num(avgDaily) : undefined,
        }),
      };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [mode, month, pay, fivePlus, holidays, start, end, payslip, absences, late, deduction, avgDaily, how, unit]);

  const roundingFields = (
    <>
      <label className={small} style={muted}>
        원 미만 끝수 처리(회사 기준)
        <select className={inputCls} value={how} onChange={(e) => setHow(e.target.value as Rounding | 'none')}>
          <option value="none">모름·정하지 않음</option>
          <option value="FLOOR">버림</option>
          <option value="ROUND">반올림</option>
          <option value="CEIL">올림</option>
        </select>
      </label>
      <label className={small} style={muted}>
        끝수 처리 단위
        <select className={inputCls} value={unit} disabled={how === 'none'} onChange={(e) => setUnit(Number(e.target.value) as RoundingUnit)}>
          <option value={1}>1원</option>
          <option value={10}>10원</option>
          <option value={100}>100원</option>
        </select>
      </label>
    </>
  );

  return (
    <div className="space-y-4">
      <section className={`${card} grid gap-4 sm:grid-cols-2`} aria-label="입력">
        <fieldset className={`${small} sm:col-span-2`} style={muted}>
          <legend className="mb-1">무엇을 계산하나요</legend>
          <div className="flex flex-wrap gap-4">
            <Radio name="mode" checked={mode === 'prorate'} onChange={() => setMode('prorate')}>입사·퇴사한 달 일할</Radio>
            <Radio name="mode" checked={mode === 'absence'} onChange={() => setMode('absence')}>결근·지각 공제(그달 내내 재직)</Radio>
          </div>
        </fieldset>
        <label className={small} style={muted}>
          급여 달
          <input type="month" className={inputCls} value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <label className={small} style={muted}>
          월급(원) — 일할하는 기본급과 매달 고정 수당
          <input inputMode="numeric" className={inputCls} value={pay} onChange={(e) => setPay(e.target.value)} />
        </label>
        <fieldset className={`${small} sm:col-span-2`} style={muted}>
          <legend className="mb-1">상시 근로자 수</legend>
          <div className="flex flex-wrap gap-4">
            <Radio name="size" checked={fivePlus} onChange={() => setFivePlus(true)}>5명 이상</Radio>
            <Radio name="size" checked={!fivePlus} onChange={() => setFivePlus(false)}>4명 이하</Radio>
          </div>
        </fieldset>
        <label className={`${small} sm:col-span-2`} style={muted}>
          그달 평일 중 쉬는 공휴일(날짜를 쉼표로)
          <input className={inputCls} value={holidays} placeholder="예: 16, 17, 18" onChange={(e) => setHolidays(e.target.value)} />
          <span className="mt-1 block">관공서 공휴일·대체공휴일처럼 쉬는 평일입니다. 이 도구는 달력에서 공휴일을 찾지 않고 넣은 날만 셉니다.</span>
        </label>
        {mode === 'prorate' ? (
          <>
            <label className={small} style={muted}>
              입사일(그달 중간에 입사했으면)
              <input type="date" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className={small} style={muted}>
              퇴사일(재직 마지막 날, 그달 중간이면)
              <input type="date" className={inputCls} value={end} onChange={(e) => setEnd(e.target.value)} />
              <span className="mt-1 block">근로관계가 이어진 마지막 날입니다(4대보험 상실일의 전날).</span>
            </label>
          </>
        ) : (
          <>
            <label className={small} style={muted}>
              무급 결근일(날짜를 쉼표로)
              <input className={inputCls} value={absences} placeholder="예: 18, 19" onChange={(e) => setAbsences(e.target.value)} />
            </label>
            <label className={small} style={muted}>
              지각·조퇴 합계 시간
              <input inputMode="decimal" className={inputCls} value={late} onChange={(e) => setLate(e.target.value)} />
            </label>
          </>
        )}
      </section>

      {mode === 'prorate' ? (
        <section className={`${card} grid gap-4 sm:grid-cols-2`} aria-label="회사 기준">
          <fieldset className={`${small} sm:col-span-2`} style={muted}>
            <legend className="mb-1">취업규칙·근로계약서·임금명세서에 그달 일할 계산방법이 적혀 있나요</legend>
            <div className="flex flex-wrap gap-4">
              <Radio name="known" checked={!known} onChange={() => setKnown(false)}>적혀 있지 않거나 모른다</Radio>
              <Radio name="known" checked={known} onChange={() => setKnown(true)}>적혀 있다</Radio>
            </div>
          </fieldset>
          {known && (
            <fieldset className={`${small} sm:col-span-2`} style={muted}>
              <legend className="mb-1">적힌 계산방법</legend>
              <div className="grid gap-2">
                {METHOD_ORDER.map((id) => (
                  <Radio key={id} name="method" checked={method === id} onChange={() => setMethod(id)}>{`${METHOD_NAME[id]} — ${METHOD_HINT[id]}`}</Radio>
                ))}
              </div>
            </fieldset>
          )}
          {roundingFields}
          <label className={`${small} sm:col-span-2`} style={muted}>
            명세서 금액(대조할 때만, 원)
            <input inputMode="numeric" className={inputCls} value={payslip} onChange={(e) => setPayslip(e.target.value)} />
          </label>
        </section>
      ) : (
        <section className={`${card} grid gap-4 sm:grid-cols-2`} aria-label="대조">
          {roundingFields}
          <label className={small} style={muted}>
            회사가 공제한 금액(대조할 때만, 원)
            <input inputMode="numeric" className={inputCls} value={deduction} onChange={(e) => setDeduction(e.target.value)} />
          </label>
          <label className={small} style={muted}>
            평균임금 1일분(감급 한도를 볼 때만, 원)
            <input inputMode="decimal" className={inputCls} value={avgDaily} onChange={(e) => setAvgDaily(e.target.value)} />
          </label>
        </section>
      )}

      {'error' in out && (
        <section className={card} aria-live="polite"><p className={small} style={ink}>{out.error}</p></section>
      )}

      {'p' in out && (
        <>
          <AnswerCard lines={headline(out.p, basis)}>
            {known && !method && <p className={`${small} mt-3`} style={ink}>적힌 계산방법을 고르면 그 방식의 값을 맨 위에 보여 줍니다.</p>}
            {effectLines(out.p, basis).map((l) => (
              <p key={l} className={`${small} mt-3`} style={muted}>{l}</p>
            ))}
          </AnswerCard>
          {out.p.status === 'calculated' && (
            <section className={card} aria-label="방식별 값">
              <h2 className="text-base font-semibold" style={ink}>방식별 값{basis === 'unknown' ? '(참고)' : ''}</h2>
              <ul className={`${small} mt-3 space-y-3`} style={muted}>
                {methodLines(out.p).map((x) => (
                  <li key={x.id}>
                    <span className="font-semibold" style={ink}>{x.name}{basis === x.id ? ' — 회사 기준' : ''}</span>
                    <span className="block" style={ink}>{x.values}</span>
                    <span className="block">{x.hint}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {out.p.status === 'calculated' && (
            <FoldedDetail summary="계산 과정">
              <ol className={`${small} list-decimal space-y-2 pl-5`} style={muted}>
                {formulaLines(out.p).map((l) => <li key={l}>{l}</li>)}
              </ol>
            </FoldedDetail>
          )}
          {referenceLines(out.p).length > 0 && (
            <FoldedDetail summary="참고: 그 기간 유급시간으로 나눈 시간당 금액">
              <ul className={`${small} list-disc space-y-1 pl-5`} style={muted}>
                {referenceLines(out.p).map((l) => <li key={l}>{l}</li>)}
              </ul>
            </FoldedDetail>
          )}
        </>
      )}

      {'a' in out && (
        <>
          <AnswerCard lines={absenceHeadline(out.a)}>
            {absenceEffectLines(out.a).map((l) => (
              <p key={l} className={`${small} mt-3`} style={muted}>{l}</p>
            ))}
          </AnswerCard>
          {absenceRowLines(out.a).length > 0 && (
            <section className={card} aria-label="1일 단가별 값">
              <h2 className="text-base font-semibold" style={ink}>1일 단가별 값</h2>
              <ul className={`${small} mt-3 list-disc space-y-1 pl-5`} style={muted}>
                {absenceRowLines(out.a).map((l) => <li key={l}>{l}</li>)}
              </ul>
            </section>
          )}
        </>
      )}

      <FoldedDetail summary="이 계산기가 다루지 않는 것">
        <ul className={`${small} list-disc space-y-1 pl-5`} style={muted}>
          {NOT_COVERED.map((l) => <li key={l}>{l}</li>)}
        </ul>
      </FoldedDetail>
    </div>
  );
}
