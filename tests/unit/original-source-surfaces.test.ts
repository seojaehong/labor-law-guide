import {expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
const data=vi.hoisted(()=>({original:'https://bigcase.ai/private',url:'https://superlawyer.ai/private'}));
vi.mock('@/lib/supabase-server',()=>({supabaseServer:{from:()=>{
 const response={data:[{id:'fixture',title:'合성 자료',case_number:'2007두8881',doc_number:'10-0445',court:'합성 법원',summary:null,decision_date:null,get original_url(){return data.original},get url(){return data.url}}],error:null,count:1};
 const chain={select:()=>chain,in:()=>chain,then:(resolve:(r:typeof response)=>unknown)=>Promise.resolve(response).then(resolve)};return chain;
}}}));
vi.mock('@/app/database/DatabaseClient',()=>({default:()=>null}));
import DatabasePage from '@/app/database/page';
import CaseCard from '@/app/database/_components/CaseCard';
import AdminCard from '@/app/database/_components/AdminCard';
import NlrcCard from '@/app/database/_components/NlrcCard';
it('actual featured cards never expose private source buttons and use independently validated official fallback',async()=>{
 let html=renderToStaticMarkup(await DatabasePage());expect(html).not.toMatch(/href="https:\/\/(?:bigcase|superlawyer)/);expect(html).toContain('공식 원문 미확인');
 data.url='https://labor.moel.go.kr/cmmt/iqrs_detail.do?id=18820';html=renderToStaticMarkup(await DatabasePage());expect(html).toContain('href="https://labor.moel.go.kr/cmmt/iqrs_detail.do?id=18820"');expect(html).not.toContain('href="https://bigcase');
});
it.each([(props:unknown)=>createElement(CaseCard,props as Parameters<typeof CaseCard>[0]),(props:unknown)=>createElement(AdminCard,props as Parameters<typeof AdminCard>[0]),(props:unknown)=>createElement(NlrcCard,props as Parameters<typeof NlrcCard>[0])])('actual result cards apply source policy without removing internal detail links',render=>{
 const item={id:'fixture',title:'합성 제목',case_number:'2007두8881',doc_number:'10-0445',decision_date:null,original_url:'https://elbox.io/private',url:'https://elabor.co.kr/private'};
 const html=renderToStaticMarkup(render({item,query:'',expanded:false,onToggle:()=>{}}));expect(html).not.toMatch(/href="https:\/\/(?:elbox|elabor)/);expect(html).toContain('공식 원문 미확인');expect(html).toContain('href="/');
});
