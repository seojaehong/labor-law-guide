import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// /tools/holiday-pay 카카오 공유 — 2.7.4 에는 kakao.share.min.js 가 없다(261112 운영 실측 404, kakao.min.js 는 200).
// 카카오 공식 안내(developers.kakao.com JavaScript SDK 설치)의 경로와 integrity 값을 그대로 쓴다.
const src = readFileSync('src/components/HolidayPayCalculator.tsx', 'utf8');

describe('holiday-pay Kakao SDK loader', () => {
  it('loads the official kakao.min.js bundle with SRI', () => {
    expect(src).toContain("'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js'");
    expect(src).not.toContain('kakao.share.min.js');
    expect(src).toContain("'sha384-DKYJZ8NLiK8MN4/C5P2dtSmLQ4KwPaoqAfyA/DfmEc1VDxu4yyC7wy6K1Hs90nka'");
    expect(src).toMatch(/crossOrigin = 'anonymous'/);
  });

  it('keeps the share fallback when the SDK is missing', () => {
    expect(src).toMatch(/window\.Kakao && window\.Kakao\.Share && window\.Kakao\.isInitialized\(\)/);
  });
});
