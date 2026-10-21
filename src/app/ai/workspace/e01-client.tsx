'use client';
import {useState,useRef} from 'react';
import {initialE01,beginEditE01,editE01,correctE01,consultE01,outlineE01,approveOutlineE01,draftE01,approveOutputE01,exportE01,type E01Facts} from '@/lib/document-workspace/e01';
import {createWord} from '@/lib/document-workspace/word';
import {previewDocumentText} from '@/lib/document-workspace/workflow';
import {renderApprovedE01} from '@/lib/document-workspace/e01-export';
const labels:Record<keyof E01Facts,string>={employer:'회사',worker:'근로자',joined:'입사일',noticeReceived:'종이 통지 수령일',lastWorked:'마지막 근무일',effective:'해고 효력일',filed:'노동위 접수일',role:'계약·업무',notice:'현재 통지 주장',workerPosition:'근로자 주장·청구',deadline:'답변기한',ordinaryWage:'통상임금',leaveClaim:'08-18 현재 불참 주장 상태'};
const errorMessages:Record<string,string>={
  'leave-claim-conflict':'08-18 승인휴무와 현재 불참 주장이 충돌합니다. 현재 주장 상태와 문구를 확인하고 다시 저장하세요.',
  'leave-claim-confirmation-required':'08-18을 현재 불참 주장에 포함하는지 미확정입니다. 현재 불참 주장 상태를 명시적으로 확인하세요.',
  'invalid-leave-status':'08-18 현재 불참 주장 상태를 선택하세요.',
  'invalid-facts':'비어 있는 사실 입력을 확인하세요. 미상인 항목은 미상으로 표시하세요.',
};
export default function E01Client() {
  const [state,setState]=useState(initialE01);
  const [facts,setFacts]=useState<E01Facts>(state.facts);
  const [error,setError]=useState('');
  const current=useRef(state),exporting=useRef(false);
  const [busy,setBusy]=useState(false);
  const dirty=JSON.stringify(facts)!==JSON.stringify(state.facts);
  function act(fn:()=>typeof state,syncFacts=true){try{const next=fn();current.current=next;setState(next);if(syncFacts)setFacts(next.facts);setError('');}catch(error){const code=error instanceof Error?error.message:'';setError(errorMessages[code]||'현재 단계의 검토·승인이 필요합니다.');}}
  function editField(key:keyof E01Facts,value:string) {
    setFacts({...facts,[key]:value,
      ...(key==='notice'&&current.current.approvedLeave?{leaveClaim:'unclear'}:{})});
    if(current.current.phase!=='input'||(key==='notice'&&current.current.noticeOrigin==='fixture'))
      act(()=>beginEditE01(current.current,key==='notice'),false);
  }
  async function word(){
    if(exporting.current)return;
    exporting.current=true;setBusy(true);
    const snapshot=current.current;
    try{
      const bytes=await renderApprovedE01(snapshot,()=>current.current,createWord);
      const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}));
      const a=document.createElement('a');a.href=url;a.download='E01-'+snapshot.scenario+'-v'+snapshot.version+'.docx';a.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch{setError('출력 도중 사실 또는 승인이 변경됐습니다. 현재 버전을 다시 검토·승인하세요.');}
    finally{exporting.current=false;setBusy(false);}
  }
  return <main className="layout-reading p-6">
    <style>{'@media print{.e01-controls,header,nav,footer,.editorial-skip-link{display:none!important}.e01-document{white-space:pre-wrap} @page{size:A4;margin:20mm}}'+(!state.outputApproved?'@media print{.e01-document{display:none!important}}':'')}</style>
    <div className="e01-controls">
      <h1 className="t-h2">E01 회사 측 답변서 · 모의 검토</h1>
      <p>모델 호출 0회. 법령 원문·실모델·전문가 품질 검증은 미완료입니다. 실제 개인정보를 입력하지 마세요.</p>
      <p role="status">{state.scenario} · 버전 {state.version} · {state.phase}</p>
      {error&&<p>{error}</p>}
      <fieldset><legend>구조화 사실 입력</legend>{(Object.keys(labels) as (keyof E01Facts)[]).map(key=><label className="block my-2" key={key}>{labels[key]}{key==='leaveClaim'?<select aria-label={labels[key]} className="block w-full border p-2" value={facts.leaveClaim} onChange={e=>editField(key,e.target.value)}><option value="excluded">불참 주장에서 제외</option><option value="alleged">불참 주장에 포함</option><option value="unclear">미확정·확인 필요</option></select>:<input className="block w-full border p-2" value={facts[key]} onChange={e=>editField(key,e.target.value)} maxLength={4000}/>}</label>)}</fieldset>
      <button onClick={()=>act(()=>editE01(state,facts))}>사실 저장·이전 승인 무효화</button>
      {state.phase==='input'&&<button disabled={dirty} onClick={()=>act(()=>consultE01(state))}>입력 사실로 모의 상담</button>}
      {state.consultation&&<p>{state.consultation}</p>}
      {state.phase==='consultation'&&<button onClick={()=>act(()=>outlineE01(state))}>회사 답변서 목차 제시</button>}
      {state.phase==='outline'&&<><ol>{state.sections.map(s=><li key={s.id}>{s.title}: {s.text}</li>)}</ol><button onClick={()=>act(()=>approveOutlineE01(state))}>현재 목차 명시적 승인</button><button disabled={!state.outlineApproved} onClick={()=>act(()=>draftE01(state))}>조건부 초안 작성</button></>}
      <div><button onClick={()=>act(()=>correctE01(state,'M2'))}>M2 승인휴무 증거 반영</button><button onClick={()=>act(()=>correctE01(state,'M3a'))}>M3a 인원 판단 미확정</button><button disabled={state.scenario!=='M3a'} onClick={()=>act(()=>correctE01(state,'M3b'))}>M3b 독립 사업·정정표 반영</button></div>
      {state.phase==='draft'&&<><button onClick={()=>act(()=>approveOutputE01(state))}>검토용 문서 출력 명시적 승인</button><button disabled={busy||!state.outputApproved} onClick={word}>Word 다운로드</button><button disabled={!state.outputApproved} onClick={()=>{exportE01(current.current);window.print();}}>PDF 인쇄·저장</button></>}
      <details><summary>최초·정정 버전과 변경 설명 ({state.history.length})</summary>{state.history.map(h=><div key={h.version}><h2>v{h.version} {h.scenario}</h2><p>{h.explanation}</p><pre className="whitespace-pre-wrap">{h.sections.map(s=>s.text).join('\n\n')}</pre></div>)}</details>
    </div>
    {state.phase==='draft'&&<pre className="e01-document whitespace-pre-wrap" aria-label="E01 답변서 초안">{state.outputApproved?previewDocumentText(exportE01(state)):state.sections.map(s=>s.title+'\n'+s.text).join('\n\n')}</pre>}
  </main>;
}
