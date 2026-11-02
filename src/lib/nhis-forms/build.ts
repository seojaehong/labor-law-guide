// 건강보험 자격 취득(별지 6호)·상실(별지 8호) 신고서 + 사업주확인서(지연사유)를 한 PDF 로 만든다.
// 사업주가 직접 입력하고 내려받아 직접 제출하는 작성 도구다. 값은 브라우저 메모리에서만 다룬다(서버로 보내지 않는다).
// 서식 위 칸 좌표 = ./maps/*.json (scripts/nhis-forms/build_maps.py, 261102 실측).
// 원칙: 칸이 비거나 잘리거나 글자가 안 그려진 PDF 는 내보내지 않는다 — 전부 PacketError 로 막는다.

import fontkit from '@pdf-lib/fontkit';
import { PDFDocument } from 'pdf-lib';
import { fillForm, type FillReport, type FormMap, type Slot } from './overlay';
import { EDI_LIMIT_BYTES, MAX_PEOPLE, dotted, lossDateOf, parseYmd, todayKst, ymdParts } from './dates';
import lossMap from './maps/NHIS_8_LOSS.json';
import acqMap from './maps/NHIS_6_ACQ.json';

export { lossDateOf, todayKst, MAX_PEOPLE };

export interface Business {
  mgmtNo: string;
  name: string;
  tel?: string;
  fax?: string;
  addr: string;
  zip?: string;
  ownerName: string;
}
export interface LossPerson {
  name: string;
  rrn: string;
  /** 마지막 근무일 YYYY-MM-DD. 상실일은 다음 날 */
  lastWorkDay: string;
  /** 건강보험 상실부호(01 퇴직 등) */
  nhisCode: string;
  payCur?: number;
  monthsCur?: number;
  payPrev?: number;
  monthsPrev?: number;
}
export interface AcqPerson {
  name: string;
  rrn: string;
  /** 자격취득일 YYYY-MM-DD */
  acqDate: string;
  monthlyPay: number;
  /** 건강보험 자격취득부호(00 최초 등) */
  nhisCode: string;
  /** 대표자 여부 — 화면에서 반드시 고른다 */
  ceo: boolean;
}
export type Values = Record<string, string | boolean | undefined>;

/** 사람이 고칠 수 있는 문제 목록. 화면이 그대로 보여 준다 */
export class PacketError extends Error {
  constructor(public problems: string[]) {
    super(problems.join(' / '));
  }
}

const won = (n: number | undefined) => (n === undefined ? undefined : n.toLocaleString('ko-KR'));

function common(biz: Business, now: Date): Values {
  const [y, m, d] = ymdParts(todayKst(now));
  return {
    title_nhis: true,
    biz_mgmt_no: biz.mgmtNo,
    biz_name: biz.name,
    biz_tel: biz.tel,
    biz_fax: biz.fax,
    biz_addr: biz.addr,
    biz_zip: biz.zip,
    date_y: String(y),
    date_m: String(m),
    date_d: String(d),
    reporter_name: biz.ownerName,
  };
}

export function lossValues(biz: Business, people: LossPerson[], now: Date = new Date()): Values {
  const v = common(biz, now);
  people.forEach((p, i) => {
    const n = i + 1;
    Object.assign(v, {
      [`seq_${n}`]: String(n),
      [`name_${n}`]: p.name,
      [`rrn_${n}`]: p.rrn,
      [`loss_date_${n}`]: dotted(lossDateOf(p.lastWorkDay)),
      [`nhis_code_${n}`]: p.nhisCode,
      [`nhis_pay_cur_${n}`]: won(p.payCur),
      [`nhis_months_cur_${n}`]: p.monthsCur === undefined ? undefined : String(p.monthsCur),
      [`nhis_pay_prev_${n}`]: won(p.payPrev),
      [`nhis_months_prev_${n}`]: p.monthsPrev === undefined ? undefined : String(p.monthsPrev),
    });
  });
  return v;
}

export function acqValues(biz: Business, people: AcqPerson[], now: Date = new Date()): Values {
  const v = common(biz, now);
  people.forEach((p, i) => {
    const n = i + 1;
    // 6호는 구분 칸에 1~4 가 인쇄돼 있어 번호를 찍지 않는다
    Object.assign(v, {
      [`name_${n}`]: p.name,
      [`rrn_${n}`]: p.rrn,
      [`ceo_yes_${n}`]: p.ceo,
      [`ceo_no_${n}`]: !p.ceo,
      [`monthly_pay_${n}`]: won(p.monthlyPay),
      [`acq_date_${n}`]: dotted(p.acqDate),
      [`nhis_on_${n}`]: true,
      [`nhis_code_${n}`]: p.nhisCode,
    });
  });
  return v;
}

// ── 사업주확인서(지연사유, 2쪽) ───────────────────────────────────
// 문안 구성 = 사무소 정본 「사업주확인서(피보험자격 상실신고 지연사유)」(/상실신고서류 템플릿, 문안만 따름 — 그 xlsx 의 도장은 쓰지 않는다).
// 주민등록번호 전체 대신 생년월일만 싣는다(신고서 1쪽에 이미 있다).
export interface StatementInput {
  kind: 'loss' | 'acq';
  biz: Business;
  /** 성명·주민등록번호(생년월일만 뽑아 쓴다)·상실일(또는 취득일) YYYY-MM-DD */
  people: { name: string; rrn: string; date: string }[];
  reason: string;
  branchName?: string;
  now?: Date;
}

/** 주민등록번호 앞 7자리 → YYYY.MM.DD. 못 읽으면 빈 글자 */
export function birthOf(rrn: string): string {
  const m = /^(\d{2})(\d{2})(\d{2})-?(\d)/.exec(rrn.trim());
  if (!m) return '';
  const g = Number(m[4]);
  const cent = g === 9 || g === 0 ? 18 : g <= 2 || g === 5 || g === 6 ? 19 : 20;
  return `${cent}${m[1]}.${m[2]}.${m[3]}`;
}

/** 「청주동부지사장」처럼 직함까지 적어도 「지사장장」이 되지 않게 */
export function recipientOf(branchName?: string): string {
  const b = (branchName ?? '').trim().replace(/장$/, '');
  return `수신 : 국민건강보험공단 ${b ? `${b}장` : '관할 지사장'}`;
}

interface Statement {
  title: string;
  sub: string;
  to: string;
  bizHead: string;
  biz: string[];
  peopleHead: string;
  people: string[];
  reasonHead: string;
  reason: string;
  pledge: string;
  date: string;
  owner: string;
}

function statement(s: StatementInput): Statement {
  const what = s.kind === 'loss' ? '자격상실' : '자격취득';
  const dateLabel = s.kind === 'loss' ? '상실일' : '취득일';
  const [y, m, d] = ymdParts(todayKst(s.now));
  return {
    title: '사 업 주 확 인 서',
    sub: `(건강보험 직장가입자 ${what} 신고 지연사유)`,
    to: recipientOf(s.branchName),
    bizHead: '1. 사업장 정보',
    biz: [`사업장명: ${s.biz.name}`, `사업장관리번호: ${s.biz.mgmtNo}`, `소재지: ${s.biz.addr}`],
    peopleHead: '2. 근로자(가입자) 정보',
    people: s.people.map((p, i) => {
      const b = birthOf(p.rrn);
      return `${i + 1}) 성명 ${p.name}${b ? ` · 생년월일 ${b}` : ''} · ${dateLabel} ${dotted(p.date)}`;
    }),
    reasonHead: `3. ${what} 신고 지연사유`,
    reason: s.reason,
    pledge: '위 내용이 사실임을 확인하며, 신고 지연에 대한 책임은 사업주에게 있습니다.',
    date: `${y}년 ${m}월 ${d}일`,
    owner: `사업주(대표자): ${s.biz.ownerName}`,
  };
}

export function delayStatementLines(s: StatementInput): string[] {
  const t = statement(s);
  return [t.title, t.sub, t.to, t.bizHead, ...t.biz, t.peopleHead, ...t.people, t.reasonHead, t.reason, t.pledge, t.date, t.owner];
}

const A4 = { width: 595.28, height: 841.89 };
/** 「(인)」 가운데 x — 도장을 그 위에 찍는다 */
const SEAL_X = 440;

/** 확인서를 2쪽 칸으로 놓는다 */
function statementSlots(t: Statement): { slots: Record<string, Slot>; values: Values; stampY: number } {
  const slots: Record<string, Slot> = {};
  const values: Values = {};
  const L = 72;
  const W = A4.width - 2 * L;
  let y = 105;
  let k = 0;
  const put = (slot: Slot, val: string, dy: number) => {
    const key = `st_${k++}`;
    slots[key] = slot;
    values[key] = val;
    y += dy;
  };
  const line = (val: string, dy: number, x = L, size = 10.5, label?: string) =>
    put({ kind: 'text', page: 2, x, y, size, maxWidth: L + W - x, label }, val, dy);
  line(t.title, 24, L + W / 2 - 70, 18);
  line(t.sub, 40, L + W / 2 - 110, 11);
  line(t.to, 36, L, 11, '수신 지사');
  line(t.bizHead, 22, L, 11);
  for (const b of t.biz) line(b, 19, L + 12, 10.5, '사업장 정보');
  y += 14;
  line(t.peopleHead, 22, L, 11);
  for (const p of t.people) line(p, 19, L + 12, 10.5, '근로자 정보');
  y += 14;
  line(t.reasonHead, 8, L, 11);
  put({ kind: 'multiline', page: 2, x0: L + 8, y0: y, x1: L + W, y1: y + 130, size: 10.5, label: '늦어진 이유' }, t.reason, 150);
  put({ kind: 'multiline', page: 2, x0: L, y0: y, x1: L + W, y1: y + 40, size: 10.5 }, t.pledge, 80);
  line(t.date, 40, L + W / 2 - 40, 11);
  line(t.owner, 0, L + W / 2 - 40, 11, '대표자 성명');
  put({ kind: 'text', page: 2, x: SEAL_X - 9, y, size: 11 }, '(인)', 0);
  return { slots, values, stampY: y - 4 };
}

// ── 입력 검사(경계) ───────────────────────────────────────────────
const digits = (s: string) => s.replace(/[\s-]/g, '');

export function validate(input: PacketInput): string[] {
  const p: string[] = [];
  const b = input.biz;
  if (!/^\d{11}$/.test(digits(b.mgmtNo))) p.push('사업장관리번호 11자리를 적어 주세요');
  if (!b.name.trim()) p.push('사업장 명칭을 적어 주세요');
  if (!b.addr.trim()) p.push('사업장 주소를 적어 주세요');
  if (!b.ownerName.trim()) p.push('대표자 성명을 적어 주세요');
  if (!input.reason.trim()) p.push('늦어진 이유를 적어 주세요');
  if (input.people.length < 1) p.push('대상자를 한 명 이상 적어 주세요');
  if (input.people.length > MAX_PEOPLE) p.push(`한 장에 ${MAX_PEOPLE}명까지 적을 수 있습니다`);
  const people: (LossPerson | AcqPerson)[] = input.people;
  people.forEach((x, i) => {
    const who = `${i + 1}번째 사람`;
    if (!x.name.trim()) p.push(`${who} 성명을 적어 주세요`);
    if (!/^\d{13}$/.test(digits(x.rrn))) p.push(`${who} 주민등록번호 13자리를 확인해 주세요`);
    if (!x.nhisCode) p.push(`${who} 부호를 골라 주세요`);
    if (input.kind === 'loss') {
      const l = x as LossPerson;
      if (!parseYmd(l.lastWorkDay)) p.push(`${who} 마지막 근무일을 확인해 주세요`);
      for (const v of [l.payCur, l.monthsCur, l.payPrev, l.monthsPrev]) {
        if (v !== undefined && !(Number.isInteger(v) && v >= 0)) { p.push(`${who} 보수 총액·근무개월수에는 숫자만 적어 주세요`); break; }
      }
      for (const m of [l.monthsCur, l.monthsPrev]) {
        if (m !== undefined && m > 12) { p.push(`${who} 근무개월수는 12 이하로 적어 주세요`); break; }
      }
    } else {
      const a = x as AcqPerson;
      if (!parseYmd(a.acqDate)) p.push(`${who} 자격취득일을 확인해 주세요`);
      if (!(Number.isInteger(a.monthlyPay) && a.monthlyPay > 0)) p.push(`${who} 월 보수액을 적어 주세요`);
    }
  });
  return p;
}

// ── PDF 묶음 ──────────────────────────────────────────────────────
interface PacketBase {
  biz: Business;
  reason: string;
  branchName?: string;
  now?: Date;
  /** 사업장 도장 PNG(투명 배경, 작게 줄인 것). 신고서 신고인 자리와 확인서 사업주 자리에 찍는다 */
  stamp?: Uint8Array;
}
export type PacketInput = PacketBase & ({ kind: 'loss'; people: LossPerson[] } | { kind: 'acq'; people: AcqPerson[] });
export interface PacketAssets {
  /** kind 에 맞는 서식 PDF(1쪽) */
  formPdf: Uint8Array;
  font: Uint8Array;
}
export interface Packet {
  bytes: Uint8Array;
  report: FillReport;
  /** EDI 첨부 한도 이하인가 */
  withinLimit: boolean;
}

export const FORM_MAPS = { loss: lossMap as FormMap, acq: acqMap as FormMap };

type Fk = ReturnType<typeof fontkit.create>;
const widthAt = (f: Fk, text: string, size: number) => (f.layout(text).advanceWidth / f.unitsPerEm) * size;

/** 글꼴에 글리프가 없는 글자들(공백 제외). 없으면 PDF 에 빈칸으로 조용히 빠진다 */
export function missingGlyphs(fontBytes: Uint8Array, text: string): string[] {
  const f = fontkit.create(fontBytes);
  return [...new Set([...text])].filter((ch) => !/\s/.test(ch) && !f.hasGlyphForCodePoint(ch.codePointAt(0)!));
}

const nfc = (v: Values): Values =>
  Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'string' ? x.normalize('NFC').trim() : x]));

export async function buildPacket(assets: PacketAssets, input: PacketInput): Promise<Packet> {
  const bad = validate(input);
  if (bad.length) throw new PacketError(bad);

  const now = input.now ?? new Date();
  const formValues = input.kind === 'loss' ? lossValues(input.biz, input.people, now) : acqValues(input.biz, input.people, now);
  const st = statementSlots(
    statement({
      ...input,
      now,
      people:
        input.kind === 'loss'
          ? input.people.map((p) => ({ name: p.name, rrn: p.rrn, date: lossDateOf(p.lastWorkDay) }))
          : input.people.map((p) => ({ name: p.name, rrn: p.rrn, date: p.acqDate })),
    }),
  );

  const form = FORM_MAPS[input.kind];
  const map: FormMap = {
    ...form,
    slots: { ...form.slots, ...st.slots },
    stamps: { ...form.stamps, owner: { page: 2, x: SEAL_X, y: st.stampY, size: 42 } },
  };
  const values = nfc({ ...formValues, ...st.values });

  // 지도에 없는 칸 이름 = 코드와 지도가 어긋난 것(조용히 버려진다)
  const unknown = Object.keys(values).filter((k) => !(k in map.slots));
  if (unknown.length) throw new Error(`서식 지도에 없는 칸: ${unknown.join(', ')}`);

  const f = fontkit.create(assets.font);
  const problems: string[] = [];
  const allText = Object.values(values).filter((x): x is string => typeof x === 'string').join('');
  const missing = missingGlyphs(assets.font, allText);
  if (missing.length) problems.push(`서식 글꼴에 없는 글자라 넣을 수 없습니다: ${missing.join(' ')}`);
  // 엔진은 5pt 까지 줄인 뒤에도 넘치면 옆 칸으로 그린다 — 그 전에 막는다
  for (const [k, slot] of Object.entries(map.slots)) {
    const v = values[k];
    if (slot.kind !== 'text' || !slot.maxWidth || typeof v !== 'string' || !v) continue;
    if (widthAt(f, v, 5) > slot.maxWidth) problems.push(`「${slot.label ?? k}」 칸에 비해 글자가 너무 깁니다: ${v.slice(0, 20)}`);
  }
  if (problems.length) throw new PacketError(problems);

  // 서식 1쪽 뒤에 빈 A4 한 장을 붙이고, 확인서를 그 쪽의 칸으로 그린다 → 글꼴을 한 번만 싣는다
  const base = await PDFDocument.load(assets.formPdf);
  base.addPage([A4.width, A4.height]);
  const stamps = input.stamp ? { applicant: input.stamp, owner: input.stamp } : undefined;
  // subset:false — pdf-lib 서브셋은 나눔고딕 글자를 빠뜨려 그리지 못한다(261102 실측). 글꼴은 scripts/nhis-forms/make_font.py 로 미리 줄였다
  const out = await fillForm(await base.save(), map, { fontBytes: assets.font, values, stamps, subset: false });

  const overflow = out.report.shrunk.filter((s) => s.includes('줄 넘침'));
  if (overflow.length) throw new PacketError(['늦어진 이유가 확인서 칸보다 깁니다. 줄여 주세요']);
  return { ...out, withinLimit: out.bytes.length < EDI_LIMIT_BYTES };
}
