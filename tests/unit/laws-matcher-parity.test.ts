import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
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
type Py = {status:string;where:string|null;missing:string[];negated:boolean};
/** 여러 본문을 한 번의 파이썬 호출로 판정한다(규칙 하나) */
function pythonAll(texts:string[], r:RuleSpec):Py[] {
  const code = `import importlib.util,json,sys\nspec=importlib.util.spec_from_file_location('impact','scripts/laws/rules_impact.py')\nm=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\nx=json.load(sys.stdin)\nout=[]\nfor t in x['texts']:\n  v=m.judge(x['rule'],m.paragraphs(t))\n  out.append({'status':v.get('status'),'where':v.get('where'),'missing':v.get('missing'),'negated':bool(v.get('negated'))})\nprint(json.dumps(out))`;
  return JSON.parse(execFileSync('python3',['-X','utf8','-c',code],{input:JSON.stringify({rule:r,texts}),encoding:'utf8'}));
}
const python = (text:string, r:RuleSpec) => pythonAll([text], r)[0];
const tsOf = (v:ReturnType<typeof judge>):Py => ({status:v.status,where:v.where,missing:v.missing,negated:!!v.negated});
describe('synthetic Python/TypeScript technical parity',()=>{
  for(const x of scenarios) it(x.name,()=>{
    const ts=judge(rule,paragraphs(x.text));
    expect(ts).toMatchObject({status:x.status,where:x.where});
    expect(python(x.text,rule)).toEqual(tsOf(ts));
  });
  // G4 261126 I24 — 부정문 판정도 파이썬 쌍둥이(rules_impact.py → /노동법개정반영·work_rules_c)가 같게 낸다
  it('부정문 시나리오 — 리뷰어 재현 문장 전부 TS·파이썬 같은 판정', () => {
    const fx = JSON.parse(readFileSync(path.join(process.cwd(), 'tests', 'fixtures', 'laws', 'negation-sentences.json'), 'utf-8')) as {
      topic: string; head: string; cases: { name: string; negated: boolean; text: string }[];
    };
    const all = (JSON.parse(readFileSync(path.join(process.cwd(), 'public', 'data', 'laws', 'rules.json'), 'utf-8')) as { rules: RuleSpec[] }).rules;
    const r = all.find((x) => x.topic === fx.topic)!;
    const texts = fx.cases.map((c) => fx.head + c.text);
    const py = pythonAll(texts, r);
    const rows = fx.cases.map((c, i) => ({ name: c.name, ts: tsOf(judge(r, paragraphs(texts[i]))), py: py[i], want: c.negated }));
    expect(rows.filter((x) => JSON.stringify(x.ts) !== JSON.stringify(x.py)).map((x) => x.name)).toEqual([]);
    expect(rows.filter((x) => x.ts.negated !== x.want).map((x) => x.name)).toEqual([]);
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
