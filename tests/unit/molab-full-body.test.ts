import {afterEach,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
const fixture=vi.hoisted(()=>({fullText:undefined as string|undefined}));
afterEach(()=>{fixture.fullText=undefined});
vi.mock('@/lib/supabase-server',()=>({supabaseServer:{from:(table:string)=>{
 const row={id:'ml_fixture',title:'합성 질의회시',case_number:'합성번호',decision_date:'2021-08-09',keywords_matched:[],inquiry_summary:'질의 요약',answer_summary:'<style>.summaryFixture { color:red } /* SUMMARY_CSS_PROBE */</style><table><tr><td>회시 요약 셀</td></tr></table><p>요약 끝부분 경우 연</p><table><tr><td class="',full_text:fixture.fullText??'<p>별도 수집본문: 경우 연장근로수당만 발생함</p><table><tr><td>규정을 준용한다</td></tr></table><p>보존할 최종 결론</p><script>window.__fixtureExecuted=1</script>',url:'https://labor.moel.go.kr/cmmt/iqrs_detail.do?id=18820'};
 const chain={select:()=>chain,eq:()=>chain,maybeSingle:()=>Promise.resolve({data:table==='molab_interpretations'?row:null,error:null}),single:()=>Promise.resolve({data:null,error:null})};return chain;
}}}));
import Page from '@/app/interpretations/[id]/page';
it('actual MOLAB detail separately renders stored full text beyond the shortened answer',async()=>{
 const html=renderToStaticMarkup(await Page({params:Promise.resolve({id:'ml_fixture'})}));expect(html).toContain('별도로 확보한 수집 본문');expect(html).toContain('연장근로수당만 발생함');expect(html).toContain('보존할 최종 결론');expect(html).toContain('<table>');expect(html).not.toContain('window.__fixtureExecuted');expect(html).toContain('공식 원문 보기 (고용노동부)');expect(html).toContain('회시 요약 셀');expect(html).not.toContain('SUMMARY_CSS_PROBE');expect(html).not.toContain('&lt;style');expect(html).not.toContain('&lt;table');expect(html).toContain('잘린 내용을 복구하거나 전문임을 보증하지 않습니다');
});

it.each([{tables:9,rows:1},{tables:1,rows:29}])('actual detail retains all $tables collected tables and $rows rows beyond the truncated summary',async({tables,rows})=>{
 fixture.fullText=Array.from({length:tables},(_,t)=>'<table><tbody>'+Array.from({length:rows},(_,r)=>`<tr><td>합성 표${t} 행${r}</td></tr>`).join('')+'</tbody></table>').join('')+'<p>보존할 별도 본문 마지막 문장</p><a href="https://kss/">https://kss/</a>';
 const html=renderToStaticMarkup(await Page({params:Promise.resolve({id:'ml_fixture'})}));
 const body=html.match(/id="collected-source-body">([\s\S]*?)<\/section>/)?.[1];expect(body).toBeDefined();
 expect(body?.match(/<table>/g)).toHaveLength(tables);expect(body?.match(/<tr>/g)).toHaveLength(tables*rows);expect(body).toContain('보존할 별도 본문 마지막 문장');expect(body).toContain('https://kss/');expect(body).not.toContain('href="https://kss/"');expect(html).not.toContain('SUMMARY_CSS_PROBE');
});
