// 상시 근로자 수 답 카드(261124) — 공용 ResultBlock 으로 옮긴 뒤에도 화면 글자가 같은지 고정한다.
// 기대 글자는 옮기기 전 화면(headline·whyLines·leaveLines·noteLine)에서 실측한 것이다(오늘 = 2026-11-24 고정, 첫 화면 기본 계획).
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { CHECKED } from '@/content/duties-data';
import { TOOLS } from '@/content/tools-registry';
import { answerPlan, defaultPlan, editPlan } from '@/lib/headcount-plan';
import { bannedHits } from '@/lib/tool-kit/banned';
import { STATUS_COMPARE, type ResultView } from '@/components/tool-result/result-view';
import { leaveLines, noteLine } from '@/app/tools/headcount/copy';
import { headcountView } from '@/app/tools/headcount/result';

const TODAY = '2026-11-24';
const CLIENT = 'src/app/tools/headcount/HeadcountClient.tsx';

const plan = defaultPlan(TODAY);
const answer = answerPlan(plan, TODAY);
// 기간을 정해 더 쓰는 사람(c2)을 빼면 4명뿐 — 5인 이상이 되는 날이 없다
const nonePlan = editPlan(plan, { type: 'remove', id: 'c2' });
const noneAnswer = answerPlan(nonePlan, TODAY);

const allText = (v: ResultView) => [
  v.status, ...v.verdict, ...(v.meta ?? []), ...v.amounts.flatMap((a) => [a.label, a.value, ...(a.note ?? [])]),
  v.formula ?? '', ...(v.warnings ?? []), ...v.basis.map((b) => b.label), ...v.asOf, v.caveat ?? '', v.nextNote ?? '', ...v.next.map((n) => n.label),
].join('\n');

function hrefExists(href: string): boolean {
  if (href.startsWith('#')) return true;
  if (TOOLS.some((t) => t.href === href)) return true;
  if (href.endsWith('.html')) return existsSync(`public${href}`);
  return existsSync(`src/app${href}/page.tsx`);
}

describe('상시 근로자 수 답 카드 — 글자 고정(옮기기 전 화면 실측)', () => {
  const v = headcountView({ answer, today: TODAY });
  it('기간 답 문장', () => {
    expect(answer.five.kind).toBe('spans');
    expect(v.status).toBe(STATUS_COMPARE);
    expect(v.verdict).toEqual(['12월 17일(목)부터 2027년 1월 16일(토)까지 5인 이상 사업장으로 봅니다.']);
  });
  it('왜 그날부터·그날까지인지(평균 4.55명 · 5명 미만 10일/11일)', () => {
    expect(v.meta).toEqual([
      '사람을 더 쓴 날 바로 바뀌지 않습니다. 법은 그날 전 1개월을 거슬러 셉니다.',
      '12월 17일(목)에 거슬러 센 1개월(11.17~12.16)은 가동일 22일 가운데 5명 미만인 날이 10일로 절반이 안 됩니다. 평균은 4.55명이지만 이 규칙에 따라 5인 이상으로 봅니다(시행령 제7조의2 제2항 제1호).',
      '2027년 1월 17일(일)에 거슬러 센 1개월(12.17~1.16)은 가동일 22일 가운데 5명 미만인 날이 11일로 절반 이상이 되어 빠집니다.',
    ]);
    expect(v.amounts).toEqual([]);
  });
  it('연차휴가·입력 안내 줄은 copy 그대로(화면 children)', () => {
    expect(leaveLines(answer, TODAY)).toEqual([
      '1년 이상 근속자 연차(15일 등, 제60조 제1항)는 생기지 않습니다. 지난 1년 동안 매달 5명 이상이어야 하는데 이 계획으로는 12개월 가운데 1개월입니다.',
      '입사 1년 미만 직원의 한 달 개근 1일(제60조 제2항)은 1년 요건 대상이 아니라서 위 5인 이상 기간에 생기면 줍니다.',
    ]);
    expect(answer.notes.map((n) => noteLine(n, plan, TODAY))).toEqual([
      '날짜를 넣지 않은 4명은 1년 넘게 일해 온 것으로 보고 셉니다. 입사 1년이 안 됐으면 「자세히」에서 입사일을 넣습니다.',
      '공휴일도 문을 연 날로 셉니다. 쉰 날이 있으면 「쉬는 날·사업 시작일」에 넣습니다.',
    ]);
  });
  it('기준일 = duties-data CHECKED(적용되는 의무 목록이 보일 때만)', () => {
    expect(v.asOf).toEqual([`적용되는 의무 목록은 법제처 현행 법령 원문 기준 · 확인 ${CHECKED}`]);
  });
});

describe('5인 이상이 되는 날이 없을 때 — 다음 할 일', () => {
  const v = headcountView({ answer: noneAnswer, today: TODAY });
  it('없음 문장 + nextNote + next, 의무 목록 기준일은 비운다', () => {
    expect(noneAnswer.five.kind).toBe('none');
    expect(v.verdict).toEqual(['이 계획으로는 5인 이상 사업장이 되는 날이 없습니다.']);
    expect(v.meta?.[0]).toMatch(/^가장 가까운 날은 .+입니다\. 그 전 1개월 가동일 \d+일 가운데 5명 미만인 날이 \d+일이었습니다\./);
    expect(v.nextNote).toBeTruthy();
    expect(v.next.length).toBeGreaterThanOrEqual(1);
    expect(v.asOf).toEqual([]);
  });
});

describe('공통 — 링크·금지어·문체', () => {
  const views = [headcountView({ answer, today: TODAY }), headcountView({ answer: noneAnswer, today: TODAY })];
  it('다음 할 일은 1~2개이고 실제로 있는 경로다', () => {
    for (const v of views) {
      expect(v.next.length).toBeGreaterThanOrEqual(1);
      expect(v.next.length).toBeLessThanOrEqual(2);
      for (const n of v.next) expect(hrefExists(n.href), n.href).toBe(true);
    }
  });
  it('근거는 법제처 조문 주소다(제7조의2 포함)', () => {
    for (const v of views) for (const b of v.basis) expect(b.href).toMatch(/^https:\/\/www\.law\.go\.kr\/법령\/[^/]+\/제\d+조(의\d+)?$/);
    expect(views[0].basis.map((b) => b.href)).toContain('https://www.law.go.kr/법령/근로기준법시행령/제7조의2');
  });
  it('금지어·느낌표·이모지·해요체가 없다', () => {
    for (const v of views) {
      const t = allText(v);
      expect(bannedHits(t)).toEqual([]);
      expect(t).not.toMatch(/!|\p{Extended_Pictographic}/u);
      expect(t).not.toMatch(/해요|예요|에요/);
    }
  });
});

describe('화면 — 공용 블록·44px 선택지', () => {
  const src = readFileSync(CLIENT, 'utf8');
  it('ResultBlock 을 쓰고 AnswerCard 를 쓰지 않는다, 소제목·의무 목록은 children 으로 남는다', () => {
    expect(src).toMatch(/<ResultBlock /);
    expect(src).not.toMatch(/AnswerCard/);
    expect(src).toContain('>연차휴가</h3>');
    expect(src).toContain('5인 이상으로 보는 기간에 생긴 일에는 다음이 적용됩니다');
    // /duties 는 다음 할 일(next)로 옮겼다 — 같은 링크를 두 번 두지 않는다
    expect(src).not.toContain('href="/duties"');
  });
  it('결과 블록(잉크 반전 바탕) 안 children 은 muted·ink·화면 테두리색을 쓰지 않는다', () => {
    const s = src.indexOf('<ResultBlock ');
    const block = src.slice(s, src.indexOf('</ResultBlock>', s));
    expect(block).not.toMatch(/style=\{(muted|ink)\}|--color-border/);
    expect(block).toMatch(/style=\{rbSub\}/);
  });
  it('체크 라벨(문 여는 날 모두 일함)이 choiceLabel', () => {
    const labels = [...src.matchAll(/<label[^>]*>\s*<input type="(?:radio|checkbox)"/g)].map((m) => m[0]);
    expect(labels.length).toBe(1);
    for (const l of labels) expect(l).toContain('choiceLabel');
  });
});
