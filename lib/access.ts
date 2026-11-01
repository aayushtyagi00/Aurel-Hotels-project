import {env} from 'cloudflare:workers';
import {getHotelUser} from './auth';
import {getChatGPTUser} from '../app/chatgpt-auth';
import {can,type Permission,type Role} from './permissions';
export const OWNER_EMAIL=((env as typeof env & {HOTEL_OWNER_EMAIL?:string}).HOTEL_OWNER_EMAIL||'').trim().toLowerCase();
export async function identity(){
 const user=await getHotelUser();if(!user)return null;
 const email=user.email.trim().toLowerCase();
 // Link legacy records only when BOTH providers prove the same email.
 const legacy=await getChatGPTUser();
 if(legacy&&legacy.email.trim().toLowerCase()===email&&legacy.userId!==user.userId)await env.DB!.prepare('UPDATE reservations SET owner=? WHERE owner=?').bind(user.userId,legacy.userId).run();
 let role:Role|null=null;
 if(email===OWNER_EMAIL)role='owner';
 else{const row=await env.DB!.prepare('SELECT role FROM staff_access WHERE email=? AND active=1').bind(email).first<{role:Role}>();role=row?.role||null;}
 return {...user,email,role};
}
export class HttpError extends Error{constructor(public status:number,message:string){super(message);}}
export async function requireAccess(permission?:Permission){const user=await identity();if(!user)throw new HttpError(401,'Please sign in to continue.');if(permission&&!can(user.role,permission))throw new HttpError(403,'Your role does not have access to this action.');return user;}
export function json(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store'}});}
export function failure(e:unknown){if(String(e).includes('payment_booking_invalid'))return json({error:'This booking cannot receive payments.'},409);if(String(e).includes('booking_has_payments'))return json({error:'Refund the recorded balance before cancelling or reducing the booking total.'},409);if(e instanceof HttpError)return json({error:e.message},e.status);if(String(e).includes('room_unavailable'))return json({error:'This room is no longer available for those dates. Please select another room.'},409);if(String(e).includes('room_not_ready'))return json({error:'The room must be clean and open before check-in.'},409);if(String(e).includes('room_maintenance'))return json({error:'This room is closed for maintenance.'},409);if(String(e).includes('refund_exceeds_paid'))return json({error:'Refund exceeds the net payments recorded for this booking.'},409);if(String(e).includes('payment_exceeds_balance'))return json({error:'Amount exceeds the outstanding balance.'},409);return json({error:'The service could not complete your request. Please retry.'},503);}
export async function readBody(req:Request){const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)throw new HttpError(403,'Invalid request origin.');if(Number(req.headers.get('content-length')||0)>20000)throw new HttpError(413,'Request is too large.');try{return await req.json();}catch{throw new HttpError(400,'Invalid request data.');}}
export function audit(actor:string,action:string,entity:string,detail=''){return env.DB!.prepare('INSERT INTO activity (id,actor,action,entity,detail,created_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),actor,action,entity,detail,new Date().toISOString());}
export function validate<T>(schema:{safeParse:(v:unknown)=>{success:boolean;data?:T;error?:{issues:{message:string}[]}}},value:unknown):T{const p=schema.safeParse(value);if(!p.success)throw new HttpError(400,p.error?.issues[0]?.message||'Invalid input.');return p.data as T;}