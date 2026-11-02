// 주소 → 3대 공단(근복·건보·연금) 관할 지사와 업무별 담당 번호.
// 데이터 = data/branch-directory/*.json (각 공단 공식 지사찾기 원문, 수집 스크립트는 insurance-branch-directory).
// ★ 관할은 공단 홈페이지 문구를 읽어 맞춘 것이다. 공단이 소재지와 다른 지사를 관리지사로 정한 사업장이 있어
//   결과는 「확정」이어도 고지서·EDI 의 관리지사가 우선한다(화면 안내문). 여럿이 맞으면 「후보」로 내고 고르지 않는다.

import nhisJson from '../../data/branch-directory/nhis.json';
import npsJson from '../../data/branch-directory/nps.json';
import comwelJson from '../../data/branch-directory/comwel.json';

export type AgencyKey = 'comwel' | 'nhis' | 'nps';
/** [부서, 직위, 담당업무, 중분류, 전화, 팩스, 출장소, 표종류] */
export type RawRow = [string, string, string, string, string, string, string, string];
export interface Branch {
  code: string; name: string; hq: string; addr: string; juris: string; src: string; mo?: string; rows: RawRow[];
}
export interface Agency { agency: string; collectedAt: string; branches: Branch[] }

export function loadAgencies(): Record<AgencyKey, Agency> {
  return { nhis: nhisJson as Agency, nps: npsJson as Agency, comwel: comwelJson as Agency };
}

// ── 시도 ──────────────────────────────────────────────
// 2026 개편: 광주·전남 → 전남광주통합특별시 (옛 이름 주소도 같은 묶음으로 본다)
const SIDO: [string, string[]][] = [
  ['서울', ['서울특별시', '서울시', '서울']],
  ['부산', ['부산광역시', '부산시', '부산']],
  ['대구', ['대구광역시', '대구시', '대구']],
  ['인천', ['인천광역시', '인천시', '인천']],
  // 「광주시」는 넣지 않는다 — 경기도 광주시와 겹친다
  ['광주전남', ['전남광주통합특별시', '전남광주', '광주광역시', '전라남도', '전남', '광주']],
  ['대전', ['대전광역시', '대전시', '대전']],
  ['울산', ['울산광역시', '울산시', '울산']],
  ['세종', ['세종특별자치시', '세종시', '세종']],
  ['경기', ['경기도', '경기']],
  ['강원', ['강원특별자치도', '강원도', '강원']],
  ['충북', ['충청북도', '충북']],
  ['충남', ['충청남도', '충남']],
  ['전북', ['전북특별자치도', '전부특별자치도', '전라북도', '전북']],
  ['경북', ['경상북도', '경북']],
  ['경남', ['경상남도', '경남']],
  ['제주', ['제주특별자치도', '제주도']],
];
const SIDO_NAMES = SIDO.flatMap(([k, ns]) => ns.map(n => [n, k] as const)).sort((a, b) => b[0].length - a[0].length);
const MULTI = new Map([['충청', ['충북', '충남']]]);

function sidoOf(token: string): string | null {
  for (const [n, k] of SIDO_NAMES) if (token === n) return k;
  return null;
}
/** 글 안에 나오는 시도 묶음 — 「경기광주지사」 같은 지사 이름은 넣지 않는다 */
function sidosIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const t of tokens(text)) {
    const k = sidoOf(t);
    if (k) out.add(k);
    for (const m of MULTI.get(t) ?? []) out.add(m);
    for (const [n, kk] of SIDO_NAMES) if (n.length >= 4 && t.startsWith(n)) out.add(kk);
  }
  return out;
}

// 인천 2026 개편: 중구·동구 → 제물포구·영종구, 서구 → 서해구·검단구. 옛 주소는 두 이름 모두로 찾는다
const GU_ALIAS: Record<string, Record<string, string[]>> = {
  인천: { 중구: ['제물포구', '영종구'], 동구: ['제물포구'], 서구: ['서해구', '검단구'] },
};
// 전국에 둘 이상 있는 구 이름 — 시도 없이는 어디인지 모른다
const DUP_GU = new Set(['중구', '동구', '서구', '남구', '북구', '강서구']);
// 시도가 다르면 같은 이름이 또 있는 시·군
const SAME_NAME_SI = new Set(['고성군', '광주시']);
// 군위군은 2023 대구 편입
const SIDO_EXTRA: Record<string, string> = { 군위군: '대구' };

const TAIL = /(전지역|전역|관내|전체|전부|지역|일원)$/;
const NO_STRIP = new Set(['부산진구']);
function stripSido(t: string): string {
  if (sidoOf(t) || NO_STRIP.has(t)) return t;
  for (const [n] of SIDO_NAMES) if (n.length >= 2 && t.startsWith(n) && t.length > n.length + 1) return t.slice(n.length);
  return t;
}
function tokens(text: string): string[] {
  return text.split(/[\s,·.\/()\[\]~:;]+/).map(t => t.trim()).filter(Boolean);
}
type Kind = 'si' | 'gu' | 'dong' | 'bare' | 'sido';
function kindOf(t: string): Kind {
  if (/구$/.test(t)) return 'gu';
  if (/[시군]$/.test(t)) return 'si';
  if (/([0-9]?동|가|읍|면|리)$/.test(t)) return 'dong';
  return 'bare';
}
/** 동 이름의 몸통 — 논현1동·논현동 → 논현, 당산동3가 → 당산 */
function dongCore(t: string): string {
  return t.replace(/[0-9]+가$/, '').replace(/(본동|[0-9]*동|[0-9]*가|읍|면|리)$/, '').replace(/[0-9]+$/, '');
}
const siCore = (t: string) => t.replace(/[시군]$/, '');
const guCore = (t: string) => t.replace(/구$/, '');

// ── 주소 ─────────────────────────────────────────────
export interface ParsedAddress {
  raw: string; sido: string | null; si: string | null; gu: string[]; dong: string | null; eup: string | null;
}

// 시군구 → 시도 (지사 주소 364곳에서 만든다). 시도가 하나뿐인 이름만 남긴다
let PLACE_SIDO: Map<string, string> | null = null;
function placeSido(): Map<string, string> {
  if (PLACE_SIDO) return PLACE_SIDO;
  const seen = new Map<string, Set<string>>();
  const ag = loadAgencies();
  for (const k of ['nhis', 'nps', 'comwel'] as const) {
    for (const b of ag[k].branches) {
      const a = parseAddressRaw(cleanBranchAddr(b.addr));
      if (a.sido) for (const p of [a.si, ...a.gu]) if (p) seen.set(p, (seen.get(p) ?? new Set()).add(a.sido));
    }
  }
  PLACE_SIDO = new Map([...seen].filter(([p, s]) => s.size === 1 && !DUP_GU.has(p)).map(([p, s]) => [p, [...s][0]]));
  return PLACE_SIDO;
}
/** 시도가 하나로 정해지는 시군구 이름이면 그 시도 */
export function uniqueSidoOf(place: string): string | null {
  return placeSido().get(place) ?? null;
}
function cleanBranchAddr(s: string): string {
  return s.replace(/^\s*(\[[^\]]*\]|\([^)]*\))\s*/, '').replace(/^\(도로명 주소\)\s*/, '');
}

export function parseAddress(input: string): ParsedAddress {
  const a = parseAddressRaw(input);
  if (!a.sido) {
    for (const p of [a.si, ...a.gu]) {
      const s = p ? uniqueSidoOf(p) : null;
      if (s) { a.sido = s; break; }
    }
    if (a.sido && a.gu.length && GU_ALIAS[a.sido]?.[a.gu[0]]) a.gu = [a.gu[0], ...GU_ALIAS[a.sido][a.gu[0]]];
  }
  return a;
}

function parseAddressRaw(input: string): ParsedAddress {
  const raw = input.trim();
  const paren = raw.match(/\(([^)]*)\)/)?.[1] ?? '';
  const head = raw.replace(/\([^)]*\)/g, ' ');
  const ts = head.split(/\s+/).filter(Boolean);
  let sido: string | null = null, si: string | null = null, eup: string | null = null, dong: string | null = null;
  let gu: string[] = [];
  for (const t of ts) {
    const s = sidoOf(t);
    if (s && !sido) { sido = s; continue; }
    if (SIDO_EXTRA[t]) sido = SIDO_EXTRA[t];
    if (/[시군]$/.test(t) && !si && !gu.length) si = t;
    else if (/구$/.test(t) && !gu.length) gu = [t];
    else if (/[읍면]$/.test(t) && !eup) eup = t;
    else if (/^[가-힣]+[0-9]*(동|가)$/.test(t) && !dong && !/로|길/.test(t)) dong = t;
    else if (/^[가-힣]+[0-9]*동[0-9]+가$/.test(t) && !dong) dong = t;
    // 창원시마산회원구 같이 붙어 온 것
    const glued = t.match(/^([가-힣]+시)([가-힣]+구)$/);
    if (glued) { si = glued[1]; gu = [glued[2]]; }
  }
  if (!dong) {
    const p = paren.split(/[,\s]+/).filter(Boolean)[0] ?? '';
    if (/^[가-힣]+[0-9]*(동|가)([0-9]+가)?$/.test(p)) dong = p;
  }
  if (sido && gu.length && GU_ALIAS[sido]?.[gu[0]]) gu = [gu[0], ...GU_ALIAS[sido][gu[0]]];
  return { raw, sido, si, gu, dong, eup };
}

// ── 관할 문구 → 단위 ─────────────────────────────────
interface Unit { token: string; kind: Kind; within?: string; partial?: boolean; qualifier?: boolean; dongList?: boolean }
interface Juris { sidos: Set<string>; units: Unit[]; excludes: { token: string; hard: boolean }[] }

function parseJuris(b: Branch): Juris {
  const text = b.juris.replace(/&lt;|&gt;/g, '');
  const units: Unit[] = [];
  const excludes: { token: string; hard: boolean }[] = [];
  // 괄호: 「X(…제외)」 = 제외, 「X(a, b)」 = X 안의 a·b 만
  const body = text.replace(/([가-힣]*)\(([^)]*)\)/g, (_all, outer: string, inner: string) => {
    const innerTs = tokens(inner).map(stripSido);
    if (/제외/.test(inner)) {
      const clean = innerTs.filter(t => t !== '제외' && !/제외$/.test(t));
      const admin = clean.filter(t => kindOf(t) !== 'bare' || t.length <= 4);
      const hard = clean.every(t => kindOf(t) !== 'bare') && clean.length > 0;
      for (const t of (admin.length ? admin : clean)) excludes.push({ token: t.replace(/제외$/, ''), hard });
      return ` ${outer} `;
    }
    if (/한함|포함|출장소/.test(inner)) {
      // 「…지역에 한함」은 그 항목만 부분 관할
      return /한함/.test(inner) ? ` ${outer} ※부분 ` : ` ${outer} `;
    }
    const outerT = stripSido(outer.trim());
    const admin = innerTs.filter(t => kindOf(t) !== 'bare' || /^[가-힣]{2,3}$/.test(t)).filter(t => !sidoOf(t));
    if (outerT && !sidoOf(outerT) && admin.length) {
      for (const t of admin) units.push({ token: TAILstrip(t), kind: kindOf(TAILstrip(t)), within: outerT });
      return ' ';
    }
    return ` ${outer} ${inner} `;
  });
  // 쉼표로 나열된 항목 전체가 시도 이름이면(「대전,세종,충청」「세종시」「제주특별자치도」) 시도 단위
  for (const item of body.split(/[,·]/).map(s => s.trim()).filter(Boolean)) {
    const k = sidoOf(item);
    if (k) units.push({ token: k, kind: 'sido' });
    for (const m of MULTI.get(item) ?? []) units.push({ token: m, kind: 'sido' });
  }
  // 「영등포구 여의도동」「칠곡군 석적읍」 — 같은 항목에 동·읍이 있으면 앞의 구·시는 그 동을 꾸미는 말이다
  for (const item of body.split(/[,·]/)) {
    const partial = item.includes('※부분');
    const ts = tokens(item.replace('※부분', '')).map(r => TAILstrip(stripSido(r)))
      .filter(t => t && !sidoOf(t) && !MULTI.has(t) && !/^[0-9]/.test(t) && !/개$|^-$/.test(t));
    const qual = ts.some(t => kindOf(t) === 'dong');
    for (const t of ts) {
      const k = kindOf(t);
      units.push({ token: t, kind: k, partial, qualifier: qual && (k === 'gu' || k === 'si') });
    }
  }
  const sidos = sidosIn(text);
  const addrSido = parseAddress(cleanBranchAddr(b.addr)).sido;
  if (addrSido) sidos.add(addrSido);
  // 접미사 없는 낱말이 넷 이상 나열되면 동 목록이다(부천북부 「심곡,원미,소사,…」의 소사는 소사구가 아니다)
  if (units.filter(u => u.kind === 'bare').length >= 4) for (const u of units) if (u.kind === 'bare') u.dongList = true;
  return { sidos, units, excludes };
}
function TAILstrip(t: string) { return t.replace(TAIL, '') || t; }

// ── 점수 ─────────────────────────────────────────────
export interface Candidate { code: string; name: string; score: number; partial: boolean; branch: Branch }
export interface FindResult { status: 'confirmed' | 'candidates' | 'none'; candidates: Candidate[] }

const isHq = (b: Branch) => /지역본부$/.test(b.name);
const isSpecial = (b: Branch) => /특수형태근로종사자센터/.test(b.name);

function unitScore(u: Unit, a: ParsedAddress): number {
  const dongs = [a.dong, a.eup].filter((x): x is string => !!x);
  const matchDong = (t: string) => dongs.some(d => dongCore(d) === dongCore(t) && dongCore(t).length > 0);
  const matchGu = (t: string) => a.gu.some(g => g === t || (t.length >= 2 && guCore(g) === t));
  const matchSi = (t: string) => !!a.si && (a.si === t || siCore(a.si) === t || siCore(a.si) === siCore(t));
  if (u.within) {
    const inGu = matchGu(u.within) || matchSi(u.within);
    if (!inGu) return 0;
    if (u.kind === 'gu') return matchGu(u.token) ? 2 : 0;
    return matchDong(u.token) ? 3 : 0;
  }
  if (u.kind === 'sido') return a.sido === u.token ? 0.6 : 0;
  if (u.kind === 'dong') return matchDong(u.token) ? 3 : 0;
  if (u.kind === 'gu') return matchGu(u.token) ? 2 : 0;
  if (u.kind === 'si') return matchSi(u.token) ? 1 : 0;
  // 접미사 없는 낱말: 방배·오산·괴산 …
  if (matchDong(u.token + '동')) return 3;
  if (u.dongList) return 0;
  if (matchGu(u.token + '구')) return 2;
  if (matchSi(u.token + '시') || matchSi(u.token + '군')) return 1;
  return 0;
}

function branchScore(b: Branch, a: ParsedAddress): { score: number; partial: boolean; unknownDong: boolean } {
  const j = parseJuris(b);
  // 시도를 넘는 관할(대구북부지사의 경북 칠곡군) — 전국에 하나뿐인 시·군 이름이 그대로 적혀 있으면 시도가 달라도 본다
  const crossSi = (!!a.si && !SAME_NAME_SI.has(a.si) && j.units.some(u => u.kind === 'si' && u.token === a.si))
    || a.gu.some(g => uniqueSidoOf(g) === a.sido && j.units.some(u => u.kind === 'gu' && !u.within && u.token === g));
  if (!a.sido || (!j.sidos.has(a.sido) && !crossSi)) return { score: 0, partial: false, unknownDong: false };
  const restricted = new Set(j.units.filter(u => u.within).map(u => u.within as string));
  let score = 0, partial = false, unknownDong = false;
  for (const u of j.units) {
    // X(a,b) 로 묶인 X 는 그 자체로는 맞지 않는다
    if (!u.within && restricted.has(u.token)) continue;
    if (u.qualifier) {
      if (!a.dong && !a.eup && unitScore(u, a) > 0 && score < 1.5) { score = 1.5; partial = true; unknownDong = true; }
      continue;
    }
    const s = unitScore(u, a);
    if (s > score) { score = s; partial = !!u.partial; } else if (s === score && s > 0 && !u.partial) partial = false;
  }
  // 묶인 X 에는 맞는데 안쪽 목록에 동이 안 걸린 경우(동을 모름) → 후보
  if (score === 0) {
    for (const w of restricted) {
      if (unitScore({ token: w, kind: kindOf(w) }, a) > 0 && !a.dong && !a.eup) { score = 1.5; partial = true; unknownDong = true; }
    }
  }
  // 관할 문구가 비거나 짧은 지사 — 지사 이름에 든 지명으로 보탠다(원주횡성지사의 횡성 등)
  if (score < 1) {
    const nm = b.name.replace(/(지사|지역본부|출장소)$/, '');
    const cores = [...a.gu.map(guCore), a.si ? siCore(a.si) : ''].filter(c => c.length >= 2);
    if (cores.some(c => nm.includes(c))) score = Math.max(score, 0.9);
  }
  // 제외
  const dongs = [a.dong, a.eup].filter((x): x is string => !!x);
  for (const e of j.excludes) {
    const hit = dongs.some(d => dongCore(d) === dongCore(e.token)) || a.gu.includes(e.token);
    if (hit && score > 0) {
      if (e.hard) return { score: 0, partial: false, unknownDong: false };
      partial = true;
    }
    // 동 제외가 있는데 주소에 동이 없으면 이 지사인지 알 수 없다
    if (!hit && score > 0 && !dongs.length && kindOf(e.token) === 'dong') { partial = true; unknownDong = true; }
  }
  return { score, partial, unknownDong };
}

export function findBranches(ag: Agency, a: ParsedAddress): FindResult {
  if (!a.sido) return { status: 'none', candidates: [] };
  const all = ag.branches
    .filter(b => !isSpecial(b))
    .map(b => ({ b, ...branchScore(b, a) }))
    .filter(x => x.score > 0)
    .sort((x, y) => y.score - x.score);
  if (!all.length) return { status: 'none', candidates: [] };
  const top = all[0].score;
  let picked = all.filter(x => x.score === top);
  if (picked.length > 1 && picked.some(x => !isHq(x.b))) picked = picked.filter(x => !isHq(x.b));
  // 맨 위가 부분 관할이면 다른 맞은 지사도 같이 보여 준다
  if (picked.some(x => x.partial)) picked = all.filter(x => x.score >= 1);
  const candidates = picked.map(x => ({ code: x.b.code, name: x.b.name, score: x.score, partial: x.partial, branch: x.b }));
  // 동을 몰라 부분 판정이 났어도 그 공단에서 맞은 지사가 하나뿐이면 그 지사다(김해지사 「김해시 전하동」)
  const onlyOne = all.length === 1 && all[0].unknownDong;
  const status = candidates.length === 1 && (!candidates[0].partial || onlyOne) ? 'confirmed' : 'candidates';
  return { status, candidates };
}

// ── 지사 안 담당 행 ──────────────────────────────────
export interface Row { dept: string; pos: string; work: string; mid: string; tel: string; fax: string; sub: string; table: string; hit: boolean }

// 행 순위(261102 공식 웹 크로스체크 SOFT 5건에서 정함)
const DUTY_MAIN = /취득|상실|적용|부과|가입|사업장/;          // 사업장 신고 창구
const DUTY_NARROW = /일용|내용\s*변경|외국인|조사원|하수급|별정직/; // 좁은 업무 전용
const DUTY_OTHER = /요양|재활|보상|장해|대지급|채권|회수|사업계획|실적\s*관리/;  // 사업장 신고와 무관한 업무
// 상호 첫 글자(ㄱ~ㅅ, ㅇ, 영문·숫자)로 나눈 담당
const NAME_INITIAL = /사업장명\s*[ㄱ-ㅎ]|\[[ㄱ-ㅎ][ㄱ-ㅎ,\s~-]*\]|[ㄱ-ㅎ]\s*[~-]\s*[ㄱ-ㅎ]|\[[가-힣]~[가-힣]\]|(^|[\s,(\[])[ㄱ-ㅎ]($|[\s,)\]('])|영문|숫자/;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 행이 이 주소의 장소를 적었나 — 동·읍면, 도로명, 구 이름, 출장소 지역. 맞은 낱말도 돌려준다 */
function placeOf(r: { dept: string; work: string; sub: string }, a: ParsedAddress, keys: string[], roads: string[]): { score: number; word: string } {
  const raw = tokens(r.work);
  const i = raw.findIndex(t => keys.includes(dongCore(t.replace(/^[0-9]+/, ''))));
  if (keys.length && i >= 0) return { score: 3, word: raw[i] };
  const rd = roads.find(x => r.work.includes(x));
  if (rd) return { score: 3, word: rd };
  if (r.sub && r.dept.includes('출장소')) {
    const place = r.sub.replace(/출장소$/, '');
    if (place.length >= 2 && a.raw.includes(place)) return { score: 3, word: '' };
  }
  const g = a.gu.find(x => x.length >= 3 && r.work.includes(x));
  if (g) return { score: 1.5, word: g };
  return { score: 0, word: '' };
}
/** 맞은 장소 바로 뒤 괄호에 상호 첫 글자 제한이 붙었나 — 「당산로(ㄱ~ㅅ)」 */
function placeRestricted(work: string, word: string): boolean {
  if (!word) return false;
  const m = work.match(new RegExp(`${esc(word)}\\s*\\(([^)]*)\\)`));
  return !!m && NAME_INITIAL.test(m[1]);
}

/** 지사 안 행을 이 주소에 맞는 순서로 — 장소가 적힌 행 > 신고 창구 > 총괄, 좁은 업무·상호 첫 글자 전용은 뒤로 */
export function rowsFor(c: Candidate | Branch, a: ParsedAddress): Row[] {
  const b = 'branch' in c ? c.branch : c;
  const keys = [a.dong, a.eup].filter((x): x is string => !!x).map(dongCore).filter(k => k.length >= 1);
  const roads = a.raw.replace(/\([^)]*\)/g, ' ').split(/\s+/).filter(t => /^[가-힣0-9]{2,}(로|길)$/.test(t) && !/번길$/.test(t));
  const scored = b.rows.map(([dept, pos, work, mid, tel, fax, sub, table], i) => {
    const { score: place, word } = placeOf({ dept, work, sub }, a, keys, roads);
    const text = `${mid} ${work}`;
    let s = place;
    if (DUTY_MAIN.test(text)) s += 1;
    if (DUTY_NARROW.test(text)) s -= 2;
    if (DUTY_OTHER.test(text)) s -= 3;
    // 상호를 모르니 첫 글자로 나눈 담당은 대표로 내지 않는다(행은 남기고 강조도 유지)
    if (place > 0 ? placeRestricted(work, word) : NAME_INITIAL.test(work)) s -= 4;
    if (/총괄/.test(text)) s += 0.5;
    if (table === '부서') s += 0.6; // 연금 부서표 = 부서 대표번호 묶음, 담당자 한 명보다 먼저
    // 강조는 동·읍면·도로·출장소처럼 구체적으로 맞을 때만. 구 이름은 순서에만 쓴다
    return { row: { dept, pos, work, mid, tel, fax, sub, table, hit: place >= 3 }, s, i };
  });
  return scored.sort((x, y) => y.s - x.s || x.i - y.i).map(x => x.row);
}
