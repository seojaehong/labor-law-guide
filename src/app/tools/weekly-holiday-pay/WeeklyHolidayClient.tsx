'use client';

import { useMemo, useState } from 'react';
import { calcWeeklyHoliday, type WeeklyHolidayResult } from '@/lib/calc/weekly-holiday';
import { rateOn } from '@/content/rates';
import AnswerCard from '@/components/tool/AnswerCard';
import FoldedDetail from '@/components/tool/FoldedDetail';
import { card, inputCls, ink, muted, small, todayKst } from '@/lib/tool-kit';

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
const num = (s: string) => Number(s.replace(/,/g, '').trim());
const hours = (n: number) => `${n.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}시간`;

function headline(r: WeeklyHolidayResult, weeklyHours: number): string[] {
  if (r.status === 'under15') return [`1주 ${hours(weeklyHours)}이면 주휴수당이 없습니다.`, '4주를 평균한 1주 소정근로시간이 15시간 미만입니다.'];
  if (r.status === 'absent') return ['이번 주는 주휴수당이 없습니다.', '그 주 소정근로일을 모두 나와야 생깁니다.'];
  return [`1주 주휴수당은 ${won(r.amount)}입니다.`, `한 달 평균 약 ${won(r.monthly)}`];
}

export default function WeeklyHolidayClient() {
  const minWage = rateOn('minWageHourly', todayKst())?.value;
  const [wage, setWage] = useState(minWage ? String(minWage) : '');
  const [weekly, setWeekly] = useState('40');
  const [attended, setAttended] = useState(true);
  const [days, setDays] = useState('5');

  const out = useMemo(() => {
    try {
      return { r: calcWeeklyHoliday({ hourlyWage: num(wage), weeklyHours: num(weekly), fullAttendance: attended, fullTimeDays: num(days) }) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [wage, weekly, attended, days]);

  const w = num(weekly);
  return (
    <div className="space-y-4">
      <section className={`${card} grid gap-4 sm:grid-cols-2`}>
        <label className={small} style={muted}>
          시급(원)
          <input inputMode="numeric" className={inputCls} value={wage} onChange={(e) => setWage(e.target.value)} />
        </label>
        <label className={small} style={muted}>
          1주 소정근로시간(연장근로 빼고)
          <input inputMode="decimal" className={inputCls} value={weekly} onChange={(e) => setWeekly(e.target.value)} />
        </label>
        <fieldset className={`${small} sm:col-span-2`} style={muted}>
          <legend className="mb-1">그 주 정해진 근무일을 모두 나왔나요</legend>
          <div className="flex gap-4">
            <label className="flex items-center gap-2"><input type="radio" checked={attended} onChange={() => setAttended(true)} /> 모두 나왔다</label>
            <label className="flex items-center gap-2"><input type="radio" checked={!attended} onChange={() => setAttended(false)} /> 빠진 날이 있다</label>
          </div>
        </fieldset>
      </section>

      {'error' in out ? (
        <section className={card} aria-live="polite"><p className={small} style={ink}>{out.error}</p></section>
      ) : (
        <AnswerCard lines={headline(out.r!, w)}>
          {out.r!.status === 'paid' && (
            <p className={`${small} mt-3`} style={muted}>
              시급 {won(num(wage))} × 하루 {hours(out.r!.dailyHours)}. 하루 시간은 1주 {hours(w)}을 통상근로자 1주 근무일 {num(days)}일로 나눈 값입니다(하루 8시간까지).
            </p>
          )}
          {minWage && num(wage) > 0 && num(wage) < minWage && (
            <p className={`${small} mt-3 font-semibold`} style={ink}>
              입력한 시급이 올해 최저임금 {won(minWage)}보다 낮습니다.
            </p>
          )}
        </AnswerCard>
      )}

      <FoldedDetail summary="더 정확히 — 통상근로자 근무일 수와 계산식">
        <label className={`${small} block max-w-xs`} style={muted}>
          같은 일을 하는 정규 직원의 1주 근무일 수
          <input inputMode="numeric" className={inputCls} value={days} onChange={(e) => setDays(e.target.value)} />
        </label>
        <ul className={`${small} list-disc space-y-1 pl-5`} style={muted}>
          <li>주휴수당 = 시급 × 1일 소정근로시간</li>
          <li>1일 소정근로시간 = 4주 소정근로시간 ÷ 그 4주 동안 정규 직원의 총 근무일 수. 주마다 시간이 다르면 4주를 평균해 넣습니다.</li>
          <li>한 달 평균은 1주 금액 × 365 ÷ 7 ÷ 12 입니다. 원 미만은 반올림했습니다.</li>
          <li>월급에 주휴수당이 이미 들어 있는 경우(월급제)는 따로 더하지 않습니다.</li>
        </ul>
      </FoldedDetail>
    </div>
  );
}
