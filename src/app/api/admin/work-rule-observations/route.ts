import { createClient } from '@supabase/supabase-js';
import { validObservation, validReview } from '@/lib/laws/observation-contract';
import { observationId, sameObservation } from '@/lib/laws/observation-payload';
import { MATCHER_VERSION, RULE_VERSION } from '@/lib/laws/observation-version';
const TABLE = 'work_rule_observations_v1';
const columns='id,created_at,run_id,period_from,period_to,rule_id,standard_article_id,candidate_clause_ids,selected_clause_ids,verdict,reason,missing_count,stale_count,user_false_positive,review_state,matcher_version,rule_version';
function auth(req: Request) {
 // Same existing admin token/header, but fail closed even in development.
 const token=process.env.ADMIN_TOKEN;
 if (!token) return Response.json({error:'admin_unconfigured'}, {status:503});
 if (req.headers.get('x-admin-token')!==token) return Response.json({error:'unauthorized'}, {status:401});
 return null;
}
function db() {
 if (process.env.WORK_RULE_OBSERVATIONS_ENABLED!=='1' || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
 try {
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if(url.protocol!=='https:' || url.hostname!=='mewqgevgdgghhatqtuos.supabase.co')return null;
 } catch {return null;}
 return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
}
const unavailable=()=>Response.json({error:'observations_unavailable',active:false},{status:503,headers:{'Cache-Control':'no-store'}});
export async function GET(req:Request) {
 const denied=auth(req);if(denied)return denied;
 const client=db();if(!client)return unavailable();
 try {
  const readiness=new URL(req.url).searchParams.get('readiness')==='1';
  const query=client.from(TABLE).select(columns);
  const {data,error}=readiness ? await query.limit(0) : await query.order('created_at',{ascending:false}).limit(100);
  if(error)return unavailable();
  return Response.json(readiness ? {active:true} : {records:data??[],active:true},{headers:{'Cache-Control':'no-store'}});
 } catch {return unavailable();}
}
export async function POST(req:Request) {
 const denied=auth(req);if(denied)return denied;
 if(Number(req.headers.get('content-length'))>8192)return Response.json({error:'payload_too_large'},{status:413});
 let x:unknown;
 try {const raw=await req.text();if(raw.length>8192)return Response.json({error:'payload_too_large'},{status:413});x=JSON.parse(raw);} catch{return Response.json({error:'invalid_payload'},{status:400});}
 if(!validObservation(x))return Response.json({error:'invalid_metadata'},{status:400});
 if(x.id!==await observationId(x,x.standard_article_id,x.rule_id))return Response.json({error:'invalid_identity'},{status:400});
 const client=db();if(!client)return unavailable();
 try {
  const {error}=await client.from(TABLE).upsert({...x,matcher_version:MATCHER_VERSION,rule_version:RULE_VERSION,review_state:'unreviewed'}, {onConflict:'id',ignoreDuplicates:true});
  if(error)return unavailable();
  // Readback required; never report success solely on attempted write.
  const {data,error:readError}=await client.from(TABLE).select(columns).eq('id',x.id).single();
  if(readError||!data)return unavailable();
  if(!sameObservation(x,data)) return Response.json({error:'idempotency_conflict',active:false},{status:409,headers:{'Cache-Control':'no-store'}});
  return Response.json({record:data,active:true},{status:201,headers:{'Cache-Control':'no-store'}});
 } catch{return unavailable();}
}
export async function PATCH(req:Request) {
 const denied=auth(req);if(denied)return denied;
 let x:unknown;try{const raw=await req.text();if(raw.length>1024)return Response.json({error:'invalid_metadata'},{status:400});x=JSON.parse(raw);}catch{return Response.json({error:'invalid_payload'},{status:400});}
 if(!validReview(x))return Response.json({error:'invalid_metadata'},{status:400});
 const client=db();if(!client)return unavailable();
 try {
  const {data,error}=await client.from(TABLE).update({review_state:x.review_state}).eq('id',x.id).select(columns).single();
  if(error||!data)return unavailable();
  return Response.json({record:data},{headers:{'Cache-Control':'no-store'}});
 } catch{return unavailable();}
}
