// 취업규칙 신고·변경신고 서류 모델 — render.ts 가 PDF·한글로 그린다.
//   ① 신고서: 근로기준법 시행규칙 제15조, 별지 제15호서식 「취업규칙 [ ]신고서 [ ]변경신고서」(개정 2021. 4. 5.)
//      — 칸·문구는 법제처 서식(국가법령정보센터 별표·서식, 2026-11-03 조회)을 그대로 옮겼다.
//   ② 신·구 조문 대비표: 시행규칙 제15조 제1호 괄호(변경 전과 변경 후의 내용을 비교한 서류) — 변경신고만
//   ③ 의견청취서: 근로기준법 제94조 제1항 본문·제2항, 시행규칙 제15조 제2호
//   ④ 동의서: 근로기준법 제94조 제1항 단서, 시행규칙 제15조 제3호 — 근로자에게 불리한 변경이 있을 때만
// 서명·날인 칸은 비워 둔다(사람이 서명한다). 서명 명단은 빈 줄만 만든다 — 이름을 받지도 넣지도 않는다.
import type { FormBlock, FormCell, FormDoc } from './render';

export interface ReportWorkplace {
  name?: string;
  businessType?: string;
  ownerName?: string;
  bizNo?: string;
  address?: string;
  tel?: string;
  workers?: number;
  male?: number;
  female?: number;
  unionMembers?: number;
}

export interface ReportChange {
  /** 조문 — 예: 제40조(배우자 출산휴가) */
  article: string;
  /** 현행. 비면 신설 */
  before?: string;
  /** 개정안. 비면 삭제 */
  after?: string;
  /** 비고(개정 사유·근거) */
  note?: string;
  /** 근로자에게 불리한 변경 */
  disadvantage?: boolean;
  /** 근거 법령 조문 원문 — 법제처에서 받은 글자 그대로. 대비표 아래 「근거 법령 원문」에 싣는다(비고 칸이 좁아서) */
  lawQuote?: { heading: string; text: string };
}

export interface ReportInput {
  kind: 'new' | 'change';
  workplace: ReportWorkplace;
  /** 의견청취일 또는 동의일 YYYY-MM-DD */
  opinionDate?: string;
  /** 제출할 지방고용노동관서 — 예: 서울지방고용노동청 서울강남지청 */
  office?: string;
  /** 신고서 작성일 YYYY-MM-DD */
  writtenDate: string;
  /** 대리인(선택) */
  agent?: string;
  /** 근로자 과반수로 조직된 노동조합 이름(있을 때만) */
  majorityUnion?: string;
  changes?: ReportChange[];
  /** 시행 예정일 YYYY-MM-DD(선택) */
  effectiveDate?: string;
}

/** 서명 명단은 이 줄 수까지만 만든다 */
export const MAX_SIGN_ROWS = 1000;

const blank = (s: string | undefined) => !(s ?? '').trim();
const isCount = (n: number | undefined) => typeof n === 'number' && Number.isInteger(n) && n >= 0;
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** YYYY-MM-DD 또는 YYYYMMDD → YYYY-MM-DD. 날짜가 아니면 null */
export function isoDate(s: string | undefined): string | null {
  const t = (s ?? '').trim();
  const m = t.match(/^(\d{4})-?(\d{2})-?(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export function dateKo(iso: string): string {
  const m = iso.match(ISO)!;
  return `${+m[1]}년 ${+m[2]}월 ${+m[3]}일`;
}

const bizNoText = (s: string) => {
  const d = s.replace(/\D/g, '');
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : s;
};

/** 비어 있으면 서류를 만들지 않는 칸 */
export function reportBlanks(input: ReportInput): string[] {
  const w = input.workplace ?? {};
  const out: string[] = [];
  const need = (cond: boolean, label: string) => cond && out.push(label);
  need(blank(w.name), '사업장명');
  need(blank(w.businessType), '사업의 종류');
  need(blank(w.ownerName), '대표자 성명');
  need(blank(w.bizNo), '사업자등록번호');
  need(blank(w.address), '소재지');
  need(blank(w.tel), '전화번호');
  need(w.workers === undefined, '근로자수');
  need(w.male === undefined, '근로자수(남)');
  need(w.female === undefined, '근로자수(여)');
  need(w.unionMembers === undefined, '노동조합원수(없으면 0)');
  need(blank(input.opinionDate), '의견청취일 또는 동의일');
  need(blank(input.office), '제출할 지방고용노동관서');
  need(input.kind === 'change' && !(input.changes ?? []).length, '변경 조문(신·구 조문 대비표)');
  return out;
}

/** 형식·앞뒤가 맞지 않는 칸 */
export function reportErrors(input: ReportInput): string[] {
  const w = input.workplace ?? {};
  const out: string[] = [];
  if (!blank(w.bizNo) && w.bizNo!.replace(/\D/g, '').length !== 10) out.push('사업자등록번호는 숫자 10자리입니다.');
  for (const [k, label] of [['workers', '근로자수'], ['male', '근로자수(남)'], ['female', '근로자수(여)'], ['unionMembers', '노동조합원수']] as const) {
    if (w[k] !== undefined && !isCount(w[k])) out.push(`${label}는 0 이상의 정수입니다.`);
  }
  if (isCount(w.workers) && isCount(w.male) && isCount(w.female) && w.male! + w.female! !== w.workers) {
    out.push(`근로자수(${w.workers}명)가 남(${w.male}명)·여(${w.female}명)의 합과 다릅니다.`);
  }
  if (isCount(w.workers) && isCount(w.unionMembers) && w.unionMembers! > w.workers!) out.push('노동조합원수가 근로자수보다 많습니다.');
  if (!blank(input.majorityUnion) && isCount(w.workers) && isCount(w.unionMembers) && w.unionMembers! * 2 <= w.workers!) {
    out.push('근로자 과반수로 조직된 노동조합(majorityUnion)이라면 노동조합원수가 근로자수의 절반을 넘어야 합니다.');
  }
  const written = isoDate(input.writtenDate);
  if (!written) out.push('작성일은 YYYY-MM-DD 날짜입니다.');
  if (!blank(input.opinionDate)) {
    const od = isoDate(input.opinionDate);
    if (!od) out.push('의견청취일 또는 동의일은 YYYY-MM-DD 날짜입니다.');
    else if (written && od > written) out.push('의견청취일 또는 동의일이 신고서 작성일보다 늦습니다. 의견을 먼저 듣고 신고합니다.');
  }
  if (!blank(input.effectiveDate) && !isoDate(input.effectiveDate)) out.push('시행 예정일은 YYYY-MM-DD 날짜입니다.');
  for (const [i, c] of (input.changes ?? []).entries()) {
    if (blank(c.article)) out.push(`변경 조문 ${i + 1}번째의 조문(article)이 비었습니다.`);
    if (blank(c.before) && blank(c.after)) out.push(`변경 조문 ${i + 1}번째(${c.article || '-'})는 현행과 개정안이 모두 비었습니다.`);
  }
  if (input.kind === 'new' && (input.changes ?? []).some((c) => c.disadvantage)) out.push('최초 신고(kind=new)에는 불리한 변경 표시(disadvantage)를 쓰지 않습니다. 변경신고면 kind=change 로 주세요.');
  return out;
}

// ── 서류 ──────────────────────────────────────────────

const h = (text: string, span = 1): FormCell => ({ text, head: true, span });
const v = (text: string, span = 1, align?: FormCell['align']): FormCell => ({ text, span, align });
const box = (on: boolean) => (on ? '[√]' : '[  ]');
const SIGN = '(서명 또는 인)';
/** 사람이 손으로 적을 칸 — 빈 줄 몇 개 */
const writeIn = (lines: number) => Array.from({ length: lines }, () => ' ').join('\n');

/** ① 별지 제15호서식 */
export function reportForm(input: ReportInput): FormDoc {
  const w = input.workplace as Required<ReportWorkplace>;
  const change = input.kind === 'change';
  const blocks: FormBlock[] = [
    { kind: 'text', text: '■ 근로기준법 시행규칙 [별지 제15호서식] <개정 2021. 4. 5.>', size: 'small' },
    { kind: 'space', pt: 4 },
    { kind: 'title', text: `취업규칙  ${box(!change)} 신고서  ${box(change)} 변경신고서` },
    { kind: 'text', text: '※ 색상이 어두운 난은 신고인이 적지 않으며, [  ]에는 해당하는 곳에 √ 표시를 합니다.', size: 'small', gapAfter: 4 },
    { kind: 'table', widths: [1, 1, 1], size: 'small', minRowHeight: 30, rows: [[h('접수번호\n '), h('접수일\n '), h('처리기간\n1일')]] },
    { kind: 'space', pt: 4 },
    {
      kind: 'table',
      widths: [17, 19, 21, 19, 24],
      minRowHeight: 30,
      rows: [
        [h('신고 내용', 5)],
        [h('사업장명'), v(w.name, 2), h('사업의 종류'), v(w.businessType)],
        [h('대표자 성명'), v(w.ownerName, 2), h('사업자등록번호'), v(bizNoText(w.bizNo))],
        [h('소재지'), v(`${w.address}\n(전화번호 : ${w.tel})`, 4)],
        [h('근로자수'), v(`${w.workers}명 (남 ${w.male}명, 여 ${w.female}명)`, 2), h('노동조합원수'), v(`${w.unionMembers}명`)],
        [h('의견청취일 또는 동의일'), v(dateKo(isoDate(input.opinionDate)!), 4)],
      ],
    },
    { kind: 'space', pt: 10 },
    { kind: 'text', text: `「근로기준법」 제93조 및 같은 법 시행규칙 제15조에 따라 위와 같이 취업규칙을 ${box(!change)} 신고 또는 ${box(change)} 변경신고합니다.`, gapAfter: 10 },
    { kind: 'text', text: dateKo(input.writtenDate), align: 'right', gapAfter: 8 },
    { kind: 'text', text: `신고인   ${w.name}  대표 ${w.ownerName}   ${SIGN}`, align: 'right', gapAfter: 4 },
    { kind: 'text', text: `대리인   ${(input.agent ?? '').trim() || '          '}   ${SIGN}`, align: 'right', gapAfter: 12 },
    { kind: 'text', text: `${input.office!.trim()}장 귀하`, size: 'large', gapAfter: 10 },
    {
      kind: 'table',
      widths: [14, 72, 14],
      size: 'small',
      rows: [
        [
          h('첨부서류'),
          v(
            '1. 취업규칙(변경신고를 하는 경우에는 변경 전과 변경 후의 내용을 비교한 서류를 포함합니다) 1부\n' +
              '2. 근로자의 과반수를 대표하는 노동조합 또는 근로자 과반수의 의견을 들었음을 증명하는 자료 1부\n' +
              '3. 근로자의 과반수를 대표하는 노동조합 또는 근로자 과반수의 동의를 받았음을 증명하는 자료(근로자에게 불리하게 변경하는 경우에만 해당합니다) 1부',
          ),
          h('수수료\n없음'),
        ],
      ],
    },
    { kind: 'space', pt: 8 },
    { kind: 'text', text: '처 리 절 차', align: 'center', size: 'small' },
    {
      kind: 'table',
      widths: [1, 1, 1, 1, 1],
      size: 'small',
      minRowHeight: 22,
      rows: [
        [v('신고서 제출', 1, 'center'), v('접 수', 1, 'center'), v('내용검토', 1, 'center'), v('결 재', 1, 'center'), v('통 보\n(변경명령에 한함)', 1, 'center')],
        [h('신고인'), h('지방고용노동청\n(지청)장'), h('지방고용노동청\n(지청)장'), h('지방고용노동청\n(지청)장'), h('지방고용노동청\n(지청)장')],
      ],
    },
  ];
  return { title: change ? '취업규칙 변경신고서' : '취업규칙 신고서', blocks };
}

/** 대비표 행 글자(조문·현행·개정안·비고) — PDF·한글·docx·xlsx 가 같은 행을 쓴다 */
export function comparisonRows(input: ReportInput): string[][] {
  const quoted = quotes(input);
  return (input.changes ?? []).map((c, i) => [
    c.article.trim(),
    (c.before ?? '').trim() || '(신설)',
    (c.after ?? '').trim() || '(삭제)',
    [
      c.disadvantage ? '근로자에게 불리한 변경' : '',
      (c.note ?? '').trim(),
      c.lawQuote ? `근거 법령 원문 ${quoted.findIndex((q) => q.index === i) + 1} 참조` : '',
    ].filter(Boolean).join('\n'),
  ]);
}

/** 대비표 아래에 실을 근거 법령 원문 — 번호는 1부터 */
function quotes(input: ReportInput): { index: number; heading: string; text: string }[] {
  return (input.changes ?? []).flatMap((c, index) => (c.lawQuote ? [{ index, heading: c.lawQuote.heading.trim(), text: c.lawQuote.text.trim() }] : []));
}

/** 대비표 아래 「근거 법령 원문」 줄 — 한 원문마다 머리 한 줄 + 원문 */
export function comparisonQuoteLines(input: ReportInput): string[] {
  return quotes(input).flatMap((q, n) => [`${n + 1}. ${q.heading}`, q.text]);
}

/** ② 신·구 조문 대비표 */
export function comparisonForm(input: ReportInput): FormDoc {
  const w = input.workplace;
  const rows: FormCell[][] = [[h('조문'), h('현행'), h('개정안'), h('비고')], ...comparisonRows(input).map((r) => r.map((t) => v(t)))];
  const qs = quotes(input);
  return {
    title: '취업규칙 신·구 조문 대비표',
    blocks: [
      { kind: 'title', text: '취업규칙 신·구 조문 대비표' },
      { kind: 'text', text: `사업장명: ${w.name}    작성일: ${dateKo(input.writtenDate)}${input.effectiveDate ? `    시행 예정일: ${dateKo(isoDate(input.effectiveDate)!)}` : ''}`, size: 'small', gapAfter: 6 },
      { kind: 'table', widths: [15, 34, 34, 17], headerRows: 1, size: 'small', rows },
      ...(qs.length
        ? [
            { kind: 'space', pt: 10 } as FormBlock,
            { kind: 'text', text: '근거 법령 원문(법제처 국가법령정보에서 받은 글자 그대로)', size: 'normal', gapAfter: 4 } as FormBlock,
            ...qs.flatMap((q, n): FormBlock[] => [
              { kind: 'text', text: `${n + 1}. ${q.heading}`, size: 'small', gapAfter: 2 },
              { kind: 'text', text: q.text, size: 'small', gapAfter: 8 },
            ]),
          ]
        : []),
    ],
  };
}

function subjectRows(input: ReportInput): FormCell[][] {
  const w = input.workplace;
  const change = input.kind === 'change';
  const arts = (input.changes ?? []).map((c) => c.article.trim());
  return [
    [h('사업장명'), v(w.name!, 1), h('대표자'), v(w.ownerName!)],
    [h('대상'), v(change ? `취업규칙 변경 — 변경 조문 ${arts.length}개(붙임 신·구 조문 대비표)\n${arts.join(', ')}` : '취업규칙 작성', 3)],
    ...(input.effectiveDate ? [[h('시행 예정일'), v(dateKo(isoDate(input.effectiveDate)!), 3)]] : []),
  ];
}

/** 근로자 서명 명단 — 빈 줄만(연번만 적는다) */
function signRows(head: string, n: number): FormCell[][] {
  const rows: FormCell[][] = [[h('연번'), h('소속'), h('성명'), h(head), h('서명')]];
  for (let i = 1; i <= Math.min(n, MAX_SIGN_ROWS); i++) rows.push([v(String(i), 1, 'center'), v(''), v(''), v(''), v('')]);
  return rows;
}

/** ③ 의견청취서 — 과반수 노동조합이 있으면 노동조합 의견서, 없으면 근로자 과반수 의견 명단 */
export function opinionForm(input: ReportInput): FormDoc {
  const w = input.workplace;
  const what = input.kind === 'change' ? '변경' : '작성';
  const union = (input.majorityUnion ?? '').trim();
  const date = dateKo(isoDate(input.opinionDate)!);
  const title = `취업규칙 ${what} 의견청취서`;
  const blocks: FormBlock[] = [
    { kind: 'title', text: title },
    { kind: 'table', widths: [16, 34, 16, 34], minRowHeight: 26, rows: [...subjectRows(input), [h('의견청취일'), v(date, 3)]] },
    { kind: 'space', pt: 8 },
  ];
  if (union) {
    blocks.push(
      { kind: 'text', text: `${union}은(는) 위 취업규칙 ${what} 내용을 알려 받고, 「근로기준법」 제94조 제1항에 따라 아래와 같이 의견을 제출합니다.`, gapAfter: 6 },
      { kind: 'table', widths: [16, 84], minRowHeight: 150, rows: [[h('의견'), v(writeIn(6))]] },
      { kind: 'space', pt: 12 },
      { kind: 'text', text: date, align: 'right', gapAfter: 8 },
      { kind: 'text', text: `${union}  대표자            ${SIGN}`, align: 'right', gapAfter: 10 },
      { kind: 'text', text: `${w.name}  대표 ${w.ownerName} 귀하` },
    );
  } else {
    const n = w.workers!;
    blocks.push(
      { kind: 'text', text: `아래 근로자는 위 취업규칙 ${what} 내용을 알려 받고, 「근로기준법」 제94조 제1항에 따라 의견을 제출합니다.`, gapAfter: 4 },
      { kind: 'text', text: `근로자 ${n}명 중 과반수는 ${Math.floor(n / 2) + 1}명 이상입니다. 의견란에는 찬성·반대 또는 의견을 적습니다.`, size: 'small', gapAfter: 6 },
      { kind: 'table', widths: [16, 84], minRowHeight: 80, rows: [[h('근로자 의견\n(모은 의견)'), v(writeIn(4))]] },
      { kind: 'space', pt: 8 },
      { kind: 'table', widths: [8, 22, 20, 30, 20], headerRows: 1, minRowHeight: 22, size: 'small', rows: signRows('의견(찬성·반대·기타)', n) },
      { kind: 'space', pt: 8 },
      { kind: 'text', text: `${w.name}  대표 ${w.ownerName} 귀하` },
    );
  }
  return { title, blocks };
}

/** ④ 불리한 변경 동의서 */
export function consentForm(input: ReportInput): FormDoc {
  const w = input.workplace;
  const union = (input.majorityUnion ?? '').trim();
  const date = dateKo(isoDate(input.opinionDate)!);
  const worse = (input.changes ?? []).filter((c) => c.disadvantage).map((c) => c.article.trim());
  const title = '취업규칙 불리한 변경 동의서';
  const blocks: FormBlock[] = [
    { kind: 'title', text: title },
    {
      kind: 'table',
      widths: [16, 34, 16, 34],
      minRowHeight: 26,
      rows: [...subjectRows(input), [h('불리한 변경 조문'), v(worse.join(', '), 3)], [h('동의일'), v(date, 3)]],
    },
    { kind: 'space', pt: 8 },
  ];
  if (union) {
    blocks.push(
      { kind: 'text', text: `${union}은(는) 위 취업규칙 변경 내용(근로자에게 불리한 변경을 포함합니다)을 알려 받고, 「근로기준법」 제94조 제1항 단서에 따라 이에 동의합니다.`, gapAfter: 12 },
      { kind: 'text', text: date, align: 'right', gapAfter: 8 },
      { kind: 'text', text: `${union}  대표자            ${SIGN}`, align: 'right', gapAfter: 10 },
      { kind: 'text', text: `${w.name}  대표 ${w.ownerName} 귀하` },
    );
  } else {
    const n = w.workers!;
    blocks.push(
      { kind: 'text', text: '아래 근로자는 위 취업규칙 변경 내용(근로자에게 불리한 변경을 포함합니다)을 알려 받고, 「근로기준법」 제94조 제1항 단서에 따라 동의 여부를 밝힙니다.', gapAfter: 4 },
      { kind: 'text', text: `근로자 ${n}명 중 과반수는 ${Math.floor(n / 2) + 1}명 이상입니다. 동의 여부란에는 동의 또는 부동의를 적습니다.`, size: 'small', gapAfter: 6 },
      { kind: 'table', widths: [8, 22, 20, 30, 20], headerRows: 1, minRowHeight: 22, size: 'small', rows: signRows('동의 여부(동의·부동의)', n) },
      { kind: 'space', pt: 8 },
      { kind: 'text', text: `${w.name}  대표 ${w.ownerName} 귀하` },
    );
  }
  return { title, blocks };
}

export interface ReportDocs {
  report: FormDoc;
  comparison: FormDoc | null;
  opinion: FormDoc;
  consent: FormDoc | null;
}

/** 빈 칸·오류가 없을 때만 부른다 */
export function reportDocs(input: ReportInput): ReportDocs {
  const worse = (input.changes ?? []).some((c) => c.disadvantage);
  return {
    report: reportForm(input),
    comparison: input.kind === 'change' ? comparisonForm(input) : null,
    opinion: opinionForm(input),
    consent: input.kind === 'change' && worse ? consentForm(input) : null,
  };
}

/** 사람이 서명·날인해야 하는 곳 */
export function sealsNeeded(input: ReportInput, docs: ReportDocs): string[] {
  const union = (input.majorityUnion ?? '').trim();
  const out = [`신고서 — 신고인(대표 ${input.workplace.ownerName}) 서명 또는 날인`];
  if (!blank(input.agent)) out.push(`신고서 — 대리인(${input.agent!.trim()}) 서명 또는 날인`);
  out.push(union ? `의견청취서 — ${union} 대표자 서명 또는 날인` : '의견청취서 — 근로자 과반수의 서명(명단의 빈 줄)');
  if (docs.consent) out.push(union ? `동의서 — ${union} 대표자 서명 또는 날인` : '동의서 — 근로자 과반수의 서명(명단의 빈 줄)');
  return out;
}
