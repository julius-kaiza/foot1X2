import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { PesaJet } from "npm:@pesajet/sdk@1.0.3";
const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const gateway=new PesaJet({apiKey:Deno.env.get('PESAJET_API_KEY')!,webhookSecret:Deno.env.get('PESAJET_WEBHOOK_SECRET')!});
serve(async(req)=>{
 if(req.method!=='POST')return new Response('Method not allowed',{status:405});
 try{
  const signature=req.headers.get('x-webhook-signature');if(!signature)return new Response('Missing signature',{status:401});
  const raw=await req.text();
  // SDK verifies HMAC signature before parsing; NEVER trust browser-supplied payment status.
  if(!gateway.webhooks.verify(raw,signature))return new Response('Invalid signature',{status:401});
  const event=JSON.parse(raw);
  const reference=String(event.reference||event.metadata?.reference||'');
  const txId=String(event.transactionId||'');
  if(!reference&&!txId)return new Response('Missing reference',{status:400});
  const query=admin.from('pesajet_transactions').select('id,order_id,reference,transaction_id,status');
  const {data:transaction,error}=await (reference?query.eq('reference',reference):query.eq('transaction_id',txId)).maybeSingle();
  if(error)return new Response('Database error',{status:500});
  if(!transaction)return new Response('Unknown transaction',{status:404});
  if(transaction.transaction_id&&txId&&transaction.transaction_id!==txId)return new Response('Transaction mismatch',{status:409});
  const {data:order}=await admin.from('orders').select('id,amount_ugx,status').eq('id',transaction.order_id).single();
  if(!order)return new Response('Unknown order',{status:404});
  if(event.event==='payment.completed'){
   if(String(event.status||'').toUpperCase()!=='COMPLETED'&&String(event.status||'').toUpperCase()!=='SUCCESS')return new Response('Unexpected completion status',{status:400});
   if(Number(event.amount)!==Number(order.amount_ugx))return new Response('Amount mismatch',{status:409});
   if(event.currency&&event.currency!=='UGX')return new Response('Currency mismatch',{status:409});
   if(transaction.status==='failed')return new Response('Conflicting transaction state',{status:409});
   const {error:e1}=await admin.from('pesajet_transactions').update({status:'completed',transaction_id:txId||transaction.transaction_id,updated_at:new Date().toISOString()}).eq('id',transaction.id).in('status',['pending','completed']);
   if(e1)throw e1;
   const {error:e2}=await admin.from('orders').update({status:'paid',payment_reference:txId||reference}).eq('id',order.id).eq('status','pending');
   if(e2)throw e2;
  }else if(event.event==='payment.failed'){
   if(transaction.status==='completed')return new Response('Already completed',{status:200});
   await admin.from('pesajet_transactions').update({status:'failed',updated_at:new Date().toISOString()}).eq('id',transaction.id).eq('status','pending');
   // Leave the order pending so customer can retry with a new payment attempt.
  }
  return new Response('OK',{status:200});
 }catch(e){console.error('Webhook processing error',e);return new Response('Webhook processing failed',{status:500})}
});
