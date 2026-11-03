import {getDocument,runTransaction} from './firestore-client';

// Some managed Worker hosts do not provision native ratelimit bindings. This
// shared, transactional fallback works across isolates and regions; an in-memory
// counter would reset on every cold start. Store a digest, never the raw IP.
export async function durableRequestAllowed(kind:'rooms'|'booking',ip:string,now=Date.now()){
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(kind+':'+ip));
 const key=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 const path='_rate_limits/'+key,window=Math.floor(now/60000),limit=kind==='rooms'?120:10;
 return runTransaction(async transaction=>{
  const old=await getDocument(path,transaction),count=old?.data.window===window?Number(old.data.count):0;
  if(!Number.isFinite(count)||count<0)throw new Error('Invalid request counter.');
  if(count>=limit)return{result:false,writes:[]};
  return{result:true,writes:[{path,exists:!!old,data:{window,count:count+1,expiresAt:new Date(now+2*86400000)}}]};
 });
}
