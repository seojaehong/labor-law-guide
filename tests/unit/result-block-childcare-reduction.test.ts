// 육아기 근로시간 단축 급여·장려금 계산기 — 결과 블록 글자(261128).
// 금액은 손으로 센 값이 아니라 엔진(calcChildcareReduction) 출력과 견준다. 화면은 엔진 숫자를 옮길 뿐이다.
// 합성 값만 쓴다. 렌더 시험 기반(jsdom)이 없어 컴포넌트는 소스 글자로 본다(result-block-shutdown-allowance 와 같은 방식).
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { TOOLS } from '@/content/tools-registry';
import { calcChildcareReduction, RULES_CHECKED_ON, type ChildcareReductionInput } from '@/lib/calc/childcare-reduction';
import { bannedHits } from '@/lib/tool-kit/banned';
import { won, type ResultView } from '@/components/tool-result/result-view';
import {
  allCopy, applyLines, checkGroups, childcareReductionView, mergedNeeds, scheduleRows, toEngineInput, type FormState, EMPTY_FORM,
} from '@/app/tools/childcare-reduction/result';

const CLIENT = 'src/app/tools/childcare-reduction/ChildcareReductionClient.tsx';

const domText = (v: ResultView, children: string[] = []) => [
  v.status, ...v.verdict, ...(v.meta ?? []), ...v.amounts.flatMap((a) => [a.label, a.value, ...(a.note ?? [])]),
  v.formula ?? '', ...(v.warnings ?? []), v.nextNote ?? '', ...children,
  v.basis.length ? `근거 ${v.basis.map((b) => b.label).join(' · ')}` : '', ...v.asOf, v.caveat ?? '', ...v.next.map((n) => n.label),
].filter(Boolean).join(' ');

function hrefExists(href: string): boolean {
  if (TOOLS.some((t) => t.href === href)) return true;
  return existsSync(`src/app${href}/page.tsx`);
}

// 합성 값 — 월 통상임금 300만, 주 40 → 24시간, 2027. 2. 1. ~ 7. 31.
const BASE: ChildcareReductionInput = {
  monthlyOrdinaryWage: 3_000_000, weeklyHoursBefore: 40, weeklyHoursAfter: 24, startDate: '2027-02-01', endDate: '2027-07-31',
};
const FULL: ChildcareReductionInput = {
  ...BASE, insuredDays180: true, childEligible: true, priorityFirm: true, firstTimeGrant: true, employerPaidMonthly: 1_800_000,
  workSharing: { paidMonthly: 300_000 },
};
const NO_WAGE: ChildcareReductionInput = { weeklyHoursBefore: 40, weeklyHoursAfter: 24, startDate: '2027-02-01', priorityFirm: true };

const show = (i: ChildcareReductionInput) => {
  const r = calcChildcareReduction(i);
  const v = childcareReductionView(r);
  return { r, v, t: domText(v, allCopy(r)) };
};

describe('금액 — 엔진 출력과 같다', () => {
  it('근로자 월액·기간 합계·지급액, 사업주 장려금·업무분담 지원금', () => {
    const { r, v } = show(FULL);
    const w = r.worker!;
    const values = v.amounts.map((a) => a.value);
    expect(values).toContain(won(w.monthly));
    expect(values).toContain(won(w.schedule!.total!));
    expect(values).toContain(won(w.payable.monthly!));
    const s = r.employer.subsidy;
    expect(values).toContain(won(s.monthly!));
    expect(values).toContain(won(s.total!));
    const notes = v.amounts.flatMap((a) => a.note ?? []).join(' ');
    expect(notes).toContain(won(s.firstHalf!));
    expect(notes).toContain(won(s.rest!));
    expect(values).toContain(won(r.employer.workSharing!.monthly!));
    expect(values).toContain(won(r.employer.workSharing!.total!));
  });
  it('첫 판정 줄은 근로자 월액', () => {
    const { r, v } = show(FULL);
    expect(v.verdict[0]).toContain(won(r.worker!.monthly));
  });
  it('계산 과정 표 = 엔진 기간표(기간·일수·금액)', () => {
    const r = calcChildcareReduction(BASE);
    const rows = scheduleRows(r);
    expect(rows.length).toBe(r.worker!.schedule!.periods.length);
    r.worker!.schedule!.periods.forEach((p, i) => {
      expect(rows[i].amount).toBe(p.amount === null ? '—' : won(p.amount));
      expect(rows[i].days).toBe(`${p.days}일`);
    });
  });
  it('회사 지급액을 넣지 않으면 지급액 칸이 없고, 종료일이 없으면 합계 칸이 없다', () => {
    const { v } = show({ ...BASE, endDate: undefined });
    expect(v.amounts.map((a) => a.label).join(' ')).not.toMatch(/합계|지급액/);
  });
  it('상태는 확인용 추정, 확인일은 엔진 RULES_CHECKED_ON', () => {
    const { v } = show(FULL);
    expect(v.status).toBe('확인용 추정 · 확정 금액이 아닙니다');
    expect(v.asOf).toEqual([`확인 ${RULES_CHECKED_ON.replace(/-/g, '.')}.`]);
  });
});

describe('빠진 사실 — 금액을 내지 않고 묻는다', () => {
  it('월 통상임금이 없으면 근로자 금액 없음, 「더 알려 주면 계산하는 것」에 엔진 질문', () => {
    const { r, v, t } = show(NO_WAGE);
    expect(r.status).toBe('needs-input');
    expect(v.amounts.some((a) => a.label.includes('단축급여'))).toBe(false);
    const needs = mergedNeeds(r);
    expect(needs.map((n) => n.key)).toContain('monthlyOrdinaryWage');
    expect(t).toContain('더 알려 주면 계산하는 것');
    expect(t).toContain(needs[0].question);
  });
  it('근로자 금액이 없어도 사업주 장려금 월액은 엔진이 낸 대로 보인다', () => {
    const { r, v } = show(NO_WAGE);
    expect(r.employer.subsidy.monthly).not.toBeNull();
    expect(v.amounts.map((a) => a.value)).toContain(won(r.employer.subsidy.monthly!));
  });
  it('우선지원대상기업을 모르면 사업주 금액 없음, 그 질문이 needs 에', () => {
    const { r, v } = show(BASE);
    expect(r.employer.subsidy.monthly).toBeNull();
    expect(v.amounts.some((a) => a.label.includes('장려금'))).toBe(false);
    expect(mergedNeeds(r).map((n) => n.key)).toContain('priorityFirm');
  });
});

describe('요건 — 충족·미충족·확인 필요를 그대로', () => {
  it('넣지 않은 사실은 확인 필요', () => {
    const r = calcChildcareReduction(BASE);
    const worker = checkGroups(r)[0];
    expect(worker.rows.find((c) => c.key === 'insured180')!.statusLabel).toBe('확인 필요');
    expect(worker.rows.find((c) => c.key === 'childAge')!.statusLabel).toBe('확인 필요');
  });
  it('180일이 안 된다고 넣으면 미충족, 판정 문장이 바뀐다', () => {
    const { r, v } = show({ ...FULL, insuredDays180: false });
    expect(r.worker!.verdict).toBe('not-eligible');
    expect(checkGroups(r)[0].rows.find((c) => c.key === 'insured180')!.statusLabel).toBe('미충족');
    expect(v.verdict.join(' ')).toMatch(/미충족/);
  });
  it('신청 기간 줄은 엔진 날짜를 쓰고, 근로자 본인이 신청한다고 적는다', () => {
    const r = calcChildcareReduction(FULL);
    const lines = applyLines(r).join(' ');
    expect(lines).toContain('2027.03.01.');
    expect(lines).toContain('2028.07.31.');
    expect(lines).toMatch(/근로자 본인이 신청/);
  });
});

describe('입력 바꾸기 — 비우면 undefined(모름), 0 으로 채우지 않는다', () => {
  it('빈 폼은 숫자·예/아니오가 전부 undefined', () => {
    const i = toEngineInput(EMPTY_FORM);
    for (const k of ['monthlyOrdinaryWage', 'weeklyHoursBefore', 'weeklyHoursAfter', 'startDate', 'endDate', 'insuredDays180', 'childEligible', 'priorityFirm', 'firstTimeGrant', 'employerPaidMonthly', 'workSharing'] as const) {
      expect(i[k], k).toBeUndefined();
    }
    expect(calcChildcareReduction(i).status).toBe('needs-input');
  });
  it('쉼표를 지우고 숫자로, 예/아니오는 true/false, 회사 지급액 0 은 0', () => {
    const f: FormState = { ...EMPTY_FORM, wage: '3,000,000', before: '40', after: '24', start: '2027-02-01', insured180: 'no', priority: 'yes', paid: '0', sharingPaid: '200,000' };
    const i = toEngineInput(f);
    expect(i.monthlyOrdinaryWage).toBe(3_000_000);
    expect(i.insuredDays180).toBe(false);
    expect(i.priorityFirm).toBe(true);
    expect(i.childEligible).toBeUndefined();
    expect(i.employerPaidMonthly).toBe(0);
    expect(i.workSharing).toEqual({ paidMonthly: 200_000, startDate: undefined, endDate: undefined });
  });
});

describe('공통 — 링크·근거·금지어', () => {
  const all = [BASE, FULL, NO_WAGE, { ...FULL, insuredDays180: false }, { ...BASE, endDate: undefined }].map(show);
  it('다음 할 일은 1~2개, 실제 경로', () => {
    for (const { v } of all) {
      expect(v.next.length).toBeGreaterThanOrEqual(1);
      expect(v.next.length).toBeLessThanOrEqual(2);
      for (const n of v.next) expect(hrefExists(n.href), n.href).toBe(true);
    }
  });
  it('근거는 엔진 파일이 인용하는 조문만(법제처 주소), 같은 조문 두 번 없음', () => {
    const engine = readFileSync('src/lib/calc/childcare-reduction.ts', 'utf8');
    for (const { v } of all) {
      expect(new Set(v.basis.map((b) => b.href)).size).toBe(v.basis.length);
      for (const b of v.basis) {
        expect(b.href).toMatch(/^https:\/\/www\.law\.go\.kr\/법령\/[^/]+\/제\d+조(의\d+)?$/);
        const art = b.label.match(/제\d+조(의\d+)?/)![0];
        expect(engine, b.label).toContain(art);
      }
    }
  });
  it('금지어·느낌표·이모지 없음, 대신 신청한다는 말 없음', () => {
    for (const { t } of all) {
      expect(bannedHits(t)).toEqual([]);
      expect(t).not.toMatch(/!|\p{Extended_Pictographic}|해요|예요|에요/u);
      expect(t).not.toMatch(/대신 신청|신청해 드|접수해 드/);
    }
  });
});

describe('화면 — 공용 결과 블록', () => {
  it('ResultBlock 을 쓰고, 계산 과정은 접힌 상세, 블록 안 글자색 지정 없음', () => {
    const src = readFileSync(CLIENT, 'utf8');
    expect(src).toMatch(/<ResultBlock /);
    expect(src).toMatch(/childcareReductionView\(/);
    expect(src).toMatch(/<FoldedDetail summary="계산 과정">/);
    const inside = [...src.matchAll(/<ResultBlock[\s\S]*?<\/ResultBlock>/g)].map((m) => m[0]);
    for (const b of inside) expect(b).not.toMatch(/style=\{(?:muted|ink)\}|grey-|gray-|text-\[var\(--color-text/);
  });
  it('라디오 라벨은 choiceLabel(44px)', () => {
    const src = readFileSync(CLIENT, 'utf8');
    const labels = [...src.matchAll(/<label[^>]*>\s*<input type="radio"/g)].map((x) => x[0]);
    expect(labels.length).toBeGreaterThanOrEqual(1);
    for (const l of labels) expect(l).toContain('choiceLabel');
  });
});
