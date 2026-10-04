// /laws 화면의 날짜·출처·복사·내려받기 형식. 복사물은 모두 같은 출처 꼬리를 단다 — 법령 원문 재배포 조건(출처 표시·변조 금지)의 실체.

export interface Promulgation {
  date: string;
  no: string;
  kind: string;
  mst: string;
}

export interface LawEvent {
  id: string;
  lawId: string;
  law: string;
  short: string;
  scope: string | null;
  date: string;
  promulgations: Promulgation[];
  kinds: string[];
  cause: string | null;
  headline: string | null;
  summary: string;
  counts: { 신설: number; 개정: number; 삭제: number };
  changes: { key: string; article: string; title: string; kind: string; rule: string | null }[];
  rules: { article: string; topic: string; art93: string; required: boolean }[];
}

export interface LawIndex {
  generated: string;
  since: string;
  source: string;
  scopeNote: string;
  lawCount: number;
  art93: Record<string, string>;
  laws: { lawId: string; name: string; short: string; events: number; upcoming: number }[];
  events: LawEvent[];
}

export interface RuleDetail {
  lawId: string;
  article: string;
  effective: string;
  topic: string;
  art93: string;
  required: boolean;
  point: string;
  clause: string;
}

export interface StepChange {
  key: string;
  article: string;
  title: string;
  kind: string;
  before: string | null;
  after: string | null;
}

export interface LawDetail {
  lawId: string;
  name: string;
  short: string;
  steps: {
    id: string;
    date: string;
    base: string;
    mst: string | null;
    changes: StepChange[];
    addenda: { 부칙: string; 내용: string[] }[];
    reason: string;
    rules: RuleDetail[];
  }[];
}

/** 오늘(KST) YYYYMMDD */
export function todayKST(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10).replace(/-/g, '');
}

function toUTC(d: string): number {
  return Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8));
}

/** 시행일까지 남은 날. 오늘이면 0, 지났으면 음수 */
export function daysUntil(date: string, today: string): number {
  return Math.round((toUTC(date) - toUTC(today)) / 86400000);
}

export function ddayLabel(date: string, today: string): string {
  const n = daysUntil(date, today);
  if (n === 0) return '오늘 시행';
  return n > 0 ? `D-${n}` : `시행 ${-n}일째`;
}

/** 20261008 → 2026. 10. 8. */
export function fmtDate(d: string): string {
  return `${d.slice(0, 4)}. ${+d.slice(4, 6)}. ${+d.slice(6, 8)}.`;
}

/** 20261008 → 10. 8. */
export function fmtShort(d: string): string {
  return `${+d.slice(4, 6)}. ${+d.slice(6, 8)}.`;
}

export function weekday(d: string): string {
  return '일월화수목금토'[new Date(toUTC(d)).getUTCDay()];
}

export function lawGoUrl(mst: string | null, date: string): string {
  return mst
    ? `https://www.law.go.kr/lsInfoP.do?lsiSeq=${mst}&efYd=${date}`
    : 'https://www.law.go.kr';
}

/** 모든 복사물 끝에 붙는 출처 */
export function citation(law: string, p: Promulgation | undefined, date: string): string {
  const no = p ? ` 법률 제${p.no}호(${fmtDate(p.date)} 공포),` : '';
  return `근거: 「${law}」${no} ${fmtDate(date)} 시행\n출처: 국가법령정보센터(법제처) ${lawGoUrl(p?.mst ?? null, date)}`;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 신구대조표 — 한글·워드에는 표(html)로, 메모장·엑셀에는 탭 구분(text)으로 붙는다 */
export function compareTable(rows: { article: string; before: string | null; after: string | null }[], cite: string) {
  const cell = (s: string | null, empty: string) => (s ? s : empty);
  const text =
    ['조문\t개정 전\t개정 후', ...rows.map((r) =>
      [r.article, cell(r.before, '<신설>'), cell(r.after, '<삭제>')]
        .map((c) => `"${c.replace(/"/g, '""')}"`)
        .join('\t'),
    )].join('\n') + `\n\n${cite}`;
  const td = 'border:1px solid #999;padding:6px;vertical-align:top;white-space:pre-wrap;';
  const html =
    `<table style="border-collapse:collapse;font-size:10pt;">` +
    `<tr><th style="${td}background:#eee;">조문</th><th style="${td}background:#eee;">개정 전</th><th style="${td}background:#eee;">개정 후</th></tr>` +
    rows
      .map(
        (r) =>
          `<tr><td style="${td}">${esc(r.article)}</td><td style="${td}">${esc(cell(r.before, '<신설>'))}</td><td style="${td}">${esc(cell(r.after, '<삭제>'))}</td></tr>`,
      )
      .join('') +
    `</table><p style="font-size:9pt;color:#555;white-space:pre-wrap;">${esc(cite)}</p>`;
  return { text, html };
}

/** 시행일 캘린더(.ics) — 종일 일정, 하루 전 알림 */
export function toICS(events: LawEvent[]): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const next = (d: string) => {
    const t = new Date(toUTC(d) + 86400000);
    return t.toISOString().slice(0, 10).replace(/-/g, '');
  };
  const fold = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const body = events.map((e) =>
    [
      'BEGIN:VEVENT',
      `UID:${e.id}@laws`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${e.date}`,
      `DTEND;VALUE=DATE:${next(e.date)}`,
      `SUMMARY:${fold(`[시행] ${e.short}: ${e.headline ?? e.changes.map((c) => c.article).slice(0, 4).join('·')}`)}`,
      `DESCRIPTION:${fold(`${e.summary.slice(0, 300)}\n${citation(e.law, e.promulgations[0], e.date)}`)}`,
      'BEGIN:VALARM',
      'TRIGGER:-P1D',
      'ACTION:DISPLAY',
      `DESCRIPTION:${fold(`내일 시행: ${e.short}`)}`,
      'END:VALARM',
      'END:VEVENT',
    ].join('\r\n'),
  );
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//labor-law-changes//KO', 'CALSCALE:GREGORIAN', ...body, 'END:VCALENDAR'].join('\r\n');
}

export function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyRich(text: string, html?: string): Promise<boolean> {
  try {
    if (html && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([text], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' }),
        }),
      ]);
    } else {
      await navigator.clipboard.writeText(text);
    }
    return true;
  } catch {
    return false;
  }
}
