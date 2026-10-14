import { expect,it,vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
const payload='</script><script>window.__fixtureExecuted=1</script>';
vi.mock('@/lib/supabase-server',()=>({supabaseServer:{from:(table:string)=>{
 const row={id:'fixture',title:payload,case_number:'합성1',decision_date:'2026-01-01',summary:payload,inquiry_summary:payload,answer_summary:'합성 답변',full_text:'합성 본문',court:null,case_type:null,keywords_matched:[]};
 const response={data:table==='cases'||table==='molab_interpretations'?row:[],error:null};
 const chain={select:()=>chain,eq:()=>chain,single:()=>Promise.resolve(response),maybeSingle:()=>Promise.resolve(response),neq:()=>chain,order:()=>chain,limit:()=>Promise.resolve({data:[],error:null})};return chain;
}}}));
import CasePage from '@/app/cases/[id]/page';
import InterpretationPage from '@/app/interpretations/[id]/page';
it.each([CasePage,InterpretationPage])('actual detail JSON-LD contains one safe parseable script',async Page=>{
 const html=renderToStaticMarkup(await Page({params:Promise.resolve({id:'fixture'})}));
 const scripts=[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
 expect(scripts).toHaveLength(1);expect(JSON.parse(scripts[0][1])['@graph'][1].headline).toContain(payload);
 expect(html).not.toContain('<script>window.__fixtureExecuted');
});
