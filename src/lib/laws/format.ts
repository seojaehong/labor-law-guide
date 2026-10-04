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
  /** 상위 법률 ID — 하위법령도 그 법률 칩으로 묶인다 */
  group: string;
  level: '법률' | '시행령' | '시행규칙';
  /** 법률 · 대통령령 · 고용노동부령 … */
  lawKind: string;
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
  laws: { lawId: string; name: string; short: string; group: string; level: string; events: number; upcoming: number }[];
  groups: { lawId: string; name: string; short: string; events: number; upcoming: number }[];
  subCount: number;
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

export interface CalItem {
  uid: string;
  date: string;
  summary: string;
  description: string;
  url?: string;
  /** 며칠 전 알림. 없으면 알림 없음 */
  alarmDays?: number;
}

export function addDays(d: string, n: number): string {
  return new Date(toUTC(d) + n * 86400000).toISOString().slice(0, 10).replace(/-/g, '');
}

const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

/** 종일 일정 묶음 → .ics. name 이 있으면 구독 캘린더 이름·새로고침 주기를 단다 */
export function icsCalendar(items: CalItem[], name?: string): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const head = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//labor-law-changes//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  if (name) head.push(`X-WR-CALNAME:${icsText(name)}`, 'X-WR-TIMEZONE:Asia/Seoul', 'REFRESH-INTERVAL;VALUE=DURATION:PT12H', 'X-PUBLISHED-TTL:PT12H');
  const body = items.map((it) =>
    [
      'BEGIN:VEVENT',
      `UID:${it.uid}@laws`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${it.date}`,
      `DTEND;VALUE=DATE:${addDays(it.date, 1)}`,
      `SUMMARY:${icsText(it.summary)}`,
      `DESCRIPTION:${icsText(it.description)}`,
      ...(it.url ? [`URL:${it.url}`] : []),
      'TRANSP:TRANSPARENT',
      ...(it.alarmDays != null
        ? ['BEGIN:VALARM', `TRIGGER:-P${it.alarmDays}D`, 'ACTION:DISPLAY', `DESCRIPTION:${icsText(it.summary)}`, 'END:VALARM']
        : []),
      'END:VEVENT',
    ].join('\r\n'),
  );
  return [...head, ...body, 'END:VCALENDAR'].join('\r\n');
}

/** 개정 일정 → 캘린더 항목. 시행일은 하루 전 알림, 공포일은 선택(알림 없음) */
export function lawCalItems(events: LawEvent[], opts: { promulgation?: boolean; origin?: string } = {}): CalItem[] {
  const items: CalItem[] = [];
  for (const e of events) {
    const title = e.headline ?? (e.cause ? `「${e.cause}」에 따른 정비` : e.changes.map((c) => c.article).slice(0, 4).join('·'));
    const url = opts.origin ? `${opts.origin}/laws#${encodeURIComponent(e.id)}` : undefined;
    items.push({
      uid: e.id,
      date: e.date,
      summary: `[시행] ${e.short}: ${title}`,
      description: `${e.changes.map((c) => `${c.article}${c.title ? `(${c.title})` : ''} ${c.kind}`).slice(0, 12).join(', ')}\n\n${citation(e.law, e.promulgations[0], e.date)}`,
      url,
      alarmDays: 1,
    });
    if (opts.promulgation) {
      for (const p of e.promulgations) {
        if (p.date === e.date) continue;
        items.push({
          uid: `${e.lawId}-${p.no}-p`,
          date: p.date,
          summary: `[공포] ${e.short} ${p.kind}(제${p.no}호), ${fmtDate(e.date)} 시행 예정`,
          description: `${title}\n\n${citation(e.law, p, e.date)}`,
          url,
        });
      }
    }
  }
  // 같은 공포가 여러 시행일에 걸치면 공포 일정이 겹친다 — uid 로 한 번만
  const seen = new Set<string>();
  return items.filter((it) => (seen.has(it.uid) ? false : (seen.add(it.uid), true)));
}

/** 시행일 캘린더(.ics) — 종일 일정, 하루 전 알림 */
export function toICS(events: LawEvent[], opts: { promulgation?: boolean; origin?: string; name?: string } = {}): string {
  return icsCalendar(lawCalItems(events, opts), opts.name);
}

export interface PrepInput {
  key: string;
  topic: string;
  law: string;
  article: string;
  effective: string;
  required: boolean;
}

/**
 * 「언제까지 무엇을 하나」 — 취업규칙 대응 일정. 근로기준법 제93조(작성·변경 신고)·제94조(의견 청취, 불리하면 동의)를
 * 시행일에서 거꾸로 세운다. 법정 기한이 아니라 권장 일정이다. 이미 시행 중이면 오늘부터 앞으로 잡는다.
 */
export function prepCalItems(items: PrepInput[], today: string): CalItem[] {
  const out: CalItem[] = [];
  for (const it of items) {
    const late = it.effective <= today;
    const steps: [number, string, string][] = late
      ? [
          [0, '개정안 작성(이미 시행 중)', '법은 이미 시행 중입니다. 취업규칙 조항을 바로 고칩니다.'],
          [7, '근로자 과반수 의견 청취', '근로기준법 제94조. 근로자에게 불리한 변경이면 과반수 동의를 받습니다.'],
          [14, '취업규칙 변경 신고', '근로기준법 제93조. 상시 10명 이상 사업장은 변경한 취업규칙을 신고합니다.'],
        ]
      : [
          [-30, '개정안 작성', '바뀌는 조문에 맞춰 취업규칙 개정안을 만듭니다.'],
          [-14, '근로자 과반수 의견 청취', '근로기준법 제94조. 근로자에게 불리한 변경이면 과반수 동의를 받습니다.'],
          [-7, '취업규칙 변경 신고', '근로기준법 제93조. 상시 10명 이상 사업장은 변경한 취업규칙을 신고합니다.'],
          [0, '시행일', '개정 법령이 시행됩니다. 바뀐 조항을 근로자에게 알립니다.'],
        ];
    for (const [off, what, how] of steps) {
      let date = addDays(late ? today : it.effective, off);
      if (!late && date < today) date = today; // 이미 지난 준비 단계는 오늘로 당긴다
      out.push({
        uid: `prep-${it.key}-${off}`,
        date,
        summary: `[취업규칙] ${what}: ${it.topic}`,
        description: `${it.law} ${it.article} · ${fmtDate(it.effective)} 시행${it.required ? '' : ' · 선택 반영'}\n${how}\n권장 일정입니다. 법정 기한은 아닙니다.`,
        alarmDays: off === 0 ? 1 : 3,
      });
    }
  }
  return out;
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
