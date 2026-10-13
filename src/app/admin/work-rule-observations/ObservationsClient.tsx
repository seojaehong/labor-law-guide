'use client';
import {useState} from 'react';
import Link from 'next/link';
type RecordRow={id:string;rule_id:string;created_at:string;standard_article_id:string;run_id:string;period_from:string;period_to:string;candidate_clause_ids:string[];selected_clause_ids:string[];verdict:string;reason:string;missing_count:number;stale_count:number;user_false_positive:boolean;review_state:string;matcher_version:string;rule_version:string};
const states=['unreviewed','confirmed_false_positive','expected','needs_more_evidence'];
export default function ObservationsClient(){
 const [rows,setRows]=useState<RecordRow[]>([]);const [status,setStatus]=useState('아직 조회하지 않았습니다.');const [busy,setBusy]=useState(false);
 async function request(method='GET',body?:unknown){
  const token=localStorage.getItem('admin_token');if(!token)throw new Error('먼저 관리자 화면에서 로그인하세요.');
  const r=await fetch('/api/admin/work-rule-observations',{method,headers:{'x-admin-token':token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,cache:'no-store'});
  const data=await r.json();if(!r.ok)throw new Error(r.status===503?'기록 기능이 준비되지 않았습니다. 수집 여부는 확인되지 않았습니다.':'기록을 조회하거나 수정하지 못했습니다.');return data;
 }
 async function load(){setBusy(true);try{const data=await request();setRows(data.records);setStatus(`저장 기록 ${data.records.length}건 조회됨 (최신 100건)`);}catch(e){setRows([]);setStatus((e as Error).message);}finally{setBusy(false);}}
 async function review(id:string,review_state:string){setBusy(true);try{const data=await request('PATCH',{id,review_state});setRows(old=>old.map(r=>r.id===id?data.record:r));setStatus('검토 상태 저장 확인됨');}catch(e){setStatus((e as Error).message);}finally{setBusy(false);}}
 return <main className="mx-auto max-w-6xl p-6"><h1>취업규칙 오탐 검토</h1><Link href="/admin">관리자 로그인</Link>{' · '}<Link href="/tools/work-rules">취업규칙 점검</Link><p>원문·사업장 제목 없이 관리자에게 제출된 판정 정보입니다. 오탐 의심 표시는 법률 검수 결과가 아닙니다.</p><button onClick={load} disabled={busy}>저장 기록 조회</button><p role="status">{status}</p><div className="overflow-x-auto"><table><thead><tr><th>규칙</th><th>표준 연결 후보</th><th>최종 판정 조항</th><th>판정·사유</th><th>오탐 의심</th><th>버전</th><th>검토</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.rule_id}<br/>{r.standard_article_id}<br/>{r.created_at}<br/>{r.period_from} ~ {r.period_to}<br/>{r.run_id}</td><td>{r.candidate_clause_ids.join(', ')||'없음'}</td><td>{r.selected_clause_ids.join(', ')||'없음'}</td><td>{r.verdict} · {r.reason}<br/>누락 {r.missing_count} · 옛 문구 {r.stale_count}</td><td>{r.user_false_positive?'표시됨':'미표시'}</td><td title={`${r.matcher_version} / ${r.rule_version}`}>{r.matcher_version.slice(0,12)} / {r.rule_version.slice(0,12)}</td><td><select aria-label={`${r.rule_id} 검토 상태`} disabled={busy} value={r.review_state} onChange={e=>review(r.id,e.target.value)}>{states.map(s=><option key={s}>{s}</option>)}</select></td></tr>)}</tbody></table></div></main>;
}
