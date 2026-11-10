// 퇴사 자료 대조 — 화면 모델(계획 조각 2). core_report 를 화면 글자로 바꾸는 순수 함수다.
// 엔진 사본은 타입으로만 본다(exit-check-demo/types). 이 파일은 한국어 글자를 갖지 않는다 — 문안은 labels.ts·copy.ts 두 파일에만 있다.
//
// 읽는 것: 항목의 상태·사유·칸 이름, 근거의 자료 묶음·행·열, 날짜·시각 칸의 정규화 값, 자료 통과 결과, 대조 항목 이름.
// 읽지 않는 것: details(날짜 후보·조문 등), source_value, 머리글 원문(source_header), 파일 이름, 시트 이름, 키 원문, run_state.
// 묶음: 확인할 항목 = 값 확인(checkItems) + 대조하지 못한 항목(notComparedItems, 따로 적는다). 대조에서 뺀 항목·대조에 쓰지 못한 자료는 따로 센다.

import type { CoreReport, Evidence, Finding, ItemStatus } from '@/lib/exit-check-demo/types';
import * as C from './copy';
import {
  COMPARED_ITEM_LABEL,
  FIELD_LABEL,
  FILE_GROUP_LABEL,
  GATE_REASON_TEXT,
  IGNORED_KIND_LABEL,
  NOT_COMPARED_LABEL,
  NOT_COMPUTED_TEXT,
  REASON_TEXT,
  REASON_TEXT_ONE_FILE,
  SCHEME_LABEL,
  STATUS_LABEL,
} from './labels';

export interface ViewItem {
  status: string;
  text: string;
  places: string[];
}

export interface ExitCheckView {
  summary: string;
  counts: { confirm: number; checkItems: number; notCompared: number; compared: number; unusableFiles: number; excluded: number };
  zeroNote: string | null;
  scopeNote: string;
  cutoffNote: string | null;
  checkItems: ViewItem[];
  notComparedItems: ViewItem[];
  excluded: ViewItem[];
  unusableFiles: ViewItem[];
  unusedColumns: string[];
  comparedItems: string[];
}

/** 값을 화면에 싣는 칸 = 사본 COLUMN_SPECS 의 date·instant 칸(시험이 같은지 본다). 그 밖의 칸 값은 싣지 않는다(기본 거부). */
export const DATE_VALUE_FIELDS: readonly string[] = [
  'employment_end_date',
  'employment_start_date',
  'insurance_loss_date',
  'last_worked_date',
  'ledger_as_of',
  'leave_period_end',
  'leave_period_start',
  'observed_at',
  'pay_period_end',
  'pay_period_start',
  'payment_date',
  'processed_at',
  'receipt_at',
  'settlement_completed_at',
  'source_as_of',
  'submission_at',
];

type Bucket = 'check' | 'notCompared' | 'excluded' | 'skip';
/** 상태 → 묶음. 대조에 쓰지 못한 자료(SCHEMA_BLOCKED)는 자료 통과 결과에서 세므로 항목에서는 건너뛴다. 모르는 상태는 확인할 항목으로 센다. */
const BUCKET: Record<ItemStatus | 'SCHEMA_BLOCKED', Bucket> = {
  DISCREPANCY: 'check',
  INCOMPLETE: 'check',
  STALE: 'check',
  REVIEW_REQUIRED: 'check',
  MISSING_INPUT: 'notCompared',
  ON_HOLD: 'notCompared',
  NOT_APPLICABLE: 'excluded',
  SCHEMA_BLOCKED: 'skip',
};

const NOT_COMPUTED_ITEM = 'deadline_candidates_not_computed';
const COLUMN_LETTERS = /^[A-Z]{1,3}$/;

function lookup<T>(table: Readonly<Record<string, T>>, key: string | null | undefined): T | undefined {
  return typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{([a-z]+)\}/g, (_, k: string) => vars[k] ?? '');
}

const groupLabel = (g: string | null | undefined) => lookup(FILE_GROUP_LABEL, g) ?? C.GROUP_FALLBACK;
const schemeLabel = (s: string | null | undefined) => lookup(SCHEME_LABEL, s) ?? C.SCHEME_FALLBACK;
const columnLabel = (c: string | null | undefined) => lookup(FIELD_LABEL, c) ?? C.FIELD_FALLBACK;

interface ParsedField {
  group?: string;
  column?: string;
  scheme?: string;
}

/** 칸 이름 꼴: 칸 · 묶음.칸 · 묶음 · 칸:제도 · 묶음:제도.evidence · 묶음.evidence · 묶음.row */
function parseField(field: string | null): ParsedField {
  let f = field ?? '';
  const out: ParsedField = {};
  let tail: string | undefined;
  if (f.endsWith('.evidence')) {
    tail = 'evidence';
    f = f.slice(0, -'.evidence'.length);
  }
  const colon = f.indexOf(':');
  if (colon >= 0) {
    out.scheme = f.slice(colon + 1);
    f = f.slice(0, colon);
  }
  const dot = f.indexOf('.');
  if (dot >= 0 && lookup(FILE_GROUP_LABEL, f.slice(0, dot)) !== undefined) {
    out.group = f.slice(0, dot);
    out.column = f.slice(dot + 1);
  } else if (lookup(FILE_GROUP_LABEL, f) !== undefined) {
    out.group = f;
  } else if (f !== '') {
    out.column = f;
  }
  if (tail) out.column = tail;
  return out;
}

/** {column}: 칸 이름(제도가 붙으면 제도 이름과 함께). 제도 칸 자체는 제도 이름만. */
function columnPhrase(p: ParsedField): string | undefined {
  if (p.column === 'scheme' && p.scheme !== undefined) return schemeLabel(p.scheme);
  if (p.column === undefined) return p.scheme !== undefined ? schemeLabel(p.scheme) : undefined;
  const col = columnLabel(p.column);
  return p.scheme !== undefined ? fill(C.FIELD_WITH_SCHEME, { scheme: schemeLabel(p.scheme), column: col }) : col;
}

/** {field}: 자료 이름이 붙은 칸 이름. 칸이 없으면 자료 이름. */
function fieldPhrase(p: ParsedField): string {
  const col = columnPhrase(p);
  if (p.group !== undefined && col !== undefined) return fill(C.FIELD_OF_GROUP, { group: groupLabel(p.group), column: col });
  if (p.group !== undefined) return groupLabel(p.group);
  return col ?? C.FIELD_FALLBACK;
}

function findingGroup(f: Finding, p: ParsedField): string | null {
  if (p.group !== undefined) return p.group;
  const ev = f.evidence.find((e) => e.role !== 'anchor' && e.file_group) ?? f.evidence.find((e) => e.file_group);
  return ev?.file_group ?? null;
}

/** 값을 본 근거(observed·reference)가 걸친 파일 수. 직접 입력 행은 파일 하나로 센다. */
function sourceCount(f: Finding): number {
  const seen = f.evidence.filter((e) => e.role === 'observed' || e.role === 'reference').map((e) => e.file_sha256 ?? 'inline');
  return new Set(seen).size;
}

function findingText(f: Finding): string {
  const p = parseField(f.field);
  const oneFile = sourceCount(f) <= 1 ? lookup(REASON_TEXT_ONE_FILE, f.reason_code) : undefined;
  const template = oneFile ?? lookup(REASON_TEXT, f.reason_code) ?? C.REASON_FALLBACK;
  return fill(template, {
    field: fieldPhrase(p),
    column: columnPhrase(p) ?? C.FIELD_FALLBACK,
    group: groupLabel(findingGroup(f, p)),
    scheme: schemeLabel(p.scheme),
  });
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 날짜(YYYY-MM-DD)와 UTC 시각(…Z)만 한국 시간 꼴로 바꾼다. 그 밖의 모양은 null — 싣지 않는다. */
function formatDateValue(v: string, template = C.INSTANT_FORMAT): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (d) return fill(C.DATE_FORMAT, { y: d[1]!, m: String(Number(d[2])), d: String(Number(d[3])) });
  const t = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?Z$/.exec(v);
  if (!t) return null;
  const ms = Date.UTC(Number(t[1]), Number(t[2]) - 1, Number(t[3]), Number(t[4]), Number(t[5]), Number(t[6]));
  if (Number.isNaN(ms)) return null;
  const k = new Date(ms + 9 * 60 * 60 * 1000);
  return fill(template, {
    y: String(k.getUTCFullYear()),
    m: String(k.getUTCMonth() + 1),
    d: String(k.getUTCDate()),
    hh: pad2(k.getUTCHours()),
    mm: pad2(k.getUTCMinutes()),
    ss: pad2(k.getUTCSeconds()),
  });
}

function placeOf(e: Evidence): string {
  const group = groupLabel(e.file_group);
  const loc = e.locator;
  let place: string;
  if (!loc || !Number.isInteger(loc.row) || loc.row < 1) {
    place = fill(e.file_sha256 === null && e.role === 'observed' ? C.PLACE_INLINE : C.PLACE_GROUP, { group });
  } else if (typeof loc.column === 'string' && COLUMN_LETTERS.test(loc.column)) {
    place = fill(C.PLACE_CELL, { group, row: String(loc.row), col: loc.column });
  } else {
    place = fill(C.PLACE_ROW, { group, row: String(loc.row) });
  }
  if (typeof e.field === 'string' && DATE_VALUE_FIELDS.includes(e.field) && typeof e.normalized === 'string') {
    const value = formatDateValue(e.normalized);
    if (value !== null) place = fill(C.PLACE_WITH_VALUE, { place, value });
  }
  return place;
}

/** 근거 위치: 값을 본 자리(observed·reference·header)가 있으면 그것만, 없으면 기준 행(anchor)·자료(file). */
function placesOf(f: Finding): string[] {
  const primary = f.evidence.filter((e) => e.role === 'observed' || e.role === 'reference' || e.role === 'header');
  const list = primary.length > 0 ? primary : f.evidence.filter((e) => e.role === 'anchor' || e.role === 'file');
  return [...new Set(list.map(placeOf))];
}

function comparedLabel(base: string, param: string | undefined): string {
  const template = lookup(COMPARED_ITEM_LABEL, base) ?? C.COMPARED_FALLBACK;
  const parts = (param ?? '').split(',').filter((x) => x !== '');
  const colon = (param ?? '').indexOf(':');
  const target =
    param === undefined
      ? ''
      : colon >= 0
        ? fill(C.TARGET_WITH_SCHEME, { group: groupLabel(param.slice(0, colon)), scheme: schemeLabel(param.slice(colon + 1)) })
        : groupLabel(param);
  return fill(template, {
    groups: parts.map(groupLabel).join(C.NAME_JOIN),
    schemes: parts.map(schemeLabel).join(C.NAME_JOIN),
    target,
  });
}

export function toExitCheckView(report: CoreReport): ExitCheckView {
  const checkItems: ViewItem[] = [];
  const notComparedFindings: ViewItem[] = [];
  const notComputed: ViewItem[] = [];
  const excluded: ViewItem[] = [];
  const unusableFiles: ViewItem[] = [];
  const unusedColumns: string[] = [];
  const comparedItems: string[] = [];
  let compared = 0;

  for (const f of report.findings) {
    const bucket = lookup(BUCKET, f.status) ?? 'check';
    if (bucket === 'skip') continue;
    const item: ViewItem = { status: lookup(STATUS_LABEL, f.status) ?? C.STATUS_FALLBACK, text: findingText(f), places: placesOf(f) };
    if (bucket === 'check') checkItems.push(item);
    else if (bucket === 'notCompared') notComparedFindings.push(item);
    else excluded.push(item);
  }

  for (const c of report.compared_items) {
    const colon = c.item.indexOf(':');
    const base = colon >= 0 ? c.item.slice(0, colon) : c.item;
    const param = colon >= 0 ? c.item.slice(colon + 1) : undefined;
    if (base === NOT_COMPUTED_ITEM) {
      notComputed.push({ status: NOT_COMPARED_LABEL, text: lookup(NOT_COMPUTED_TEXT, param) ?? C.NOT_COMPUTED_FALLBACK, places: [] });
      continue;
    }
    compared += 1;
    const label = comparedLabel(base, param);
    if (!comparedItems.includes(label)) comparedItems.push(label);
  }

  const blockedStatus = lookup(STATUS_LABEL, 'SCHEMA_BLOCKED') ?? C.STATUS_FALLBACK;
  for (const g of report.file_gate_results) {
    const group = groupLabel(g.file_group);
    if (g.status !== 'ACCEPTED') {
      const template = lookup(GATE_REASON_TEXT, g.reason_code) ?? C.GATE_REASON_FALLBACK;
      const fields = (g.missing_key_columns ?? []).map(columnLabel).join(C.NAME_JOIN);
      unusableFiles.push({ status: blockedStatus, text: fill(template, { group, fields }), places: [] });
    }
    const ignored = g.ignored_columns ?? [];
    if (ignored.length > 0) {
      const columns = ignored
        .map((col) => {
          const kind = lookup(IGNORED_KIND_LABEL, col.kind) ?? C.KIND_FALLBACK;
          return COLUMN_LETTERS.test(col.source_column) ? fill(C.UNUSED_COLUMN_ITEM, { col: col.source_column, kind }) : kind;
        })
        .join(C.LIST_JOIN);
      unusedColumns.push(fill(C.UNUSED_COLUMNS, { group, columns }));
    }
  }
  for (const e of report.inline_entry_results) {
    if (e.status !== 'ACCEPTED') unusableFiles.push({ status: blockedStatus, text: fill(C.INLINE_BLOCKED, { group: groupLabel(e.file_group) }), places: [] });
  }

  const notComparedItems = [...notComparedFindings, ...notComputed];
  const counts = {
    confirm: checkItems.length + notComparedItems.length,
    checkItems: checkItems.length,
    notCompared: notComparedItems.length,
    compared,
    unusableFiles: unusableFiles.length,
    excluded: excluded.length,
  };

  const summary = [fill(C.SUMMARY_CONFIRM, { n: String(counts.confirm) }), fill(C.SUMMARY_COMPARED, { n: String(counts.compared) })];
  if (counts.unusableFiles > 0) summary.push(fill(C.SUMMARY_UNUSABLE, { n: String(counts.unusableFiles) }));
  if (counts.excluded > 0) summary.push(fill(C.SUMMARY_EXCLUDED, { n: String(counts.excluded) }));

  const zero = counts.confirm === 0 && counts.unusableFiles === 0 && counts.compared > 0;
  const cutoff = formatDateValue(report.cutoff_at, C.CUTOFF_FORMAT);

  return {
    summary: summary.join(C.SUMMARY_JOIN),
    counts,
    zeroNote: zero ? `${fill(C.ZERO_NOTE, { n: String(counts.compared) })} ${C.SCOPE_NOTE}` : null,
    scopeNote: C.SCOPE_NOTE,
    cutoffNote: cutoff === null ? null : fill(C.CUTOFF_NOTE, { cutoff }),
    checkItems,
    notComparedItems,
    excluded,
    unusableFiles,
    unusedColumns,
    comparedItems,
  };
}
