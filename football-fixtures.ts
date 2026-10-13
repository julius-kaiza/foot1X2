import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
const validCode = (v:string)=>/^[A-Z0-9]{2,8}$/.test(v);
Deno.serve(async req => {
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json'}});
  if(req.method!=='GET')return respond({error:'Method not allowed'},405);
  const params=new URL(req.url).searchParams;
  const code=params.get('competition')||'PL';
  const discovery=params.get('action')==='competitions';
  if(!discovery&&!validCode(code))return respond({error:'Invalid competition code'},400);
  const jwt=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');
  if(!jwt)return respond({error:'Authentication required'},401);
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_ANON_KEY')||Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  if(!url||!key)return respond({error:'Supabase environment not configured'},500);
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error}=await sb.auth.getUser(jwt);
  if(error||!user)return respond({error:'Invalid or expired login'},401);
  const token=Deno.env.get('FOOTBALL_DATA_TOKEN');
  if(!token)return respond({error:'FOOTBALL_DATA_TOKEN secret not configured'},503);
  try{
    const endpoint=discovery?'https://api.football-data.org/v4/competitions':'https://api.football-data.org/v4/competitions/'+code+'/matches';
    const response=await fetch(endpoint,{headers:{'X-Auth-Token':token,'Accept':'application/json'},signal:AbortSignal.timeout(15000)});
    if(!response.ok){const errorMessage=response.status===429?'Football provider rate limit reached':response.status===403?'Competition unavailable on API plan':'Football provider returned '+response.status;return respond({error:errorMessage},response.status===429?429:502)}
    const payload=await response.json();
    if(discovery)return respond({competitions:(payload.competitions||[]).filter((c:any)=>c.code).map((c:any)=>({code:c.code,name:c.name,area:c.area?.name||''}))});
    return respond({provider:'football-data.org',fetchedAt:new Date().toISOString(),competition:payload.competition,matches:(payload.matches||[]).map((m:any)=>({id:m.id,utcDate:m.utcDate,status:m.status,homeTeam:{id:m.homeTeam?.id,name:m.homeTeam?.name},awayTeam:{id:m.awayTeam?.id,name:m.awayTeam?.name},score:{fullTime:{home:m.score?.fullTime?.home??null,away:m.score?.fullTime?.away??null}}}))});
  }catch(e){return respond({error:'Provider request failed: '+(e instanceof Error?e.message:'unknown error')},502)}
});
