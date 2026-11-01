import {firestoreEnabled} from '../../../lib/firestore-hotel';
import {firestoreApi} from '../../../lib/firestore-api';
import {env} from 'cloudflare:workers';import {z} from 'zod';
import {requireAccess,json,failure,readBody,HttpError,audit} from '../../../lib/access';
import {can} from '../../../lib/permissions';import {getRooms} from '../../../lib/room-data';
import {today,nights,type Reservation} from '../../../lib/hotel';
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>!isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s,'Invalid date');
const schema=z.object({id:z.string().optional(),version:z.number().int().optional(),guest:z.string().trim().min(2).max(100),email:z.string().email().max(254),phone:z.string().max(30).default(''),room:z.string(),checkIn:date,checkOut:date,guests:z.number().int().min(1).max(4),notes:z.string().max(1000).default(''),status:z.enum(['confirmed','checked-in','checked-out','cancelled']).default('confirmed')});
const projection='id,guest,email,phone,room,check_in AS checkIn,check_out AS checkOut,guests,status,total,notes,created_at AS createdAt,version';
async function legacyGET(req:Request){try{const u=await requireAccess();const admin=new URL(req.url).searchParams.get('scope')==='hotel';if(admin&&!can(u.role,'bookings.read'))throw new HttpError(403,'Booking access is restricted.');const rows=await env.DB!.prepare('SELECT '+projection+' FROM reservations'+(admin?'':' WHERE owner=?')+' ORDER BY created_at DESC').bind(...(admin?[]:[u.userId])).all();return json({reservations:rows.results});}catch(e){return failure(e);}}
async function save(req:Request,update:boolean){try{
 const u=await requireAccess(update?'bookings.write':undefined);const b=schema.parse(await readBody(req));const duration=nights(b.checkIn,b.checkOut),room=(await getRooms()).find(r=>r.id===b.room);
 if(!room||b.guests>room.capacity)throw new HttpError(400,'Choose a room with enough guest capacity.');
 if(duration<1||duration>30)throw new HttpError(400,'A stay must be between 1 and 30 nights.');
 const staff=can(u.role,'bookings.write');if(!update&&b.status!=='confirmed')throw new HttpError(400,'New bookings must be confirmed.');
 if(!staff)b.email=u.email;
 const id=b.id||crypto.randomUUID();let total=room.rate*duration;let statement;
 if(update){
 const old=await env.DB!.prepare('SELECT '+projection+' FROM reservations WHERE id=?').bind(id).first<Reservation>();
 if(!old)throw new HttpError(404,'Reservation not found.');
 if(b.version===undefined||b.version!==old.version)throw new HttpError(409,'This reservation has changed. Refresh before editing.');
 if(['cancelled','checked-out'].includes(old.status))throw new HttpError(400,'Completed reservations are read-only.');
 const transitions:Record<string,string[]>={confirmed:['confirmed','checked-in','cancelled'],'checked-in':['checked-in','checked-out']};
 if(!transitions[old.status]?.includes(b.status))throw new HttpError(400,'Invalid reservation status change.');
 if(b.checkIn<today()&&b.checkIn!==old.checkIn)throw new HttpError(400,'Check-in cannot be moved into the past.');
 if(b.status==='checked-in'&&(b.checkIn>today()||b.checkOut<=today()))throw new HttpError(400,'Check-in is available only during the booked stay.');
 if(old.status==='checked-in'&&(b.room!==old.room||b.checkIn!==old.checkIn))throw new HttpError(400,'A checked-in guest cannot change room or arrival date.');
 if(b.room===old.room&&b.checkIn===old.checkIn&&b.checkOut===old.checkOut)total=old.total;
 const paid=await env.DB!.prepare('SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE booking_id=?').bind(id).first<{total:number}>();
 if((paid?.total||0)>total)throw new HttpError(400,'The new total cannot be below recorded payments.');
 if(b.status==='cancelled'&&(paid?.total||0)>0)throw new HttpError(400,'This booking has recorded payments. A manager must resolve payment records before cancellation.');
 statement=env.DB!.prepare('UPDATE reservations SET guest=?,email=?,phone=?,room=?,check_in=?,check_out=?,guests=?,status=?,total=?,notes=?,version=version+1 WHERE id=? AND version=?').bind(b.guest,b.email,b.phone,b.room,b.checkIn,b.checkOut,b.guests,b.status,total,b.notes,id,b.version);
 }else{
 if(b.checkIn<today())throw new HttpError(400,'Check-in cannot be in the past.');
 statement=env.DB!.prepare('INSERT INTO reservations (id,owner,guest,email,phone,room,check_in,check_out,guests,status,total,notes,created_at,version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0)').bind(id,u.userId,b.guest,b.email,b.phone,b.room,b.checkIn,b.checkOut,b.guests,'confirmed',total,b.notes,new Date().toISOString());
 }
 const result=await env.DB!.batch([statement,audit(u.email,update?'reservation.updated':'reservation.created',id,b.status+' · Room '+b.room)]);
 if(update&&!result[0].meta.changes)throw new HttpError(409,'Reservation changed. Refresh and try again.');
 return json({id},update?200:201);
 }catch(e){if(e instanceof z.ZodError)return json({error:e.issues[0].message},400);return failure(e);}}
const legacyPOST=(r:Request)=>save(r,false);const legacyPUT=(r:Request)=>save(r,true);
async function legacyPATCH(req:Request){try{const u=await requireAccess();const b=z.object({id:z.string(),action:z.literal('cancel')}).strict().parse(await readBody(req));
 const old=await env.DB!.prepare('SELECT owner,status,check_in FROM reservations WHERE id=?').bind(b.id).first<{owner:string;status:string;check_in:string}>();
 if(!old||old.owner!==u.userId)throw new HttpError(404,'Reservation not found.');
 if(old.status!=='confirmed'||old.check_in<today())throw new HttpError(400,'Only upcoming confirmed bookings can be cancelled.');
 const result=await env.DB!.batch([env.DB!.prepare("UPDATE reservations SET status='cancelled',version=version+1 WHERE id=? AND owner=? AND status='confirmed' AND (SELECT COALESCE(SUM(amount),0) FROM payments WHERE booking_id=?)=0").bind(b.id,u.userId,b.id),audit(u.email,'reservation.cancelled',b.id)]);
 if(!result[0].meta.changes)throw new HttpError(409,'Booking changed or has recorded payments. Please contact the hotel.');
 return json({ok:true});}catch(e){if(e instanceof z.ZodError)return json({error:'Invalid cancellation request.'},400);return failure(e);}}
export async function GET(request:Request){return firestoreEnabled()?firestoreApi(request,'reservations'):legacyGET(request);}

export async function POST(request:Request){return firestoreEnabled()?firestoreApi(request,'reservations'):legacyPOST(request);}

export async function PUT(request:Request){return firestoreEnabled()?firestoreApi(request,'reservations'):legacyPUT(request);}

export async function PATCH(request:Request){return firestoreEnabled()?firestoreApi(request,'reservations'):legacyPATCH(request);}
