import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";
import {allowedOrigin} from '../lib/origins';
import {secureResponse} from '../lib/security';

const app = {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    const origin=request.headers.get('Origin');
    const cross=origin&&origin!==new URL(request.url).origin;
    if(request.method==='OPTIONS'&&cross){
      if(!allowedOrigin(origin!))return new Response(null,{status:403});
      return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin!,'Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Max-Age':'600','Vary':'Origin'}});
    }
    if((env as Cloudflare.Env & {HOTEL_READ_ONLY?:string}).HOTEL_READ_ONLY==='true'&&new URL(request.url).pathname.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(request.method)){
      return Response.json({error:'Hotel updates are briefly paused for a database upgrade. Please try again shortly.'},{status:503,headers:{'Cache-Control':'no-store',...(cross&&allowedOrigin(origin!)?{'Access-Control-Allow-Origin':origin!,'Vary':'Origin'}:{})}});
    }
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    const response=await runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx));
    if(cross&&allowedOrigin(origin!)){
      const result=new Response(response.body,response);result.headers.set('Access-Control-Allow-Origin',origin!);result.headers.append('Vary','Origin');return result;
    }
    return response;
  },
};

type Limiter={limit:(options:{key:string})=>Promise<{success:boolean}>};
const worker={
 async fetch(request:Request,env:Cloudflare.Env,ctx:ExecutionContext<{CONNECTORS?:ConnectorBinding}>){
  const path=new URL(request.url).pathname,origin=request.headers.get('Origin');
  const limited=request.method!=='OPTIONS'&&(path==='/api/rooms'||path==='/api/reservations'&&request.method==='POST');
  let response:Response;
  const bindings=env as Cloudflare.Env & {PUBLIC_API_LIMITER?:Limiter;BOOKING_LIMITER?:Limiter};
  const limiter=path==='/api/rooms'?bindings.PUBLIC_API_LIMITER:bindings.BOOKING_LIMITER;
  try{
  if(limited&&!limiter&&!import.meta.env.DEV){
   response=Response.json({error:'Request protection is unavailable. Please retry shortly.'},{status:503,headers:{'Cache-Control':'no-store'}});
  }else if(limited&&limiter&&!(await limiter.limit({key:request.headers.get('CF-Connecting-IP')||'unknown'})).success){
   response=Response.json({error:'Too many requests. Please try again shortly.'},{status:429,headers:{'Retry-After':'60','Cache-Control':'no-store'}});
  }else response=await app.fetch(request,env,ctx);
  }catch{response=Response.json({error:'The service could not complete your request. Please retry.'},{status:503,headers:{'Cache-Control':'no-store'}});}
  const result=secureResponse(response);
  if(origin&&allowedOrigin(origin)){result.headers.set('Access-Control-Allow-Origin',origin);if(!result.headers.get('Vary')?.includes('Origin'))result.headers.append('Vary','Origin');}
  return result;
 }
};

export default worker;
