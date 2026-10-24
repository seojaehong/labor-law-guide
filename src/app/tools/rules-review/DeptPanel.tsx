'use client';
// 소관 부서 의견 — 규정마다 소관 부서를 정하고, 부서별 의견 요청 엑셀을 내보내고, 회신 엑셀을 다시 올려 항목에 붙인다.
// 담당자가 지금 일하는 방식(엑셀+메일)을 그대로 따른다. 부서는 가입하지 않는다.
import { useMemo, useState } from 'react';
import { Download, FileUp, Users } from 'lucide-react';
import { deptOf, disputed, stateOf, type Workspace } from '@/lib/rules-review/workspace';
import { download, safeName, today } from './download';

export default function DeptPanel({ ws, setWs }: { ws: Workspace; setWs: (fn: (w: Workspace | null) => Workspace | null) => void }) {
  const [withOpen, setWithOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = (d: string) => ws.findings.filter((f) => {
    const s = stateOf(ws, f.id).decision;
    return deptOf(ws, f) === d && (s === '반영' || (withOpen && s === '미확인'));
  });
  const depts = useMemo(() => {
    const m = new Map<string, { asked: number; replied: number; disputed: number; unsettled: number }>();
    for (const f of ws.findings) {
      const d = deptOf(ws, f);
      if (!d) continue;
      const s = stateOf(ws, f.id);
      const v = m.get(d) ?? { asked: 0, replied: 0, disputed: 0, unsettled: 0 };
      if (s.opinion) v.replied++;
      if (disputed(s)) { v.disputed++; if (!s.settle?.trim()) v.unsettled++; }
      m.set(d, v);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ko'));
  }, [ws]);
  const orphan = ws.findings.filter((f) => !deptOf(ws, f) && stateOf(ws, f.id).decision === '반영').length;
  const known = [...new Set([...Object.values(ws.depts), ...depts.map(([d]) => d)])].filter(Boolean);

  const setDept = (reg: string, dept: string) => setWs((w) => (w ? { ...w, depts: { ...w.depts, [reg]: dept } } : w));

  const one = async (d: string) => {
    const items = send(d);
    if (!items.length) { setMsg(`${d}에 보낼 항목이 없습니다. 확인 탭에서 「반영」으로 고른 항목만 보냅니다${withOpen ? '' : '(미확인도 보내려면 위 칸을 고르세요)'}.`); return; }
    const { requestXlsx } = await import('@/lib/rules-review/outputs');
    download(`${safeName(ws.institution)}_규정정비_의견요청_${safeName(d)}_${today()}.xlsx`, await requestXlsx(ws, d, items));
    setMsg(`${d} 의견 요청 엑셀(${items.length}건)을 받았습니다. 메일로 보내고 회신 파일을 아래에 올리세요.`);
  };
  const all = async () => {
    const { requestXlsx, zipOf } = await import('@/lib/rules-review/outputs');
    const files = [];
    for (const [d] of depts) {
      const items = send(d);
      if (items.length) files.push({ name: `${safeName(ws.institution)}_규정정비_의견요청_${safeName(d)}.xlsx`, data: await requestXlsx(ws, d, items) });
    }
    if (!files.length) { setMsg('보낼 항목이 없습니다. 확인 탭에서 「반영」으로 고른 항목만 보냅니다.'); return; }
    download(`${safeName(ws.institution)}_규정정비_의견요청_${today()}.zip`, await zipOf(files));
    setMsg(`부서 ${files.length}곳의 의견 요청 엑셀을 zip 으로 받았습니다.`);
  };
  const upload = async (list: File[]) => {
    if (!list.length) return;
    setBusy(true);
    try {
      const { parseOpinions, attachOpinions } = await import('@/lib/rules-review/outputs');
      let attached = 0, missing = 0, dis = 0, files = 0;
      let cur = ws;
      for (const f of list) {
        const ops = await parseOpinions(await f.arrayBuffer());
        if (!ops.length) continue;
        files++;
        const r = attachOpinions(cur, null, ops);
        cur = r.ws;
        attached += r.attached;
        missing += r.missing.length;
        dis += ops.filter((o) => o.verdict !== '동의').length;
      }
      setWs(() => cur);
      setMsg(files ? `회신 ${files}개에서 의견 ${attached}건을 붙였습니다${dis ? ` — 수정·반대 ${dis}건은 「이견」으로 표시했습니다(확인 탭 「이견」에서 조율 결과를 적으세요)` : ''}${missing ? `. 짝을 찾지 못한 항목 번호 ${missing}개는 건너뛰었습니다` : ''}.` : '의견이 적힌 회신 엑셀을 찾지 못했습니다. 「의견(동의·수정·반대)」 칸이 채워졌는지 보세요.');
    } catch (e) {
      setMsg(`회신 파일을 읽지 못했습니다: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rr-panel" aria-labelledby="rr-dept">
      <h2 id="rr-dept" className="rr-h2"><Users size={20} aria-hidden /> 소관 부서 의견</h2>
      <p className="rr-mute">규정 담당자가 모든 항목을 확인하되, 반영할 항목은 소관 부서 의견을 받습니다. 부서별 엑셀을 메일로 보내고, 회신 엑셀을 그대로 올리면 항목에 의견이 붙습니다.</p>
      <datalist id="rr-depts">{known.map((d) => <option key={d} value={d} />)}</datalist>

      <h3 className="rr-h3">1. 규정별 소관 부서</h3>
      <div className="rr-table-wrap">
        <table className="rr-table">
          <thead><tr><th>규정</th><th>소관 부서</th><th>반영 항목</th></tr></thead>
          <tbody>
            {ws.regs.map((r) => (
              <tr key={r.key}>
                <td>{r.name}</td>
                <td><input className="rr-cell-in" value={ws.depts[r.name] ?? ''} onChange={(e) => setDept(r.name, e.target.value)} placeholder="부서 이름" list="rr-depts" aria-label={`${r.name} 소관 부서`} /></td>
                <td>{ws.findings.filter((f) => f.reg === r.name && stateOf(ws, f.id).decision === '반영').length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {orphan > 0 && <p className="rr-warn">소관 부서가 비어 있는 반영 항목이 {orphan}건 있습니다. 위 표에서 부서를 적어야 의견 요청에 들어갑니다.</p>}

      <h3 className="rr-h3">2. 부서별 의견 요청 보내기</h3>
      <label className="rr-check"><input type="checkbox" checked={withOpen} onChange={(e) => setWithOpen(e.target.checked)} /> 아직 미확인인 항목도 함께 보내기</label>
      <div className="rr-grid">
        {depts.map(([d, v]) => {
          const n = send(d).length;
          return (
            <div key={d} className="rr-card">
              <b>{d}</b>
              <p>보낼 항목 {n}건 · 회신 {v.replied}건{v.disputed ? ` · 이견 ${v.disputed}건(조율 전 ${v.unsettled})` : ''}</p>
              <button className="rr-btn small ghost" onClick={() => one(d)} disabled={!n}><Download size={15} aria-hidden /> 의견 요청 엑셀</button>
            </div>
          );
        })}
        {!depts.length && <p className="rr-mute">아직 소관 부서가 정해진 항목이 없습니다.</p>}
      </div>
      {depts.length > 1 && <button className="rr-btn" onClick={all}><Download size={16} aria-hidden /> 모든 부서 파일 한 번에(zip)</button>}

      <h3 className="rr-h3">3. 회신 올리기</h3>
      <label className="rr-btn ghost">
        <FileUp size={16} aria-hidden /> {busy ? '읽는 중…' : '회신 엑셀 고르기(여러 개 가능)'}
        {/* FileList 는 입력값을 비우면 같이 비므로 먼저 배열로 옮긴다 */}
        <input type="file" hidden multiple accept=".xlsx" onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ''; upload(files); }} />
      </label>
      {msg && <p className="rr-note" role="status">{msg}</p>}
    </section>
  );
}
