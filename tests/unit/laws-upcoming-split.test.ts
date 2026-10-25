import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { periodCheck, STD_ASOF } from '@/lib/laws/standard-check';

const std = JSON.parse(fs.readFileSync('public/data/laws/standard.json', 'utf8'));
const idx = JSON.parse(fs.readFileSync('public/data/laws/index.json', 'utf8'));
const rules = JSON.parse(fs.readFileSync('public/data/laws/rules.json', 'utf8')).rules;
const text = (std.articles as { text: string }[]).map(a => a.text).join('\n\n');
const run = (today: string) =>
  periodCheck({ text, std: std.articles, events: idx.events, rules, art93: std.art93, from: idx.since, to: '20271231', today });

describe('시행 예정은 「고칠 것」과 같은 칸에 두지 않는다', () => {
  // 2026-10-21 실측: 표준취업규칙 2026 자체를 넣으면 「고칠 것」 7건이 전부 기준일 이후 시행분이고
  // 그중에는 2027-06-10 시행 예정도 있었다. 지금 고칠 일이 아닌 것을 같은 칸에 두면 전부 오탐으로 읽힌다.
  it('오늘이 2026-10-21 이면 아직 안 온 개정은 「시행 예정」이다', () => {
    const r = run('20261021');
    const soon = r.items.filter(i => i.status === '시행 예정');
    expect(soon.length).toBeGreaterThan(0);
    for (const i of soon) {
      const req = i.verdicts.filter(v => v.status !== '반영됨' && v.rule.required);
      expect(req.length).toBeGreaterThan(0);
      for (const v of req) expect(v.rule.effective > '20261021').toBe(true);
    }
  });

  it('「고칠 것」에는 이미 시행된 것만 남는다', () => {
    for (const i of run('20261021').items.filter(i => i.status === '고칠 것' || i.status === '조문 추가')) {
      const req = i.verdicts.filter(v => v.status !== '반영됨' && v.rule.required);
      expect(req.some(v => v.rule.effective <= '20261021'), `${i.std.no} 에 이미 시행된 필수 개정이 있어야 한다`).toBe(true);
    }
  });

  it('시간이 지나면 같은 항목이 「고칠 것」으로 옮겨 간다', () => {
    const before = run('20261021').items.filter(i => i.status === '시행 예정').map(i => i.std.no);
    const after = run('20280101').items.filter(i => i.status === '시행 예정').map(i => i.std.no);
    expect(before.length).toBeGreaterThan(0);
    expect(after.length).toBe(0);                    // 2028 에는 전부 시행됨
    expect(STD_ASOF).toBe('20260201');
  });
});
