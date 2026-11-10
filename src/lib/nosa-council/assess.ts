// 노사협의회 설치·선출·신고 — 근로자참여 및 협력증진에 관한 법률(근참법)의 숫자 규칙.
// 정본은 이 파일이다. 출발점은 노사협의회신고 스킬의 assess.py(261110, 매뉴얼·행정해석 대조 반영판)이고, 회귀시험 17건을 그대로 옮겼다.
//   tests/unit/nosa-council-assess.test.ts
// 순수 함수만 둔다 — 파일·네트워크·현재 시각을 읽지 않는다. 「오늘」은 부르는 쪽이 KST 날짜로 넘긴다.
// ★ 공개 문구 금지어(src/lib/tool-kit/banned.ts)를 결과 글자에 쓰지 않는다. 파이썬판의 「판정」은 「확인」·「결과」로 바꿨다.
// ★ 근로자대표 겸임은 두 기준(행정해석 기준 / 과반 지지 기준)을 따로 낸다. 하나로 합친 결과를 내지 않는다.
// 근거 상세는 스킬 references/legal-basis.md · manual-crosscheck-261110.md(법제처 원문·매뉴얼 대조).

// ── 법정 상수(법제처 원문 확인 260820 · 시행령 261110) ─────────────
/** 법 제4조제1항 단서 — 상시 30명 미만은 설치 대상에서 제외 */
export const INSTALL_THRESHOLD = 30;
/** 법 제6조제1항 — 노사 동수, 각 3명 이상 10명 이하 */
export const MEMBERS_MIN = 3;
export const MEMBERS_MAX = 10;
/** 법 제27조제1항 — 노사를 대표하는 3명 이내 */
export const GRIEVANCE_MAX = 3;
/** 법 제18조제1항 — 협의회를 설치한 날부터 15일 이내 협의회규정 제출 */
export const REPORT_DAYS = 15;
/** 법 제28조제1항 — 고충사항 청취일부터 10일 이내 처리결과 통보 */
export const GRIEVANCE_NOTICE_DAYS = 10;
/** 법 제13조제3항 — 회의 개최 7일 전 통보 */
export const CONVENE_NOTICE_DAYS = 7;
/** 법 제8조제1항 */
export const TERM_YEARS = 3;
/** 법 제12조제1항 — 3개월마다(3개월 기간마다 1회 이상) */
export const REGULAR_MEETING_MONTHS = 3;
/** 법 제19조제2항 */
export const MINUTES_KEEP_YEARS = 3;
/** 시행령 제9조 — 고충사항 접수·처리대장 */
export const GRIEVANCE_LEDGER_KEEP_YEARS = 1;
/** 시행령 제4조 — 결원 보궐 */
export const VACANCY_DAYS = 30;

/** 회의록 법정 기재사항 — 법 제19조제1항 각 호(원문) */
export const MINUTES_REQUIRED = ['개최 일시 및 장소', '출석 위원', '협의 내용 및 의결된 사항', '그 밖의 토의사항'] as const;

/** 협의회규정 필수기재 — 시행령 제5조제1항 각 호(원문) */
export const REGULATION_REQUIRED = [
  '협의회의 위원의 수',
  '근로자위원의 선출 절차와 후보 등록에 관한 사항',
  '사용자위원의 자격에 관한 사항',
  '법 제9조제3항에 따라 협의회 위원이 근로한 것으로 보는 시간에 관한 사항',
  '협의회의 회의 소집, 회기, 그 밖에 협의회의 운영에 관한 사항',
  '법 제25조에 따른 임의 중재의 방법·절차 등에 관한 사항',
  '고충처리위원의 수 및 고충처리에 관한 사항',
] as const;

/** 벌칙 — 법 제30조~제33조(원문) */
export const PENALTIES: { act: string; penalty: string }[] = [
  { act: '협의회 설치 거부·방해(법 제4조제1항)', penalty: '1천만원 이하 벌금 (법 제30조제1호)' },
  { act: '의결사항 미이행(법 제24조)', penalty: '1천만원 이하 벌금 (법 제30조제2호)' },
  { act: '중재 결정 미이행(법 제25조제2항)', penalty: '1천만원 이하 벌금 (법 제30조제3호)' },
  { act: '시정명령 미이행·자료제출 의무 미이행', penalty: '500만원 이하 벌금 (법 제31조)' },
  { act: '정기회의 미개최(법 제12조제1항)', penalty: '200만원 이하 벌금 (법 제32조)' },
  { act: '고충처리위원 미설치(법 제26조)', penalty: '200만원 이하 벌금 (법 제32조)' },
  { act: '협의회규정 미제출(법 제18조)', penalty: '200만원 이하 과태료 (법 제33조제1항)' },
];

/** 근로자대표 겸임 근거 — 엘박스 + 이레이버 두 출처 대조(261110). 서류(05·07)와 도구 결과가 같은 글을 쓴다.
 *  -263 은 회시일이 토요일로 적혀 있고 본문에 일자가 없어, -994 는 원문 미확인이라 싣지 않는다.
 *  근로기준팀-8048(2007)은 「주지시킨 상태에서 근로자의 의사를 모으는 적당한 방법」으로 후속 회시보다 넓어 쓰지 않는다.
 *  「과반수 지지」는 매뉴얼 95쪽 문장에만 있다. */
export const REP_BASIS_ADMIN = '고용노동부 근로기준정책과-1140(2023. 4. 7.), 근로기준정책과-221(2021. 1. 20.)';
export const REP_BASIS_SUPPORT = '고용노동부 「노사협의회 운영 매뉴얼」(2022. 12.) 95쪽';

/** 서류 이름 — 파이썬판은 「…판정서」였다. 「판정」은 직무 표방 금지어(NOW.md · src/lib/tool-kit/banned.ts)라 「확인서」로 쓴다.
 *  되돌리려면 여기만 고친다(정족수 서류 이름은 선출방식 산출물·선거관리규정 제8조·일정 단계가 함께 쓴다). */
export const DOC_NAMES = {
  install: '노사협의회 설치의무 확인서',
  method: '근로자위원 선출방식 확인서',
  quorum: '근로자위원 선출 정족수 확인서',
  quorumShort: '정족수 확인서',
} as const;

/** 협의회 결과에 늘 붙이는 경계 문구 */
export const BOUNDARY_NOTICE = [
  '본 협의회의 협의·의결은 근로기준법 제94조제1항 단서에 따른 취업규칙 불이익변경 동의를 갈음하지 않는다.',
  '근로자참여 및 협력증진에 관한 법률에 따른 근로자위원의 지위는 근로기준법상 근로자대표의 지위와 별개다.',
] as const;

// ── 날짜(YYYY-MM-DD 글자, UTC 셈 — 지역 시각에 끌리지 않는다) ─────────

/** YYYY-MM-DD 또는 YYYYMMDD → YYYY-MM-DD. 날짜가 아니면 null */
export function isoDate(s: string | undefined | null): string | null {
  const m = String(s ?? '').trim().match(/^(\d{4})-?(\d{2})-?(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function mustDate(s: string): string {
  const d = isoDate(s);
  if (!d) throw new Error(`날짜는 YYYY-MM-DD 로 적습니다: ${s}`);
  return d;
}

const utc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

/** 날짜 + n일 */
export function addDays(iso: string, n: number): string {
  return new Date(utc(mustDate(iso)) + n * 86_400_000).toISOString().slice(0, 10);
}

/** b − a (일) */
export function daysBetween(a: string, b: string): number {
  return Math.round((utc(mustDate(b)) - utc(mustDate(a))) / 86_400_000);
}

// ── 파이썬 round() — 두 배 정밀도 값의 실제 십진 전개에서 반올림하고, 딱 반이면 짝수 쪽 ──
// Math.round(x*100)/100 은 반을 올려 파이썬과 갈린다(투표율 선거인 1~1000 전수 501,500건 중 563건, 예: 32명 중 1명 3.125 → 3.12).

/** 파이썬 round(x, nd) 와 같은 값 */
export function pyRound(x: number, nd = 2): number {
  if (!Number.isFinite(x)) return x;
  const neg = x < 0;
  // toFixed(100) 은 이 크기(투표율 0~100)의 두 배 정밀도 값을 끝자리까지 그대로 적는다
  const [ip, fp] = Math.abs(x).toFixed(100).split('.');
  const keep = fp.slice(0, nd);
  const rest = fp.slice(nd);
  let n = BigInt(ip + keep);
  const first = rest[0] ?? '0';
  const tail = rest.slice(1);
  const one = BigInt(1);
  const up = first > '5' || (first === '5' && (/[1-9]/.test(tail) || n % BigInt(2) === one));
  if (up) n += one;
  const s = n.toString().padStart(nd + 1, '0');
  const v = Number(nd ? `${s.slice(0, -nd)}.${s.slice(-nd)}` : s);
  return neg ? -v : v;
}

/** 과반수 — n 의 절반을 넘는 가장 작은 정수(파이썬 n // 2 + 1) */
export const majority = (n: number) => Math.floor(n / 2) + 1;

// ── 설치의무 ───────────────────────────────────────────

export interface Installation {
  required: boolean;
  threshold: number;
  headcount: number;
  basis: string;
  unitBasis: string;
  result: string;
  sanction: string;
  countNote: string;
}

/** 법 제4조제1항 단서. 상시 30명 미만은 설치 대상에서 제외된다. 시행령 제2조는 지역 분산 시 설치 장소를 정한다 */
export function installation(headcount: number): Installation {
  const required = headcount >= INSTALL_THRESHOLD;
  return {
    required,
    threshold: INSTALL_THRESHOLD,
    headcount,
    basis: '근참법 제4조제1항 단서',
    unitBasis:
      '근로조건에 대한 결정권이 있는 사업이나 사업장 단위(법 제4조제1항 본문). ' +
      '근로자가 지역별로 분산되어 있어도 하나의 사업 전체가 30명 이상이면 주된 사무소에 설치(시행령 제2조)',
    result: required ? '설치 의무 있음' : '설치 의무 없음(임의 설치는 가능)',
    sanction: '설치를 정당한 사유 없이 거부·방해하면 1천만원 이하 벌금(법 제30조제1호)',
    // 매뉴얼 26쪽 · 노사68107-137(1997. 6. 5.)
    countNote: '상시 근로자 수에는 기간제·단시간·일용·해외 파견 근로자를 넣고, 파견근로자(사용사업주 쪽)는 넣지 않는다(고용노동부 노사협의회 운영 매뉴얼 26쪽).',
  };
}

// ── 선출방식 ───────────────────────────────────────────

export type Method = '위촉' | '간접선거' | '직접선거';

export interface Selection {
  method: Method;
  basis: string;
  explanation: string;
  indirectReason?: string;
  caution?: string;
  documents: string[];
}

/** 간접선거를 고를 수 있는 「부득이한 경우」 — 매뉴얼 33·55쪽 */
export const INDIRECT_REASONS = ['사무직·기술직·기능직 사업장이 따로 있다', '작업부서별 특성이 현저히 다르다'] as const;

/** 법 제6조제2항·제3항. 과반수 노동조합이 있으면 선거가 아니라 위촉이다 */
export function selection(majorityUnion: boolean, indirectReason?: string | null): Selection {
  if (majorityUnion) {
    return {
      method: '위촉',
      basis: '근참법 제6조제3항',
      explanation: '근로자의 과반수로 조직된 노동조합이 있으므로 근로자위원은 노동조합의 대표자와 그 노동조합이 위촉하는 자로 한다. 선거를 실시하지 않는다.',
      documents: ['위촉통지서', '위촉 근거 확인서'],
    };
  }
  if (indirectReason) {
    return {
      method: '간접선거',
      basis: '근참법 제6조제2항 단서',
      explanation: '부서별로 근로자 수에 비례하여 위원선거인을 선출한 뒤, 위원선거인이 근로자위원을 선출한다.',
      indirectReason,
      caution: '1단계(근로자 과반수 참여)와 2단계(위원선거인 과반수 참여) 정족수를 각각 충족해야 한다. 간접선거는 예외이므로 부득이한 사유를 문서로 남긴다.',
      documents: ['선거관리규정', '선거공고문', '입후보 신청서', '선거인명부', '위원선거인 명부', '투표용지', `${DOC_NAMES.quorumShort}(2단계)`, '당선공고'],
    };
  }
  return {
    method: '직접선거',
    basis: '근참법 제6조제2항 본문',
    explanation: '근로자 과반수가 참여하여 직접·비밀·무기명 투표로 선출한다.',
    documents: ['선거관리규정', '선거공고문', '입후보 신청서', '선거인명부', '투표용지', DOC_NAMES.quorumShort, '당선공고'],
  };
}

// ── 위원 수 ────────────────────────────────────────────

export interface Members {
  worker: number;
  employer: number;
  source: string;
  withinRange: boolean;
  warnings: string[];
}

/** 법 제6조제1항. 노사 동수, 각 3~10명. 둘 다 비면 서식 채움용 자리값(법정 기준 아님)을 낸다 */
export function members(worker?: number | null, employer?: number | null, headcount = 0): Members {
  if (worker == null && employer == null) {
    // 법정 권고 규모는 없다. 매뉴얼 43쪽은 설치준비위원회가 기업 규모를 고려해 정하라고만 한다.
    const n = headcount < 100 ? 3 : headcount < 300 ? 5 : 7;
    return { worker: n, employer: n, source: '자리값(법정 기준 없음 - 설치준비위원회가 정할 것)', withinRange: true, warnings: [] };
  }
  const a = (worker ?? employer) as number;
  const b = (employer ?? worker) as number;
  const warnings: string[] = [];
  if (a !== b) warnings.push(`노사 동수가 아니다(법 제6조제1항). 근로자위원 ${a}명 / 사용자위원 ${b}명`);
  for (const [name, v] of [['근로자위원', a], ['사용자위원', b]] as const) {
    if (!(MEMBERS_MIN <= v && v <= MEMBERS_MAX)) warnings.push(`${name} 수 ${v}명이 법정 범위(각 ${MEMBERS_MIN}~${MEMBERS_MAX}명)를 벗어난다.`);
  }
  return { worker: a, employer: b, source: '입력값', withinRange: !warnings.length, warnings };
}

// ── 선거 정족수 ────────────────────────────────────────

export const ELECTOR_SCOPE =
  '근로기준법 제2조의 근로자에서 같은 조의 사용자(근로자와 사용자의 이중 지위자 포함)를 뺀 인원. ' +
  '기간제·단시간 근로자도 포함한다(고용노동부 노사협의회 운영 매뉴얼 45·51쪽).';

export interface QuorumStage {
  stage: string;
  electors: number;
  voters: number;
  needed: number;
  /** 투표율(%) — 파이썬 round(율, 2) 와 같은 값 */
  turnout: number;
  met: boolean;
  result: string;
  basis: string;
  electorScope: string;
  caution: string;
}

/** 법 제6조제2항 본문. 「근로자 과반수가 참여하여」 = 투표 참여 요건. 찬성률이 아니다.
 *  법제처 23-0845(2023. 11. 17.): 「참여할 수 있는」으로 읽을 수 없고 실제 참여가 필요하다 */
export function quorumDirect(electors: number, voters: number): QuorumStage {
  const needed = majority(electors);
  const met = voters >= needed;
  const rate = electors ? (voters / electors) * 100 : 0;
  return {
    stage: '직접선거',
    electors,
    voters,
    needed,
    turnout: pyRound(rate, 2),
    met,
    result: met ? '근로자 과반수 참여 충족' : '근로자 과반수 참여 미달 - 선출 불성립, 재투표 필요',
    basis: '근참법 제6조제2항 본문',
    electorScope: ELECTOR_SCOPE,
    caution: '과반수는 참여(투표율) 요건이다. 찬성률과 혼동하지 말 것.',
  };
}

export interface District {
  label?: string;
  electors: number;
  voters: number;
}

export interface QuorumSet {
  stages: QuorumStage[];
  met: boolean;
  result: string;
}

/** 선거구를 나눠 뽑으면 선거구별로 과반 참여를 본다(매뉴얼 44쪽). 보궐 선출에도 같다 */
export function quorumDistricts(list: District[]): QuorumSet {
  const stages = list.map((g, i) => ({ ...quorumDirect(g.electors, g.voters), stage: `선거구 ${g.label ?? String(i + 1)}` }));
  const met = stages.every((r) => r.met);
  return { stages, met, result: met ? '전 선거구 과반수 참여 충족' : '미달 선거구 재투표 필요' };
}

/** 법 제6조제2항 단서. 1·2단계를 각각 충족해야 한다 */
export function quorumIndirect(electors: number, voters: number, delegateElectors: number, delegateVoters: number): QuorumSet {
  const s1 = { ...quorumDirect(electors, voters), stage: '1단계(위원선거인 선출)', basis: '근참법 제6조제2항 단서' };
  const s2 = { ...quorumDirect(delegateElectors, delegateVoters), stage: '2단계(근로자위원 선출)', basis: '근참법 제6조제2항 단서' };
  const met = s1.met && s2.met;
  return { stages: [s1, s2], met, result: met ? '1·2단계 모두 충족' : '미충족 단계 재투표 필요' };
}

export interface Ballot {
  candidates: number;
  seats: number;
  voteRequired: true;
  method: '찬반투표' | '다수득표';
  basis: string;
  warning?: string;
}

/** 무투표 당선은 인정되지 않는다. 후보 수가 정원 이하면 찬반투표(매뉴얼 48쪽) */
export function ballot(candidates: number, seats: number): Ballot {
  const r: Ballot = {
    candidates,
    seats,
    voteRequired: true,
    method: candidates <= seats ? '찬반투표' : '다수득표',
    basis: '근참법 제6조제2항(2022. 12. 11. 시행) - 과반수 참여 직접·비밀·무기명 투표 필수',
  };
  if (candidates < seats) r.warning = '후보가 정원보다 적다. 추가 모집하거나 결원 처리 방법을 선거관리위원회가 정할 것.';
  return r;
}

export interface WorkerRep {
  kind: string;
  /** 행정해석 기준 — 선출 당시 권한 부여 사실 주지 + 근로자 과반수 투표 참여 */
  adminInterpretation: { met: boolean; notified: boolean; majorityTurnout: boolean; explanation: string; basis: string };
  /** 과반 지지 기준 — 지지자 수를 넣지 않으면 null */
  majoritySupport: { met: boolean | null; supporters: number | null; needed: number; explanation: string; basis: string };
  caution: string;
}

/** 근로기준법상 근로자대표 겸임. 근거가 갈리므로 두 기준을 따로 낸다(합쳐서 하나로 내지 않는다) */
export function quorumWorkerRep(electors: number, voters: number, notified: boolean, supporters?: number | null): WorkerRep {
  const turnout = quorumDirect(electors, voters);
  const needed = majority(electors);
  return {
    kind: '근로기준법상 근로자대표 겸임',
    adminInterpretation: {
      met: !!notified && turnout.met,
      notified: !!notified,
      majorityTurnout: turnout.met,
      explanation: '선출 당시 권한 부여 사실이 주지되고 근로자 과반수가 투표에 참여',
      basis: REP_BASIS_ADMIN,
    },
    majoritySupport: {
      met: supporters == null ? null : supporters >= needed,
      supporters: supporters ?? null,
      needed,
      explanation: '근로자 과반수의 지지(보수 기준). 지지자 수를 넣지 않으면 결과를 내지 않는다',
      basis: REP_BASIS_SUPPORT,
    },
    caution: '두 기준을 모두 충족하면 다툼 여지가 가장 적다. 주지는 선출할 때마다 다시 한다(근로기준정책과-221).',
  };
}

// ── 선거 결과 한 벌(도구 결과와 정족수 확인서가 같은 값을 쓴다) ──────────

export interface ElectionInput {
  /** 선거인 수(사업 전체 · 간접선거면 1단계 모수) */
  electors: number;
  voters: number;
  /** 간접선거 2단계 — 위원선거인 수·그중 투표자 수 */
  delegateElectors?: number;
  delegateVoters?: number;
  /** 선거구를 나눠 뽑았을 때 */
  districts?: District[];
  candidates?: number;
  /** 근로자위원 정원(비우면 위원 수) */
  seats?: number;
  /** 근로자대표 겸임 — 선출 당시 권한 부여 사실을 알렸다 */
  notified?: boolean;
  /** 근로자대표 겸임 — 지지한 근로자 수(과반 지지 기준) */
  supporters?: number;
}

export interface ElectionCheck {
  kind: '직접선거' | '간접선거' | '선거구별';
  workerMembers: QuorumSet;
  ballot?: Ballot;
  workerRep?: WorkerRep;
}

/** 앞뒤가 맞지 않는 선거 숫자 */
export function electionErrors(e: ElectionInput, indirect: boolean): string[] {
  const out: string[] = [];
  const over = (v: number | undefined, n: number | undefined, label: string) => {
    if (v != null && n != null && v > n) out.push(`${label} 투표자 수(${v}명)가 선거인 수(${n}명)보다 많습니다.`);
  };
  over(e.voters, e.electors, '선거');
  if (indirect && (e.delegateElectors == null || e.delegateVoters == null)) out.push('간접선거는 2단계 숫자(위원선거인 수·그중 투표자 수)도 넣어 주세요.');
  over(e.delegateVoters, e.delegateElectors, '2단계(위원선거인)');
  for (const [i, d] of (e.districts ?? []).entries()) over(d.voters, d.electors, `선거구 ${d.label ?? i + 1}`);
  if (e.supporters != null && e.supporters > e.electors) out.push(`지지한 근로자 수(${e.supporters}명)가 선거인 수(${e.electors}명)보다 많습니다.`);
  return out;
}

/** 근로자위원 선출 정족수(직접·간접·선거구별) + 투표 방식 + 근로자대표 겸임 두 기준. electionErrors 가 빈 때만 부른다 */
export function electionCheck(e: ElectionInput, opts: { indirect: boolean; concurrentRep: boolean; seats: number }): ElectionCheck {
  let kind: ElectionCheck['kind'];
  let set: QuorumSet;
  if (e.districts?.length) {
    kind = '선거구별';
    set = quorumDistricts(e.districts);
  } else if (opts.indirect) {
    kind = '간접선거';
    set = quorumIndirect(e.electors, e.voters, e.delegateElectors!, e.delegateVoters!);
  } else {
    kind = '직접선거';
    const s = quorumDirect(e.electors, e.voters);
    set = { stages: [s], met: s.met, result: s.result };
  }
  return {
    kind,
    workerMembers: set,
    ...(e.candidates != null ? { ballot: ballot(e.candidates, e.seats ?? opts.seats) } : {}),
    ...(opts.concurrentRep ? { workerRep: quorumWorkerRep(e.electors, e.voters, !!e.notified, e.supporters) } : {}),
  };
}

// ── 회의 정족수 ────────────────────────────────────────

export interface MeetingQuorum {
  held: boolean;
  neededPresent: { worker: number; employer: number };
  present: number;
  neededInFavor: number;
  passed: boolean | null;
  basis: string;
}

/** 법 제15조. 의사정족수는 협의회규정상 정원 기준(노사관계법제과-3091, 매뉴얼 123쪽). 의결은 출석 3분의 2 이상(올림) */
export function quorumMeeting(workerSeats: number, employerSeats: number, workerPresent: number, employerPresent: number, inFavor?: number | null): MeetingQuorum {
  const nw = majority(workerSeats);
  const ne = majority(employerSeats);
  const held = workerPresent >= nw && employerPresent >= ne;
  const present = workerPresent + employerPresent;
  const neededInFavor = Math.ceil((present * 2) / 3);
  return {
    held,
    neededPresent: { worker: nw, employer: ne },
    present,
    neededInFavor,
    passed: inFavor == null ? null : held && inFavor >= neededInFavor,
    basis: '근참법 제15조, 정원 기준(노사관계법제과-3091)',
  };
}

// ── 일정·기한 ──────────────────────────────────────────

export interface Step {
  step: string;
  date: string;
  note: string;
}

export const STEP_INSTALL = '협의회 설치(제1차 회의 · 협의회규정 의결)';
export const STEP_REPORT = '협의회규정 제출(신고)';

/** 설치일에서 거꾸로 잡는 표준 일정. 선관위는 공고 14일 전 구성(재단 예시문 제12조) */
export function schedule(target: string): Step[] {
  const t = mustDate(target);
  const rows: [string, number, string][] = [
    ['선거관리위원회 구성', -40, '근로자로 구성. 사용자 참여는 선출 개입(법 제10조제1항)'],
    ['선거관리규정 의결', -37, ''],
    ['선거 공고', -26, '입후보 기간을 충분히 둘 것. 겸임이면 공고에 명시'],
    ['입후보 마감', -17, '후보 수 ≤ 정원이면 찬반투표'],
    ['선거인명부 확정', -15, '근기법상 사용자 제외. 기준시점 고정'],
    ['투표', -12, '직접·비밀·무기명'],
    [`개표·${DOC_NAMES.quorumShort.replace(/서$/, '')}`, -12, '근로자 과반수 참여 여부(선거구별)'],
    ['당선공고', -10, '차점자 명부 확정(시행령 제4조 보궐)'],
    ['사용자위원 위촉', -9, '대표자 당연직 + 노사 동수'],
    ['제1차 회의 소집 통보', -8, '통보일 불산입, 개최일 전까지 7일(법 제13조제3항)'],
    [STEP_INSTALL, 0, '신고 기한의 기산점. 규정 의결(시행령 제5조제2항)·고충처리위원 선임 안건 포함'],
    [STEP_REPORT, REPORT_DAYS, '법 제18조제1항 - 설치일부터 15일 이내, 관할 지방고용노동관서'],
  ];
  return rows.map(([step, d, note]) => ({ step, date: addDays(t, d), note }));
}

export type DeadlineKind = '신고' | '고충' | '소집';

export interface Deadline {
  kind: DeadlineKind;
  base: string;
  due: string;
  daysLeft: number;
  explanation: string;
  basis: string;
  status: '경과' | '임박' | '여유';
}

const DEADLINES: Record<DeadlineKind, [number, string, string]> = {
  신고: [REPORT_DAYS, '협의회 설치일부터 15일 이내 협의회규정 제출', '근참법 제18조제1항'],
  고충: [GRIEVANCE_NOTICE_DAYS, '고충사항 청취일부터 10일 이내 처리결과 통보', '근참법 제28조제1항'],
  소집: [CONVENE_NOTICE_DAYS, '회의 개최 7일 전까지 위원에게 통보', '근참법 제13조제3항'],
};

/** 기한. today 는 KST 오늘(YYYY-MM-DD).
 *  소집: 통보일은 산입하지 않고 개최일 전까지 7일을 확보해야 한다(매뉴얼 118쪽) → 개최일 − 8일 */
export function deadline(base: string, kind: DeadlineKind, today: string): Deadline {
  const row = DEADLINES[kind];
  if (!row) throw new Error(`종류는 신고/고충/소집 중 하나: ${kind}`);
  const [days, explanation, basis] = row;
  const b = mustDate(base);
  const due = kind === '소집' ? addDays(b, -(days + 1)) : addDays(b, days);
  const daysLeft = daysBetween(mustDate(today), due);
  return { kind, base: b, due, daysLeft, explanation, basis, status: daysLeft < 0 ? '경과' : daysLeft <= 3 ? '임박' : '여유' };
}

// ── 한데 묶어 보기(파이썬 판정()) ─────────────────────────

export interface AssessInput {
  workplaceName?: string;
  headcount: number;
  majorityUnion?: boolean;
  indirectReason?: string | null;
  workerMembers?: number | null;
  employerMembers?: number | null;
  /** 비거나 0 이면 3(법정 상한) — 파이썬 int(x or 3) 과 같다 */
  grievanceMembers?: number | null;
  concurrentRep?: boolean;
  concurrentScope?: string[];
  /** 협의회 설치일 = 제1차 회의에서 협의회규정을 의결한 날 */
  installDate?: string;
  /** 일정 역산의 기준(설치 목표일) */
  targetInstallDate?: string;
}

export interface ConcurrentRep {
  applies: true;
  scope: string[];
  requiredSteps: string[];
  caution: string;
}

export interface Assessment {
  workplaceName: string | null;
  installation: Installation;
  selection: Selection;
  members: Members;
  grievanceMembers: number;
  grievanceBasis: string;
  concurrentRep?: ConcurrentRep;
  reportDeadline?: Deadline;
  schedule?: Step[];
  warnings: string[];
}

export function assess(input: AssessInput, today: string): Assessment {
  const headcount = Math.trunc(input.headcount || 0);
  const inst = installation(headcount);
  const sel = selection(!!input.majorityUnion, input.indirectReason);
  const mem = members(input.workerMembers, input.employerMembers, headcount);
  // 고충처리위원은 법 제27조제1항상 노사를 대표하는 3명 이내다. 협의회 위원 수(최대 10명)를 따라가지 않는다.
  const grievance = Math.trunc(input.grievanceMembers || GRIEVANCE_MAX);
  const out: Assessment = {
    workplaceName: input.workplaceName?.trim() || null,
    installation: inst,
    selection: sel,
    members: mem,
    grievanceMembers: grievance,
    grievanceBasis: '법 제27조제1항 - 노사를 대표하는 3명 이내. 협의회가 설치된 사업이나 사업장은 협의회가 그 위원 중에서 선임한다.',
    warnings: [...mem.warnings],
  };
  if (grievance > GRIEVANCE_MAX) out.warnings.push(`고충처리위원 ${grievance}명은 법정 상한(3명 이내, 법 제27조제1항)을 넘는다.`);
  if (!inst.required) out.warnings.push('상시 30명 미만이다. 법정 설치의무가 없으므로 임의 설치 여부를 사용자에게 확인할 것.');
  if (input.concurrentRep) {
    const scope = (input.concurrentScope ?? []).map((s) => s.trim()).filter(Boolean);
    out.concurrentRep = {
      applies: true,
      scope,
      requiredSteps: [
        '선거공고문에 근기법상 근로자대표 겸임 선출임을 명시',
        '투표용지에 두 선출 목적을 각각 병기',
        '정족수를 근로자위원·근로자대표 각각 확인',
        '근로자대표 겸임 선출 확인서를 별도 파일로 산출',
        '간접선거면 1단계(위원선거인 선거) 공고부터 겸임 사실을 명시(근로기준정책과-1140)',
        '선출할 때마다 다시 주지(근로기준정책과-221)',
      ],
      caution: '근로자대표 겸임은 행정해석 기준(주지 + 근로자 과반수 참여)과 과반 지지 기준을 따로 본다. 두 기준을 하나로 합친 결과는 내지 않는다.',
    };
    if (!scope.length) out.warnings.push('근로자대표 겸임인데 겸임 권한 범위가 비어 있다. 실제 필요한 권한(탄력·선택근로 서면합의 등)만 열거할 것.');
    // 파이썬판에 없는 경고(TS 에서 더함) — 위촉통지서의 「과반수 노동조합이 근로자대표」 문구와 맞춘다
    if (sel.method === '위촉') out.warnings.push('과반수 노동조합이 있으면 근로기준법상 근로자대표의 지위는 그 노동조합에 있다고 보는 것이 통용되는 해석이다. 근로자위원 겸임 선출이 필요한지 확인할 것.');
  }
  if (inst.required && input.installDate) out.reportDeadline = deadline(input.installDate, '신고', today);
  if (input.targetInstallDate) out.schedule = schedule(input.targetInstallDate);
  return out;
}
