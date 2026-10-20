import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import index from '../../public/data/laws/index.json';
import rules from '../../public/data/laws/rules.json';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const {from,upsert,select,eq,single,order,limit,update}=vi.hoisted(()=>({from:vi.fn(),upsert:vi.fn(),select:vi.fn(),eq:vi.fn(),single:vi.fn(),order:vi.fn(),limit:vi.fn(),update:vi.fn()}));
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({from})}));
import {POST,GET,PATCH} from '@/app/api/admin/work-rule-observations/route';
import {knownRuleIds,validObservation} from '@/lib/laws/observation-contract';
import {observationId,captureIdentity,sameObservation,safeClauseId,safeClauseIds} from '@/lib/laws/observation-payload';
import standard from '../../public/data/laws/standard.json';
import {MATCHER_VERSION,RULE_VERSION} from '@/lib/laws/observation-version';
let identity='';
const payload=()=>({id:identity,run_id:'22222222-2222-4222-8222-222222222222',period_from:'20250101',period_to:'20261013',standard_article_id:standard.articles[0].id,rule_id:[...knownRuleIds][0],candidate_clause_ids:['제1조','제2조'],selected_clause_ids:['제2조'],verdict:'반영됨',reason:'period_check_output' as const,missing_count:0,stale_count:0,user_false_positive:true,matcher_version:MATCHER_VERSION,rule_version:RULE_VERSION});
const req=(method='POST',body:unknown=payload(),token='admin')=>new Request('http://localhost/api/admin/work-rule-observations',{method,headers:{'x-admin-token':token},body:method==='GET'?undefined:JSON.stringify(body)});
beforeEach(async()=>{identity=await observationId(payload(),payload().standard_article_id,payload().rule_id);vi.clearAllMocks();vi.stubEnv('ADMIN_TOKEN','admin');vi.stubEnv('WORK_RULE_OBSERVATIONS_ENABLED','1');vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://mewqgevgdgghhatqtuos.supabase.co');vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','test-only');const query={upsert,select,eq,single,order,limit,update};from.mockReturnValue(query);select.mockReturnValue(query);eq.mockReturnValue(query);order.mockReturnValue(query);update.mockReturnValue(query);upsert.mockResolvedValue({error:null});single.mockResolvedValue({data:{...payload(),review_state:'unreviewed'},error:null});limit.mockResolvedValue({data:[],error:null});});
afterEach(()=>vi.unstubAllEnvs());
describe('admin-only metadata observations',()=>{
 it('pins the exact public input data and matcher source versions',()=>{expect(createHash('sha256').update(JSON.stringify([standard,index,rules])).digest('hex')).toBe(RULE_VERSION);expect(createHash('sha256').update(readFileSync('src/lib/laws/standard-check.ts')).update(readFileSync('src/lib/laws/rules-check.ts')).digest('hex')).toBe(MATCHER_VERSION);});
 it('has unique stable IDs for all catalog rules',()=>expect(knownRuleIds.size).toBe(44));
 it('denies all unauthenticated methods before DB access',async()=>{for(const [fn,method] of [[GET,'GET'],[POST,'POST'],[PATCH,'PATCH']] as const)expect((await fn(req(method,payload(),'wrong'))).status).toBe(401);expect(from).not.toHaveBeenCalled();});
 it('fails closed with missing admin config even in development',async()=>{vi.stubEnv('ADMIN_TOKEN','');vi.stubEnv('NODE_ENV','development');expect((await GET(req('GET'))).status).toBe(503);expect(from).not.toHaveBeenCalled();});
 it('refuses an unrelated Supabase project before any database operation',async()=>{vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://another-project.supabase.co');expect((await POST(req())).status).toBe(503);expect(from).not.toHaveBeenCalled();});
 it('reports disabled state without DB access',async()=>{vi.stubEnv('WORK_RULE_OBSERVATIONS_ENABLED','');expect((await POST(req())).status).toBe(503);expect(from).not.toHaveBeenCalled();});
 it('rejects raw text, titles, unknown rules, versions and invalid clause ids',async()=>{for(const body of [{...payload(),text:'sensitive'},{...payload(),title:'sensitive'},{...payload(),rule_id:'unknown'},{...payload(),candidate_clause_ids:['employer title']},{...payload(),matcher_version:'old'}]){expect(validObservation(body)).toBe(false);expect((await POST(req('POST',body))).status).toBe(400);}expect(from).not.toHaveBeenCalled();});
 it('distinguishes each new run, period and version; retries keep the same deterministic key',async()=>{
  const p=payload();const again=await observationId(p,p.standard_article_id,p.rule_id);expect(again).toBe(p.id);
  for(const changed of [{...p,run_id:'33333333-3333-4333-8333-333333333333'},{...p,period_from:'20250102'},{...p,period_to:'20261014'},{...p,rule_version:'new-version'},{...p,matcher_version:'new-matcher'}]){
   expect(captureIdentity(changed)).not.toBe(captureIdentity(p));expect(await observationId(changed,p.standard_article_id,p.rule_id)).not.toBe(p.id);
  }
 });
 it('keeps standard candidates separate from final location and strips titles',()=>{expect(safeClauseId('제2조(비공개 제목)')).toBe('제2조');expect(safeClauseId('사업장 원문')).toBeNull();expect(payload().candidate_clause_ids).toEqual(['제1조','제2조']);expect(payload().selected_clause_ids).toEqual(['제2조']);});
 it('preserves all verdict locations without titles or title-internal references',()=>{expect(safeClauseIds('제2조(내부 제목, 제99조 참고), 제3조(다른 제목)')).toEqual(['제2조','제3조']);expect(safeClauseIds(null)).toEqual([]);expect(safeClauseIds('제3조(제목), 제3조(제목)')).toEqual(['제3조']);});
 it('rejects mismatched immutable readback even for the same UUID',async()=>{single.mockResolvedValue({data:{...payload(),user_false_positive:false},error:null});const r=await POST(req());expect(r.status).toBe(409);expect(await r.json()).toMatchObject({error:'idempotency_conflict'});expect(sameObservation(payload(),{...payload(),run_id:'other'})).toBe(false);});
 it('does not accept client-chosen keys belonging to another execution',async()=>{expect((await POST(req('POST',{...payload(),id:'11111111-1111-4111-8111-111111111111'}))).status).toBe(400);expect(from).not.toHaveBeenCalled();});
 it('rejects malformed dates and candidate/title leakage',async()=>{for(const body of [{...payload(),period_from:'20250230'},{...payload(),period_to:payload().period_from},{...payload(),selected_clause_ids:['제1조(사업장 제목)']},{...payload(),candidate_clause_ids:['제1조','제1조']}])expect((await POST(req('POST',body))).status).toBe(400);expect(from).not.toHaveBeenCalled();});
 it('uses insert-ignore idempotency and readback',async()=>{expect((await POST(req())).status).toBe(201);expect(upsert.mock.calls[0][1]).toEqual({onConflict:'id',ignoreDuplicates:true});expect(single).toHaveBeenCalled();expect(Object.keys(upsert.mock.calls[0][0]).sort()).toEqual([...Object.keys(payload()),'review_state'].sort());});
 it('does not claim success if readback or write fails',async()=>{single.mockResolvedValue({data:null,error:{message:'private details'}});const r=await POST(req());expect(r.status).toBe(503);expect(JSON.stringify(await r.json())).not.toContain('private details');});
 it('only changes review state and rejects other fields',async()=>{expect((await PATCH(req('PATCH',{id:payload().id,review_state:'expected',text:'secret'}))).status).toBe(400);expect((await PATCH(req('PATCH',{id:payload().id,review_state:'expected'}))).status).toBe(200);expect(update).toHaveBeenCalledWith({review_state:'expected'});});
 it('readiness validates columns without reading observation rows',async()=>{const r=await GET(new Request('http://localhost/api/admin/work-rule-observations?readiness=1',{headers:{'x-admin-token':'admin'}}));expect(r.status).toBe(200);expect(limit).toHaveBeenCalledWith(0);expect(await r.json()).toEqual({active:true});expect(order).not.toHaveBeenCalled();});
 it('bounds reads and disables caching',async()=>{const r=await GET(req('GET'));expect(r.status).toBe(200);expect(limit).toHaveBeenCalledWith(100);expect(r.headers.get('Cache-Control')).toBe('no-store');});
});
