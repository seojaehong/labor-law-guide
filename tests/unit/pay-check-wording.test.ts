// /tools/pay-check 고정 문구 검사: 결론형 표현(엔진 card.ts FORBIDDEN)과 사이트 금지어, 확률 숫자, 필수 고지.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FORBIDDEN, forbiddenHits } from '@/lib/pay-check/card';

const read = (p: string) => readFileSync(p, 'utf8');
const SITE_BANNED = ['노무사', '상담', '진단', '판정', '자문', '체불', '위법', '받을 수 있는 금액', '승소'];

const pageFiles = ['page.tsx', 'PayCheckClient.tsx', 'build-input.ts'].map((f) => `src/app/tools/pay-check/${f}`);
const toolsEntry = read('src/content/tools-registry.ts').split('\n').find((l) => l.includes("'/tools/pay-check'")) ?? '';

describe('월급 대조 페이지 문구', () => {
  it('도구 목록에 들어 있다', () => {
    expect(toolsEntry).toContain("title: '월급 대조'");
  });

  for (const p of [...pageFiles, '도구 등록부의 월급 대조 항목']) {
    it(`${p}: 결론형·금지 표현이 없다`, () => {
      const text = p.startsWith('src/') ? read(p) : toolsEntry;
      expect(forbiddenHits(text)).toEqual([]);
      expect(SITE_BANNED.filter((w) => text.includes(w))).toEqual([]);
      expect(text).not.toMatch(/\d+(\.\d+)?\s?%/);
    });
  }

  it('엔진 금지어 목록이 비어 있지 않다', () => {
    expect(FORBIDDEN.length).toBeGreaterThan(0);
  });

  it('법률 판단이 아니라는 고지가 있다', () => {
    expect(read('src/app/tools/pay-check/PayCheckClient.tsx')).toContain('이 결과는 입력하고 확인한 값의 대조이며 법률 판단이 아닙니다.');
  });

  it('입력값을 주소창·저장소·서버로 보내지 않는다', () => {
    const src = read('src/app/tools/pay-check/PayCheckClient.tsx') + read('src/app/tools/pay-check/build-input.ts');
    expect(src).not.toMatch(/history\.(replace|push)State|searchParams|localStorage|sessionStorage|fetch\(|useRouter|useSearchParams/);
  });
});
