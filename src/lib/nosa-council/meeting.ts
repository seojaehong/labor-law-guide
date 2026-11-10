// 노사협의회 회의 확인 — 통보 기한·정기회의 3개월·개최 정족수·안건별 의결·보고사항·의결사항 공지 기한.
// 설계 = 노사협의회신고 스킬 references/practice-docs-spec-261110.md(261110) 「check_council_meeting」.
// 정족수는 assess.ts quorumMeeting(정원 기준, 3분의 2 올림), 통보 기한은 deadline(…, '소집')(개최일 − 8일)을 그대로 쓴다.
// 원격 도구(check_council_meeting)와 회의 서류(소집 통보·회의자료·회의록·공지)가 이 한 함수의 결과를 같이 쓴다 — 서로 어긋나지 않게.
// 설계서와 다르게 한 곳: 정기회의 간격. 설계서는 「직전 정기회의부터 3개월 이내」라고 적었으나 manual-crosscheck B11
// (노사관계법제과-1591, 매뉴얼 122쪽)은 「3개월마다」를 「3개월 기간마다 1회 이상(직전 회의 + 3개월이 아님)」으로 본다.
// 그래서 3개월 안이면 「3개월 이내」, 3~6개월은 「확인 필요」(규정상 기간 확인), 6개월 초과는 「빈 기간 있음」으로 알리기만 하고 서류를 막지 않는다.
import { addDays, CONVENE_NOTICE_DAYS, deadline, isoDate, quorumMeeting, REGULAR_MEETING_MONTHS, type Deadline } from './assess';

export type MeetingKind = '정기' | '임시';
export type AgendaType = '보고' | '협의' | '의결';

/** 법 제20조제1항 — 협의사항 17개 호(협의회규정 견본 제26조와 한 벌) */
export const COUNCIL_TOPICS = [
  '생산성 향상과 성과 배분',
  '근로자의 채용·배치 및 교육훈련',
  '근로자의 고충처리',
  '안전, 보건, 그 밖의 작업환경 개선과 근로자의 건강증진',
  '인사·노무관리의 제도 개선',
  '경영상 또는 기술상의 사정으로 인한 인력의 배치전환·재훈련·해고 등 고용조정의 일반원칙',
  '작업과 휴게 시간의 운용',
  '임금의 지불방법·체계·구조 등의 제도 개선',
  '신기계·기술의 도입 또는 작업 공정의 개선',
  '작업 수칙의 제정 또는 개정',
  '종업원지주제와 그 밖에 근로자의 재산형성에 관한 지원',
  '직무 발명 등과 관련하여 해당 근로자에 대한 보상에 관한 사항',
  '근로자의 복지증진',
  '사업장 내 근로자 감시 설비의 설치',
  '여성근로자의 모성보호 및 일과 가정생활의 양립을 지원하기 위한 사항',
  '직장 내 성희롱 및 고객 등에 의한 성희롱 예방에 관한 사항',
  '그 밖의 노사협조에 관한 사항',
] as const;
/** 법 제21조 — 의결사항 5개 호(견본 제27조) */
export const COUNCIL_RESOLUTIONS = [
  '근로자의 교육훈련 및 능력개발 기본계획의 수립',
  '복지시설의 설치와 관리',
  '사내근로복지기금의 설치',
  '고충처리위원회에서 의결되지 아니한 사항',
  '각종 노사공동위원회의 설치',
] as const;
/** 법 제22조제1항 — 정기회의 보고·설명 사항(견본 제28조①) */
export const REPORT_ITEMS = ['경영계획 전반 및 실적에 관한 사항', '분기별 생산계획과 실적에 관한 사항', '인력계획에 관한 사항', '기업의 경제적·재정적 상황'] as const;
/** 도구 입력에 쓰는 짧은 이름 — REPORT_ITEMS 와 같은 순서 */
export const REPORT_KEYS = ['경영계획', '생산계획', '인력계획', '재정상황'] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

/** 안건의 법조문 분류 — 키 「20-1」 = 근참법 제20조제1항제1호. 회의록 그래프의 「분류」 선이 이 값에서만 나온다 */
export interface Article {
  key: string;
  law: string;
  text: string;
}
export const ARTICLES: Article[] = [
  ...COUNCIL_TOPICS.map((text, i) => ({ key: `20-${i + 1}`, law: `제20조제1항제${i + 1}호`, text })),
  ...COUNCIL_RESOLUTIONS.map((text, i) => ({ key: `21-${i + 1}`, law: `제21조제${i + 1}호`, text })),
  ...REPORT_ITEMS.map((text, i) => ({ key: `22-${i + 1}`, law: `제22조제1항제${i + 1}호`, text })),
];
export const ARTICLE_KEYS = ARTICLES.map((a) => a.key);
export const articleOf = (key: string | undefined): Article | undefined => ARTICLES.find((a) => a.key === key);

/** 의결사항 공지 기한 기본값 — 협의회규정 견본 제29조(법 제23조는 「신속히」) */
export const RESOLUTION_NOTICE_DAYS = 10;

/** 소집 통보 기한 안내 — 설치·신고 서류(08)와 회의 서류(소집 통보서)가 같은 글을 쓴다 */
export const CONVENE_NOTE = '회의 개최 7일 전까지 위원에게 통보하여야 한다(근참법 제13조제3항). 통보한 날은 세지 않고 개최일 전날까지 7일이 있어야 한다 — 15일 회의면 7일까지 통보.';
/** 회의 공개·비밀 유지 — 회의록 머리에 한 줄(법 제16조·제17조) */
export const OPEN_SECRET_LINE = '협의회의 회의는 공개한다. 다만, 협의회의 의결로 공개하지 아니할 수 있다(법 제16조). 협의회의 위원은 협의회에서 알게 된 비밀을 누설하여서는 아니 된다(법 제17조).';

export interface MeetingAgendaInput {
  type: AgendaType;
  /** 법조문 분류(ARTICLE_KEYS). 「21-」이면 법 제21조 의결사항, 「22-」 보고 안건이면 그 보고사항을 다룬 것 */
  article?: string;
  /** 법 제21조 의결사항(article 이 「21-」이면 자동) */
  resolutionItem?: boolean;
  inFavor?: number;
}

export interface MeetingCheckInput {
  kind: MeetingKind;
  meetingDate: string;
  noticeDate?: string;
  /** 직전 정기회의일(정기회의 간격을 볼 때) */
  previousRegularDate?: string;
  /** 협의회규정상 정원 */
  workerSeats: number;
  employerSeats: number;
  /** 현원(결원이 있을 때) — 정족수는 정원 기준이라 알림에만 쓴다 */
  workerCurrent?: number;
  employerCurrent?: number;
  workerPresent?: number;
  employerPresent?: number;
  agenda?: MeetingAgendaInput[];
  /** 정기회의에서 보고·설명한(할) 사항 */
  reportsCovered?: ReportKey[];
  /** 의결사항 공지 기한(일) — 협의회규정 값. 기본 10 */
  noticeDays?: number;
}

export interface AgendaResult {
  no: number;
  type: AgendaType;
  article?: string;
  resolutionItem: boolean;
  vote: { inFavor: number; present: number; needed: number; passed: boolean; text: string } | null;
  result: '보고' | '협의' | '의결' | '의결되지 않음' | '찬성 수 미입력';
  arbitration?: string;
}

export interface MeetingCheck {
  kind: MeetingKind;
  meetingDate: string;
  /** 소집 통보 기한 */
  convene: Deadline & { noticeDate: string | null; onTime: boolean | null };
  interval: RegularInterval | null;
  quorum: {
    held: boolean;
    seats: { worker: number; employer: number };
    present: { worker: number; employer: number; total: number };
    neededPresent: { worker: number; employer: number };
    text: string;
    basis: string;
    currentNote?: string;
  } | null;
  agenda: AgendaResult[];
  reports: { required: boolean; covered: string[]; missing: string[] };
  resolutionNotice: { due: string; days: number; basis: string } | null;
  warnings: string[];
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 달 더하기 — 그 달에 같은 날이 없으면 그 달 마지막 날 */
export function addMonths(iso: string, n: number): string {
  const d = isoDate(iso);
  if (!d) throw new Error(`날짜 형식은 YYYY-MM-DD: ${iso}`);
  const [y, m, day] = d.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${pad(nm)}-${pad(Math.min(day, last))}`;
}

/** 해 더하기 — 2월 29일은 평년이면 2월 28일 */
export const addYears = (iso: string, n: number) => addMonths(iso, n * 12);

/** 「작성한 날부터 N년간」 보존의 마지막 날 — 민법 제157조(초일 불산입)·제160조.
 *  기산일(작성 다음 날)의 N년 뒤 같은 날의 전날. 그 달에 같은 날이 없으면(2월 29일) 그 달 말일.
 *  예) 2026-12-04 → 2029-12-04 · 2025-02-28 → 2028-02-29 · 2024-02-28 → 2027-02-28 · 2024-02-29 → 2027-02-28 */
export function retentionEnd(written: string, years: number): string {
  const start = addDays(written, 1);
  const [y, m, d] = start.split('-').map(Number);
  const ty = y + years;
  const last = new Date(Date.UTC(ty, m, 0)).getUTCDate();
  return d > last ? `${ty}-${pad(m)}-${pad(last)}` : addDays(`${ty}-${pad(m)}-${pad(d)}`, -1);
}

export type IntervalStatus = '3개월 이내' | '확인 필요' | '빈 기간 있음';
export interface RegularInterval { previous: string; within: string; sixMonths: string; status: IntervalStatus; explanation: string; basis: string }

/** 정기회의 간격 — 3개월 기간마다 1회 이상(B11, 노사관계법제과-1591). 회의 확인·회의록 대장·보관함 대시보드가 같은 규칙을 쓴다.
 *  직전 + 3개월 안 → 3개월 이내, 6개월 안 → 확인 필요(협의회규정의 기간 확인), 6개월 넘음 → 빈 기간 있음 */
export function regularInterval(previous: string, date: string): RegularInterval {
  const within = addMonths(previous, REGULAR_MEETING_MONTHS);
  const sixMonths = addMonths(previous, REGULAR_MEETING_MONTHS * 2);
  const basis = '법 제12조제1항, 노사관계법제과-1591(2019. 5. 29.)·매뉴얼 122쪽';
  if (date <= within) return { previous, within, sixMonths, status: '3개월 이내', explanation: `직전 정기회의(${previous})부터 3개월(${within}) 안에 열린다.`, basis };
  if (date <= sixMonths) {
    return {
      previous, within, sixMonths, status: '확인 필요', basis,
      explanation: `직전 정기회의(${previous})부터 3개월(${within})이 지났다. 「3개월마다」는 3개월 기간마다 1회 이상이라는 뜻이므로(직전 회의 + 3개월이 아니다) 협의회규정이 정한 기간(분기 등)마다 한 번씩 열렸는지 확인한다.`,
    };
  }
  return {
    previous, within, sixMonths, status: '빈 기간 있음', basis,
    explanation: `직전 정기회의(${previous})부터 6개월(${sixMonths})이 지나 정기회의를 열지 않은 3개월 기간이 있다(정기회의 미개최는 200만원 이하 벌금, 법 제32조). 근로자위원 미선출 등 사용자 책임이 없는 사유였다면 미개최 위반이 아니다.`,
  };
}

const int0 = (n: number | undefined) => n == null || (Number.isInteger(n) && n >= 0);

/** 형식·앞뒤가 맞지 않는 입력 */
export function meetingErrors(i: MeetingCheckInput): string[] {
  const out: string[] = [];
  for (const k of ['meetingDate', 'noticeDate', 'previousRegularDate'] as const) {
    const v = i[k];
    if ((k === 'meetingDate' || v) && !isoDate(v)) out.push(`${k} 는 YYYY-MM-DD 날짜입니다(받은 값: ${v ?? ''}).`);
  }
  const md = isoDate(i.meetingDate);
  const nd = isoDate(i.noticeDate);
  const pd = isoDate(i.previousRegularDate);
  if (md && nd && nd > md) out.push(`통보일(${nd})이 개최일(${md}) 뒤입니다.`);
  if (md && pd && pd >= md) out.push(`직전 정기회의일(${pd})이 개최일(${md})보다 앞서야 합니다.`);
  for (const [k, v] of [['근로자위원 정원', i.workerSeats], ['사용자위원 정원', i.employerSeats]] as const) {
    if (!Number.isInteger(v) || v < 1) out.push(`${k}은 1 이상의 정수입니다(받은 값: ${v}).`);
  }
  for (const [k, v] of [['근로자위원 현원', i.workerCurrent], ['사용자위원 현원', i.employerCurrent], ['근로자위원 출석', i.workerPresent], ['사용자위원 출석', i.employerPresent]] as const) {
    if (!int0(v)) out.push(`${k}은 0 이상의 정수입니다(받은 값: ${v}).`);
  }
  if ((i.workerPresent == null) !== (i.employerPresent == null)) out.push('근로자위원·사용자위원 출석 수는 함께 넣습니다.');
  const over = (v: number | undefined, max: number | undefined, label: string, of: string) => {
    if (v != null && max != null && v > max) out.push(`${label}(${v}명)이 ${of}(${max}명)보다 많습니다.`);
  };
  over(i.workerCurrent, i.workerSeats, '근로자위원 현원', '정원');
  over(i.employerCurrent, i.employerSeats, '사용자위원 현원', '정원');
  over(i.workerPresent, i.workerCurrent ?? i.workerSeats, '근로자위원 출석', i.workerCurrent != null ? '현원' : '정원');
  over(i.employerPresent, i.employerCurrent ?? i.employerSeats, '사용자위원 출석', i.employerCurrent != null ? '현원' : '정원');
  const present = i.workerPresent != null && i.employerPresent != null ? i.workerPresent + i.employerPresent : null;
  for (const [k, a] of (i.agenda ?? []).entries()) {
    if (a.inFavor == null) continue;
    if (a.type === '보고') out.push(`안건 ${k + 1}은 보고 안건이라 찬성 수를 넣지 않습니다(표결은 협의·의결 안건에서만).`);
    else if (!int0(a.inFavor)) out.push(`안건 ${k + 1} 찬성 수는 0 이상의 정수입니다.`);
    else if (present == null) out.push(`안건 ${k + 1} 찬성 수를 넣으려면 출석 수(workerPresent·employerPresent)를 함께 넣습니다.`);
    else if (a.inFavor > present) out.push(`안건 ${k + 1} 찬성(${a.inFavor}명)이 출석위원(${present}명)보다 많습니다.`);
  }
  for (const [k, a] of (i.agenda ?? []).entries()) if (a.article && !articleOf(a.article)) out.push(`안건 ${k + 1} 법조문 분류(${a.article})는 20-1~20-17, 21-1~21-5, 22-1~22-4 중 하나입니다.`);
  if (i.noticeDays != null && (!Number.isInteger(i.noticeDays) || i.noticeDays < 1 || i.noticeDays > 60)) out.push('의결사항 공지 기한(noticeDays)은 1~60일입니다.');
  return out;
}

/** meetingErrors 가 빈 때 부른다. today 는 KST 오늘(YYYY-MM-DD) */
export function meetingCheck(i: MeetingCheckInput, today: string): MeetingCheck {
  const md = isoDate(i.meetingDate)!;
  const warnings: string[] = [];

  // ① 통보 기한 — 개최일 − 8일(통보일 불산입, 개최일 전 7일)
  const d = deadline(md, '소집', today);
  const nd = isoDate(i.noticeDate);
  const onTime = nd ? nd <= d.due : null;
  if (onTime === false) warnings.push(`통보일(${nd})이 기한(${d.due})보다 늦다 — 회의 개최 ${CONVENE_NOTICE_DAYS}일 전까지 통보해야 한다(법 제13조제3항). 개최일을 미루거나 다시 통보한다.`);

  // ② 정기회의 3개월 — 3개월 기간마다 1회 이상(B11). 막지 않고 알린다
  const pd = isoDate(i.previousRegularDate);
  const interval = i.kind === '정기' && pd ? regularInterval(pd, md) : null;
  if (interval && interval.status !== '3개월 이내') warnings.push(interval.explanation);

  // ③ 개최 정족수 — 정원 기준 각 과반(노사관계법제과-3091)
  let quorum: MeetingCheck['quorum'] = null;
  let q: ReturnType<typeof quorumMeeting> | null = null;
  if (i.workerPresent != null && i.employerPresent != null) {
    q = quorumMeeting(i.workerSeats, i.employerSeats, i.workerPresent, i.employerPresent);
    const head = `근로자위원 ${i.workerSeats}명 중 ${i.workerPresent}명, 사용자위원 ${i.employerSeats}명 중 ${i.employerPresent}명 출석`;
    const shortW = i.workerPresent < q.neededPresent.worker;
    const shortE = i.employerPresent < q.neededPresent.employer;
    const who = shortW && shortE
      ? `근로자위원 과반수(${q.neededPresent.worker}명)·사용자위원 과반수(${q.neededPresent.employer}명)`
      : shortW ? `근로자위원 과반수(${q.neededPresent.worker}명)` : `사용자위원 과반수(${q.neededPresent.employer}명)`;
    const text = q.held ? `${head} — 각 과반수 출석으로 개회` : `${head} — ${who}에 미달하여 회의가 성립하지 않음`;
    const cur = [
      ...(i.workerCurrent != null && i.workerCurrent < i.workerSeats ? [`근로자위원 정원 ${i.workerSeats}명(현원(${i.workerCurrent}명) 아님)`] : []),
      ...(i.employerCurrent != null && i.employerCurrent < i.employerSeats ? [`사용자위원 정원 ${i.employerSeats}명(현원(${i.employerCurrent}명) 아님)`] : []),
    ];
    quorum = {
      held: q.held,
      seats: { worker: i.workerSeats, employer: i.employerSeats },
      present: { worker: i.workerPresent, employer: i.employerPresent, total: q.present },
      neededPresent: q.neededPresent,
      text,
      basis: q.basis,
      ...(cur.length ? { currentNote: `정족수는 협의회규정상 정원 기준이다 — ${cur.join(', ')}. 결원은 30일 이내에 보궐한다(시행령 제4조).` } : {}),
    };
    if (!q.held) warnings.push(`${text}. 의결은 할 수 없다.`);
  }

  // ④·⑤ 안건별 의결 — 출석위원 3분의 2 이상(올림). 법 제21조 의결사항이 의결되지 않으면 임의중재(법 제25조)
  const agenda: AgendaResult[] = (i.agenda ?? []).map((a, k) => {
    const no = k + 1;
    const resolutionItem = !!a.resolutionItem || !!a.article?.startsWith('21-');
    let vote: AgendaResult['vote'] = null;
    let result: AgendaResult['result'];
    if (a.inFavor != null && q) {
      const passed = q.held && a.inFavor >= q.neededInFavor;
      const text = !q.held
        ? `출석위원 ${q.present}명 중 ${a.inFavor}명 찬성 — 회의가 성립하지 않아 의결되지 않음`
        : passed
          ? `출석위원 ${q.present}명 중 ${a.inFavor}명 찬성 — 3분의 2 이상으로 의결`
          : `출석위원 ${q.present}명 중 ${a.inFavor}명 찬성 — 3분의 2(${q.neededInFavor}명)에 미달하여 의결되지 않음`;
      vote = { inFavor: a.inFavor, present: q.present, needed: q.neededInFavor, passed, text };
      result = passed ? '의결' : '의결되지 않음';
    } else {
      result = a.type === '의결' ? '찬성 수 미입력' : a.type;
    }
    const out: AgendaResult = { no, type: a.type, ...(a.article ? { article: a.article } : {}), resolutionItem, vote, result };
    if (resolutionItem && a.type !== '의결') warnings.push(`안건 ${no}은 법 제21조 의결사항이라 협의회의 의결을 거쳐야 한다 — [의결] 안건으로 올린다.`);
    if (resolutionItem && vote && !vote.passed) {
      out.arbitration = '법 제21조 의결사항을 의결하지 못했다 — 근로자위원과 사용자위원의 합의로 협의회에 중재기구를 두어 해결하거나 노동위원회 등 제삼자의 중재를 받을 수 있다(법 제25조제1항제1호).';
      warnings.push(`안건 ${no}: ${out.arbitration}`);
    }
    return out;
  });

  // ⑥ 정기회의 보고사항(법 제22조제1항) 4개
  // 「22-k」로 분류한 보고 안건도 그 보고사항을 다룬 것으로 센다
  const covered = new Set<string>([
    ...(i.reportsCovered ?? []),
    ...(i.agenda ?? []).flatMap((a) => (a.type === '보고' && a.article?.startsWith('22-') ? [REPORT_KEYS[Number(a.article.slice(3)) - 1]] : [])),
  ]);
  const required = i.kind === '정기';
  const missing = required ? REPORT_KEYS.map((key, k) => (covered.has(key) ? null : REPORT_ITEMS[k])).filter((x): x is (typeof REPORT_ITEMS)[number] => !!x) : [];
  if (missing.length) {
    warnings.push(`정기회의 보고사항(법 제22조제1항) 중 빠진 것: ${missing.join(', ')}. 사용자가 보고·설명하지 않으면 근로자위원은 자료 제출을 요구할 수 있다(법 제22조제3항).`);
  }

  // ⑦ 의결사항 공지 기한 — 협의회규정 기준(견본 제29조 10일)
  const days = i.noticeDays ?? RESOLUTION_NOTICE_DAYS;
  const anyPassed = agenda.some((a) => a.vote?.passed);
  const resolutionNotice = anyPassed
    ? { due: addMonthsDays(md, days), days, basis: `협의회규정(견본 제29조 — 의결한 날부터 ${RESOLUTION_NOTICE_DAYS}일 이내, 규정이 다르면 그 값). 법 제23조는 「신속히」 널리 알리도록 한다.` }
    : null;

  return {
    kind: i.kind,
    meetingDate: md,
    convene: { ...d, noticeDate: nd, onTime },
    interval,
    quorum,
    agenda,
    reports: { required, covered: REPORT_KEYS.filter((k) => covered.has(k)).map((k) => REPORT_ITEMS[REPORT_KEYS.indexOf(k)]), missing },
    resolutionNotice,
    warnings,
  };
}

/** 날 더하기(assess.addDays 와 같은 UTC 계산) — 공지 기한 */
function addMonthsDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
