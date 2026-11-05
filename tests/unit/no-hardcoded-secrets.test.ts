import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

// 공개 레포다. Supabase JWT(서비스 키 포함)가 소스에 박히면 히스토리에 영구히 남는다(261105 intake-call 실측).
describe('소스에 비밀값이 없다', () => {
  it('src·scripts·tools·public 에 JWT 모양 문자열이 없다', () => {
    let hits = '';
    try {
      hits = execFileSync('git', ['grep', '-nE', 'eyJ[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{20,}\\.', '--', 'src', 'scripts', 'tools', 'public'], { encoding: 'utf8' });
    } catch {
      hits = ''; // git grep 은 0건이면 exit 1
    }
    expect(hits.split('\n').filter(Boolean).map((l) => l.split(':').slice(0, 2).join(':'))).toEqual([]);
  });
});

// 처리방침에 없는 수집 경로였다. 자료는 OneDrive 로 옮기고 지웠다(261105 재홍님).
describe('지운 수집 API 가 돌아오지 않는다', () => {
  it.each(['src/app/api/intake-call', 'src/app/api/payment-intent', 'src/components/BetaSignupForm.tsx', 'src/components/BetaBanner.tsx'])('%s 없음', (p) => {
    expect(fs.existsSync(p)).toBe(false);
  });
});
