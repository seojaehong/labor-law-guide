// 법제처 국가법령정보 Open API(DRF) — 시행일 법령(target=eflaw)의 판 목록과 조문 원문.
// ★ OC(이용자 ID)는 env LAW_OC 에서 읽고, 없으면 ~/.claude/.env 의 LAW_OC= 줄을 본다. 기본값은 두지 않는다.
//   값은 코드·README·응답 어디에도 쓰지 않는다(법제처 응답의 「법령상세링크」에도 OC 가 들어 있어 옮기지 않는다).
// ★ 법제처는 해외 IP 와 등록하지 않은 IP·도메인을 막는다(응답: 「사용자 정보 검증에 실패하였습니다」).
//   원격판은 국내 리전(Vercel icn1)에서 돌려야 한다.
// 파서(parse*·articles·compare·versionAt)는 네트워크와 떼어 두었다 — tests/fixtures/laws/drf 의 고정 응답으로 시험한다.
// 비교 방식은 scripts/laws/diff_law_versions.py 를 옮겼다: 두 판의 전문을 조문키 단위로 글자 비교한다.
//   본문 API 의 「조문변경여부」는 새로 생긴 조문을 놓쳐서(2026-10-04 실측, 근로기준법 제44조의4) 쓰지 않는다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DRF_BASE = 'https://www.law.go.kr/DRF';
// 시험용 — smoke 가 이 PC 안의 가짜 법제처로 돌린다
const base = () => (process.env.LLG_DRF_BASE || DRF_BASE).replace(/\/+$/, '');

export const DRF_SOURCE = '법제처 국가법령정보 Open API(시행일 법령)';

/** OC — env LAW_OC, 없으면 ~/.claude/.env 의 LAW_OC 줄. 없으면 null(기본값 없음) */
export function lawOc() {
  const v = (process.env.LAW_OC || '').trim();
  if (v) return v;
  try {
    for (const line of fs.readFileSync(path.join(os.homedir(), '.claude/.env'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*LAW_OC\s*=\s*(.*)$/);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '') || null;
    }
  } catch { /* 파일이 없으면 환경변수만 본다 */ }
  return null;
}

export class DrfError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
export const NO_OC_MESSAGE = '법제처 Open API 이용자 ID(OC)가 없습니다. 국가법령정보 공동활용(open.law.go.kr)에서 받은 OC 를 MCP 설정 env LAW_OC 에 넣어 주세요.';

/** 법령명 비교용 — 가운뎃점(U+00B7·U+318D·U+30FB)과 공백을 지운다. 별표는 「일·가정」, 법제처는 「일ㆍ가정」을 쓴다 */
export const normName = (s) => String(s ?? '').replace(/[·ㆍ・\s]/g, '');

export const asList = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** GET → JSON. 응답 바이트를 utf-8 로 직접 푼다(셸 파이프를 거치지 않는다). 빈 응답·연결 오류는 다시 시도한다 */
async function getJson(endpoint, params, { oc, tries = 3, timeoutMs = 20_000 } = {}) {
  const key = oc ?? lawOc();
  if (!key) throw new DrfError('no-oc', NO_OC_MESSAGE);
  const u = new URL(`${base()}/${endpoint}`);
  for (const [k, v] of Object.entries({ OC: key, type: 'JSON', ...params })) if (v != null && v !== '') u.searchParams.set(k, String(v));
  let last = null;
  for (let i = 0; i < tries; i++) {
    if (i) await new Promise((ok) => setTimeout(ok, 800 * i));
    let body;
    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(timeoutMs) });
      body = new TextDecoder('utf-8').decode(await res.arrayBuffer());
      if (!res.ok) { last = new DrfError('http', `법제처 응답 ${res.status}`); continue; }
    } catch (e) {
      last = new DrfError('network', `법제처에 닿지 못했습니다(${e instanceof Error ? e.name : 'error'}). 국외 망에서는 법제처가 응답하지 않습니다.`);
      continue;
    }
    if (!body.trim()) { last = new DrfError('empty', '법제처가 빈 응답을 줬습니다.'); continue; }
    let j;
    try {
      j = JSON.parse(body);
    } catch {
      // 잘못된 MST 등은 HTML 오류 화면이 온다 — 다시 불러도 같다
      throw new DrfError('not-json', '법제처가 JSON 이 아닌 응답(오류 화면)을 줬습니다. 법령·판 번호를 확인해 주세요.');
    }
    if (typeof j?.result === 'string' && !j.LawSearch && !j.법령) {
      throw new DrfError('auth', `법제처가 요청을 거절했습니다: ${j.result}${j.msg ? ` ${j.msg}` : ''}`);
    }
    return j;
  }
  throw last;
}

// ── 판 목록(lawSearch.do?target=eflaw) ──────────────────

/** 법제처 목록 한 줄 → 판. 「법령상세링크」는 OC 가 들어 있어 옮기지 않는다 */
export function versionRow(x) {
  return {
    lawId: x.법령ID ?? null,
    mst: x.법령일련번호 ?? null,
    law: x.법령명한글 ?? '',
    short: x.법령약칭명 || null,
    kind: x.법령구분명 ?? null,
    revision: x.제개정구분명 ?? null,
    promulgated: x.공포일자 ?? null,
    promulgationNo: x.공포번호 ?? null,
    effective: x.시행일자 ?? null,
    status: x.현행연혁코드 ?? null,
    ministry: x.소관부처명 ?? null,
  };
}

/** lawSearch 응답 → { total, rows } */
export function parseSearch(json) {
  const ls = json?.LawSearch ?? {};
  return { total: Number(ls.totalCnt || 0), rows: asList(ls.law).map(versionRow) };
}

/** 같은 판(MST·시행일)이 여러 번 오면 하나만 — 부칙 분할 시행은 시행일이 달라 따로 남는다 */
export function uniqVersions(rows) {
  const seen = new Set();
  return rows.filter((r) => {
    const k = `${r.lawId}|${r.mst}|${r.effective}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** 판 목록 한 쪽 */
export async function searchPage(params, opts) {
  return parseSearch(await getJson('lawSearch.do', { target: 'eflaw', display: 100, sort: 'ddes', ...params }, opts));
}

/**
 * 판 목록을 공포일 내림차순으로 넘기며 모은다.
 * stopBefore(YYYYMMDD) 를 주면 한 쪽이 통째로 그보다 오래 공포됐을 때 멈춘다(maxPages 까지).
 */
export async function searchAll(params, { stopBefore = null, maxPages = 5, ...opts } = {}) {
  const rows = [];
  let total = 0;
  let complete = true;
  for (let page = 1; ; page++) {
    const r = await searchPage({ ...params, page }, opts);
    total = r.total;
    rows.push(...r.rows);
    if (!r.rows.length || page * 100 >= total) break;
    if (stopBefore && r.rows.every((x) => (x.promulgated ?? '') < stopBefore)) break;
    if (page >= maxPages) { complete = false; break; }
  }
  return { total, rows: uniqVersions(rows), complete };
}

/** ymd 에 시행 중인 판 — 시행일이 ymd 이하인 판 중 시행일이 가장 늦은 것, 같으면 나중 공포(diff_law_versions.py 와 같다) */
export function versionAt(rows, ymd) {
  const ok = rows.filter((r) => r.effective && r.effective <= ymd);
  ok.sort((a, b) => b.effective.localeCompare(a.effective) || (b.promulgated ?? '').localeCompare(a.promulgated ?? '') || Number(b.promulgationNo ?? 0) - Number(a.promulgationNo ?? 0));
  return ok[0] ?? null;
}

/** 가장 늦은 시행일 판(시행 예정 포함) */
export const latestVersion = (rows) => versionAt(rows, '99991231');

// ── 본문(lawService.do?target=eflaw) ───────────────────

/** 판 전문. ID+efYd 는 빈 {} 를 줘서(2026-10-04 실측) MST+efYd 로만 받는다 */
export async function fetchLaw(mst, efYd, opts) {
  if (!mst || !efYd) throw new DrfError('arg', '판 번호(MST)와 시행일이 필요합니다.');
  const j = await getJson('lawService.do', { target: 'eflaw', MST: mst, efYd }, { timeoutMs: 40_000, ...opts });
  const law = j?.법령;
  if (!law || !law.조문) throw new DrfError('empty', '법제처가 이 판의 본문을 주지 않았습니다.');
  return law;
}

/** 본문 응답의 기본정보 */
export function lawInfo(law) {
  const i = law?.기본정보 ?? {};
  return {
    law: i.법령명_한글 ?? '',
    lawId: i.법령ID ?? null,
    kind: i.법종구분?.content ?? null,
    revision: i.제개정구분 ?? null,
    promulgated: i.공포일자 ?? null,
    promulgationNo: i.공포번호 ?? null,
    effective: i.시행일자 ?? null,
  };
}

const flat = (v) => (Array.isArray(v) ? v.flatMap(flat) : v == null ? [] : [String(v)]);

function label(j) {
  return `제${j.조문번호}조${j.조문가지번호 ? `의${j.조문가지번호}` : ''}`;
}

function body(j) {
  const lines = [(j.조문내용 ?? '').trim()];
  for (const h of asList(j.항)) {
    if (h.항내용) lines.push(String(h.항내용).trim());
    for (const ho of asList(h.호)) {
      lines.push(`  ${String(ho.호내용 ?? '').trim()}`);
      for (const m of asList(ho.목)) for (const t of flat(m.목내용)) lines.push(`    ${t.trim()}`);
    }
  }
  return lines.filter((x) => x.trim()).join('\n');
}

function annexText(v) {
  return flat(v).map((x) => x.trimEnd()).join('\n').split('\n').filter((l) => l.trim()).join('\n');
}

/** 조문키 → { article, title, text }. 장·절 제목(조문여부=전문)은 뺀다. 별표는 「별표 N」으로 넣고 서식은 뺀다 */
export function articles(law) {
  const out = {};
  for (const j of asList(law?.조문?.조문단위)) {
    // 조 없이 한 문장뿐인 법(노동절 제정에 관한 법률)은 조문번호 0 · 조문여부 「전문」으로 온다 — 「본문」으로 받는다
    if (j.조문여부 === '전문' && String(j.조문번호) === '0') {
      out[j.조문키] = { article: '본문', title: '', text: String(j.조문내용 ?? '').trim() };
      continue;
    }
    if (j.조문여부 !== '조문') continue;
    out[j.조문키] = { article: label(j), title: j.조문제목 ?? '', text: body(j) };
  }
  for (const b of asList(law?.별표?.별표단위)) {
    if (b.별표구분 !== '별표') continue;
    let no = String(Number(b.별표번호 || 0));
    if (b.별표가지번호 && b.별표가지번호 !== '00') no += `의${Number(b.별표가지번호)}`;
    out[`B${b.별표키}`] = { article: no === '0' ? '별표' : `별표 ${no}`, title: b.별표제목 ?? '', text: annexText(b.별표내용) };
  }
  return out;
}

const DELETED = /^제\d+조(의\d+)?\s*삭제/;

/** 두 판의 조문 비교 — 글자가 다르면 개정, 한쪽에만 있으면 신설·삭제(「제N조 삭제」로 남은 조문도 삭제) */
export function compareArticles(prev, cur) {
  const out = [];
  for (const k of [...new Set([...Object.keys(prev), ...Object.keys(cur)])].sort()) {
    const a = prev[k];
    const b = cur[k];
    if (a && b && a.text === b.text) continue;
    const kind = !a ? '신설' : !b || DELETED.test(b.text) ? '삭제' : '개정';
    const ref = b ?? a;
    out.push({ key: k, article: ref.article, articleTitle: ref.title || a?.title || '', kind, before: a ? a.text : null, after: b ? b.text : null });
  }
  return out;
}

/** 「제60조」「60조의2」「60」「별표 1」「별표1의2」 → 「제60조」「제60조의2」「별표 1」 꼴. 못 읽으면 null */
export function articleKey(input) {
  const s = String(input ?? '').replace(/\s/g, '');
  let m = s.match(/^제?(\d+)조?(?:의(\d+))?$/);
  if (m) return `제${Number(m[1])}조${m[2] ? `의${Number(m[2])}` : ''}`;
  m = s.match(/^별표(\d+)?(?:의(\d+))?$/);
  if (m) return m[1] ? `별표 ${Number(m[1])}${m[2] ? `의${Number(m[2])}` : ''}` : '별표';
  if (s === '본문') return '본문';
  return null;
}

/** 조문 찾기 */
export function findArticle(arts, input) {
  const want = articleKey(input);
  if (!want) return null;
  return Object.values(arts).find((a) => a.article === want) ?? null;
}

/** 법제처 판 화면 주소(OC 없음) */
export const versionLink = (mst, efYd) => `https://www.law.go.kr/lsInfoP.do?lsiSeq=${encodeURIComponent(mst)}&efYd=${encodeURIComponent(efYd)}`;
