'use client';

// 사업장 카드 — 근로계약서 작성 화면 위의 접힌 영역. 칸 채우기·저장 규칙은 cardState.ts(시험 대상)에 있고 여기는 부르기만 한다.
// 저장소는 마운트 뒤에 읽는다(서버 렌더와 첫 화면이 같아야 한다). 카드를 고르기 전에는 입력 칸을 건드리지 않는다.
// 🔒 서버로 보내는 코드가 없다.

import { useEffect, useMemo, useState } from 'react';

import { CARD_COPY, cardFromState, cardPatch, saveCardFromState } from '@/app/tools/contract-write/cardState';
import type { WriteState } from '@/app/tools/contract-write/formState';
import { getMembers, getWorkspaceDetails, listWorkspaces, memberKey, setRemember, WORKSPACES_CHANGED, type Workspace } from '@/lib/leave/leave-workspaces';

import { CardFileTools } from './CardFileTools';

const selectClass = 'w-full rounded-lg border px-3 py-2 text-base focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20';
const selectStyle: React.CSSProperties = {
  borderColor: 'var(--color-border)',
  backgroundColor: 'var(--color-bg-surface)',
  color: 'var(--color-text-primary)',
};
const secondary: React.CSSProperties = { color: 'var(--color-text-secondary)' };

export function WorkplacePicker({ state, onPatch }: { state: WriteState; onPatch: (p: Partial<WriteState>) => void }) {
  /** 마운트 전에는 저장소를 읽지 않는다 — 브라우저에만 있다 */
  const [ready, setReady] = useState(false);
  const [list, setList] = useState<Workspace[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [pickedMember, setPickedMember] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      setList(listWorkspaces());
      setReady(true);
    };
    sync();
    window.addEventListener(WORKSPACES_CHANGED, sync);
    return () => window.removeEventListener(WORKSPACES_CHANGED, sync);
  }, []);

  const selected = list.find((w) => w.id === selectedId) ?? null;
  // 목록이 바뀌면(저장·기억하기 전환) selected 도 새 객체라 명부를 다시 읽는다
  const members = useMemo(() => (selected ? getMembers(selected) : []), [selected]);
  const card = cardFromState(state);

  const pickWorkspace = (id: string) => {
    setSelectedId(id);
    setPickedMember('');
    const ws = list.find((w) => w.id === id);
    setMessage(ws && !ws.fivePlus ? CARD_COPY.fivePlusUnknown : null);
    if (ws) onPatch(cardPatch(ws, null, getWorkspaceDetails(ws), { clearEmployee: pickedMember !== '' }));
  };
  const pickMember = (key: string) => {
    setPickedMember(key);
    setMessage(null);
    const m = members.find((x) => memberKey(x) === key);
    if (m) onPatch(cardPatch(null, m));
  };
  const save = () => {
    const r = saveCardFromState(state, selectedId || null);
    if (r.ok) setSelectedId(r.workspace.id);
    setMessage(r.ok ? r.message : r.reason);
  };

  return (
    <details className="rounded-xl border border-dashed p-3" style={{ borderColor: 'var(--color-border)' }}>
      <summary className="cursor-pointer text-sm font-semibold">{CARD_COPY.summary}</summary>
      {ready && (
        <div className="mt-3 space-y-3 text-sm">
          <p className="text-xs leading-relaxed" style={secondary}>
            {CARD_COPY.intro}
          </p>
          {list.length === 0 ? (
            <p>{CARD_COPY.empty}</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <span className="mb-1 block text-sm font-semibold">{CARD_COPY.pickWorkspace}</span>
                <select aria-label={CARD_COPY.pickWorkspace} value={selectedId} onChange={(e) => pickWorkspace(e.target.value)} className={selectClass} style={selectStyle}>
                  <option value="">{CARD_COPY.pickWorkspaceNone}</option>
                  {list.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
              {selected && (
                <div>
                  <span className="mb-1 block text-sm font-semibold">{CARD_COPY.pickMember}</span>
                  {members.length === 0 ? (
                    <p style={secondary}>{CARD_COPY.noMembers}</p>
                  ) : (
                    <select aria-label={CARD_COPY.pickMember} value={pickedMember} onChange={(e) => pickMember(e.target.value)} className={selectClass} style={selectStyle}>
                      <option value="">{CARD_COPY.pickMemberNone}</option>
                      {members.map((m) => (
                        <option key={memberKey(m)} value={memberKey(m)}>
                          {m.name} ({m.hireDate})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!card.ok}
              onClick={save}
              className="inline-flex min-h-[44px] items-center justify-center rounded-md border px-4 py-2 text-sm font-semibold disabled:opacity-60"
              style={{ borderColor: 'var(--color-border)' }}
            >
              {CARD_COPY.save}
            </button>
            {!card.ok && <span style={secondary}>{card.reason}</span>}
          </div>
          {message && <p role="status">{message}</p>}
          {selected && (
            <div className="space-y-1">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={selected.remember} onChange={(e) => setMessage(setRemember(selected.id, e.target.checked) ? null : CARD_COPY.rememberFailed)} />
                {CARD_COPY.remember(selected.name)}
              </label>
              <p className="text-xs" style={secondary}>
                {selected.remember ? CARD_COPY.rememberOn : CARD_COPY.rememberOff}
              </p>
            </div>
          )}
          <CardFileTools hasCards={list.length > 0} />
        </div>
      )}
    </details>
  );
}
