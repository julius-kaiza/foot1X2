// Foot1X2 dual-provider Edge Function. Deploy as `football-fixtures`.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
const cache = new Map<string,{expires:number,data:any}>();
const send=(data:any,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'private, max-age=60'}});
const slug=(s:string)=>s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const normStatus=(s:any)=>{const v=String(s||'').toUpperCase();return ['FT','FINISHED','FULL TIME','FULL_TIME','COMPLETED'].includes(v)?'FINISHED':['NS','NOT STARTED','SCHEDULED','UPCOMING','TIMED'].includes(v)?'SCHEDULED':v.includes('POSTPON')?'POSTPONED':v.includes('CANCEL')?'CANCELLED':v||'SCHEDULED'};
async function jsonFetch(url:string,headers:Record<string,string>,ttl=120000){const key=url+'|'+Object.keys(headers).join(',');const found=cache.get(key);if(found&&found.expires>Date.now())return found.data;const r=await fetch(url,{headers,signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error(`Provider HTTP ${r.status}${r.status===429?' (rate limit)':''}`);const j=await r.json();if(j?.success===false)throw Error('Provider reported unsuccessful response');cache.set(key,{expires:Date.now()+ttl,data:j});return j;}
const sportHeaders=(key:string)=>({'X-Api-Key':key,'Accept':'application/json'});
function sportMatches(p:any){const items=Array.isArray(p)?p:Array.isArray(p?.fixtures)?p.fixtures:Array.isArray(p?.data)?p.data:[];return items.map((m:any)=>({id:'sport:'+String(m.id),utcDate:m.datetime||m.utcDate||m.date,status:normStatus(m.status),league:String(m.league?.name||m.league||m.competition?.name||'Unknown'),area:String(m.country?.name||m.country||''),homeTeam:{id:m.home_team_id||m.homeTeam?.id||null,name:String(m.home_team?.name||m.home_team||m.homeTeam?.name||'Home')},awayTeam:{id:m.away_team_id||m.awayTeam?.id||null,name:String(m.away_team?.name||m.away_team||m.awayTeam?.name||'Away')},score:{fullTime:{home:m.home_score??m.score?.fullTime?.home??null,away:m.away_score??m.score?.fullTime?.away??null}}})).filter((m:any)=>m.utcDate&&m.league!=='Unknown');}
async function sportDay(day:string,key:string){return sportMatches(await jsonFetch('https://sportapi.ai/api/fixtures?date='+day,sportHeaders(key),5*60_000));}
const iso=(d:Date)=>d.toISOString().slice(0,10);
async function sportRange(key:string,days:number){const result:any[]=[];const start=new Date();start.setUTCHours(12,0,0,0);for(let i=-2;i<=days;i++){const d=new Date(start.getTime()+i*86400000);try{result.push(...await sportDay(iso(d),key));}catch(e){if(!result.length&&i===days)throw e;}}return result;}
async function footballData(token:string,code:string){const j=await jsonFetch('https://api.football-data.org/v4/competitions/'+encodeURIComponent(code)+'/matches',{'X-Auth-Token':token,'Accept':'application/json'},10*60_000);return {competition:j.competition,matches:(j.matches||[]).map((m:any)=>({id:'fd:'+m.id,utcDate:m.utcDate,status:m.status,homeTeam:{id:m.homeTeam?.id,name:m.homeTeam?.name},awayTeam:{id:m.awayTeam?.id,name:m.awayTeam?.name},score:{fullTime:{home:m.score?.fullTime?.home??null,away:m.score?.fullTime?.away??null}}}))};}
Deno.serve(async(req)=>{if(req.method==='OPTIONS')return new Response('ok',{headers:cors});if(req.method==='POST'){
  // Machine-only synchronization: caller must present a dedicated random secret.
  const syncSecret=Deno.env.get('FOOTBALL_SYNC_SECRET');
  const supplied=req.headers.get('x-football-sync-secret');
  if(!syncSecret||!supplied||supplied!==syncSecret)return send({error:'Unauthorized sync request'},401);
  const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const base=Deno.env.get('SUPABASE_URL');
  if(!service||!base)return send({error:'SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL missing'},503);
  const db=createClient(base,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const fd=Deno.env.get('FOOTBALL_DATA_TOKEN'),sport=Deno.env.get('SPORTAPI_KEY');
  if(!fd&&!sport)return send({error:'No provider credentials configured'},503);
  const summary:{providers:Record<string,unknown>,errors:string[]}={providers:{},errors:[]};
  async function store(provider:string,code:string,league:string,area:string,matches:any[]){
    const {error:ce}=await db.from('football_competitions').upsert({provider,provider_code:code,name:league,area,updated_at:new Date().toISOString()},{onConflict:'provider,provider_code'});
    if(ce)throw Error('Competitions upsert: '+ce.message);
    const rows=matches.filter(m=>m.id&&m.utcDate&&!Number.isNaN(Date.parse(m.utcDate))).map(m=>({provider,provider_match_id:String(m.id),provider_code:code,league_name:league,utc_date:m.utcDate,status:normStatus(m.status),home_team_id:m.homeTeam?.id==null?null:String(m.homeTeam.id),away_team_id:m.awayTeam?.id==null?null:String(m.awayTeam.id),home_team_name:String(m.homeTeam?.name||'Home'),away_team_name:String(m.awayTeam?.name||'Away'),home_score:m.score?.fullTime?.home??null,away_score:m.score?.fullTime?.away??null,updated_at:new Date().toISOString()}));
    for(let i=0;i<rows.length;i+=300){const {error:me}=await db.from('football_matches').upsert(rows.slice(i,i+300),{onConflict:'provider,provider_match_id'});if(me)throw Error('Matches upsert: '+me.message)}
    return rows.length;
  }
  if(fd){
    try{
      const listing=await jsonFetch('https://api.football-data.org/v4/competitions',{'X-Auth-Token':fd},15*60_000);
      const codes=(listing.competitions||[]).filter((c:any)=>c.code).slice(0,12);
      let count=0;
      for(const c of codes){try{const result=await footballData(fd,c.code);count+=await store('football-data.org',c.code,c.name,c.area?.name||'',result.matches)}catch(e){summary.errors.push('football-data.org '+c.code+': '+String(e))}}
      summary.providers['football-data.org']={leagues:codes.length,matches:count};
    }catch(e){summary.errors.push('football-data.org: '+String(e))}
  }
  if(sport){
    try{
      // Deliberately only three days per run, to avoid exhausting free daily quota.
      const today=new Date();today.setUTCHours(12,0,0,0);let count=0,leagues=0;
      const grouped=new Map<string,{name:string,area:string,matches:any[]}>();
      for(const offset of [-1,0,1]){
        const date=iso(new Date(today.getTime()+offset*86400000));
        try{for(const m of await sportDay(date,sport)){
          const code='sport:'+slug(m.league);
          const g=grouped.get(code)||{name:m.league,area:m.area,matches:[]};g.matches.push(m);grouped.set(code,g);
        }}catch(e){summary.errors.push('SportAPI.ai '+date+': '+String(e))}
      }
      for(const [code,g] of grouped){try{count+=await store('SportAPI.ai',code,g.name,g.area,g.matches);leagues++}catch(e){summary.errors.push('SportAPI.ai '+code+': '+String(e))}}
      summary.providers['SportAPI.ai']={leagues,matches:count};
    }catch(e){summary.errors.push('SportAPI.ai: '+String(e))}
  }
  console.info('Football sync completed',JSON.stringify(summary));
  return send({ok:Object.keys(summary.providers).length>0,...summary},summary.errors.length&&Object.keys(summary.providers).length===0?502:200);
}
if(req.method!=='GET')return send({error:'Method not allowed'},405);
const jwt=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');if(!jwt)return send({error:'Authentication required'},401);
const url=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY')||Deno.env.get('SUPABASE_PUBLISHABLE_KEY');if(!url||!anon)return send({error:'Supabase configuration missing'},503);
const sb=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});const {data:{user},error}=await sb.auth.getUser(jwt);if(error||!user)return send({error:'Invalid login'},401);
const q=new URL(req.url).searchParams, code=q.get('competition')||'PL', discovery=q.get('action')==='competitions';
// Prefer durable cache. Service role key never leaves this Edge Function.
const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if(serviceKey){
 const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 if(discovery){
  const {data,error}=await db.from('football_competitions').select('provider,provider_code,name,area').order('name').limit(1500);
  if(!error&&data?.length)return send({competitions:data.map((c:any)=>({code:c.provider_code,name:c.name,area:c.area,provider:c.provider})),source:'database'});
 }else{
  const provider=code.startsWith('sport:')?'SportAPI.ai':'football-data.org';
  const {data,error}=await db.from('football_matches').select('*').eq('provider',provider).eq('provider_code',code).order('utc_date',{ascending:false}).limit(1500);
  if(!error&&data?.length){
   const matches=data.map((m:any)=>({id:m.provider_match_id,utcDate:m.utc_date,status:m.status,homeTeam:{id:m.home_team_id,name:m.home_team_name},awayTeam:{id:m.away_team_id,name:m.away_team_name},score:{fullTime:{home:m.home_score,away:m.away_score}}}));
   return send({provider,competition:{name:data[0].league_name},matches,source:'database',fetchedAt:new Date().toISOString()});
  }
 }
}
const fd=Deno.env.get('FOOTBALL_DATA_TOKEN'),sport=Deno.env.get('SPORTAPI_KEY');if(!fd&&!sport)return send({error:'Configure FOOTBALL_DATA_TOKEN or SPORTAPI_KEY in Edge Function secrets'},503);
try{
if(discovery){const competitions:any[]=[];if(fd){try{const p=await jsonFetch('https://api.football-data.org/v4/competitions',{'X-Auth-Token':fd},60*60_000);for(const c of p.competitions||[])if(c.code)competitions.push({code:c.code,name:c.name,area:c.area?.name||'',provider:'football-data.org'});}catch(e){console.warn('football-data discovery failed',String(e));}}
if(sport){try{const matches=await sportRange(sport,7),seen=new Set<string>();for(const m of matches){const s=slug(m.league);if(!seen.has(s)){seen.add(s);competitions.push({code:'sport:'+s,name:m.league,area:m.area,provider:'SportAPI.ai'});}}}catch(e){console.warn('SportAPI discovery failed',String(e));}}
if(!competitions.length)return send({error:'Neither provider returned accessible competitions. Check keys and Edge Function logs.'},502);return send({competitions});}
if(code.startsWith('sport:')){if(!sport)return send({error:'SPORTAPI_KEY not configured'},503);const matches=(await sportRange(sport,14)).filter((m:any)=>slug(m.league)===code.slice(6));return send({provider:'SportAPI.ai',fetchedAt:new Date().toISOString(),competition:{name:matches[0]?.league||code},matches});}
if(!/^[A-Z0-9]{2,8}$/.test(code))return send({error:'Invalid competition code'},400);
if(fd){try{const p=await footballData(fd,code);return send({provider:'football-data.org',fetchedAt:new Date().toISOString(),...p});}catch(e){console.warn('football-data fetch failed',String(e));if(!sport)return send({error:String(e)},502);}}
// Fallback by competition name is unsafe without a verified mapping. Return an explicit error.
return send({error:'Competition '+code+' is unavailable from football-data.org. Select a SportAPI.ai league from Refresh Leagues.'},502);
}catch(e){console.error('Football function failed',e);return send({error:'Football providers unavailable: '+String(e)},502);}
});
