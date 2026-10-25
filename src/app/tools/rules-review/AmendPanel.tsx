'use client';
// 조문 고치기 — 점검 항목이 없어도 담당자가 조문을 직접 고친다(위원 수·위원장·부서 이관·항 신설 같은 정책 개정).
// 실제 정비 대비표의 고침 대부분이 이런 것이라, 이 칸이 없으면 결재 묶음을 이 도구로 끝낼 수 없다.
// 고친 줄은 항목(「직접 고친 조문」, 반영)이 되어 부서 의견·신·구조문대비표·반영본에 그대로 실린다.
import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { PencilLine, RotateCcw } from 'lucide-react';
import { amendedLine, amendsOf, setAmend } from '@/lib/rules-review/amend';
import { articleLabel, type Article, type Regulation } from '@/lib/rules-review/model';
import { stateOf, type Workspace } from '@/lib/rules-review/workspace';
import ReadingsPanel from './ReadingsPanel';

/** 조문 머리가 하나도 없는 규정(표·서식만 있는 pdf 등) — 고를 조문이 없어도 읽은 글자는 원문과 대조할 수 있어야 한다 */
function NoArticles({ ws, reg }: { ws: Workspace; reg: Regulation }) {
  const pdf = (ws.report.pdf ?? []).find((p) => p.path.split('/').pop() === reg.fileName);
  const lines = reg.lines.map((l) => l.text.trim()).filter(Boolean);
  return (
    <article className="rr-item rr-am">
      <p className="rr-mute">「{reg.name}」에서 조문(제N조)을 찾지 못했습니다. 표·서식만 있는 파일일 수 있습니다. 고칠 조문은 없지만, 읽은 글자는 아래에서 원문과 대조하세요.</p>
      {pdf?.xcheck?.length ? <ReadingsPanel path={pdf.path} xcheck={pdf.xcheck} /> : null}
      <details className="rr-rd">
        <summary>읽은 글자 전체({lines.length}줄)</summary>
        {lines.length ? <pre className="rr-rd-pre">{lines.join('\n')}</pre> : <p className="rr-mute small">읽은 글자가 없습니다.</p>}
      </details>
    </article>
  );
}

export default function AmendPanel({ ws, setWs }: { ws: Workspace; setWs: Dispatch<SetStateAction<Workspace | null>> }) {
  const [regName, setRegName] = useState(ws.regs[0]?.name ?? '');
  const [start, setStart] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const reg = ws.regs.find((r) => r.name === regName) ?? ws.regs[0];
  const amends = useMemo(() => (reg ? amendsOf(ws, reg.name) : []), [ws, reg]);
  const countIn = (a: Article) => amends.filter((f) => f.spans[0].line >= a.start && f.spans[0].line <= a.end).length;
  const arts = useMemo(() => (reg ? reg.articles.filter((a) => !a.deleted) : []), [reg]);
  const q = query.trim();
  const listed = q && reg ? arts.filter((a) => reg.lines.slice(a.start, a.end + 1).some((l) => l.text.includes(q))) : arts;
  const art = arts.find((a) => a.start === start) ?? null;
  const total = ws.findings.filter((f) => f.kind === 'amend').length;

  if (!reg) return <div className="rr-wrap wide"><div className="rr-empty">읽은 규정이 없습니다.</div></div>;

  const inArt = art ? amends.filter((f) => f.spans[0].line >= art.start && f.spans[0].line <= art.end) : [];
  const note = inArt.length ? stateOf(ws, inArt[0].id).note : '';
  const edit = (line: number, text: string) => setWs((w) => (w ? setAmend(w, reg, line, text, { note }) : w));
  const setNote = (v: string) => setWs((w) => (w ? { ...w, states: Object.fromEntries(Object.entries(w.states).map(([id, s]) => [id, inArt.some((f) => f.id === id) ? { ...s, note: v } : s])) } : w));
  const pickReg = (name: string) => { setRegName(name); setStart(null); setQuery(''); };

  return (
    <div className="rr-bench">
      <aside className="rr-nav rr-am-nav" aria-label="고칠 조문 고르기">
        <label className="rr-am-field">규정
          <select value={reg.name} onChange={(e) => pickReg(e.target.value)}>
            {ws.regs.map((r) => { const n = amendsOf(ws, r.name).length; return <option key={r.name} value={r.name}>{r.name}{n ? ` (고침 ${n})` : ''}</option>; })}
          </select>
        </label>
        <label className="rr-am-field">조문 찾기
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="낱말로 조문 찾기" />
        </label>
        <select className="rr-nav-select" value={start ?? ''} onChange={(e) => setStart(e.target.value === '' ? null : Number(e.target.value))} aria-label="조문 고르기">
          <option value="">조문을 고르세요 ({listed.length})</option>
          {listed.map((a) => <option key={a.start} value={a.start}>{articleLabel(a)}{countIn(a) ? ` · 고침 ${countIn(a)}` : ''}</option>)}
        </select>
        <ul className="rr-nav-list">
          {listed.map((a) => (
            <li key={a.start}>
              <button aria-current={start === a.start} onClick={() => setStart(a.start)}>
                <span>{articleLabel(a)}</span>
                {countIn(a) > 0 && <small>고침 {countIn(a)}</small>}
              </button>
            </li>
          ))}
          {!listed.length && <li className="rr-mute small">{reg.articles.length ? '맞는 조문이 없습니다.' : '조문(제N조)을 찾지 못한 규정입니다.'}</li>}
        </ul>
      </aside>

      <section className="rr-main" aria-label="조문 고치기">
        <p className="rr-mute rr-am-lead">
          점검 항목과 상관없이 조문을 직접 고칩니다. 고친 줄은 「직접 고친 조문」 항목(반영)이 되어 부서 의견 요청·신·구조문대비표·반영본에 실립니다.
          지금까지 {total}줄을 고쳤습니다.
        </p>
        {!reg.articles.length ? (
          <NoArticles ws={ws} reg={reg} />
        ) : !art ? (
          <div className="rr-empty">왼쪽에서 「{reg.name}」의 조문을 고르세요.</div>
        ) : (
          <article className="rr-item rr-am">
            <header className="rr-item-head"><span className="rr-where"><PencilLine size={15} aria-hidden /> {reg.name} · {articleLabel(art)}</span></header>
            {reg.lines.slice(art.start, art.end + 1).map((l, k) => {
              const line = art.start + k;
              if (!l.text.trim()) return null;
              const a = amends.find((f) => f.spans[0].line === line);
              const now = a ? amendedLine(ws, a) : l.text;
              return (
                <div key={line} className={`rr-am-line${a ? ' on' : ''}`}>
                  <textarea value={now} rows={Math.max(1, Math.ceil(now.length / 30) + (now.match(/\n/g)?.length ?? 0))}
                    onChange={(e) => edit(line, e.target.value)} aria-label={`${articleLabel(art)} ${k + 1}번째 줄`} />
                  {a && (
                    <div className="rr-am-was">
                      <span>현행: {l.text.trim()}</span>
                      <button className="rr-link" onClick={() => edit(line, l.text)}><RotateCcw size={13} aria-hidden /> 되돌리기</button>
                    </div>
                  )}
                  {l.controls > 0 && <span className="rr-mute small">표·그림이 든 문단 — 한글 반영본에는 직접 고쳐야 합니다.</span>}
                </div>
              );
            })}
            <label className="rr-am-field">고친 사유(신·구조문대비표 사유 칸)
              <input value={note} onChange={(e) => (inArt.length ? setNote(e.target.value) : undefined)} disabled={!inArt.length}
                placeholder={inArt.length ? '예: 위원 수 조정, 부서 이관' : '줄을 고치면 사유를 적을 수 있습니다'} />
            </label>
            <p className="rr-mute small">줄 끝에서 Enter 로 새 항·호를 넣을 수 있습니다. 조문을 새로 만들 때는 앞 조문 마지막 줄 끝에 「제N조의2(제목) …」를 이어 적습니다.
              새로 넣은 줄은 신·구조문대비표에 실리고, 한글 반영본에는 직접 넣어야 합니다(결재 묶음에 목록으로 나옵니다).</p>
          </article>
        )}
      </section>
    </div>
  );
}
