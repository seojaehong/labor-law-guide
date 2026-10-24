// 조문 직접 고치기 — 점검 항목과 상관없이 담당자가 조문을 고친다(위원 수·부서 이관·조문 신설 같은 정책 개정).
// 고친 줄 하나가 항목 하나(kind 'amend', 결정 「반영」)가 되어 확인 작업대·부서 의견·신·구조문대비표·반영본에 그대로 실린다.
import { articleAt, articleLabel, type Regulation } from './model';
import { hash, type Finding } from './checks';
import { normName } from './names';
import { replacement, stateOf, type ItemState, type Workspace } from './workspace';

/** 두 줄에서 바뀐 가운데 글자. 넣기만 한 고침은 앞 글자 하나를 붙여 길이를 1 이상으로 만든다(반영 자리가 비지 않게) */
export function lineDiff(old: string, neu: string): { at: number; length: number; to: string } | null {
  if (old === neu) return null;
  let p = 0;
  while (p < old.length && p < neu.length && old[p] === neu[p]) p++;
  let s = 0;
  while (s < old.length - p && s < neu.length - p && old[old.length - 1 - s] === neu[neu.length - 1 - s]) s++;
  let at = p, length = old.length - p - s, to = neu.slice(p, neu.length - s);
  if (!length && old.length) {
    if (at > 0) { at -= 1; to = old[at] + to; } else to += old[0];
    length = 1;
  }
  return { at, length, to };
}

export const amendsOf = (ws: Workspace, reg: string): Finding[] => ws.findings.filter((f) => f.kind === 'amend' && f.reg === reg);

/** 고친 줄 전문 */
export function amendedLine(ws: Workspace, f: Finding): string {
  const sp = f.spans[0], orig = f.orig ?? '';
  return orig.slice(0, sp.at) + (replacement(ws, f) ?? '') + orig.slice(sp.at + sp.length);
}

/** 한 줄을 고친다. 원래대로 돌리면 항목을 지운다 */
export function setAmend(ws: Workspace, reg: Regulation, line: number, text: string, extra: Partial<Pick<ItemState, 'note' | 'dept'>> = {}): Workspace {
  const orig = reg.lines[line].text;
  const prev = amendsOf(ws, reg.name).find((f) => f.spans[0].line === line);
  const d = lineDiff(orig, text);
  if (!d) {
    if (!prev) return ws;
    const states = { ...ws.states };
    delete states[prev.id];
    return { ...ws, findings: ws.findings.filter((f) => f !== prev), states };
  }
  const id = prev?.id ?? `am-${hash(`amend|${normName(reg.name)}|${line}|${orig}`)}`;
  const f: Finding = {
    id, kind: 'amend', reg: reg.name, article: articleLabel(articleAt(reg, line)),
    spans: [{ line, at: d.at, length: d.length, to: d.to }],
    before: orig.slice(d.at, d.at + d.length), after: d.to,
    message: '담당자가 직접 고친 줄입니다.', other: null, orig,
  };
  const s = stateOf(ws, id);
  const state: ItemState = { ...s, decision: '반영', text: undefined };
  if (extra.note !== undefined) state.note = extra.note;
  if (extra.dept !== undefined) state.dept = extra.dept || undefined;
  return { ...ws, findings: prev ? ws.findings.map((x) => (x === prev ? f : x)) : [...ws.findings, f], states: { ...ws.states, [id]: state } };
}
