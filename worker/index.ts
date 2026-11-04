import {firestoreApi} from '../lib/firestore-api';
import {GET as session} from '../app/api/session/route';
import {runWithHotelRequest} from '../lib/auth';
import {allowedOrigin} from '../lib/origins';
import {secureResponse} from '../lib/security';
import {durableRequestAllowed} from '../lib/request-rate';

type Limiter={limit:(options:{key:string})=>Promise<{success:boolean}>};
type Env=Cloudflare.Env & {PUBLIC_API_LIMITER?:Limiter;BOOKING_LIMITER?:Limiter;HOTEL_READ_ONLY?:string;FIRESTORE_SERVICE_ACCOUNT_JSON?:string;HOTEL_OWNER_EMAIL?:string};
const routes:Record<string,{resource:string;methods:string[]}>= {
 '/api/rooms':{resource:'rooms',methods:['GET']},
 '/api/reservations':{resource:'reservations',methods:['GET','POST','PUT','PATCH']},
 '/api/admin/catalog':{resource:'catalog',methods:['POST','PUT','DELETE']},
 '/api/admin/staff':{resource:'staff',methods:['GET','PUT']},
 '/api/admin/rooms':{resource:'roomstate',methods:['GET','PUT']},
 '/api/admin/tasks':{resource:'tasks',methods:['GET','POST']},
 '/api/admin/payments':{resource:'payments',methods:['GET','POST']},
 '/api/admin/activity':{resource:'activity',methods:['GET']},
 '/api/admin/reports/summary':{resource:'report',methods:['GET']},
 '/api/admin/reports/reservations.csv':{resource:'export',methods:['GET']},
};
const noStore={'Cache-Control':'no-store'};
async function handle(request:Request,env:Env){
 const path=new URL(request.url).pathname,origin=request.headers.get('Origin');
 if(request.method==='OPTIONS'){
  if(!origin||!allowedOrigin(origin))return new Response(null,{status:403});
  return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Max-Age':'600','Access-Control-Expose-Headers':'X-Next-Cursor','Vary':'Origin'}});
 }
 if(path==='/')return Response.redirect('https://aurel-hotels.web.app/',302);
 if(path==='/api/health'&&request.method==='GET'){
  const ready=!!env.FIRESTORE_SERVICE_ACCOUNT_JSON&&!!env.HOTEL_OWNER_EMAIL;
  return Response.json({status:ready?'ok':'not-configured'},{status:ready?200:503,headers:noStore});
 }
 const route=routes[path];
 if(path!=='/api/session'&&!route)return Response.json({error:'Not found.'},{status:404,headers:noStore});
 const methods=route?.methods||['GET'];
 if(!methods.includes(request.method))return Response.json({error:'Method not allowed.'},{status:405,headers:{...noStore,Allow:methods.join(', ')}});
 const limited=path==='/api/rooms'||path==='/api/reservations'&&request.method==='POST';
 const limiter=path==='/api/rooms'?env.PUBLIC_API_LIMITER:env.BOOKING_LIMITER;
 if(limited){
  const ip=request.headers.get('CF-Connecting-IP')||'unknown';
  const allowed=limiter?(await limiter.limit({key:ip})).success:await durableRequestAllowed(path==='/api/rooms'?'rooms':'booking',ip);
  if(!allowed)return Response.json({error:'Too many requests. Please try again shortly.'},{status:429,headers:{...noStore,'Retry-After':'60'}});
 }
 if(env.HOTEL_READ_ONLY==='true'&&!['GET','HEAD'].includes(request.method))return Response.json({error:'Hotel updates are briefly paused. Please try again shortly.'},{status:503,headers:noStore});
 return runWithHotelRequest(request,()=>path==='/api/session'?session():firestoreApi(request,route.resource));
}
const worker={
 async fetch(request:Request,env:Env){
  let response:Response;
  try{response=await handle(request,env);}catch{response=Response.json({error:'The service could not complete your request. Please retry.'},{status:503,headers:noStore});}
  const result=secureResponse(response),origin=request.headers.get('Origin');
  if(origin&&allowedOrigin(origin)){result.headers.set('Access-Control-Allow-Origin',origin);result.headers.set('Access-Control-Expose-Headers','X-Next-Cursor');if(!result.headers.get('Vary')?.includes('Origin'))result.headers.append('Vary','Origin');}
  return result;
 }
};
export default worker;
