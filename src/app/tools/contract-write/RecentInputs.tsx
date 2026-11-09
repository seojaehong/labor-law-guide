'use client';

// 최근 입력 — 근로계약서 작성 화면 위의 접힌 영역. 남길 칸·되살리기 규칙은 historyState.ts(시험 대상)에 있고 여기는 부르기만 한다.
// 저장소는 마운트 뒤에 읽는다(서버 렌더와 첫 화면이 같아야 한다). 최근 입력이 없으면 아무것도 그리지 않는다 — 첫 화면이 그대로다.
// 🔒 서버로 보내는 코드가 없다.

import { useEffect, useState } from 'react';

import { clearHistory, HISTORY_CHANGED, isHistoryRemembered, listHistory, setHistoryRemember, type HistoryEntry } from '@/lib/tool-history';

import type { WriteState } from './formState';
import { fromHistoryState, HISTORY_COPY, HISTORY_TOOL, recentInputsVisible, savedAtText } from './historyState';

const secondary: React.CSSProperties = { color: 'var(--color-text-secondary)' };

export function RecentInputs({ onLoad }: { onLoad: (s: WriteState) => void }) {
  /** 마운트 전에는 저장소를 읽지 않는다 — 브라우저에만 있다 */
  const [ready, setReady] = useState(false);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [remember, setRemember] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      setEntries(listHistory(HISTORY_TOOL));
      setRemember(isHistoryRemembered(HISTORY_TOOL));
      setReady(true);
    };
    sync();
    window.addEventListener(HISTORY_CHANGED, sync);
    return () => window.removeEventListener(HISTORY_CHANGED, sync);
  }, []);

  if (!recentInputsVisible(ready, entries.length, remember)) return null;

  return (
    <details className="rounded-xl border border-dashed p-3" style={{ borderColor: 'var(--color-border)' }}>
      <summary className="cursor-pointer text-sm font-semibold">{HISTORY_COPY.summary}</summary>
      <div className="mt-3 space-y-3 text-sm">
        <p className="text-xs leading-relaxed" style={secondary}>
          {HISTORY_COPY.intro}
        </p>
        <ul className="space-y-2">
          {entries.map((e, i) => (
            <li key={`${i}-${e.savedAt}`}>
              <button
                type="button"
                aria-label={HISTORY_COPY.load(e.label)}
                onClick={() => {
                  onLoad(fromHistoryState(e.state));
                  setMessage(HISTORY_COPY.loaded(e.label));
                }}
                className="flex min-h-[44px] w-full flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-left"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <span className="font-medium">{e.label}</span>
                <span className="text-xs" style={secondary}>
                  {savedAtText(e.savedAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {message && <p role="status">{message}</p>}
        <div className="space-y-1">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={remember} onChange={(e) => setMessage(setHistoryRemember(HISTORY_TOOL, e.target.checked) ? null : HISTORY_COPY.rememberFailed)} />
            {HISTORY_COPY.remember}
          </label>
          <p className="text-xs" style={secondary}>
            {remember ? HISTORY_COPY.rememberOn : HISTORY_COPY.rememberOff}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setMessage(null);
            clearHistory(HISTORY_TOOL);
          }}
          className="inline-flex min-h-[44px] items-center justify-center rounded-md border px-4 py-2 text-sm font-semibold"
          style={{ borderColor: 'var(--color-border)' }}
        >
          {HISTORY_COPY.clear}
        </button>
      </div>
    </details>
  );
}
