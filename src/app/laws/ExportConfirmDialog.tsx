'use client';

import { useEffect, useRef } from 'react';
import type { SelectedLawExportStats } from '@/lib/laws/export-selected';

export interface PendingLawExport {
  blob: Blob;
  filename: string;
  kind: 'xlsx' | 'docx';
  stats: SelectedLawExportStats;
  hiddenCount: number;
  returnFocusTo: HTMLElement | null;
}

const count = (n: number) => n.toLocaleString('ko-KR');

/** Native modal semantics supply keyboard trapping, inert background and Escape support. */
export default function ExportConfirmDialog({ pending, onConfirm, onCancel }: {
  pending: PendingLawExport;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    cancelRef.current?.focus();
    return () => {
      dialog.close();
      requestAnimationFrame(() => pending.returnFocusTo?.focus());
    };
  }, [pending.returnFocusTo]);

  return <dialog ref={ref} className="lr-export-dialog" aria-labelledby="law-export-title"
    aria-describedby="law-export-description" onKeyDown={(event) => event.stopPropagation()} onCancel={(event) => { event.preventDefault(); onCancel(); }}>
    <h2 id="law-export-title">분량이 큰 원문 파일입니다</h2>
    <p id="law-export-description">선택한 개정의 신구대조 원문 전체가 들어 있습니다. 저장한 뒤 문서 앱에서 여는 데 시간이 걸릴 수 있습니다.</p>
    <dl>
      <div><dt>저장 범위</dt><dd>개정 {count(pending.stats.eventCount)}건 · 법령 {count(pending.stats.lawCount)}개 · 조문 {count(pending.stats.changeCount)}개</dd></div>
      <div><dt>개정 전·후 원문</dt><dd>{count(pending.stats.textCharacterCount)}자</dd></div>
      <div><dt>실제 파일 크기</dt><dd>{(pending.blob.size / 1_000_000).toLocaleString('ko-KR', { maximumFractionDigits: 2 })} MB ({count(pending.blob.size)}바이트) · {pending.kind.toUpperCase()}</dd></div>
      {pending.hiddenCount > 0 && <div><dt>준비 시작 시 결과 밖 선택</dt><dd>{count(pending.hiddenCount)}건 포함</dd></div>}
    </dl>
    <p className="lr-export-explanation">글자 수는 공백·줄바꿈을 포함한 개정 전·후 원문 기준입니다. 별도로 붙이는 제목·출처·부칙과 반복 표기는 포함하지 않습니다. 실제 파일 크기는 생성된 파일을 측정한 값이며, 페이지 수는 글자 크기와 문서 앱에 따라 달라 예상하지 않습니다.</p>
    {pending.kind === 'docx' && <p className="lr-export-explanation">개정별로 새 페이지에서 시작합니다. 한컴 한글·Word 앱에서의 호환은 아직 검수하지 않았습니다.</p>}
    <div className="lr-export-dialog-actions">
      <button ref={cancelRef} className="lr-btn lr-btn-ghost" onClick={onCancel}>취소하고 선택 유지</button>
      <button className="lr-btn" onClick={onConfirm}>원문 전체 내려받기</button>
    </div>
  </dialog>;
}
