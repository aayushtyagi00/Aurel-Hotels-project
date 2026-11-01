// The Firebase static client supplies a Clerk token; the same-origin Worker
// frontend continues to use its secure session cookie.
let tokenProvider:(()=>Promise<string|null>)|undefined;
let backend='';
export function configureApi(origin:string,provider:()=>Promise<string|null>){backend=origin.replace(/\/$/,'');tokenProvider=provider;}
export async function apiFetch(path:string,options:RequestInit={}){
 const headers=new Headers(options.headers);const token=await tokenProvider?.();
 if(token)headers.set('Authorization','Bearer '+token);
 return fetch(backend+path,{...options,headers,credentials:backend?'omit':'same-origin'});
}
