'use client';

import { useMemo, useState } from 'react';
import { calcWeeklyHoliday } from '@/lib/calc/weekly-holiday';
import { rateOn } from '@/content/rates';
import FoldedDetail from '@/components/tool/FoldedDetail';
import ToolSplit from '@/components/tool/ToolSplit';
import ResultBlock from '@/components/tool-result/ResultBlock';
import { card, inputCls, ink, muted, small, todayKst, wonInputError } from '@/lib/tool-kit';
import { defaultWageNote, weeklyHolidayView } from './result';

const num = (s: string) => Number(s.replace(/,/g, '').trim());

// 라디오 — 글자 줄(약 21px)만 눌리던 것을 44px 로 키운다(261124)
const radioLabel = 'flex min-h-[44px] cursor-pointer items-center gap-2';

export default function WeeklyHolidayClient() {
  const minRate = rateOn('minWageHourly', todayKst());
  const minWage = minRate?.value;
  const [wage, setWage] = useState(minWage ? String(minWage) : '');
  const [weekly, setWeekly] = useState('40');
  const [attended, setAttended] = useState(true);
  const [days, setDays] = useState('5');

  const out = useMemo(() => {
    // 시급은 10억원까지(실수령액 계산기와 같은 한도). 빈칸·0 은 계산하지 않고 알린다 — 계산식은 그대로다
    const bad = wonInputError('시급', wage, { required: true });
    if (bad) return { error: bad };
    try {
      return { r: calcWeeklyHoliday({ hourlyWage: num(wage), weeklyHours: num(weekly), fullAttendance: attended, fullTimeDays: num(days) }) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [wage, weekly, attended, days]);

  const wageNote = defaultWageNote(minRate);
  return (
    <ToolSplit
      inputs={
      <section className={`${card} grid gap-4 sm:grid-cols-2`}>
        <div>
          <label className={`${small} block`} style={muted}>
            시급(원)
            <input inputMode="numeric" className={inputCls} value={wage} onChange={(e) => setWage(e.target.value)} aria-describedby={wageNote ? 'whp-wage-note' : undefined} />
          </label>
          {wageNote && <p id="whp-wage-note" className="mt-1 text-xs leading-relaxed" style={muted}>{wageNote}</p>}
        </div>
        <label className={small} style={muted}>
          1주 소정근로시간(연장근로 빼고)
          <input inputMode="decimal" className={inputCls} value={weekly} onChange={(e) => setWeekly(e.target.value)} />
        </label>
        <fieldset className={`${small} sm:col-span-2`} style={muted}>
          <legend className="mb-1">그 주 정해진 근무일을 모두 나왔나요</legend>
          <div className="flex flex-wrap gap-x-6">
            <label className={radioLabel}><input type="radio" checked={attended} onChange={() => setAttended(true)} /> 모두 나왔다</label>
            <label className={radioLabel}><input type="radio" checked={!attended} onChange={() => setAttended(false)} /> 빠진 날이 있다</label>
          </div>
        </fieldset>
      </section>
      }
      result={
      'error' in out ? (
        <section className={card} aria-live="polite"><p className={small} style={ink}>{out.error}</p></section>
      ) : (
        <ResultBlock view={weeklyHolidayView({ r: out.r!, hourlyWage: num(wage), weeklyHours: num(weekly), fullTimeDays: num(days), minWage: minRate })} />
      )
      }
    >
      <FoldedDetail summary="더 정확히 — 통상근로자 근무일 수와 계산식">
        <label className={`${small} block max-w-xs`} style={muted}>
          같은 일을 하는 정규 직원의 1주 근무일 수
          <input inputMode="numeric" className={inputCls} value={days} onChange={(e) => setDays(e.target.value)} />
        </label>
        <ul className={`${small} list-disc space-y-1 pl-5`} style={muted}>
          <li>주휴수당 = 시급 × 1일 소정근로시간</li>
          <li>1일 소정근로시간 = 4주 소정근로시간 ÷ 그 4주 동안 정규 직원의 총 근무일 수. 주마다 시간이 다르면 4주를 평균해 넣습니다.</li>
          <li>1주 금액의 원 미만은 근로자에게 불리하지 않게 올립니다. 한 달 평균은 1주 금액 × 365 ÷ 7 ÷ 12 이고 참고값이라 원 미만을 반올림했습니다.</li>
          <li>월급에 주휴수당이 이미 들어 있는 경우(월급제)는 따로 더하지 않습니다.</li>
        </ul>
      </FoldedDetail>
    </ToolSplit>
  );
}
