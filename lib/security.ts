// Keep response policy shared by the API and the Worker (including errors).
export const securityHeaders={
 'X-Frame-Options':'DENY',
 'X-Content-Type-Options':'nosniff',
 'Referrer-Policy':'strict-origin-when-cross-origin',
 'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
 // Firebase Google sign-in uses a popup/iframe on the auth domain.
 'Content-Security-Policy':"frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
};
export function secureResponse(response:Response){const result=new Response(response.body,response);for(const [key,value]of Object.entries(securityHeaders))result.headers.set(key,value);return result;}
export function csvCell(value:unknown){let text=String(value??'');if(/^[\s\u0000-\u001f]*[=+@-]/u.test(text)||/^[\t\r\n]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}
export function trustedImage(value:string){return /^\/images\/[a-zA-Z0-9_.-]+\.(webp|png|jpe?g)$/.test(value);}
export const safeImage=(value:string)=>trustedImage(value)?value:'/images/classic.webp';
