// 회의록 그래프 화면의 자료 — 기록 폴더 파일을 브라우저 안에서 읽어 노드·선·필터를 만든다(서버로 보내지 않는다).
// 선은 councilGraph(구조화 값: 안건 ID·결과·법조문·제안 측·이행 기록·고충 부의)에서만 온다. 가져와서 확인 전인 회의록은 잇지 않는다.
// 그리는 일(sigma.js·graphology·ForceAtlas2)은 화면 쪽 — 여기는 시험할 수 있는 순수 함수만 둔다.
import { DOC_LOG, IMPL_LOG, councilDashboard, councilGraph, minutesShapeErrors, type DocEvent, type GEdge, type ImplRecord, type MinutesLike, type NodeType } from './records';
import { GRIEVANCE_LOG, type GrievanceRecord } from './grievance';

export interface CouncilFiles { minutes: MinutesLike[]; records: ImplRecord[]; events: DocEvent[]; grievances: GrievanceRecord[]; skipped: { file: string; reason: string }[] }

function jsonl<T>(name: string, text: string, skipped: CouncilFiles['skipped']): T[] {
  const out: T[] = [];
  text.split(/\r?\n/).forEach((line, k) => {
    if (!line.trim()) return;
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      skipped.push({ file: name, reason: `${k + 1}번째 줄을 읽지 못함` });
    }
  });
  return out;
}

/** 기록 폴더의 파일들(이름·글자) → 회의록·이행·회의록 이력·고충. 로컬 도구의 loadCouncilDir 와 같은 규칙(같은 회의 키는 처음 것만) */
export function parseCouncilFiles(files: readonly { name: string; text: string }[]): CouncilFiles {
  const skipped: CouncilFiles['skipped'] = [];
  const minutes: MinutesLike[] = [];
  const keys = new Map<string, string>();
  const base = (n: string) => n.split(/[\\/]/).pop() ?? n;
  // 로컬 도구(readdirSync().sort())와 같은 순서 — 코드 단위 비교. localeCompare 는 문장부호를 달리 다뤄 「처음 것」이 바뀐다
  const sorted = [...files].sort((a, b) => (base(a.name) < base(b.name) ? -1 : base(a.name) > base(b.name) ? 1 : 0));
  let records: ImplRecord[] = [];
  let events: DocEvent[] = [];
  let grievances: GrievanceRecord[] = [];
  for (const f of sorted) {
    const name = base(f.name);
    if (name === IMPL_LOG) records = jsonl(name, f.text, skipped);
    else if (name === DOC_LOG) events = jsonl(name, f.text, skipped);
    else if (name === GRIEVANCE_LOG) grievances = jsonl(name, f.text, skipped);
    else if (name.toLowerCase().endsWith('.json')) {
      let x: { schema?: string; meeting?: { key?: string } };
      try {
        x = JSON.parse(f.text);
      } catch {
        skipped.push({ file: name, reason: 'JSON 으로 읽지 못함' });
        continue;
      }
      if (x?.schema !== 'nosa-council-minutes/1') continue;
      const errs = minutesShapeErrors(x);
      if (errs.length) {
        skipped.push({ file: name, reason: errs.join(' ') });
        continue;
      }
      const key = x.meeting!.key!;
      if (keys.has(key)) {
        skipped.push({ file: name, reason: `같은 회의 키(${key})의 회의록이 이미 있음(${keys.get(key)})` });
        continue;
      }
      keys.set(key, name);
      minutes.push(x as MinutesLike);
    }
  }
  return { minutes, records, events, grievances, skipped };
}

export const NODE_TYPES: NodeType[] = ['협의회', '회의', '안건', '결과', '이행', '법조문', '위원', '고충'];
/** 종류별 색 — 밝은·어두운 바탕 모두에서 구별되는 값 */
export const NODE_COLORS: Record<NodeType, string> = {
  협의회: '#334155', 회의: '#2563eb', 안건: '#0d9488', 결과: '#7c3aed', 이행: '#d97706', 법조문: '#64748b', 위원: '#db2777', 고충: '#dc2626',
};

export interface ViewNode { id: string; type: NodeType; label: string; degree: number; size: number; date?: string; late?: boolean; status?: string }
export interface CouncilView { nodes: ViewNode[]; edges: GEdge[]; unconfirmed: string[]; counts: Record<NodeType, number> }

export function councilView(f: Omit<CouncilFiles, 'skipped'>, today: string): CouncilView {
  const g = councilGraph(f.minutes, f.records, f.events, f.grievances);
  const d = councilDashboard(f.minutes, f.records, f.events, today, f.grievances);
  const degree = new Map<string, number>();
  for (const e of g.edges) for (const id of [e.from, e.to]) degree.set(id, (degree.get(id) ?? 0) + 1);
  const title = new Map<string, string>();
  const date = new Map<string, string>();
  for (const m of g.confirmed) {
    date.set(m.meeting.key, m.meeting.date);
    for (const a of m.agenda) title.set(a.id, a.title);
  }
  const overdue = new Map(d.overdue.map((x) => [`${x.agendaId} 이행`, x]));
  const gr = new Map(d.grievances.map((c) => [c.caseId, c]));
  // 아무 안건도 잇지 않은 법조문·결과는 그리지 않는다 — 다루지 않은 협의사항은 보관함 대시보드가 알린다
  const nodes: ViewNode[] = g.nodes.filter((n) => !((n.type === '법조문' || n.type === '결과') && !degree.get(n.id))).map((n) => {
    const deg = degree.get(n.id) ?? 0;
    const base: ViewNode = { id: n.id, type: n.type, label: n.type === '안건' && title.get(n.id) ? `${n.id} ${title.get(n.id)}` : n.id, degree: deg, size: 4 + 2.5 * Math.sqrt(deg) };
    if (n.type === '회의') base.date = date.get(n.id);
    if (n.type === '이행') {
      const o = overdue.get(n.id);
      base.status = o ? o.status : '종료';
      base.late = !!o?.late;
    }
    if (n.type === '고충') {
      const c = gr.get(n.id);
      base.status = c?.status;
      base.late = !!c && c.late && !c.closed;
    }
    return base;
  });
  const counts = Object.fromEntries(NODE_TYPES.map((t) => [t, nodes.filter((n) => n.type === t).length])) as Record<NodeType, number>;
  return { nodes, edges: g.edges, unconfirmed: d.unconfirmed, counts };
}

export interface ViewFilter { types: readonly NodeType[]; from?: string; to?: string; onlyOpen?: boolean }

/** 보일 노드 — 종류 · 기간(회의일, 그 기간 회의에서 다룬 안건만) · 미이행·기한 경과만(그 노드와 바로 이웃) */
export function visibleIds(v: CouncilView, f: ViewFilter): Set<string> {
  const byId = new Map(v.nodes.map((n) => [n.id, n]));
  const inPeriod = (d?: string) => !!d && (!f.from || d >= f.from) && (!f.to || d <= f.to);
  const periodOn = !!(f.from || f.to);
  const meetingsOf = new Map<string, string[]>();
  for (const e of v.edges) if (e.type === '다룸') meetingsOf.set(e.to, [...(meetingsOf.get(e.to) ?? []), e.from]);
  let ids = new Set(v.nodes.filter((n) => f.types.includes(n.type)).map((n) => n.id));
  if (periodOn) {
    ids = new Set([...ids].filter((id) => {
      const n = byId.get(id)!;
      if (n.type === '회의') return inPeriod(n.date);
      if (n.type === '안건') return (meetingsOf.get(id) ?? []).some((m) => inPeriod(byId.get(m)?.date));
      if (n.type === '이행') return (meetingsOf.get(id.replace(/ 이행$/, '')) ?? []).some((m) => inPeriod(byId.get(m)?.date));
      return true;
    }));
  }
  if (f.onlyOpen) {
    const open = v.nodes.filter((n) => n.late || (n.type === '이행' && n.status !== '종료')).map((n) => n.id);
    const keep = new Set(open);
    for (const e of v.edges) {
      if (keep.has(e.from) && open.includes(e.from)) keep.add(e.to);
      if (open.includes(e.to)) keep.add(e.from);
    }
    ids = new Set([...ids].filter((id) => keep.has(id)));
  }
  if (periodOn || f.onlyOpen) {
    // 기간·미이행으로 좁혔을 때, 보이는 이웃이 없는 법조문·결과·위원은 홀로 남지 않게 뺀다
    const linked = (id: string) => v.edges.some((e) => (e.from === id && ids.has(e.to)) || (e.to === id && ids.has(e.from)));
    ids = new Set([...ids].filter((id) => !['법조문', '결과', '위원'].includes(byId.get(id)!.type) || linked(id)));
  }
  return ids;
}
