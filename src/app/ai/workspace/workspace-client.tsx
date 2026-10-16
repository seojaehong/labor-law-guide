'use client';
import { useState } from 'react';
import { initialWorkspace, documentText, previewDocumentText, type Workspace, type Action } from '@/lib/document-workspace/workflow';
import { createWord } from '@/lib/document-workspace/word';

export default function WorkspaceClient() {
  const [state, setState] = useState<Workspace>(initialWorkspace);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('grounds');
  const [replacement, setReplacement] = useState('');
  const [headcount, setHeadcount] = useState('8');
  const [metrics, setMetrics] = useState('실제 모델 호출 0회');
  async function act(action: Action) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/document-workspace', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state, action, requestId: crypto.randomUUID(), sectionId: selected,
          replacement: action === 'correct-headcount' ? headcount : action === 'correct-leave' ? 'true' : replacement }) });
      const data = await response.json();
      if (!response.ok) throw Error(data.code);
      setState(data.state); setReplacement('');
      setMetrics(`모의 생성 ${data.metrics.calls}회 · 테스트 비용 단위 ${data.metrics.costMicroUsd} · 미확정 ${data.metrics.pending}회 · ${data.metrics.models.join(', ')}`);
    } catch { setError('진행하지 못했습니다. 상태를 보존했습니다. 자동 재시도는 하지 않습니다.'); }
    finally { setBusy(false); }
  }
  async function word() {
    const bytes = await createWord(state);
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
    const a = document.createElement('a'); a.href = url; a.download = 'synthetic-dismissal-draft.docx'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <main style={{ maxWidth: 900, margin: '0 auto', padding: 24, background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }}>
    <style>{`button{padding:10px 16px;margin:6px;border:1px solid var(--color-border);border-radius:8px}button:disabled{opacity:.5}textarea,select{width:100%;padding:10px;border:1px solid var(--color-border)}@media print{header,nav,footer,.workspace-controls,.editorial-skip-link{display:none!important}html,body{background:white!important}main{max-width:none!important;padding:0!important}.workspace-document{white-space:pre-wrap;line-height:1.7}h2{break-after:avoid}section{break-inside:auto}@page{size:A4;margin:20mm}`}</style>
    <div className="workspace-controls">
      <h1>상담에서 서면까지 · 가상 사건 검증</h1>
      <p>구두 해고 통보를 받은 합성 근로자 A의 사건입니다. 실제 개인정보나 첨부파일을 입력하지 마세요.</p>
      <p>현재는 모의 응답으로 흐름을 시험합니다. 실제 모델의 정확도·비용을 검증한 결과가 아닙니다. Jev 공개 근거 선택도 계약 모의 응답입니다.</p>
      <p role="status">{metrics}</p>
      {error && <p role="alert">{error}</p>}
      <p>단계: {state.stage} · 문서 버전 {state.revision}</p>
      {state.stage !== 'consultation' && <><p>보고 인원: {state.reportedHeadcount}명 · 상시근로자 수 판단 미확정</p>
        <label htmlFor="headcount">정정할 보고 인원</label><input id="headcount" type="number" min="0" max="100000" value={headcount} onChange={e => setHeadcount(e.target.value)} />
        <button disabled={busy} onClick={() => act('correct-headcount')}>인원 정정 및 적용 요건 재검토</button>
        <button disabled={busy} onClick={() => act('correct-leave')}>휴무 승인 사실 정정</button>
        <ul>{(state.corrections || []).map((c,i) => <li key={i}>{c}</li>)}</ul></>}
      {state.stage === 'consultation' && <button disabled={busy} onClick={() => act('consult')}>가상 사건 상담 시작</button>}
      {state.consultation && <p>{state.consultation}</p>}
      {state.facts.length > 0 && <><h2>사실과 쟁점 확인</h2><ul>{state.facts.map(f => <li key={f}>{f}</li>)}</ul><h3>확인할 항목</h3><ul>{state.missing.map(f => <li key={f}>{f}</li>)}</ul><h3>쟁점</h3><ul>{state.issues.map(f => <li key={f}>{f}</li>)}</ul></>}
      {state.stage === 'facts' && <>
        {!state.factsConfirmed ? <button disabled={busy} onClick={() => act('confirm-facts')}>가정과 미확인 사실 확인</button> : <button disabled={busy} onClick={() => act('outline')}>서면 목차 만들기</button>}
      </>}
      {state.stage === 'outline' && <><h2>목차</h2><ol>{state.sections.map(s => <li key={s.id}>{s.title}</li>)}</ol>
        {!state.outlineConfirmed ? <button disabled={busy} onClick={() => act('confirm-outline')}>목차 승인</button> : <button disabled={busy} onClick={() => act('draft')}>서면 초안 작성</button>}
      </>}
      {state.stage === 'draft' && <>
        <label htmlFor="section">수정할 절</label><select id="section" value={selected} onChange={e => setSelected(e.target.value)}>{state.sections.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select>
        <label htmlFor="replacement">선택한 절의 새 내용</label><textarea id="replacement" rows={6} value={replacement} onChange={e => setReplacement(e.target.value)} maxLength={20000} />
        <button disabled={busy || !replacement.trim()} onClick={() => act('revise')}>선택한 절만 수정</button>
        {state.review?.status === 'generated' && <button disabled={busy} onClick={() => act('accept-review')}>미확인 사항을 검토하고 검토용 출력 승인</button>}
        <p>검토 상태: {state.review?.status} · 법률 정답 검증 통과를 뜻하지 않습니다.</p>
        <button disabled={busy || state.review?.status !== 'accepted'} onClick={word}>Word 다운로드</button><button disabled={busy || state.review?.status !== 'accepted'} onClick={() => { documentText(state); window.print(); }}>PDF 인쇄 / 저장</button>
      </>}
    </div>
    {state.review?.status !== 'accepted' && <style>{'@media print{.workspace-document{display:none!important}}'}</style>}
    {state.stage === 'draft' && <article className="workspace-document" aria-label="서면 초안"><pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', lineHeight: 1.7 }}>{previewDocumentText(state)}</pre></article>}
  </main>;
}
