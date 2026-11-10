// 노사협의회 회의록 보관함 — 이행 이력 · 회의록 이력(판·해시) · 회의록 대장 · 그래프(노드·선) · 대시보드 · 옵시디언 보관함.
// 설계 = 노사협의회신고 스킬 references/minutes-graph-spec-261110.md (+ 추가 A·B·C).
// 원칙: 선은 구조화 값(안건 ID · 결과 · 법조문 분류 · 제안 측 · 이행 기록 · 회의 키)에서만 만든다. 자유 글(발언 요지·배경·의결 내용)은
// 노드 본문일 뿐이고, 보관함에 옮길 때 [[ ]]·# 를 글자로 바꿔 옵시디언이 링크·태그로 읽지 않게 한다.
// 가져온 회의록(import.status = 「가져옴 — 확인 전」)은 「가져옴 확인」 기록이 생기기 전까지 선을 만들지 않는다.
// 파일 읽기·쓰기·해시 계산은 도구(tools/k-labor)가 하고, 여기는 받은 값만 계산한다(오늘 날짜도 받는다).
import { addDays, isoDate, MINUTES_KEEP_YEARS } from './assess';
import { ARTICLES, articleOf, regularInterval, retentionEnd, type IntervalStatus } from './meeting';
import {
  IMPL_STATUSES, meetingDocsErrors, minutesRecord, type AgendaDocInput, type GraphResult, type ImplStatus, type MeetingDocsInput, type MinutesRecord, type PreviousResolutionInput,
} from './meeting-docs';

export const IMPL_LOG = '_이행기록.jsonl';
export const DOC_LOG = '_회의록이력.jsonl';
export const DOC_STAGES = ['초안', '회람', '수정', '서명 완료', '공지', '가져옴 확인'] as const;
export type DocStage = (typeof DOC_STAGES)[number];
export const IMPORTED = '가져옴 — 확인 전';
/** 보존 만료 임박 — 이 날수 안이면 알린다 */
export const KEEP_SOON_DAYS = 90;

/** 이행 기록 한 줄(_이행기록.jsonl). 고치지 않고 덧붙인다 — 정정도 새 기록(corrects = 고친 기록의 seq) */
export interface ImplRecord {
  seq: number;
  date: string;
  agendaId: string;
  status: ImplStatus;
  /** 담당(직위) */
  owner?: string;
  content?: string;
  /** 근거(문서 경로·회의 ID) */
  evidence?: string;
  /** 확인한 회의(회의 키) */
  confirmedAt?: string;
  corrects?: number;
}
/** 회의록 이력 한 줄(_회의록이력.jsonl) — 초안·회람·수정·서명 완료·공지·가져옴 확인 */
export interface DocEvent {
  seq: number;
  meetingKey: string;
  stage: DocStage;
  date: string;
  version?: number;
  reason?: string;
  path?: string;
  sha256?: string;
}
/** 회의록 .json(make_council_meeting_docs) 또는 가져온 회의록(import_council_minutes) */
export type MinutesLike = MinutesRecord & { import?: { status: typeof IMPORTED; source: { path: string; sha256: string } } };

const t = (s: string | undefined | null) => (s ?? '').trim();
const KEY_RE = /^[0-9A-Za-z가-힣_.-]{1,40}$/;

// ── 기록 확인·덧붙이기 ─────────────────────────────────────

export function implRecordErrors(r: Partial<ImplRecord>): string[] {
  const out: string[] = [];
  if (!isoDate(r.date)) out.push(`이행 기록 일자(date)는 YYYY-MM-DD 날짜입니다(받은 값: ${r.date ?? ''}).`);
  if (!t(r.agendaId) || !KEY_RE.test(t(r.agendaId))) out.push('이행 기록의 안건 ID(agendaId)가 비었거나 글자·숫자·_.- 40자 이내가 아닙니다.');
  if (!IMPL_STATUSES.includes(r.status as ImplStatus)) out.push(`이행 상태(status)는 ${IMPL_STATUSES.join('·')} 중 하나입니다.`);
  if (r.corrects != null && (!Number.isInteger(r.corrects) || r.corrects < 1)) out.push('정정할 기록 번호(corrects)는 1 이상의 정수입니다.');
  return out;
}
export function docEventErrors(e: Partial<DocEvent>): string[] {
  const out: string[] = [];
  if (!t(e.meetingKey) || !KEY_RE.test(t(e.meetingKey))) out.push('회의 키(meetingKey, 예: 2026-정기-4차)가 비었거나 형식이 맞지 않습니다.');
  if (!DOC_STAGES.includes(e.stage as DocStage)) out.push(`단계(stage)는 ${DOC_STAGES.join('·')} 중 하나입니다.`);
  if (!isoDate(e.date)) out.push(`일자(date)는 YYYY-MM-DD 날짜입니다(받은 값: ${e.date ?? ''}).`);
  if (e.version != null && (!Number.isInteger(e.version) || e.version < 1)) out.push('판 번호(version)는 1 이상의 정수입니다.');
  if (e.stage === '수정' && !t(e.reason)) out.push('수정 판은 변경 사유(reason)를 적습니다.');
  return out;
}

/** 덧붙이기 — 앞 기록은 그대로 두고 seq 를 매긴 새 기록을 뒤에 붙인 사본 */
export function appendRecord<T extends { seq: number }>(list: readonly T[], rec: Omit<T, 'seq'>): T[] {
  return [...list, { ...rec, seq: list.length + 1 } as T];
}

// ── 이행 이력 ────────────────────────────────────────────

export interface ImplEntry {
  date: string;
  status: ImplStatus;
  owner?: string;
  content?: string;
  evidence?: string;
  confirmedAt?: string;
  corrects?: number;
  /** 어디서 왔나 — 이행기록 seq 또는 회의록 */
  source: string;
}

export const implLabel = (e: { status: ImplStatus; evidence?: string }) => (e.status === '완료' && !t(e.evidence) ? '완료(근거 없음)' : e.status);
const closed = (e: ImplEntry | undefined) => !!e && ((e.status === '완료' && !!t(e.evidence)) || e.status === '철회');

export function isConfirmed(m: MinutesLike, events: readonly DocEvent[]): boolean {
  return !m.import || events.some((e) => e.stage === '가져옴 확인' && e.meetingKey === m.meeting.key);
}
const byDate = <T extends { meeting: { date: string; key: string } }>(a: T, b: T) => a.meeting.date.localeCompare(b.meeting.date) || a.meeting.key.localeCompare(b.meeting.key);

/** 안건 ID → 시간순 이행 기록. 회의록의 「전분기 이행 상황」(그 회의가 확인한 기록) + 이행기록 파일 */
export function implHistory(minutes: readonly MinutesLike[], records: readonly ImplRecord[]): Record<string, ImplEntry[]> {
  const out: Record<string, ImplEntry[]> = {};
  const push = (id: string, e: ImplEntry) => (out[id] ??= []).push(e);
  for (const m of [...minutes].sort(byDate)) {
    for (const p of m.previousResolutions ?? []) {
      push(p.agendaId, { date: m.meeting.date, status: p.status, content: t(p.action) || undefined, evidence: t(p.evidence) || undefined, confirmedAt: m.meeting.key, source: `회의록 ${m.meeting.key}` });
    }
  }
  for (const r of [...records].sort((a, b) => a.seq - b.seq)) {
    push(r.agendaId, {
      date: r.date, status: r.status, owner: t(r.owner) || undefined, content: t(r.content) || undefined, evidence: t(r.evidence) || undefined,
      confirmedAt: t(r.confirmedAt) || undefined, corrects: r.corrects, source: `이행기록 ${r.seq}`,
    });
  }
  // 날짜순(같은 날은 넣은 순서 — 회의록 다음 이행기록 seq)
  for (const k of Object.keys(out)) out[k] = out[k].map((e, i) => ({ e, i })).sort((a, b) => a.e.date.localeCompare(b.e.date) || a.i - b.i).map((x) => x.e);
  return out;
}

export interface Resolution {
  agendaId: string;
  title: string;
  meeting: string;
  date: string;
  action?: string;
  owner?: string;
  due?: string;
}
/** 의결된 안건(확인된 회의록만). 같은 ID 가 여러 번 의결되면 마지막 것 */
export function resolutions(minutes: readonly MinutesLike[], events: readonly DocEvent[]): Resolution[] {
  const map = new Map<string, Resolution>();
  for (const m of [...minutes].filter((x) => isConfirmed(x, events)).sort(byDate)) {
    for (const a of m.agenda) {
      if (a.result !== '의결') continue;
      const im = a.implementation ?? undefined;
      map.set(a.id, { agendaId: a.id, title: a.title, meeting: m.meeting.key, date: m.meeting.date, action: t(im?.action) || undefined, owner: t(im?.owner) || undefined, due: isoDate(im?.due) ?? undefined });
    }
  }
  return [...map.values()];
}

/** 다음 회의록의 「전분기 의결된 사항의 이행 상황」 — meetingDate 앞 회의의 의결 중 직전 회의 전에 끝나지 않은 것. 회의일 뒤 기록은 보지 않는다 */
export function previousResolutionsFor(minutes: readonly MinutesLike[], records: readonly ImplRecord[], meetingDate: string, events: readonly DocEvent[] = []): PreviousResolutionInput[] {
  const earlier = minutes.filter((m) => m.meeting.date < meetingDate);
  const prevDate = earlier.reduce((d, m) => (m.meeting.date > d ? m.meeting.date : d), '');
  const hist = implHistory(earlier, records.filter((r) => r.date <= meetingDate));
  const out: PreviousResolutionInput[] = [];
  for (const r of resolutions(earlier, events)) {
    const h = (hist[r.agendaId] ?? []).filter((e) => e.date >= r.date);
    const cur = h.at(-1);
    if (closed(cur) && cur!.date <= prevDate) continue;
    out.push({ agendaId: r.agendaId, title: r.title, action: r.action, due: r.due, status: cur?.status ?? '미착수', ...(cur?.evidence ? { evidence: cur.evidence } : {}) });
  }
  return out;
}

// ── 회의록 대장 ──────────────────────────────────────────

export interface LedgerRow {
  key: string;
  number: number | null;
  kind: '정기' | '임시';
  date: string;
  noticeDate: string | null;
  /** 통보 기한 충족 — 기한 안 / 기한 경과 / 통보일 없음 */
  notice: string;
  quorum: '성립' | '불성립' | '';
  agendaCount: number;
  resolvedCount: number;
  signedDate: string | null;
  postedDate: string | null;
  /** 의결사항 공지 — 기한 안 / 기한 경과 / 공지 전 / 해당 없음 */
  posted: string;
  keepUntil: string;
  version: number;
  path: string | null;
  sha256: string | null;
  status: '확인됨' | typeof IMPORTED;
}

/** hashes: 경로 → 지금 파일의 SHA-256(파일이 없으면 null). 넣지 않은 경로는 확인하지 않는다 */
export function councilLedger(minutes: readonly MinutesLike[], events: readonly DocEvent[], hashes: Record<string, string | null>, today: string) {
  const warnings: string[] = [];
  const rows: LedgerRow[] = [];
  const sorted = [...minutes].sort(byDate);
  for (const m of sorted) {
    const key = m.meeting.key;
    const ev = events.filter((e) => e.meetingKey === key).sort((a, b) => a.seq - b.seq);
    const last = (stage: DocStage) => ev.filter((e) => e.stage === stage).at(-1);
    const signed = last('서명 완료');
    const post = last('공지');
    const withFile = ev.filter((e) => t(e.path));
    const current = withFile.at(-1);
    const src = m.import?.source;
    const version = Math.max(1, ...ev.map((e) => e.version ?? 0));
    const resolved = m.agenda.filter((a) => a.result === '의결').length;
    const due = m.check?.resolutionNotice?.due ?? null;
    const posted = !resolved || !due ? '해당 없음' : post ? (post.date <= due ? '기한 안' : '기한 경과') : '공지 전';
    const keep = retentionEnd(m.writtenDate, MINUTES_KEEP_YEARS);
    const conv = m.check?.convene;
    rows.push({
      key, number: m.meeting.number, kind: m.meeting.kind, date: m.meeting.date, noticeDate: m.meeting.noticeDate ?? null,
      notice: conv?.onTime == null ? '통보일 없음' : conv.onTime ? '기한 안' : '기한 경과',
      quorum: m.check?.quorum ? (m.check.quorum.held ? '성립' : '불성립') : '',
      agendaCount: m.agenda.length, resolvedCount: resolved, signedDate: signed?.date ?? null, postedDate: post?.date ?? null, posted,
      keepUntil: keep, version, path: current?.path ?? src?.path ?? null, sha256: current?.sha256 ?? src?.sha256 ?? null, status: isConfirmed(m, events) ? '확인됨' : IMPORTED,
    });
    // 가져온 원본의 해시 변경은 확인 전에도 본다(경로·해시는 도구가 잰 값이다)
    const source = src && !withFile.some((e) => e.path === src.path) ? src : undefined;
    hashCheck(key, [['서명본', signed], ['현재 판', current !== signed ? current : undefined], ['가져온 원본', source]], hashes, warnings);
    // 확인 전 값(모델이 원문에서 읽은 날짜·결과)으로는 점검하지 않는다 — 대시보드와 같다
    if (!isConfirmed(m, events)) {
      warnings.push(`${key} ${IMPORTED} — 서명·공지·보존 기간·정기회의 간격 점검은 원본과 맞춰 본 뒤(가져옴 확인 기록) 한다.`);
      continue;
    }
    if (!signed) warnings.push(`${key} 회의록에 서명 완료 기록이 없다 — 출석위원 전원이 서명하거나 날인한다(시행령 제6조).`);
    if (posted === '기한 경과') warnings.push(`${key} 의결사항 공지(${post!.date})가 기한(${due})보다 늦었다.`);
    if (posted === '공지 전' && due && today > due) warnings.push(`${key} 의결사항 공지 기록이 없고 기한(${due})이 지났다.`);
    if (today > keep) warnings.push(`${key} 회의록 보존 기간이 지났다(${keep}까지, 작성일부터 3년 — 법 제19조제2항). 폐기 여부를 정한다.`);
    else if (addDays(today, KEEP_SOON_DAYS) >= keep) warnings.push(`${key} 회의록 보존 만료 임박(${keep}까지, 작성일부터 3년 — 법 제19조제2항).`);
  }
  for (const g of regularGaps(sorted.filter((m) => isConfirmed(m, events)), today)) warnings.push(g.explanation);
  return { rows, warnings };
}

/** 기록한 해시와 지금 파일 비교. 가져온 원본은 이력에 같은 경로가 없을 때만 넘긴다(같은 파일을 두 번 알리지 않는다) */
function hashCheck(key: string, list: readonly (readonly [string, { path?: string; sha256?: string } | undefined])[], hashes: Record<string, string | null>, warnings: string[]) {
  for (const [label, e] of list) {
    if (!e?.path || !e.sha256 || !(e.path in hashes)) continue;
    const now = hashes[e.path];
    if (now === null) warnings.push(`${key} ${label} 파일이 없다(${e.path}).`);
    else if (now !== e.sha256) warnings.push(`${key} ${label}(${e.path})의 해시가 기록과 달라 ${label === '서명본' ? '서명 뒤' : '기록 뒤'} 바뀌었다.`);
  }
}

export interface Gap { from: string; to: string | null; status: IntervalStatus; explanation: string }
/** 정기회의 사이 간격(+ 마지막 정기회의 뒤 오늘까지) — meeting.ts regularInterval 한 규칙 */
function regularGaps(sorted: readonly MinutesLike[], today: string): Gap[] {
  const regular = sorted.filter((m) => m.meeting.kind === '정기');
  const out: Gap[] = [];
  regular.forEach((m, k) => {
    if (!k) return;
    const r = regularInterval(regular[k - 1].meeting.date, m.meeting.date);
    if (r.status !== '3개월 이내') out.push({ from: r.previous, to: m.meeting.date, status: r.status, explanation: `${m.meeting.key}: ${r.explanation}` });
  });
  const last = regular.at(-1);
  if (last && today > last.meeting.date) {
    const r = regularInterval(last.meeting.date, today);
    if (r.status !== '3개월 이내') {
      out.push({ from: r.previous, to: null, status: r.status, explanation: `마지막 정기회의(${r.previous}) 뒤 오늘(${today})까지 정기회의 기록이 없다 — ${r.explanation}` });
    }
  }
  return out;
}

// ── 그래프 ───────────────────────────────────────────────

export type NodeType = '협의회' | '회의' | '안건' | '결과' | '이행' | '법조문' | '위원';
export type EdgeType = '개최' | '다룸' | '분류' | '결과' | '이월' | '이행' | '제안';
export interface GEdge { type: EdgeType; from: string; to: string; agenda?: string; meeting?: string }
export interface GNode { id: string; type: NodeType }

export const RESULT_NODES: GraphResult[] = ['의결', '의결되지 않음', '계속 협의', '보고 완료'];
export const lawName = (key: string) => `근참법 ${articleOf(key)!.law}`;
export const councilName = (minutes: readonly MinutesLike[]) => `${t(minutes[0]?.council?.workplace) || '사업장'} 노사협의회`;
const implNode = (id: string) => `${id} 이행`;

/** 노드·선 — 확인된 회의록의 구조화 값에서만 */
export function councilGraph(minutes: readonly MinutesLike[], records: readonly ImplRecord[], events: readonly DocEvent[]) {
  const ok = [...minutes].filter((m) => isConfirmed(m, events)).sort(byDate);
  const nodes = new Map<string, GNode>();
  const edges: GEdge[] = [];
  const seen = new Set<string>();
  const node = (id: string, type: NodeType) => nodes.set(id, nodes.get(id) ?? { id, type });
  const edge = (e: GEdge) => {
    const k = JSON.stringify(e);
    if (!seen.has(k)) {
      seen.add(k);
      edges.push(e);
    }
  };
  const council = councilName(minutes);
  node(council, '협의회');
  for (const r of RESULT_NODES) node(r, '결과');
  for (const a of ARTICLES) if (a.key.startsWith('20-')) node(lawName(a.key), '법조문');
  const occ = new Map<string, string[]>();
  for (const m of ok) {
    const key = m.meeting.key;
    node(key, '회의');
    edge({ type: '개최', from: council, to: key });
    for (const a of m.agenda) {
      node(a.id, '안건');
      edge({ type: '다룸', from: key, to: a.id });
      edge({ type: '결과', from: a.id, to: a.result, meeting: key });
      if (a.article && articleOf(a.article)) {
        node(lawName(a.article), '법조문');
        edge({ type: '분류', from: a.id, to: lawName(a.article) });
      }
      if (a.proposer) {
        node(a.proposer, '위원');
        edge({ type: '제안', from: a.proposer, to: a.id });
      }
      const list = occ.get(a.id) ?? [];
      if (list.at(-1) !== key) list.push(key);
      occ.set(a.id, list);
    }
  }
  for (const [id, keys] of occ) for (let k = 1; k < keys.length; k++) edge({ type: '이월', from: keys[k - 1], to: keys[k], agenda: id });
  const hist = implHistory(ok, records);
  for (const r of resolutions(ok, events)) {
    node(implNode(r.agendaId), '이행');
    edge({ type: '이행', from: r.agendaId, to: implNode(r.agendaId) });
  }
  return { nodes: [...nodes.values()], edges, hist, confirmed: ok };
}

// ── 대시보드 ─────────────────────────────────────────────

const bigrams = (s: string) => {
  const x = s.replace(/[\s\p{P}\p{S}]/gu, '');
  return new Set(Array.from({ length: Math.max(0, x.length - 1) }, (_, k) => x.slice(k, k + 2)));
};
/** 제목 유사도(글자 두 자 묶음 다이스 계수) — 「후보」 표시에만 쓰고 선을 만들지 않는다 */
export function titleSimilarity(a: string, b: string): number {
  const x = bigrams(a);
  const y = bigrams(b);
  if (!x.size || !y.size) return 0;
  let n = 0;
  for (const g of x) if (y.has(g)) n++;
  return (2 * n) / (x.size + y.size);
}
export const SIMILAR_AT = 0.5;

export function councilDashboard(minutes: readonly MinutesLike[], records: readonly ImplRecord[], events: readonly DocEvent[], today: string) {
  const g = councilGraph(minutes, records, events);
  const ok = g.confirmed;
  const overdue = resolutions(ok, events).flatMap((r) => {
    const cur = (g.hist[r.agendaId] ?? []).filter((e) => e.date >= r.date).at(-1);
    if (closed(cur)) return [];
    return [{ agendaId: r.agendaId, title: r.title, meeting: r.meeting, status: cur ? implLabel(cur) : '미착수', due: r.due ?? null, late: !!r.due && today > r.due }];
  });
  const titleOf = new Map<string, string>();
  for (const m of ok) for (const a of m.agenda) titleOf.set(a.id, a.title);
  const carriedCount = new Map<string, number>();
  for (const e of g.edges) if (e.type === '이월') carriedCount.set(e.agenda!, (carriedCount.get(e.agenda!) ?? 0) + 1);
  const carried = [...carriedCount].filter(([, n]) => n >= 3).map(([agendaId, times]) => ({ agendaId, title: titleOf.get(agendaId) ?? '', times }));
  const yearAgo = addDays(today, -365);
  const used = new Set(ok.filter((m) => m.meeting.date > yearAgo && m.meeting.date <= today).flatMap((m) => m.agenda.map((a) => a.article).filter(Boolean)));
  const untouched = ARTICLES.filter((a) => a.key.startsWith('20-') && !used.has(a.key)).map((a) => ({ key: a.key, law: lawName(a.key), text: a.text }));
  const gaps = regularGaps(ok, today);
  const missingReports = ok
    .filter((m) => m.meeting.kind === '정기' && (m.check?.reports?.missing ?? []).length)
    .map((m) => ({ meeting: m.meeting.key, missing: m.check.reports.missing }));
  const unconfirmed = minutes.filter((m) => !isConfirmed(m, events)).map((m) => m.meeting.key);
  const candidates = similarPairs(minutes.filter((m) => !isConfirmed(m, events)), ok);
  return { overdue, carried, untouched, gaps, missingReports, unconfirmed, candidates };
}

/** 가져온 안건과 제목이 비슷한(ID 는 다른) 확인된 안건 — 「후보」로만 보이고 선은 만들지 않는다. 같은 쌍은 한 번만 */
function similarPairs(from: readonly MinutesLike[], to: readonly MinutesLike[]) {
  const seen = new Set<string>();
  return from.flatMap((m) => m.agenda.flatMap((a) => to.flatMap((o) => o.agenda.flatMap((b) => {
    const s = titleSimilarity(a.title, b.title);
    const k = `${m.meeting.key}|${a.id}|${b.id}`;
    if (b.id === a.id || s < SIMILAR_AT || seen.has(k)) return [];
    seen.add(k);
    return [{ imported: { meeting: m.meeting.key, id: a.id, title: a.title }, existing: { meeting: o.meeting.key, id: b.id, title: b.title }, similarity: Math.round(s * 100) / 100 }];
  }))));
}

// ── 옵시디언 보관함 ───────────────────────────────────────

/** 자유 글 — [ ] # 를 글자로(옵시디언이 링크·태그로 읽지 않게) */
export const escapeFree = (s: string | undefined | null) => t(s).replace(/([[\]#])/g, '\\$1');
/** 글 안의 위키링크 대상(이스케이프된 것은 빼고, 별칭·제목 링크는 파일 이름만) */
export function wikilinks(text: string): string[] {
  return [...text.matchAll(/(?<!\\)\[\[([^\]|#\n]+)(?:#[^\]|\n]*)?(?:\|[^\]\n]*)?\]\]/g)].map((m) => m[1].trim());
}
const L = (id: string) => `[[${id}]]`;
const yaml = (o: Record<string, unknown>) => ['---', ...Object.entries(o).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${JSON.stringify(v)}`), '---', ''].join('\n');
const STATUS_MEETING = (m: MinutesLike, events: readonly DocEvent[]) => (isConfirmed(m, events) ? '확인됨' : IMPORTED);

export interface VaultFile { path: string; text: string }

export function councilVault(minutes: readonly MinutesLike[], records: readonly ImplRecord[], events: readonly DocEvent[], hashes: Record<string, string | null>, today: string) {
  const g = councilGraph(minutes, records, events);
  const d = councilDashboard(minutes, records, events, today);
  const ledger = councilLedger(minutes, events, hashes, today);
  const files: VaultFile[] = [];
  const add = (path: string, front: Record<string, unknown>, body: string[]) => files.push({ path, text: `${yaml(front)}${body.join('\n')}\n` });
  const council = councilName(minutes);
  const ok = g.confirmed;
  const res = new Map(resolutions(ok, events).map((r) => [r.agendaId, r]));

  add(`협의회/${council}.md`, { type: '협의회', id: council }, [`# ${council}`, '', '## 회의', ...ok.map((m) => `- ${L(m.meeting.key)} ${m.meeting.date} ${m.meeting.kind}`), '', `- ${L('_대시보드')} · ${L('_회의록대장')}`]);

  for (const m of [...minutes].sort(byDate)) {
    const key = m.meeting.key;
    const confirmed = isConfirmed(m, events);
    const line = (a: MinutesLike['agenda'][number]) =>
      confirmed
        ? `- ${L(a.id)} [${a.type}] ${escapeFree(a.title)} — 결과 ${L(a.result)}${a.article && articleOf(a.article) ? ` · ${L(lawName(a.article))}` : ''}${a.proposer ? ` · 제안 ${L(a.proposer)}` : ''}${a.carriedOver ? ' · 이월' : ''}`
        : `- \`${a.id}\` [${a.type}] ${escapeFree(a.title)} — ${a.result}`;
    add(`회의/${key}.md`, { type: '회의', id: key, date: m.meeting.date, kind: m.meeting.kind, number: m.meeting.number, status: STATUS_MEETING(m, events), quorum: m.check?.quorum?.held ?? null, keepUntil: retentionEnd(m.writtenDate, MINUTES_KEEP_YEARS) }, [
      `# ${key}`,
      '',
      ...(confirmed ? [`${L(council)} · ${m.meeting.date}${m.meeting.place ? ` · ${escapeFree(m.meeting.place)}` : ''}`] : [`> ${IMPORTED} — 사람이 확인하기 전까지 다른 노드와 잇지 않는다.${m.import ? ` 원본: \`${m.import.source.path}\`` : ''}`]),
      ...(m.check?.quorum?.text ? ['', `출석: ${m.check.quorum.text}`] : []),
      '',
      '## 안건',
      ...m.agenda.map(line),
      ...((m.previousResolutions ?? []).length
        ? ['', '## 전분기 의결 이행 상황', ...(m.previousResolutions ?? []).map((p) => `- ${confirmed && res.has(p.agendaId) ? L(p.agendaId) : `\`${p.agendaId}\``} ${implLabel(p)}${p.evidence ? ` — 근거: ${escapeFree(p.evidence)}` : ''}`)]
        : []),
    ]);
  }

  const occ = new Map<string, { m: MinutesLike; a: MinutesLike['agenda'][number] }[]>();
  for (const m of ok) for (const a of m.agenda) occ.set(a.id, [...(occ.get(a.id) ?? []), { m, a }]);
  for (const [id, list] of occ) {
    const first = list[0].a;
    const lastA = list.at(-1)!.a;
    const carries = g.edges.filter((e) => e.type === '이월' && e.agenda === id);
    const hist = g.hist[id] ?? [];
    const cur = res.has(id) ? hist.filter((e) => e.date >= res.get(id)!.date).at(-1) : undefined;
    add(`안건/${id}.md`, {
      type: '안건', id, title: lastA.title, kind: lastA.type, article: lastA.article ?? null, proposer: lastA.proposer ?? null, firstMeeting: list[0].m.meeting.key, date: list[0].m.meeting.date,
      result: lastA.result, status: res.has(id) ? (cur ? implLabel(cur) : '미착수') : lastA.result,
    }, [
      `# ${escapeFree(lastA.title)}`,
      '',
      `구분 ${first.type}${lastA.article && articleOf(lastA.article) ? ` · 법조문 ${L(lawName(lastA.article))}` : ''}${lastA.proposer ? ` · 제안 ${L(lastA.proposer)}` : ''}`,
      '',
      '## 다룬 회의',
      ...list.map(({ m, a }) => `- ${L(m.meeting.key)} — 결과 ${L(a.result)}${a.vote?.text ? ` (${a.vote.text})` : ''}`),
      ...(carries.length ? ['', '## 이월', ...carries.map((e) => `- ${L(e.from)} → ${L(e.to)}`)] : []),
      ...(res.has(id) ? ['', `## 이행`, `- ${L(implNode(id))}`] : []),
      ...list.flatMap(({ m, a }) => [
        ...(t(a.background) ? ['', `## 배경(${m.meeting.key})`, escapeFree(a.background)] : []),
        ...(t(a.decision) ? ['', `## 의결 내용(${m.meeting.key})`, escapeFree(a.decision)] : []),
        ...((a.discussion ?? []).filter((x) => t(x.summary)).length
          ? ['', `## 발언 요지(${m.meeting.key})`, ...(a.discussion ?? []).filter((x) => t(x.summary)).map((x) => `- ${x.side}${t(x.position) ? `(${escapeFree(x.position)})` : ''}${t(x.name) ? ` ${escapeFree(x.name)}` : ''}: ${escapeFree(x.summary)}`)]
          : []),
      ]),
    ]);
  }

  for (const [id, r] of res) {
    const hist = (g.hist[id] ?? []).filter((e) => e.date >= r.date);
    const cur = hist.at(-1);
    add(`이행/${implNode(id)}.md`, { type: '이행', id: implNode(id), agenda: id, status: cur ? implLabel(cur) : '미착수', due: r.due ?? null, late: !!r.due && today > r.due && !closed(cur) }, [
      `# ${escapeFree(r.title)} — 이행`,
      '',
      `의결 ${L(id)} · ${L(r.meeting)}${r.action ? ` · 조치: ${escapeFree(r.action)}` : ''}${r.owner ? ` · 담당: ${escapeFree(r.owner)}` : ''}${r.due ? ` · 기한 ${r.due}` : ''}`,
      '',
      '## 기록(시간순 — 고치지 않고 덧붙인다)',
      ...(hist.length
        ? hist.map((e) => `- ${e.date} ${implLabel(e)}${e.owner ? ` · 담당 ${escapeFree(e.owner)}` : ''}${e.content ? ` · ${escapeFree(e.content)}` : ''}${e.evidence ? ` · 근거: ${escapeFree(e.evidence)}` : ''}${e.confirmedAt && res.has(id) && ok.some((m) => m.meeting.key === e.confirmedAt) ? ` · 확인 ${L(e.confirmedAt)}` : ''}${e.corrects ? ` · 정정(기록 ${e.corrects})` : ''} (${e.source})`)
        : ['- 기록 없음(미착수)']),
    ]);
  }

  for (const r of RESULT_NODES) add(`결과/${r}.md`, { type: '결과', id: r }, [`# ${r}`, '', '안건이 이 결과로 끝난 회의는 각 안건 파일에 있다.']);
  const lawKeys = new Set(ARTICLES.filter((a) => a.key.startsWith('20-')).map((a) => a.key));
  for (const m of ok) for (const a of m.agenda) if (a.article && articleOf(a.article)) lawKeys.add(a.article);
  for (const k of lawKeys) {
    const a = articleOf(k)!;
    add(`법조문/${lawName(k)}.md`, { type: '법조문', id: lawName(k), key: k }, [`# ${lawName(k)}`, '', a.text]);
  }
  for (const side of ['근로자위원', '사용자위원'] as const) if (g.nodes.some((n) => n.id === side)) add(`위원/${side}.md`, { type: '위원', id: side }, [`# ${side}`, '', '직위·구분만 둔다. 실명은 회의록 파일에만 있다.']);

  const dash = [
    `# 노사협의회 대시보드 (${today})`,
    '',
    `${L(council)} · ${L('_회의록대장')}`,
    '',
    '## 미이행·기한 경과 의결',
    ...(d.overdue.length ? d.overdue.map((x) => `- ${L(x.agendaId)} ${escapeFree(x.title)} — ${x.status}${x.due ? ` · 기한 ${x.due}${x.late ? ' **기한 경과**' : ''}` : ''} (${L(`${x.agendaId} 이행`)})`) : ['- 없음']),
    '',
    '## 3회 이상 이월된 안건',
    ...(d.carried.length ? d.carried.map((x) => `- ${L(x.agendaId)} ${escapeFree(x.title)} — ${x.times}회`) : ['- 없음']),
    '',
    `## 1년간 다루지 않은 협의사항(법 제20조제1항, ${addDays(today, -365)} 뒤)`,
    ...(d.untouched.length ? d.untouched.map((a) => `- ${L(a.law)} ${a.text}`) : ['- 없음']),
    '',
    '## 정기회의 간격(3개월 기간마다 1회 이상)',
    ...(d.gaps.length ? d.gaps.map((x) => `- ${x.status}: ${x.explanation}`) : ['- 알릴 것 없음']),
    '',
    '## 정기회의 보고사항 누락(법 제22조제1항)',
    ...(d.missingReports.length ? d.missingReports.map((x) => `- ${L(x.meeting)} 빠진 보고: ${x.missing.join(', ')}`) : ['- 없음']),
    '',
    `## ${IMPORTED}`,
    ...(d.unconfirmed.length ? d.unconfirmed.map((k) => `- ${L(k)} — 확인하면(가져옴 확인 기록) 선이 생긴다`) : ['- 없음']),
    ...(d.candidates.length
      ? ['', '## 같은 안건일 수 있는 후보(제목이 비슷함 — 선을 만들지 않는다)', ...d.candidates.map((c) => `- 후보: \`${c.imported.id}\` 「${escapeFree(c.imported.title)}」(${c.imported.meeting}, 가져옴) ↔ \`${c.existing.id}\` 「${escapeFree(c.existing.title)}」(${c.existing.meeting}) — 유사도 ${c.similarity}. 같은 안건이면 가져올 때 같은 ID 로 넣는다`)]
      : []),
    '',
    '## 회의록 대장 점검',
    ...(ledger.warnings.length ? ledger.warnings.map((w) => `- ${w}`) : ['- 알릴 것 없음']),
  ];
  files.push({ path: '_대시보드.md', text: `${yaml({ type: '대시보드', date: today })}${dash.join('\n')}\n` });

  const head = ['차수', '정기/임시', '개최일', '통보일', '통보 기한', '정족수', '안건 수', '의결 수', '서명 완료일', '공지일', '공지 기한', '보존 만료일', '현재 판', '해시(앞 12자)', '상태'];
  const cells = (r: LedgerRow) => [r.number != null ? `${r.number}차` : '', r.kind, r.date, r.noticeDate ?? '', r.notice, r.quorum, String(r.agendaCount), String(r.resolvedCount), r.signedDate ?? '', r.postedDate ?? '', r.posted, r.keepUntil, String(r.version), r.sha256 ? r.sha256.slice(0, 12) : '', r.status];
  files.push({
    path: '_회의록대장.md',
    text: `${yaml({ type: '회의록대장', date: today })}${[
      `# 회의록 대장 (${today})`,
      '',
      `| 회의 | ${head.join(' | ')} |`,
      `|${' --- |'.repeat(head.length + 1)}`,
      ...ledger.rows.map((r) => `| ${L(r.key)} | ${cells(r).join(' | ')} |`),
      '',
      '## 점검',
      ...(ledger.warnings.length ? ledger.warnings.map((w) => `- ${w}`) : ['- 알릴 것 없음']),
      '',
      '보존 만료일 = 작성일부터 3년(법 제19조제2항, 초일 불산입). 해시는 판마다 기록한 SHA-256 — 서명본이 나중에 바뀌었는지 본다.',
    ].join('\n')}\n`,
  });
  return { files, graph: g, dashboard: d, ledger, ledgerHead: head, ledgerCells: ledger.rows.map(cells) };
}

/** 회의록 .json 모양 확인 — 보관함이 읽을 수 있는지 */
export function minutesShapeErrors(x: unknown): string[] {
  const m = x as Partial<MinutesLike> | null;
  if (!m || m.schema !== 'nosa-council-minutes/1') return ['schema 가 nosa-council-minutes/1 이 아닙니다.'];
  const out: string[] = [];
  if (!m.meeting || !KEY_RE.test(String(m.meeting.key ?? '')) || !isoDate(m.meeting.date) || !['정기', '임시'].includes(String(m.meeting.kind))) out.push('meeting(key·date·kind)이 맞지 않습니다.');
  if (!Array.isArray(m.agenda) || m.agenda.some((a) => !a || !KEY_RE.test(String(a.id ?? '')) || !RESULT_NODES.includes(a.result as GraphResult))) out.push('agenda(id·result)가 맞지 않습니다.');
  if (!isoDate(m.writtenDate)) out.push('writtenDate 가 날짜가 아닙니다.');
  return out;
}

// ── 가져온 회의록(import_council_minutes) ─────────────────
// 모델이 원문 글자를 읽어 구조를 제안하고, 여기서 확인한다. 결과는 원문에 적힌 대로 받는다(찬성 수가 없는 옛 회의록이 많다).
// 가져온 값은 「가져옴 — 확인 전」이고 「가져옴 확인」 기록 전까지 선을 만들지 않는다. 원본은 옮기지 않고 경로·해시만 남긴다.

export interface ImportAgenda extends AgendaDocInput { result: GraphResult }
export interface ImportProposal extends MeetingDocsInput { agenda: ImportAgenda[] }
export interface ImportSource { path: string; sha256: string }

/** 제안된 구조 확인 — 회의 서류 입력 규칙(찬성 수·출석은 없어도 된다) + 차수 · 결과 · 구분과 결과의 짝 · 법조문 분류 */
export function importErrors(p: ImportProposal): string[] {
  const out = meetingDocsErrors(p, 'materials');
  if (p.meeting?.number == null) out.push('회의 차수(meeting.number)가 있어야 가져온다(회의 키 YYYY-정기|임시-N차).');
  for (const [k, a] of (p.agenda ?? []).entries()) {
    const n = `안건 ${k + 1}(${t(a.title)})`;
    if (!RESULT_NODES.includes(a.result)) out.push(`${n}의 결과(result)는 ${RESULT_NODES.join('·')} 중 하나입니다.`);
    else if (a.type === '보고' && a.result !== '보고 완료') out.push(`${n}은 보고 안건이라 결과가 「보고 완료」입니다.`);
    else if (a.type !== '보고' && a.result === '보고 완료') out.push(`${n}은 ${a.type} 안건이라 결과가 「보고 완료」일 수 없습니다.`);
    if (a.article && !articleOf(a.article)) out.push(`${n}의 법조문 분류(${a.article})가 목록에 없습니다(20-1~20-17, 21-1~21-5, 22-1~22-4).`);
  }
  return out;
}

/** 확인을 통과한 제안 → 회의록 .json(가져옴 — 확인 전). 출석·찬성 수가 있어 계산한 결과가 원문과 다르면 원문대로 두고 알린다 */
export function importedMinutes(p: ImportProposal, source: ImportSource): { record: MinutesLike; warnings: string[] } {
  const base = minutesRecord(p);
  const warnings: string[] = [];
  const agenda = base.agenda.map((a, k) => {
    const stated = p.agenda[k].result;
    if (a.vote && a.result !== stated) warnings.push(`${a.id}: 원문 결과는 「${stated}」인데 출석·찬성 수로 계산하면 「${a.result}」이다 — 원문대로 두었다. 숫자를 다시 확인한다.`);
    return { ...a, result: stated };
  });
  return { record: { ...base, agenda, import: { status: IMPORTED, source } }, warnings };
}

const squash = (s: string) => s.replace(/[\s\p{P}\p{S}]/gu, '');
/** 원문 대조 — 제안된 개최일·안건 제목이 원문 글자에 있는지(띄어쓰기·문장부호는 보지 않는다) */
export function importTextWarnings(m: MinutesLike, text: string): string[] {
  const out: string[] = [];
  const [y, mo, d] = m.meeting.date.split('-').map(Number);
  const day = new RegExp(`${y}\\s*(?:[.\\-/]|년)\\s*0?${mo}\\s*(?:[.\\-/]|월)\\s*0?${d}(?!\\d)`);
  if (!day.test(text)) out.push(`개최일(${m.meeting.date})을 원문에서 찾지 못했다 — 날짜를 다시 확인한다.`);
  const body = squash(text);
  for (const a of m.agenda) if (!body.includes(squash(a.title))) out.push(`안건 ${a.id} 제목 「${a.title}」을 원문에서 찾지 못했다 — 줄였거나 잘못 읽었을 수 있다.`);
  return out;
}

/** 기록 폴더의 확인된 회의록과 맞춰 보기 — 같은 ID(확인하면 이월 선이 생긴다)와 제목이 비슷한 후보(선 없음) */
export function importMatches(m: MinutesLike, minutes: readonly MinutesLike[], events: readonly DocEvent[]) {
  const ok = minutes.filter((x) => isConfirmed(x, events) && x.meeting.key !== m.meeting.key).sort(byDate);
  const sameId = m.agenda.flatMap((a) => {
    const meetings = ok.filter((o) => o.agenda.some((b) => b.id === a.id)).map((o) => o.meeting.key);
    return meetings.length ? [{ id: a.id, meetings }] : [];
  });
  return { sameId, candidates: similarPairs([m], ok) };
}
