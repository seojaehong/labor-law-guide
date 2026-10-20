import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const {runSearch,finish}=vi.hoisted(()=>({runSearch:vi.fn(),finish:vi.fn()}));
vi.mock('@/lib/search/search-modes',()=>({runSearch}));
vi.mock('@/lib/observations/service-completion',()=>({startServiceObservation:()=>({finish})}));
import {GET} from '@/app/api/search/route';
beforeEach(()=>{finish.mockReset();runSearch.mockReset();});
const req=(mode='baseline')=>new NextRequest(`http://localhost/api/search?q=PRIVATE_QUESTION&mode=${mode}`);
it('zero results is a completed success, never a copied query',async()=>{runSearch.mockResolvedValue({baseline:{items:[]}});expect((await GET(req())).status).toBe(200);expect(finish).toHaveBeenCalledWith({stage:'completed',outcome:'success',error_code:'none',result_count:0});expect(JSON.stringify(finish.mock.calls)).not.toContain('PRIVATE_QUESTION');});
it('HTTP200 bucket errors are failures',async()=>{runSearch.mockResolvedValue({baselineError:'PRIVATE_ERROR',baseline:{items:[]}});await GET(req());expect(finish).toHaveBeenCalledWith({stage:'retrieval',outcome:'failure',error_code:'search_failed',result_count:null});});
it('compare partial failure counts only the successful bucket',async()=>{runSearch.mockResolvedValue({baselineError:'PRIVATE_ERROR',candidate:{items:[{title:'PRIVATE_TITLE'}]}});await GET(req('compare'));expect(finish).toHaveBeenCalledWith({stage:'retrieval',outcome:'partial_failure',error_code:'search_failed',result_count:1});expect(JSON.stringify(finish.mock.calls)).not.toContain('PRIVATE');});
it('throw records generic failure',async()=>{runSearch.mockRejectedValue(new Error('PRIVATE_ERROR'));expect((await GET(req())).status).toBe(500);expect(finish.mock.calls[0][0].error_code).toBe('search_failed');});

it('secondary retrieval failure distinguishes an otherwise usable response',async()=>{runSearch.mockImplementation(async(_options,failed)=>{failed();return {baseline:{items:[{}]}};});await GET(req());expect(finish.mock.calls[0][0]).toMatchObject({outcome:'partial_failure',error_code:'search_failed',result_count:1});});

it('empty error message remains failure rather than zero-result success',async()=>{runSearch.mockResolvedValue({baselineError:'',baseline:{items:[]}});await GET(req());expect(finish.mock.calls[0][0]).toMatchObject({outcome:'failure',error_code:'search_failed',result_count:null});});
