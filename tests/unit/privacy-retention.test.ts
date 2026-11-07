import { describe, expect, it, afterEach } from 'vitest';
import fs from 'node:fs';
import { RETENTION } from '@/lib/privacy-retention';
import { retentionPlan } from '@/lib/retention';
import { GET } from '@/app/api/cron/retention/route';

const NOW = new Date('2026-11-05T00:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

describe('처리방침 보유기간 = 삭제 작업', () => {
  const plan = retentionPlan(NOW);

  it('표에 테이블이 적힌 항목은 전부 삭제 계획에 같은 일수로 있다', () => {
    for (const r of RETENTION) {
      if (!r.table) continue;
      for (const table of r.table.split('·')) {
        const steps = plan.filter((p) => p.table === table);
        expect(steps.length, table).toBeGreaterThan(0);
        for (const s of steps) expect(s.before, table).toBe(daysAgo(r.days));
      }
    }
  });

  it('계획에만 있고 방침에 없는 테이블이 없다', () => {
    const listed = RETENTION.flatMap((r) => (r.table ? r.table.split('·') : []));
    for (const p of plan) expect(listed, p.table).toContain(p.table);
  });

  it('구독은 해지자와 인증 안 한 신청만 지운다(구독 중인 사람은 남는다)', () => {
    const subs = plan.filter((p) => p.table === 'subscribers');
    expect(subs.map((s) => [s.column, s.status])).toEqual([['unsubscribed_at', 'unsubscribed'], ['created_at', 'pending']]);
  });

  it('vercel.json 에 매일 크론이 있다', () => {
    const v = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
    expect(v.crons).toContainEqual({ path: '/api/cron/retention', schedule: expect.stringMatching(/^\d+ \d+ \* \* \*$/) });
  });
});

describe('삭제 크론 인증', () => {
  const saved = process.env.CRON_SECRET;
  afterEach(() => { process.env.CRON_SECRET = saved; });

  it('CRON_SECRET 이 없으면 503', async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(new Request('https://yellowenvelope.kr/api/cron/retention'));
    expect(res.status).toBe(503);
  });

  it('틀린 토큰이면 401', async () => {
    process.env.CRON_SECRET = 'right';
    const res = await GET(new Request('https://yellowenvelope.kr/api/cron/retention', { headers: { authorization: 'Bearer wrong' } }));
    expect(res.status).toBe(401);
  });
});
