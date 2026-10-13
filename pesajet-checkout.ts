import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { PesaJet } from "npm:@pesajet/sdk@1.0.3";
const URL=Deno.env.get('SUPABASE_URL')!;
const ANON=Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const API_KEY=Deno.env.get('PESAJET_API_KEY')!;
const gateway=new PesaJet({apiKey:API_KEY});
const admin=createClient(URL,SERVICE,{auth:{persistSession:false}});
const cors={'Access-Control-Allow-Origin':Deno.env.get('DRAWLAB_ORIGIN')||'https://example.invalid','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{...cors,'Content-Type':'application/json'}});
serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 try{
  const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
  const auth=createClient(URL,ANON,{auth:{persistSession:false}});
  const {data:{user},error:authError}=await auth.auth.getUser(token);
  if(authError||!user)return json({error:'Authentication required'},401);
  const body=await req.json();
  if(body.action==='status'){
   const {data:o,error}=await admin.from('orders').select('id,status').eq('id',body.order_id).eq('buyer_id',user.id).single();
   if(error||!o)return json({error:'Order not found'},404);
   return json({order_id:o.id,status:o.status});
  }
  if(body.action!=='create')return json({error:'Unknown action'},400);
  const phone=String(body.phone||'').trim(),provider=String(body.provider||'');
  if(!/^\+2567[0-9]{8}$/.test(phone)||!['mtn','airtel'].includes(provider))return json({error:'Invalid phone or provider'},400);
  const tip=body.tip_id||null,league=body.league_id||null;
  if(Boolean(tip)===Boolean(league))return json({error:'Choose exactly one item'},400);
  // SECURITY: the SQL function computes the amount from the current product price.
  const buyer=createClient(URL,ANON,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false}});
  const {data:orderId,error:orderError}=await buyer.rpc('request_purchase',{p_tip:tip,p_league:league});
  if(orderError)return json({error:orderError.message},400);
  const {data:order,error:readError}=await admin.from('orders').select('*').eq('id',orderId).eq('buyer_id',user.id).single();
  if(readError||!order)return json({error:'Order not found'},404);
  if(order.status==='paid')return json({order_id:order.id,status:'paid'});
  if(order.status!=='pending')return json({error:'Order is not payable'},409);
  const {data:prior}=await admin.from('pesajet_transactions').select('reference,status').eq('order_id',order.id).eq('status','pending').limit(1);
  if(prior?.length)return json({order_id:order.id,status:'pending',message:'Existing payment request is pending; check its status.'});
  const reference='DL-'+crypto.randomUUID();
  const {error:insertError}=await admin.from('pesajet_transactions').insert({order_id:order.id,provider,phone_last4:phone.slice(-4),reference});
  if(insertError)throw insertError;
  try{
   const payment=await gateway.payments.create({amount:order.amount_ugx,currency:'UGX',phoneNumber:phone,provider,reference,description:'DrawLab premium prediction'});
   const transactionId=String(payment.transactionId||'');
   if(transactionId)await admin.from('pesajet_transactions').update({transaction_id:transactionId}).eq('reference',reference);
   return json({order_id:order.id,status:'pending',reference});
  }catch(e){await admin.from('pesajet_transactions').update({status:'failed'}).eq('reference',reference);throw e;}
 }catch(e){console.error('PesaJet checkout error',e);return json({error:'Unable to process payment. Please retry or contact support.'},500)}
});
