// 근로계약서 작성 — 오프라인 단독판 진입점.
//
// scripts/build-contract-write-offline.mjs 가 이 파일을 IIFE(전역 이름 ContractWriteOfflineBundle)로 묶어 HTML 1장에 인라인한다.
// 입력 해석(formState.toWriteForm)·설계·점검 되먹임·계약서 본문·엑셀·한글·PDF 는 사이트와 같은 코드를 쓰고, 화면만 React 없이 순수 DOM 으로 그린다.
// PDF 글꼴(나눔고딕, OFL)은 HTML 안 <script id="cw-font" type="application/octet-stream"> 에 base64 로 실려 있다 — 글꼴을 받으러 나가지 않는다.
// ★ 외부 요청을 하지 않는다. HTML 의 CSP(default-src 'none')가 막고, tests/unit/contract-write-offline.test.ts 와
//   scripts/verify-contract-write-offline.mjs(실브라우저 요청 캡처)가 확인한다.

import { ruleName } from '@/lib/contract-check/present';
import { designFromForm, publicText, reviewWritten } from '@/lib/contract-write/contract';
import { ITEM_LABEL, type ItemKey } from '@/lib/contract-write/design';
import { buildContractDocument, type ContractDocument } from '@/lib/contract-write/document';
import { buildContractHwpx, buildContractPdf, buildContractXlsx } from '@/lib/contract-write/export';
import type { Finding } from '@/lib/contract-check/types';

import { INITIAL, toWriteForm, WEEK_DAYS, type WriteState } from '@/app/tools/contract-write/formState';

declare const __CW_BUILD__: { date: string; sha: string };

export interface OfflineOutcome {
  missing: string[];
  error: string | null;
  netNote: string | null;
  rows: Array<{ label: string; hours: number; amount: number; absorbs: boolean }>;
  total: number | null;
  period: 'month' | 'day' | null;
  rate: number | null;
  minimumWage: { text: string; warn: boolean } | null;
  findings: Finding[];
  doc: ContractDocument | null;
}

/** 화면 상태 → 설계·되먹임·본문. 화면과 시험이 같이 쓴다 */
export function compute(state: WriteState): OfflineOutcome {
  const empty: OfflineOutcome = { missing: [], error: null, netNote: null, rows: [], total: null, period: null, rate: null, minimumWage: null, findings: [], doc: null };
  const parsed = toWriteForm(state);
  if (!parsed.form) return { ...empty, missing: parsed.missing, error: parsed.error ?? null };
  try {
    const design = designFromForm(parsed.form);
    const review = reviewWritten(parsed.form, design);
    return {
      ...empty,
      netNote: parsed.netNote ?? null,
      rows: design.items.map((i) => ({ label: i.label, hours: i.hours, amount: i.amount, absorbs: i.absorbs })),
      total: design.total,
      period: design.period,
      rate: design.rate,
      minimumWage: review.minimumWage,
      findings: review.problems,
      doc: buildContractDocument(parsed.form, design),
    };
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : String(e) };
  }
}

export { buildContractHwpx, buildContractPdf, buildContractXlsx, INITIAL };

export function buildLine(): string {
  const b = typeof __CW_BUILD__ === 'undefined' ? { date: '-', sha: '-' } : __CW_BUILD__;
  return `빌드 ${b.date} · 커밋 ${b.sha}`;
}

// ── 화면 ────────────────────────────────────────────────────────────

type Field =
  | { key: keyof WriteState; label: string; kind: 'text' | 'date' | 'time'; hint?: string; when?: (s: WriteState) => boolean }
  | { key: keyof WriteState; label: string; kind: 'select'; options: Array<[string, string]>; hint?: string; when?: (s: WriteState) => boolean };

const monthly = (s: WriteState) => s.payType === 'monthly';
const absorbKeys = (s: WriteState): ItemKey[] =>
  s.payType === 'hourly' ? ['base', 'weeklyHoliday', 'overtime', 'night', 'leave', 'holiday'] : ['base', 'overtime', 'night', 'holiday', 'leave'];

const FIELDS: Field[] = [
  { key: 'workplaceName', label: '사업체명', kind: 'text' },
  { key: 'ownerName', label: '대표자', kind: 'text' },
  { key: 'employeeName', label: '근로자 성명', kind: 'text' },
  { key: 'fivePlus', label: '상시 근로자', kind: 'select', options: [['yes', '5명 이상'], ['no', '5명 미만']] },
  { key: 'startDate', label: '계약 시작일', kind: 'date' },
  { key: 'endDate', label: '계약 종료일', kind: 'date', hint: '비우면 기간의 정함이 없는 계약' },
  { key: 'writtenDate', label: '작성일', kind: 'date', hint: '비우면 오늘. 서명 날짜로 적습니다' },
  { key: 'location', label: '근무장소', kind: 'text' },
  { key: 'duty', label: '업무', kind: 'text' },
  { key: 'probation', label: '수습기간', kind: 'select', options: [['none', '없음'], ['yes', '있음']] },
  { key: 'probationMonths', label: '수습 개월 수', kind: 'text', when: (s) => s.probation === 'yes' },
  { key: 'probationReduced', label: '처음 3개월 임금 90%', kind: 'select', options: [['no', '아니오'], ['yes', '예']], hint: '1년 이상 계약만 가능(최저임금법 제5조 제2항)', when: (s) => s.probation === 'yes' },
  { key: 'simpleLabor', label: '단순노무 업무', kind: 'select', options: [['no', '아니오'], ['yes', '예']], when: (s) => s.probation === 'yes' },
  { key: 'start', label: '출근 시각', kind: 'time' },
  { key: 'end', label: '퇴근 시각', kind: 'time' },
  { key: 'breakMinutes', label: '하루 휴게시간(분)', kind: 'text' },
  { key: 'weeklyRestDay', label: '주휴일', kind: 'select', options: WEEK_DAYS.map((d) => [d, `매주 ${d}요일`]), hint: '근무 요일이 아닌 요일 하나' },
  { key: 'holidayDaysPerYear', label: '연간 공휴일 근무 예정 일수', kind: 'text' },
  { key: 'payType', label: '임금 형태', kind: 'select', options: [['monthly', '월급 정직원'], ['hourly', '시급·일급 파트']] },
  { key: 'amountMode', label: '금액 넣는 방식', kind: 'select', options: [['gross', '월 총액(세전)'], ['net', '월 실수령액']], when: monthly },
  { key: 'monthlyTotal', label: '월 임금 총액(원)', kind: 'text', when: (s) => monthly(s) && s.amountMode === 'gross' },
  { key: 'netPay', label: '월 실수령액(원)', kind: 'text', when: (s) => monthly(s) && s.amountMode === 'net' },
  { key: 'family', label: '공제대상가족 수(본인 포함)', kind: 'text', when: (s) => monthly(s) && s.amountMode === 'net' },
  { key: 'hourlyWage', label: '시간당 지급액(원)', kind: 'text', hint: '휴게시간을 포함한 출근~퇴근 시간에 곱합니다', when: (s) => !monthly(s) },
  { key: 'rounding', label: '금액 단위', kind: 'select', options: [['won', '원 단위(반올림)'], ['ceil10', '10원 단위 올림'], ['ceil100', '100원 단위 올림']], hint: '올리면 잔액은 기본급이 받습니다' },
  { key: 'absorbInto', label: '끝에 남는 금액을 넣을 항목', kind: 'select', options: [] },
  { key: 'payday', label: '임금 지급일', kind: 'text' },
  { key: 'paymentMethod', label: '지급방법', kind: 'text' },
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
const hoursText = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString('ko-KR')}시간`;

function fontBytes(): Uint8Array {
  const b64 = (document.getElementById('cw-font')?.textContent ?? '').trim();
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function download(bytes: Uint8Array, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function mount(): void {
  const form = document.getElementById('cw-form');
  const out = document.getElementById('cw-result');
  const build = document.getElementById('cw-build');
  if (!form || !out) return;
  if (build) build.textContent = buildLine();
  const state: WriteState = { ...INITIAL, workDays: [...INITIAL.workDays] };

  const renderForm = () => {
    form.replaceChildren();
    const days = el('div', 'field');
    days.appendChild(el('span', 'label', '근무 요일'));
    const group = el('div', 'days');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', '근무 요일');
    for (const d of WEEK_DAYS) {
      const b = el('button', state.workDays.includes(d) ? 'on' : '', d);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(state.workDays.includes(d)));
      b.addEventListener('click', () => {
        state.workDays = state.workDays.includes(d) ? state.workDays.filter((x) => x !== d) : [...state.workDays, d];
        renderForm();
        renderResult();
      });
      group.appendChild(b);
    }
    days.appendChild(group);
    for (const f of FIELDS) {
      if (f.when && !f.when(state)) continue;
      const wrap = el('label', 'field');
      wrap.appendChild(el('span', 'label', f.label));
      if (f.hint) wrap.appendChild(el('span', 'hint', f.hint));
      if (f.kind === 'select') {
        const sel = el('select');
        sel.setAttribute('aria-label', f.label);
        const options = f.key === 'absorbInto' ? absorbKeys(state).map((k) => [k, state.payType === 'hourly' && k === 'base' ? '기본급' : ITEM_LABEL[k]]) : f.options;
        for (const [v, t] of options) {
          const o = el('option', '', t);
          o.value = v;
          sel.appendChild(o);
        }
        sel.value = String(state[f.key]);
        sel.addEventListener('change', () => {
          (state as unknown as Record<string, string>)[f.key] = sel.value;
          if (f.key === 'payType' || (f.key === 'rounding' && sel.value !== 'won')) state.absorbInto = 'base';
          renderForm();
          renderResult();
        });
        wrap.appendChild(sel);
      } else {
        const input = el('input');
        input.setAttribute('aria-label', f.label);
        input.type = f.kind;
        input.value = String(state[f.key] ?? '');
        input.addEventListener('input', () => {
          (state as unknown as Record<string, string>)[f.key] = input.value;
          renderResult();
        });
        wrap.appendChild(input);
      }
      if (f.key === 'start') form.appendChild(days);
      form.appendChild(wrap);
    }
  };

  const renderResult = () => {
    out.replaceChildren(el('h2', '', '임금 구성'));
    const r = compute(state);
    if (r.error) return void out.appendChild(el('p', 'warn', r.error));
    if (!r.doc) return void out.appendChild(el('p', 'sub', `입력이 필요합니다: ${r.missing.join(', ')}`));
    if (r.netNote) out.appendChild(el('p', '', r.netNote));
    const table = el('table');
    const head = el('tr');
    for (const t of ['항목', r.period === 'day' ? '하루 인정시간' : '월 인정시간', '금액']) head.appendChild(el('th', '', t));
    table.appendChild(head);
    for (const row of r.rows) {
      const tr = el('tr');
      tr.appendChild(el('td', '', `${row.label}${row.absorbs ? '(잔액)' : ''}`));
      tr.appendChild(el('td', 'num', hoursText(row.hours)));
      tr.appendChild(el('td', 'num', won(row.amount)));
      table.appendChild(tr);
    }
    const tot = el('tr', 'total');
    tot.appendChild(el('td', '', '합계'));
    tot.appendChild(el('td', 'num', hoursText(r.rows.reduce((s, x) => s + x.hours, 0))));
    tot.appendChild(el('td', 'num', won(r.total!)));
    table.appendChild(tot);
    out.appendChild(table);
    out.appendChild(el('p', r.minimumWage!.warn ? 'warn' : '', r.minimumWage!.text));
    const fb = el('div', 'feedback');
    fb.appendChild(el('strong', '', '근로계약서 점검 규칙으로 다시 본 결과'));
    if (r.findings.length === 0) fb.appendChild(el('p', '', '손볼 항목이 없습니다.'));
    else {
      const ul = el('ul');
      for (const f of r.findings) ul.appendChild(el('li', '', `${publicText(ruleName(f.rule_code))}: ${f.detail}`));
      fb.appendChild(ul);
    }
    out.appendChild(fb);
    const actions = el('div', 'actions');
    const base = `근로계약서_${state.employeeName.trim() || '작성'}`;
    const doc = r.doc;
    const buttons: Array<[string, () => Promise<void>]> = [
      ['엑셀로 받기', async () => download(await buildContractXlsx(doc), `${base}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')],
      ['한글로 받기', async () => download(await buildContractHwpx(doc), `${base}.hwpx`, 'application/hwp+zip')],
      ['PDF로 받기', async () => download(await buildContractPdf(doc, fontBytes()), `${base}.pdf`, 'application/pdf')],
    ];
    const err = el('p', 'warn');
    for (const [label, fn] of buttons) {
      const b = el('button', 'primary', label);
      b.type = 'button';
      b.addEventListener('click', () => {
        b.disabled = true;
        fn()
          .catch((e) => (err.textContent = `파일을 만들지 못했습니다: ${e instanceof Error ? e.message : String(e)}`))
          .finally(() => (b.disabled = false));
      });
      actions.appendChild(b);
    }
    out.appendChild(actions);
    out.appendChild(err);
  };

  renderForm();
  renderResult();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
}
