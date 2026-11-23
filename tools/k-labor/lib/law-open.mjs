/*! law-open.mjs — 법제처 국가법령정보 Open API(DRF) 조회 묶음(law)의 요청·파서.
 * 요청 대상(target)·인자와 응답 칸 이름은 korean-law-mcp v2.1.6 을 참고해 옮겼다.
 *   korean-law-mcp — MIT License, Copyright (c) 2025 Chris — https://github.com/chrisryugj/korean-law-mcp
 *   (전문은 tools/k-labor/THIRD_PARTY_NOTICES.md)
 * 옮긴 것: 판례(prec)·법령해석례(expc)·조문 연혁(lsJoHstInf)·별표서식(licbyl) 의 대상·인자,
 *   조문 번호 6자리 코드(제38조 → 003800), 응답 칸 이름. 원본은 XML 을 받지만 여기서는 JSON 으로 받는다(2026-11-22 실측).
 */
// ★ OC 는 lib/law-drf.mjs 의 lawOc()(env LAW_OC) 로만 받는다. 도구 인자로 받지 않는다.
// ★ 법제처 응답의 「…상세링크」「조문링크」에는 OC 가 들어 있어 어떤 칸도 옮기지 않는다.
//   밖으로 내는 주소는 OC 가 없는 것만 — 별표·서식 파일(/LSW/flDownload.do) · 법령 판 화면(lsInfoP.do).
// 파서(parse*)는 네트워크와 떼어 두었다 — tests/fixtures/laws/drf-open 의 고정 응답으로 시험한다.
import { asList, DrfError, getJson, parseSearch, versionLink } from './law-drf.mjs';

export const OPEN_SOURCE = '법제처 국가법령정보 Open API';
const HOST = 'https://www.law.go.kr';

/** 법령·판례·해석 원문을 그대로 옮기는 칸 — 금지어 시험에서 뺀다(원문 변조 금지) */
export const LAW_OPEN_TEXT_FIELDS = [
  'law', 'short', 'title', 'caseName', 'court', 'caseKind', 'judgmentType', 'holdings', 'summary', 'refArticles', 'refCases', 'fullText',
  'question', 'answer', 'reason', 'relatedLaws', 'agency', 'asker', 'candidates', 'ministry', 'revision', 'changeReason',
  'kind', 'label', 'caseNo',
  'piece', 'near', // check_citations — 사용자 인용 조각·판결 원문 근접 구간(261123)
];

// ── 글자 다듬기 ─────────────────────────────

const ENT = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
/**
 * 법제처 응답 글자 → 평문. <br/> 은 줄바꿈, 영문 HTML 태그만 지운다.
 * 「<신  설>」「<개정 2020. 1. 1.>」처럼 한글이 든 꺾쇠는 원문이라 그대로 둔다. 낱말은 고치지 않는다.
 */
export function clean(s) {
  if (s == null) return '';
  return String(s)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[A-Za-z][^>]*>/g, '')
    .replace(/&(lt|gt|amp|quot|#39|nbsp);/g, (m) => ENT[m])
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 「2025.08.14」「20250814」 → 「2025-08-14」. 못 읽으면 원래 글자 */
export function isoDay(s) {
  const d = String(s ?? '').replace(/\D/g, '');
  return d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : String(s ?? '') || null;
}

/** 조문 표기(「제60조」「제76조의2」) → 법제처 6자리 조문 코드(006000·007602). 못 읽으면 null */
export function joCode(articleKey) {
  const m = String(articleKey ?? '').match(/^제(\d+)조(?:의(\d+))?$/);
  if (!m) return null;
  return `${String(Number(m[1])).padStart(4, '0')}${String(Number(m[2] ?? 0)).padStart(2, '0')}`;
}

/** 6자리 조문 코드 → 「제60조」「제76조의2」 */
export function joLabel(code) {
  const s = String(code ?? '');
  if (!/^\d{6}$/.test(s)) return s;
  const n = Number(s.slice(0, 4));
  const b = Number(s.slice(4));
  return `제${n}조${b ? `의${b}` : ''}`;
}

// ── 법령 검색(lawSearch.do?target=law) ─────────

/** 현행 법령 목록. 칸은 law-drf 의 versionRow 와 같다(상세링크는 옮기지 않는다) */
export const parseLawSearch = (j) => parseSearch(j);

// ── 판례(target=prec) ───────────────────────

export function parsePrecSearch(j) {
  const r = j?.PrecSearch ?? {};
  return {
    total: Number(r.totalCnt || 0),
    rows: asList(r.prec).map((x) => ({
      id: x.판례일련번호 ?? null,
      caseNo: x.사건번호 ?? '',
      caseName: clean(x.사건명),
      court: x.법원명 || x.데이터출처명 || null,
      date: isoDay(x.선고일자),
      caseKind: x.사건종류명 || null,
      judgmentType: x.판결유형 || null,
    })),
  };
}

/** 판례 본문. 법제처가 「일치하는 판례가 없습니다」를 주면 null */
export function parsePrec(j) {
  const p = j?.PrecService;
  if (!p) return null;
  return {
    id: p.판례정보일련번호 ?? null,
    caseNo: p.사건번호 ?? '',
    caseName: clean(p.사건명),
    court: p.법원명 || null,
    date: isoDay(p.선고일자),
    caseKind: p.사건종류명 || null,
    judgmentType: p.판결유형 || null,
    holdings: clean(p.판시사항),
    summary: clean(p.판결요지),
    refArticles: clean(p.참조조문),
    refCases: clean(p.참조판례),
    fullText: clean(p.판례내용),
  };
}

/** 판례 화면 주소(OC 없음) */
export const precLink = (id) => `${HOST}/LSW/precInfoP.do?precSeq=${encodeURIComponent(id)}`;

// ── 법령해석(고용노동부 moelCgmExpc · 법제처 expc) ──

/** source → 법제처 target 과 응답 칸 이름. 고용노동부 해석과 법제처 해석례는 뿌리·번호 칸 이름이 다르다 */
export const INTERP = {
  moel: { target: 'moelCgmExpc', root: 'CgmExpc', item: 'cgmExpc', detail: 'CgmExpcService', id: '법령해석일련번호', agencyKey: '해석기관명', dateKey: '해석일자', label: '고용노동부 법령해석' },
  moleg: { target: 'expc', root: 'Expc', item: 'expc', detail: 'ExpcService', id: '법령해석례일련번호', agencyKey: '회신기관명', dateKey: '회신일자', label: '법제처 법령해석례' },
};

export function parseInterpSearch(j, source) {
  const s = INTERP[source];
  const r = j?.[s.root] ?? {};
  return {
    total: Number(r.totalCnt || 0),
    rows: asList(r[s.item]).map((x) => ({
      id: x[s.id] ?? null,
      caseNo: x.안건번호 ?? '',
      title: clean(x.안건명),
      agency: x[s.agencyKey] || x.해석기관명 || null,
      asker: x.질의기관명 || null,
      date: isoDay(x[s.dateKey]),
    })),
  };
}

export function parseInterp(j, source) {
  const s = INTERP[source];
  const e = j?.[s.detail];
  if (!e) return null;
  return {
    id: e[s.id] ?? null,
    caseNo: e.안건번호 ?? '',
    title: clean(e.안건명),
    agency: e.해석기관명 || null,
    asker: e.질의기관명 || null,
    date: isoDay(e.해석일자 || e.회신일자),
    question: clean(e.질의요지),
    answer: clean(e.회답),
    reason: clean(e.이유),
    relatedLaws: clean(e.관련법령),
  };
}

// ── 별표·서식(lawSearch.do?target=licbyl) ─────

/** 별표번호 「000800」 + 종류 「서식」 → 「별지 제8호서식」, 「001002」+「별표」 → 「별표 10의2」 */
export function annexLabel(no, kind) {
  const s = String(no ?? '');
  if (!/^\d{6}$/.test(s)) return s || null;
  const n = Number(s.slice(0, 4));
  const b = Number(s.slice(4));
  const tail = b ? `의${b}` : '';
  if (/서식/.test(kind ?? '')) return `${/부칙/.test(kind) ? '부칙 ' : ''}별지 제${n}호${tail}서식`;
  return `${/부칙/.test(kind ?? '') ? '부칙 ' : ''}별표 ${n}${tail}`;
}

const fileUrl = (p) => (p && /^\/LSW\/flDownload\.do\?flSeq=\d+$/.test(p) ? `${HOST}${p}` : null);

export function parseAnnexSearch(j) {
  const r = j?.licBylSearch ?? {};
  return {
    total: Number(r.totalCnt || 0),
    rows: asList(r.licbyl).map((x) => ({
      id: x.별표일련번호 ?? null,
      law: x.관련법령명 ?? '',
      lawId: x.관련법령ID ?? null,
      kind: x.별표종류 ?? null,
      label: annexLabel(x.별표번호, x.별표종류),
      title: clean(x.별표명),
      promulgated: isoDay(x.공포일자),
      revision: x.제개정구분명 || null,
      file: fileUrl(x.별표서식파일링크),
      pdf: fileUrl(x.별표서식PDF파일링크),
    })),
  };
}

// ── 조문 연혁(lawService.do?target=lsJoHstInf) ──

/** 조문 하나가 바뀐 판들 — 오래된 것부터. 「조문링크」는 OC 가 있어 옮기지 않고 판 화면 주소를 새로 만든다 */
export function parseArticleHistory(j) {
  const r = j?.LawService ?? {};
  const rows = asList(r.law).map((x) => {
    const jo = x.조문정보 ?? {};
    const li = x.법령정보 ?? {};
    return {
      article: joLabel(jo.조문번호),
      changeReason: jo.변경사유 || null,
      changed: isoDay(jo.조문변경일),
      mst: li.법령일련번호 ?? null,
      effective: isoDay(li.시행일자),
      promulgated: isoDay(li.공포일자),
      promulgationNo: li.공포번호 ?? null,
      revision: li.제개정구분명 || null,
      link: li.법령일련번호 && li.시행일자 ? versionLink(li.법령일련번호, li.시행일자) : null,
    };
  });
  rows.sort((a, b) => String(a.effective).localeCompare(String(b.effective)));
  return { law: r.법령명한글 ?? '', lawId: r.법령ID ?? null, total: Number(r.totalCnt || rows.length), rows };
}

// ── 요청 ─────────────────────────────────

/** getJson + 「일치하는 … 없습니다」({"Law": "…"}) 를 not-found 로 */
async function call(endpoint, params) {
  const j = await getJson(endpoint, params, { timeoutMs: 30_000 });
  if (typeof j?.Law === 'string') throw new DrfError('not-found', `법제처: ${j.Law.replace(/\s+/g, ' ').trim()}`);
  return j;
}

const page = (n, max = 100) => Math.min(Math.max(Number(n) || 1, 1), max);

export async function searchLaws({ query, display = 20, pageNo = 1, inText = false }) {
  return parseLawSearch(await call('lawSearch.do', { target: 'law', query, display: page(display), page: page(pageNo, 1000), search: inText ? 2 : 1 }));
}

// 판례·해석은 기본으로 본문에서 찾는다(search=2). 이름(사건명·안건명)만 보면 여러 낱말 검색이 거의 0건이다
// (2026-11-22 실측: 판례 「통상임금 재직조건」 사건명 0건 · 본문 246건, 고용노동부 해석 「휴게시간 대기」 2건 · 18건)
export async function searchPrecedents({ query, court, caseNo, display = 20, pageNo = 1, sort, nameOnly = false }) {
  return parsePrecSearch(await call('lawSearch.do', {
    target: 'prec', query, curt: court, nb: caseNo, display: page(display), page: page(pageNo, 1000), sort, search: nameOnly ? 1 : 2,
  }));
}

export async function fetchPrecedent(id) {
  return parsePrec(await call('lawService.do', { target: 'prec', ID: id }));
}

export async function searchInterps(source, { query, display = 20, pageNo = 1, sort, nameOnly = false }) {
  return parseInterpSearch(await call('lawSearch.do', {
    target: INTERP[source].target, query, display: page(display), page: page(pageNo, 1000), sort, search: nameOnly ? 1 : 2,
  }), source);
}

export async function fetchInterp(source, id) {
  return parseInterp(await call('lawService.do', { target: INTERP[source].target, ID: id }), source);
}

/** knd: 1 별표 · 2 서식 · 3 부칙별표 · 4 부칙서식. 한 쪽 100개라 쪽을 넘기며 모은다(고용보험법 시행규칙 173개, 2026-11-22 실측) */
export async function searchAnnexes(lawName, knd, { maxPages = 5 } = {}) {
  const rows = [];
  let total = 0;
  let complete = true;
  for (let p = 1; ; p++) {
    const r = parseAnnexSearch(await call('lawSearch.do', { target: 'licbyl', query: lawName, search: 2, display: 100, page: p, knd }));
    total = r.total;
    rows.push(...r.rows);
    if (r.rows.length < 100 || rows.length >= total) break;
    if (p >= maxPages) { complete = false; break; }
  }
  return { total, rows, complete };
}

export async function fetchArticleHistory(lawId, jo) {
  return parseArticleHistory(await call('lawService.do', { target: 'lsJoHstInf', ID: lawId, JO: jo }));
}

export const OPEN_HOST = HOST;
