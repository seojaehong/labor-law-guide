// 일용근로소득 원천징수 계산기 — 공용 결과 블록(result.ts) 이전을 고정한다(261124).
// ① 화면 글자는 그대로다: 아래 문자열은 이전 직전(AnswerCard) 화면에서 headline()·JSX 줄을 실제로 뽑은 값이다.
// ② 세무사법 위험 표지(「예상」, 대행 아님 고지, 국세청·홈택스 링크)가 결과 블록 안에 글자 그대로 남는다.
// ③ 끝수 순서가 갈리면 두 값을 같은 무게(금액 칸 둘)로 낸다 — 한쪽만 크게 보이지 않는다.
// ④ 일용근로자가 아니면 멈춘다 — 금액 없음, 추정 상태 띠를 달지 않는다.
// ⑤ 기준일은 DAILY_WORKER_RULE 의 from·checked 에서만 나온다.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { TOOLS } from '@/content/tools-registry';
import { calcDailyWorkerTax, DAILY_WORKER_RULE } from '@/lib/calc/daily-worker-tax';
import { bannedHits } from '@/lib/tool-kit/banned';
import { STATUS_ESTIMATE, type ResultView } from '@/components/tool-result/result-view';
import { allCopy, CONSEQUENCES, ELIGIBILITY_STOP, HOMETAX, NOTICE, NTS } from '@/app/tools/daily-worker-tax/copy';
import { dailyWorkerStopView, dailyWorkerTaxView, STATUS_STOP } from '@/app/tools/daily-worker-tax/result';

const CLIENT = 'src/app/tools/daily-worker-tax/DailyWorkerTaxClient.tsx';

const days = (wage: number, n: number) => Array<number>(n).fill(wage);
const view = (...pays: [number, number][]) =>
  dailyWorkerTaxView(calcDailyWorkerTax({ payments: pays.map(([w, n]) => ({ days: days(w, n) })) }));

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

describe('숫자 고정 — 261124 이전 화면 실측과 같은 글자', () => {
  it('A 200,000 × 1일: 답 문장 · 1일분 합계 줄 · 금액 칸', () => {
    const v = view([200_000, 1]);
    expect(v.status).toBe(STATUS_ESTIMATE);
    expect(v.verdict).toEqual(['예상 원천징수 소득세는 1,350원, 지방소득세는 130원입니다.']);
    expect(v.meta).toEqual(['1일분 과세 일급 합계 200,000원 · 떼는 세금 합계 1,480원']);
    expect(v.amounts.map((a) => [a.label, a.value])).toEqual([['예상 원천징수 소득세', '1,350원'], ['예상 지방소득세', '130원']]);
    expect(v.nextNote).toBeUndefined();
  });
  it('B 서식 예시 200,000 × 7일 = 9,450 / 940', () => {
    const v = view([200_000, 7]);
    expect(v.verdict[0]).toBe('예상 원천징수 소득세는 9,450원, 지방소득세는 940원입니다.');
    expect(v.meta).toEqual(['7일분 과세 일급 합계 1,400,000원 · 떼는 세금 합계 10,390원']);
  });
  it('L 지급 2건 — 합계 문장과 지급 건마다 줄(verify-llg 가 이 순서로 읽는다)', () => {
    const v = view([180_000, 2], [180_000, 1]);
    expect(v.verdict).toEqual(['지급 2건의 예상 원천징수 소득세는 모두 1,620원, 지방소득세는 160원입니다.', '1,000원 미만인지는 지급 건마다 따로 봅니다(소득세법 제86조 제1호).']);
    expect(v.meta).toEqual(['지급 1 — 2일분 360,000원: 소득세 1,620원, 지방소득세 160원', '지급 2 — 1일분 180,000원: 세액 810원 → 1,000원 미만이라 0원']);
  });
});

describe('끝수 순서가 갈리면 두 값을 같은 무게로', () => {
  it('K 187,170 × 3일: 3,010 / 300 과 3,000 / 300 을 금액 칸 둘로', () => {
    const v = view([187_170, 3]);
    expect(v.verdict).toEqual([
      '예상 원천징수 소득세는 3,010원, 지방소득세는 300원입니다.',
      '날마다 1원 미만을 먼저 버리고 더하면 소득세 3,000원, 지방소득세 300원입니다. 어느 순서로 버리는지 정한 조문·서식을 확인하지 못해 두 값을 함께 보여 줍니다.',
    ]);
    expect(v.meta).toEqual(['3일분 과세 일급 합계 561,510원 · 떼는 세금 합계 3,310원']);
    expect(v.amounts.map((a) => a.value)).toEqual(['3,010원', '3,000원']);
    expect(v.amounts.map((a) => a.note)).toEqual([['지방소득세 300원'], ['지방소득세 300원']]);
    for (const a of v.amounts) expect(a.label).toContain('예상');
  });
  it('K2 162,350 × 3일: 1,000원 대 0원도 둘 다 금액 칸', () => {
    expect(view([162_350, 3]).amounts.map((a) => a.value)).toEqual(['1,000원', '0원']);
  });
});

describe('0원 — 까닭과 다음 할 일', () => {
  it('D 180,000 × 1일 = 소액부징수 0원', () => {
    const v = view([180_000, 1]);
    expect(v.verdict).toEqual(['예상 원천징수 소득세는 0원입니다.', '이번 지급분 세액 810원이 1,000원 미만이라 징수하지 않습니다(소득세법 제86조 제1호).']);
    expect(v.meta).toEqual(['1일분 과세 일급 합계 180,000원 · 떼는 세금 합계 0원']);
    expect(v.nextNote).toBe(CONSEQUENCES[3]); // 소액부징수 — 지급명세서 안내를 copy.ts 글자 그대로
    expect(v.next.length).toBeGreaterThanOrEqual(1);
    expect(v.next.length).toBeLessThanOrEqual(2);
  });
  it('G 150,000 × 3일 = 과세표준 0', () => {
    const v = view([150_000, 3]);
    expect(v.verdict[1]).toBe('일급이 모두 1일 근로소득공제 15만원 이하라 과세표준이 0원입니다(소득세법 제47조 제2항·제3항).');
    expect(v.meta).toEqual(['3일분 과세 일급 합계 450,000원 · 떼는 세금 합계 0원']);
    expect(v.nextNote).toBe('지급한 뒤 할 일(지급명세서 제출 기한 등)은 아래 「그래서 생기는 일」에 적었습니다.');
  });
});

describe('멈춤 — 일용근로자가 아니면 계산하지 않는다', () => {
  const v = dailyWorkerStopView();
  it('문장은 ELIGIBILITY_STOP 그대로, 금액 없음, 추정 띠 아님', () => {
    expect(v.verdict).toEqual(ELIGIBILITY_STOP);
    expect(v.amounts).toEqual([]);
    expect(v.status).toBe(STATUS_STOP);
    expect(v.status).not.toMatch(/추정/);
    expect(v.status).toMatch(/계산하지 않/);
  });
  it('다음 할 일 = 실수령액 계산기(종전 화면의 링크)', () => {
    expect(v.next).toEqual([{ label: '실수령액 계산기', href: '/tools/take-home-pay' }]);
    expect(v.nextNote).toBeTruthy();
  });
});

describe('기준일 — DAILY_WORKER_RULE 에서만', () => {
  it('2019년 1월 1일 이후 발생 소득 · 조문 확인 2026.10.29.', () => {
    expect(DAILY_WORKER_RULE.from).toBe('2019-01-01');
    expect(view([200_000, 1]).asOf).toEqual([`2019년 1월 1일 이후 발생 소득 기준 · 조문 확인 ${DAILY_WORKER_RULE.checked.replace(/-/g, '.')}.`]);
  });
  it('근거 조문 링크는 RULE.basis 에 적힌 조문이다', () => {
    for (const b of view([200_000, 1]).basis) {
      expect(b.href).toMatch(/^https:\/\/www\.law\.go\.kr\/법령\/[^/]+\/제\d+조(의\d+)?$/);
      const art = b.href.split('/').pop()!;
      if (b.href.includes('/소득세법/')) expect(DAILY_WORKER_RULE.basis).toContain(art);
    }
  });
});

describe('세무 위험 표지 — 결과 블록 안에 글자 그대로', () => {
  const src = readFileSync(CLIENT, 'utf8');
  it('고지 두 줄은 바뀌지 않았다', () => {
    expect(NOTICE).toEqual([
      '예상 금액입니다. 지급하는 곳이 실제로 뗀 금액과 대조합니다.',
      '세무대리·신고서 작성 대행이 아닙니다. 지급명세서나 신고서를 만들지 않습니다.',
    ]);
    expect(HOMETAX.href).toBe('https://www.hometax.go.kr');
    expect(NTS.href).toBe('https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7863');
  });
  it('계산 결과 ResultBlock 의 children 에 Notice(고지·국세청·홈택스 링크)가 있다', () => {
    expect(src).toMatch(/<ResultBlock view=\{dailyWorkerTaxView\([^)]*\)\}>\s*<Notice \/>\s*<\/ResultBlock>/);
    expect(src).toMatch(/NOTICE\.map/);
    expect(src).toMatch(/href=\{NTS\.href\}/);
    expect(src).toMatch(/href=\{HOMETAX\.href\}/);
    expect(src).not.toMatch(/<AnswerCard /);
  });
  it('결과 블록 안 고지는 회색(muted)·ink 로 덮지 않는다 — 블록이 먹 반전이라 안 보인다', () => {
    const notice = src.slice(src.indexOf('function Notice()'), src.indexOf('export default'));
    expect(notice).not.toMatch(/style=\{(muted|ink)\}/);
  });
  it('「확정」 단정·금지어·느낌표·해요체가 없다', () => {
    const views = [view([200_000, 1]), view([180_000, 1]), view([150_000, 3]), view([187_170, 3]), view([180_000, 2], [180_000, 1]), dailyWorkerStopView()];
    for (const v of views) {
      const t = allText(v);
      expect(bannedHits(t)).toEqual([]);
      expect(t.replace(/확정 금액이 아닙니다/g, '')).not.toMatch(/확정/);
      expect(t).not.toMatch(/[!！]|해요|예요|에요/);
      expect(t).not.toMatch(/연락|문의/);
      for (const n of v.next) expect(hrefExists(n.href), n.href).toBe(true);
      expect(v.next.length).toBeGreaterThanOrEqual(1);
      expect(v.next.length).toBeLessThanOrEqual(2);
    }
  });
});

describe('라디오 라벨은 44px 히트 영역(choiceLabel)', () => {
  it('일용근로자 여부 라디오 둘', () => {
    const src = readFileSync(CLIENT, 'utf8');
    const labels = [...src.matchAll(/<label[^>]*>\s*<input type="(?:radio|checkbox)"/g)].map((m) => m[0]);
    expect(labels.length).toBe(2);
    for (const l of labels) expect(l).toContain('choiceLabel');
  });
});

describe('폴더 화면 문구(allCopy) — 느낌표·이모지·해요체 없음', () => {
  it('대표 결과 다섯 가지의 화면 문장 전부', () => {
    for (const p of [[[200_000, 1]], [[180_000, 1]], [[150_000, 3]], [[187_170, 3]], [[180_000, 2], [180_000, 1]]] as [number, number][][]) {
      const t = allCopy(calcDailyWorkerTax({ payments: p.map(([w, n]) => ({ days: days(w, n) })) })).join('\n');
      expect(t).not.toMatch(/[!！]|해요|예요|에요|\p{Extended_Pictographic}/u);
    }
  });
});
