'use client';
// 확인 작업대 — 담당자 한 사람이 수백 건을 처리한다는 전제로 만든다.
// · 묶어 보기 두 가지: 규정별(담당자가 일하는 단위) / 종류별(같은 종류를 한 번에)
// · 기본 상태는 늘 「미확인」. 반영을 미리 찍어 두지 않는다
// · 키보드: J/K 이동, 1 반영 · 2 보류 · 3 해당 없음 · 0 미확인으로
import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, CircleSlash, Keyboard, PauseCircle, Search } from 'lucide-react';
import { KIND_GROUP, KIND_LABEL, type Finding } from '@/lib/rules-review/checks';
import { articleAt, articleText, type Regulation } from '@/lib/rules-review/model';
import { deptOf, disputed, stateOf, stats, type Decision, type ItemState, type Workspace } from '@/lib/rules-review/workspace';

type View = '규정별' | '종류별';
type Filter = '미확인' | '전체' | '반영' | '보류' | '해당 없음' | '이견';
const FILTERS: Filter[] = ['미확인', '전체', '반영', '보류', '해당 없음', '이견'];
const GROUPS = ['위임·인용', '별표·서식', '체계', '규정 간 충돌', '용어·문장'];
const PAGE = 40;

const KEY: Record<string, Decision> = { '1': '반영', '2': '보류', '3': '해당 없음', '0': '미확인' };

function matches(ws: Workspace, f: Finding, filter: Filter): boolean {
  const s = stateOf(ws, f.id);
  if (filter === '전체') return true;
  if (filter === '이견') return disputed(s);
  return s.decision === filter;
}

export default function Workbench({ ws, patch, patchMany }: {
  ws: Workspace;
  patch: (id: string, p: Partial<ItemState>) => void;
  patchMany: (ids: string[], p: Partial<ItemState>) => void;
}) {
  const [view, setView] = useState<View>('규정별');
  const [group, setGroup] = useState<string>('');
  const [filter, setFilter] = useState<Filter>('미확인');
  const [query, setQuery] = useState('');
  const [focus, setFocus] = useState(0);
  const [limit, setLimit] = useState(PAGE);
  const [confirm, setConfirm] = useState<Decision | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const regsByName = useMemo(() => new Map(ws.regs.map((r) => [r.name, r])), [ws.regs]);

  const groups = useMemo(() => {
    const names = view === '규정별' ? ws.regs.map((r) => r.name) : GROUPS;
    return names.map((name) => {
      const list = ws.findings.filter((f) => (view === '규정별' ? f.reg === name : KIND_GROUP[f.kind] === name));
      return { name, list, st: stats(ws, list) };
    }).filter((g) => g.list.length);
  }, [ws, view]);

  const current = groups.find((g) => g.name === group) ?? null;
  const q = query.trim();
  // 규정을 읽는 순서대로 — 규정 순서, 그 안에서는 걸린 줄 순서(규정 머리 항목이 먼저)
  const order = useMemo(() => new Map(ws.regs.map((r, i) => [r.name, i])), [ws.regs]);
  const visible = useMemo(() => (current ? current.list : ws.findings).filter((f) => matches(ws, f, filter)
    && (!q || `${f.reg} ${f.article} ${f.message} ${f.before}`.includes(q)))
    .sort((a, b) => (order.get(a.reg)! - order.get(b.reg)!) || ((a.spans[0]?.line ?? 0) - (b.spans[0]?.line ?? 0))), [current, ws, filter, q, order]);
  const shown = visible.slice(0, limit);
  const at = Math.min(focus, Math.max(0, shown.length - 1));
  const openIds = visible.filter((f) => stateOf(ws, f.id).decision === '미확인').map((f) => f.id);
  const fixable = visible.filter((f) => stateOf(ws, f.id).decision === '미확인' && f.after !== null).map((f) => f.id);

  // 목록이 바뀌면 처음부터
  const reset = () => { setFocus(0); setLimit(PAGE); setConfirm(null); };

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${at}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [at]);

  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'j' || e.key === 'ArrowDown') { e.preventDefault(); setFocus(Math.min(at + 1, shown.length - 1)); }
    else if (k === 'k' || e.key === 'ArrowUp') { e.preventDefault(); setFocus(Math.max(at - 1, 0)); }
    else if (KEY[e.key] && shown[at]) {
      e.preventDefault();
      patch(shown[at].id, { decision: KEY[e.key] });
      // 「미확인」만 보는 중이면 결정한 항목이 빠지므로 같은 자리가 다음 항목이다
      if (filter !== '미확인' && filter !== KEY[e.key]) setFocus(Math.min(at + 1, shown.length - 1));
    }
  };

  const bulk = (d: Decision) => {
    if (confirm !== d) { setConfirm(d); return; }
    patchMany(d === '반영' ? fixable : openIds, { decision: d });
    setConfirm(null);
  };

  return (
    <div className="rr-bench">
      <aside className="rr-nav" aria-label="묶어 보기">
        <div className="rr-seg" role="radiogroup" aria-label="묶는 기준">
          {(['규정별', '종류별'] as View[]).map((v) => (
            <button key={v} role="radio" aria-checked={view === v} onClick={() => { setView(v); setGroup(''); reset(); }}>{v}</button>
          ))}
        </div>
        <select className="rr-nav-select" value={group} onChange={(e) => { setGroup(e.target.value); reset(); }} aria-label={view === '규정별' ? '규정 고르기' : '종류 고르기'}>
          <option value="">전체 ({ws.findings.length})</option>
          {groups.map((g) => <option key={g.name} value={g.name}>{g.name} (미확인 {g.st.by.미확인}/{g.st.total})</option>)}
        </select>
        <ul className="rr-nav-list">
          <li><button aria-current={!group} onClick={() => { setGroup(''); reset(); }}><span>전체</span><small>{stats(ws).by.미확인}건 남음</small></button></li>
          {groups.map((g) => (
            <li key={g.name}>
              <button aria-current={group === g.name} onClick={() => { setGroup(g.name); reset(); }}>
                <span>{g.name}</span>
                <small>{g.st.by.미확인 ? `${g.st.by.미확인}건 남음` : <><Check size={14} aria-hidden /> {g.st.total}건</>}</small>
                <i style={{ width: `${(g.st.done / g.st.total) * 100}%` }} />
              </button>
            </li>
          ))}
        </ul>
        {view === '종류별' && (
          <p className="rr-mute small">종류 묶음은 나라장터 정비 용역 과업지시서의 요구 항목(위임·인용, 별표·서식, 체계, 규정 간 충돌, 용어·문장)을 따릅니다.</p>
        )}
      </aside>

      <section className="rr-main" aria-label="확인할 항목" onKeyDown={onKey}>
        <div className="rr-filters">
          <div className="rr-chips" role="radiogroup" aria-label="상태">
            {FILTERS.map((f) => (
              <button key={f} role="radio" aria-checked={filter === f} onClick={() => { setFilter(f); reset(); }}>
                {f} <small>{(current ? current.list : ws.findings).filter((x) => matches(ws, x, f)).length}</small>
              </button>
            ))}
          </div>
          <label className="rr-search"><Search size={15} aria-hidden /><input value={query} onChange={(e) => { setQuery(e.target.value); reset(); }} placeholder="조문·낱말 찾기" aria-label="항목 찾기" /></label>
        </div>

        {openIds.length > 1 && (
          <div className="rr-bulk">
            <span>보이는 미확인 {openIds.length}건 한꺼번에:</span>
            {fixable.length > 0 && <button className={`rr-btn small${confirm === '반영' ? ' warn' : ' ghost'}`} onClick={() => bulk('반영')}>{confirm === '반영' ? `한 번 더 누르면 ${fixable.length}건 반영` : `고칠 문안 있는 ${fixable.length}건 반영`}</button>}
            <button className={`rr-btn small${confirm === '해당 없음' ? ' warn' : ' ghost'}`} onClick={() => bulk('해당 없음')}>{confirm === '해당 없음' ? `한 번 더 누르면 ${openIds.length}건 해당 없음` : '모두 해당 없음'}</button>
            {confirm && <button className="rr-link" onClick={() => setConfirm(null)}>취소</button>}
          </div>
        )}

        <p className="rr-keys"><Keyboard size={14} aria-hidden /> 항목을 누른 뒤 <kbd>J</kbd>/<kbd>K</kbd> 이동 · <kbd>1</kbd> 반영 · <kbd>2</kbd> 보류 · <kbd>3</kbd> 해당 없음 · <kbd>0</kbd> 미확인</p>

        <datalist id="rr-depts">{[...new Set(Object.values(ws.depts))].filter(Boolean).map((d) => <option key={d} value={d} />)}</datalist>
        <div ref={listRef} className="rr-cards">
          {shown.length === 0 && (
            <div className="rr-empty">
              {filter === '미확인' ? (current ? `「${current.name}」의 항목을 모두 확인했습니다.` : '모든 항목을 확인했습니다. 「부서 의견」·「결재 묶음」으로 넘어가세요.') : '이 조건에 맞는 항목이 없습니다.'}
              {filter === '미확인' && current && (() => {
                const next = groups.find((g) => g.name !== current.name && g.st.by.미확인);
                return next ? <div><button className="rr-btn small" onClick={() => { setGroup(next.name); reset(); }}>다음 묶음 「{next.name}」 — {next.st.by.미확인}건</button></div> : null;
              })()}
            </div>
          )}
          {shown.map((f, i) => (
            <Card key={f.id} i={i} f={f} s={stateOf(ws, f.id)} reg={regsByName.get(f.reg)!} dept={deptOf(ws, f)}
              focused={i === at} onFocus={setFocus} patch={patch} />
          ))}
          {visible.length > shown.length && (
            <button className="rr-btn ghost wide" onClick={() => setLimit((n) => n + PAGE)}><ChevronDown size={16} aria-hidden /> {Math.min(PAGE, visible.length - shown.length)}건 더 보기 (남은 {visible.length - shown.length}건)</button>
          )}
        </div>
      </section>
    </div>
  );
}

const CTX = 70;

/** 걸린 글자 앞뒤만 잘라 강조한다 */
function Excerpt({ text, at, length }: { text: string; at: number; length: number }) {
  if (!length) return <span>{text.length > 160 ? `${text.slice(0, 160)}…` : text}</span>;
  const s = Math.max(0, at - CTX), e = Math.min(text.length, at + length + CTX);
  return (
    <span>{s > 0 ? '…' : ''}{text.slice(s, at)}<mark>{text.slice(at, at + length)}</mark>{text.slice(at + length, e)}{e < text.length ? '…' : ''}</span>
  );
}

const PLACE: Record<Decision, string> = {
  미확인: '메모(선택)',
  반영: '사유(선택) — 신·구조문대비표 사유 칸에 붙습니다',
  보류: '보류 사유 — 결재 묶음 보류 목록에 실립니다',
  '해당 없음': '그대로 두는 이유 — 나중에 「왜 안 고쳤나」의 근거가 됩니다',
};

const Card = memo(function Card({ i, f, s, reg, dept, focused, onFocus, patch }: {
  i: number; f: Finding; s: ItemState; reg: Regulation; dept: string; focused: boolean;
  onFocus: (i: number) => void; patch: (id: string, p: Partial<ItemState>) => void;
}) {
  const [writing, setWriting] = useState(!!s.text && f.after === null);
  const editable = f.after !== null && f.kind !== 'plain';
  // 규정 전체에 걸린 항목(상위 규정 없음·개정 표시 모양)은 자리가 규정 머리(0번 줄, 길이 0)라 발췌를 보이지 않는다
  const spans = f.spans.filter((sp) => sp.line >= 0 && !(sp.line === 0 && !sp.length));
  const decide = (d: Decision) => patch(f.id, { decision: s.decision === d ? '미확인' : d });
  const art = spans.length ? articleAt(reg, spans[0].line) : null;
  return (
    <article className={`rr-item${focused ? ' focus' : ''} d-${s.decision === '해당 없음' ? 'na' : s.decision === '반영' ? 'ok' : s.decision === '보류' ? 'hold' : 'open'}`}
      data-i={i} tabIndex={0} onFocus={() => onFocus(i)} aria-label={`${f.reg} ${f.article} ${KIND_LABEL[f.kind]}`}>
      <header className="rr-item-head">
        <span className={`rr-kind g-${GROUPS.indexOf(KIND_GROUP[f.kind])}`}>{KIND_LABEL[f.kind]}</span>
        <span className="rr-where">{f.reg}{f.article ? ` · ${f.article}` : ''}</span>
        {s.decision !== '미확인' && <span className="rr-state">{s.decision}</span>}
      </header>
      <p className="rr-msg">{f.message}</p>

      {spans.length > 0 && (
        <div className="rr-quote">
          {spans.slice(0, 3).map((sp, k) => (
            <p key={k}><Excerpt text={reg.lines[sp.line]?.text ?? ''} at={sp.at} length={sp.length} /></p>
          ))}
          {spans.length > 3 && <p className="rr-mute small">외 {spans.length - 3}곳</p>}
        </div>
      )}

      {f.other && f.other.text && f.other.text !== f.other.reg && (
        <details className="rr-other">
          <summary>맞대 본 곳 · {f.other.reg}{f.other.article ? ` ${f.other.article}` : ''}</summary>
          <pre>{f.other.text}</pre>
        </details>
      )}

      {f.after !== null && (
        <div className="rr-fix">
          <span className="rr-fix-label">고친 문안</span>
          <span className="rr-diff"><del>{f.before}</del> → </span>
          {editable ? (
            <input value={s.text ?? f.after} onChange={(e) => patch(f.id, { text: e.target.value === f.after ? undefined : e.target.value })} aria-label="고친 문안" />
          ) : <ins>{f.after}</ins>}
          {f.kind === 'plain' && <span className="rr-mute small">반영하면 이 규정의 {spans.length}곳을 모두 바꿉니다</span>}
        </div>
      )}
      {f.after === null && (art || writing) && (
        writing ? (
          <div className="rr-fix col">
            <label className="rr-fix-label" htmlFor={`w-${f.id}`}>개정 문안(직접 작성 · 신·구조문대비표에 실립니다)</label>
            <textarea id={`w-${f.id}`} rows={4} value={s.text ?? ''} onChange={(e) => patch(f.id, { text: e.target.value })} placeholder="고친 조문 전체를 적으세요" />
          </div>
        ) : (
          <div className="rr-row">
            <button className="rr-link" onClick={() => { setWriting(true); if (!s.text && art) patch(f.id, { text: articleText(reg, art) }); }}>개정 문안 직접 쓰기{art ? '(현행 조문을 불러와 고칩니다)' : ''}</button>
          </div>
        )
      )}

      {s.opinion && (
        <div className={`rr-opinion${disputed(s) ? ' warn' : ''}`}>
          <b>{s.opinion.dept}{s.opinion.by ? `(${s.opinion.by})` : ''} 의견: {s.opinion.verdict}</b>{s.opinion.text ? ` — ${s.opinion.text}` : ''}
          {disputed(s) && (
            <textarea rows={2} value={s.settle ?? ''} onChange={(e) => patch(f.id, { settle: e.target.value })} placeholder="조율 결과 — 결재 묶음 부서 협의 내역에 실립니다" aria-label="조율 결과" />
          )}
        </div>
      )}

      <footer className="rr-item-foot">
        <div className="rr-decide" role="group" aria-label="결정">
          <button aria-pressed={s.decision === '반영'} className="ok" onClick={() => decide('반영')}><Check size={15} aria-hidden /> 반영</button>
          <button aria-pressed={s.decision === '보류'} className="hold" onClick={() => decide('보류')}><PauseCircle size={15} aria-hidden /> 보류</button>
          <button aria-pressed={s.decision === '해당 없음'} className="na" onClick={() => decide('해당 없음')}><CircleSlash size={15} aria-hidden /> 해당 없음</button>
        </div>
        <input className="rr-note-in" value={s.note} onChange={(e) => patch(f.id, { note: e.target.value })} placeholder={PLACE[s.decision]} aria-label="사유" />
        <label className="rr-dept">소관 <input value={s.dept ?? dept} onChange={(e) => patch(f.id, { dept: e.target.value || undefined })} placeholder="부서" aria-label="소관 부서" list="rr-depts" /></label>
      </footer>
    </article>
  );
});
