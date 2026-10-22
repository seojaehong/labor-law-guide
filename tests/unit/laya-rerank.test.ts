import { afterEach, expect, it, vi } from 'vitest';
import { layaRerank } from '@/lib/chat/context/laya';
const items = [{question:'근로시간'}, {question:'해고'}, {question:'임금'}];
afterEach(() => vi.useRealTimers());
it('defaults to unchanged retrieval without inference', async () => {
  const score = vi.fn();
  expect(await layaRerank('합성',items,{score})).toEqual(items);
  expect(score).not.toHaveBeenCalled();
});
it('sorts model preferences stably while preserving object identity', async () => {
  const result = await layaRerank('합성',items,{enabled:true,score:async()=>[.1,.8,.8],topN:2});
  expect(result).toEqual([items[1],items[2]]); expect(result[0]).toBe(items[1]);
});
it.each([[NaN,.2,.3],[Infinity,.2,.3],[-1,.2,.3],[1.1,.2,.3],['.2',.2,.3],[.2],new Array(3),null,{}])('malformed vector keeps original order: %j',async result => {
  expect(await layaRerank('합성',items,{enabled:true,score:async()=>result})).toEqual(items);
});
it('provider failure keeps original order',async()=>{
 expect(await layaRerank('합성',items,{enabled:true,score:async()=>{throw Error('private');}})).toEqual(items);
});
it('timeout aborts and releases its timer even when inference ignores cancellation',async()=>{
 vi.useFakeTimers(); let signal: AbortSignal | undefined;
 const pending=layaRerank('합성',items,{enabled:true,timeoutMs:10,score:async(_q,_c,s)=>{signal=s;return new Promise(()=>{});}});
 await vi.advanceTimersByTimeAsync(11); expect(await pending).toEqual(items);
 expect(signal?.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
});
