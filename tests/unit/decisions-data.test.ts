import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({from:vi.fn(),rpc:vi.fn()}));
vi.mock('@/lib/supabase', () => ({supabase:mocks}));
import { getCategory, countByReason, getRecent, runSearch } from '@/lib/decisions-data';

function query(data: unknown[] = [], error: unknown = null, count: number | null = data.length) {
  const response = {data,error,count};
  const chain = {select:vi.fn(),contains:vi.fn(),not:vi.fn(),order:vi.fn(),range:vi.fn(),gte:vi.fn(),limit:vi.fn(),then: (resolve: (r:typeof response)=>unknown) => Promise.resolve(response).then(resolve)};
  for (const method of ['select','contains','not','order','range','gte','limit'] as const) chain[method].mockReturnValue(chain);
  mocks.from.mockReturnValue(chain);
  return chain;
}
const row = (id: number) => ({ id:String(id), title:'테스트 판정례', case_number:'old', case_number_real:'real',case_number_qualified:'qualified',key_issue:null,decision_date:null,decision_result:null,reason_category:['no_dismissal'] });
beforeEach(() => vi.clearAllMocks());
describe('category data contract', () => {
  it('uses the same population as the card count and stable ordering', async () => {
    const chain = query([row(1)]);
    await getCategory('no_dismissal',2);
    expect(mocks.from).toHaveBeenCalledWith('nlrc_decisions');
    expect(chain.contains).toHaveBeenCalledWith('reason_category',['no_dismissal']);
    expect(chain.not.mock.calls).toEqual([['is_non_labor','is',true]]);
    expect(chain.order.mock.calls).toEqual([['decision_date',{ascending:false,nullsFirst:false}],['id',{ascending:true}]]);
    expect(chain.range).toHaveBeenCalledWith(20,40);
    expect(chain.gte).not.toHaveBeenCalled();
    chain.contains.mockClear(); chain.not.mockClear();
    expect(await countByReason('no_dismissal')).toBe(1);
    expect(chain.contains).toHaveBeenCalledWith('reason_category',['no_dismissal']);
    expect(chain.not.mock.calls).toEqual([['is_non_labor','is',true]]);
  });
  it.each([0,1,20,21])('handles %i rows', async n => {
    const chain = query(Array.from({length:n},(_,i)=>row(i)));
    const result = await getCategory('no_dismissal',1);
    expect(chain.range).toHaveBeenCalledWith(0,20);
    expect(result).toMatchObject({ok:true,hasMore:n>20});
    if(result.ok) expect(result.rows).toHaveLength(Math.min(n,20));
  });
  it('preserves detail links and case-number fallback', async () => {
    query([row(1),{...row(2),case_number_qualified:null},{...row(3),case_number_qualified:'OOO',case_number_real:null}]);
    const result = await getCategory('no_dismissal',1);
    if(!result.ok) throw Error('expected success');
    expect(result.rows.map(r=>r.caseNumber)).toEqual(['qualified','real','old']);
    expect(result.rows[0].href).toBe('/decisions/1');
  });
  it('distinguishes DB failure, exception and successful empty results', async () => {
    query([], {message:'private failure'},null);
    expect(await getCategory('other',1)).toEqual({ok:false});
    await expect(countByReason('other')).rejects.toThrow('Category count failed');
    await expect(getRecent()).rejects.toThrow('Recent decisions failed');
    mocks.from.mockImplementation(()=>{throw Error('offline')});
    expect(await getCategory('other',1)).toEqual({ok:false});
    query([]);
    expect(await getCategory('other',1)).toEqual({ok:true,rows:[],hasMore:false});
  });
  it.each([['nlrc','search_nlrc'],['court','search_cases'],['admin','search_admin']] as const)('keeps %s RPC args and detects errors', async (type,fn) => {
    mocks.rpc.mockResolvedValue({data:[],error:null});
    expect(await runSearch('성희롱',type,2)).toEqual({ok:true,rows:[],hasMore:false});
    expect(mocks.rpc).toHaveBeenCalledWith(fn,{query:'성희롱',result_limit:21,page_offset:20});
    mocks.rpc.mockResolvedValue({data:null,error:{message:'failed'}});
    expect(await runSearch('성희롱',type,1)).toEqual({ok:false});
    mocks.rpc.mockRejectedValue(Error('offline'));
    expect(await runSearch('성희롱',type,1)).toEqual({ok:false});
  });
  it('keeps the short-query fast path', async () => {
    expect(await runSearch('a','nlrc',1)).toEqual({ok:true,rows:[],hasMore:false});
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
