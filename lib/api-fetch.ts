// Private API calls carry Firebase ID tokens. Public room searches skip auth.
let tokenProvider:(()=>Promise<string|null>)|undefined;
let backend='';
export function configureApi(origin:string|undefined,provider:()=>Promise<string|null>){backend=(origin||'').replace(/\/$/,'');tokenProvider=provider;}
export async function apiFetch(path:string,options:RequestInit={}){
 const headers=new Headers(options.headers);const token=path.startsWith('/api/rooms?')?null:await tokenProvider?.();
 if(token)headers.set('Authorization','Bearer '+token);
 return fetch(backend+path,{...options,headers,credentials:backend?'omit':'same-origin'});
}
