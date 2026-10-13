// Local-only deterministic PostgREST fixture. No production credentials or writes.
import http from 'node:http';
const reasons = ['sexual_harassment','workplace_bullying','violence','absence','embezzlement','incompetence','misconduct','redundancy','probation','transfer','contract_expiry','no_dismissal','union_activity','worker_status','discrimination','other'];
const rows = Array.from({length:45},(_,i)=>({id:`fixture-${String(i).padStart(3,'0')}`,title:`Fixture decision ${i}`,case_number:'old',case_number_real:`real-${i}`,case_number_qualified:`qualified-${i}`,key_issue:null,decision_date:i<40?'2026-01-01':null,decision_result:'granted',reason_category:reasons,is_non_labor:false,confidence_level:0.9}));
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
    return res.end(JSON.stringify(args.query==='empty'?[]:rows.slice(args.page_offset||0,(args.page_offset||0)+(args.result_limit||21))));
  }
  if(url.pathname==='/rest/v1/nlrc_decisions') {
    let selected=rows.filter(r=>url.searchParams.get('is_non_labor')!=='not.is.true'||!r.is_non_labor);
    const reason=url.searchParams.get('reason_category')?.match(/^cs\.\{(.+)\}$/)?.[1];
    if(reason) selected=selected.filter(r=>r.reason_category.includes(reason));
    if(url.searchParams.get('decision_date')==='not.is.null')selected=selected.filter(r=>r.decision_date!==null);
    if(url.searchParams.get('order')==='decision_date.desc.nullslast,id.asc') selected.sort((a,b)=>(b.decision_date||'').localeCompare(a.decision_date||'')||a.id.localeCompare(b.id));
    const count=selected.length, offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||count);
    res.setHeader('Content-Range',`${offset}-${Math.min(offset+limit,count)-1}/${count}`);
    return res.end(req.method==='HEAD'?'':JSON.stringify(selected.slice(offset,offset+limit)));
  }
  res.end('[]');
}).listen(4319,'127.0.0.1');
