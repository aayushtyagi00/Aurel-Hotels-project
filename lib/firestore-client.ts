// Server-only Firestore transport for Cloudflare Workers (no browser credentials).
import {env} from 'cloudflare:workers';

type Config={FIRESTORE_PROJECT_ID?:string;FIRESTORE_DATABASE_ID?:string;FIRESTORE_SERVICE_ACCOUNT_JSON?:string;FIRESTORE_USE_METADATA?:string};
type Value={nullValue?:null;stringValue?:string;integerValue?:string;doubleValue?:number;booleanValue?:boolean;arrayValue?:{values?:Value[]};mapValue?:{fields?:Record<string,Value>};timestampValue?:string};
export type DocumentData=Record<string,unknown>;
type Document={name:string;fields?:Record<string,Value>;updateTime?:string};
export class FirestoreError extends Error{constructor(public status:number,public code:string){super('Firestore request failed: '+code);}}
let cachedToken:{value:string;expires:number;account:string}|undefined;
const encoder=new TextEncoder();
function base64url(bytes:Uint8Array){let text='';for(const byte of bytes)text+=String.fromCharCode(byte);return btoa(text).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
function config(){const c=env as typeof env & Config;return{project:c.FIRESTORE_PROJECT_ID||'aurel-hotels',database:c.FIRESTORE_DATABASE_ID||'aurel-hotel',account:c.FIRESTORE_SERVICE_ACCOUNT_JSON};}
async function bearer(){
 const {account}=config();
 // Google-managed runtimes can use their attached service identity, without a
 // downloadable private key. This branch must be explicitly enabled at runtime.
 if(!account&&(env as typeof env & Config).FIRESTORE_USE_METADATA==='true'){
  if(cachedToken?.account==='metadata'&&cachedToken.expires>Date.now()+60000)return cachedToken.value;
  const r=await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',{headers:{'Metadata-Flavor':'Google'},signal:AbortSignal.timeout(5000)});
  if(!r.ok)throw new Error('The attached Google server identity is unavailable.');
  const token=await r.json() as {access_token:string;expires_in:number};
  cachedToken={value:token.access_token,expires:Date.now()+token.expires_in*1000,account:'metadata'};return token.access_token;
 }
 if(!account)throw new Error('Firestore server credentials are not configured.');
 const a=JSON.parse(account) as {client_email:string;private_key:string;project_id:string};
 if(!a.client_email||!a.private_key||a.project_id!==config().project)throw new Error('Invalid Firestore service account configuration.');
 if(cachedToken&&cachedToken.account===a.client_email&&cachedToken.expires>Date.now()+60000)return cachedToken.value;
 const now=Math.floor(Date.now()/1000),head=base64url(encoder.encode(JSON.stringify({alg:'RS256',typ:'JWT'})));
 const body=base64url(encoder.encode(JSON.stringify({iss:a.client_email,scope:'https://www.googleapis.com/auth/datastore',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600})));
 const pem=a.private_key.replace(/-----[^-]+-----/g,'').replace(/\s/g,'');
 const bytes=Uint8Array.from(atob(pem),c=>c.charCodeAt(0));
 const key=await crypto.subtle.importKey('pkcs8',bytes,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,encoder.encode(head+'.'+body));
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:head+'.'+body+'.'+base64url(new Uint8Array(signature))}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('Firestore service account authentication failed.');
 const token=await response.json() as {access_token:string;expires_in:number};
 cachedToken={value:token.access_token,expires:Date.now()+token.expires_in*1000,account:a.client_email};return token.access_token;
}
export function encodeValue(value:unknown):Value{
 if(value===null)return{nullValue:null};if(typeof value==='string')return{stringValue:value};if(typeof value==='boolean')return{booleanValue:value};
 if(typeof value==='number'&&Number.isFinite(value))return Number.isInteger(value)?{integerValue:String(value)}:{doubleValue:value};
 if(Array.isArray(value))return{arrayValue:{values:value.map(encodeValue)}};
 if(typeof value==='object'&&value)return{mapValue:{fields:encodeFields(value as DocumentData)}};
 throw new Error('Unsupported Firestore field value.');
}
export function encodeFields(data:DocumentData){return Object.fromEntries(Object.entries(data).map(([k,v])=>[k,encodeValue(v)]));}
export function decodeValue(v:Value):unknown{
 if('nullValue'in v)return null;if('stringValue'in v)return v.stringValue;if('booleanValue'in v)return v.booleanValue;
 if('integerValue'in v)return Number(v.integerValue);if('doubleValue'in v)return v.doubleValue;if('timestampValue'in v)return v.timestampValue;
 if(v.arrayValue)return(v.arrayValue.values||[]).map(decodeValue);if(v.mapValue)return decodeFields(v.mapValue.fields||{});throw new Error('Unsupported Firestore response.');
}
export function decodeFields(fields:Record<string,Value>):DocumentData{return Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,decodeValue(v)]));}
function resource(){const c=config();return'projects/'+c.project+'/databases/'+c.database+'/documents';}
function docName(path:string){if(!/^[\w-]+\/[^/]+$/.test(path))throw new Error('Expected a collection/document path.');return resource()+'/'+path;}
async function request<T>(suffix:string,method='GET',body?:unknown):Promise<T>{
 const response=await fetch('https://firestore.googleapis.com/v1/'+resource()+suffix,{method,headers:{Authorization:'Bearer '+await bearer(),'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});
 const data=await response.json() as T & {error?:{status?:string}};if(!response.ok)throw new FirestoreError(response.status,data.error?.status||'UNKNOWN');return data;
}
export async function getDocument(path:string,transaction?:string){
 docName(path);const encodedPath=path.split('/').map(encodeURIComponent).join('/');try{const d=await request<Document>('/'+encodedPath+(transaction?'?transaction='+encodeURIComponent(transaction):''));return{data:decodeFields(d.fields||{}),updateTime:d.updateTime};}catch(e){if(e instanceof FirestoreError&&e.status===404)return null;throw e;}
}
// Structured queries are used here because these reads participate in native
// read-write transactions; no Firestore queries or aggregation run in a browser.
export async function queryDocuments(collection:string,query:Record<string,unknown>={},transaction?:string){
 if(!/^[\w-]+$/.test(collection))throw new Error('Invalid collection.');
 const rows=await request<{document?:Document}[]>(':runQuery','POST',{structuredQuery:{from:[{collectionId:collection}],...query},...(transaction?{transaction}:{})});
 return rows.filter(r=>r.document).map(r=>({path:r.document!.name.slice(resource().length+1),data:decodeFields(r.document!.fields||{}),updateTime:r.document!.updateTime}));
}
export type Write={path:string;exists?:boolean;updateTime?:string}&({data:DocumentData;delete?:false}|{delete:true;data?:never});
export async function commitDocuments(writes:Write[],transaction?:string){
 if(writes.length>400)throw new Error('Split large imports into batches of at most 400.');
 return request(':commit','POST',{writes:writes.map(w=>({...('delete'in w&&w.delete?{delete:docName(w.path)}:{update:{name:docName(w.path),fields:encodeFields(w.data!)}}),...(w.updateTime?{currentDocument:{updateTime:w.updateTime}}:w.exists!==undefined?{currentDocument:{exists:w.exists}}:{})})),...(transaction?{transaction}:{})});
}
export async function runTransaction<T>(work:(transaction:string)=>Promise<{result:T;writes:Write[]}>):Promise<T>{
 for(let attempt=0;attempt<5;attempt++){
  const {transaction}=await request<{transaction:string}>(':beginTransaction','POST',{options:{readWrite:{}}});
  try{const {result,writes}=await work(transaction);await commitDocuments(writes,transaction);return result;}
  catch(e){await request(':rollback','POST',{transaction}).catch(()=>{});if(e instanceof FirestoreError&&['ABORTED','FAILED_PRECONDITION'].includes(e.code)&&attempt<4)continue;throw e;}
 }
 throw new Error('Firestore transaction retry limit reached.');
}
