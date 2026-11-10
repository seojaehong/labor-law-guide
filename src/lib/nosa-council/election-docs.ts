// 노사협의회 근로자위원 선거 서류 — 선관위 구성 공고 · 선거공고문 · 입후보 신청서 · 후보자 공고 · 투표용지 · 개표록 · 당선공고.
// 설계 = 노사협의회신고 스킬 references/practice-docs-spec-261110.md 「make_council_election_docs」.
// 날짜는 비우면 설치 목표일에서 거꾸로 잡은 일정(assess.ts schedule)을 쓴다. 참여 요건·투표 방식은 assess.ts 한 벌(electionCheck·ballot).
// 바꾼 것(매뉴얼 예시 대비): 입후보 신청서의 주민등록번호 칸·추천서 첨부를 뺐다. 후보 수 ≤ 정원이면 찬반투표(무투표 당선 불인정).
// 찬반투표의 당선 기준은 참고자료에 없어 도구가 정하지 않는다 — 개표록에 찬성·반대 수만 적고, 당선 여부는 사용자가 넣는다(elected).
// 이름은 사용자가 넣을 때만 싣는다. 서명 칸은 비워 둔다. 주민등록번호 칸은 어느 서식에도 없다.
import type { FormBlock, FormCell, FormDoc } from '@/lib/work-rules-report/render';
import { dateKo } from '@/lib/work-rules-report/forms';
import {
  ballot as ballotOf, electionCheck, electionErrors, ELECTOR_SCOPE, isoDate, MEMBERS_MAX, MEMBERS_MIN, schedule, daysBetween,
  type Ballot, type ElectionCheck, type ElectionInput, type QuorumStage,
} from './assess';
import { directParticipation, winnerNoticeDoc } from './forms';

export interface CandidateInput {
  name?: string;
  dept?: string;
  position?: string;
  /** 선거구 이름(선거구별 선거) */
  district?: string;
  /** 다수득표 — 득표수 */
  votes?: number;
  /** 찬반투표 — 찬성·반대 수 */
  inFavor?: number;
  against?: number;
  /** 당선 — 찬반투표는 사용자가 정해 넣는다(선거관리규정 기준) */
  elected?: boolean;
}
export interface ElectionDocsInput {
  workplace: { name?: string };
  councilName?: string;
  /** 뽑을 근로자위원 수 */
  seats: number;
  majorityUnion?: boolean;
  /** 간접선거 사유(법 제6조제2항 단서) — 있으면 간접선거 */
  indirectReason?: string;
  districts?: { label: string; seats?: number }[];
  concurrentRep?: boolean;
  concurrentScope?: string[];
  /** 동점자 기준(협의회규정) */
  tieBreak?: string;
  /** 다수득표형 — 한 사람이 기표하는 수(선거관리규정 값) */
  marksPerBallot?: number;
  /** 협의회 설치 목표일 — 날짜를 비우면 여기서 거꾸로 잡는다 */
  targetInstallDate?: string;
  dates?: Partial<Record<DateKey, string>>;
  vote?: { time?: string; place?: string };
  /** 선거관리위원 — 직위(역할)와 이름(넣을 때만) */
  committee?: { position?: string; name?: string; dept?: string }[];
  candidates?: CandidateInput[];
  /** 후보 이름 없이 수만 알 때 */
  candidateCount?: number;
  /** 개표 결과(참여 수) */
  result?: ElectionInput & { invalid?: number; districts?: { label?: string; electors: number; voters: number }[] };
  writtenDate: string;
}

export const ELECTION_DOC_IDS = ['01_선관위구성공고', '02_선거공고문', '03_입후보신청서', '04_후보자공고', '05_투표용지', '06_개표록', '07_당선공고'] as const;
export type ElectionDocId = (typeof ELECTION_DOC_IDS)[number];
export const DATE_KEYS = ['committee', 'announce', 'candidacyStart', 'candidacyEnd', 'roster', 'vote', 'winnerNotice', 'termStart'] as const;
export type DateKey = (typeof DATE_KEYS)[number];
const DATE_LABEL: Record<DateKey, string> = {
  committee: '선거관리위원회 구성일', announce: '선거 공고일', candidacyStart: '입후보 시작일', candidacyEnd: '입후보 마감일',
  roster: '선거인명부 확정일', vote: '선거일', winnerNotice: '당선 공고일', termStart: '임기 시작일',
};
/** 일정역산(schedule) 단계 이름 → 날짜 칸 */
const FROM_SCHEDULE: [string, DateKey][] = [
  ['선거관리위원회 구성', 'committee'], ['선거 공고', 'announce'], ['입후보 마감', 'candidacyEnd'], ['선거인명부 확정', 'roster'], ['투표', 'vote'], ['당선공고', 'winnerNotice'],
];
/** 선관위는 선거 공고 14일 전까지 구성(선거관리규정 견본 제2조②, 재단 예시문 제12조) */
const COMMITTEE_LEAD_DAYS = 14;

const t = (s: string | undefined) => (s ?? '').trim();
const ko = (s: string | undefined, none = '(기재)') => {
  const d = isoDate(s);
  return d ? dateKo(d) : none;
};

/** 날짜 칸 — 넣은 값, 없으면 설치 목표일에서 거꾸로 잡은 값. 입후보 시작은 공고일 */
export function electionDates(input: ElectionDocsInput): Partial<Record<DateKey, string>> {
  const out: Partial<Record<DateKey, string>> = {};
  const target = isoDate(input.targetInstallDate);
  if (target) {
    const steps = schedule(target);
    for (const [step, key] of FROM_SCHEDULE) {
      const s = steps.find((x) => x.step === step);
      if (s) out[key] = s.date;
    }
  }
  for (const k of DATE_KEYS) {
    const v = isoDate(input.dates?.[k]);
    if (v) out[k] = v;
  }
  if (!out.candidacyStart && out.announce) out.candidacyStart = out.announce;
  return out;
}

const isIndirect = (i: ElectionDocsInput) => !!t(i.indirectReason) || i.result?.delegateElectors != null;
const candidateRows = (i: ElectionDocsInput) => i.candidates?.length ?? i.candidateCount ?? 0;

/** 만들 수 없는 입력 */
export function electionDocsErrors(i: ElectionDocsInput): string[] {
  const out: string[] = [];
  if (!t(i.workplace?.name)) out.push('사업장명(workplace.name)이 비어 있습니다.');
  if (i.majorityUnion) out.push('근로자의 과반수로 조직된 노동조합이 있으면 근로자위원은 그 노동조합이 위촉합니다(법 제6조제2항) — 선거 서류를 만들지 않습니다.');
  if (!Number.isInteger(i.seats) || i.seats < MEMBERS_MIN || i.seats > MEMBERS_MAX) out.push(`근로자위원 수(seats)는 ${MEMBERS_MIN}명 이상 ${MEMBERS_MAX}명 이하입니다(법 제6조제1항).`);
  if (!isoDate(i.writtenDate)) out.push(`writtenDate 는 YYYY-MM-DD 날짜입니다(받은 값: ${i.writtenDate ?? ''}).`);
  if (i.targetInstallDate && !isoDate(i.targetInstallDate)) out.push(`targetInstallDate 는 YYYY-MM-DD 날짜입니다(받은 값: ${i.targetInstallDate}).`);
  for (const k of DATE_KEYS) {
    const v = i.dates?.[k];
    if (v && !isoDate(v)) out.push(`${DATE_LABEL[k]}(dates.${k})는 YYYY-MM-DD 날짜입니다(받은 값: ${v}).`);
  }
  const d = electionDates(i);
  const before = (a: DateKey, b: DateKey, strict = false) => {
    const x = d[a];
    const y = d[b];
    if (x && y && (strict ? x >= y : x > y)) out.push(`${DATE_LABEL[a]}(${x})은 ${DATE_LABEL[b]}(${y})보다 ${strict ? '앞서야' : '늦지 않아야'} 합니다.`);
  };
  before('committee', 'announce');
  before('announce', 'candidacyStart');
  before('candidacyStart', 'candidacyEnd');
  before('candidacyEnd', 'vote', true);
  before('announce', 'vote', true);
  before('roster', 'vote');
  before('vote', 'winnerNotice');
  before('vote', 'termStart');
  const ds = i.districts ?? [];
  if (ds.some((x) => !t(x.label))) out.push('선거구마다 이름(label)을 넣습니다.');
  if (ds.length && ds.every((x) => x.seats != null)) {
    const sum = ds.reduce((s, x) => s + (x.seats ?? 0), 0);
    if (sum !== i.seats) out.push(`선거구별 근로자위원 수의 합(${sum}명)이 뽑을 인원(${i.seats}명)과 다릅니다.`);
  }
  if (i.marksPerBallot != null && (!Number.isInteger(i.marksPerBallot) || i.marksPerBallot < 1 || i.marksPerBallot > i.seats)) out.push(`한 사람이 기표하는 수(marksPerBallot)는 1 이상 뽑을 인원(${i.seats}명) 이하의 정수입니다.`);
  if (i.candidateCount != null && (!Number.isInteger(i.candidateCount) || i.candidateCount < 1)) out.push('후보 수(candidateCount)는 1 이상의 정수입니다.');
  const cs = i.candidates ?? [];
  const nonNeg = (x: number | undefined) => x == null || (Number.isInteger(x) && x >= 0);
  for (const [k, c] of cs.entries()) {
    if (![c.votes, c.inFavor, c.against].every(nonNeg)) out.push(`후보 ${k + 1}의 득표·찬성·반대 수는 0 이상의 정수입니다.`);
    const voters = i.result?.voters;
    if (voters != null && ((c.votes ?? 0) > voters || (c.inFavor ?? 0) + (c.against ?? 0) > voters)) out.push(`후보 ${k + 1}의 표가 투표자 수(${voters}명)보다 많습니다.`);
  }
  if (cs.filter((c) => c.elected).length > i.seats) out.push(`당선(elected)으로 표시한 후보가 뽑을 인원(${i.seats}명)보다 많습니다.`);
  if (i.result) {
    out.push(...electionErrors(i.result, isIndirect(i)));
    if (i.result.invalid != null && (!Number.isInteger(i.result.invalid) || i.result.invalid < 0 || i.result.invalid > i.result.voters)) out.push('무효표 수(result.invalid)는 0 이상 투표자 수 이하의 정수입니다.');
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
const LIST = (items: readonly string[]): FormBlock => ({ kind: 'text', text: items.map((x) => `- ${x}`).join('\n'), gapAfter: 6 });
const SPACE = (pt = 6): FormBlock => ({ kind: 'space', pt });
const GRID = (head: string[], rows: string[][], widths: number[], minRowHeight = 20): FormBlock => ({
  kind: 'table', widths, headerRows: 1, size: 'small', minRowHeight, rows: [head.map((x) => h(x)), ...rows.map((r) => r.map((x) => v(x)))],
});
const KV = (rows: [string, string][], widths = [26, 74]): FormBlock => ({ kind: 'table', widths, minRowHeight: 22, rows: rows.map(([k, x]) => [h(k), v(x)]) });
const NOTICE_HEAD = (subject: string): FormBlock[] => [{ kind: 'title', text: '공  고' }, P(`제목  ${subject}`, 8)];
const COMMITTEE = '노사협의회 근로자위원 선거관리위원회';
const pct = (s: QuorumStage) => `${s.turnout.toFixed(2)}%`;

interface Ctx {
  i: ElectionDocsInput;
  d: Partial<Record<DateKey, string>>;
  name: string;
  council: string;
  ballot: Ballot | null;
  check: ElectionCheck | null;
  /** 당선자 이름(득표순 또는 사용자 표시). 정할 수 없으면 null */
  elected: string[] | null;
  winners: CandidateInput[] | null;
  warnings: string[];
}

function candidateLabel(c: CandidateInput) {
  return t(c.name);
}

function decide(i: ElectionDocsInput, b: Ballot | null, check: ElectionCheck | null, warnings: string[]): CandidateInput[] | null {
  const cs = i.candidates ?? [];
  const flagged = cs.filter((c) => c.elected);
  if (flagged.length) return flagged;
  if (!check?.workerMembers.met || !b || !cs.length) return null;
  if (b.method === '찬반투표') {
    warnings.push('찬반투표의 당선 기준은 선거관리규정에서 정한 기준을 따른다 — 당선자를 정해 candidates[].elected 로 넣으면 당선공고에 채운다.');
    return null;
  }
  if (cs.some((c) => c.votes == null)) return null;
  const ranked = [...cs].sort((a, b2) => (b2.votes ?? 0) - (a.votes ?? 0));
  const cut = ranked[i.seats - 1]?.votes;
  const next = ranked[i.seats]?.votes;
  if (cut != null && next != null && cut === next) {
    const tied = ranked.filter((c) => c.votes === cut).map(candidateLabel).filter(Boolean);
    warnings.push(`${i.seats}번째 자리에서 득표가 같다(동점 ${cut}표${tied.length ? `: ${tied.join(', ')}` : ''}) — 협의회규정의 동점자 기준(${t(i.tieBreak) || '○○'})으로 정해 candidates[].elected 로 넣는다.`);
    return null;
  }
  return ranked.slice(0, i.seats);
}

function ctx(i: ElectionDocsInput): Ctx {
  const warnings: string[] = [];
  const d = electionDates(i);
  const n = candidateRows(i);
  const b = n ? ballotOf(n, i.seats) : null;
  if (b?.warning) warnings.push(b.warning);
  const check = i.result ? electionCheck(i.result, { indirect: isIndirect(i), concurrentRep: !!i.concurrentRep, seats: i.seats }) : null;
  if (d.committee && d.announce && daysBetween(d.committee, d.announce) < COMMITTEE_LEAD_DAYS) {
    warnings.push(`선거관리위원회 구성(${d.committee})이 선거 공고(${d.announce}) 14일 전보다 늦다(선거관리규정 견본 제2조②).`);
  }
  if (i.districts?.length) warnings.push('선거구별 선거는 선거구마다 후보 수와 뽑을 인원을 견주어 찬반투표 여부를 정한다 — 투표용지 형식은 전체 후보 수로 골랐으니 선거구별로 확인한다.');
  const winners = decide(i, b, check, warnings);
  return {
    i, d, name: t(i.workplace.name), council: t(i.councilName) || '노사협의회', ballot: b, check,
    elected: winners ? winners.map(candidateLabel) : null, winners, warnings,
  };
}

const methodText = (x: Ctx) =>
  isIndirect(x.i)
    ? '근로자 과반수가 참여한 직접·비밀·무기명 투표로 위원선거인을 뽑고, 위원선거인 과반수가 참여한 직접·비밀·무기명 투표로 근로자위원을 뽑는다(근참법 제6조제2항 단서).'
    : '근로자 과반수가 참여한 직접·비밀·무기명 투표로 뽑는다(근참법 제6조제2항).';
const seatsText = (x: Ctx) => `근로자위원 ${x.i.seats}명${x.i.districts?.length ? ` (선거구별: ${x.i.districts.map((g) => `${t(g.label)} ${g.seats ?? '○'}명`).join(', ')})` : ''}`;
const voteWhen = (x: Ctx) => [ko(x.d.vote), t(x.i.vote?.time)].filter(Boolean).join(' ');
const scopeList = (x: Ctx) => {
  const s = (x.i.concurrentScope ?? []).map((y) => y.trim()).filter(Boolean);
  return s.length ? s : ['(권한 범위를 하나씩 적는다)'];
};
const CONCURRENT = '이번 선거로 뽑히는 근로자위원은 그 임기 동안 근로기준법상 근로자대표의 권한을 겸하여 행사한다.';

// ── 01 선관위 구성 공고 ───────────────────────────────────

function committeeDoc(x: Ctx): FormDoc {
  const cm = x.i.committee ?? [];
  const rows = cm.length ? cm.map((m, k) => [String(k + 1), t(m.position), t(m.name), t(m.dept)]) : Array.from({ length: 3 }, (_, k) => [String(k + 1), k ? '위원' : '위원장', '', '']);
  return {
    title: '선거관리위원회 구성 공고',
    blocks: [
      ...NOTICE_HEAD('노사협의회 근로자위원 선거관리위원회 구성 공고'),
      P(`${x.name} 노사협의회 근로자위원 선거를 관리하기 위하여 선거관리위원회를 다음과 같이 구성하였음을 공고합니다.`),
      H('1. 선거관리위원회'),
      GRID(['연번', '직위(역할)', '성명', '소속'], rows, [10, 30, 30, 30], 24),
      SPACE(),
      H('2. 구성과 할 일'),
      LIST([
        '선거관리위원회는 근로자로 구성한다. 사용자는 근로자위원의 선출에 개입하거나 방해하여서는 아니 된다(법 제10조제1항).',
        '선거관리위원회는 선거 공고, 입후보 접수, 선거인명부 확정, 투표·개표 관리, 당선자 공고를 맡는다.',
        `선거 공고 예정일: ${ko(x.d.announce)}`,
      ]),
      SPACE(8),
      RIGHT(ko(x.d.committee, dateKo(x.i.writtenDate))),
      RIGHT(COMMITTEE),
    ],
  };
}

// ── 02 선거공고문 ─────────────────────────────────────────

function announceDoc(x: Ctx): FormDoc {
  const b = x.ballot;
  const how = b
    ? b.method === '찬반투표'
      ? `후보자 수(${b.candidates}명)가 뽑을 인원(${b.seats}명) 이하이면 후보자마다 찬반투표를 한다(무투표 당선은 인정되지 않는다).`
      : `후보자 수(${b.candidates}명)가 뽑을 인원(${b.seats}명)보다 많으면 득표순으로 정한다.`
    : '후보자 수가 뽑을 인원 이하이면 후보자마다 찬반투표를 하고(무투표 당선은 인정되지 않는다), 뽑을 인원보다 많으면 득표순으로 정한다.';
  return {
    title: '근로자위원 선거 공고',
    blocks: [
      ...NOTICE_HEAD('노사협의회 근로자위원 선거 공고'),
      P(`${x.name} 노사협의회 근로자위원 선거를 다음과 같이 실시함을 공고합니다.`),
      KV([
        ['선출 인원', seatsText(x)],
        ['선출 방법', methodText(x)],
        ['선거인', `${ELECTOR_SCOPE}\n선거인명부 확정일: ${ko(x.d.roster)}`],
        ['입후보', `선거인은 누구든지 입후보할 수 있다.\n기간: ${ko(x.d.candidacyStart)}부터 ${ko(x.d.candidacyEnd)}까지 — 입후보 신청서를 선거관리위원회에 낸다.`],
        ['투표 일시', voteWhen(x)],
        ['투표 장소', t(x.i.vote?.place)],
        ['임기', `${ko(x.d.termStart)}부터 3년(근참법 제8조제1항)`],
      ]),
      SPACE(),
      H('투표와 당선'),
      LIST([
        '투표는 직접·비밀·무기명으로 하고 1인 1표로 한다.',
        '근로자 과반수가 참여하여야 선출이 성립한다. 참여가 과반수에 이르지 않으면 재투표한다.',
        how,
        `동점자는 협의회규정에서 정한 기준(${t(x.i.tieBreak) || '○○'})으로 정한다.`,
      ]),
      ...(x.i.concurrentRep
        ? [H('근로자대표 겸임'), P(`${CONCURRENT} 권한 범위는 다음과 같다.`), LIST(scopeList(x)), NOTE('이 사실은 투표용지와 당선 공고에도 적는다.')]
        : []),
      SPACE(8),
      RIGHT(ko(x.d.announce, dateKo(x.i.writtenDate))),
      RIGHT(COMMITTEE),
    ],
  };
}

// ── 03 입후보 신청서 ───────────────────────────────────────

function candidacyDoc(x: Ctx): FormDoc {
  const title = '노사협의회 근로자위원 입후보 신청서';
  return {
    title,
    blocks: [
      { kind: 'title', text: title },
      SPACE(8),
      KV([['성명', ''], ['소속', ''], ['직책', ''], ['연락처', ''], ...(x.i.districts?.length ? ([['선거구', '']] as [string, string][]) : [])], [24, 76]),
      SPACE(12),
      P(`위 본인은 ${ko(x.d.vote, '○○○○년 ○○월 ○○일')} 실시하는 ${x.name} 노사협의회 근로자위원 선거에 입후보하고자 신청합니다.`, 16),
      RIGHT('년      월      일'),
      RIGHT('신청인                    (서명)'),
      SPACE(12),
      P(`${COMMITTEE} 귀중`),
      NOTE(`입후보 기간: ${ko(x.d.candidacyStart)}부터 ${ko(x.d.candidacyEnd)}까지`),
    ],
  };
}

// ── 04 후보자 공고 ─────────────────────────────────────────

const candRows = (x: Ctx, extra: (c: CandidateInput) => string[] = () => []) => {
  const cs = x.i.candidates ?? [];
  const n = candidateRows(x.i);
  const ds = !!x.i.districts?.length;
  return Array.from({ length: n }, (_, k) => {
    const c = cs[k] ?? {};
    return [String(k + 1), t(c.name), t(c.dept), ...(ds ? [t(c.district)] : []), ...extra(c)];
  });
};
const candHead = (x: Ctx, extra: string[] = []) => ['기호', '성명', '소속', ...(x.i.districts?.length ? ['선거구'] : []), ...extra];
const widthsFor = (n: number, base: number[]) => {
  const rest = 100 - base.reduce((s, w) => s + w, 0);
  return n > base.length ? [...base, ...Array(n - base.length).fill(rest / (n - base.length))] : base;
};

function candidatesDoc(x: Ctx): FormDoc {
  const b = x.ballot!;
  const head = candHead(x);
  return {
    title: '근로자위원 후보자 공고',
    blocks: [
      ...NOTICE_HEAD('노사협의회 근로자위원 후보자 공고'),
      P(`${ko(x.d.candidacyEnd)} 입후보를 마감하고 후보자를 다음과 같이 공고합니다.`),
      GRID(head, candRows(x), widthsFor(head.length, [12, 30, 30]), 22),
      SPACE(),
      P(b.method === '찬반투표'
        ? `후보자 수(${b.candidates}명)가 뽑을 인원(${b.seats}명) 이하이므로 후보자마다 찬반투표를 한다(무투표 당선은 인정되지 않는다).`
        : `후보자 수(${b.candidates}명)가 뽑을 인원(${b.seats}명)보다 많으므로 득표순으로 정한다.`),
      KV([['투표 일시', voteWhen(x)], ['투표 장소', t(x.i.vote?.place)]]),
      SPACE(8),
      RIGHT(ko(x.d.candidacyEnd, dateKo(x.i.writtenDate))),
      RIGHT(COMMITTEE),
    ],
  };
}

// ── 05 투표용지 ───────────────────────────────────────────

function ballotDoc(x: Ctx): FormDoc {
  const b = x.ballot!;
  const title = '노사협의회 근로자위원 선거 투표용지';
  const yesNo = b.method === '찬반투표';
  const head = candHead(x, yesNo ? ['찬성', '반대'] : ['기표']);
  return {
    title,
    blocks: [
      { kind: 'title', text: title },
      P(`투표일  ${ko(x.d.vote)}`, 4),
      P(yesNo ? '후보자마다 찬성·반대 가운데 한 칸에 기표합니다.' : `${x.i.marksPerBallot ?? '○'}명에게 기표합니다.`, 8),
      GRID(head, candRows(x, () => (yesNo ? ['', ''] : [''])), widthsFor(head.length, [10, 28, 28]), 34),
      ...(x.i.concurrentRep ? [SPACE(), NOTE(`${CONCURRENT} 권한 범위: ${scopeList(x).join(', ')}`)] : []),
      SPACE(10),
      RIGHT(`${COMMITTEE} 확인 (     )`),
    ],
  };
}

// ── 06 개표록 ─────────────────────────────────────────────

function countDoc(x: Ctx): FormDoc {
  const title = '노사협의회 근로자위원 선거 개표록';
  const r = x.i.result;
  const blocks: FormBlock[] = [
    { kind: 'title', text: title },
    KV([['선거일', ko(x.d.vote)], ['투표 장소', t(x.i.vote?.place)], ['개표 일시', ''], ['투표 방식', x.ballot ? `${x.ballot.method}(후보 ${x.ballot.candidates}명 / 뽑을 인원 ${x.ballot.seats}명)` : '']]),
    SPACE(),
    H('1. 참여 확인(근참법 제6조제2항)'),
  ];
  const c = x.check;
  if (c && c.kind === '직접선거') {
    const s = c.workerMembers.stages[0];
    blocks.push(P(`선거인 ${s.electors}명 중 ${s.voters}명 참여 — 필요 ${s.needed}명, 투표율 ${pct(s)}\n결과: ${s.result}`));
  } else if (c) {
    blocks.push(
      GRID(['단계', '모수', '투표자', '필요', '투표율', '결과'], c.workerMembers.stages.map((s) => [s.stage, String(s.electors), String(s.voters), String(s.needed), pct(s), s.result]), [24, 10, 10, 10, 12, 34]),
      P(`종합 결과: ${c.workerMembers.result}`),
    );
  } else {
    blocks.push(KV([['선거인 수', ''], ['투표자 수', ''], ['필요 투표자 수(과반수)', ''], ['결과', '']]));
  }
  if (r?.invalid != null) blocks.push(P(`무효표 ${r.invalid}표`));
  blocks.push(NOTE(`선거인 범위: ${ELECTOR_SCOPE}`), H('2. 후보자별 결과'));
  const won = new Set(x.winners ?? []);
  const mark = (cnd: CandidateInput) => (won.has(cnd) ? '당선' : '');
  if (x.ballot?.method === '찬반투표') {
    const head = candHead(x, ['찬성', '반대', '당선 여부']);
    blocks.push(
      GRID(head, candRows(x, (cnd) => [cnd.inFavor != null ? String(cnd.inFavor) : '', cnd.against != null ? String(cnd.against) : '', mark(cnd)]), widthsFor(head.length, [10, 22, 22])),
      NOTE('찬반투표의 당선 기준은 선거관리규정에서 정한 기준에 따른다. 이 서류는 찬성·반대 수를 적고, 당선 여부는 선거관리위원회가 적는다.'),
    );
  } else {
    const rank = new Map<CandidateInput, number>();
    const cs = x.i.candidates ?? [];
    if (cs.length && cs.every((cnd) => cnd.votes != null)) [...cs].sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0)).forEach((cnd, k, arr) => rank.set(cnd, k && arr[k - 1].votes === cnd.votes ? rank.get(arr[k - 1])! : k + 1));
    const head = candHead(x, ['득표수', '순위', '당선 여부']);
    blocks.push(
      GRID(head, candRows(x, (cnd) => [cnd.votes != null ? String(cnd.votes) : '', rank.get(cnd) ? String(rank.get(cnd)) : '', mark(cnd)]), widthsFor(head.length, [10, 22, 22])),
      NOTE(`득표순으로 뽑을 인원(${x.i.seats}명)만큼 당선. 동점자는 협의회규정의 기준(${t(x.i.tieBreak) || '○○'})으로 정한다. 당선되지 않은 후보의 득표순은 보궐 선출에 쓴다(시행령 제4조).`),
    );
  }
  blocks.push(
    H('3. 확인'),
    P('위와 같이 개표하였음을 확인합니다.'),
    GRID(['구분', '성명', '서명'], [['선거관리위원회 위원장', '', ''], ['위원', '', ''], ['참관인', '', '']], [40, 30, 30], 26),
  );
  return { title, blocks };
}

// ── 07 당선공고 ───────────────────────────────────────────

function participation(c: ElectionCheck | null): string | undefined {
  if (!c?.workerMembers.met) return undefined;
  if (c.kind === '직접선거') return directParticipation(c.workerMembers.stages[0]);
  if (c.kind === '간접선거') {
    const [s1, s2] = c.workerMembers.stages;
    return `1단계 선거인 ${s1.electors}명 중 ${s1.voters}명, 2단계 위원선거인 ${s2.electors}명 중 ${s2.voters}명이 참여하여 단계마다 과반수 참여 요건을 충족하였습니다(근참법 제6조제2항 단서).`;
  }
  return `선거구 ${c.workerMembers.stages.length}곳 모두 선거인 과반수가 참여하여 근로자 과반수 참여 요건을 충족하였습니다(근참법 제6조제2항).`;
}

function winnerDoc(x: Ctx): FormDoc {
  const yesNo = x.ballot?.method === '찬반투표';
  return winnerNoticeDoc({
    electionDate: x.d.vote,
    termStart: x.d.termStart,
    participation: participation(x.check),
    concurrentRep: x.i.concurrentRep,
    scope: x.i.concurrentScope,
    winners: x.winners?.map((c) => ({ name: c.name, dept: c.dept, votes: yesNo ? (c.inFavor != null ? `찬성 ${c.inFavor} · 반대 ${c.against ?? 0}` : '') : c.votes != null ? String(c.votes) : '' })),
    written: x.d.winnerNotice ?? x.i.writtenDate,
  });
}

// ── 묶음 ─────────────────────────────────────────────────

const BUILD: Record<ElectionDocId, (x: Ctx) => FormDoc> = {
  '01_선관위구성공고': committeeDoc,
  '02_선거공고문': announceDoc,
  '03_입후보신청서': candidacyDoc,
  '04_후보자공고': candidatesDoc,
  '05_투표용지': ballotDoc,
  '06_개표록': countDoc,
  '07_당선공고': winnerDoc,
};

/** electionDocsErrors 가 빈 때 부른다. only 를 주면 그 서류만 */
export function electionDocs(input: ElectionDocsInput, only?: readonly string[]) {
  const x = ctx(input);
  const want = ELECTION_DOC_IDS.filter((id) => !only?.length || only.includes(id));
  const made: { id: ElectionDocId; doc: FormDoc }[] = [];
  const skipped: { id: ElectionDocId; reason: string }[] = [];
  for (const id of want) {
    if ((id === '04_후보자공고' || id === '05_투표용지') && !x.ballot) {
      skipped.push({ id, reason: '후보가 정해지지 않아 만들지 않음 — candidates 나 candidateCount 를 넣는다(후보 수 ≤ 정원이면 찬반형)' });
    } else if (id === '07_당선공고' && x.check && !x.check.workerMembers.met) {
      skipped.push({ id, reason: `근로자 과반수 참여 미달(${x.check.workerMembers.result}) — 재투표 뒤 만든다` });
    } else {
      made.push({ id, doc: BUILD[id](x) });
    }
  }
  return { made, skipped, warnings: x.warnings, dates: x.d, ballot: x.ballot, check: x.check, elected: x.elected };
}
