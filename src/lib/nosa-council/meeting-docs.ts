// 노사협의회 회의 서류 — 소집 통보서·공고 / 회의자료 / 회의록(시행규칙 별지 제3호서식 + 상세 회의록) / 의결사항 공지.
// 설계 = 노사협의회신고 스킬 references/practice-docs-spec-261110.md(서류) + minutes-graph-spec-261110.md(안건 ID·법조문 분류·결과·이월, 회의록 .json).
// 정족수·기한·의결 문장은 meeting.ts meetingCheck 한 벌에서 나온다(원격 확인 도구와 같은 값).
// 도구가 쓰는 글은 형식·기한·정족수·법정 항목뿐이다. 안건 설명·발언 요지·의결 내용은 입력으로 받은 것만 싣고 지어내지 않는다.
// 서명 칸은 비워 둔다. 이름은 사용자가 넣을 때만 싣는다. 주민등록번호 칸은 어느 서식에도 없다.
import type { FormBlock, FormCell, FormDoc } from '@/lib/work-rules-report/render';
import { dateKo } from '@/lib/work-rules-report/forms';
import { isoDate, MINUTES_KEEP_YEARS } from './assess';
import {
  articleOf, retentionEnd, CONVENE_NOTE, meetingCheck, meetingErrors, OPEN_SECRET_LINE, REPORT_ITEMS, REPORT_KEYS,
  type AgendaResult, type AgendaType, type MeetingCheck, type MeetingCheckInput, type MeetingKind, type ReportKey,
} from './meeting';

export type Side = '근로자위원' | '사용자위원';
export interface MemberInput {
  side: Side;
  /** 직위(예: 생산1팀 대표) */
  position?: string;
  /** 실명 — 사용자가 넣을 때만 */
  name?: string;
}
export interface DiscussionInput {
  side: Side | '의장' | '간사';
  position?: string;
  name?: string;
  /** 발언 요지 — 입력 그대로 싣는다 */
  summary: string;
}
/** 이행 상태(minutes-graph-spec A) */
export type ImplStatus = '미착수' | '진행' | '완료' | '보류' | '철회';
export const IMPL_STATUSES: ImplStatus[] = ['미착수', '진행', '완료', '보류', '철회'];

export interface AgendaDocInput {
  /** 안건 ID — 처음 상정 때 발급, 이월돼도 같은 ID. 비우면 개최일·순번으로 발급 */
  id?: string;
  title: string;
  type: AgendaType;
  /** 법조문 분류(meeting.ts ARTICLE_KEYS) */
  article?: string;
  proposer?: Side;
  /** 앞선 회의에서 넘어온 안건 */
  carriedOver?: boolean;
  inFavor?: number;
  background?: string;
  status?: string;
  laborProposal?: string;
  managementProposal?: string;
  issues?: string;
  discussion?: DiscussionInput[];
  /** 의결된 내용 */
  decision?: string;
  implementation?: { action?: string; owner?: string; due?: string };
}
export interface PreviousResolutionInput {
  agendaId: string;
  title?: string;
  action?: string;
  due?: string;
  status: ImplStatus;
  /** 근거(문서 경로·회의 ID) — 「완료」인데 없으면 「완료(근거 없음)」 */
  evidence?: string;
}
export interface MeetingDocsInput {
  workplace: { name?: string };
  councilName?: string;
  meeting: { kind: MeetingKind; number?: number; date: string; time?: string; place?: string; noticeDate?: string; previousRegularDate?: string };
  /** 협의회규정상 정원 */
  seats: { worker: number; employer: number };
  current?: { worker?: number; employer?: number };
  attendance?: { worker: number; employer: number; members?: MemberInput[] };
  /** 소집 통보서를 받을 위원 — 주면 위원마다 한 장 */
  recipients?: MemberInput[];
  agenda: AgendaDocInput[];
  /** 정기회의 보고사항(법 제22조제1항) — 보고한 내용 */
  reports?: Partial<Record<ReportKey, string>>;
  /** 전분기 의결사항 이행 상황 */
  previousResolutions?: PreviousResolutionInput[];
  /** 의결사항 공지 기한(일) — 협의회규정 값 */
  noticeDays?: number;
  otherNotes?: string;
  writtenDate: string;
}
export type MeetingDocKind = 'notice' | 'materials' | 'minutes' | 'resolution';

/** 시행규칙 별지 제3호서식 칸(글자 그대로) */
export const MINUTES_FORM_LABELS = [
  '회의일시',
  '회의장소',
  '협의사항',
  '보고사항',
  '의결사항',
  '의결된 사항 및 그 이행에 관한 사항',
  '그 밖의 참고사항 및 전분기 의결된 사항의 이행 상황',
] as const;

/** 그래프 「결과」 노드 값 4개(minutes-graph-spec) */
export type GraphResult = '의결' | '의결되지 않음' | '계속 협의' | '보고 완료';

const ID_RE = /^[0-9A-Za-z가-힣_.-]{1,40}$/;
const pad = (n: number) => String(n).padStart(2, '0');
const t = (s: string | undefined) => (s ?? '').trim();
const ko = (s: string | undefined) => {
  const d = isoDate(s);
  return d ? dateKo(d) : '';
};

/** 안건 ID 를 채운 사본 — 없으면 「A-개최일-순번」 */
export function withAgendaIds(input: MeetingDocsInput): MeetingDocsInput {
  const day = (isoDate(input.meeting?.date) ?? '').replace(/-/g, '');
  return { ...input, agenda: (input.agenda ?? []).map((a, k) => ({ ...a, id: t(a.id) || `A-${day}-${pad(k + 1)}` })) };
}

/** meetingCheck 에 넘길 입력. 표결 전 서류(통보·자료)는 찬성 수를 보지 않는다 */
function checkInput(input: MeetingDocsInput, kind: MeetingDocKind): MeetingCheckInput {
  const voted = kind === 'minutes' || kind === 'resolution';
  return {
    kind: input.meeting.kind,
    meetingDate: input.meeting.date,
    noticeDate: input.meeting.noticeDate ?? (kind === 'notice' ? input.writtenDate : undefined),
    previousRegularDate: input.meeting.previousRegularDate,
    workerSeats: input.seats?.worker,
    employerSeats: input.seats?.employer,
    workerCurrent: input.current?.worker,
    employerCurrent: input.current?.employer,
    ...(voted && input.attendance ? { workerPresent: input.attendance.worker, employerPresent: input.attendance.employer } : {}),
    agenda: (input.agenda ?? []).map((a) => ({ type: a.type, article: a.article, ...(voted ? { inFavor: a.inFavor } : {}) })),
    reportsCovered: REPORT_KEYS.filter((k) => t(input.reports?.[k])),
    noticeDays: input.noticeDays,
  };
}

/** 만들 수 없는 입력. 종류마다 요건이 다르다(통보가 늦으면 통보서만 막는다) */
export function meetingDocsErrors(input: MeetingDocsInput, kind: MeetingDocKind): string[] {
  const out: string[] = [];
  if (!t(input.workplace?.name)) out.push('사업장명(workplace.name)이 비어 있습니다.');
  if (!isoDate(input.writtenDate)) out.push(`writtenDate 는 YYYY-MM-DD 날짜입니다(받은 값: ${input.writtenDate ?? ''}).`);
  if (!input.agenda?.length) out.push('안건을 하나 이상 넣습니다.');
  const seen = new Set<string>();
  for (const [k, a] of (input.agenda ?? []).entries()) {
    if (!t(a.title)) out.push(`안건 ${k + 1}의 제목이 비어 있습니다.`);
    const id = t(a.id);
    if (id && !ID_RE.test(id)) out.push(`안건 ${k + 1}의 안건 ID(${id})는 글자·숫자·_.- 로 40자 이내입니다(파일 이름에 쓴다).`);
    if (a.implementation?.due && !isoDate(a.implementation.due)) out.push(`안건 ${k + 1} 이행 기한은 YYYY-MM-DD 날짜입니다.`);
  }
  for (const a of withAgendaIds(input).agenda) {
    if (seen.has(a.id!)) out.push(`같은 안건 ID(${a.id})가 한 회의에 두 번 있습니다.`);
    seen.add(a.id!);
  }
  for (const [k, p] of (input.previousResolutions ?? []).entries()) {
    if (!t(p.agendaId)) out.push(`전분기 이행 ${k + 1}의 안건 ID 가 비어 있습니다.`);
    if (p.due && !isoDate(p.due)) out.push(`전분기 이행 ${k + 1}의 기한은 YYYY-MM-DD 날짜입니다.`);
  }
  if (kind === 'minutes' || kind === 'resolution') {
    if (!input.attendance) out.push('출석 수(attendance.worker·employer)가 있어야 회의록·공지를 만듭니다.');
    for (const [k, a] of (input.agenda ?? []).entries()) {
      if (a.type === '의결' && a.inFavor == null) out.push(`안건 ${k + 1}(${t(a.title)})은 의결 안건이라 찬성 수(inFavor)가 있어야 합니다.`);
    }
  }
  if (kind === 'minutes' && input.meeting?.number == null) out.push('회의 차수(meeting.number)가 있어야 회의록을 만듭니다(회의 키 YYYY-정기|임시-N차).');
  if (input.meeting?.number != null && (!Number.isInteger(input.meeting.number) || input.meeting.number < 1)) out.push('회의 차수는 1 이상의 정수입니다.');
  const ci = input.meeting && input.seats ? checkInput(input, kind) : null;
  const errs = ci ? meetingErrors(ci) : ['회의(meeting)·정원(seats)을 넣습니다.'];
  out.push(...errs);
  if (kind === 'notice' && ci && !errs.length && isoDate(input.writtenDate)) {
    const c = meetingCheck(ci, input.writtenDate);
    if (c.convene.onTime === false) {
      out.push(`통보일(${c.convene.noticeDate})이 기한(${c.convene.due})보다 늦어 소집 통보서를 만들지 않았습니다 — 회의 개최 7일 전까지 통보해야 합니다(법 제13조제3항). 개최일을 미루거나 기한 안에 통보하세요.`);
    }
  }
  return out;
}

// ── 서식 조각 ─────────────────────────────────────────────

const h = (text: string, span = 1): FormCell => ({ text, head: true, span });
const v = (text: string, span = 1, align?: FormCell['align']): FormCell => ({ text, span, align });
const H = (text: string): FormBlock => ({ kind: 'text', text, size: 'large', gapAfter: 4 });
const P = (text: string, gapAfter = 6): FormBlock => ({ kind: 'text', text, gapAfter });
const RIGHT = (text: string): FormBlock => ({ kind: 'text', text, align: 'right', gapAfter: 6 });
const NOTE = (text: string): FormBlock => ({ kind: 'text', text: `※ ${text}`, size: 'small', gapAfter: 6 });
const SPACE = (pt = 6): FormBlock => ({ kind: 'space', pt });
const GRID = (head: string[], rows: string[][], widths: number[]): FormBlock => ({
  kind: 'table', widths, headerRows: 1, size: 'small', minRowHeight: 20, rows: [head.map((x) => h(x)), ...rows.map((r) => r.map((x) => v(x)))],
});
const KV = (rows: [string, string][], widths = [28, 72]): FormBlock => ({ kind: 'table', widths, minRowHeight: 22, rows: rows.map(([k, x]) => [h(k), v(x)]) });

interface Ctx {
  input: MeetingDocsInput;
  c: MeetingCheck;
  /** 안건 — ID 를 채운 입력과 확인 결과를 한 줄로 */
  items: { a: AgendaDocInput & { id: string }; r: AgendaResult }[];
  council: string;
  round: string;
}

function ctx(input0: MeetingDocsInput, kind: MeetingDocKind): Ctx {
  const input = withAgendaIds(input0);
  const c = meetingCheck(checkInput(input, kind), input.writtenDate);
  const items = input.agenda.map((a, k) => ({ a: a as AgendaDocInput & { id: string }, r: c.agenda[k] }));
  const m = input.meeting;
  return { input, c, items, council: t(input.councilName) || '노사협의회', round: `제 ${m.number ?? '  '} 차 ${m.kind}회의` };
}

const tag = (type: AgendaType) => `[${type}]`;
const lawOf = (article: string | undefined) => {
  const a = articleOf(article);
  return a ? `근참법 ${a.law}` : '';
};
const when = (m: MeetingDocsInput['meeting']) => `${ko(m.date)} ${t(m.time)}`.trim();
const who = (x: { side: string; position?: string; name?: string }) => `${x.side}${t(x.position) ? `(${t(x.position)})` : ''}${t(x.name) ? ` ${t(x.name)}` : ''}`;
const implStatus = (p: PreviousResolutionInput) => (p.status === '완료' && !t(p.evidence) ? '완료(근거 없음)' : p.status);
const prevLine = (p: PreviousResolutionInput) => {
  const detail = [t(p.action), p.due ? `기한 ${ko(p.due)}` : ''].filter(Boolean).join(', ');
  return `[${t(p.agendaId)}] ${t(p.title)} — ${implStatus(p)}${detail ? ` (${detail})` : ''}${t(p.evidence) ? ` 근거: ${t(p.evidence)}` : ''}`;
};
const resultText = (x: Ctx['items'][number]) => x.r.vote?.text ?? (x.r.result === '찬성 수 미입력' ? '찬성 수 미입력' : x.a.type);

function agendaGrid(ctx: Ctx): FormBlock {
  return GRID(
    ['순번', '구분', '안건', '비고'],
    ctx.items.map(({ a, r }, k) => [String(k + 1), tag(a.type), a.title, [r.resolutionItem ? '의결 필요' : '', lawOf(a.article)].filter(Boolean).join(' · ')]),
    [8, 12, 52, 28],
  );
}

// ── 소집 통보서·공고 ─────────────────────────────────────

function conveneLetter(x: Ctx, to?: MemberInput): FormBlock[] {
  const m = x.input.meeting;
  return [
    { kind: 'title', text: '노사협의회 회의 소집 통보서' },
    P(`받는 사람: ${to ? `${to.side} ${t(to.position)}${t(to.name) ? ` ${t(to.name)}` : ''}`.trim() : '○○ 위원'}`, 8),
    P(`${x.council} ${m.kind}회의를 다음과 같이 소집하니 참석하여 주시기 바랍니다.`),
    KV([['회의 구분', `${m.kind}회의`], ['회차', `제 ${m.number ?? '  '} 차`], ['일시', when(m)], ['장소', t(m.place)], ['통보일', ko(x.c.convene.noticeDate ?? undefined)]]),
    NOTE(`${CONVENE_NOTE} 이번 회의의 통보 기한: ${dateKo(x.c.convene.due)}`),
    H('의제'),
    agendaGrid(x),
    NOTE('[의결] 안건은 출석위원 3분의 2 이상의 찬성으로 의결한다(법 제15조). 「의결 필요」는 법 제21조에 따라 협의회의 의결을 거쳐야 하는 사항이다.'),
    H('자료 요구'),
    P('근로자위원은 의제 중 협의사항·의결사항에 관련된 자료를 회의 개최 전에 사용자에게 요구할 수 있다(법 제14조).'),
    SPACE(8),
    RIGHT(ko(x.c.convene.noticeDate ?? x.input.writtenDate)),
    RIGHT(`${x.council} 의장            (서명)`),
  ];
}

function noticeDocs(x: Ctx): { id: string; doc: FormDoc }[] {
  const to = x.input.recipients ?? [];
  const letters = to.length ? to.flatMap((r, k) => [...(k ? [{ kind: 'pageBreak' } as FormBlock] : []), ...conveneLetter(x, r)]) : conveneLetter(x);
  const m = x.input.meeting;
  const notice: FormDoc = {
    title: '노사협의회 회의 소집 공고',
    blocks: [
      { kind: 'title', text: '노사협의회 회의 소집 공고' },
      P(`${x.council} ${m.kind}회의를 다음과 같이 소집합니다.`, 8),
      KV([['회차', `제 ${m.number ?? '  '} 차 ${m.kind}회의`], ['일시', when(m)], ['장소', t(m.place)]]),
      H('의제'),
      agendaGrid(x),
      NOTE(OPEN_SECRET_LINE),
      SPACE(8),
      RIGHT(ko(x.c.convene.noticeDate ?? x.input.writtenDate)),
      RIGHT(`${x.council} 의장`),
    ],
  };
  return [{ id: '소집통보서', doc: { title: '노사협의회 회의 소집 통보서', blocks: letters } }, { id: '소집공고', doc: notice }];
}

// ── 회의자료 ─────────────────────────────────────────────

const decisionAsk = ({ a, r }: Ctx['items'][number]) =>
  a.type === '보고' ? '보고(의결 없음)' : a.type === '협의' ? '협의(필요하면 의결할 수 있다, 법 제20조제2항)' : `의결 — 출석위원 3분의 2 이상 찬성(법 제15조)${r.resolutionItem ? ' · 법 제21조 의결사항' : ''}`;

function prevGrid(input: MeetingDocsInput): FormBlock {
  const rows = (input.previousResolutions ?? []).map((p) => [t(p.agendaId), t(p.title), t(p.action), ko(p.due), implStatus(p)]);
  return GRID(['안건 ID', '안건', '조치', '기한', '상태'], rows.length ? rows : [['', '', '', '', '']], [18, 26, 26, 14, 16]);
}

function materialsDoc(x: Ctx): FormDoc {
  const m = x.input.meeting;
  const title = '노사협의회 회의자료';
  let n = 0;
  const sec = (s: string) => H(`${++n}. ${s}`);
  const blocks: FormBlock[] = [
    SPACE(120),
    { kind: 'title', text: title },
    { kind: 'text', text: `${x.round}`, align: 'center', size: 'large', gapAfter: 24 },
    KV([['사업장', t(x.input.workplace.name)], ['일시', when(m)], ['장소', t(m.place)], ['작성일', ko(x.input.writtenDate)]], [30, 70]),
    { kind: 'pageBreak' },
    sec('안건 목록'),
    GRID(['순번', '안건 ID', '구분', '안건', '법조문', '제안'], x.items.map(({ a }, k) => [String(k + 1), a.id, tag(a.type), a.title, lawOf(a.article), a.proposer ?? '']), [7, 18, 10, 33, 20, 12]),
    SPACE(),
  ];
  if (m.kind === '정기') {
    blocks.push(
      sec('보고사항(법 제22조제1항 — 정기회의)'),
      GRID(['보고사항', '내용'], REPORT_ITEMS.map((label, k) => [label, t(x.input.reports?.[REPORT_KEYS[k]])]), [40, 60]),
      ...(x.c.reports.missing.length ? [NOTE(`비어 있는 보고사항: ${x.c.reports.missing.join(', ')}. 사용자가 보고·설명하지 않으면 근로자위원은 자료 제출을 요구할 수 있다(법 제22조제3항).`)] : []),
      SPACE(),
    );
  }
  blocks.push(sec('안건별 자료'));
  for (const it of x.items) {
    const { a } = it;
    blocks.push(
      P(`${tag(a.type)} ${a.title} (${a.id})${a.carriedOver ? ' — 이월 안건' : ''}`, 3),
      KV([
        ['배경', t(a.background)],
        ['현황', t(a.status)],
        ['제안(근로자위원)', t(a.laborProposal)],
        ['제안(사용자위원)', t(a.managementProposal)],
        ['쟁점', t(a.issues)],
        ['요청 결정', decisionAsk(it)],
      ]),
      SPACE(),
    );
  }
  blocks.push(sec('전분기 의결사항 이행 점검표'), prevGrid(x.input), NOTE('「완료」인데 근거(문서·회의)가 없으면 「완료(근거 없음)」로 적는다.'));
  return { title, blocks };
}

// ── 회의록 ───────────────────────────────────────────────

const keepUntil = (written: string) => retentionEnd(written, MINUTES_KEEP_YEARS);

function formCells(x: Ctx): Record<(typeof MINUTES_FORM_LABELS)[number], string> {
  const q = x.c.quorum!;
  const lines = (pred: (it: Ctx['items'][number]) => boolean, f: (it: Ctx['items'][number]) => string) => x.items.filter(pred).map(f).join('\n');
  const reported = REPORT_ITEMS.map((label, k) => (t(x.input.reports?.[REPORT_KEYS[k]]) ? `${label}: ${t(x.input.reports?.[REPORT_KEYS[k]])}` : '')).filter(Boolean);
  const passed = x.items.filter((it) => it.r.vote?.passed);
  return {
    회의일시: when(x.input.meeting),
    회의장소: t(x.input.meeting.place),
    협의사항: lines((it) => it.a.type === '협의', (it) => `[${it.a.id}] ${it.a.title} — ${resultText(it)}`),
    보고사항: [lines((it) => it.a.type === '보고', (it) => `[${it.a.id}] ${it.a.title}`), ...reported].filter(Boolean).join('\n'),
    의결사항: lines((it) => it.a.type === '의결', (it) => `[${it.a.id}] ${it.a.title} — ${resultText(it)}`),
    '의결된 사항 및 그 이행에 관한 사항': passed.length
      ? passed
          .map(({ a }) => {
            const im = a.implementation;
            const plan = im ? [t(im.action), t(im.owner) ? `담당 ${t(im.owner)}` : '', im.due ? `기한 ${ko(im.due)}` : ''].filter(Boolean).join(' / ') : '';
            return `[${a.id}] ${t(a.decision) || a.title}${plan ? `\n  이행: ${plan}` : ''}`;
          })
          .join('\n')
      : '없음',
    '그 밖의 참고사항 및 전분기 의결된 사항의 이행 상황': [
      `출석: ${q.text}`,
      ...(q.currentNote ? [q.currentNote] : []),
      ...(t(x.input.otherNotes) ? [t(x.input.otherNotes)] : []),
      ...((x.input.previousResolutions ?? []).length ? ['전분기 의결 이행 상황', ...(x.input.previousResolutions ?? []).map(prevLine)] : []),
    ].join('\n'),
  };
}

function signRows(x: Ctx): FormCell[][] {
  const att = x.input.attendance!;
  const members = att.members ?? [];
  const side = (s: Side, count: number) => {
    const named = members.filter((mm) => mm.side === s);
    return Array.from({ length: Math.max(count, named.length) }, (_, k) => named[k] ?? { side: s });
  };
  const rows = [...side('근로자위원', att.worker), ...side('사용자위원', att.employer)];
  return rows.map((mm, k) => [v(String(k + 1), 1, 'center'), v(`${mm.side}${t(mm.position) ? ` ${t(mm.position)}` : ''}`), v(t(mm.name)), v('')]);
}

function minutesDocs(x: Ctx): { id: string; doc: FormDoc }[] {
  const m = x.input.meeting;
  const cells = formCells(x);
  const keep = keepUntil(x.input.writtenDate);
  const formTitle = `제 ${m.number} 차 (${m.kind}) 노사협의회 회의록`;
  const form: FormDoc = {
    title: formTitle,
    blocks: [
      { kind: 'title', text: formTitle },
      NOTE(OPEN_SECRET_LINE),
      { kind: 'table', widths: [26, 74], minRowHeight: 26, rows: MINUTES_FORM_LABELS.map((l) => [h(l), v(cells[l])]) },
      NOTE(`보존기한: ${dateKo(keep)}까지(작성일 ${dateKo(x.input.writtenDate)}부터 3년, 법 제19조제2항)`),
      { kind: 'pageBreak' },
      H('참석위원 서명'),
      { kind: 'table', widths: [10, 40, 25, 25], headerRows: 1, minRowHeight: 26, rows: [[h('연번'), h('구분'), h('성명'), h('서명')], ...signRows(x)] },
      NOTE('회의록에는 출석위원 전원이 서명하거나 날인한다(시행령 제6조).'),
    ],
  };

  const q = x.c.quorum!;
  const blocks: FormBlock[] = [
    { kind: 'title', text: '노사협의회 상세 회의록' },
    KV([['회의', `${x.council} ${x.round}`], ['일시', when(m)], ['장소', t(m.place)], ['출석', q.text], ['작성일', ko(x.input.writtenDate)]]),
    NOTE(OPEN_SECRET_LINE),
    H('1. 개회'),
    P([q.text, ...(q.currentNote ? [q.currentNote] : [])].join('\n')),
  ];
  let n = 1;
  const reported = REPORT_ITEMS.map((label, k) => (t(x.input.reports?.[REPORT_KEYS[k]]) ? `${label}: ${t(x.input.reports?.[REPORT_KEYS[k]])}` : '')).filter(Boolean);
  if (reported.length) blocks.push(H(`${++n}. 보고사항(법 제22조제1항)`), P(reported.map((s) => `- ${s}`).join('\n')));
  blocks.push(H(`${++n}. 안건`));
  x.items.forEach((it, k) => {
    const { a } = it;
    const talk = (a.discussion ?? []).filter((d) => t(d.summary));
    blocks.push(
      P(`안건 ${k + 1}. ${tag(a.type)} ${a.title}`, 3),
      KV([
        ['안건 ID', a.id],
        ['법조문', [lawOf(a.article), articleOf(a.article)?.text ?? ''].filter(Boolean).join(' ')],
        ['제안', a.proposer ?? ''],
        ['이월', a.carriedOver ? '이월 안건' : '새 안건'],
      ]),
      ...(t(a.background) || t(a.status) ? [P([t(a.background) && `배경: ${t(a.background)}`, t(a.status) && `현황: ${t(a.status)}`].filter(Boolean).join('\n'), 3)] : []),
      P(talk.length ? `발언 요지\n${talk.map((d) => `- ${who(d)}: ${t(d.summary)}`).join('\n')}` : '발언 요지 입력 없음', 3),
      P(`결과: ${resultText(it)}${t(a.decision) && it.r.vote?.passed ? `\n의결 내용: ${t(a.decision)}` : ''}`),
    );
    if (it.r.arbitration) blocks.push(NOTE(it.r.arbitration));
  });
  if ((x.input.previousResolutions ?? []).length) blocks.push(H(`${++n}. 전분기 의결사항 이행 상황`), P((x.input.previousResolutions ?? []).map(prevLine).join('\n')));
  blocks.push(
    H(`${++n}. 폐회`),
    NOTE('회의록에는 출석위원 전원이 서명하거나 날인한다(시행령 제6조). 서명은 별지 제3호서식 회의록에 받는다.'),
    NOTE(`보존기한: ${dateKo(keep)}까지(작성일부터 3년, 법 제19조제2항)`),
  );
  return [{ id: '회의록', doc: form }, { id: '상세회의록', doc: { title: '노사협의회 상세 회의록', blocks } }];
}

// ── 의결사항 공지 ─────────────────────────────────────────

function resolutionDoc(x: Ctx): FormDoc {
  const m = x.input.meeting;
  const title = '노사협의회 의결사항 공지';
  const passed = x.items.filter((it) => it.r.vote?.passed);
  const pending = x.items.filter((it) => it.a.type !== '보고' && !it.r.vote?.passed);
  const rn = x.c.resolutionNotice;
  return {
    title,
    blocks: [
      { kind: 'title', text: title },
      P(`${x.council}는 ${ko(m.date)} 제 ${m.number ?? '  '} 차 ${m.kind}회의에서 다음 사항을 의결하였으므로 알립니다.`, 8),
      H('1. 의결된 사항'),
      GRID(
        ['순번', '안건', '의결 내용', '이행(조치·기한)'],
        passed.length
          ? passed.map(({ a }, k) => [String(k + 1), a.title, t(a.decision) || a.title, a.implementation ? [t(a.implementation.action), a.implementation.due ? `기한 ${ko(a.implementation.due)}` : ''].filter(Boolean).join(' / ') : ''])
          : [['', '없음', '', '']],
        [8, 30, 36, 26],
      ),
      SPACE(),
      H('2. 계속 협의'),
      GRID(['안건', '결과', '처리'], pending.length ? pending.map((it) => [it.a.title, it.r.vote ? it.r.result : '협의', '계속 협의']) : [['없음', '', '']], [50, 25, 25]),
      SPACE(),
      rn
        ? NOTE(`공지 기한: ${dateKo(rn.due)}까지 — 협의회규정(견본 제29조: 의결한 날부터 ${rn.days}일 이내). 게시판·사내 전산망 등으로 알린다.`)
        : NOTE('이번 회의에서 의결된 사항이 없다.'),
      SPACE(8),
      RIGHT(ko(x.input.writtenDate)),
      RIGHT(`${x.council} 의장`),
    ],
  };
}

// ── 묶음 ─────────────────────────────────────────────────

/** meetingDocsErrors 가 빈 때 부른다 */
export function meetingDocs(input: MeetingDocsInput, kind: MeetingDocKind): { made: { id: string; doc: FormDoc }[]; warnings: string[]; check: MeetingCheck; agendaIds: string[] } {
  const x = ctx(input, kind);
  const made = kind === 'notice' ? noticeDocs(x) : kind === 'materials' ? [{ id: '회의자료', doc: materialsDoc(x) }] : kind === 'minutes' ? minutesDocs(x) : [{ id: '의결사항_공지', doc: resolutionDoc(x) }];
  const warnings = [...x.c.warnings, ...x.input.previousResolutions?.filter((p) => p.status === '완료' && !t(p.evidence)).map((p) => `전분기 이행 ${p.agendaId}: 「완료」인데 근거가 없어 「완료(근거 없음)」로 적었다.`) ?? []];
  return { made, warnings, check: x.c, agendaIds: x.items.map((it) => it.a.id) };
}

const graphResult = (r: AgendaResult): GraphResult => (r.result === '의결' ? '의결' : r.result === '의결되지 않음' ? '의결되지 않음' : r.result === '보고' ? '보고 완료' : '계속 협의');

/** 회의록 구조화 원본(.json) — 회의록 그래프·보관함의 원천. 선은 이 구조화 값에서만 나온다 */
export function minutesRecord(input0: MeetingDocsInput) {
  const x = ctx(input0, 'minutes');
  const m = x.input.meeting;
  return {
    schema: 'nosa-council-minutes/1' as const,
    council: { workplace: t(x.input.workplace.name), councilName: t(x.input.councilName) || null },
    meeting: { key: `${m.date.slice(0, 4)}-${m.kind}-${m.number}차`, kind: m.kind, number: m.number ?? null, date: m.date, time: t(m.time) || null, place: t(m.place) || null, noticeDate: m.noticeDate ?? null, previousRegularDate: m.previousRegularDate ?? null },
    seats: x.input.seats,
    current: x.input.current ?? null,
    attendance: x.input.attendance ?? null,
    check: { convene: x.c.convene, interval: x.c.interval, quorum: x.c.quorum, reports: x.c.reports, resolutionNotice: x.c.resolutionNotice, warnings: x.c.warnings },
    agenda: x.items.map(({ a, r }) => ({
      id: a.id,
      title: a.title,
      type: a.type,
      article: a.article ?? null,
      proposer: a.proposer ?? null,
      carriedOver: !!a.carriedOver,
      result: graphResult(r),
      resolutionItem: r.resolutionItem,
      vote: r.vote,
      decision: t(a.decision) || null,
      implementation: a.implementation ?? null,
      discussion: a.discussion ?? [],
      background: t(a.background) || null,
    })),
    reports: x.input.reports ?? {},
    previousResolutions: (x.input.previousResolutions ?? []).map((p) => ({ ...p, evidenceMissing: p.status === '완료' && !t(p.evidence) })),
    otherNotes: t(x.input.otherNotes) || null,
    writtenDate: x.input.writtenDate,
    keepUntil: keepUntil(x.input.writtenDate),
  };
}
export type MinutesRecord = ReturnType<typeof minutesRecord>;
