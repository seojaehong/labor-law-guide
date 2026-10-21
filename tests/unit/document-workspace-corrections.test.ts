import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only',()=>({}));
import { mkdtempSync,rmSync } from 'node:fs';import { tmpdir } from 'node:os';import { join } from 'node:path';
import { initialWorkspace, transition, documentText, type Action } from '@/lib/document-workspace/workflow';
import { executeWorkspaceAction } from '@/lib/document-workspace/engine';import { BudgetStore } from '@/lib/document-workspace/budget';
import { POST } from '@/app/api/document-workspace/route';import { selectPublicLawEvidence } from '@/lib/document-workspace/jev-selector';
const dirs:string[]=[];
afterEach(()=>{for(const d of dirs.splice(0))rmSync(d,{recursive:true,force:true});vi.unstubAllEnvs();vi.unstubAllGlobals();delete (process as unknown as Record<symbol,unknown>)[Symbol.for('document-workspace.offline-transport')];});
function setup(){const dir=mkdtempSync(join(tmpdir(),'review-regression-'));dirs.push(dir);const store=new BudgetStore(dir,1000000);let state=initialWorkspace(),count=0;const prompts:Record<string,unknown>[]=[];
 const generator=vi.fn(async(request:{prompt:string})=>{const p=JSON.parse(request.prompt);prompts.push(p);const out={...p.syntheticTemplate,contextRevision:p.contextRevision,reviewOutcome:'needs-review'};
 if(p.task==='outline')out.sections=out.sections.map((s:{text:string})=>({...s,text:s.text.trim()?s.text:'Synthetic outline; missing evidence needs review.'}));
 if(p.task==='draft'&&p.contextRevision>0)out.sections=out.sections.map((s:{id:string;text:string})=>p.affectedSections.includes(s.id)?{...s,text:`reported=${p.reportedHeadcount};leave=${p.approvedLeave};applicability-undetermined;needs-review`}:s);
 return{text:JSON.stringify(out),usage:{inputTokens:100,outputTokens:200}};});
 const policy={model:'fixture',inputCap:32000,outputCap:8192,timeoutMs:1000,pricing:{reviewed:true,inputMicroUsdPerToken:1,outputMicroUsdPerToken:1}};
 const action=async(a:Action,replacement?:string)=>{state=await executeWorkspaceAction({state,action:a,replacement,sectionId:'grounds',requestId:'review-request-'+(++count),store,policies:{ordinary:policy,complex:policy,document:policy},generator,evidenceSelector:async()=>['lsa-26']});return state;};
 return{action,get state(){return state},prompts,generator};}
it('8 -> 4 invalidates old conclusion and raw reapproval cannot export MARKER',async()=>{
 const f=setup();for(const a of ['consult','confirm-facts','outline','confirm-outline','draft','accept-review'] as const)await f.action(a);
 await f.action('revise','8-worker legal conclusion MARKER');await f.action('accept-review');const before=structuredClone(f.state);
 await f.action('correct-headcount','4');expect(()=>documentText(f.state)).toThrow('review-required');expect(f.state.sections[2].text).not.toContain('MARKER');expect(f.state.archivedSections?.some(s=>s.text.includes('MARKER'))).toBe(true);
 expect(f.state.missing).toContain('산정 기간의 일별 사용 인원과 가동일수');
 let bypass=f.state;for(const a of ['confirm-facts','outline','confirm-outline','draft'] as const)bypass=transition(bypass,a);expect(()=>transition(bypass,'accept-review')).toThrow('review-required');
 const previousCalls=f.generator.mock.calls.length;for(const a of ['confirm-facts','outline','confirm-outline','draft'] as const)await f.action(a);
 expect(f.generator.mock.calls.length).toBeGreaterThan(previousCalls);expect(()=>documentText(f.state)).toThrow('review-required');await f.action('accept-review');expect(documentText(f.state)).not.toContain('MARKER');
 expect(f.state.sections[3]).toEqual(before.sections[3]);expect(f.state.originalNotices).toEqual(before.originalNotices);expect(f.state.evidence).toEqual(before.evidence);
 const prompt=f.prompts.at(-1)!;expect(prompt.reportedHeadcount).toBe(4);expect(prompt.corrections).toEqual(f.state.corrections);expect(prompt.selectedEvidence).toEqual(expect.arrayContaining([expect.objectContaining({id:'lsa-26',publicRow:expect.any(Object),currencyVerified:false})]));expect(prompt.facts).toEqual(f.state.facts);expect(prompt.issues).toEqual(f.state.issues);
});
it('leave correction blocks output and fresh generation receives correction distinct from notice',async()=>{
 const f=setup();for(const a of ['consult','confirm-facts','outline','confirm-outline','draft','accept-review'] as const)await f.action(a);const before=structuredClone(f.state);
 await f.action('correct-leave','true');expect(f.state.stage).toBe('facts');expect(()=>documentText(f.state)).toThrow();expect(f.state.originalNotices).toEqual(before.originalNotices);expect(f.state.sections[3]).toEqual(before.sections[3]);
 for(const a of ['confirm-facts','outline','confirm-outline','draft'] as const)await f.action(a);expect(f.prompts.at(-1)?.approvedLeave).toBe(true);expect(f.prompts.at(-1)?.originalNotices).toEqual(before.originalNotices);expect(()=>documentText(f.state)).toThrow();await f.action('accept-review');expect(documentText(f.state)).toContain('leave=true');
});
it('environment flags alone cannot start generating SDK or Jev fetch',async()=>{
 vi.stubEnv('AI_WORKSPACE_DEMO','true');vi.stubEnv('AI_WORKSPACE_MOCK_TRANSPORT','true');vi.stubEnv('TYPESAFE_JEV_PUBLIC_LAWS_ON','true');const send=vi.fn(()=>{throw Error('network must not start')});vi.stubGlobal('fetch',send);
 const response=await POST(new Request('http://localhost/api/document-workspace',{method:'POST',headers:{origin:'http://localhost'},body:JSON.stringify({state:initialWorkspace(),action:'consult',requestId:'flags-only-test'})}));expect(response.status).toBe(409);expect(await response.json()).toEqual({code:'mock-transport-not-installed'});
 const d=mkdtempSync(join(tmpdir(),'no-paid-jev-'));dirs.push(d);await expect(selectPublicLawEvidence({enabled:true,requestId:'jev-flags-only',publicTopic:'dismissal',laws:[],store:new BudgetStore(d,1000000),pricing:{reviewed:true,inputMicroUsdPerToken:1,outputMicroUsdPerToken:1}})).rejects.toThrow('mock-transport-not-installed');expect(send).not.toHaveBeenCalled();
});
