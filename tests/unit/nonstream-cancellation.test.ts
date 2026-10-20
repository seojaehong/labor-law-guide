import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const { insert, search, jobs, provider } = vi.hoisted(()=>({insert:vi.fn(),search:vi.fn(),jobs:[] as Array<()=>Promise<void>>,provider:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('next/server',async original=>({...await original<typeof import('next/server')>(),after:(job:()=>Promise<void>)=>jobs.push(job)}));
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({from:()=>({insert}),rpc:async()=>({data:{allowed:true,count:1},error:null})})}));
vi.mock('@/lib/search/search-modes',()=>({runSearch:search}));
vi.mock('@/lib/turnstile',()=>({isTurnstileEnabled:()=>false,verifyTurnstile:vi.fn()}));
vi.mock('@/lib/contract-check/extract-output',()=>({extractJsonPayload:(s:string)=>s,sanitizeExtracted:()=>({contract:{synthetic:true},notes:[]})}));
import {GET} from '@/app/api/search/route';
import {POST} from '@/app/api/tools/contract-check/extract/route';
import {startServiceObservation} from '@/lib/observations/service-completion';
beforeEach(()=>{jobs.length=0;insert.mockReset();search.mockReset();provider.mockReset();insert.mockResolvedValue({error:null});vi.stubEnv('SERVICE_OBSERVATIONS_ENABLED','1');vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://mewqgevgdgghhatqtuos.supabase.co');vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','synthetic-key');vi.stubEnv('ANTHROPIC_API_KEY','synthetic-key');vi.stubGlobal('fetch',provider);vi.spyOn(console,'log').mockImplementation(()=>{});});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});
it('search request abort is persisted once even when search later succeeds',async()=>{
 const abort=new AbortController();let resolve!:(value:unknown)=>void;
 search.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 const pending=GET(new NextRequest('http://localhost/api/search?q=PRIVATE_QUERY',{signal:abort.signal}));
 abort.abort();await jobs[0]();
 expect(insert.mock.calls[0][0]).toMatchObject({status:'failure',reason:'cancelled',result_count:null,metadata:{service:'case_search',stage:'retrieval'}});
 resolve({baseline:{items:[{title:'PRIVATE_RESULT'}]}});expect((await pending).status).toBe(200);
 expect(insert).toHaveBeenCalledTimes(1);expect(JSON.stringify(insert.mock.calls)).not.toContain('PRIVATE');
});
it('contract request abort is persisted once before a mocked provider later completes',async()=>{
 const abort=new AbortController();let resolve!:(value:unknown)=>void;
 provider.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 const form=new FormData();form.append('images',new File([new Uint8Array(10)],'PRIVATE_FILENAME.jpg',{type:'image/jpeg'}));
 const pending=POST(new Request('http://localhost/api/tools/contract-check/extract',{method:'POST',signal:abort.signal,body:form}));
 await vi.waitFor(()=>expect(provider).toHaveBeenCalledTimes(1),{interval:1});
 abort.abort();await jobs[0]();
 expect(insert.mock.calls[0][0]).toMatchObject({status:'failure',reason:'cancelled',result_count:null,metadata:{service:'contract_extract',stage:'generation'}});
 resolve(Response.json({content:[{type:'text',text:'{}'}]}));expect((await pending).status).toBe(200);
 expect(insert).toHaveBeenCalledTimes(1);expect(JSON.stringify(insert.mock.calls)).not.toContain('PRIVATE');
});
it('already-aborted request cannot later become success',async()=>{
 const abort=new AbortController();abort.abort();
 const observation=startServiceObservation('contract_extract',abort.signal,()=> 'validation');
 observation.finish({stage:'completed',outcome:'success',error_code:'none',result_count:1});await jobs[0]();
 expect(insert.mock.calls[0][0]).toMatchObject({status:'failure',reason:'cancelled'});expect(insert).toHaveBeenCalledTimes(1);
});
it('finished nonstream operation removes abort listener and retains server completion',async()=>{
 const abort=new AbortController();const remove=vi.spyOn(abort.signal,'removeEventListener');
 const observation=startServiceObservation('case_search',abort.signal,()=> 'retrieval');
 observation.finish({stage:'completed',outcome:'success',error_code:'none',result_count:0});abort.abort();await jobs[0]();
 expect(remove).toHaveBeenCalledWith('abort',expect.any(Function));expect(insert).toHaveBeenCalledTimes(1);expect(insert.mock.calls[0][0].status).toBe('success');
});
