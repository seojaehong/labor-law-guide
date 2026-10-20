'use client';

import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { moveLawMonth } from '@/lib/laws/date-view';
import { fmtDate, weekday, type LawEvent } from '@/lib/laws/format';

// 시행일 기준 탐색. 월/일 상태는 상위 목록과 공유한다.
export default function CalendarView({
  events, today, selected, onSelect, month: cursor, onMonth,
}: {
  month: string;
  onMonth: (month: string) => void;
  events: LawEvent[];
  today: string;
  selected: string | null;
  onSelect: (d: string | null) => void;
}) {
  const y = +cursor.slice(0, 4);
  const m = +cursor.slice(4, 6);

  const byDay = useMemo(() => {
    const map = new Map<string, LawEvent[]>();
    const slot = (d: string) => map.get(d) ?? (map.set(d, []), map.get(d)!);
    for (const e of events) {
      slot(e.date).push(e);
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

  const move = (n: number) => onMonth(moveLawMonth(cursor, n));
  const monthCount = [...byDay.entries()].filter(([d]) => d.startsWith(cursor)).reduce((a, [, v]) => a + v.length, 0);

  return (
    <section className="lr-cal" aria-label="개정 달력">
      <div className="lr-cal-head">
        <button className="lr-icon-btn" onClick={() => move(-1)} aria-label="이전 달"><ChevronLeft size={18} /></button>
        <h2>{y}년 {m}월</h2>
        <button className="lr-icon-btn" onClick={() => move(1)} aria-label="다음 달"><ChevronRight size={18} /></button>
        <span className="lr-eyebrow">시행 {monthCount}건</span>
        <span className="sp" />
        <button className="lr-btn lr-btn-ghost lr-btn-sm" onClick={() => { onMonth(today.slice(0, 6)); onSelect(null); }}>이번 달</button>
        <span className="lr-cal-legend">시행일 기준 · 날짜를 누르면 아래 목록이 바뀝니다</span>
      </div>
      <div className="lr-cal-grid">
        {['일', '월', '화', '수', '목', '금', '토'].map((w) => <div key={w} className="lr-cal-w">{w}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={`x${i}`} className="lr-cal-cell empty" />;
          const eff = byDay.get(d) ?? [];
          const has = eff.length > 0;
          const label = `${fmtDate(d)}(${weekday(d)}) 시행 ${eff.length}건`;
          return (
            <button
              key={d}
              className={`lr-cal-cell${d === today ? ' today' : ''}${d === selected ? ' sel' : ''}${has ? ' has' : ''}${d < today ? ' past' : ''}`}
              onClick={() => has && onSelect(d === selected ? null : d)}
              disabled={!has}
              aria-pressed={d === selected}
              aria-label={label}
              title={has ? eff.map((e) => `시행 · ${e.short}`).join('\n') : undefined}
            >
              <span className="n">{+d.slice(6)}</span>
              {eff.length > 0 && <span className="lr-cal-count">{eff.length}건</span>}
              {eff.slice(0, 3).map((e) => (
                <span key={e.id} className={`lr-cal-ev eff${e.rules.length ? ' rule' : ''}`}>{e.short}</span>
              ))}
              {eff.length > 3 && <span className="lr-cal-more">+{eff.length - 3}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
