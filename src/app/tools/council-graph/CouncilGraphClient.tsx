'use client';
// 노사협의회 회의록 그래프 — 기록 폴더를 브라우저 안에서 읽어 sigma.js(WebGL) + graphology + ForceAtlas2 로 그린다.
// 파일은 서버로 보내지 않는다. 자료·필터는 src/lib/nosa-council/graph-view.ts(시험됨), 여기서는 그리기와 화면만.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { todayKst } from '@/lib/tool-kit';
import { councilView, NODE_COLORS, NODE_TYPES, parseCouncilFiles, visibleIds, type CouncilFiles, type CouncilView } from '@/lib/nosa-council/graph-view';
import { sampleCouncilFiles } from '@/lib/nosa-council/graph-sample';
import type { NodeType } from '@/lib/nosa-council/records';

type Sigma = import('sigma').default;

/** 같은 자료는 같은 자리에서 시작하게 — 이름으로 정한 처음 좌표 */
function seedXY(id: string): [number, number] {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const a = ((h >>> 0) % 3600) / 10;
  const r = 10 + ((h >>> 12) % 100);
  return [r * Math.cos((a * Math.PI) / 180), r * Math.sin((a * Math.PI) / 180)];
}

async function readFiles(list: FileList): Promise<{ name: string; text: string }[]> {
  const keep = [...list].filter((f) => /\.(json|jsonl)$/i.test(f.name));
  return Promise.all(keep.map(async (f) => ({ name: f.name, text: await f.text() })));
}

export default function CouncilGraphClient() {
  const today = todayKst();
  const [files, setFiles] = useState<CouncilFiles | null>(null);
  const [source, setSource] = useState<'예시' | '폴더' | null>(null);
  const [types, setTypes] = useState<NodeType[]>(NODE_TYPES);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const sigma = useRef<Sigma | null>(null);
  const dirRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const view: CouncilView | null = useMemo(() => (files ? councilView(files, today) : null), [files, today]);
  const shown = useMemo(() => (view ? visibleIds(view, { types, from: from || undefined, to: to || undefined, onlyOpen }) : new Set<string>()), [view, types, from, to, onlyOpen]);

  // 자료가 바뀌면 그래프를 새로 만들고 배치한다
  useEffect(() => {
    if (!view || !box.current) return;
    let alive = true;
    (async () => {
      const [{ default: Graph }, { default: SigmaCls }, { default: fa2 }] = await Promise.all([import('graphology'), import('sigma'), import('graphology-layout-forceatlas2')]);
      if (!alive || !box.current) return;
      const g = new Graph({ multi: true, type: 'directed' });
      for (const n of view.nodes) {
        const [x, y] = seedXY(n.id);
        g.addNode(n.id, { x, y, size: n.size, label: n.label.length > 28 ? `${n.label.slice(0, 27)}…` : n.label, color: NODE_COLORS[n.type], nodeType: n.type });
      }
      for (const e of view.edges) if (g.hasNode(e.from) && g.hasNode(e.to)) g.addDirectedEdge(e.from, e.to, { size: e.type === '이월' || e.type === '부의' ? 2 : 1, color: e.type === '이월' ? '#0d9488' : e.type === '부의' ? '#dc2626' : '#cbd5e1', edgeType: e.type });
      if (g.order > 1) fa2.assign(g, { iterations: 300, settings: { ...fa2.inferSettings(g), gravity: 1, scalingRatio: 8 } });
      sigma.current?.kill();
      const s = new SigmaCls(g, box.current, { labelRenderedSizeThreshold: 6, labelColor: { color: '#1e293b' }, labelFont: 'inherit', defaultEdgeType: 'line', zIndex: true });
      s.on('clickNode', ({ node }) => setSelected(node));
      s.on('clickStage', () => setSelected(null));
      sigma.current = s;
      setSelected(null);
    })().catch((e) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [view]);

  // 필터·선택은 다시 배치하지 않고 숨김·강조만 바꾼다
  useEffect(() => {
    const s = sigma.current;
    if (!s) return;
    const g = s.getGraph();
    const near = new Set<string>();
    if (selected && g.hasNode(selected)) {
      near.add(selected);
      g.forEachNeighbor(selected, (n) => near.add(n));
    }
    g.forEachNode((id) => {
      g.setNodeAttribute(id, 'hidden', !shown.has(id));
      g.setNodeAttribute(id, 'highlighted', id === selected);
      g.setNodeAttribute(id, 'color', selected && !near.has(id) ? '#e2e8f0' : NODE_COLORS[g.getNodeAttribute(id, 'nodeType') as NodeType]);
    });
    s.refresh();
  }, [shown, selected, view]);

  useEffect(() => () => sigma.current?.kill(), []);

  async function openFiles(list: FileList | null) {
    setError('');
    if (!list?.length) return;
    const got = await readFiles(list);
    const f = parseCouncilFiles(got);
    if (!f.minutes.length) {
      setError('고른 파일에 노사협의회 회의록(.json)이 없습니다. 회의록·_이행기록.jsonl·_고충대장.jsonl 이 있는 기록 폴더를 고릅니다.');
      return;
    }
    setFiles(f);
    setSource('폴더');
  }

  const sel = view && selected ? view.nodes.find((n) => n.id === selected) : null;
  const selEdges = view && selected ? view.edges.filter((e) => e.from === selected || e.to === selected) : [];

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 rounded-lg bg-[var(--grey-100)] p-3 text-sm" style={{ color: 'var(--grey-700)' }}>
        <ShieldCheck size={16} aria-hidden className="mt-0.5 shrink-0" /> 파일은 이 브라우저 안에서만 읽습니다. 서버로 보내지 않고 저장하지도 않습니다.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded-lg bg-[var(--color-text-primary)] px-4 py-2 text-sm font-semibold text-[var(--color-bg-primary)]" onClick={() => dirRef.current?.click()}>기록 폴더 열기</button>
        <button type="button" className="rounded-lg border border-[var(--grey-300)] px-4 py-2 text-sm" onClick={() => fileRef.current?.click()}>파일 고르기</button>
        <button type="button" className="rounded-lg border border-[var(--grey-300)] px-4 py-2 text-sm" onClick={() => { setError(''); setFiles(parseCouncilFiles(sampleCouncilFiles())); setSource('예시'); }}>가상 예시 보기</button>
        <input ref={dirRef} type="file" hidden multiple {...{ webkitdirectory: '', directory: '' }} onChange={(e) => openFiles(e.target.files)} />
        <input ref={fileRef} type="file" hidden multiple accept=".json,.jsonl" onChange={(e) => openFiles(e.target.files)} />
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      {view && (
        <>
          <div className="text-sm" style={{ color: 'var(--grey-700)' }} aria-live="polite">
            {source === '예시' ? '가상 예시' : '내 기록 폴더'} · 회의 {view.counts.회의}건 · 안건 {view.counts.안건}건 · 이월 {view.edges.filter((e) => e.type === '이월').length}번 · 이행 {view.counts.이행}건 · 고충 {view.counts.고충}건
            {' · '}기한 경과 {view.nodes.filter((n) => n.late).length}건
            <span data-testid="shown-count"> · 보이는 노드 {shown.size}개</span>
          </div>
          <fieldset className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <legend className="sr-only">보일 종류</legend>
            {NODE_TYPES.map((t) => (
              <label key={t} className="inline-flex items-center gap-1.5">
                <input type="checkbox" checked={types.includes(t)} onChange={(e) => setTypes(e.target.checked ? [...types, t] : types.filter((x) => x !== t))} />
                <span className="inline-block h-3 w-3 rounded-full" style={{ background: NODE_COLORS[t] }} aria-hidden />
                {t} {view.counts[t]}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="inline-flex items-center gap-1.5">회의 기간 <input type="date" aria-label="기간 시작" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border border-[var(--grey-300)] px-2 py-1" /></label>
            <span>~</span>
            <input type="date" aria-label="기간 끝" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border border-[var(--grey-300)] px-2 py-1" />
            <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> 기한 지난 이행·고충만</label>
          </div>
        </>
      )}

      <div className="grid gap-4 md:grid-cols-[1fr_260px]">
        <div ref={box} data-testid="council-graph" className="h-[420px] w-full overflow-hidden rounded-xl border border-[var(--grey-300)] bg-white md:h-[560px]" style={{ display: view ? 'block' : 'none' }} />
        {view && (
          <aside className="rounded-xl border border-[var(--grey-300)] p-4 text-sm" aria-label="고른 노드">
            {sel ? (
              <div className="space-y-2">
                <div className="font-semibold" style={{ color: NODE_COLORS[sel.type] }}>{sel.type}</div>
                <div className="break-all font-semibold text-[var(--color-text-primary)]">{sel.label}</div>
                {sel.date && <div>개최일 {sel.date}</div>}
                {sel.status && <div>상태 {sel.status}{sel.late ? ' · 기한 경과' : ''}</div>}
                <div className="pt-2 font-semibold text-[var(--color-text-primary)]">이어진 선 {selEdges.length}개</div>
                <ul className="space-y-1">
                  {selEdges.slice(0, 30).map((e, k) => (
                    <li key={k}>
                      <span className="text-[var(--grey-700)]">{e.type}</span> → <button type="button" className="break-all text-left underline underline-offset-2" onClick={() => setSelected(e.from === selected ? e.to : e.from)}>{e.from === selected ? e.to : e.from}</button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p style={{ color: 'var(--grey-700)' }}>노드를 누르면 종류·상태와 이어진 선이 여기에 나옵니다. 끌어서 옮기고 휠로 확대합니다.</p>
            )}
          </aside>
        )}
      </div>

      {view && view.unconfirmed.length > 0 && (
        <p className="text-sm" style={{ color: 'var(--grey-700)' }}>가져와서 확인하지 않은 회의록 {view.unconfirmed.join(', ')} — 확인 기록(record_council_history 의 「가져옴 확인」)을 남기면 선이 생깁니다.</p>
      )}
      {files && files.skipped.length > 0 && (
        <details className="text-sm" style={{ color: 'var(--grey-700)' }}>
          <summary>읽지 않은 파일 {files.skipped.length}개</summary>
          <ul className="list-disc pl-5">{files.skipped.map((s, k) => <li key={k}>{s.file} — {s.reason}</li>)}</ul>
        </details>
      )}
    </div>
  );
}
