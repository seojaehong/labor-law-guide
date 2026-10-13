import type { Workspace, Section } from './workflow';
export type E01Facts = {
  employer: string; worker: string; joined: string; noticeReceived: string;
  lastWorked: string; effective: string; filed: string; role: string;
  notice: string; workerPosition: string; deadline: string; ordinaryWage: string;
  leaveClaim: string; // excluded | alleged | unclear; not inferred from free text
};
export type E01 = {
  version: number; phase: 'input'|'consultation'|'outline'|'draft';
  scenario: 'M1'|'M2'|'M3a'|'M3b'; facts: E01Facts;
  originalNotice: string; approvedLeave: boolean; headcount: 'assumed8'|'unknown'|'daily4';
  evidence: { id: string; body: string }[];
  consultation: string; sections: Section[];
  outlineApproved: boolean; outputApproved: boolean;
  history: { version: number; scenario: string; facts: E01Facts; sections: Section[];
    originalNotice: string; explanation: string }[];
};
export function initialE01(): E01 {
  const notice = '08-18/08-25 배정 근무 불참·사전 연락 미이행. 08-27 면담.';
  return { version: 1, phase: 'input', scenario: 'M1', originalNotice: notice,
    approvedLeave: false, headcount: 'assumed8', evidence: [{id:'notice-original',body:notice}],
    facts: { employer:'회사 A', worker:'근로자 B', joined:'2025-03-01', noticeReceived:'2026-09-01',
      lastWorked:'2026-09-14', effective:'2026-09-15', filed:'2026-09-21',
      role:'고객문의 응대·무기계약·수습 아님', notice,
      workerPosition:'일정 전달 착오·사전 경고 없음·해고 과중. 복직·임금상당액 청구.',
      deadline:'미상', ordinaryWage:'미상', leaveClaim:'alleged' }, consultation:'',sections:[],
    outlineApproved:false,outputApproved:false,history:[] };
}
function archive(s: E01, explanation: string): E01 {
  const next=structuredClone(s);
  next.history.push({version:s.version,scenario:s.scenario,facts:structuredClone(s.facts),
    sections:structuredClone(s.sections),originalNotice:s.originalNotice,explanation});
  next.version++;next.outlineApproved=false;next.outputApproved=false;
  next.phase='input';next.sections=[];next.consultation='';
  return next;
}
export function editE01(s: E01, facts: E01Facts): E01 {
  if(Object.values(facts).some(v=>typeof v!=='string'||!v.trim()||v.length>4000))throw Error('invalid-facts');
  if(!['excluded','alleged','unclear'].includes(facts.leaveClaim))throw Error('invalid-leave-status');
  const next=archive(s,'구조화 사실 정정: 관련 초안·목차 승인·출력 승인 무효화');
  next.facts=structuredClone(facts);
  // The first notice source remains immutable, even if the current account changes.
  return next;
}
export function beginEditE01(s:E01):E01 {
  return archive(s,'입력 편집 시작: 저장 전이라도 이전 초안·출력 승인 무효화');
}
export function correctE01(s: E01, kind: 'M2'|'M3a'|'M3b'): E01 {
  const next=archive(s,kind+' 정정: 영향 문단 및 적용범위 재검토 필요');
  next.scenario=kind;
  if(kind==='M2') {
    next.approvedLeave=true;
    next.facts.leaveClaim='excluded';
    // Only the known synthetic initial allegation is transformed automatically.
    // Free text is preserved; allegation status is a separate explicit input.
    if(next.facts.notice===initialE01().facts.notice)
      next.facts.notice='08-25 배정 근무 불참·사전 연락 미이행. 08-27 면담.';
    next.evidence.push({id:'leave-0818',body:'합성 증거: 2026-08-18 승인휴무 확인'});
  } else if(kind==='M3a') {
    next.headcount='unknown';
    next.evidence.push({id:'count-correction',body:'8인 표가 다른 회사 자료와 병합됐다는 정정 발화. 확정표 없음.'});
  } else {
    if(s.scenario!=='M3a')throw Error('M3a-required');
    next.headcount='daily4';
    next.evidence.push({id:'independent-business',body:'합성 독립 사업 자료 제출'});
    next.evidence.push({id:'daily-count',body:'합성 정정표: 31일, 일별 4인, 124연인원. 124/31=4. 법적 산정 결론은 별도 검토.'});
  }
  return next;
}
export function consultE01(s: E01): E01 {
  if(s.phase!=='input')throw Error('input-required');
  const next=structuredClone(s);next.phase='consultation';
  next.consultation = '모의 상담 · 회사 측 답변서 준비. '+s.facts.employer+' / '+s.facts.worker+
    '. 통지 원문과 현재 주장·반론을 구별합니다. 현재 회사 주장: '+s.facts.notice+'. '+(s.approvedLeave?
    '08-18 승인휴무 확인. 현재 불참 주장 상태: '+s.facts.leaveClaim+
    '. 제외 여부를 구조화 입력으로 확인하고 통지 원문은 보존합니다. ':
    '08-18/08-25 배정과 연락 자료를 확인해야 합니다. ')+
    (s.headcount==='assumed8'?'8인 가정 아래 조건부 본안 검토. ':
    s.headcount==='unknown'?'인원 판단 미확정: 적용범위 검토·자료 보완. ':
    '독립 사업·일별 4인 정정표에 따른 적용범위 중심 검토. ')+
    '법령 시행시점·원문 검증과 전문가 검토는 미완료입니다. 답변기한/통상임금: '+s.facts.deadline+'/'+s.facts.ordinaryWage;
  return next;
}
export function outlineE01(s:E01):E01 {
  if(s.phase!=='consultation')throw Error('consultation-required');
  const next=structuredClone(s);next.phase='outline';
  const scope=s.headcount!=='assumed8';
  next.sections=[
    {id:'request',title:'1. 신청취지와 회사 답변',text:'신청취지 / 조건부 회사 답변'},
    {id:'facts',title:'2. 경위와 적용범위',text:scope?'적용범위 중심 검토 / 경위 / 인원 자료':'경위 / 적용범위(8인 가정)'},
    {id:'grounds',title:'3. 회사주장·반론·통지 검토',text:'회사주장 / 반론·한계 / 서면통지 / 해고예고'},
    {id:'evidence',title:'4. 결론과 보완',text:'결론·보완 / 원문·정정 증거 / 미확인 사항'},
  ];return next;
}
export function approveOutlineE01(s:E01):E01 {
  if(s.phase!=='outline')throw Error('outline-required');
  return {...structuredClone(s),outlineApproved:true};
}
export function draftE01(s:E01):E01 {
  if(s.phase!=='outline'||!s.outlineApproved)throw Error('outline-approval-required');
  if(s.approvedLeave&&s.facts.leaveClaim==='alleged')throw Error('leave-claim-conflict');
  if(s.approvedLeave&&s.facts.leaveClaim==='unclear')throw Error('leave-claim-confirmation-required');
  const next=structuredClone(s),f=s.facts;next.phase='draft';
  const scope=s.headcount!=='assumed8';
  const bodies=[
    '회사 측 부당해고 답변서 · '+s.scenario+' · 모의 검토용\n신청취지(근로자 주장·청구 원문): '+f.workerPosition+'\n'+
      (scope?'현재는 적용범위 검토 메모입니다. 기존 본안 답변을 최종 결론으로 재사용하지 않습니다.':
      '회사 답변: 8인 적용 가정 아래 사유·양정·절차 및 반론을 조건부로 검토합니다. 청구 기각 여부는 확정하지 않습니다.'),
    '경위: '+f.employer+' / '+f.worker+'; '+f.joined+' 입사; '+f.role+
      '. '+f.noticeReceived+' 종이 통지 수령; '+f.lastWorked+' 마지막 근무; '+f.effective+' 효력; '+f.filed+' 접수.\n'+
      '적용범위: '+(s.headcount==='assumed8'?'8인은 가정이며 산정 근거 확인 필요.':
      s.headcount==='unknown'?'타 회사 자료 병합 정정으로 상시인원 미확정. 4인으로 단정하지 않음.':
      '독립 사업 자료 및 31일·124연인원 정정표 제출. 일별 4인 산술을 확인하되 시행령 산정·별표 적용은 전문가 검토 필요.'),
    '회사주장(현재): '+f.notice+(s.approvedLeave?'\n08-18 승인휴무는 불참 주장에서 제외.':'')+
      '\n반론·한계: '+f.workerPosition+' 배정 전달·경고·면담·비례성 자료 확인.\n'+
      '서면통지: 종이 수령 사실과 이유·시기 기재의 충족 여부는 구분.\n해고예고: '+f.noticeReceived+
      ' 수령과 '+f.effective+' 효력 사이 기간 및 예고수당 검토 필요. 통상임금 '+f.ordinaryWage+'; 예외 해당 여부 미확정.',
    '결론·보완: 답변기한 '+f.deadline+'. 법률 결론 미확정.\n원문 통지(과거 기록 보존): '+s.originalNotice+
      '\n증거: '+s.evidence.map(e=>e.id+': '+e.body).join('\n')+
      '\n검증 대상: 2026-08-20 시행 근로기준법 제11·23·26·27·28조 및 시행령 제7조의2·별표1. 공식 원문 확인 미완료.\n'+
      '출처를 없는 ID나 가짜 인용으로 채우지 않습니다. 모의 흐름 통과는 실모델·전문가 법률 품질 통과가 아닙니다.',
  ];
  next.sections=next.sections.map((section,i)=>({...section,text:bodies[i]}));return next;
}
export function approveOutputE01(s:E01):E01 {
  if(s.phase!=='draft'||!s.outlineApproved||s.sections.some(x=>!x.text.trim()))throw Error('review-required');
  return {...structuredClone(s),outputApproved:true};
}
export function exportE01(s:E01):Workspace {
  if(s.phase!=='draft'||!s.outputApproved||!s.outlineApproved)throw Error('review-required');
  return {version:1,revision:s.version,caseId:'synthetic-dismissal-v1',stage:'draft',
    consultation:s.consultation,facts:Object.values(s.facts),missing:['법령 공식 원문·시행시점 검증 미완료','실모델/전문가 품질 미검증'],
    issues:[],evidence:[],factsConfirmed:true,outlineConfirmed:true,sections:structuredClone(s.sections),
    originalNotices:[s.originalNotice],corrections:s.history.map(h=>h.explanation),
    review:{status:'accepted',factRevision:s.version,generatedFactRevision:s.version,affected:['request','facts','grounds','evidence']}};
}
