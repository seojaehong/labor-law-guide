import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
const mocks = vi.hoisted(() => ({from:vi.fn(),rpc:vi.fn()}));
vi.mock('@/lib/supabase', () => ({supabase:mocks}));
vi.mock('next/cache', () => ({unstable_cache: (fn: unknown) => fn}));
import { getCategory, countByReason, getRecent, runSearch, decisionRow } from '@/lib/decisions-data';
import DecisionsIndexPage from '@/app/decisions/page';
import { REASON_LABELS, RESULT_LABELS } from '@/lib/types';

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

describe('shared decision row source contract', () => {
  const records = ['bc_42', 'prec_77', 'nlrc_1'].map(id => ({
    ...row(1), id, decision_result: 'granted', decision_date: '2026-09-20',
  }));

  it.each([
    ['bc_42', 'court', null],
    ['prec_77', 'court', null],
    ['nlrc_1', 'nlrc', 'granted'],
    ['legacy_1', 'nlrc', 'granted'],
  ])('resolves %s by the existing ID contract and preserves card metadata', (id, kind, result) => {
    expect(decisionRow({ ...records[0], id, source: 'bigcase.ai' })).toEqual({
      kind, result, href: `/decisions/${id}`, title: '테스트 판정례',
      caseNumber: 'qualified', date: '2026-09-20', tag: REASON_LABELS.no_dismissal,
    });
  });

  it('keeps encoded detail URLs, masked-number fallback and per-view headline limits', () => {
    const input = { ...records[0], id: 'bc_한 글/42', case_number_qualified: 'OOO',
      case_number_real: null, key_issue: '가'.repeat(650) };
    const result = decisionRow(input);
    expect(result.href).toBe(`/decisions/${encodeURIComponent(input.id)}`);
    expect(result.caseNumber).toBe('old');
    expect(result.title).toBe('가'.repeat(120) + '…');
    expect(decisionRow(input, 600).title).toBe('가'.repeat(600) + '…');
    expect(decisionRow({ id: 'prec_77' }).title).toBe('판례');
    expect(decisionRow({ id: 'nlrc_1' }).title).toBe('판정례');
  });

  it('applies the same source and result mapping to search and category rows', async () => {
    mocks.rpc.mockResolvedValue({ data: records, error: null });
    query(records);
    const expected = records.map(record => decisionRow(record));
    expect(await runSearch('해고', 'nlrc', 1)).toEqual({ ok: true, rows: expected, hasMore: false });
    expect(await getCategory('no_dismissal', 1)).toEqual({ ok: true, rows: expected, hasMore: false });
  });

  it('renders recent court cards without a 노동위 or 인정(구제) badge', async () => {
    const chain = query(records);
    const page = await DecisionsIndexPage({ searchParams: Promise.resolve({}) });
    const hub = page.props.children.at(-1);
    const html = renderToStaticMarkup(await hub.type(hub.props));
    expect(html.match(/>법원<\/span>/g)).toHaveLength(2);
    expect(html.match(/>노동위<\/span>/g)).toHaveLength(1);
    expect(html.split(RESULT_LABELS.granted)).toHaveLength(2);
    for (const record of records) expect(html).toContain(`href="/decisions/${record.id}"`);
    expect(chain.gte).toHaveBeenCalledWith('confidence_level', 0.8);
    expect(chain.limit).toHaveBeenCalledWith(30);
  });

  it.each(['court', 'admin'] as const)('preserves the dedicated %s RPC card contract', async type => {
    mocks.rpc.mockResolvedValue({ data: [{ id: 'bc_42', title: '기존 제목', case_number: '2026두42',
      doc_number: '근로기준정책과-42', court: '대법원', decision_date: '2026-09-20', decision_result: 'granted' }], error: null });
    const result = await runSearch('해고', type, 1);
    expect(result).toEqual({ ok: true, hasMore: false, rows: [{
      kind: type, href: `/${type === 'court' ? 'cases' : 'interpretations'}/bc_42`,
      title: '기존 제목', caseNumber: type === 'court' ? '2026두42' : '근로기준정책과-42',
      date: '2026-09-20', tag: type === 'court' ? '대법원' : null, result: null,
    }] });
  });
});
