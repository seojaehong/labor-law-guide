import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { judge, paragraphs, type RuleSpec } from '@/lib/laws/rules-check';
import { periodCheck, type StdArticle, type StdRule } from '@/lib/laws/standard-check';

const rule: RuleSpec = { lawId:'synthetic',law:'synthetic',article:'제1조',effective:'20260820',topic:'synthetic',art93:'8',required:true,anchor:['육아휴직'],keywords:['육아휴직','휴직을 신청'],ok:['1주 또는 2주'],stale:[],point:'',clause:'',mst:null };
const scenarios = [
  {name:'general leave alone cannot satisfy an anchored rule',text:'제1조(일반 휴직) 휴직을 신청하면 1주 또는 2주를 허용한다.',status:'누락',where:null},
  {name:'reference to a different article cannot supply evidence',text:'제1조(일반 휴직) 휴직을 신청하면 1주 또는 2주를 허용한다.\n육아휴직은 제2조에 따른다.\n제2조(육아휴직) 육아휴직을 허용한다.',status:'미반영',where:'제2조(육아휴직)'},
  {name:'reference-only body has no independent scheme evidence',text:'제1조(일반 휴직) 휴직을 신청하면 1주 또는 2주를 허용한다.\n육아휴직은 제2조에 따른다.',status:'누락',where:null},
  {name:'bracket title and spacing preserve the same article',text:'제 2 조【육아 휴직】\n휴직을 신청하면 1주 또는 2주를 허용한다.',status:'반영됨',where:'제2조【육아 휴직】'},
  {name:'square title preserves the same article',text:'제2조[육아휴직]\n휴직을 신청하면 1주 또는 2주를 허용한다.',status:'반영됨',where:'제2조[육아휴직]'},
];
function python(text:string, r:RuleSpec) {
  const code = `import importlib.util,json,sys\nspec=importlib.util.spec_from_file_location('impact','scripts/laws/rules_impact.py')\nm=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\nx=json.load(sys.stdin);v=m.judge(x['rule'],m.paragraphs(x['text']))\nprint(json.dumps({k:v.get(k) for k in ['status','where','missing']}))`;
  return JSON.parse(execFileSync('python3',['-X','utf8','-c',code],{input:JSON.stringify({rule:r,text}),encoding:'utf8'}));
}
describe('synthetic Python/TypeScript technical parity',()=>{
  for(const x of scenarios) it(x.name,()=>{
    const ts=judge(rule,paragraphs(x.text));
    expect(ts).toMatchObject({status:x.status,where:x.where});
    expect(python(x.text,rule)).toEqual({status:ts.status,where:ts.where,missing:ts.missing});
  });
  it('normalizes middle-dot variants identically without adding legal synonyms',()=>{
    const r={...rule,anchor:['육아ㆍ휴직'],keywords:['육아ㆍ휴직']};
    const text='제2조(육아·휴직) 1주 또는 2주';
    expect(judge(r,paragraphs(text)).status).toBe('반영됨');
    expect(python(text,r).status).toBe('반영됨');
  });
  it('period UI does not pass an unrelated whole-document keyword fallback',()=>{
    const s:StdArticle={id:'synthetic-standard',no:'제2조',title:'대상 제도',chapter:null,kind:'필수',text:'',laws:[],keywords:['대상제도'],status:'auto'};
    const r:StdRule={...rule,anchor:undefined,keywords:['신청서'],ok:['1주 또는 2주'],std:[s.id]};
    const result=periodCheck({text:'제1조(일반 절차) 신청서에 1주 또는 2주를 적는다.',std:[s],events:[],rules:[r],from:'20260101',to:'20261231'});
    expect(result.items[0].verdicts[0].status).toBe('누락');
  });
  it('period UI and direct/Python check agree on cross-reference false pass',()=>{
    const s:StdArticle={id:'synthetic-standard',no:'제2조',title:'육아휴직',chapter:null,kind:'필수',text:'',laws:[],keywords:['육아휴직'],status:'auto'};
    const x=scenarios[1];
    const result=periodCheck({text:x.text,std:[s],events:[],rules:[{...rule,std:[s.id]}],from:'20260101',to:'20261231'});
    expect(result.items[0].verdicts[0]).toMatchObject({status:x.status,where:x.where});
  });
});
