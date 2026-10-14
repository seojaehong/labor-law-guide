import {beforeEach,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
const mock=vi.hoisted(()=>({from:vi.fn()}));
vi.mock('@/lib/supabase',()=>({supabase:mock}));
import DecisionPage,{generateMetadata} from '@/app/decisions/[id]/page';
const stored={id:'bc_fixture',title:'합성 법원 자료',case_number:'2026가합1',department:'합성 법원',decision_date:'0001-01-01',decision_result:'granted',reason_category:['worker_status','misconduct'],issue_type_primary:'misconduct',tags:['기존 관련 태그'],holding_points:'합성 자료 '.repeat(60),holding_summary:'합성 요약'};
function query(data:unknown){const response={data,error:null};const chain={select:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn(),order:vi.fn(),limit:vi.fn(),then:(resolve:(r:typeof response)=>unknown)=>Promise.resolve(response).then(resolve)};for(const m of ['select','eq','maybeSingle','order','limit'] as const)chain[m].mockReturnValue(chain);return chain;}
beforeEach(()=>{vi.clearAllMocks();mock.from.mockImplementation((table:string)=>query(table==='nlrc_decisions'?stored:table==='decision_source_documents'?[]:null));});
it('does not relabel imported court results as NLRC remedy outcomes in metadata',async()=>{
 const meta=await generateMetadata({params:Promise.resolve({id:stored.id})});expect(JSON.stringify(meta)).not.toContain('인정(구제)');expect(JSON.stringify(meta)).not.toContain('판정 인정');
});
it('keeps representative and related tags but suppresses unverified court outcomes and sentinel dates',async()=>{
 const html=renderToStaticMarkup(await DecisionPage({params:Promise.resolve({id:stored.id})}));
 expect(html).toContain('대표 유형: 비위행위');expect(html).toContain('함께 저장된 유형');expect(html).toContain('관련 태그');expect(html).toContain('기존 관련 태그');expect(html).not.toContain('granted');expect(html).not.toContain('0001-01-01');expect(html).toContain('날짜 미확인');
});
