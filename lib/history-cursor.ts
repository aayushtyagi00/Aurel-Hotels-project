import {env} from 'cloudflare:workers';

// Encrypt positions: a filtered scan may end on another city's document, whose
// name/time must not leak through a readable continuation token. Derive a key
// from the existing server credential with a purpose-specific domain separator.
// No browser credential or additional production secret is required.
let cached:{credential:string;key:Promise<CryptoKey>}|undefined;
const encoder=new TextEncoder();
function key(){
 const credential=(env as typeof env & {FIRESTORE_SERVICE_ACCOUNT_JSON?:string;HOTEL_HISTORY_CURSOR_SECRET?:string}).HOTEL_HISTORY_CURSOR_SECRET||(env as typeof env & {FIRESTORE_SERVICE_ACCOUNT_JSON?:string}).FIRESTORE_SERVICE_ACCOUNT_JSON;
 if(!credential)throw new Error('History cursor encryption is not configured.');
 if(!cached||cached.credential!==credential)cached={credential,key:crypto.subtle.digest('SHA-256',encoder.encode('aurel/history-cursor/v1:'+credential)).then(hash=>crypto.subtle.importKey('raw',hash,'AES-GCM',false,['encrypt','decrypt']))};
 return cached.key;
}
export async function sealHistoryCursor(value:unknown,binding:string){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(binding)},await key(),encoder.encode(JSON.stringify(value))));
 const bytes=new Uint8Array(iv.length+ciphertext.length);bytes.set(iv);bytes.set(ciphertext,iv.length);
 return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
export async function openHistoryCursor(token:string,binding:string):Promise<unknown>{
 if(!/^[A-Za-z0-9_-]{20,5000}$/.test(token))throw new Error('Invalid cursor.');
 const bytes=Uint8Array.from(atob(token.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
 const text=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12),additionalData:encoder.encode(binding)},await key(),bytes.slice(12));
 return JSON.parse(new TextDecoder().decode(text));
}
