'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { fmtDate, weekday, type LawEvent } from '@/lib/laws/format';

// 개정 달력 — 시행일(채운 점)과 공포일(빈 점)을 월 단위로. 날짜를 누르면 그날의 개정만 아래 목록에 남긴다.
export default function CalendarView({
  events, today, selected, onSelect,
}: {
  events: LawEvent[];
  today: string;
  selected: string | null;
  onSelect: (d: string | null) => void;
}) {
  const [cursor, setCursor] = useState(() => (selected ?? today).slice(0, 6));
  const y = +cursor.slice(0, 4);
  const m = +cursor.slice(4, 6);

  const byDay = useMemo(() => {
    const map = new Map<string, { eff: LawEvent[]; pro: LawEvent[] }>();
    const slot = (d: string) => map.get(d) ?? (map.set(d, { eff: [], pro: [] }), map.get(d)!);
    for (const e of events) {
      slot(e.date).eff.push(e);
      for (const p of e.promulgations) if (p.date !== e.date) slot(p.date).pro.push(e);
    }
    return map;
  }, [events]);

  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = first.getUTCDay();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) => `${cursor}${String(i + 1).padStart(2, '0')}`),
  ];
  while (cells.length % 7) cells.push(null);

  const move = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setCursor(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  };
  const monthCount = [...byDay.entries()].filter(([d]) => d.startsWith(cursor)).reduce((a, [, v]) => a + v.eff.length, 0);

  return (
    <section className="lr-cal" aria-label="개정 달력">
      <div className="lr-cal-head">
        <button className="lr-icon-btn" onClick={() => move(-1)} aria-label="이전 달"><ChevronLeft size={18} /></button>
        <h2>{y}년 {m}월</h2>
        <button className="lr-icon-btn" onClick={() => move(1)} aria-label="다음 달"><ChevronRight size={18} /></button>
        <span className="lr-eyebrow">시행 {monthCount}건</span>
        <span className="sp" />
        <button className="lr-btn lr-btn-ghost lr-btn-sm" onClick={() => { setCursor(today.slice(0, 6)); onSelect(null); }}>오늘</button>
        <span className="lr-cal-legend"><i className="eff" /> 시행 <i className="pro" /> 공포</span>
      </div>
      <div className="lr-cal-grid" role="grid">
        {['일', '월', '화', '수', '목', '금', '토'].map((w) => <div key={w} className="lr-cal-w" role="columnheader">{w}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={`x${i}`} className="lr-cal-cell empty" />;
          const v = byDay.get(d);
          const eff = v?.eff ?? [];
          const pro = v?.pro ?? [];
          const has = eff.length + pro.length > 0;
          const label = `${fmtDate(d)}(${weekday(d)}) 시행 ${eff.length}건${pro.length ? `, 공포 ${pro.length}건` : ''}`;
          return (
            <button
              key={d}
              className={`lr-cal-cell${d === today ? ' today' : ''}${d === selected ? ' sel' : ''}${has ? ' has' : ''}${d < today ? ' past' : ''}`}
              onClick={() => has && onSelect(d === selected ? null : d)}
              disabled={!has}
              aria-pressed={d === selected}
              aria-label={label}
              title={has ? [...eff.map((e) => `시행 · ${e.short}`), ...pro.map((e) => `공포 · ${e.short}`)].join('\n') : undefined}
            >
              <span className="n">{+d.slice(6)}</span>
              {eff.slice(0, 3).map((e) => (
                <span key={e.id} className={`lr-cal-ev eff${e.rules.length ? ' rule' : ''}`}>{e.short}</span>
              ))}
              {eff.length > 3 && <span className="lr-cal-more">+{eff.length - 3}</span>}
              {pro.length > 0 && <span className="lr-cal-ev pro">공포 {pro.length}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
