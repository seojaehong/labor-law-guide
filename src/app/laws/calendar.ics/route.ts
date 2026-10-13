import { readFileSync } from 'node:fs';
import path from 'node:path';
import { lawCalItems, icsCalendar, todayKST, type LawIndex } from '@/lib/laws/format';
import { SITE_URL } from '@/lib/constants';

// 구독형 캘린더 — 한 번 구독하면 수집이 갱신될 때마다 캘린더 앱이 12시간 주기로 다시 받아 간다.
//   ?law=001872,000130   상위 법률 단위(하위법령 포함)
//   ?rules=1             취업규칙에 걸리는 개정만
//   ?level=law           법률만(시행령·시행규칙 제외)
//   ?promulgation=1      공포일도 넣기
//   ?past=90             지난 시행분을 며칠 치 넣을지(기본 90)
export function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const index = JSON.parse(
    readFileSync(path.join(process.cwd(), 'public', 'data', 'laws', 'index.json'), 'utf-8'),
  ) as LawIndex;

  const groups = (sp.get('law') ?? '').split(',').filter(Boolean);
  const pastDays = Math.min(Math.max(Number(sp.get('past') ?? 90) || 0, 0), 400);
  const today = todayKST();
  const from = new Date(Date.UTC(+today.slice(0, 4), +today.slice(4, 6) - 1, +today.slice(6, 8)) - pastDays * 86400000)
    .toISOString().slice(0, 10).replace(/-/g, '');

  const events = index.events.filter((e) => {
    if (e.date < from) return false;
    if (groups.length && !groups.includes(e.group)) return false;
    if (sp.get('rules') === '1' && e.rules.length === 0) return false;
    if (sp.get('level') === 'law' && e.level !== '법률') return false;
    return true;
  });

  const label = [
    groups.length ? index.groups.filter((g) => groups.includes(g.lawId)).map((g) => g.short).join('·') : '노동법',
    sp.get('rules') === '1' ? '취업규칙 관련' : '',
  ].filter(Boolean).join(' ');

  const body = icsCalendar(
    lawCalItems(events, { promulgation: sp.get('promulgation') === '1', origin: SITE_URL }),
    `${label} 개정 일정`,
  );
  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="labor-law-changes.ics"',
      'Cache-Control': 'public, max-age=3600, s-maxage=21600',
    },
  });
}
