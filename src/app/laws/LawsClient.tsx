'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  CalendarDays, CalendarPlus, Check, ChevronDown, ClipboardCopy, Columns2, ExternalLink, FileSpreadsheet, Link2, Rows3, Search, ScrollText, ShieldCheck, X,
} from 'lucide-react';
import RulesCheck from './RulesCheck';
import CalendarView from './CalendarView';
import SubscribeButton from './SubscribeButton';
import { diffArticle, type Row } from '@/lib/laws/diff';
import {
  citation, compareTable, copyRich, ddayLabel, download, fmtDate, fmtShort, lawGoUrl, todayKST, toICS, weekday,
  type LawDetail, type LawEvent, type LawIndex, type RuleDetail, type StepChange,
} from '@/lib/laws/format';

type View = 'upcoming' | 'recent' | 'all';
type Layout = 'split' | 'unified';

const detailCache = new Map<string, Promise<LawDetail>>();
function loadDetail(lawId: string): Promise<LawDetail> {
  if (!detailCache.has(lawId)) {
    detailCache.set(lawId, fetch(`/data/laws/${lawId}.json`).then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    }));
  }
  return detailCache.get(lawId)!;
}

function headlineOf(e: LawEvent): string {
  if (e.headline) return e.headline;
  if (e.cause) return `「${e.cause}」에 따라 함께 고쳐지는 조문`;
  const first = e.summary.split(/(?<=[다임음])\.\s|(?<=것임)\.?\s/)[0];
  return first.length > 90 ? `${first.slice(0, 88)}…` : first;
}

function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => setMsg(null), 2600);
  }, []);
  return { msg, show };
}

export default function LawsClient({ index }: { index: LawIndex }) {
  const [today, setToday] = useState(index.generated.replace(/-/g, ''));
  const [view, setView] = useState<View>('upcoming');
  const [q, setQ] = useState('');
  const [laws, setLaws] = useState<string[]>([]);
  const [rulesOnly, setRulesOnly] = useState(false);
  const [lawsOnly, setLawsOnly] = useState(false);
  const [month, setMonth] = useState<string | null>(null);
  const [mode, setMode] = useState<'list' | 'cal'>('list');
  const [day, setDay] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState<string | null>(null);
  const [layout, setLayout] = useState<Layout>('split');
  const searchRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [checking, setChecking] = useState(false);
  const closeCheck = useCallback(() => setChecking(false), []);

  // 오늘(KST)·URL 상태·화면 너비는 마운트 후에 읽는다(정적 HTML 과 어긋나지 않게)
  useEffect(() => {
    setToday(todayKST());
    const sp = new URLSearchParams(location.search);
    const v = sp.get('view');
    if (v === 'recent' || v === 'all') setView(v);
    if (sp.get('q')) setQ(sp.get('q')!);
    if (sp.get('law')) setLaws(sp.get('law')!.split(','));
    if (sp.get('rules') === '1') setRulesOnly(true);
    if (sp.get('level') === 'law') setLawsOnly(true);
    if (sp.get('m')) setMonth(sp.get('m'));
    if (sp.get('mode') === 'cal') setMode('cal');
    if (sp.get('d')) setDay(sp.get('d'));
    if (window.matchMedia('(max-width: 700px)').matches) setLayout('unified');
    try {
      const saved = localStorage.getItem('lr-layout');
      if (saved === 'split' || saved === 'unified') setLayout(saved);
    } catch { /* 저장소가 막혀도 기본값으로 돈다 */ }
    const hash = decodeURIComponent(location.hash.slice(1));
    if (hash) {
      const evId = hash.split('~')[0];
      const ev = index.events.find((e) => e.id === evId);
      if (ev) {
        if (ev.date <= todayKST()) setView('all');
        setOpen(new Set([evId]));
        setFocus(evId);
        setTimeout(() => document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400);
      }
    }
  }, [index.events]);

  useEffect(() => {
    const sp = new URLSearchParams();
    if (view !== 'upcoming') sp.set('view', view);
    if (q) sp.set('q', q);
    if (laws.length) sp.set('law', laws.join(','));
    if (rulesOnly) sp.set('rules', '1');
    if (lawsOnly) sp.set('level', 'law');
    if (month) sp.set('m', month);
    if (mode === 'cal') sp.set('mode', 'cal');
    if (day) sp.set('d', day);
    const s = sp.toString();
    history.replaceState(null, '', `${location.pathname}${s ? `?${s}` : ''}${location.hash}`);
  }, [view, q, laws, rulesOnly, lawsOnly, month, mode, day]);

  const setLayoutSaved = (l: Layout) => {
    setLayout(l);
    try { localStorage.setItem('lr-layout', l); } catch { /* 무시 */ }
  };

  const upcoming = useMemo(() => index.events.filter((e) => e.date > today), [index.events, today]);
  const recent = useMemo(() => index.events.filter((e) => e.date <= today).reverse(), [index.events, today]);
  const base = useMemo(
    () => (mode === 'cal' ? [...upcoming, ...recent] : view === 'upcoming' ? upcoming : view === 'recent' ? recent : [...upcoming, ...recent]),
    [mode, view, upcoming, recent],
  );

  const lawCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of base) m.set(e.group, (m.get(e.group) ?? 0) + 1);
    return m;
  }, [base]);

  const matched = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return base.filter((e) => {
      if (laws.length && !laws.includes(e.group)) return false;
      if (lawsOnly && e.level !== '법률') return false;
      if (rulesOnly && e.rules.length === 0) return false;
      if (month && !e.date.startsWith(month)) return false;
      if (!needle) return true;
      const hay = [e.law, e.short, e.headline ?? '', e.summary, e.cause ?? '',
        ...e.changes.map((c) => `${c.article} ${c.title}`), ...e.rules.map((r) => r.topic)].join(' ').toLowerCase();
      return needle.split(/\s+/).every((w) => hay.includes(w));
    });
  }, [base, laws, rulesOnly, lawsOnly, month, q]);
  const filtered = useMemo(
    () => (day
      ? matched.filter((e) => e.date === day || e.promulgations.some((p) => p.date === day))
      : mode === 'cal' ? matched.filter((e) => e.date > today) : matched),
    [matched, day, mode, today],
  );

  const months = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of upcoming) m.set(e.date.slice(0, 6), (m.get(e.date.slice(0, 6)) ?? 0) + 1);
    return [...m.entries()];
  }, [upcoming]);
  const maxMonth = Math.max(1, ...months.map(([, n]) => n));

  // 같은 날 여러 건이면 사업장에 직접 걸리는 것부터 — 취업규칙 반영 > 근로기준법 > 고유 개정 > 타법 정비
  const nextSameDay = useMemo(() => {
    const first = upcoming[0];
    if (!first) return [];
    const rank = (e: LawEvent) => -e.rules.length * 10 - (e.lawId === '001872' ? 5 : 0) - (e.headline ? 2 : 0) + (e.cause ? 3 : 0);
    return upcoming.filter((e) => e.date === first.date).sort((a, b) => rank(a) - rank(b));
  }, [upcoming]);
  const next = nextSameDay[0];

  const toggle = useCallback((id: string) => {
    setOpen((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
    setFocus(id);
  }, []);

  // 키보드 — / 검색 · j k 이동 · Enter 펼치기 · Esc 닫기
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const tag = (ev.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA';
      if (ev.key === '/' && !typing) { ev.preventDefault(); searchRef.current?.focus(); return; }
      if (ev.key === 'Escape') {
        if (typing) { (ev.target as HTMLElement).blur(); if (q) setQ(''); }
        else if (focus && open.has(focus)) toggle(focus);
        return;
      }
      if (typing || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (ev.key === 'j' || ev.key === 'k') {
        const ids = filtered.map((e) => e.id);
        if (!ids.length) return;
        const i = focus ? ids.indexOf(focus) : -1;
        const n = ev.key === 'j' ? Math.min(ids.length - 1, i + 1) : Math.max(0, i - 1);
        setFocus(ids[n]);
        document.getElementById(ids[n])?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if ((ev.key === 'Enter' || ev.key === 'o') && focus) {
        toggle(focus);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filtered, focus, open, q, toggle]);

  const resetFilters = () => { setQ(''); setLaws([]); setRulesOnly(false); setLawsOnly(false); setMonth(null); };
  const filtersOn = q || laws.length || rulesOnly || lawsOnly || month;

  const exportICS = (evs: LawEvent[], name: string) => {
    download(name, toICS(evs), 'text/calendar;charset=utf-8');
    toast.show(`시행일 ${evs.length}건을 캘린더 파일로 받았습니다. 열면 구글·아웃룩 캘린더에 들어갑니다`);
  };

  const exportXLSX = async (evs: LawEvent[]) => {
    toast.show('엑셀을 만드는 중입니다…');
    const XLSX = await import('xlsx');
    const details = await Promise.all([...new Set(evs.map((e) => e.lawId))].map(loadDetail));
    const byId = new Map(details.flatMap((d) => d.steps.map((s) => [s.id, s] as const)));
    const rows: (string | number)[][] = [['시행일', '법령', '공포', '구분', '조문', '제목', '변경', '개정 전', '개정 후', '취업규칙 반영', '법제처 원문']];
    for (const e of evs) {
      const st = byId.get(e.id);
      if (!st) continue;
      const p = e.promulgations[0];
      for (const c of st.changes) {
        rows.push([
          fmtDate(e.date), e.law, p ? `제${p.no}호(${fmtDate(p.date)})` : '', e.kinds.join('·'), c.article, c.title, c.kind,
          c.before ?? '', c.after ?? '', e.changes.find((x) => x.key === c.key)?.rule ?? '', lawGoUrl(st.mst, e.date),
        ]);
      }
    }
    rows.push([], ['출처: 국가법령정보센터(법제처) Open API. 법적 효력은 관보·국가법령정보센터 원문을 따릅니다.']);
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [12, 22, 18, 10, 10, 18, 6, 60, 60, 18, 40].map((wch) => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '신구대조');
    XLSX.writeFile(wb, `노동법개정_신구대조_${todayKST()}.xlsx`);
    toast.show(`조문 ${rows.length - 3}개를 엑셀로 받았습니다`);
  };

  const copyDigest = async (evs: LawEvent[]) => {
    const lines = evs.map((e) => `▸ ${fmtShort(e.date)}(${weekday(e.date)}) ${e.short}: ${headlineOf(e)}`);
    const text = `[곧 시행되는 노동법 개정]\n${lines.join('\n')}\n\n출처: 국가법령정보센터(법제처) · ${location.origin}/laws`;
    if (await copyRich(text)) toast.show(`${evs.length}건 요약을 복사했습니다. 메일·메신저에 바로 붙이세요`);
  };

  return (
    <div className="lr">
      <div className="lr-wrap">
        <header className="lr-hero">
          <div className="lr-eyebrow">노동관계법령 {index.lawCount}개 법률과 하위법령 {index.subCount}개 · 법제처 원문 기준 · {index.generated} 갱신</div>
          <h1 className="lr-h1">곧 바뀌는 노동법을, 조문 단위로.</h1>
          <p className="lr-lead">
            공포됐지만 아직 시행되지 않은 개정 <b>{upcoming.length}건</b>을 시행일 순서로 모았습니다. 바뀐 글자만 칠해 보여주고,
            신구대조표 복사·엑셀·캘린더 등록, 취업규칙에 넣을 문안까지 한 화면에서 끝납니다.
          </p>
          <div className="lr-hero-cta">
            <button className="lr-btn" onClick={() => setChecking(true)}>
              <ShieldCheck size={16} /> 내 취업규칙 붙여넣고 점검
            </button>
            <button className="lr-btn lr-btn-ghost" onClick={() => { setView('upcoming'); setRulesOnly(true); document.querySelector('.lr-toolbar')?.scrollIntoView({ behavior: 'smooth' }); }}>
              취업규칙에 걸리는 개정만 보기
            </button>
          </div>
        </header>

        {next && (
          <section className="lr-next" aria-label="다음 시행">
            <div>
              <div className="lr-next-dday">다음 시행</div>
              <div className="lr-next-big">{ddayLabel(next.date, today)}</div>
              <div className="lr-next-date">{fmtDate(next.date)} ({weekday(next.date)})</div>
            </div>
            <div>
              {nextSameDay.map((e) => (
                <div key={e.id} style={{ marginBottom: 8 }}>
                  <div className="lr-next-title">{e.short} · {headlineOf(e)}</div>
                </div>
              ))}
              <div className="lr-next-meta">
                {nextSameDay.map((e) => `${e.short} ${e.changes.map((c) => c.article).join('·')}`).join(' / ')}
              </div>
              <div className="lr-next-actions">
                <button
                  className="lr-btn"
                  onClick={() => {
                    setView('upcoming'); resetFilters();
                    setOpen(new Set(nextSameDay.map((e) => e.id)));
                    setFocus(next.id);
                    setTimeout(() => document.getElementById(next.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
                  }}
                >
                  바뀐 조문 보기
                </button>
                <button className="lr-btn lr-btn-ghost" onClick={() => exportICS(upcoming, '노동법_시행일.ics')}>
                  <CalendarPlus size={16} /> 시행일 전부 캘린더에
                </button>
              </div>
            </div>
          </section>
        )}

        {months.length > 0 && (
          <nav className="lr-strip" aria-label="월별 시행 건수">
            {months.map(([m, n]) => (
              <button
                key={m}
                aria-pressed={month === m}
                onClick={() => { setView('upcoming'); setMonth(month === m ? null : m); }}
                title={`${m.slice(0, 4)}년 ${+m.slice(4)}월 시행 ${n}건`}
              >
                <span className="m">{m.slice(2, 4)}.{m.slice(4)}</span>
                <span className="n">{n}</span>
                <span className="bar" style={{ width: `${(n / maxMonth) * 100}%` }} />
              </button>
            ))}
          </nav>
        )}
      </div>

      <div className="lr-toolbar">
        <div className="lr-wrap">
          <div className="lr-tool-row">
            <label className="lr-search">
              <Search size={16} aria-hidden />
              <input
                ref={searchRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="법령·조문·내용 검색 (예: 연차, 휴게, 성희롱)"
                aria-label="개정 검색"
              />
              {q ? (
                <button onClick={() => setQ('')} aria-label="검색어 지우기" style={{ border: 0, background: 'none', cursor: 'pointer', color: 'var(--lr-mute)' }}>
                  <X size={16} />
                </button>
              ) : (
                <span className="lr-kbd">/</span>
              )}
            </label>
            <div className="lr-seg" role="group" aria-label="보기">
              <button aria-pressed={mode === 'list'} onClick={() => { setMode('list'); setDay(null); }}><Rows3 size={14} style={{ display: 'inline' }} /> 목록</button>
              <button aria-pressed={mode === 'cal'} onClick={() => { setMode('cal'); setMonth(null); }}><CalendarDays size={14} style={{ display: 'inline' }} /> 달력</button>
            </div>
            {mode === 'list' && (
              <div className="lr-seg" role="group" aria-label="기간">
                {([['upcoming', '시행 예정', upcoming.length], ['recent', '최근 시행', recent.length], ['all', '전체', index.events.length]] as const).map(([v, label, n]) => (
                  <button key={v} aria-pressed={view === v} onClick={() => { setView(v); if (v !== 'upcoming') setMonth(null); }}>
                    {label}<span className="c">{n}</span>
                  </button>
                ))}
              </div>
            )}
            <button className="lr-btn lr-btn-ghost" onClick={() => exportXLSX(filtered)} disabled={!filtered.length} title="보이는 개정의 조문 전·후를 엑셀로">
              <FileSpreadsheet size={16} /> 엑셀
            </button>
            <SubscribeButton
              laws={laws}
              rulesOnly={rulesOnly}
              lawsOnly={lawsOnly}
              onDownload={() => exportICS(filtered.filter((e) => e.date > today), '노동법_시행일.ics')}
              toast={toast.show}
            />
            <button className="lr-btn lr-btn-ghost" onClick={() => copyDigest(filtered)} title="메일·메신저용 요약 복사">
              <ClipboardCopy size={16} /> 요약 복사
            </button>
          </div>
          <div className="lr-chips" role="group" aria-label="법령 필터">
            <button className="lr-chip lr-chip-warn" aria-pressed={rulesOnly} onClick={() => setRulesOnly(!rulesOnly)}>
              취업규칙 고칠 것만
            </button>
            <button className="lr-chip" aria-pressed={lawsOnly} onClick={() => setLawsOnly(!lawsOnly)} title="시행령·시행규칙 등 하위법령을 숨긴다">
              법률만
            </button>
            {index.groups
              .filter((l) => lawCounts.has(l.lawId) || laws.includes(l.lawId))
              .sort((a, b) => (lawCounts.get(b.lawId) ?? 0) - (lawCounts.get(a.lawId) ?? 0))
              .map((l) => (
                <button
                  key={l.lawId}
                  className="lr-chip"
                  aria-pressed={laws.includes(l.lawId)}
                  onClick={() => setLaws(laws.includes(l.lawId) ? laws.filter((x) => x !== l.lawId) : [...laws, l.lawId])}
                  title={l.name}
                >
                  {l.short}<span className="c">{lawCounts.get(l.lawId) ?? 0}</span>
                </button>
              ))}
            {filtersOn ? (
              <button className="lr-chip" onClick={resetFilters}>
                <X size={12} style={{ display: 'inline', marginRight: 2 }} /> 필터 해제
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <main className="lr-wrap">
        {mode === 'cal' && (
          <CalendarView events={matched} today={today} selected={day} onSelect={setDay} />
        )}
        {mode === 'cal' && day && (
          <div className="lr-month">
            <h2>{fmtDate(day)} ({weekday(day)})</h2>
            <span className="lr-eyebrow">시행·공포 {filtered.length}건</span>
            <button className="lr-chip" onClick={() => setDay(null)}><X size={12} style={{ display: 'inline', marginRight: 2 }} /> 날짜 해제</button>
          </div>
        )}
        {filtered.length === 0 ? (
          <div className="lr-empty">
            <p>조건에 맞는 개정이 없습니다.</p>
            <button className="lr-btn lr-btn-ghost" style={{ marginTop: 12 }} onClick={() => { resetFilters(); setView('all'); }}>
              전체 기간에서 다시 찾기
            </button>
          </div>
        ) : (
          groupByMonth(filtered).map(([m, evs]) => (
            <section key={m}>
              <div className="lr-month">
                <h2>{m.slice(0, 4)}년 {+m.slice(4)}월</h2>
                <span className="lr-eyebrow">{evs.length}건</span>
              </div>
              {evs.map((e) => (
                <EventCard
                  key={e.id}
                  e={e}
                  today={today}
                  open={open.has(e.id)}
                  focused={focus === e.id}
                  layout={layout}
                  onLayout={setLayoutSaved}
                  onToggle={() => toggle(e.id)}
                  toast={toast.show}
                  onExport={() => exportXLSX([e])}
                  art93={index.art93}
                />
              ))}
            </section>
          ))
        )}

        <footer className="lr-foot">
          <div>
            대상: {index.scopeNote}. 원문은 {index.source}에서 매일 받아, 시행일마다 전문을 직전 판과 조문 단위로 비교합니다.
            {' '}개정이유는 법제처가 제공한 문장입니다. 날짜별 한 줄 제목과 취업규칙 반영 문안은 AI가 바뀐 조문 원문과 대조해 작성했고, 공인노무사 검수 전입니다.
          </div>
          <div style={{ marginTop: 6 }}>
            법적 효력은 관보와 <a href="https://www.law.go.kr" target="_blank" rel="noreferrer">국가법령정보센터</a> 원문을 따릅니다.
            복사·내려받기 자료에는 출처와 원문 링크가 자동으로 붙습니다.
          </div>
          <div className="lr-keys">
            <span><span className="lr-kbd">/</span> 검색</span>
            <span><span className="lr-kbd">j</span> <span className="lr-kbd">k</span> 위아래</span>
            <span><span className="lr-kbd">Enter</span> 펼치기</span>
            <span><span className="lr-kbd">Esc</span> 닫기</span>
          </div>
        </footer>
      </main>

      {checking && <RulesCheck onClose={closeCheck} toast={toast.show} />}
      {toast.msg && <div className="lr-toast" role="status">{toast.msg}</div>}
    </div>
  );
}

function groupByMonth(evs: LawEvent[]): [string, LawEvent[]][] {
  const out: [string, LawEvent[]][] = [];
  for (const e of evs) {
    const m = e.date.slice(0, 6);
    const last = out[out.length - 1];
    if (last && last[0] === m) last[1].push(e);
    else out.push([m, [e]]);
  }
  return out;
}

function EventCard({
  e, today, open, focused, layout, onLayout, onToggle, toast, onExport, art93,
}: {
  e: LawEvent; today: string; open: boolean; focused: boolean; layout: Layout; onLayout: (l: Layout) => void;
  onToggle: () => void; toast: (m: string) => void; onExport: () => void; art93: Record<string, string>;
}) {
  const [detail, setDetail] = useState<LawDetail | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);
  const [err, setErr] = useState(false);
  const step = detail?.steps.find((s) => s.id === e.id);
  const upcoming = e.date > today;
  const p = e.promulgations[0];
  const cite = citation(e.law, p, e.date);

  useEffect(() => {
    if (open && !detail) loadDetail(e.lawId).then(setDetail).catch(() => setErr(true));
  }, [open, detail, e.lawId]);

  const copyAll = async () => {
    if (!step) return;
    const t = compareTable(step.changes, cite);
    if (await copyRich(t.text, t.html)) toast('신구대조표를 복사했습니다. 한글·워드·엑셀에 붙이면 표로 들어갑니다');
  };

  return (
    <article className="lr-card" id={e.id} data-open={open} data-focus={focused}>
      <div
        className="lr-row"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={(ev) => { if (ev.key === ' ') { ev.preventDefault(); onToggle(); } }}
      >
        <div className="lr-date">
          <div className="d">{fmtShort(e.date)}</div>
          <div className="w">{e.date.slice(0, 4)} · {weekday(e.date)}</div>
          <span className={`lr-badge t ${upcoming ? 'dday' : 'past'}`}>{ddayLabel(e.date, today)}</span>
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="lr-law">
            <strong>{e.short}</strong>
            {e.level !== '법률' && <span className="lr-badge lvl" title={e.lawKind}>{e.level === '시행령' && !e.short.endsWith('시행령') ? e.lawKind : e.level === '시행규칙' && !e.short.endsWith('시행규칙') ? e.lawKind : e.level}</span>}
            {e.kinds.map((k) => <span key={k} className="lr-badge">{k}</span>)}
            {e.scope && <span className="lr-badge" title="공인노무사법 시행령 별표 1의 적용 범위">{e.scope}</span>}
            {e.rules.length > 0 && <span className="lr-badge rule">취업규칙 반영 {e.rules.length}</span>}
          </div>
          <div className="lr-title">{headlineOf(e)}</div>
          {e.cause && <div className="lr-sum">「{e.cause}」 제정·개정에 딸린 정비입니다. 이 법 자체의 정책 변경은 아닙니다.</div>}
          <div className="lr-arts">
            {e.changes.slice(0, 10).map((c) => (
              <span key={c.key} className={`lr-art k-${c.kind}`} title={`${c.title} · ${c.kind}`}>
                <i />{c.article}{c.title ? ` ${c.title}` : ''}
              </span>
            ))}
            {e.changes.length > 10 && <span className="lr-art">+{e.changes.length - 10}</span>}
          </div>
        </div>
        <ChevronDown className="lr-chev" size={20} aria-hidden />
      </div>

      {open && (
        <div className="lr-detail">
          {err && <p>불러오지 못했습니다. 새로고침해 주세요.</p>}
          {!step && !err && <p className="lr-eyebrow">조문을 불러오는 중…</p>}
          {step && (
            <>
              <div className="lr-detail-bar">
                <div className="lr-seg" role="group" aria-label="비교 보기">
                  <button aria-pressed={layout === 'split'} onClick={() => onLayout('split')}><Columns2 size={14} style={{ display: 'inline' }} /> 나란히</button>
                  <button aria-pressed={layout === 'unified'} onClick={() => onLayout('unified')}><Rows3 size={14} style={{ display: 'inline' }} /> 한 줄</button>
                </div>
                <span className="sp" />
                <button className="lr-btn lr-btn-sm" onClick={copyAll}><ClipboardCopy size={14} /> 신구대조표 복사</button>
                <button className="lr-btn lr-btn-ghost lr-btn-sm" onClick={onExport}><FileSpreadsheet size={14} /> 엑셀</button>
                {upcoming && (
                  <button className="lr-btn lr-btn-ghost lr-btn-sm" onClick={() => { download(`${e.short}_${e.date}.ics`, toICS([e]), 'text/calendar;charset=utf-8'); toast('캘린더 파일을 받았습니다'); }}>
                    <CalendarPlus size={14} /> 캘린더
                  </button>
                )}
                <a className="lr-btn lr-btn-ghost lr-btn-sm" href={lawGoUrl(step.mst, e.date)} target="_blank" rel="noreferrer">
                  <ExternalLink size={14} /> 법제처 원문
                </a>
              </div>

              <div className="lr-why">
                <b>{p ? `법률 제${p.no}호 · ${fmtDate(p.date)} 공포 · ${fmtDate(e.date)} 시행` : `${fmtDate(e.date)} 시행`}</b>
                {e.promulgations.length > 1 && ` 외 ${e.promulgations.length - 1}건`}
                <br />
                {e.cause ? `「${e.cause}」 개정이유: ` : '개정이유(법제처): '}
                {step.reason.length > 260 && !whyOpen ? `${step.reason.slice(0, 250)}…` : step.reason}
                {step.reason.length > 260 && (
                  <button className="lr-more" onClick={() => setWhyOpen(!whyOpen)}>{whyOpen ? '접기' : '전체 보기'}</button>
                )}
              </div>

              {step.rules.length > 0 && <RulesBox rules={step.rules} art93={art93} cite={cite} toast={toast} />}

              {step.changes.map((c) => (
                <ArticleDiff key={c.key} id={`${e.id}~${c.key}`} c={c} layout={layout} cite={cite} toast={toast} />
              ))}

              {step.addenda.length > 0 && (
                <details className="lr-addenda">
                  <summary><ScrollText size={14} style={{ display: 'inline' }} /> 부칙 (시행일·경과조치)</summary>
                  {step.addenda.map((a) => (
                    <div key={a.부칙} style={{ marginTop: 8 }}>
                      <p><b>{a.부칙}</b></p>
                      {a.내용.map((x, i) => <p key={i}>{x}</p>)}
                    </div>
                  ))}
                </details>
              )}
            </>
          )}
        </div>
      )}
    </article>
  );
}

function RulesBox({ rules, art93, cite, toast }: { rules: RuleDetail[]; art93: Record<string, string>; cite: string; toast: (m: string) => void }) {
  return (
    <section className="lr-rules" aria-label="취업규칙 반영">
      <h3><Check size={16} /> 취업규칙에 반영할 것 {rules.length}건</h3>
      <p>상시 10명 이상 사업장은 바뀐 내용을 취업규칙에 넣고 변경 신고합니다(근로기준법 제93조). 변경할 때는 근로자 과반수의 의견을 듣고, 불리한 변경이면 동의를 받습니다(제94조).</p>
      {rules.map((r) => (
        <div className="lr-rule" key={r.article + r.topic}>
          <div className="lr-rule-head">
            <b>{r.topic}</b>
            <span className="lr-badge">{r.article}</span>
            <span className="lr-badge rule" title={art93[r.art93]}>제93조 제{r.art93}호{r.required ? ' · 필수' : ''}</span>
          </div>
          <p>{r.point}</p>
          <div className="lr-clause">{r.clause}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            <button
              className="lr-btn lr-btn-sm"
              onClick={async () => { if (await copyRich(`${r.clause}\n\n(근거) ${r.article} 개정\n${cite}`)) toast('예시 문안을 복사했습니다. 회사 조항 번호에 맞춰 붙이세요'); }}
            >
              <ClipboardCopy size={14} /> 문안 복사
            </button>
            <Link className="lr-btn lr-btn-ghost lr-btn-sm" href="/contact">우리 회사 규칙에 맞춰 반영 요청</Link>
          </div>
        </div>
      ))}
    </section>
  );
}

function ArticleDiff({ id, c, layout, cite, toast }: { id: string; c: StepChange; layout: Layout; cite: string; toast: (m: string) => void }) {
  const rows = useMemo(() => diffArticle(c.before, c.after), [c.before, c.after]);
  const [showAll, setShowAll] = useState(false);
  const changed = rows.filter((r) => r.type !== 'same').length;
  const foldable = rows.length > 6 && changed > 0 && rows.length - changed > 3;

  // 바뀐 줄 앞뒤 한 줄씩만 남기고 접는다
  const keep = new Set<number>();
  rows.forEach((r, i) => { if (r.type !== 'same') [i - 1, i, i + 1].forEach((k) => keep.add(k)); });
  keep.add(0);

  const copy = async (what: 'after' | 'table' | 'link') => {
    if (what === 'link') {
      const url = `${location.origin}${location.pathname}#${encodeURIComponent(id)}`;
      if (await copyRich(url)) toast('이 조문으로 바로 오는 링크를 복사했습니다');
      return;
    }
    if (what === 'after') {
      if (await copyRich(`${c.after ?? `${c.article} 삭제`}\n\n${cite}`)) toast('개정 후 조문을 출처와 함께 복사했습니다');
      return;
    }
    const t = compareTable([c], cite);
    if (await copyRich(t.text, t.html)) toast('신구대조를 표로 복사했습니다');
  };

  return (
    <div className="lr-artcard" id={id}>
      <div className="lr-arthead">
        <h4>{c.article}{c.title ? ` ${c.title}` : ''}</h4>
        <span className={`lr-badge k-${c.kind}`}>{c.kind}</span>
        <span className="sp" />
        <button className="lr-btn lr-btn-ghost lr-btn-sm" onClick={() => copy('after')} title="개정 후 조문 복사">
          <ClipboardCopy size={14} /> 개정 후
        </button>
        <button className="lr-btn lr-btn-ghost lr-btn-sm" onClick={() => copy('table')} title="신구대조 표로 복사">
          <Columns2 size={14} /> 신구대조
        </button>
        <button className="lr-btn lr-btn-ghost lr-btn-sm" onClick={() => copy('link')} aria-label="조문 링크 복사" title="조문 링크 복사">
          <Link2 size={14} />
        </button>
      </div>
      <div className={`lr-diff ${layout}`}>
        {layout === 'split' && <div className="hd"><div>개정 전</div><div>개정 후</div></div>}
        {rows.map((r, i) => (
          <DiffRow key={i} r={r} layout={layout} folded={foldable && !showAll && !keep.has(i)} />
        ))}
        {foldable && (
          <button className="lr-fold-btn" onClick={() => setShowAll(!showAll)}>
            {showAll ? '바뀐 부분만 보기' : `바뀌지 않은 ${rows.length - keep.size}줄 펼치기`}
          </button>
        )}
      </div>
    </div>
  );
}

function Segs({ segs, tag }: { segs?: { text: string; hl: boolean }[]; tag: 'del' | 'ins' }) {
  if (!segs) return null;
  const T = tag;
  return <>{segs.map((s, i) => (s.hl ? <T key={i}>{s.text}</T> : <span key={i}>{s.text}</span>))}</>;
}

function DiffRow({ r, layout, folded }: { r: Row; layout: Layout; folded: boolean }) {
  const d = r.depth ? ` d${Math.min(r.depth, 2)}` : '';
  const cls = `r ${r.type}${folded ? ' fold' : ''}`;
  if (layout === 'split') {
    return (
      <div className={cls}>
        <div className={`b${d}`}>{r.type === 'add' ? null : <Segs segs={r.before} tag="del" />}</div>
        <div className={`a${d}`}>{r.type === 'del' ? null : <Segs segs={r.after} tag="ins" />}</div>
      </div>
    );
  }
  if (r.type === 'same') return <div className={cls}><div className={`s${d}`}><Segs segs={r.after} tag="ins" /></div></div>;
  return (
    <div className={cls}>
      {r.type !== 'add' && <div className={`b${d}`}><Segs segs={r.before} tag="del" /></div>}
      {r.type !== 'del' && <div className={`a${d}`}><Segs segs={r.after} tag="ins" /></div>}
    </div>
  );
}
