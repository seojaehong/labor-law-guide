'use client';

// 「3. 내 파일에 반영」 — 점검 항목의 바꿀 문안 제안을 원래 한글 파일에 넣은 새 파일을 만든다.
// 모두 이 브라우저 안에서 한다(rhwp WASM). 원본 바이트는 고치지 않고, 내려받을 때마다 원본에 수락 목록을 다시 적용한다.
import { useEffect, useMemo, useState } from 'react';
import { FileDown, RotateCcw } from 'lucide-react';
import { HwpEditDoc, type HwpKind } from '@/lib/hwp/hwp-doc';
import { applyChanges, canAccept, planChanges, proposalName, resultLines, type Change, type Plan } from '@/lib/hwp/apply';
import type { PeriodItem } from '@/lib/laws/standard-check';
import { download } from '@/lib/laws/format';

export interface HwpSource {
  bytes: Uint8Array;
  name: string;
  kind: HwpKind;
}

const KIND: Record<Change['kind'], string> = { replace: '본문 교체', insert: '조문 넣기', word: '낱말 바꾸기', manual: '직접 고치기' };

export default function HwpApply({ source, items, enabled, floorNote, toast }: { source: HwpSource; items: PeriodItem[]; enabled: boolean; floorNote: string; toast: (m: string) => void }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, Partial<Change>>>({});
  const [accepted, setAccepted] = useState<string[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [out, setOut] = useState<HwpKind>('hwpx');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    HwpEditDoc.open(source.bytes.slice())
      .then((doc) => {
        try {
          const p = planChanges(doc.paragraphs(), items);
          if (live) { setPlan(p); setBlocked(doc.saveBlocked); setError(null); setEdits({}); setAccepted([]); setRejected([]); }
        } finally { doc.free(); }
      })
      .catch((e) => { if (live) setError((e as Error).message); });
    return () => { live = false; };
  }, [source, items]);

  const changes = useMemo(() => (plan?.changes ?? []).map((c) => ({ ...c, ...edits[c.id] })), [plan, edits]);
  const acceptedList = changes.filter((c) => accepted.includes(c.id));
  const edit = (id: string, patch: Partial<Change>) => setEdits((e) => ({ ...e, [id]: { ...e[id], ...patch } }));

  const save = async () => {
    if (!acceptedList.length || busy) return;
    setBusy(true);
    try {
      const r = await applyChanges(source.bytes, acceptedList, out);
      if (r.loss) throw new Error(`저장하면서 빠지는 내용이 ${r.loss}건 있어 내려받기를 멈췄습니다`);
      if (r.missing.length) throw new Error(`다시 열어 보니 반영되지 않은 줄이 있습니다: ${r.missing[0]}`);
      download(proposalName(source.name, out), new Uint8Array(r.bytes), out === 'hwp' ? 'application/x-hwp' : 'application/hwp+zip');
      toast(`${acceptedList.length}건을 반영한 새 파일을 받았습니다. 원본 파일은 그대로입니다`);
    } catch (e) {
      toast(`반영하지 못했습니다: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="lr-apply" aria-label="내 파일에 반영">
      <h3 className="lr-output-title">3. 내 파일에 반영</h3>
      <p className="lr-check-note">
        바꿀 문안 제안을 하나씩 확인 후 반영합니다. 수락한 것만 「{proposalName(source.name, out)}」 새 파일에 들어가고 올린 원본은 바뀌지 않습니다. 반영 전 원문과 대조하세요.
      </p>
      {!enabled && <p className="lr-period-warn" role="status">본문 칸의 글자가 올린 파일에서 읽은 글자와 다릅니다. 반영은 파일을 다시 올렸을 때만 할 수 있습니다.</p>}
      {blocked && <p className="lr-period-warn" role="status">변경 내용 추적 또는 배포용 문서라 새 파일로 저장할 수 없습니다. 문안을 복사해 한글에서 직접 고치세요.</p>}
      {error && <p className="lr-file-error" role="alert">파일을 열지 못했습니다: {error}</p>}
      {!plan && !error && <div className="lr-check-empty">문서 안의 조문 위치를 찾는 중…</div>}
      {plan && !changes.length && <div className="lr-check-empty">파일에 넣을 바꿀 문안이 없습니다.</div>}
      {plan && changes.map((c) => {
        const on = accepted.includes(c.id);
        const off = rejected.includes(c.id);
        const why = on ? null : canAccept(c, acceptedList, plan.articles);
        const locked = on || !enabled || blocked;
        return (
          <div key={c.id} className={`lr-apply-item${on ? ' on' : off ? ' off' : ''}`}>
            <div className="lr-rule-head">
              <span className={`lr-badge ${c.kind === 'manual' || c.blocked ? 'v-info' : 'v-opt'}`}>{KIND[c.kind]}</span>
              <b>{c.where}</b>
              <span className="lr-verdict-meta" style={{ marginTop: 0 }}>{c.topic} · {c.std}</span>
            </div>
            {c.kind === 'insert' && !c.headless && (
              <div className="lr-apply-row">
                <label>넣을 자리
                  <select value={c.anchor} disabled={locked} onChange={(e) => edit(c.id, { anchor: Number(e.target.value), where: `${plan.articles[Number(e.target.value)].no} 뒤` })}>
                    {plan.articles.map((a, i) => <option key={i} value={i}>{a.supplementary ? '부칙 ' : ''}{a.no}{a.title ? `(${a.title})` : ''} 뒤</option>)}
                  </select>
                </label>
                <label>조문 번호
                  <input value={c.no ?? ''} disabled={locked} onChange={(e) => edit(c.id, { no: e.target.value.replace(/\s/g, '') })} aria-label="새 조문 번호" />
                </label>
              </div>
            )}
            {c.before && <div className="lr-apply-before"><span>지금</span><del>{c.before}</del></div>}
            {c.kind === 'word' && <div className="lr-verdict-meta">원문 줄: {plan.lines[c.word!.line]?.text}</div>}
            <div className="lr-apply-after">
              <span>{c.kind === 'manual' ? '문안' : '바꿀 문안 제안'}</span>
              {c.kind === 'manual' ? <div className="lr-clause">{c.after}</div> : (
                <textarea value={c.after} disabled={locked} rows={c.kind === 'word' ? 1 : Math.min(8, c.after.split('\n').length + 1)} onChange={(e) => edit(c.id, { after: e.target.value })} aria-label="바꿀 문안 제안" />
              )}
              {c.kind === 'insert' && !c.headless && <div className="lr-verdict-meta">새 조문 첫 줄: {resultLines(c)[0]}</div>}
            </div>
            {c.review && <p className="lr-review-note">{c.review}</p>}
            {c.blocked && <p className="lr-review-note">{c.blocked}</p>}
            {c.kind !== 'word' && c.kind !== 'manual' && <p className="lr-review-note">{floorNote}</p>}
            {c.kind !== 'manual' && !c.blocked && (
              <div className="lr-apply-row">
                {on ? (
                  <button className="lr-btn lr-btn-ghost lr-btn-sm" onClick={() => setAccepted((a) => a.filter((x) => x !== c.id))}>수락 취소</button>
                ) : (
                  <>
                    <button className="lr-btn lr-btn-sm" disabled={!enabled || blocked || !!why} title={why ?? undefined} onClick={() => { setAccepted((a) => [...a, c.id]); setRejected((r) => r.filter((x) => x !== c.id)); }}>수락</button>
                    <button className="lr-btn lr-btn-ghost lr-btn-sm" aria-pressed={off} onClick={() => setRejected((r) => (off ? r.filter((x) => x !== c.id) : [...r, c.id]))}>{off ? '거절 취소' : '거절'}</button>
                  </>
                )}
                {!on && why && !c.blocked && enabled && <span className="lr-verdict-meta">{why}</span>}
              </div>
            )}
          </div>
        );
      })}
      {plan && changes.some((c) => c.kind !== 'manual' && !c.blocked) && (
        <div className="lr-apply-foot">
          <div className="lr-seg" role="group" aria-label="저장 형식">
            <button aria-pressed={out === 'hwpx'} onClick={() => setOut('hwpx')}>hwpx (권장)</button>
            <button aria-pressed={out === 'hwp'} onClick={() => setOut('hwp')}>hwp</button>
          </div>
          <button className="lr-btn lr-btn-ghost lr-btn-sm" onClick={() => setAccepted([])} disabled={!accepted.length}><RotateCcw size={14} /> 모두 되돌리기</button>
          <button className="lr-btn lr-btn-sm" onClick={save} disabled={!enabled || blocked || busy || !acceptedList.length}><FileDown size={14} /> {busy ? '만드는 중…' : `수정안 내려받기 (${acceptedList.length}건)`}</button>
        </div>
      )}
      {out === 'hwp' && <p className="lr-period-warn">hwp 로 저장한 파일은 한컴 한글에서 열리지 않을 수 있습니다. 가능하면 hwpx 로 받으세요.</p>}
      <p className="lr-check-note">새 파일은 제출 전 한컴 한글로 열어 확인하세요. 조문을 넣어도 뒤 조문 번호와 다른 조문이 인용한 번호는 바뀌지 않습니다. 쪽 나눔·글자 모양은 원본과 다를 수 있습니다.</p>
    </section>
  );
}
