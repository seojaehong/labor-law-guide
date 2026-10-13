/**
 * 판정문에서 쟁점을 뽑아 집계한다.
 *
 * ★ 2026-09-19 신설.
 *
 * 왜 필요했나 — 종전 「쟁점 요약」은 사용자 질문을 되풀이한 문장이었다.
 *   입력: "사내 기밀정보를 외부에 유출한 경우"
 *   출력: "사내 기밀정보를 외부에 유출한 경우 징계해고의 정당성 여부가 쟁점입니다"
 * 어떤 질문을 넣어도 같은 꼴이 나오고, 정보량이 0이다.
 *
 * 그런데 노동위 판정문은 **원래 쟁점별로 나뉘어 있다.**
 *   「가. 징계사유의 존재 여부 … 나. 징계양정의 적정성 … 다. 징계절차의 적법성 여부」
 * 표본 900건(id_ 만) 실측에서 48.3% 가 이 구조를 갖고, 표제는 아래 여섯으로 수렴한다.
 *
 * 그래서 쟁점을 **판정문 원문 글자에서** 뽑는다. legal_focus 같은 기존 태그를 쓰지 않는 이유는
 * 그쪽이 검수된 적이 없기 때문이다(nlrc_decisions 의 reviewed_at 은 0건). 원문에서 뽑으면
 * 틀려도 판정문이 그렇게 쓴 것이지 우리가 만든 라벨이 아니다.
 *
 * 구조가 없는 절반은 **집계에서 빼고, 몇 건 기준인지 밝힌다.** 없는 것을 채우지 않는다.
 */

export interface IssueTally {
  key: string;
  label: string;
  count: number;
}

export interface IssueDigest {
  /** 쟁점 구조가 있어 집계에 들어간 사건 수 */
  analyzed: number;
  /** 후보 전체 수 (구조 없는 건 포함) */
  total: number;
  tallies: IssueTally[];
  /** 사건 id → 쟁점 key 목록 */
  byCase: Map<string, string[]>;
}

// 「가.」~「하.」 로 시작하는 쟁점 표제. 표제는 대개 '…여부' / '…적정성' / '…정당성' 으로 끝난다.
// 주의: [가-하] 로 범위를 쓰면 한글 음절 대부분을 삼킨다. 반드시 개별 글자를 나열할 것.
const HEADING_RX = /[가나다라마바사아자차카타파하]\.\s*(.{4,45}?(?:여부|적정성|정당성|하자|존재하는지|해당하는지))/g;

// 표제 → 표준 쟁점. 위에서부터 먼저 걸리는 것을 쓴다(구체 → 일반).
const CANONICAL: Array<[RegExp, string, string]> = [
  [/갱신.*기대권|계약.*갱신.*기대/, 'renewal_expectation', '갱신 기대권이 있었나'],
  [/근로자성|근로자인지|근로자에해당|시용근로자|수습/, 'worker_status', '근로자에 해당하나'],
  [/해고.*(존재|있었는지)|해고가존재/, 'dismissal_exists', '해고가 있었나'],
  [/(징계)?절차.*(적법|정당)|절차.*하자|절차상/, 'procedure', '절차를 지켰나'],
  [/양정.*(적정|과다|과중)|양정/, 'proportionality', '처분이 과했나'],
  [/(징계|해고)사유.*(존재|정당|인정)|징계혐의|비위행위.*존재/, 'just_cause', '징계사유가 실제로 있었나'],
];

const LABEL_BY_KEY = new Map(CANONICAL.map(([, key, label]) => [key, label]));

/** 판정문 한 건에서 쟁점 key 목록을 뽑는다. 구조가 없으면 빈 배열. */
export function extractCaseIssues(row: Record<string, unknown>): string[] {
  const text = `${String(row.holding_points || '')} ${String(row.key_issue || '')}`;
  const found: string[] = [];
  // 정규식에 g 플래그가 있으므로 matchAll 로 lastIndex 오염을 피한다.
  for (const m of text.matchAll(HEADING_RX)) {
    const heading = (m[1] || '').replace(/\s+/g, '');
    if (heading.length > 40) continue;
    for (const [pattern, key] of CANONICAL) {
      if (pattern.test(heading)) {
        if (!found.includes(key)) found.push(key);
        break;
      }
    }
  }
  // 표제가 하나뿐이면 쟁점 '목록'이라 보기 어렵다 — 집계에 넣지 않는다.
  return found.length >= 2 ? found : [];
}

/** 후보 전체의 쟁점을 집계한다. */
export function digestIssues(cases: Record<string, unknown>[]): IssueDigest {
  const byCase = new Map<string, string[]>();
  const counter = new Map<string, number>();
  let analyzed = 0;

  for (const c of cases) {
    const issues = extractCaseIssues(c);
    byCase.set(String(c.id || ''), issues);
    if (issues.length === 0) continue;
    analyzed++;
    for (const key of issues) counter.set(key, (counter.get(key) || 0) + 1);
  }

  const tallies: IssueTally[] = [...counter.entries()]
    .map(([key, count]) => ({ key, label: LABEL_BY_KEY.get(key) || key, count }))
    .sort((a, b) => b.count - a.count);

  return { analyzed, total: cases.length, tallies, byCase };
}

/**
 * 쟁점 요약 문장을 만든다.
 *
 * 구조가 있는 사건이 하나도 없으면 빈 배열을 돌려준다 — 그 경우 호출부가
 * 질문 되풀이 대신 아무것도 안 보여주는 게 맞다.
 */
export function buildIssueLines(digest: IssueDigest): string[] {
  if (digest.analyzed === 0 || digest.tallies.length === 0) return [];
  const lines = [`이 유형에서 노동위가 실제로 따진 쟁점입니다. (유사 판정례 ${digest.total}건 중 쟁점이 명시된 ${digest.analyzed}건 기준)`];
  for (const t of digest.tallies.slice(0, 5)) {
    lines.push(`· ${t.label} — ${t.count}건`);
  }
  return lines;
}

/**
 * 승패와 쟁점을 겹쳐 「승패를 가른 지점」을 만든다.
 *
 * 같은 쟁점이 양쪽에서 다뤄졌는데 결론이 갈렸다면, 거기가 실제로 갈린 지점이다.
 * 한쪽에서만 다뤄진 쟁점은 그 쪽 특유의 논점이다.
 */
export function buildIssueDifferences(
  digest: IssueDigest,
  workerWinIds: string[],
  employerWinIds: string[],
): string[] {
  if (digest.analyzed === 0) return [];

  const side = (ids: string[]) => {
    const keys = new Set<string>();
    let structured = 0;
    for (const id of ids) {
      const ks = digest.byCase.get(id) || [];
      if (ks.length > 0) structured++;
      for (const k of ks) keys.add(k);
    }
    return { keys, structured };
  };
  const w = side(workerWinIds);
  const e = side(employerWinIds);

  // ★ 한쪽에 쟁점이 명시된 사건이 하나도 없으면 대비를 말하지 않는다.
  // 그 경우 "사용자가 이긴 사건에서만 쟁점이 됐다"는 문장은 사실이 아니라 **데이터 공백의 착시**다.
  // (실측: 기밀유출 질의에서 근로자 승 2건이 모두 쟁점 구조가 없어, 세 쟁점 전부
  //  「사용자가 이긴 사건에서만」으로 찍혔다. 실제로는 근로자 쪽을 못 읽은 것뿐이다.)
  // 양쪽 모두 읽을 수 있을 때만 비교하고, 아니면 다뤄진 쟁점을 단정 없이 나열한다.
  const comparable = w.structured > 0 && e.structured > 0;
  const out: string[] = [];

  if (!comparable) {
    const readable = w.structured > 0 ? '근로자가 이긴' : e.structured > 0 ? '사용자가 이긴' : null;
    if (!readable) return [];
    for (const t of digest.tallies.slice(0, 3)) {
      out.push(`${t.label} — ${readable} 사건에서 다뤄진 쟁점입니다.`);
    }
    out.push('반대편 사건은 판정문에 쟁점이 명시돼 있지 않아 대비하지 못했습니다.');
    return out.slice(0, 4);
  }

  for (const t of digest.tallies) {
    const inW = w.keys.has(t.key);
    const inE = e.keys.has(t.key);
    if (inW && inE) {
      out.push(`${t.label} — 양쪽 모두 이 쟁점에서 다투었고 결론이 갈렸습니다. 여기가 실제 분기점입니다.`);
    } else if (inW) {
      out.push(`${t.label} — 근로자가 이긴 사건에서만 쟁점이 됐습니다.`);
    } else if (inE) {
      out.push(`${t.label} — 사용자가 이긴 사건에서만 쟁점이 됐습니다.`);
    }
  }
  return out.slice(0, 4);
}

/** 감지된 쟁점에 맞는 확인 항목. 쟁점이 안 잡히면 빈 배열(호출부가 기존 기본값을 쓴다). */
export function buildIssueChecklist(digest: IssueDigest): string[] {
  const BY_ISSUE: Record<string, string[]> = {
    just_cause: [
      '징계사유를 뒷받침하는 객관적 자료가 있는지 (진술서·기록·증빙)',
      '사유가 취업규칙·인사규정의 어느 조항에 해당하는지 특정했는지',
    ],
    proportionality: [
      '같은 사안에서 과거 어떤 수위로 처분했는지 (형평성 자료)',
      '경고·시정요구·개선기간 같은 단계적 조치를 거쳤는지',
    ],
    procedure: [
      '서면 통지를 했는지, 통지서에 사유와 시기를 적었는지',
      '소명 기회를 실제로 부여하고 그 기록을 남겼는지',
      '징계위원회 개최·구성·의결 절차가 규정대로였는지',
    ],
    dismissal_exists: ['사직 의사인지 해고인지 — 의사표시의 주체와 시점 기록'],
    worker_status: ['근로자성 판단 요소 (지휘·감독, 보수 성격, 전속성) 자료'],
    renewal_expectation: ['갱신 횟수·기간과 갱신 기준이 문서로 있는지'],
  };
  const out: string[] = [];
  for (const t of digest.tallies) {
    for (const item of BY_ISSUE[t.key] || []) {
      if (!out.includes(item)) out.push(item);
    }
  }
  return out.slice(0, 5);
}
