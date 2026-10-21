import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only',()=>({}));
import { mkdtempSync,rmSync } from 'node:fs';import { tmpdir } from 'node:os';import { join } from 'node:path';
import { initialWorkspace, transition, documentText, type Action, type Section } from '@/lib/document-workspace/workflow';
import { executeWorkspaceAction } from '@/lib/document-workspace/engine';import { BudgetStore } from '@/lib/document-workspace/budget';
const dirs:string[]=[];afterEach(()=>{for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true});});
type Poison=(rows:Section[])=>unknown;
const poisons:Record<string,Poison>={empty:r=>r.map(s=>s.id==='grounds'?{...s,text:''}:s),whitespace:r=>r.map(s=>s.id==='grounds'?{...s,text:' \n '}:s),missing:r=>r.slice(0,3),duplicate:r=>r.map((s,i)=>i===2?{...s,id:'facts'}:s),unknown:r=>r.map((s,i)=>i===2?{...s,id:'unknown'}:s),'missing-text':r=>r.map((s,i)=>i===2?{id:s.id,title:s.title}:s),'missing-title':r=>r.map((s,i)=>i===2?{id:s.id,text:s.text}:s),object:()=>({})};
function fixture(){const dir=mkdtempSync(join(tmpdir(),'invariant-test-'));dirs.push(dir);const store=new BudgetStore(dir,5000000);let state=initialWorkspace(),sequence=0,poisonTask='',poison:Poison|undefined;
 const policy={model:'fixture',inputCap:32000,outputCap:8192,timeoutMs:1000,pricing:{reviewed:true,inputMicroUsdPerToken:1,outputMicroUsdPerToken:1}};
 const action=async(a:Action,sectionId?:string,replacement?:string)=>{state=await executeWorkspaceAction({state,action:a,sectionId,replacement,requestId:'invariant-request-'+(++sequence),store,policies:{ordinary:policy,complex:policy,document:policy},evidenceSelector:async()=>['lsa-26'],generator:async request=>{
 const p=JSON.parse(request.prompt);const out={...p.syntheticTemplate,contextRevision:p.contextRevision,reviewOutcome:'needs-review'};
 if(p.task==='outline')out.sections=out.sections.map((s:Section)=>({...s,text:s.text.trim()?s.text:'Synthetic outline; missing evidence needs review.'}));
 if(p.task===poisonTask&&poison)out.sections=poison(out.sections);
 else if(p.task==='draft'&&p.contextRevision>0)out.sections=out.sections.map((s:Section)=>p.affectedSections.includes(s.id)?{...s,text:'Fresh review; applicability unresolved; missing facts must be checked.'}:s);
 return{text:JSON.stringify(out),usage:{inputTokens:100,outputTokens:200}};}});return state;};
 const prepare=async()=>{for(const a of ['consult','confirm-facts','outline','confirm-outline','draft','accept-review'] as const)await action(a);await action('revise','evidence','UNRELATED EVIDENCE MARKER');await action('accept-review');await action('correct-headcount',undefined,'4');await action('confirm-facts');};
 return{action,prepare,get state(){return state},poison(task:string,p:Poison){poisonTask=task;poison=p}};}
for(const [name,poison] of Object.entries(poisons))for(const task of ['outline','draft'])it(`${task} rejects ${name} response atomically without losing user evidence`,async()=>{
 const f=fixture();await f.prepare();if(task==='draft'){await f.action('outline');await f.action('confirm-outline');}const before=structuredClone(f.state);f.poison(task,poison);
 await expect(f.action(task as Action)).rejects.toThrow();expect(f.state).toEqual(before);expect(f.state.sections[3].text).toBe('UNRELATED EVIDENCE MARKER');expect(()=>documentText(f.state)).toThrow();
});
it('approval/output reject a forged generated draft with empty grounds',async()=>{const f=fixture();await f.prepare();await f.action('outline');await f.action('confirm-outline');await f.action('draft');const malformed=structuredClone(f.state);malformed.sections[2].text='';expect(()=>transition(malformed,'accept-review')).toThrow();malformed.review!.status='accepted';expect(()=>documentText(malformed)).toThrow();});
it('draft transition cannot seed over an unrelated evidence section when grounds is empty',async()=>{const f=fixture();await f.prepare();await f.action('outline');await f.action('confirm-outline');const before=structuredClone(f.state);before.sections[2].text='';expect(()=>transition(before,'draft')).toThrow();expect(before.sections[3].text).toBe('UNRELATED EVIDENCE MARKER');});
it('valid outline/draft regeneration preserves user evidence even if model tries rewriting it',async()=>{const f=fixture();await f.prepare();const notices=structuredClone(f.state.originalNotices);f.poison('outline',r=>r.map(s=>s.id==='evidence'?{...s,text:'UNREQUESTED MODEL REWRITE'}:s));await f.action('outline');expect(f.state.sections[3].text).toBe('UNRELATED EVIDENCE MARKER');await f.action('confirm-outline');await f.action('draft');await f.action('accept-review');expect(documentText(f.state)).toContain('UNRELATED EVIDENCE MARKER');expect(f.state.originalNotices).toEqual(notices);});
it('partial revision cannot bypass a malformed sibling section',async()=>{const f=fixture();await f.prepare();await f.action('outline');await f.action('confirm-outline');await f.action('draft');const malformed=structuredClone(f.state);malformed.sections[3].id='grounds';expect(()=>transition(malformed,'revise','grounds','replacement')).toThrow();});
it('outline approval rejects a missing or blank body before any draft seeding',async()=>{const f=fixture();await f.prepare();await f.action('outline');const malformed=structuredClone(f.state);malformed.sections[2].text='  ';expect(()=>transition(malformed,'confirm-outline')).toThrow();});
