// Local-only deterministic PostgREST fixture. No production credentials or writes.
import http from 'node:http';
import { selectRows, searchRows } from './postgrest-select.mjs';
const reasons = ['sexual_harassment','workplace_bullying','violence','absence','embezzlement','incompetence','misconduct','redundancy','probation','transfer','contract_expiry','no_dismissal','union_activity','worker_status','discrimination','other'];
const rows = Array.from({length:45},(_,i)=>({id:`fixture-${String(i).padStart(3,'0')}`,title:`Fixture decision 성희롱 ${i}`,case_number:'old',case_number_real:`real-${i}`,case_number_qualified:`qualified-${i}`,key_issue:null,decision_date:i<40?'2026-01-01':null,decision_result:'granted',reason_category:reasons,is_non_labor:false,confidence_level:0.9}));
rows.push({...rows[0],id:'excluded',is_non_labor:true});
let failure = false;
http.createServer(async (req,res)=>{
  const url = new URL(req.url,'http://127.0.0.1:4319');
  res.setHeader('Content-Type','application/json');
  if(url.pathname==='/health') return res.end('{}');
  if(url.pathname==='/control') {failure=url.searchParams.get('fail')==='1';return res.end('{}');}
  if(failure) {res.statusCode=503;return res.end(JSON.stringify({message:'fixture unavailable'}));}
  if(url.pathname.startsWith('/rest/v1/rpc/')) {
    let body='';for await(const chunk of req)body+=chunk;
    const args=JSON.parse(body||'{}');
    const rpc=url.pathname.split('/').at(-1);
    if(req.method!=='POST'){res.statusCode=405;return res.end('{}');}
    try { return res.end(JSON.stringify(searchRows(rows,rpc,args))); }
    catch { res.statusCode=400;return res.end('{}'); }
  }
  if(!['GET','HEAD'].includes(req.method)){res.statusCode=405;return res.end('{}');}
  if(url.pathname==='/rest/v1/cases') {
    const id = url.searchParams.get('id')?.replace(/^eq\./, '');
    if (!id?.startsWith('ilabor_annotation_')) return res.end('[]');
    const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
    const annotate = text => {
      let result = `<law_cite ref="javascript:alert(1)">${text}</law_cite>`;
      const depth = Number(id.slice('ilabor_annotation_'.length));
      for (let i=0; i<depth; i++) result = escape(result);
      return result;
    };
    return res.end(JSON.stringify({id,case_number:'합성 사건',court:'합성 법원',title:'법령 인용 회귀 검증',decision_date:'2026-10-01',case_type:null,verdict_type:null,keywords_matched:[],summary:annotate('요약 근로기준법 제23조'),holding_points:annotate('상세 근로기준법 제23조 제1항')+' 그 법률관계가 위와 같이 <law_cite ref="파',law_references:annotate('근로기준법 제23조 제1항')+'<script>window.__annotationExecuted=true</script>',url:null,original_url:null}));
  }
  if(url.pathname==='/rest/v1/nlrc_decisions') {
    let selected;try { selected=selectRows(rows,url.searchParams); } catch {res.statusCode=400;return res.end('{}');}
    res.setHeader('Content-Range',`${selected.offset}-${Math.max(selected.offset,selected.offset+selected.rows.length-1)}/${selected.count}`);
    if(req.headers.accept?.includes('application/vnd.pgrst.object+json')) {
      if(selected.rows.length!==1){res.statusCode=406;return res.end(JSON.stringify({code:'PGRST116'}));}
      return res.end(JSON.stringify(selected.rows[0]));
    }
    return res.end(req.method==='HEAD'?'':JSON.stringify(selected.rows));
  }
  res.statusCode=404;res.end('{}');
}).listen(4319,'127.0.0.1');
