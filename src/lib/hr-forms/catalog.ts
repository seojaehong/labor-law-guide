/**
 * 모성보호·일가정 양립 서식 — 칸 정의와 원고(마크다운). 한글(hwpx)은 md-hwpx 엔진이 만든다(사이트·MCP 한 벌).
 * 근거 조문은 법제처 현행 원문으로 확인한 것만 쓴다(조회 2026-11-21):
 *   남녀고용평등법 제18조의2(배우자 출산전후휴가, 2026.9.18 시행)·제18조의3(난임치료휴가)·제19조(육아휴직·단기 육아휴직 ⑥~⑧)
 *   같은 법 시행령 제9조의2·제9조의3·제10조·제11조
 * ★ 주민등록번호 칸은 두지 않는다(생년월일만). ★ 안내 문구는 조문을 옮겨 적을 뿐 결론을 내리지 않는다.
 */
import { addDays, addMonths, diffDays, fmtDate, parseYmd, spanDays } from './dates';

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
      // 1년 이내 = 시작일의 1년 뒤 전날까지, 추가 사유가 있으면 1년 6개월
      if (p[1] >= addMonths(p[0], extra === 'none' ? 12 : 18))
        notes.push(`휴직 기간이 ${spanDays(p[0], p[1])}일입니다. 법 제19조제2항은 육아휴직 기간을 1년 이내로 하고, 같은 항 각 호에 해당하면 6개월 이내에서 추가로 쓸 수 있게 정합니다. 이미 쓴 기간을 포함해 확인하세요.`);
      if (applied) {
        const lead = diffDays(applied, p[0]);
        const short = reason === 'spouse' ? 7 : 30;
        if (lead < short)
          notes.push(
            reason === 'spouse'
              ? `신청일이 휴직 시작 ${lead}일 전입니다. 시행령 제11조제3항제1호의2는 위험 임신 배우자 돌봄의 경우 휴직개시예정일 7일 전까지 신청하도록 정합니다.`
              : `신청일이 휴직 시작 ${lead}일 전입니다. 시행령 제11조제1항은 휴직개시예정일 30일 전까지 신청하도록 정합니다(같은 조 제3항 사유는 7일 전까지). 기한이 지나 신청하면 사업주가 신청일부터 30일 이내에 개시일을 지정해 허용합니다(같은 조 제7항).`,
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
      if (lead < 30) notes.push(`신청일이 휴직 시작 ${lead}일 전입니다. 시행령 제11조제1항은 휴직개시예정일 30일 전까지 신청하도록 정하고, 고용노동부령으로 정하는 긴급한 사유가 있으면 휴직개시예정일까지 신청할 수 있습니다(같은 조 제4항).`);
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
      { key: `p${i}Start`, label: `${i}회차 시작일`, type: 'date', required: i === 1 },
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
      rows.push([`${i}회차`, `${fmtDate(p[0])} ~ ${fmtDate(p[1])} (${spanDays(p[0], p[1])}일)`]);
      if (bd && p[0] < addDays(bd, -50)) notes.push(`${i}회차 시작일이 출산${born ? '일' : ' 예정일'} 50일 전보다 앞섭니다. 법 제18조의2제3항은 배우자 출산예정일 50일 전부터 사용할 수 있게 정합니다.`);
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

// ── 4. 난임치료휴가 신청서 ────────────────────────────
const infertility: HrForm = {
  id: 'infertility-leave',
  title: '난임치료휴가 신청서',
  writer: 'employee',
  summary: '인공수정·체외수정 등 난임치료를 받기 위한 휴가(연간 6일 이내, 현행 최초 2일 유급) 신청서.',
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
    const raw = get(v, 'days').split(/[,\n、\s]+/).filter(Boolean);
    const ds = raw.map(parseYmd);
    const bad = raw.filter((_, i) => !ds[i]);
    if (bad.length) problems.push(`날짜로 읽지 못한 값이 있습니다: ${bad.join(', ')} (YYYY-MM-DD 로 적어 주세요)`);
    const ok = ds.filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime());
    if (ok.length > 6) notes.push(`사용 예정일이 ${ok.length}일입니다. 법 제18조의3제1항은 연간 6일 이내로 정합니다.`);
    notes.push('최초 2일은 유급입니다(법 제18조의3제1항, 2026.11.21. 현행 원문 기준).');
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

export const HR_FORMS: HrForm[] = [childcare, shortChildcare, spouseLeave, infertility, approval, reschedule];
