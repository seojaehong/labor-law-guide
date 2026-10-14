// Strict subset of read-only PostgREST used by local fixtures, not a SQL emulator.
function likeRegex(pattern) {
  let source='^';
  for(let i=0;i<pattern.length;i++) {
    let c=pattern[i];
    if(c==='\\') { c=pattern[++i]; if(c===undefined)throw Error('Invalid LIKE escape'); }
    else if(c==='%'){source+='.*';continue;}
    else if(c==='_'){source+='.';continue;}
    source+=c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  }
  return new RegExp(source+'$','s');
}
export function selectRows(rows, params) {
  let selected=[...rows];
  for(const [key,value] of params) {
    if(['select','order','offset','limit'].includes(key))continue;
    if(value.startsWith('eq.'))selected=selected.filter(r=>String(r[key])===value.slice(3));
    else if(value.startsWith('neq.'))selected=selected.filter(r=>String(r[key])!==value.slice(4));
    else if(value==='not.is.null')selected=selected.filter(r=>r[key]!=null);
    else if(value==='not.is.true')selected=selected.filter(r=>r[key]!==true);
    else if(value.startsWith('gte.'))selected=selected.filter(r=>r[key]!=null&&Number(r[key])>=Number(value.slice(4)));
    else if(value.startsWith('like.')){const pattern=likeRegex(value.slice(5));selected=selected.filter(r=>r[key]!=null&&pattern.test(String(r[key])));}
    else if(value.startsWith('in.(')&&value.endsWith(')')){const ids=value.slice(4,-1).split(',').map(s=>s.replace(/^"|"$/g,''));selected=selected.filter(r=>ids.includes(String(r[key])));}
    else if(value.startsWith('cs.{')&&value.endsWith('}')){const values=value.slice(4,-1).split(',').map(s=>s.replaceAll('"',''));selected=selected.filter(r=>Array.isArray(r[key])&&values.every(v=>r[key].includes(v)));}
    else throw Error(`Unsupported fixture filter: ${key}`);
  }
  if(params.get('order'))selected.sort((a,b)=>{
    for(const part of params.get('order').split(',')){
      const [key,direction,nulls]=part.split('.');
      if(!['asc','desc'].includes(direction)||nulls&&!['nullslast','nullsfirst'].includes(nulls))throw Error('Unsupported order');
      if(a[key]==null||b[key]==null){if(a[key]==null&&b[key]==null)continue;const first=nulls==='nullsfirst'||(!nulls&&direction==='desc');return a[key]==null?(first?-1:1):(first?1:-1);}
      const c=String(a[key]).localeCompare(String(b[key]));if(c)return direction==='desc'?-c:c;
    }return 0;
  });
  const count=selected.length,offset=Number(params.get('offset')||0),limit=Number(params.get('limit')||count);
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<0)throw Error('Invalid fixture range');
  selected=selected.slice(offset,offset+limit);
  const projection=params.get('select');
  if(projection&&projection!=='*'){
    const keys=projection.split(',');if(keys.some(k=>!/^\w+$/.test(k)))throw Error('Unsupported projection');
    selected=selected.map(r=>Object.fromEntries(keys.map(k=>[k,r[k]??null])));
  }
  return {rows:selected,count,offset};
}
export function searchRows(rows, rpc, args) {
  const columns={search_nlrc:'id,case_number,title,department,decision_date,case_type,decision_result,reason_category,key_issue,holding_summary,holding_points,summary_short,url,original_url,relevance',search_cases:'id,case_number,court,title,decision_date,case_type,verdict_type,keywords_matched,summary,holding_points,law_references,url,original_url,relevance',search_admin:'id,title,doc_number,decision_date,keywords_matched,summary,holding_points,url,original_url,relevance'}[rpc];
  if(!columns)throw Error('Unknown fixture RPC');
  // Deterministic substring fixture semantics; does not assert PostgreSQL tokenization/rank.
  const query=String(args.query??'').toLowerCase();
  const found=rows.filter(r=>!query||[r.title,r.key_issue,r.summary,r.holding_summary,r.holding_points,r.case_number_qualified,r.case_number_real,r.case_number,r.doc_number,...(r.keywords_matched??[])].some(v=>typeof v==='string'&&v.toLowerCase().includes(query))).map(r=>({...r,case_number:rpc==='search_nlrc'?(r.case_number_qualified??r.case_number_real??r.case_number):r.case_number}));
  return selectRows(found,new URLSearchParams({select:columns,offset:String(args.page_offset??0),limit:String(args.result_limit??21)})).rows;
}
