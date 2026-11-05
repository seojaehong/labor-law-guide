import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { POST } from '@/app/api/intake-call/route';

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

describe('intake-call 은 env 가 없으면 닫힌다', () => {
  const saved = { ...process.env };
  beforeEach(() => { delete process.env.INTAKE_CALL_TOKEN; });
  afterEach(() => { process.env = { ...saved }; });

  it('INTAKE_CALL_TOKEN 이 없으면 토큰을 맞춰도 503', async () => {
    const req = new Request('https://yellowenvelope.kr/api/intake-call', { method: 'POST', headers: { 'x-intake-token': 'winhr_call_32719' } });
    const res = await POST(req as never);
    expect(res.status).toBe(503);
  });
});
