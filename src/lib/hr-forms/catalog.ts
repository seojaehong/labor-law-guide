/**
 * 모성보호·일가정 양립 서식 — 칸 정의와 원고(마크다운). 한글(hwpx)은 md-hwpx 엔진이 만든다(사이트·MCP 한 벌).
 * 근거 조문은 법제처 현행 원문으로 확인한 것만 쓴다(조회 2026-11-21):
 *   남녀고용평등법 제18조의2(배우자 출산전후휴가, 2026.9.18 시행)·제18조의3(난임치료휴가)·제19조(육아휴직·단기 육아휴직 ⑥~⑧)
 *   같은 법 시행령 제9조의2·제9조의3·제10조·제11조
 * 2차(조회 2026-11-24):
 *   근로기준법(2026.10.8 시행) 제74조제1항·제2항·제4항·제7항·제8항, 같은 법 시행령(2025.10.23 시행) 제43조제1항·제43조의2,
 *   같은 법 시행규칙 제12조의2·제12조의3
 *   남녀고용평등법(2026.9.18 시행) 제19조의2·제19조의3·제19조의4제2항·제22조의2, 같은 법 시행령(2026.9.18 시행) 제15조·제15조의2·제16조의2·제16조의3
 * ★ 주민등록번호 칸은 두지 않는다(생년월일만). ★ 안내 문구는 조문을 옮겨 적을 뿐 결론을 내리지 않는다.
 */
import { addDays, addMonths, diffDays, fmtDate, leadPhrase, parseYmd, periodLastDay, spanDays } from './dates';
import type { CellFill, TextEdit } from '@/lib/md-hwpx/postedit';

export type FieldType = 'text' | 'date' | 'choice' | 'multiline';
export interface Choice { value: string; label: string }
export interface FormField {
  key: string;
  label: string;
  type: FieldType;
  /** true = 늘 필요, 함수 = 다른 칸 값에 따라 */
  required?: boolean | ((v: Values) => boolean);
  options?: Choice[];
  help?: string;
  max?: number;
}
export type Values = Record<string, string>;
export interface Composed { md: string; problems: string[]; notes: string[] }
export interface HrForm {
  id: string;
  title: string;
  /** 누가 쓰는 서식인가 */
  writer: 'employee' | 'employer';
  summary: string;
  basis: string[];
  fields: FormField[];
  compose(v: Values): Composed;
  /** 법정 서식이 있으면 원본 hwpx 칸에 그대로 채운다(원고 md 는 미리보기·검사용) */
  statutory?: { source: string; fill(v: Values): { cells: CellFill[]; edits: TextEdit[] } };
}

const LAW = '「남녀고용평등과 일ㆍ가정 양립 지원에 관한 법률」';
const get = (v: Values, k: string) => (v[k] ?? '').trim();
const date = (v: Values, k: string) => parseYmd(get(v, k));
const D = (v: Values, k: string) => {
  const d = date(v, k);
  return d ? fmtDate(d) : get(v, k);
};
/** 표 칸 안의 글자 — 줄바꿈·세로막대를 표가 깨지지 않게 바꾼다 */
const cell = (s: string) => s.replace(/\|/g, '｜').replace(/\s*\n\s*/g, ' / ');
const table = (rows: [string, string][]) => ['| 구분 | 내용 |', '|---|---|', ...rows.map(([a, b]) => `| ${cell(a)} | ${cell(b || ' ')} |`)].join('\n');
const label = (opts: Choice[], value: string) => opts.find((o) => o.value === value)?.label ?? value;

// ── 공용 칸 ──────────────────────────────────────────
const PERSON: FormField[] = [
  { key: 'name', label: '성명', type: 'text', required: true, max: 40 },
  { key: 'birth', label: '생년월일', type: 'date', required: true, help: '주민등록번호는 적지 않습니다' },
  { key: 'dept', label: '소속', type: 'text', max: 60 },
  { key: 'position', label: '직위(직급)', type: 'text', max: 40 },
];
const COMPANY: FormField = { key: 'company', label: '사업장명', type: 'text', required: true, max: 60 };
const personRows = (v: Values): [string, string][] => [
  ['성명', get(v, 'name')],
  ['생년월일', D(v, 'birth')],
  ['소속', get(v, 'dept')],
  ['직위(직급)', get(v, 'position')],
];
const applicantSig = (v: Values, dateKey: string, role = '신청인') => [D(v, dateKey), '', `${role}  ${get(v, 'name')}  (서명 또는 인)`, '', `${get(v, 'company')} 대표 귀하`];
const employerSig = (v: Values, dateKey: string) => [D(v, dateKey), '', `${get(v, 'company')}`, `대표  ${get(v, 'ceo')}  (서명 또는 인)`, '', `${get(v, 'employee')} 귀하`];
const doc = (title: string, ...parts: (string | string[])[]) => [`# ${title}`, '', ...parts.flatMap((p) => (Array.isArray(p) ? [...p, ''] : [p, '']))].join('\n');

function period(v: Values, a: string, b: string, problems: string[], what: string): [Date, Date] | null {
  const s = date(v, a);
  const e = date(v, b);
  if (!s || !e) return null;
  if (e < s) {
    problems.push(`${what}의 끝나는 날이 시작하는 날보다 앞섭니다.`);
    return null;
  }
  return [s, e];
}

// ── 1. 육아휴직 신청서 ────────────────────────────────
const LEAVE_REASON: Choice[] = [
  { value: 'child', label: '만 8세 이하 또는 초등학교 2학년 이하 자녀 양육' },
  { value: 'pregnant', label: '임신 중 모성 보호' },
  { value: 'spouse', label: '유산·조산 등 위험이 있는 임신 중인 배우자 돌봄' },
];
const EXTRA: Choice[] = [
  { value: 'none', label: '해당 없음' },
  { value: 'both', label: '같은 자녀로 부모가 모두 육아휴직을 각각 3개월 이상 사용' },
  { value: 'single', label: '「한부모가족지원법」 제4조제1호의 부 또는 모' },
  { value: 'disabled', label: '고용노동부령으로 정하는 장애아동의 부 또는 모' },
];
const childcareFields: FormField[] = [
  ...PERSON,
  { key: 'reason', label: '신청 사유', type: 'choice', required: true, options: LEAVE_REASON },
  { key: 'childName', label: '대상 자녀 성명', type: 'text', required: (v) => get(v, 'reason') === 'child', help: '임신 중이면 적지 않습니다', max: 40 },
  { key: 'childBirth', label: '자녀 생년월일(임신 중이면 출산 예정일)', type: 'date', required: true },
  { key: 'start', label: '휴직 시작 예정일', type: 'date', required: true },
  { key: 'end', label: '휴직 종료 예정일', type: 'date', required: true },
  { key: 'extra', label: '6개월 추가 사용 사유(법 제19조제2항)', type: 'choice', options: EXTRA },
  { key: 'appliedOn', label: '신청일', type: 'date', required: true },
  COMPANY,
];
const childcare: HrForm = {
  id: 'childcare-leave',
  title: '육아휴직 신청서',
  writer: 'employee',
  summary: '근로자가 사업주에게 내는 육아휴직 신청서. 위험 임신 배우자 돌봄 사유와 6개월 추가 사용 사유 칸이 있습니다.',
  basis: [`${LAW} 제19조`, '같은 법 시행령 제10조·제11조'],
  fields: childcareFields,
  compose(v) {
    const problems: string[] = [];
    const notes: string[] = [];
    const reason = get(v, 'reason');
    const extra = get(v, 'extra') || 'none';
    const p = period(v, 'start', 'end', problems, '휴직 기간');
    const applied = date(v, 'appliedOn');
    if (p) {
      // 1년 이내 = 시작일의 1년 뒤 전날까지(그 날이 없으면 그 달 말일), 추가 사유가 있으면 1년 6개월
      if (p[1] > periodLastDay(p[0], extra === 'none' ? 12 : 18))
        notes.push(`휴직 기간이 ${spanDays(p[0], p[1])}일입니다. 법 제19조제2항은 육아휴직 기간을 1년 이내로 하고, 같은 항 각 호에 해당하면 6개월 이내에서 추가로 쓸 수 있게 정합니다. 이미 쓴 기간을 포함해 확인하세요.`);
      if (applied) {
        const lead = diffDays(applied, p[0]);
        const short = reason === 'spouse' ? 7 : 30;
        if (lead < short)
          notes.push(
            reason === 'spouse'
              ? `${leadPhrase(lead, '휴직 시작')} 시행령 제11조제3항제1호의2는 위험 임신 배우자 돌봄의 경우 휴직개시예정일 7일 전까지 신청하도록 정합니다.`
              : `${leadPhrase(lead, '휴직 시작')} 시행령 제11조제1항은 휴직개시예정일 30일 전까지 신청하도록 정합니다(같은 조 제3항 사유는 7일 전까지). 기한이 지나 신청하면 사업주가 신청일부터 30일 이내에 개시일을 지정해 허용합니다(같은 조 제7항).`,
          );
      }
    }
    if (extra !== 'none') notes.push('6개월 추가 사용 사유에 해당한다는 사실을 증명하는 서류를 신청서에 첨부해야 합니다(시행령 제11조제1항 후단).');
    notes.push('휴직 시작 예정일 전날까지 계속 근로한 기간이 6개월 미만이면 사업주가 허용하지 않을 수 있습니다(시행령 제10조).');
    const childLabel = reason === 'child' ? '자녀 생년월일' : '출산 예정일';
    const md = doc(
      '육아휴직 신청서',
      table([
        ...personRows(v),
        ['신청 사유', label(LEAVE_REASON, reason)],
        ['대상 자녀 성명', reason === 'child' ? get(v, 'childName') : '(임신 중으로 적지 않음)'],
        [childLabel, D(v, 'childBirth')],
        ['휴직 기간', p ? `${fmtDate(p[0])} ~ ${fmtDate(p[1])} (${spanDays(p[0], p[1])}일)` : `${D(v, 'start')} ~ ${D(v, 'end')}`],
        ['6개월 추가 사용 사유', label(EXTRA, extra) + (extra !== 'none' ? ' (증명 서류 첨부)' : '')],
      ]),
      `${LAW} 제19조와 같은 법 시행령 제11조에 따라 위와 같이 육아휴직을 신청합니다.`,
      applicantSig(v, 'appliedOn'),
    );
    return { md, problems, notes };
  },
};

// ── 2. 단기 육아휴직 신청서 ───────────────────────────
const SHORT_REASON: Choice[] = [
  { value: 'closure', label: '자녀가 다니는 기관의 휴원·휴교' },
  { value: 'vacation', label: '자녀가 다니는 기관의 방학' },
  { value: 'illness', label: '자녀의 질병' },
  { value: 'other', label: '그 밖에 고용노동부령으로 정하는 사유' },
];
const shortChildcare: HrForm = {
  id: 'short-childcare-leave',
  title: '단기 육아휴직 신청서',
  writer: 'employee',
  summary: '자녀 기관의 휴원·방학, 자녀 질병 등으로 1주 또는 2주 쓰는 육아휴직(1년에 1회) 신청서.',
  basis: [`${LAW} 제19조제6항~제8항`, '같은 법 시행령 제11조'],
  fields: [
    ...PERSON,
    { key: 'childName', label: '대상 자녀 성명', type: 'text', required: true, max: 40 },
    { key: 'childBirth', label: '자녀 생년월일', type: 'date', required: true },
    { key: 'reason', label: '신청 사유', type: 'choice', required: true, options: SHORT_REASON },
    { key: 'reasonDetail', label: '사유 설명', type: 'multiline', max: 300, help: '예: ○○유치원 겨울방학(1.5.~1.16.)' },
    { key: 'start', label: '휴직 시작 예정일', type: 'date', required: true },
    { key: 'weeks', label: '기간', type: 'choice', required: true, options: [{ value: '1', label: '1주' }, { value: '2', label: '2주' }] },
    { key: 'appliedOn', label: '신청일', type: 'date', required: true },
    COMPANY,
  ],
  compose(v) {
    const problems: string[] = [];
    const notes: string[] = [];
    const s = date(v, 'start');
    const w = Number(get(v, 'weeks')) || 0;
    const e = s && w ? addDays(s, 7 * w - 1) : null;
    const applied = date(v, 'appliedOn');
    if (s && applied) {
      const lead = diffDays(applied, s);
      if (lead < 30) notes.push(`${leadPhrase(lead, '휴직 시작')} 시행령 제11조제1항은 휴직개시예정일 30일 전까지 신청하도록 정하고, 고용노동부령으로 정하는 긴급한 사유가 있으면 휴직개시예정일까지 신청할 수 있습니다(같은 조 제4항).`);
    }
    notes.push('단기 육아휴직은 1년에 1회, 주 단위로 1주 또는 2주 쓸 수 있고 그 기간은 육아휴직 기간에 포함됩니다(법 제19조제7항).');
    notes.push('방학 기간에 신청이 몰려 사업 운영에 막대한 지장이 있으면 사업주가 근로자와 협의해 시기를 바꿀 수 있고, 이때 사유와 바뀐 기간을 서면으로 알려야 합니다(법 제19조제6항 단서·제8항).');
    const md = doc(
      '단기 육아휴직 신청서',
      table([
        ...personRows(v),
        ['대상 자녀', `${get(v, 'childName')} (${D(v, 'childBirth')} 생)`],
        ['신청 사유', label(SHORT_REASON, get(v, 'reason'))],
        ['사유 설명', get(v, 'reasonDetail')],
        ['휴직 기간', s && e ? `${fmtDate(s)} ~ ${fmtDate(e)} (${w}주)` : D(v, 'start')],
      ]),
      `${LAW} 제19조제6항과 같은 법 시행령 제11조에 따라 위와 같이 단기 육아휴직을 신청합니다.`,
      applicantSig(v, 'appliedOn'),
    );
    return { md, problems, notes };
  },
};

// ── 3. 배우자 출산전후휴가 고지서 ─────────────────────
const PARTS = [1, 2, 3];
const spouseLeave: HrForm = {
  id: 'spouse-maternity-leave',
  title: '배우자 출산전후휴가 고지서',
  writer: 'employee',
  summary: '배우자의 임신·출산으로 쓰는 20일 유급 휴가(2026.9.18.부터 명칭 변경, 출산예정일 50일 전부터 사용, 3회까지 나누어 사용) 고지서.',
  basis: [`${LAW} 제18조의2`, '같은 법 시행령 제9조의2'],
  fields: [
    ...PERSON,
    { key: 'birthState', label: '출산 여부', type: 'choice', required: true, options: [{ value: 'due', label: '출산 예정' }, { value: 'born', label: '출산함' }] },
    { key: 'birthDate', label: '배우자 출산일(또는 출산 예정일)', type: 'date', required: true },
    ...PARTS.flatMap((i): FormField[] => [
      { key: `p${i}Start`, label: `${i}회차 시작일`, type: 'date', required: (v) => i === 1 || !!get(v, `p${i}End`) },
      { key: `p${i}End`, label: `${i}회차 종료일`, type: 'date', required: (v) => i === 1 || !!get(v, `p${i}Start`) },
    ]),
    { key: 'appliedOn', label: '고지일', type: 'date', required: true },
    COMPANY,
  ],
  compose(v) {
    const problems: string[] = [];
    const notes: string[] = [];
    const bd = date(v, 'birthDate');
    const born = get(v, 'birthState') === 'born';
    const rows: [string, string][] = [];
    for (const i of PARTS) {
      if (!get(v, `p${i}Start`) && !get(v, `p${i}End`)) continue;
      const p = period(v, `p${i}Start`, `p${i}End`, problems, `${i}회차`);
      if (!p) continue;
      // 휴가 일수(20일)를 세는 단위는 이 서식에서 정하지 않는다 — 기간만 적는다
      rows.push([`${i}회차`, `${fmtDate(p[0])} ~ ${fmtDate(p[1])}`]);
      // 「출산예정일 50일 전」 — 이미 출산했으면 예정일을 받지 않으므로 견주지 않는다
      if (bd && !born && p[0] < addDays(bd, -50)) notes.push(`${i}회차 시작일이 출산 예정일 50일 전보다 앞섭니다. 법 제18조의2제3항은 배우자 출산예정일 50일 전부터 사용할 수 있게 정합니다.`);
      if (bd && born && p[1] > addDays(bd, 120)) notes.push(`${i}회차 종료일이 출산일부터 120일을 넘습니다. 법 제18조의2제3항은 배우자가 출산한 날부터 120일이 지나면 사용할 수 없게 정합니다.`);
    }
    notes.push('휴가는 20일이고 사용한 기간은 유급입니다. 3회에 한정해 나누어 사용할 수 있습니다(법 제18조의2제1항·제4항).');
    notes.push('사업주는 배우자의 임신 또는 출산 사실을 증명하는 서류를 요구할 수 있습니다(시행령 제9조의2제2항).');
    const md = doc(
      '배우자 출산전후휴가 고지서',
      table([...personRows(v), [born ? '배우자 출산일' : '배우자 출산 예정일', D(v, 'birthDate')], ...rows]),
      `${LAW} 제18조의2와 같은 법 시행령 제9조의2에 따라 위와 같이 배우자 출산전후휴가를 고지합니다.`,
      applicantSig(v, 'appliedOn', '고지인'),
    );
    return { md, problems, notes };
  },
};

/** 날짜 목록 칸(쉼표·줄바꿈·띄어쓰기로 나눔) — 읽지 못한 값·0개·중복은 막고, 해마다 센 일수를 돌려준다.
 * 「연간 N일」은 해마다 센다 — 두 해에 걸친 신청을 합쳐 세지 않는다 */
function dateList(v: Values, key: string, fieldLabel: string, problems: string[]) {
  const raw = get(v, key).split(/[,\n、\s]+/).filter(Boolean);
  const ds = raw.map(parseYmd);
  const bad = raw.filter((_, i) => !ds[i]);
  if (bad.length) problems.push(`날짜로 읽지 못한 값이 있습니다: ${bad.join(', ')} (YYYY-MM-DD 로 적어 주세요)`);
  const ok = ds.filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime());
  if (!bad.length && !ok.length) problems.push(`「${fieldLabel}」에 날짜를 하나 이상 적어 주세요.`);
  const dup = [...new Set(ok.filter((d, i) => i > 0 && d.getTime() === ok[i - 1].getTime()).map(fmtDate))];
  if (dup.length) problems.push(`같은 날짜를 두 번 적었습니다: ${dup.join(', ')}`);
  const perYear = new Map<number, number>();
  for (const d of ok) perYear.set(d.getUTCFullYear(), (perYear.get(d.getUTCFullYear()) ?? 0) + 1);
  return { ok, perYear };
}

// ── 4. 난임치료휴가 신청서 ────────────────────────────
const infertility: HrForm = {
  id: 'infertility-leave',
  title: '난임치료휴가 신청서',
  writer: 'employee',
  summary: '인공수정·체외수정 등 난임치료를 받기 위한 휴가(연간 6일 이내, 2026년 11월 26일까지 최초 2일, 11월 27일부터 최초 4일 유급. 시행 전 사용일도 최초 4일에 포함) 신청서.',
  basis: [`${LAW} 제18조의3`, '같은 법 시행령 제9조의3'],
  fields: [
    ...PERSON,
    { key: 'days', label: '휴가 사용 예정일', type: 'multiline', required: true, help: 'YYYY-MM-DD 를 쉼표나 줄바꿈으로 나눠 적습니다', max: 200 },
    { key: 'appliedOn', label: '신청일', type: 'date', required: true },
    COMPANY,
  ],
  compose(v) {
    const problems: string[] = [];
    const notes: string[] = [];
    const { ok, perYear } = dateList(v, 'days', '휴가 사용 예정일', problems);
    for (const [y, n] of perYear) if (n > 6) notes.push(`${y}년 사용 예정일이 ${n}일입니다. 법 제18조의3제1항은 연간 6일 이내로 정합니다.`);
    notes.push('2026년 11월 26일까지는 최초 2일, 2026년 11월 27일부터 사용한 난임치료휴가는 최초 4일이 유급입니다. 시행 전 이미 사용한 난임치료휴가도 최초 4일에 포함합니다(법 제18조의3제1항, 법률 제21700호 부칙 제2조).');
    notes.push('사업주는 난임치료를 받을 사실을 증명하는 서류를 요구할 수 있습니다(시행령 제9조의3제2항).');
    const md = doc(
      '난임치료휴가 신청서',
      table([...personRows(v), ['사용 예정일', ok.map(fmtDate).join(' · ')], ['일수', `${ok.length}일`]]),
      `${LAW} 제18조의3과 같은 법 시행령 제9조의3에 따라 위와 같이 난임치료휴가를 신청합니다.`,
      '※ 사업주는 이 신청을 처리하면서 알게 된 사실을 신청인의 의사에 반하여 다른 사람에게 누설하여서는 아니 됩니다(법 제18조의3제3항).',
      applicantSig(v, 'appliedOn'),
    );
    return { md, problems, notes };
  },
};

// ── 5. 육아휴직 허용 통지서(사업주) ───────────────────
const approval: HrForm = {
  id: 'childcare-leave-approval',
  title: '육아휴직 허용 통지서',
  writer: 'employer',
  summary: '사업주가 육아휴직을 허용한 사실을 근로자에게 서면으로 알리는 통지서(신청일부터 14일 이내, 7일 전 신청 사유면 3일 이내).',
  basis: [`${LAW} 제19조`, '같은 법 시행령 제11조제5항~제7항'],
  fields: [
    COMPANY,
    { key: 'ceo', label: '대표자 성명', type: 'text', required: true, max: 40 },
    { key: 'employee', label: '근로자 성명', type: 'text', required: true, max: 40 },
    { key: 'dept', label: '소속', type: 'text', max: 60 },
    { key: 'appliedOn', label: '근로자 신청일', type: 'date', required: true },
    { key: 'kind', label: '허용 방식', type: 'choice', required: true, options: [{ value: 'asis', label: '신청한 대로 허용' }, { value: 'designated', label: '신청 기한이 지나 개시일을 지정해 허용(시행령 제11조제7항)' }] },
    { key: 'start', label: '휴직 시작일', type: 'date', required: true },
    { key: 'end', label: '휴직 종료일', type: 'date', required: true },
    { key: 'notifiedOn', label: '통지일', type: 'date', required: true },
  ],
  compose(v) {
    const problems: string[] = [];
    const notes: string[] = [];
    const p = period(v, 'start', 'end', problems, '휴직 기간');
    const a = date(v, 'appliedOn');
    const n = date(v, 'notifiedOn');
    if (a && n && n < a) problems.push('통지일이 근로자 신청일보다 앞섭니다.');
    if (a && n && diffDays(a, n) > 14)
      notes.push(`통지일이 신청일부터 ${diffDays(a, n)}일 뒤입니다. 시행령 제11조제5항은 신청일부터 14일 이내(같은 조 제3항 사유는 3일 이내)에 허용 사실을 알리도록 정하고, 그 기간 안에 알리지 않으면 신청한 대로 허용한 것으로 봅니다(같은 조 제6항).`);
    const designated = get(v, 'kind') === 'designated';
    const md = doc(
      '육아휴직 허용 통지서',
      table([
        ['근로자', `${get(v, 'employee')}${get(v, 'dept') ? ` (${get(v, 'dept')})` : ''}`],
        ['신청일', D(v, 'appliedOn')],
        ['허용 방식', designated ? '신청 기한이 지나 개시일을 지정해 허용' : '신청한 대로 허용'],
        ['휴직 기간', p ? `${fmtDate(p[0])} ~ ${fmtDate(p[1])} (${spanDays(p[0], p[1])}일)` : `${D(v, 'start')} ~ ${D(v, 'end')}`],
      ]),
      `${LAW} 제19조와 같은 법 시행령 제11조${designated ? '제7항' : '제5항'}에 따라 위와 같이 육아휴직을 허용하였음을 알립니다.`,
      employerSig(v, 'notifiedOn'),
    );
    return { md, problems, notes };
  },
};

// ── 6. 단기 육아휴직 시기변경 통지서(사업주) ───────────
const reschedule: HrForm = {
  id: 'short-leave-reschedule',
  title: '단기 육아휴직 시기변경 통지서',
  writer: 'employer',
  summary: '방학 기간에 신청이 몰려 단기 육아휴직 시기를 바꿀 때 사유와 바뀐 기간을 서면으로 알리는 통지서.',
  basis: [`${LAW} 제19조제6항 단서·제8항`],
  fields: [
    COMPANY,
    { key: 'ceo', label: '대표자 성명', type: 'text', required: true, max: 40 },
    { key: 'employee', label: '근로자 성명', type: 'text', required: true, max: 40 },
    { key: 'dept', label: '소속', type: 'text', max: 60 },
    { key: 'fromStart', label: '신청한 시작일', type: 'date', required: true },
    { key: 'fromEnd', label: '신청한 종료일', type: 'date', required: true },
    { key: 'toStart', label: '바뀐 시작일', type: 'date', required: true },
    { key: 'toEnd', label: '바뀐 종료일', type: 'date', required: true },
    { key: 'reason', label: '시기변경 사유', type: 'multiline', required: true, max: 400 },
    { key: 'agreedOn', label: '근로자와 협의한 날', type: 'date' },
    { key: 'notifiedOn', label: '통지일', type: 'date', required: true },
  ],
  compose(v) {
    const problems: string[] = [];
    const notes: string[] = [];
    const f = period(v, 'fromStart', 'fromEnd', problems, '신청한 기간');
    const t = period(v, 'toStart', 'toEnd', problems, '바뀐 기간');
    if (f && t && spanDays(f[0], f[1]) !== spanDays(t[0], t[1])) notes.push(`신청한 기간(${spanDays(f[0], f[1])}일)과 바뀐 기간(${spanDays(t[0], t[1])}일)의 길이가 다릅니다.`);
    notes.push('시기변경은 방학 기간에 신청이 몰려 사업 운영에 막대한 지장이 있는 경우에 한정되고, 근로자와 협의해야 합니다(법 제19조제6항 단서).');
    const md = doc(
      '단기 육아휴직 시기변경 통지서',
      table([
        ['근로자', `${get(v, 'employee')}${get(v, 'dept') ? ` (${get(v, 'dept')})` : ''}`],
        ['신청한 기간', f ? `${fmtDate(f[0])} ~ ${fmtDate(f[1])}` : ''],
        ['바뀐 기간', t ? `${fmtDate(t[0])} ~ ${fmtDate(t[1])}` : ''],
        ['시기변경 사유', get(v, 'reason')],
        ['근로자와 협의한 날', get(v, 'agreedOn') ? D(v, 'agreedOn') : ''],
      ]),
      `${LAW} 제19조제6항 단서와 제8항에 따라 위와 같이 단기 육아휴직 시기를 변경하였음을 알립니다.`,
      employerSig(v, 'notifiedOn'),
    );
    return { md, problems, notes };
  },
};

// ── 7. 출산전후휴가(배우자 출산전후휴가)ㆍ육아휴직 통합 신청서 — 법정 서식(시행규칙 별지 제7호의2) ──
// 칸 주소 = 원본 hwpx 표 0 의 (행, 열). 사업주 확인란은 신청인이 적지 않는다(서식 안내문).
const KIND: Choice[] = [
  { value: 'maternity', label: '출산전후휴가 청구(본인 출산)' },
  { value: 'spouse', label: '배우자 출산전후휴가 고지' },
];
// parseYmd 는 UTC 자정이다 — 현지 시각(getDate)으로 읽으면 UTC 서쪽 PC 에서 하루 당겨진다
const ymdKo = (d: Date | null) => (d ? `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일` : '년     월     일');
const integrated: HrForm = {
  id: 'integrated-leave-application',
  title: '출산전후휴가(배우자 출산전후휴가)ㆍ육아휴직 통합 신청서',
  writer: 'employee',
  summary: '출산전후휴가를 청구하거나 배우자 출산전후휴가를 고지하면서 육아휴직을 함께 신청하는 법정 서식(시행규칙 별지 제7호의2, 2026. 8. 19. 개정)을 원본 그대로 채웁니다.',
  basis: [`${LAW} 제19조`, '같은 법 시행령 제11조제2항', '같은 법 시행규칙 제14조의3·별지 제7호의2서식'],
  fields: [
    { key: 'name', label: '성명', type: 'text', required: true, max: 40 },
    { key: 'birth', label: '생년월일', type: 'date', required: true, help: '주민등록번호는 적지 않습니다' },
    { key: 'address', label: '주소', type: 'text', max: 80 },
    { key: 'phone', label: '연락처', type: 'text', max: 30 },
    { key: 'dept', label: '소속부서', type: 'text', max: 60 },
    { key: 'position', label: '직위(직급)', type: 'text', max: 40 },
    { key: 'childName', label: '대상 자녀(영유아) 성명', type: 'text', help: '신청일 현재 임신 중이면 적지 않습니다', max: 40 },
    { key: 'childBirth', label: '대상 자녀 생년월일(임신 중이면 출산예정일)', type: 'date', required: true },
    { key: 'kind', label: '함께 내는 휴가', type: 'choice', required: true, options: KIND },
    { key: 'leaveStart', label: '휴가 개시 예정일', type: 'date', required: true },
    { key: 'leaveEnd', label: '휴가 종료 예정일', type: 'date', required: true },
    { key: 'leaveDays', label: '휴가 일수(배우자 출산전후휴가)', type: 'text', help: '배우자 출산전후휴가는 고지하는 일수를 숫자로 적습니다. 비우면 빈칸으로 둡니다', max: 3 },
    { key: 'ccStart', label: '육아휴직 개시 예정일', type: 'date', required: true },
    { key: 'ccEnd', label: '육아휴직 종료 예정일', type: 'date', required: true },
    { key: 'appliedOn', label: '신청일', type: 'date', required: true },
  ],
  compose(v) {
    const problems: string[] = [];
    const notes: string[] = [];
    const spouse = get(v, 'kind') === 'spouse';
    const lv = period(v, 'leaveStart', 'leaveEnd', problems, '휴가 기간');
    const cc = period(v, 'ccStart', 'ccEnd', problems, '육아휴직 기간');
    const days = get(v, 'leaveDays');
    if (days && !/^\d{1,3}$/.test(days)) problems.push('「휴가 일수」는 숫자로만 적어 주세요.');
    const applied = date(v, 'appliedOn');
    const child = date(v, 'childBirth');
    if (cc && applied && diffDays(applied, cc[0]) < 30)
      notes.push(`${leadPhrase(diffDays(applied, cc[0]), '육아휴직 시작')} 시행령 제11조제2항 후단은 육아휴직의 신청을 육아휴직개시예정일 30일 전까지 하도록 정합니다(같은 조 제3항 사유는 7일 전까지).`);
    if (cc && child && get(v, 'childName') && cc[0] > addMonths(child, 18))
      notes.push('시행령 제11조제2항의 함께 신청은 자녀 출생 후 18개월 이내에 육아휴직을 시작하려는 경우입니다. 육아휴직 시작일을 확인하세요.');
    if (lv && cc && cc[0] <= lv[1]) notes.push('육아휴직 개시 예정일이 휴가 종료 예정일보다 앞서거나 같습니다. 두 기간을 확인하세요.');
    if (spouse) notes.push('배우자 출산전후휴가는 20일이고 3회에 한정해 나누어 사용할 수 있습니다(법 제18조의2). 나누어 쓰면 각 개시ㆍ종료일을 구분해 적습니다(서식 작성방법 4).');
    notes.push('사업주는 육아휴직을 허용하고, 시행령 제11조제5항의 기간 안에 허용 사실을 서면 또는 문자메시지 등 전자적 방식으로 알려야 합니다(서식 작성방법 5).');
    const md = doc(
      '출산전후휴가(배우자 출산전후휴가)ㆍ육아휴직 통합 신청서',
      table([
        ['성명', get(v, 'name')],
        ['생년월일', D(v, 'birth')],
        ['주소(연락처)', [get(v, 'address'), get(v, 'phone')].filter(Boolean).join(' / ')],
        ['소속부서', get(v, 'dept')],
        ['직위(직급)', get(v, 'position')],
        ['대상 자녀(영유아) 성명', get(v, 'childName')],
        ['대상 자녀 생년월일(출산예정일)', D(v, 'childBirth')],
        [spouse ? '배우자 출산전후휴가 고지 기간' : '출산전후휴가 청구 기간', lv ? `${fmtDate(lv[0])} ~ ${fmtDate(lv[1])}` : ''],
        ['육아휴직 기간', cc ? `${fmtDate(cc[0])} ~ ${fmtDate(cc[1])}` : ''],
      ]),
      '(한글 파일은 법정 서식 별지 제7호의2 원본에 채웁니다.)',
    );
    return { md, problems, notes };
  },
  statutory: {
    source: '남녀고용평등과 일ㆍ가정 양립 지원에 관한 법률 시행규칙 [별지 제7호의2서식] <개정 2026. 8. 19.>',
    fill(v) {
      const spouse = get(v, 'kind') === 'spouse';
      const lv: [Date | null, Date | null] = [date(v, 'leaveStart'), date(v, 'leaveEnd')];
      const cc: [Date | null, Date | null] = [date(v, 'ccStart'), date(v, 'ccEnd')];
      // 원본 칸 글자 모양 그대로(이 서식의 header 는 strikeout shape="3D" 로 저장돼 「꾸밈 없음」 판정에 안 걸린다 — 쪽 그림으로 취소선 없음 확인)
      const at = (row: number, col: number, text: string): CellFill => ({ table: 0, row, col, text, keepChar: true });
      const labeled = (lab: string, val: string) => (val ? `${lab}\n${val}` : lab);
      const mDays = !spouse && lv[0] && lv[1] ? String(spanDays(lv[0], lv[1])) : '';
      const sDays = spouse ? get(v, 'leaveDays') : '';
      const ccDays = cc[0] && cc[1] ? String(spanDays(cc[0], cc[1])) : '';
      const dd = (n: string) => (n ? `( ${n}일)` : '(     일)');
      const cells: CellFill[] = [
        at(3, 1, labeled('성명', get(v, 'name'))),
        at(3, 6, labeled('생년월일', D(v, 'birth'))),
        at(4, 1, get(v, 'address') ? `주소  ${get(v, 'address')}` : '주소'),
        at(5, 1, labeled('소속부서', get(v, 'dept'))),
        at(5, 4, labeled('직위(직급)', get(v, 'position'))),
        at(6, 1, labeled('대상 자녀(영유아) 성명', get(v, 'childName'))),
        at(6, 4, labeled('대상 자녀 생년월일(출산예정일)', D(v, 'childBirth'))),
        at(7, 1, `출산전후휴가 청구 기간 ${dd(mDays)}`),
        at(9, 1, `배우자 출산전후휴가 고지 기간 ${dd(sDays)}`),
        at(11, 1, `육아휴직 기간 ${dd(ccDays)}`),
        // 쓰지 않는 휴가 줄은 원본 그대로(빈 날짜)
        at(8, 2, ymdKo(spouse ? null : lv[0])),
        at(8, 7, ymdKo(spouse ? null : lv[1])),
        at(10, 2, ymdKo(spouse ? lv[0] : null)),
        at(10, 7, ymdKo(spouse ? lv[1] : null)),
        at(12, 2, ymdKo(cc[0])),
        at(12, 7, ymdKo(cc[1])),
      ];
      const ap = date(v, 'appliedOn');
      const edits: TextEdit[] = [
        { old: '      년     월     일', new: `      ${ymdKo(ap)}` },
        { old: '신청인                   (인)', new: `신청인        ${get(v, 'name')}        (인)` },
      ];
      if (get(v, 'phone')) edits.push({ old: '(연락처:                                          )', new: `(연락처: ${get(v, 'phone')})` });
      return { cells, edits };
    },
  },
};

// ═══ 2차(261124) — 법정 서식 없음(근로기준법 시행규칙 서식 23건·남녀고용평등법 시행규칙 서식 9건에 해당 서식 없음) → 사내 서식 ═══
const LSA = '「근로기준법」';
/** 시각 HH:MM(0:00~23:59) → 분. 형식이 아니면 null */
function minutes(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
/** 근무 시작·종료 시각 검사 — 형식, 종료가 시작보다 늦어야 함 */
function workHours(v: Values, problems: string[]) {
  const a = minutes(get(v, 'workStart'));
  const b = minutes(get(v, 'workEnd'));
  if (get(v, 'workStart') && a === null) problems.push('「근무 시작 시각」은 09:00 처럼 적어 주세요.');
  if (get(v, 'workEnd') && b === null) problems.push('「근무 종료 시각」은 18:00 처럼 적어 주세요.');
  if (a !== null && b !== null && b <= a) problems.push('근무 종료 시각이 근무 시작 시각보다 늦어야 합니다.');
}
const WORK_TIME: FormField[] = [
  { key: 'workStart', label: '근무 시작 시각', type: 'text', required: true, help: '단축 기간 중. 예: 10:00', max: 5 },
  { key: 'workEnd', label: '근무 종료 시각', type: 'text', required: true, help: '단축 기간 중. 예: 16:00', max: 5 },
];
const periodText = (p: [Date, Date] | null, v: Values, a: string, b: string) => (p ? `${fmtDate(p[0])} ~ ${fmtDate(p[1])} (${spanDays(p[0], p[1])}일)` : `${D(v, a)} ~ ${D(v, b)}`);

// ── 8. 출산전후휴가 신청서 ────────────────────────────
const SPLIT: Choice[] = [
  { value: 'none', label: '해당 없음' },
  { value: 'history', label: '유산·사산의 경험이 있음' },
  { value: 'age40', label: '휴가를 청구할 당시 만 40세 이상' },
  { value: 'risk', label: '유산·사산의 위험이 있다는 의료기관의 진단서를 냄' },
];
const maternity: HrForm = {
  id: 'maternity-leave',
  title: '출산전후휴가 신청서',
  writer: 'employee',
  summary: '임신 중인 근로자가 출산 전과 출산 후를 통해 쓰는 90일(미숙아 100일, 둘 이상 임신 120일) 휴가 신청서. 육아휴직을 함께 신청하려면 통합 신청서(법정 서식)를 씁니다.',
  basis: [`${LSA} 제74조제1항·제2항·제4항`, '같은 법 시행령 제43조제1항', '같은 법 시행규칙 제12조의2'],
  fields: [
    ...PERSON,
    { key: 'birthState', label: '출산 여부', type: 'choice', required: true, options: [{ value: 'due', label: '출산 예정' }, { value: 'born', label: '출산함' }] },
    { key: 'birthDate', label: '출산일(또는 출산 예정일)', type: 'date', required: true },
    { key: 'multiple', label: '임신한 자녀 수', type: 'choice', required: true, options: [{ value: 'single', label: '한 명' }, { value: 'multiple', label: '둘 이상' }] },
    { key: 'premature', label: '미숙아 출산', type: 'choice', options: [{ value: 'no', label: '해당 없음' }, { value: 'yes', label: '미숙아를 출산함(시행규칙 제12조의2)' }] },
    { key: 'start', label: '휴가 시작 예정일', type: 'date', required: true },
    { key: 'end', label: '휴가 종료 예정일', type: 'date', required: true },
    { key: 'split', label: '출산 전 나누어 사용하는 사유(법 제74조제2항)', type: 'choice', options: SPLIT },
    { key: 'splitDetail', label: '나누어 사용하는 기간', type: 'multiline', required: (v) => !!get(v, 'split') && get(v, 'split') !== 'none', help: '예: 2027-01-04 ~ 2027-01-15 / 2027-02-01 ~ 출산 후', max: 300 },
    { key: 'appliedOn', label: '신청일', type: 'date', required: true },
    COMPANY,
  ],
  compose(v) {
    const problems: string[] = [];
    const notes: string[] = [];
    const multiple = get(v, 'multiple') === 'multiple';
    const premature = get(v, 'premature') === 'yes';
    const split = get(v, 'split') || 'none';
    const p = period(v, 'start', 'end', problems, '휴가 기간');
    // 법 제74조제1항 — 둘 이상 임신 120일, 미숙아 100일, 그 밖 90일
    const allowed = multiple ? 120 : premature ? 100 : 90;
    const after = multiple ? 60 : 45;
    if (p && split === 'none' && spanDays(p[0], p[1]) !== allowed)
      notes.push(`휴가 기간이 ${spanDays(p[0], p[1])}일입니다. 법 제74조제1항은 출산 전과 출산 후를 통하여 ${allowed}일(${multiple ? '한 번에 둘 이상 자녀를 임신한 경우' : premature ? '미숙아를 출산한 경우' : '미숙아 출산·둘 이상 임신이 아닌 경우'})의 출산전후휴가를 주도록 정합니다.`);
    // 출산일이 출산 후 기간에 들어가는지는 조문이 정하지 않아 날짜로 견주지 않는다
    notes.push(`휴가 기간의 배정은 출산 후에 ${after}일 이상이 되어야 합니다(법 제74조제1항 후단). 실제 출산일이 예정일과 다르면 종료일을 다시 확인하세요.`);
    if (premature) notes.push('미숙아의 출산으로 100일의 휴가를 받으려면 출산전후휴가 종료예정일 7일 전까지 미숙아 출산 사실을 증명하는 서류를 사업주에게 내야 합니다(시행규칙 제12조의2제2항). 미숙아의 범위는 같은 조 제1항이 정합니다.');
    if (split !== 'none')
      notes.push(`시행령 제43조제1항 각 호의 사유가 있으면 출산 전 어느 때라도 휴가를 나누어 사용할 수 있고, 출산 후의 휴가 기간은 연속하여 ${after}일 이상이 되어야 합니다(법 제74조제2항).`);
    notes.push(`휴가 중 최초 ${multiple ? 75 : 60}일은 유급입니다(법 제74조제4항).`);
    notes.push('육아휴직을 함께 신청하려면 법정 서식인 출산전후휴가(배우자 출산전후휴가)ㆍ육아휴직 통합 신청서를 씁니다(남녀고용평등법 시행령 제11조제2항).');
    const born = get(v, 'birthState') === 'born';
    const md = doc(
      '출산전후휴가 신청서',
      table([
        ...personRows(v),
        [born ? '출산일' : '출산 예정일', D(v, 'birthDate')],
        ['임신한 자녀 수', multiple ? '둘 이상' : '한 명'],
        ['미숙아 출산', premature ? '미숙아를 출산함(증명 서류 제출)' : '해당 없음'],
        ['휴가 기간', periodText(p, v, 'start', 'end')],
        ['출산 전 나누어 사용하는 사유', label(SPLIT, split)],
        ...(split !== 'none' ? ([['나누어 사용하는 기간', get(v, 'splitDetail')]] as [string, string][]) : []),
      ]),
      `${LSA} 제74조에 따라 위와 같이 출산전후휴가를 신청합니다.`,
      applicantSig(v, 'appliedOn'),
    );
    return { md, problems, notes };
  },
};

// ── 9. 임신기 근로시간 단축 신청서 ─────────────────────
const pregnancyHours: HrForm = {
  id: 'pregnancy-hours-reduction',
  title: '임신기 근로시간 단축 신청서',
  writer: 'employee',
  summary: '임신 12주 이내 또는 32주 이후(유산·조산 등 위험이 있으면 임신 전 기간)인 근로자가 1일 2시간 근로시간 단축을 신청하는 서식.',
  basis: [`${LSA} 제74조제7항·제8항`, '같은 법 시행령 제43조의2', '같은 법 시행규칙 제12조의3·별표 3'],
  fields: [
    ...PERSON,
    { key: 'dueDate', label: '출산 예정일', type: 'date', required: true },
    { key: 'pregWeeks', label: '단축 시작일의 임신 주수', type: 'text', required: true, help: '숫자만. 예: 10', max: 2 },
    { key: 'risk', label: '유산·조산 등 위험', type: 'choice', required: true, options: [{ value: 'none', label: '해당 없음' }, { value: 'risk', label: '시행규칙 별표 3의 질환이 있음(임신 전 기간 신청)' }] },
    { key: 'start', label: '단축 시작 예정일', type: 'date', required: true },
    { key: 'end', label: '단축 종료 예정일', type: 'date', required: true },
    ...WORK_TIME,
    { key: 'again', label: '신청 차수', type: 'choice', required: true, options: [{ value: 'first', label: '이번 임신으로 처음 신청(진단서 첨부)' }, { value: 'again', label: '같은 임신으로 다시 신청' }] },
    { key: 'appliedOn', label: '신청일', type: 'date', required: true },
    COMPANY,
  ],
  compose(v) {
    const problems: string[] = [];
    const notes: string[] = [];
    const p = period(v, 'start', 'end', problems, '단축 기간');
    workHours(v, problems);
    const wk = get(v, 'pregWeeks');
    if (wk && !/^\d{1,2}$/.test(wk)) problems.push('「단축 시작일의 임신 주수」는 숫자로만 적어 주세요.');
    const applied = date(v, 'appliedOn');
    if (p && applied && diffDays(applied, p[0]) < 3)
      notes.push(`${leadPhrase(diffDays(applied, p[0]), '단축 시작')} 시행령 제43조의2는 근로시간 단축 개시 예정일의 3일 전까지 신청하도록 정합니다.`);
    // 적은 주수만 견준다 — 출산 예정일로 주수를 계산하지 않는다
    const n = /^\d{1,2}$/.test(wk) ? Number(wk) : null;
    if (n !== null && get(v, 'risk') !== 'risk' && n > 12 && n < 32)
      notes.push(`단축 시작일의 임신 주수가 ${n}주입니다. 법 제74조제7항은 임신 후 12주 이내 또는 32주 이후인 근로자(시행규칙 별표 3의 유산·조산 등 위험이 있으면 임신 전 기간)의 신청을 허용하도록 정합니다.`);
    notes.push('1일 2시간의 근로시간 단축입니다. 1일 근로시간이 8시간 미만이면 1일 근로시간이 6시간이 되도록 단축을 허용할 수 있습니다(법 제74조제7항 단서).');
    notes.push('근로시간 단축을 이유로 임금을 삭감할 수 없습니다(법 제74조제8항).');
    if (get(v, 'again') !== 'again') notes.push('처음 신청할 때는 의사의 진단서를 첨부합니다(시행령 제43조의2, 같은 임신으로 다시 신청하면 첨부하지 않음).');
    const md = doc(
      '임신기 근로시간 단축 신청서',
      table([
        ...personRows(v),
        ['출산 예정일', D(v, 'dueDate')],
        ['단축 시작일의 임신 주수', wk ? `${wk}주` : ''],
        ['유산·조산 등 위험', get(v, 'risk') === 'risk' ? '시행규칙 별표 3의 질환이 있음' : '해당 없음'],
        ['단축 기간', periodText(p, v, 'start', 'end')],
        ['단축 중 근무 시각', `${get(v, 'workStart')} ~ ${get(v, 'workEnd')}`],
        ['첨부', get(v, 'again') === 'again' ? '같은 임신으로 다시 신청(진단서 생략)' : '의사의 진단서'],
      ]),
      `${LSA} 제74조제7항과 같은 법 시행령 제43조의2에 따라 위와 같이 근로시간 단축을 신청합니다.`,
      applicantSig(v, 'appliedOn'),
    );
    return { md, problems, notes };
  },
};

// ── 10. 육아기 근로시간 단축 신청서 ────────────────────
const HOURS = /^\d{1,2}(\.\d)?$/;
const childcareHours: HrForm = {
  id: 'childcare-hours-reduction',
  title: '육아기 근로시간 단축 신청서',
  writer: 'employee',
  summary: '만 12세 이하 또는 초등학교 6학년 이하 자녀를 양육하려고 주 15~35시간으로 근로시간을 줄이는 신청서(1년 이내, 쓰지 않은 육아휴직 기간의 두 배를 더할 수 있음).',
  basis: [`${LAW} 제19조의2·제19조의3·제19조의4제2항`, '같은 법 시행령 제15조·제15조의2'],
  fields: [
    ...PERSON,
    { key: 'childName', label: '대상 자녀 성명', type: 'text', required: true, max: 40 },
    { key: 'childBirth', label: '자녀 생년월일', type: 'date', required: true },
    { key: 'start', label: '단축 시작 예정일', type: 'date', required: true },
    { key: 'end', label: '단축 종료 예정일', type: 'date', required: true },
    { key: 'weeklyBefore', label: '단축 전 주 소정근로시간', type: 'text', help: '숫자만. 예: 40', max: 4 },
    { key: 'weeklyAfter', label: '단축 후 주 근로시간', type: 'text', required: true, help: '숫자만. 예: 30', max: 4 },
    ...WORK_TIME,
    { key: 'schedule', label: '요일별 근무 방식', type: 'multiline', help: '요일마다 다르면 적습니다. 예: 월~금 10:00~17:00(휴게 1시간)', max: 300 },
    { key: 'appliedOn', label: '신청일', type: 'date', required: true },
    COMPANY,
  ],
  compose(v) {
    const problems: string[] = [];
    const notes: string[] = [];
    const p = period(v, 'start', 'end', problems, '단축 기간');
    workHours(v, problems);
    for (const [k, lab] of [['weeklyBefore', '단축 전 주 소정근로시간'], ['weeklyAfter', '단축 후 주 근로시간']] as const)
      if (get(v, k) && !HOURS.test(get(v, k))) problems.push(`「${lab}」은(는) 숫자로만 적어 주세요(소수는 한 자리).`);
    const after = HOURS.test(get(v, 'weeklyAfter')) ? Number(get(v, 'weeklyAfter')) : null;
    if (after !== null && (after < 15 || after > 35))
      notes.push(`단축 후 주 근로시간이 ${after}시간입니다. 법 제19조의2제3항은 단축 후 근로시간이 주당 15시간 이상이어야 하고 35시간을 넘어서는 아니 된다고 정합니다.`);
    const applied = date(v, 'appliedOn');
    if (p) {
      if (applied && diffDays(applied, p[0]) < 30)
        notes.push(`${leadPhrase(diffDays(applied, p[0]), '단축 시작')} 시행령 제15조제1항은 단축개시예정일 30일 전까지 신청하도록 정합니다. 기한이 지나 신청하면 사업주가 신청일부터 30일 이내로 단축 개시일을 지정해 허용합니다(같은 조 제2항).`);
      if (p[1] > periodLastDay(p[0], 12))
        notes.push(`단축 기간이 ${spanDays(p[0], p[1])}일입니다. 법 제19조의2제4항은 육아기 근로시간 단축 기간을 1년 이내로 하고, 육아휴직 기간 중 쓰지 않은 기간이 있으면 그 기간의 두 배를 더한 기간 이내로 정합니다. 이미 쓴 기간을 포함해 확인하세요.`);
      if (p[1] < periodLastDay(p[0], 1))
        notes.push('나누어 사용하는 1회의 기간은 1개월 이상이어야 합니다(법 제19조의4제2항, 근로계약기간 만료로 1개월 이상 쓸 수 없는 기간제근로자는 남은 근로계약기간).');
    }
    notes.push('단축개시예정일 전날까지 계속 근로한 기간이 6개월 미만이면 사업주가 허용하지 않을 수 있습니다(시행령 제15조의2제1호).');
    notes.push('단축 후 근로시간을 포함한 근로조건은 사업주와 근로자가 서면으로 정합니다(법 제19조의3제2항).');
    const md = doc(
      '육아기 근로시간 단축 신청서',
      table([
        ...personRows(v),
        ['대상 자녀', `${get(v, 'childName')} (${D(v, 'childBirth')} 생)`],
        ['단축 기간', periodText(p, v, 'start', 'end')],
        ['주 근로시간', `${get(v, 'weeklyBefore') ? `단축 전 ${get(v, 'weeklyBefore')}시간 → ` : ''}단축 후 ${get(v, 'weeklyAfter')}시간`],
        ['단축 중 근무 시각', `${get(v, 'workStart')} ~ ${get(v, 'workEnd')}`],
        ['요일별 근무 방식', get(v, 'schedule')],
      ]),
      `${LAW} 제19조의2와 같은 법 시행령 제15조에 따라 위와 같이 육아기 근로시간 단축을 신청합니다.`,
      applicantSig(v, 'appliedOn'),
    );
    return { md, problems, notes };
  },
};

// ── 11·12. 가족돌봄휴직·가족돌봄휴가 신청서 ────────────
const RELATION: Choice[] = [
  { value: 'grandparent', label: '조부모' },
  { value: 'parent', label: '부모' },
  { value: 'spouse', label: '배우자' },
  { value: 'spouseParent', label: '배우자의 부모' },
  { value: 'child', label: '자녀' },
  { value: 'grandchild', label: '손자녀' },
];
const CARE_CAUSE: Choice[] = [
  { value: 'illness', label: '질병' },
  { value: 'accident', label: '사고' },
  { value: 'old', label: '노령' },
];
const FAMILY: FormField[] = [
  { key: 'familyName', label: '돌봄 대상 가족 성명', type: 'text', required: true, max: 40 },
  { key: 'familyBirth', label: '돌봄 대상 가족 생년월일', type: 'date', required: true },
  { key: 'relation', label: '신청인과의 관계', type: 'choice', required: true, options: RELATION },
];
const familyRows = (v: Values): [string, string][] => [['돌봄 대상 가족', `${get(v, 'familyName')} (${D(v, 'familyBirth')} 생, ${label(RELATION, get(v, 'relation'))})`]];
const grand = (v: Values) => ['grandparent', 'grandchild'].includes(get(v, 'relation'));

const familyLeave: HrForm = {
  id: 'family-care-leave',
  title: '가족돌봄휴직 신청서',
  writer: 'employee',
  summary: '가족의 질병·사고·노령으로 그 가족을 돌보려고 쓰는 휴직(연간 최장 90일, 나누어 쓰면 1회 30일 이상) 신청서.',
  basis: [`${LAW} 제22조의2제1항·제4항제1호`, '같은 법 시행령 제16조의2·제16조의3'],
  fields: [
    ...PERSON,
    ...FAMILY,
    { key: 'cause', label: '돌봄 사유', type: 'choice', required: true, options: CARE_CAUSE },
    { key: 'causeDetail', label: '돌봄이 필요한 사유', type: 'multiline', required: true, max: 400 },
    { key: 'start', label: '휴직 시작 예정일', type: 'date', required: true },
    { key: 'end', label: '휴직 종료 예정일', type: 'date', required: true },
    { key: 'appliedOn', label: '신청일', type: 'date', required: true },
    COMPANY,
  ],
  compose(v) {
    const problems: string[] = [];
    const notes: string[] = [];
    const p = period(v, 'start', 'end', problems, '휴직 기간');
    const applied = date(v, 'appliedOn');
    if (p) {
      if (applied && diffDays(applied, p[0]) < 30)
        notes.push(`${leadPhrase(diffDays(applied, p[0]), '휴직 시작')} 시행령 제16조의2제1항은 돌봄휴직개시예정일 30일 전까지 신청하도록 정합니다. 기한이 지나 신청하면 사업주가 신청일부터 30일 이내로 개시일을 지정해 허용합니다(같은 조 제2항).`);
      const n = spanDays(p[0], p[1]);
      if (n < 30) notes.push(`휴직 기간이 ${n}일입니다. 법 제22조의2제4항제1호는 나누어 사용하는 1회의 기간을 30일 이상으로 정합니다.`);
      if (n > 90) notes.push(`휴직 기간이 ${n}일입니다. 법 제22조의2제4항제1호는 가족돌봄휴직 기간을 연간 최장 90일로 정합니다.`);
    }
    notes.push('같은 해에 이미 쓴 가족돌봄휴직·가족돌봄휴가 기간을 포함해 연간 90일을 확인하세요(가족돌봄휴가 기간은 가족돌봄휴직 기간에 포함, 법 제22조의2제4항제2호 단서).');
    if (grand(v))
      notes.push('조부모·손자녀를 돌보는 경우 신청인 외에도 조부모의 직계비속 또는 손자녀의 직계존속이 있으면 사업주가 허용하지 않을 수 있습니다(그들에게 질병·노령·장애·미성년 등의 사유가 있어 신청인이 돌봐야 하는 경우는 제외, 시행령 제16조의3제1항제3호).');
    notes.push('돌봄휴직개시예정일 전날까지 계속 근로한 기간이 6개월 미만이면 사업주가 허용하지 않을 수 있습니다(시행령 제16조의3제1항제1호).');
    notes.push('사업주는 가족의 건강 상태, 신청인 외의 가족 등의 돌봄 가능 여부 등 필요성을 확인할 수 있는 서류를 요구할 수 있습니다(시행령 제16조의2제3항).');
    const md = doc(
      '가족돌봄휴직 신청서',
      table([
        ...personRows(v),
        ...familyRows(v),
        ['돌봄 사유', label(CARE_CAUSE, get(v, 'cause'))],
        ['돌봄이 필요한 사유', get(v, 'causeDetail')],
        ['휴직 기간', periodText(p, v, 'start', 'end')],
      ]),
      `${LAW} 제22조의2와 같은 법 시행령 제16조의2에 따라 위와 같이 가족돌봄휴직을 신청합니다.`,
      applicantSig(v, 'appliedOn'),
    );
    return { md, problems, notes };
  },
};

const VACATION_CAUSE: Choice[] = [...CARE_CAUSE, { value: 'childcare', label: '자녀의 양육' }];
const familyVacation: HrForm = {
  id: 'family-care-vacation',
  title: '가족돌봄휴가 신청서',
  writer: 'employee',
  summary: '가족의 질병·사고·노령 또는 자녀의 양육으로 긴급하게 가족을 돌보려고 하루 단위로 쓰는 휴가(연간 최장 10일) 신청서.',
  basis: [`${LAW} 제22조의2제2항·제4항제2호`, '같은 법 시행령 제16조의2제4항·제16조의3제2항'],
  fields: [
    ...PERSON,
    ...FAMILY,
    { key: 'cause', label: '돌봄 사유', type: 'choice', required: true, options: VACATION_CAUSE },
    { key: 'days', label: '휴가 사용 예정일', type: 'multiline', required: true, help: 'YYYY-MM-DD 를 쉼표나 줄바꿈으로 나눠 적습니다', max: 400 },
    { key: 'appliedOn', label: '신청일', type: 'date', required: true },
    COMPANY,
  ],
  compose(v) {
    const problems: string[] = [];
    const notes: string[] = [];
    const { ok, perYear } = dateList(v, 'days', '휴가 사용 예정일', problems);
    for (const [y, n] of perYear)
      if (n > 10) notes.push(`${y}년 사용 예정일이 ${n}일입니다. 법 제22조의2제4항제2호는 가족돌봄휴가 기간을 연간 최장 10일로 정합니다(같은 항 제3호에 따라 연장되면 20일, 한부모가족지원법 제4조제1호의 모 또는 부는 25일 이내).`);
    notes.push('가족돌봄휴가 기간은 가족돌봄휴직 기간에 포함됩니다(법 제22조의2제4항제2호 단서). 같은 해에 이미 쓴 날을 포함해 확인하세요.');
    if (grand(v))
      notes.push('조부모·손자녀를 돌보는 경우 신청인 외에도 조부모의 직계비속 또는 손자녀의 직계존속이 있으면 허용 대상에서 빠집니다(그들에게 질병·노령·장애·미성년 등의 사유가 있어 신청인이 돌봐야 하는 경우는 제외, 시행령 제16조의3제2항).');
    notes.push('청구한 시기에 휴가를 주는 것이 정상적인 사업 운영에 중대한 지장을 초래하면 사업주가 근로자와 협의해 시기를 바꿀 수 있습니다(법 제22조의2제2항 단서).');
    const md = doc(
      '가족돌봄휴가 신청서',
      table([
        ...personRows(v),
        ...familyRows(v),
        ['돌봄 사유', label(VACATION_CAUSE, get(v, 'cause'))],
        ['사용 예정일', ok.map(fmtDate).join(' · ')],
        ['일수', `${ok.length}일`],
      ]),
      `${LAW} 제22조의2와 같은 법 시행령 제16조의2제4항에 따라 위와 같이 가족돌봄휴가를 신청합니다.`,
      applicantSig(v, 'appliedOn'),
    );
    return { md, problems, notes };
  },
};

export const HR_FORMS: HrForm[] = [childcare, shortChildcare, spouseLeave, infertility, approval, reschedule, integrated, maternity, pregnancyHours, childcareHours, familyLeave, familyVacation];
