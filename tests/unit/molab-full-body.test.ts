import {expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
vi.mock('@/lib/supabase-server',()=>({supabaseServer:{from:(table:string)=>{
 const row={id:'ml_fixture',title:'합성 질의회시',case_number:'합성번호',decision_date:'2021-08-09',keywords_matched:[],inquiry_summary:'질의 요약',answer_summary:'요약 '.repeat(1666)+'경우 연',full_text:'<p>별도 수집본문: 경우 연장근로수당만 발생함</p><table><tr><td>규정을 준용한다</td></tr></table><p>보존할 최종 결론</p><script>window.__fixtureExecuted=1</script>',url:'https://labor.moel.go.kr/cmmt/iqrs_detail.do?id=18820'};
 const chain={select:()=>chain,eq:()=>chain,maybeSingle:()=>Promise.resolve({data:table==='molab_interpretations'?row:null,error:null}),single:()=>Promise.resolve({data:null,error:null})};return chain;
}}}));
import Page from '@/app/interpretations/[id]/page';
it('actual MOLAB detail separately renders stored full text beyond the shortened answer',async()=>{
 const html=renderToStaticMarkup(await Page({params:Promise.resolve({id:'ml_fixture'})}));expect(html).toContain('별도로 확보한 수집 본문');expect(html).toContain('연장근로수당만 발생함');expect(html).toContain('보존할 최종 결론');expect(html).toContain('<table>');expect(html).not.toContain('window.__fixtureExecuted');expect(html).toContain('공식 원문 보기 (고용노동부)');
});
