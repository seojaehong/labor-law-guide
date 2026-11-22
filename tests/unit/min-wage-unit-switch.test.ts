import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// L-07(261122): 월급 2,156,880원을 넣은 채 「시급」으로 바꾸면 같은 숫자가 시급으로 남아 「충족」으로 보였다.
// 단위마다 금액을 따로 둔다 — 단위를 바꾸면 그 단위에서 마지막으로 넣은 값(처음이면 빈칸)이 보인다.
const src = readFileSync('src/app/tools/min-wage/MinWageClient.tsx', 'utf8');

describe('최저임금 계산기 단위 전환', () => {
  it('금액을 단위별로 따로 보관한다', () => {
    expect(src).toMatch(/useState<Record<Unit, string>>/);
    expect(src).toMatch(/amounts\[unit\]/);
  });
  it('단위 사이에 공유되는 금액 상태가 없다', () => {
    expect(src).not.toMatch(/const \[amount, setAmount\] = useState\(/);
  });
});
