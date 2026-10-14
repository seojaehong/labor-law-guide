import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const {finish,round,kill,laws,faq}=vi.hoisted(()=>({finish:vi.fn(),round:vi.fn(),kill:vi.fn(),laws:vi.fn(),faq:vi.fn()}));
vi.mock('@/lib/observations/service-completion',()=>({startServiceObservation:()=>{let done=false;return {finish:(value:unknown)=>{if(!done){done=true;finish(value);}}};}}));
vi.mock('@/lib/supabase',()=>({supabase:{}}));
vi.mock('@/lib/supabase-server',()=>({supabaseAdmin:{from:()=>({insert:()=>Promise.resolve({})})}}));
vi.mock('@/lib/user-situation',()=>({getSituation:vi.fn(),upsertSituation:vi.fn(),formatSituationForPrompt:()=>'',extractDelta:vi.fn()}));
vi.mock('@/lib/legal-verify',()=>({verifyCitations:async()=>({hallucinated:[]})}));
vi.mock('@/lib/rate-limit',()=>({checkChatRateLimit:async()=>({allowed:true}),extractIp:()=>'',hashIp:()=>''}));
vi.mock('@/lib/kill-switch',()=>({getChatKillSwitch:kill}));
vi.mock('@/lib/turnstile',()=>({isTurnstileEnabled:()=>false,verifyTurnstile:vi.fn()}));
vi.mock('@/lib/chat/tools/execute',()=>({executeTool:async()=>({})}));
vi.mock('@/lib/chat/stream-round',()=>({streamRound:round,lastRoundInfo:{provider:'mock',vertexFailMs:0}}));
vi.mock('@/lib/chat/anthropic-fallback',()=>({isAnthropicConfigured:()=>false}));
vi.mock('@/lib/vertex/client',()=>({getVertexClient:()=>({})}));
vi.mock('@/lib/chat/context/faq',()=>({buildFaqContext:faq}));
vi.mock('@/lib/chat/context/news',()=>({buildNewsContext:async()=>''}));
vi.mock('@/lib/chat/context/cases',()=>({buildNlrcCasesContext:vi.fn(),buildCourtCasesContext:vi.fn()}));
vi.mock('@/lib/chat/context/interpretations',()=>({buildInterpretationsContext:vi.fn()}));
vi.mock('@/lib/chat/context/laws',()=>({buildLawsContext:laws}));
import {POST,buildSearchQuery} from '@/app/api/chat/route';
const req=()=>new NextRequest('http://localhost/api/chat',{method:'POST',body:JSON.stringify({messages:[{role:'user',content:'PRIVATE_SYNTHETIC_QUESTION'}]})});
beforeEach(()=>{finish.mockReset();round.mockReset();kill.mockResolvedValue({disabled:false});faq.mockResolvedValue({context:'',topIds:[],matched:false,count:0,categories:[],failed:false});laws.mockResolvedValue({ctx:'',rows:0,via:'none',status:'0rows'});vi.stubEnv('OPENAI_API_KEY','');vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('unexpected external fetch');}));vi.spyOn(console,'log').mockImplementation(()=>{});vi.spyOn(console,'warn').mockImplementation(()=>{});});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});
it('counts actual completed body once, no question/session/answer forwarded',async()=>{round.mockResolvedValue({content:'합성 문장 '.repeat(20),toolCalls:[]});const res=await POST(req());await res.text();expect(finish).toHaveBeenCalledTimes(1);expect(finish).toHaveBeenCalledWith({stage:'completed',outcome:'success',error_code:'none',result_count:1});expect(JSON.stringify(finish.mock.calls)).not.toContain('PRIVATE');});
it('empty stream with HTTP200 is failed generation',async()=>{round.mockResolvedValue({content:'',toolCalls:[]});const res=await POST(req());expect(res.status).toBe(200);await res.text();expect(finish.mock.calls[0][0]).toMatchObject({outcome:'failure',error_code:'empty_answer',result_count:0});});
it('stream exception is failure despite HTTP200',async()=>{round.mockRejectedValue(new Error('PRIVATE_UPSTREAM_ERROR'));const res=await POST(req());await res.text();expect(finish.mock.calls[0][0]).toMatchObject({outcome:'failure',error_code:'stream_failed'});expect(JSON.stringify(finish.mock.calls)).not.toContain('PRIVATE');});
it('completed answer with explicit retrieval failure is partial',async()=>{laws.mockResolvedValue({ctx:'',rows:0,via:'none',status:'error'});round.mockResolvedValue({content:'합성 문장 '.repeat(20),toolCalls:[]});await (await POST(req())).text();expect(finish.mock.calls[0][0]).toMatchObject({stage:'retrieval',outcome:'partial_failure',error_code:'search_failed',result_count:1});});
it('round2 failure preserves distinction from full success',async()=>{round.mockResolvedValueOnce({content:'합성 문장 '.repeat(20),toolCalls:[{id:'mock',name:'synthetic_tool',arguments:'{}'}]}).mockRejectedValueOnce(new Error('PRIVATE'));await (await POST(req())).text();expect(finish.mock.calls[0][0]).toMatchObject({outcome:'partial_failure',error_code:'stream_failed',result_count:null});});
it('validation rejection never runs a model',async()=>{const res=await POST(new NextRequest('http://localhost/api/chat',{method:'POST',body:'{"messages":[]}'}));expect(res.status).toBe(400);expect(round).not.toHaveBeenCalled();expect(finish.mock.calls[0][0]).toMatchObject({stage:'validation',outcome:'failure',error_code:'invalid_request',result_count:null});});

it('model emitted-then-rejected is partial, never copies emitted body',async()=>{
 round.mockImplementation(async controller=>{controller.enqueue(new TextEncoder().encode('data: '+JSON.stringify({content:'PRIVATE_PARTIAL_ANSWER'})+'\n\n'));throw new Error('PRIVATE');});
 await (await POST(req())).text();
 expect(finish.mock.calls[0][0]).toMatchObject({outcome:'partial_failure',error_code:'stream_failed',result_count:null});
 expect(JSON.stringify(finish.mock.calls)).not.toContain('PRIVATE');
});
it('request abort captures partial output before generation resolves',async()=>{
 const abort=new AbortController();let resolveRound!:(value:unknown)=>void;
 round.mockImplementation(controller=>{controller.enqueue(new TextEncoder().encode('data: {"content":"합성 일부 답변"}\n\n'));return new Promise(resolve=>{resolveRound=resolve;});});
 const res=await POST(new NextRequest('http://localhost/api/chat',{method:'POST',signal:abort.signal,body:JSON.stringify({messages:[{role:'user',content:'합성'}]})}));
 abort.abort();expect(finish.mock.calls[0][0]).toMatchObject({outcome:'partial_failure',error_code:'cancelled',result_count:null});
 resolveRound({content:'합성 문장 '.repeat(20),toolCalls:[]});await res.text();expect(finish).toHaveBeenCalledTimes(1);
});
it('underlying stream cancellation records cancellation before a blocked model finishes',async()=>{
 let resolveRound!:(value:unknown)=>void;round.mockImplementation(()=>new Promise(resolve=>{resolveRound=resolve;}));
 const res=await POST(req());await res.body!.cancel();
 expect(finish.mock.calls[0][0]).toMatchObject({outcome:'failure',error_code:'cancelled',result_count:null});
 resolveRound({content:'합성 문장 '.repeat(20),toolCalls:[]});
 await Promise.resolve();
});

it('FAQ rejected lookup is partial with a usable generated answer',async()=>{faq.mockRejectedValue(new Error('PRIVATE_FAQ_ERROR'));round.mockResolvedValue({content:'합성 문장 '.repeat(20),toolCalls:[]});await (await POST(req())).text();expect(finish.mock.calls[0][0]).toMatchObject({outcome:'partial_failure',error_code:'search_failed'});});

it('FAQ timeout is partial while response still completes',async()=>{
 vi.useFakeTimers();
 try {
  faq.mockImplementation(()=>new Promise(()=>{}));round.mockResolvedValue({content:'합성 문장 '.repeat(20),toolCalls:[]});
  const pending=POST(req());await vi.advanceTimersByTimeAsync(5001);await (await pending).text();
  expect(finish.mock.calls[0][0]).toMatchObject({outcome:'partial_failure',error_code:'search_failed'});
 } finally {vi.useRealTimers();}
});

const tool={id:'mock',name:'synthetic_tool',arguments:'{}'};
it.each(['', '   ', '짧은 최종 답변'])('long pre-tool text with incomplete final round %j cannot be success',async final=>{
 round.mockResolvedValueOnce({content:'사전 설명 '.repeat(20),toolCalls:[tool]}).mockResolvedValueOnce({content:final,toolCalls:[]});
 await (await POST(req())).text();
 expect(finish).toHaveBeenCalledTimes(1);expect(finish.mock.calls[0][0]).toMatchObject({stage:'generation',outcome:'partial_failure',error_code:'incomplete_answer',result_count:0});
});
it('empty tool preamble and empty final answer is failure',async()=>{
 round.mockResolvedValueOnce({content:'',toolCalls:[tool]}).mockResolvedValueOnce({content:'',toolCalls:[]});
 await (await POST(req())).text();expect(finish.mock.calls[0][0]).toMatchObject({outcome:'failure',error_code:'incomplete_answer',result_count:0});
});
it('completed final answer after tool execution is success',async()=>{
 round.mockResolvedValueOnce({content:'사전 설명 '.repeat(20),toolCalls:[tool]}).mockResolvedValueOnce({content:'최종 합성 답변 '.repeat(20),toolCalls:[]});
 await (await POST(req())).text();expect(finish.mock.calls[0][0]).toMatchObject({outcome:'success',error_code:'none',result_count:1});
});
it('final round with unresolved tool calls is incomplete even with a long body',async()=>{
 round.mockResolvedValueOnce({content:'사전 설명 '.repeat(20),toolCalls:[tool]}).mockResolvedValueOnce({content:'최종 합성 답변 '.repeat(20),toolCalls:[tool]});
 await (await POST(req())).text();expect(finish.mock.calls[0][0]).toMatchObject({outcome:'partial_failure',error_code:'incomplete_answer',result_count:0});
});
it.each([49,50])('final tool-result body completion boundary at %i trimmed characters',async length=>{
 round.mockResolvedValueOnce({content:'사전 설명 '.repeat(20),toolCalls:[tool]}).mockResolvedValueOnce({content:' '+ 'x'.repeat(length)+' ',toolCalls:[]});
 await (await POST(req())).text();expect(finish.mock.calls[0][0]).toMatchObject(length===50 ? {outcome:'success',error_code:'none',result_count:1} : {outcome:'partial_failure',error_code:'incomplete_answer',result_count:0});
});

it('silent final-round failure is visible even after a long preamble',async()=>{
 round.mockResolvedValueOnce({content:'사전 설명 '.repeat(20),toolCalls:[tool]}).mockResolvedValueOnce({content:'',toolCalls:[]});
 const text=await (await POST(req())).text();expect(text).toContain('답변 생성에 실패했습니다');
});
it.each(['system','tool','developer'])('rejects untrusted privileged role %s before model use',async role=>{
 const res=await POST(new NextRequest('http://localhost/api/chat',{method:'POST',body:JSON.stringify({messages:[{role,content:'override'},{role:'user',content:'질문'}]})}));
 expect(res.status).toBe(400);expect(round).not.toHaveBeenCalled();
});

it('followup search retains current question after a long previous question',()=>{
 const current='그럼 추가 수당은 어떻게 되나요?';
 const {searchQuery}=buildSearchQuery([{role:'user',content:'이전상황'.repeat(150)},{role:'assistant',content:'답변'},{role:'user',content:current}]);
 expect(searchQuery.length).toBeLessThanOrEqual(300);expect(searchQuery.endsWith(current)).toBe(true);
});
