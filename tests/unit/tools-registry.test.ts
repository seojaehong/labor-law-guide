import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TOOLS } from '@/content/tools-registry';
import { fmtDate, todayKst } from '@/lib/tool-kit';

// 도구는 등록부 한 곳에 적는다. /tools 목록과 사이트맵이 여기서 읽는다.
// 새 도구 페이지를 만들고 등록부에 안 적으면 이 시험이 먼저 막는다.

function toolPages(dir = 'src/app/tools', prefix = '/tools'): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('[') || e.name.startsWith('_')) continue;
    const here = `${prefix}/${e.name}`;
    const full = path.join(dir, e.name);
    if (fs.existsSync(path.join(full, 'page.tsx'))) out.push(here);
    out.push(...toolPages(full, here));
  }
  return out;
}

describe('도구 등록부', () => {
  const hrefs = TOOLS.map((t) => t.href);

  it('src/app/tools 아래 페이지는 전부 등록부에 있다', () => {
    const pages = toolPages();
    expect(pages).toContain('/tools/headcount');
    expect(pages.filter((p) => !hrefs.includes(p))).toEqual([]);
  });

  it('등록부의 주소는 실제로 있다 — 죽은 줄을 남기지 않는다', () => {
    for (const h of hrefs) {
      const exists = h.endsWith('.html')
        ? fs.existsSync(path.join('public', h))
        : fs.existsSync(path.join('src/app', h, 'page.tsx'));
      expect(exists, h).toBe(true);
    }
  });

  it('주소가 겹치지 않는다', () => {
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe('도구 공용 날짜', () => {
  it('todayKst 는 YYYY-MM-DD', () => {
    expect(todayKst()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('fmtDate 는 같은 해면 연도를 뺀다', () => {
    expect(fmtDate('2026-11-17', '2026-10-28')).toBe('11월 17일(화)');
    expect(fmtDate('2027-01-02', '2026-10-28')).toBe('2027년 1월 2일(토)');
  });
});
