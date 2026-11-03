// A signed JWT alone cannot detect account disablement or refresh-token
// revocation. Lookup checks current Firebase state on every authenticated request.
export async function firebaseSessionActive(token:string,userId:string,email:string,authTime:number,apiKey:string){
 const response=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+encodeURIComponent(apiKey),{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token}),signal:AbortSignal.timeout(8000),
 });
 if(!response.ok)return false;
 const body=await response.json() as {users?:{localId?:string;email?:string;emailVerified?:boolean;disabled?:boolean;validSince?:string}[]};
 const account=body.users?.find(u=>u.localId===userId),validSince=Number(account?.validSince);
 return !!account&&!account.disabled&&account.emailVerified===true&&account.email?.trim().toLowerCase()===email&&Number.isFinite(validSince)&&authTime>=validSince;
}
