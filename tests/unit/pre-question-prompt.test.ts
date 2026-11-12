import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DailyWorkerTaxClient from '@/app/tools/daily-worker-tax/DailyWorkerTaxClient';
import MidyearSettlementClient from '@/app/tools/midyear-settlement/MidyearSettlementClient';

// 먼저 답해야 결과가 나오는 질문 — 「먼저 … 골라 주세요」가 입력칸 아래 결과 자리에만 있어 못 봤다(261112).
// 질문 바로 아래에도 알린다. 결과 자리의 문장(verify-llg 가 읽는다)은 그대로 둔다.
describe.each([
  ['daily-worker-tax', DailyWorkerTaxClient, 'name="eligible"', '먼저 일용근로자인지 골라 주세요.', '일급(원)'],
  ['midyear-settlement', MidyearSettlementClient, 'name="scope"', '먼저 위 경우에 해당하는 것이 있는지 골라 주세요.', '퇴사한 해'],
])('%s pre-question prompt', (_id, Client, radio, resultLine, firstInput) => {
  const html = renderToStaticMarkup(createElement(Client));
  const prompt = '이 질문에 먼저 답해야 계산 결과가 나옵니다.';

  it('sits right under the pre-question radios, above the inputs', () => {
    const at = html.indexOf(prompt);
    expect(at).toBeGreaterThan(html.lastIndexOf(radio));
    expect(at).toBeLessThan(html.indexOf(firstInput));
    expect(html.slice(html.lastIndexOf('<p', at), at)).toContain('role="status"');
  });

  it('keeps the result-slot line once', () => {
    expect(html.split(resultLine)).toHaveLength(2);
    expect(html.split(prompt)).toHaveLength(2);
  });
});
