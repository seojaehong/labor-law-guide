'use client';

// 사업장 카드 파일 — 내보내기(다운로드)·가져오기(파일 고르기). 다른 브라우저·PC 로 카드를 옮기는 길이다.
// 파일 내용 만들기·검증·합치기는 leave-workspaces(시험 대상)에 있고 여기는 부르기만 한다.
// 🔒 서버로 보내는 코드가 없다 — 고른 파일은 FileReader 로 이 브라우저 안에서 읽는다.

import { useState } from 'react';

import { CARD_COPY, cardFileName, cardFileTooLarge, cardImportMessage } from '@/app/tools/contract-write/cardState';
import { exportCardsJson, importCards } from '@/lib/leave/leave-workspaces';
import { todayKst } from '@/lib/tool-kit';
import { download } from '@/lib/tool-kit/download';

const secondary: React.CSSProperties = { color: 'var(--color-text-secondary)' };
const buttonClass = 'inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-md border px-4 py-2 text-sm font-semibold disabled:opacity-60';

export function CardFileTools({ hasCards }: { hasCards: boolean }) {
  const [remember, setRemember] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const exportFile = () => {
    const json = exportCardsJson();
    if (json === null) return setMessage(CARD_COPY.fileExportTooLarge);
    download(new TextEncoder().encode(json), cardFileName(todayKst()), 'application/json');
    setMessage(null);
  };

  const importFile = (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = ''; // 같은 파일을 다시 골라도 읽게
    if (!file) return;
    if (cardFileTooLarge(file.size)) return setMessage(CARD_COPY.fileTooLarge);
    const reader = new FileReader();
    reader.onload = () => {
      setMessage(cardImportMessage(importCards(typeof reader.result === 'string' ? reader.result : null, { remember }), remember));
    };
    reader.onerror = () => setMessage(CARD_COPY.fileReadError);
    reader.readAsText(file);
  };

  return (
    <div className="space-y-2 border-t pt-3" style={{ borderColor: 'var(--color-border)' }}>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={!hasCards} onClick={exportFile} className={buttonClass} style={{ borderColor: 'var(--color-border)' }}>
          {CARD_COPY.fileExport}
        </button>
        <label className={buttonClass} style={{ borderColor: 'var(--color-border)' }}>
          {CARD_COPY.fileImport}
          <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => importFile(e.currentTarget)} />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          {CARD_COPY.fileRemember}
        </label>
      </div>
      <p className="text-xs" style={secondary}>
        {CARD_COPY.fileNotice} {CARD_COPY.fileMergeNotice}
      </p>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
