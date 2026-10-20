vi.mock('server-only',()=>({}));
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const { insert, createClient, jobs } = vi.hoisted(() => ({insert:vi.fn(), createClient:vi.fn(), jobs:[] as Array<() => Promise<void>>}));
vi.mock('next/server',()=>({after:(job:()=>Promise<void>)=>jobs.push(job)}));
vi.mock('@supabase/supabase-js',()=>({createClient}));
import { completionRow, persistCompletion, startServiceObservation, type Completion } from '@/lib/observations/service-completion';
const id='22222222-2222-4222-8222-222222222222';
const completion: Completion={stage:'completed',outcome:'success',error_code:'none',duration_ms:123,result_count:2};
beforeEach(()=>{jobs.length=0;createClient.mockReset();insert.mockReset();createClient.mockReturnValue({from:()=>({insert})});insert.mockResolvedValue({error:null});vi.stubEnv('SERVICE_OBSERVATIONS_ENABLED','1');vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://mewqgevgdgghhatqtuos.supabase.co');vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','synthetic-key');});
afterEach(()=>vi.unstubAllEnvs());
describe('strict metadata collector',()=>{
 it('projects only fixed safe fields and leaves unknown usage/cost null',()=>{
  vi.stubEnv('VERCEL_GIT_COMMIT_SHA','not-a-version-private-marker');const row=completionRow('case_search',id,completion)!;
  expect(row).toEqual({id,route:'/api/search',event_type:'service_completion_v1',method:'GET',status:'success',reason:'none',latency_ms:123,result_count:2,metadata:{schema_version:1,service:'case_search',operation:'search',stage:'completed',service_version:null,token_usage:null,estimated_cost:null}});
 });
 it.each(['query','question','filename','salary','session_id','ip','metadata','error_message'])('rejects extra %s',field=>{expect(completionRow('consultation',id,{...completion,[field]:'PRIVATE_MARKER'} as Completion)).toBeNull();});
 it.each([{...completion,result_count:NaN},{...completion,duration_ms:-1},{...completion,result_count:100001},{...completion,stage:'PRIVATE_MARKER'},{...completion,error_code:'sensitive message'}])('rejects invalid values',value=>expect(completionRow('contract_extract',id,value as Completion)).toBeNull());
 it('keeps unknown failure result/usage/cost null',()=>{const row=completionRow('consultation',id,{...completion,outcome:'failure',result_count:null})!;expect(row.result_count).toBeNull();expect(row.metadata.token_usage).toBeNull();expect(row.metadata.estimated_cost).toBeNull();});
 it('disabled and wrong project never create SDK or write',async()=>{vi.stubEnv('SERVICE_OBSERVATIONS_ENABLED','');expect(await persistCompletion('case_search',id,completion)).toBe(false);vi.stubEnv('SERVICE_OBSERVATIONS_ENABLED','1');vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://other.supabase.co');expect(await persistCompletion('case_search',id,completion)).toBe(false);expect(createClient).not.toHaveBeenCalled();});
 it('persists only the constructed row',async()=>{expect(await persistCompletion('case_search',id,completion)).toBe(true);expect(insert).toHaveBeenCalledWith(completionRow('case_search',id,completion));});
 it('does not throw or serialize database error messages',async()=>{insert.mockResolvedValue({error:{message:'PRIVATE_ERROR'}});expect(await persistCompletion('case_search',id,completion)).toBe(false);insert.mockRejectedValue(new Error('PRIVATE_ERROR'));expect(await persistCompletion('case_search',id,completion)).toBe(false);});
 it('registers one terminal observation and runs it after response',async()=>{const o=startServiceObservation('consultation');expect(jobs).toHaveLength(1);o.finish({stage:'stream',outcome:'failure',error_code:'cancelled',result_count:null});o.finish({stage:'completed',outcome:'success',error_code:'none',result_count:1});expect(insert).not.toHaveBeenCalled();expect(jobs).toHaveLength(1);await jobs[0]();expect(insert.mock.calls[0][0].status).toBe('failure');});
});

it('OFF never registers a lifecycle callback',()=>{vi.stubEnv('SERVICE_OBSERVATIONS_ENABLED','');startServiceObservation('consultation').finish({stage:'completed',outcome:'success',error_code:'none',result_count:1});expect(jobs).toHaveLength(0);expect(createClient).not.toHaveBeenCalled();});
