// 261125 — 공개 A2A 수신구. 옐로인벨롭이 공개면이라 **닫히는 쪽으로 실패해야** 한다.
// 카드는 2026-04 부터 7개월간 「에이전트 있다」고 알리면서 뒤가 비어 있었다(POST → 405).
// 이 시험은 그 역전(뒤는 있는데 아무나 들어옴)을 막는다.
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { maskOut, shape } from '@/lib/a2a/shape';

const src = readFileSync('src/app/api/a2a/route.ts', 'utf8');
const card = JSON.parse(readFileSync('public/.well-known/agent-card.json', 'utf8'));

it('토큰이 비어 있으면 열지 않고 닫는다 — 빈 문자열 비교로 통과시키면 무인증 공개가 된다', () => {
  expect(src).toMatch(/if \(!TOKEN\) return rpcErr\(null, -32060, 'endpoint disabled', 503\)/);
  // 토큰 검사가 레이트리밋 **호출**보다 앞에 있어야 한다.
  // (import 줄의 incrRateLimit 을 세면 늘 앞이라 시험이 벽지가 된다 — 호출 지점으로 본다)
  expect(src.indexOf("!== `Bearer ${TOKEN}`")).toBeLessThan(src.indexOf('await incrRateLimit('));
});

it('레이트리밋 카운터가 죽으면 닫는 쪽으로 실패한다 (챗 경로의 fail-open 을 베끼지 않는다)', () => {
  expect(src).toContain('rl.failed || !rl.allowed');
});

it('조회 전용 — 쓰기·발송 경로가 파일에 없다', () => {
  expect(src).not.toMatch(/\.(insert|update|upsert|delete)\(/);
  expect(src).not.toMatch(/supabaseAdmin/);
  expect(src).not.toMatch(/service_role|SUPABASE_SERVICE/);
});

it('AI 를 부르지 않는다 — 비용·지연이 공개면에 붙으면 안 된다', () => {
  expect(src).not.toMatch(/vertex|getGenerativeModel|embedQuery|anthropic|openai/i);
});

it('message/send 만 받는다', () => {
  expect(src).toMatch(/method !== 'message\/send' && method !== 'SendMessage'/);
});

it('주민번호·전화·계좌 모양을 가린다', () => {
  expect(maskOut('880101-1234567')).toBe('******-*******');
  expect(maskOut('010-1234-5678')).toBe('010-****-****');
  expect(maskOut('110-123-456789')).toBe('***-****-****');
  expect(maskOut('근로기준법 제54조')).toBe('근로기준법 제54조');  // 멀쩡한 글은 건드리지 않는다
});

it('표마다 다른 열 이름을 한 모양으로 맞춘다', () => {
  expect(shape({ id: 'x', title: '제목', doc_number: '근로기준과-1', decision_date: '2020-01-01', summary: '질의', holding_points: '회시' }))
    .toMatchObject({ caseNumber: '근로기준과-1', summary: '질의', holding: '회시' });
  // molab 쪽 열 이름
  expect(shape({ id: 'ml_1', title: 't', case_number: '임금 68207-1', inquiry_summary: 'q', answer_summary: 'a' }))
    .toMatchObject({ caseNumber: '임금 68207-1', summary: 'q', holding: 'a' });
});

it('가림은 shape 를 통과한 값에도 걸린다', () => {
  expect(shape({ id: 'x', title: '제목', summary: '신고인 880101-1234567 외' }).summary)
    .toBe('신고인 ******-******* 외');
});

it('카드가 실제 엔드포인트를 가리키고 규약 필수 항목이 차 있다', () => {
  expect(card.url).toBe('https://yellowenvelope.kr/api/a2a');
  for (const k of ['protocolVersion', 'defaultInputModes', 'defaultOutputModes', 'securitySchemes']) {
    expect(card[k], `카드에 ${k} 가 없다`).toBeTruthy();
  }
  for (const s of card.skills) expect(s.tags?.length, `skill ${s.id} 에 tags 가 없다`).toBeGreaterThan(0);
  // 구현하지 않은 것을 광고하지 않는다 — 7개월간 streaming:true 로 거짓 광고였다
  expect(card.capabilities.streaming).toBe(false);
});

it('확률·점수·적중률을 내보내지 않는다 — 값이 안 나가는지를 본다', () => {
  // 🔴 낱말 금지로 짰다가 두 번 틀렸다. 처음엔 「확률을 내지 않는다」 주석이 걸렸고,
  //    다음엔 응답에 담는 안내 문구(「판단·확률·점수는 내지 않는다」)가 걸렸다.
  //    금지 대상은 **확률 값**이지 그 말이 아니다. 그래서 구조로만 본다.
  const out = shape({ id: 'x', title: 't', relevance: 0.93, score: 7, similarity: 0.5 });
  for (const k of ['relevance', 'score', 'similarity', 'probability']) {
    expect(Object.keys(out), `내보내는 항목에 ${k} 가 들어 있다`).not.toContain(k);
  }
  // 값이 숫자로 새어 나가지 않는다 — 내보내는 칸은 전부 문자열이거나 null 이다
  for (const v of Object.values(out)) expect(typeof v === 'string' || v === null).toBe(true);
});
