import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const { db } = vi.hoisted(() => ({ db: { rpc: vi.fn(), from: vi.fn() } }));
vi.mock('@/lib/supabase', () => ({ supabase: db }));
vi.mock('@/lib/supabase-server', () => ({ supabaseAdmin: db }));
vi.mock('@/lib/chat/context/jev', () => ({ jevRerank: async (_query: string, rows: unknown[], count: number) => rows.slice(0, count) }));
vi.mock('@/lib/ai/retrieval', () => ({ extractTags: () => [], searchCases: async () => ({ tags: [], cases: [], allCases: [], timings: {}, degraded: false }) }));
vi.mock('@/lib/ai/prompt', () => ({ SYSTEM_PROMPT: 'offline system', buildComparisonMeta: () => null, buildUserContext: () => 'offline context', trimHistory: vi.fn((_messages: unknown, context: string) => [{role:'user',content:context}]) }));
beforeEach(() => {
  vi.resetModules();vi.stubEnv('OPENAI_API_KEY', 'offline-never-sent');vi.stubEnv('GEMINI_API_KEY', '');vi.stubEnv('ANTHROPIC_API_KEY', '');
  db.rpc.mockReset().mockResolvedValue({ data: [{ id: 123, question: 'fixture question', answer: 'FIRST_LOOKUP_ANSWER', source: 'fixture source' }], error: null });
  db.from.mockReset().mockImplementation(() => { throw new Error('second FAQ lookup must never happen'); });
});
afterEach(() => { vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks(); });
const req = () => new NextRequest('http://localhost/api/sanction', {method:'POST',body:JSON.stringify({messages:[{role:'user',content:'fixture question'}],stream:true})});
const delta = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
it('one FAQ snapshot reaches prompt and UI while invented streamed citations are removed', async () => {
  const fakeFetch = vi.fn(async (_url, options) => {
    expect(JSON.parse(options.body).messages[1].content).toContain('FIRST_LOOKUP_ANSWER');
    return new Response(delta('설명 [FAQ#999] ') + delta('[FAQ#123] 끝') + 'data: {\"choices\":[{\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n');
  });
  vi.stubGlobal('fetch', fakeFetch);
  const {POST} = await import('@/app/api/sanction/route');
  const response = await (await POST(req())).text();
  const events = response.split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)));
  expect(events.find(event => event.type === 'meta').faqs).toEqual([{id:123,category:'',question:'fixture question',answer:'FIRST_LOOKUP_ANSWER',source:'fixture source'}]);
  const streamed = events.filter(event => event.type === 'delta').map(event => event.text).join('');
  expect(streamed).not.toContain('FAQ#999');expect(streamed).toContain('[FAQ#123]');
  expect(events.find(event => event.type === 'done').content).not.toContain('FAQ#999');
  expect(db.from).not.toHaveBeenCalled();expect(fakeFetch).toHaveBeenCalledTimes(1);
});
it('provider EOF without its terminal becomes error, never application done', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(delta('partial fixture answer'))));
  const {POST} = await import('@/app/api/sanction/route');
  const response = await (await POST(req())).text();
  expect(response).toContain('"type":"error"');expect(response).not.toContain('"type":"done"');
});

it('explicit reset removes old provider history as well as old retrieval context', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(delta('new fixture answer')+'data: {\"choices\":[{\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n')));
  const {POST} = await import('@/app/api/sanction/route');
  const request = new NextRequest('http://localhost/api/sanction',{method:'POST',body:JSON.stringify({messages:[{role:'user',content:'OLD_PRIVATE_FIXTURE'},{role:'assistant',content:'OLD_MODEL_FIXTURE'},{role:'user',content:'새 질문: 근로시간'}],stream:true})});
  await (await POST(request)).text();
  const {trimHistory} = await import('@/lib/ai/prompt');
  expect(vi.mocked(trimHistory).mock.calls.at(-1)?.[0]).toEqual([{role:'user',content:'새 질문: 근로시간'}]);
});

it('upstream error preserves safe pending tail and never completes the application response', async () => {
  let sent = false;
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({
    pull(controller) {
      if (!sent) { sent = true;controller.enqueue(new TextEncoder().encode(delta('먼저 보인 문장 [FAQ#123] 안전한 꼬리 [FAQ#999]'))); }
      else controller.error(new Error('offline provider interruption'));
    },
  }))));
  const {POST} = await import('@/app/api/sanction/route');
  const response = await (await POST(req())).text();
  const events = response.split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)));
  const body = events.filter(event => event.type === 'delta').map(event => event.text).join('');
  expect(body).toContain('먼저 보인 문장');expect(body).toContain('안전한 꼬리');expect(body).not.toContain('FAQ#999');
  expect(events.some(event => event.type === 'error')).toBe(true);expect(events.some(event => event.type === 'done')).toBe(false);
});

it.each([
  ['openai', 'length', 'output_limit'], ['openai', 'content_filter', 'content_filter'],
  ['gemini', 'length', 'output_limit'], ['gemini', 'content_filter', 'content_filter'],
  ['anthropic', 'max_tokens', 'output_limit'], ['anthropic', 'refusal', 'refusal'],
  ['openai', 'tool_calls', 'incomplete'], ['anthropic', 'tool_use', 'incomplete'],
  ['openai', null, 'incomplete'], ['anthropic', null, 'incomplete'],
])('%s stream %s plus terminal never emits app done (%s)', async (provider, reason, code) => {
  vi.stubEnv('OPENAI_API_KEY', provider === 'openai' ? 'offline-fixture' : '');
  vi.stubEnv('GEMINI_API_KEY', provider === 'gemini' ? 'offline-fixture' : '');
  vi.stubEnv('ANTHROPIC_API_KEY', provider === 'anthropic' ? 'offline-fixture' : '');
  const fixture = provider === 'anthropic'
    ? `data: ${JSON.stringify({type:'content_block_delta',delta:{text:'부분 근거 설명 [FAQ#999] 안전한 꼬리'}})}\n\ndata: ${JSON.stringify({type:'message_delta',delta:{stop_reason:reason}})}\n\ndata: {"type":"message_stop"}\n\n`
    : delta('부분 근거 설명 [FAQ#999] 안전한 꼬리') + `data: ${JSON.stringify({choices:[{finish_reason:reason}]})}\n\ndata: [DONE]\n\n`;
  vi.stubGlobal('fetch', vi.fn(async () => new Response(fixture)));
  const {POST} = await import('@/app/api/sanction/route');
  const text = await (await POST(req())).text();
  expect(text).not.toContain('"type":"done"');expect(text).toContain(`"error_code":"${code}"`);
  const body = text.split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6))).filter(event => event.type === 'delta').map(event => event.text).join('');
  expect(body).toContain('안전한 꼬리');expect(body).not.toContain('FAQ#999');
});

it.each([['openai','stop'],['gemini','stop'],['anthropic','end_turn'],['anthropic','stop_sequence']])('%s stream normal %s completes', async (provider, reason) => {
  vi.stubEnv('OPENAI_API_KEY', provider === 'openai' ? 'offline-fixture' : '');
  vi.stubEnv('GEMINI_API_KEY', provider === 'gemini' ? 'offline-fixture' : '');
  vi.stubEnv('ANTHROPIC_API_KEY', provider === 'anthropic' ? 'offline-fixture' : '');
  const fixture = provider === 'anthropic'
    ? `data: {"type":"content_block_delta","delta":{"text":"정상 완료 설명"}}\n\ndata: ${JSON.stringify({type:'message_delta',delta:{stop_reason:reason}})}\n\ndata: {"type":"message_stop"}\n\n`
    : delta('정상 완료 설명') + `data: ${JSON.stringify({choices:[{finish_reason:reason}]})}\n\ndata: [DONE]\n\n`;
  vi.stubGlobal('fetch', vi.fn(async () => new Response(fixture)));
  const {POST} = await import('@/app/api/sanction/route');
  const text = await (await POST(req())).text();expect(text).toContain('"type":"done"');expect(text).not.toContain('"type":"error"');
});

it.each([['openai','length','output_limit'],['openai','content_filter','content_filter'],['anthropic','max_tokens','output_limit'],['anthropic','refusal','refusal']])('%s nonstream %s fails explicitly (%s)', async(provider, reason, code) => {
  vi.stubEnv('OPENAI_API_KEY', provider === 'openai' ? 'offline-fixture' : '');vi.stubEnv('ANTHROPIC_API_KEY', provider === 'anthropic' ? 'offline-fixture' : '');
  vi.spyOn(console,'error').mockImplementation(()=>{});
  const fixture = provider === 'anthropic' ? {stop_reason:reason,content:[{type:'text',text:'부분 답변'}]} : {choices:[{finish_reason:reason,message:{content:'부분 답변'}}]};
  vi.stubGlobal('fetch', vi.fn(async()=>Response.json(fixture)));
  const {POST} = await import('@/app/api/sanction/route');
  const response = await POST(new NextRequest('http://localhost/api/sanction',{method:'POST',body:JSON.stringify({query:'fixture',stream:false})}));
  expect(response.status).toBe(502);expect(await response.json()).toMatchObject({completion:'incomplete',error_code:code});
});

it.each([['openai','stop'],['anthropic','end_turn']])('%s nonstream normal %s succeeds',async(provider,reason)=>{
 vi.stubEnv('OPENAI_API_KEY',provider==='openai'?'offline-fixture':'');vi.stubEnv('ANTHROPIC_API_KEY',provider==='anthropic'?'offline-fixture':'');
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json(provider==='anthropic'?{stop_reason:reason,content:[{text:'정상 답변'}]}:{choices:[{finish_reason:reason,message:{content:'정상 답변'}}]})));
 const {POST}=await import('@/app/api/sanction/route');
 const response=await POST(new NextRequest('http://localhost/api/sanction',{method:'POST',body:JSON.stringify({query:'fixture',stream:false})}));
 expect(response.status).toBe(200);expect(await response.json()).toMatchObject({content:'정상 답변'});
});
it('stream refusal metadata overrides a subsequent normal stop',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('data: {"choices":[{"delta":{"refusal":"offline refusal"}}]}\n\ndata: {"choices":[{"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n')));
 const {POST}=await import('@/app/api/sanction/route');
 const response=await(await POST(req())).text();expect(response).toContain('"error_code":"refusal"');expect(response).not.toContain('"type":"done"');
});

it('normal stop and terminal with empty model body is still incomplete',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('data: {"choices":[{"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n')));
 const {POST}=await import('@/app/api/sanction/route');
 const response=await(await POST(req())).text();expect(response).toContain('"error_code":"incomplete"');expect(response).not.toContain('"type":"done"');
});
it('nonstream normal stop with empty model body is incomplete',async()=>{
 vi.spyOn(console,'error').mockImplementation(()=>{});
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({choices:[{finish_reason:'stop',message:{content:'   '}}]})));
 const {POST}=await import('@/app/api/sanction/route');
 const response=await POST(new NextRequest('http://localhost/api/sanction',{method:'POST',body:JSON.stringify({query:'fixture',stream:false})}));
 expect(response.status).toBe(502);expect(await response.json()).toMatchObject({error_code:'incomplete'});
});

it.each(['openai','anthropic'])('%s nonstream missing stop metadata fails closed',async(provider)=>{
 vi.stubEnv('OPENAI_API_KEY',provider==='openai'?'offline-fixture':'');vi.stubEnv('ANTHROPIC_API_KEY',provider==='anthropic'?'offline-fixture':'');
 vi.spyOn(console,'error').mockImplementation(()=>{});
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json(provider==='anthropic'?{content:[{text:'메타데이터 없는 답변'}]}:{choices:[{message:{content:'메타데이터 없는 답변'}}]})));
 const {POST}=await import('@/app/api/sanction/route');
 const response=await POST(new NextRequest('http://localhost/api/sanction',{method:'POST',body:JSON.stringify({query:'fixture',stream:false})}));
 expect(response.status).toBe(502);expect(await response.json()).toMatchObject({completion:'incomplete',error_code:'incomplete'});
});
