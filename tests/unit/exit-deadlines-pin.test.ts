// 퇴사 기한 세 벌 고정 — /exit-employer(src/app/exit-employer/exit-dates.ts), /exit(src/app/exit/exit-calc.ts),
// 엔진 사본(src/lib/exit-check/core/deadlines.ts·values.ts + deadline-rules.json).
// 2026-01-01 ~ 2028-12-31 의 1,096일 각각을 마지막 근무일(L)로 놓고 본다. 기한을 한 벌로 합치는 시험이 아니다 —
// 지금 같은 것은 같다고, 다른 것은 얼마나 다른지 고정해 두어 어느 쪽이든 바뀌면 붉어지게 한다.
//
// (a) 사이트 두 화면이 같은 날을 낸다: 상실일(L+1), 금품 청산·퇴직금 14일, 건강보험 상실 신고 14일, 다음 달 15일.
// (b) 엔진의 가장 이른 후보 = 사이트 날짜. 상실일 산출(국민연금·건강보험·고용보험), 다음 달 15일(국민연금·고용보험·산재),
//     건강보험 14일. 상실일 칸에 L+1 이 기록돼 있을 때다(4_기한대조 「불일치 2」: 상실일 칸이 비면 엔진은 다른 앵커를 쓴다).
// (c) 알려진 차이 — 사장님 결정 B4 를 기다린다. 금품 청산(근로기준법 §36)·퇴직금(퇴직급여법 §9) 14일에서
//     사이트는 L+14 를 기한일로 보여 주고, 엔진의 가장 이른 후보는 그보다 이르다:
//     퇴직일 칸 기준이 LAST_DAY 이거나 선언되지 않았으면 L+12, DAY_AFTER_LAST_DAY 이면 L+13.
//     그래서 점검표가 말한 기한일 당일 지급이 엔진에서는 REVIEW_REQUIRED 가 된다. 사이트 날짜는 엔진 후보 집합 안에 있다.
//
// 엔진 쪽에서 앵커를 고르는 법(기록된 퇴직일 ±1, 기록된 상실일, 기준 선언에 따른 마지막 근무일)은
// src/lib/exit-check/rules/r009_deadlines.ts·core/context.ts 에 있고, 이 시험은 그 고르는 법을 아래 recordedEnd·eventDate 로
// 옮겨 적었다. 규칙 경로 자체는 동작 지문(S13 지급 14일 경계, S19 DAY_AFTER_LAST_DAY)의 core 해시가 지킨다
// (tests/unit/exit-check-sync.test.ts).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeExitDates, fmtIso, parseYmd } from '@/app/exit-employer/exit-dates';
import { employmentInsuranceReportDeadline, milestones, retirementDate } from '@/app/exit/exit-calc';
import { daysAfterCandidates, endDateAnchors, evaluableRules, nextMonthCandidates } from '@/lib/exit-check/core/deadlines';
import type { DeadlineRule, DeadlineRulesFile, EndDateBasis } from '@/lib/exit-check/core/types';
import { addDays, dateToDays } from '@/lib/exit-check/core/values';

const rules = JSON.parse(readFileSync(join(__dirname, '..', '..', 'src', 'lib', 'exit-check', 'deadline-rules.json'), 'utf8')) as DeadlineRulesFile;
const evaluable = evaluableRules(rules);

function rule(key: string): DeadlineRule {
  const r = evaluable.find((x) => x.rule_key === key);
  if (!r) throw new Error(`R-009 이 평가하는 규칙에 ${key} 가 없다`);
  return r;
}
function daysN(r: DeadlineRule): number {
  if (r.formula?.type !== 'days_after') throw new Error(`${r.rule_key} 는 days_after 가 아니다`);
  return r.formula.n;
}
function monthDay(r: DeadlineRule): number {
  if (r.formula?.type !== 'next_month_day') throw new Error(`${r.rule_key} 는 next_month_day 가 아니다`);
  return r.formula.day;
}

const FIRST = '2026-01-01';
const LAST = '2028-12-31';
const DAYS: string[] = [];
for (let d = FIRST; d <= LAST; d = addDays(d, 1)) DAYS.push(d);

const offset = (from: string, to: string) => dateToDays(to) - dateToDays(from);

/** 퇴직일 칸에 적힌 날짜: LAST_DAY·UNDECLARED 는 마지막 근무일, DAY_AFTER_LAST_DAY 는 그 다음 날(docs/03 3.5). */
const recordedEnd = (L: string, basis: EndDateBasis) => (basis === 'DAY_AFTER_LAST_DAY' ? addDays(L, 1) : L);
/** 엔진이 마지막 근무일로 읽는 날(core/context.ts eventDate). */
const eventDate = (end: string, basis: EndDateBasis) => (basis === 'DAY_AFTER_LAST_DAY' ? addDays(end, -1) : end);
const BASES: EndDateBasis[] = ['LAST_DAY', 'UNDECLARED', 'DAY_AFTER_LAST_DAY'];

function siteDates(L: string) {
  const ee = computeExitDates(parseYmd(L)!);
  const ms = new Map(milestones(L).map((m) => [m.key, m.date]));
  return {
    employer: { lossDay: fmtIso(ee.lossDay), settle: fmtIso(ee.settle), health14: fmtIso(ee.health14), report15: fmtIso(ee.report15) },
    worker: { lossDay: retirementDate(L), settle: ms.get('settle'), health14: ms.get('health'), report15: employmentInsuranceReportDeadline(L) },
    workerRetire: ms.get('retire'),
    workerEmployment: ms.get('employment'),
  };
}

describe('퇴사 기한 세 벌 고정 — 마지막 근무일 2026-01-01 ~ 2028-12-31', () => {
  it('범위가 정확히 1,096일이다', () => {
    expect(DAYS).toHaveLength(1096);
    expect(DAYS[0]).toBe(FIRST);
    expect(DAYS.at(-1)).toBe(LAST);
  });

  it(
    '(a) /exit-employer 와 /exit 가 상실일·14일 지급 기한·건강보험 14일·다음 달 15일에서 같은 날을 낸다',
    () => {
      const bad: string[] = [];
      for (const L of DAYS) {
        const s = siteDates(L);
        if (JSON.stringify(s.employer) !== JSON.stringify(s.worker)) bad.push(`${L} ${JSON.stringify(s)}`);
        if (s.workerRetire !== s.worker.lossDay || s.workerEmployment !== s.worker.report15) bad.push(`${L} /exit 이정표 ${JSON.stringify(s)}`);
        if (offset(L, s.employer.lossDay) !== 1 || offset(L, s.employer.settle) !== 14 || offset(L, s.employer.health14) !== 14) {
          bad.push(`${L} 사이트 산식 ${JSON.stringify(s.employer)}`);
        }
      }
      expect(bad).toEqual([]);
    },
    60_000,
  );

  it(
    '(b) 엔진 상실일 산출(국민연금·건강보험·고용보험 n=1) = 사이트 상실일 — 기준 처리는 시험 안에 옮겨 적은 것(엔진 경로는 동작 지문 S19 가 지킨다)',
    () => {
      const lossRules = ['NPS12_LOSS_DATE', 'NHIS9_CHANGE_DATE', 'EI14_LOSS_DATE'].map(rule);
      for (const r of lossRules) {
        expect([r.rule_kind, r.anchor_field, daysN(r)], r.rule_key).toEqual(['loss_date', 'employment_end_date', 1]);
      }
      const bad: string[] = [];
      for (const L of DAYS) {
        const site = siteDates(L).employer.lossDay;
        for (const basis of BASES) {
          for (const r of lossRules) {
            const derived = addDays(eventDate(recordedEnd(L, basis), basis), daysN(r));
            if (derived !== site) bad.push(`${L} ${basis} ${r.rule_key} 엔진 ${derived} ↔ 사이트 ${site}`);
          }
        }
      }
      expect(bad).toEqual([]);
    },
    60_000,
  );

  it(
    '(b) 엔진 다음 달 15일(국민연금·고용보험·산재)의 가장 이른 후보 = 사이트 report15 — 상실일 칸이 L+1',
    () => {
      const reportRules = ['NPS_RULE6_LOSS_REPORT', 'EI_DECREE7_LOSS_REPORT', 'IACI_COLLECT16_10_END_REPORT'].map(rule);
      expect(reportRules.map((r) => [r.rule_kind, r.anchor_field, monthDay(r)])).toEqual([
        ['report_deadline', 'insurance_loss_date', 15],
        ['report_deadline', 'insurance_loss_date', 15],
        ['report_deadline', 'insurance_loss_date_ei', 15],
      ]);
      const bad: string[] = [];
      for (const L of DAYS) {
        const s = siteDates(L);
        const recordedLoss = addDays(L, 1); // 산재는 고용보험 상실일 기록을 앵커로 쓴다 — 같은 L+1
        for (const r of reportRules) {
          const earliest = nextMonthCandidates([recordedLoss], monthDay(r))[0];
          if (earliest !== s.employer.report15 || earliest !== s.worker.report15) bad.push(`${L} ${r.rule_key} 엔진 ${earliest} ↔ 사이트 ${s.employer.report15}`);
        }
      }
      expect(bad).toEqual([]);
    },
    60_000,
  );

  it(
    '(b) 엔진 건강보험 상실 신고 14일의 가장 이른 후보 = 사이트 health14 — 상실일 칸이 L+1',
    () => {
      const r = rule('NHIS_EMPLOYER_LOSS_REPORT');
      expect([r.rule_kind, r.anchor_field, daysN(r)]).toEqual(['report_deadline', 'insurance_loss_date', 14]);
      const bad: string[] = [];
      for (const L of DAYS) {
        const s = siteDates(L);
        const earliest = daysAfterCandidates([addDays(L, 1)], daysN(r))[0];
        if (earliest !== s.employer.health14 || earliest !== s.worker.health14) bad.push(`${L} 엔진 ${earliest} ↔ 사이트 ${s.employer.health14}`);
      }
      expect(bad).toEqual([]);
    },
    60_000,
  );

  it(
    '(c) 알려진 차이(B4 결정 대기): 14일 지급 기한 — 사이트 L+14, 엔진 가장 이른 후보 L+12(LAST_DAY·미선언)·L+13(DAY_AFTER_LAST_DAY)',
    () => {
      // 이 차이는 의도적으로 고정한다. 사장님이 B4(14일 지급 기한을 어느 쪽에 맞출지)를 정하면
      // 엔진 규칙이나 사이트 산식이 바뀌고, 그때 이 시험의 기대값을 결정에 맞춰 같은 PR 에서 고친다.
      const payRules = ['LSA36_FINAL_SETTLEMENT_14D', 'RPBA9_SEVERANCE_14D'].map(rule);
      for (const r of payRules) {
        expect([r.rule_kind, r.anchor_field, daysN(r)], r.rule_key).toEqual(['payment_deadline', 'employment_end_date', 14]);
      }
      const want: Record<EndDateBasis, number> = { LAST_DAY: 12, UNDECLARED: 12, DAY_AFTER_LAST_DAY: 13 };
      const seen: Record<string, Set<number>> = {};
      const notInSet: string[] = [];
      for (const L of DAYS) {
        const settle = siteDates(L).employer.settle;
        (seen.site ??= new Set()).add(offset(L, settle));
        for (const basis of BASES) {
          for (const r of payRules) {
            // r009_deadlines.ts: 지급 기한 앵커 = 기록된 퇴직일 ±1, 후보 = 각 앵커 + n 과 + (n-1), 토·일 이월 후보 추가.
            const candidates = daysAfterCandidates(endDateAnchors(recordedEnd(L, basis)), daysN(r));
            (seen[`${basis}:${r.rule_key}`] ??= new Set()).add(offset(L, candidates[0]!));
            if (!candidates.includes(settle)) notInSet.push(`${L} ${basis} ${r.rule_key}`);
          }
        }
      }
      expect([...seen.site!]).toEqual([14]);
      for (const basis of BASES) {
        for (const r of payRules) {
          expect([...seen[`${basis}:${r.rule_key}`]!], `${basis} ${r.rule_key} — 엔진 가장 이른 후보가 L+${want[basis]} 가 아니다(B4)`).toEqual([want[basis]]);
        }
      }
      expect(notInSet, '사이트 L+14 가 엔진 후보 집합 밖에 있다').toEqual([]);
    },
    60_000,
  );
});
