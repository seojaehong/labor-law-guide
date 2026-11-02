// 건강보험 자격 취득(별지 6호)·상실(별지 8호) 신고서 + 지연 신고 사유서를 한 PDF 로 만든다.
// 사업주가 직접 입력하고 내려받아 직접 제출하는 작성 도구다. 값은 브라우저 메모리에서만 다룬다(서버로 보내지 않는다).
// 서식 위 칸 좌표 = ./maps/*.json (scripts/nhis-forms/build_maps.py, 261102 실측).

import fontkit from '@pdf-lib/fontkit';
import { PDFDocument } from 'pdf-lib';
import { fillForm, type FormMap, type FillReport, type Slot } from './overlay';
import lossMap from './maps/NHIS_8_LOSS.json';
import acqMap from './maps/NHIS_6_ACQ.json';

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
  ceo?: boolean;
}
export type Values = Record<string, string | boolean | undefined>;

export const MAX_PEOPLE = 4;

function parseYmd(s: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`날짜 형식은 YYYY-MM-DD: ${s}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
const pad = (n: number) => String(n).padStart(2, '0');
const dotted = (ymd: string) => ymd.replace(/-/g, '.');
const won = (n: number | undefined) => (n === undefined ? undefined : n.toLocaleString('ko-KR'));

export function lossDateOf(lastWorkDay: string): string {
  const [y, m, d] = parseYmd(lastWorkDay);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function todayKst(now: Date = new Date()): string {
  const k = new Date(now.getTime() + 9 * 3600_000);
  return `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())}`;
}

function common(biz: Business, now: Date): Values {
  const [y, m, d] = parseYmd(todayKst(now));
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

function guard(n: number) {
  if (n < 1) throw new Error('대상자가 없습니다');
  if (n > MAX_PEOPLE) throw new Error(`한 장에 ${MAX_PEOPLE}명까지 적을 수 있습니다`);
}

export function lossValues(biz: Business, people: LossPerson[], now: Date = new Date()): Values {
  guard(people.length);
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
  guard(people.length);
  const v = common(biz, now);
  people.forEach((p, i) => {
    const n = i + 1;
    // 6호는 구분 칸에 1~4 가 인쇄돼 있어 번호를 찍지 않는다
    Object.assign(v, {
      [`name_${n}`]: p.name,
      [`rrn_${n}`]: p.rrn,
      [`ceo_yes_${n}`]: p.ceo === true,
      [`ceo_no_${n}`]: p.ceo !== true,
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
  const [y, m, d] = parseYmd(todayKst(s.now));
  return {
    title: '사 업 주 확 인 서',
    sub: `(건강보험 직장가입자 ${what} 신고 지연사유)`,
    to: `수신 : 국민건강보험공단 ${s.branchName ? `${s.branchName}장` : '관할 지사장'}`,
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

/** 6개월 이상 늦은 취득은 공단이 입사 시점 입증서류를 요구한다(토탈서비스 10501 실측 260907) — 화면 안내용 */
export const ACQ_LATE_ATTACH_NOTE =
  '6개월 이상 늦은 취득 신고는 입사 시점을 확인할 수 있는 서류(근로계약서, 임금대장, 임금명세서, 급여이체내역 등) 1부를 함께 내야 합니다.';

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
  const line = (val: string, dy: number, x = L, size = 10.5) => put({ kind: 'text', page: 2, x, y, size, maxWidth: L + W - x }, val, dy);
  line(t.title, 24, L + W / 2 - 70, 18);
  line(t.sub, 40, L + W / 2 - 110, 11);
  line(t.to, 36, L, 11);
  line(t.bizHead, 22, L, 11);
  for (const b of t.biz) line(b, 19, L + 12);
  y += 14;
  line(t.peopleHead, 22, L, 11);
  for (const p of t.people) line(p, 19, L + 12);
  y += 14;
  line(t.reasonHead, 8, L, 11);
  put({ kind: 'multiline', page: 2, x0: L + 8, y0: y, x1: L + W, y1: y + 130, size: 10.5 }, t.reason, 150);
  put({ kind: 'multiline', page: 2, x0: L, y0: y, x1: L + W, y1: y + 40, size: 10.5 }, t.pledge, 80);
  line(t.date, 40, L + W / 2 - 40, 11);
  line(t.owner, 0, L + W / 2 - 40, 11);
  put({ kind: 'text', page: 2, x: SEAL_X - 9, y, size: 11 }, '(인)', 0);
  return { slots, values, stampY: y - 4 };
}

export interface PacketInput extends Omit<StatementInput, 'people'> {
  people: LossPerson[] | AcqPerson[];
  /** 사업장 도장 PNG(투명 배경). 신고서 신고인 자리와 사유서 사업주 자리에 찍는다 */
  stamp?: Uint8Array;
}
export interface PacketAssets {
  lossPdf: Uint8Array;
  acqPdf: Uint8Array;
  font: Uint8Array;
}

export async function buildPacket(
  assets: PacketAssets,
  input: PacketInput,
): Promise<{ bytes: Uint8Array; report: FillReport }> {
  const now = input.now ?? new Date();
  const isLoss = input.kind === 'loss';
  const formValues = isLoss
    ? lossValues(input.biz, input.people as LossPerson[], now)
    : acqValues(input.biz, input.people as AcqPerson[], now);
  const st = statementSlots(
    statement({
      ...input,
      now,
      people: isLoss
        ? (input.people as LossPerson[]).map((p) => ({ name: p.name, rrn: p.rrn, date: lossDateOf(p.lastWorkDay) }))
        : (input.people as AcqPerson[]).map((p) => ({ name: p.name, rrn: p.rrn, date: p.acqDate })),
    }),
  );

  // 서식 1쪽 뒤에 빈 A4 한 장을 붙이고, 사유서를 그 쪽의 칸으로 그린다 → 글꼴을 한 번만 싣는다
  const base = await PDFDocument.load(isLoss ? assets.lossPdf : assets.acqPdf);
  base.addPage([A4.width, A4.height]);
  const baseBytes = await base.save();

  const form = (isLoss ? lossMap : acqMap) as unknown as FormMap;
  const map: FormMap = {
    ...form,
    slots: { ...form.slots, ...st.slots },
    stamps: { ...form.stamps, owner: { page: 2, x: SEAL_X, y: st.stampY, size: 42 } },
  };
  const values = { ...formValues, ...st.values };
  const missing = missingGlyphs(assets.font, Object.values(values).filter((x): x is string => typeof x === 'string').join(''));
  if (missing.length) throw new Error(`서식 글꼴에 없는 글자라 넣을 수 없습니다: ${missing.join(' ')}`);
  const stamps = input.stamp ? { applicant: input.stamp, owner: input.stamp } : undefined;
  // subset:false — pdf-lib 서브셋은 나눔고딕 글자를 빠뜨려 그리지 못한다(261102 실측). 글꼴은 scripts/nhis-forms/make_font.py 로 미리 줄였다
  return fillForm(baseBytes, map, { fontBytes: assets.font, values, stamps, subset: false });
}

/** 글꼴에 글리프가 없는 글자들(공백 제외). 없으면 PDF 에 빈칸으로 조용히 빠진다 */
export function missingGlyphs(fontBytes: Uint8Array, text: string): string[] {
  const f = fontkit.create(fontBytes as unknown as Buffer) as unknown as { hasGlyphForCodePoint(c: number): boolean };
  return [...new Set([...text])].filter((ch) => !/\s/.test(ch) && !f.hasGlyphForCodePoint(ch.codePointAt(0)!));
}
