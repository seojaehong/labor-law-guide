// 규정 정비 작업 — 항목마다 담당자 결정·사유·부서 의견·조율 결과를 담는다. 결정은 항목 번호(id)에 붙는다.
// 같은 파일을 다시 올려 대조를 다시 돌려도 번호가 같으면 결정이 그대로 붙는다.
import { articleAt, articleLabel, type Regulation } from './model';
import type { Finding } from './checks';
import type { IngestReport } from './ingest';

export type Decision = '미확인' | '반영' | '보류' | '해당 없음';
export const DECISIONS: Decision[] = ['반영', '보류', '해당 없음'];

export type Verdict = '동의' | '수정' | '반대';

export interface Opinion {
  dept: string;
  verdict: Verdict;
  text: string;
  by: string;
}

export interface ItemState {
  decision: Decision;
  /** 결정 사유 */
  note: string;
  /** 담당자가 고친 문안. 바꿀 글자가 있는 항목은 그 글자, 없는 항목은 조문 개정 문안 */
  text?: string;
  /** 소관 부서(규정 기본값과 다를 때만) */
  dept?: string;
  opinion?: Opinion;
  /** 이견을 담당자가 정리한 글 */
  settle?: string;
}

export interface Workspace {
  version: 1;
  institution: string;
  /** 시행일(YYYY-MM-DD). 비면 「○○○○. ○. ○.」 */
  effective: string;
  savedAt: string;
  regs: Regulation[];
  findings: Finding[];
  report: IngestReport;
  states: Record<string, ItemState>;
  /** 규정 이름 → 소관 부서 */
  depts: Record<string, string>;
  /** 이번 묶음에 없는 규정의 직접 고친 조문 — 그 규정을 다시 올리면 돌아온다 */
  parked?: Finding[];
}

export const blankState = (): ItemState => ({ decision: '미확인', note: '' });
export const stateOf = (ws: Workspace, id: string): ItemState => ws.states[id] ?? blankState();

export function newWorkspace(regs: Regulation[], findings: Finding[], report: IngestReport, institution = ''): Workspace {
  const depts: Record<string, string> = {};
  for (const r of regs) if (r.meta.dept) depts[r.name] = r.meta.dept;
  return { version: 1, institution, effective: '', savedAt: new Date().toISOString(), regs, findings, report, states: {}, depts };
}

/** 다시 올린 결과에 지난 결정을 붙인다. 짝을 못 찾은 결정도 지우지 않고 들고 간다 —
 *  규정 몇 개만 다시 올렸다가 나머지를 다시 올리면 그대로 다시 붙는다(번호가 같으므로) */
export function carryOver(prev: Workspace, next: Workspace): { ws: Workspace; kept: number; lost: number } {
  const { placed, parked } = relocateAmends(prev, next);
  const findings = [...next.findings, ...placed];
  const ids = new Set(findings.map((f) => f.id));
  let kept = 0, lost = 0;
  for (const [id, s] of Object.entries(prev.states)) {
    const touched = s.decision !== '미확인' || s.note || s.text || s.opinion;
    if (touched) { if (ids.has(id)) kept++; else lost++; }
  }
  return { ws: { ...next, findings, parked: parked.length ? parked : undefined, institution: prev.institution || next.institution, effective: prev.effective, states: { ...prev.states }, depts: { ...next.depts, ...prev.depts } }, kept, lost };
}

/** 직접 고친 조문은 대조 결과가 아니라서 다시 만들어지지 않는다 — 다시 올린 규정에서 고치기 전 줄을 찾아(가장 가까운 곳) 옮긴다.
 *  그 줄이 없어졌으면 옮기지 않는다(결정은 states 에 남아 「잃은 결정」으로 센다) */
function relocateAmends(prev: Workspace, next: Workspace): { placed: Finding[]; parked: Finding[] } {
  const out: Finding[] = [], parked: Finding[] = [];
  for (const f of [...prev.findings, ...(prev.parked ?? [])]) {
    if (f.kind !== 'amend') continue;
    const r = next.regs.find((x) => x.name === f.reg);
    // 이번에 올리지 않은 규정의 고침은 들고 있다가 그 규정을 다시 올리면 붙인다
    if (!r) { parked.push(f); continue; }
    const was = f.spans[0].line;
    let best = -1;
    r.lines.forEach((l, i) => { if (l.text === f.orig && (best < 0 || Math.abs(i - was) < Math.abs(best - was))) best = i; });
    if (best >= 0) out.push({ ...f, article: articleLabel(articleAt(r, best)), spans: [{ ...f.spans[0], line: best }] });
  }
  return { placed: out, parked };
}

export const deptOf = (ws: Workspace, f: Finding): string => stateOf(ws, f.id).dept ?? ws.depts[f.reg] ?? '';

/** 부서 의견이 고친 문안과 다르다 */
export const disputed = (s: ItemState) => !!s.opinion && s.opinion.verdict !== '동의';

export interface Stats {
  total: number;
  done: number;
  by: Record<Decision, number>;
  disputed: number;
  unsettled: number;
}

export function stats(ws: Workspace, list: Finding[] = ws.findings): Stats {
  const by: Record<Decision, number> = { 미확인: 0, 반영: 0, 보류: 0, '해당 없음': 0 };
  let d = 0, u = 0;
  for (const f of list) {
    const s = stateOf(ws, f.id);
    by[s.decision]++;
    if (disputed(s)) { d++; if (!s.settle?.trim()) u++; }
  }
  return { total: list.length, done: list.length - by.미확인, by, disputed: d, unsettled: u };
}

/** 반영할 글자: 담당자가 고친 문안 → 제안 문안 */
export function replacement(ws: Workspace, f: Finding): string | null {
  const s = stateOf(ws, f.id);
  if (f.after === null) return null;
  return s.text?.trim() ? s.text : f.after;
}

/** 오늘(한국 시간) YYYY-MM-DD — toISOString 은 UTC 라 새벽에 하루 전 날짜가 된다 */
export const kstToday = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

/** 시행일 표시 — 「2026. 3. 1.」 */
export function dotDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[1]}. ${Number(m[2])}. ${Number(m[3])}.` : '○○○○. ○. ○.';
}
