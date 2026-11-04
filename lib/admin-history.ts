import {z} from 'zod';
import {aggregateDocuments,documentReference,getDocument,queryDocumentPage} from './firestore-client';
import {readHotel,hotelRooms,fieldFilter,mutateHotel,recordActivity} from './firestore-hotel';
import {requireAccess,HttpError,json,OWNER_EMAIL} from './access';
import {can} from './permissions';
import {staffScope,inCity,cityKey} from './city-access';
import {safeImage,csvCell} from './security';
import {addDays} from './hotel';
import {emptySummary} from './history-summary';
import {openHistoryCursor,sealHistoryCursor} from './history-cursor';

// History is scanned in bounded, deterministic pages. Authorization is evaluated
// afresh on EVERY request, before filtering, aggregating or exporting a page.
// Cursors are positions, never grants. They carry neither filters nor identity.
type Row=Record<string,unknown>;
const cursorSchema=z.object({at:z.string().max(100),snapshot:z.string().datetime({offset:true}),path:z.string().regex(/^(reservations|payments)\/[^/]{1,1500}$/)}).strict();
export async function adminHistory(req:Request,resource:'reservations'|'payments'|'report'|'export'){
 const user=await requireAccess(resource==='payments'?'payments.read':'bookings.read');
 if(resource==='report'&&!can(user.role,'payments.read'))throw new HttpError(403,'Payment access required.');
 if(resource==='export'&&!['owner','manager'].includes(user.role||''))throw new HttpError(403,'Only management can export guest reports.');
 const url=new URL(req.url),city=url.searchParams.get('city'),status=z.enum(['all','confirmed','checked-in','checked-out','cancelled']).parse(url.searchParams.get('status')||'all'),search=(url.searchParams.get('q')||'').slice(0,254).toLowerCase();
 if(city&&city!=='all'&&!inCity(user.cities,city))throw new HttpError(403,'Your staff access does not include this city.');
 const base=await readHotel(undefined,{room_state:{}}),rooms=hotelRooms(base);
 const bookingCity=(r:Row)=>r.city||rooms.find(room=>room.id===r.room)?.city||'';
 const visible=(r:Row)=>inCity(user.cities,bookingCity(r))&&(!city||city==='all'||cityKey(bookingCity(r))===cityKey(city));
 const collection=resource==='payments'?'payments':'reservations',limit=resource==='report'?200:25;
 const binding=JSON.stringify([resource,user.userId,user.email,user.role,user.cities,city||'all',status,search]);
 let startAt:Record<string,unknown>|undefined,readTime:string|undefined;
 const token=url.searchParams.get('cursor');
 if(token){try{
  if(token.length>5000)throw Error();
  const cursor=cursorSchema.parse(await openHistoryCursor(token,binding));
  if(!cursor.path.startsWith(collection+'/'))throw Error();
  if(Date.parse(cursor.snapshot)<Date.now()-55*60*1000||Date.parse(cursor.snapshot)>Date.now()+60000)throw Error();
  readTime=cursor.snapshot;startAt={values:[{stringValue:cursor.at},{referenceValue:documentReference(cursor.path)}],before:false};
 }catch{throw new HttpError(400,'Invalid or expired history cursor. Refresh to restart.');}}
 const result=await queryDocumentPage(collection,{orderBy:[{field:{fieldPath:'createdAt'},direction:'DESCENDING'},{field:{fieldPath:'__name__'},direction:'DESCENDING'}],limit:limit+1,...(startAt?{startAt}:{})},undefined,readTime);
 readTime=result.readTime;if(!readTime)throw new Error('Missing history snapshot.');
 const raw=result.rows;
 const page=raw.slice(0,limit),last=page.at(-1),nextCursor=raw.length>limit&&last?await sealHistoryCursor({at:String(last.data.createdAt),snapshot:readTime,path:last.path},binding):null;
 const cities=[...new Set(rooms.map(r=>r.city).filter(c=>inCity(user.cities,c)))].sort();
 const sumPaid=async(ids:string[])=>{
  let amount=0;
  // IN supports up to 30 disjunctions. Aggregate in Firestore, so a booking
  // with thousands of payment entries never downloads its entire ledger.
  for(let i=0;i<ids.length;i+=30){const values=ids.slice(i,i+30).map(stringValue=>({stringValue}));
   const total=await aggregateDocuments('payments',{where:fieldFilter('bookingId',{arrayValue:{values}},'IN')},['amount'],readTime);amount+=Number(total.amount||0);
  }return amount;
 };
 if(resource==='payments'){
  const ids=[...new Set(page.map(r=>String(r.data.bookingId)))];
  const bookings=new Map(await Promise.all(ids.map(async id=>[id,(await getDocument('reservations/'+encodeURIComponent(id),undefined,readTime))?.data] as const)));
  const payments=page.flatMap(({data:p})=>{const booking=bookings.get(String(p.bookingId));if(!booking||!visible(booking))return[];
   return[{...p,guest:user.role==='viewer'?'Guest '+String(booking.id).slice(0,8):booking.guest,...(user.role==='viewer'?{reference:'',actor:''}:{})}];});
  return json({payments,nextCursor,cities});
 }
 const rows=page.map(r=>r.data).filter(visible);
 if(resource==='report'){
  const summary=emptySummary();summary.reservations=rows.length;
  const outlookStart=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(readTime));
  const days=Array.from({length:7},(_,i)=>addDays(outlookStart,i));
  for(const r of rows){if(r.status==='cancelled')summary.cancelled++;else summary.booked+=Number(r.total||0);
   if(['confirmed','checked-in'].includes(String(r.status)))for(let i=0;i<7;i++){const day=days[i];if(String(r.checkIn)<=day&&String(r.checkOut)>day)summary.outlook[i]++;}
  }
  summary.collected=await sumPaid(rows.map(r=>String(r.id)));
  // Keep signed outstanding in each partial; clamp only after all pages merge.
  summary.outstanding=summary.booked-summary.collected;
  return json({summary,nextCursor,scanned:rows.length,outlookStart});
 }
 const selected=rows.filter(r=>(status==='all'||r.status===status)&&(user.role==='viewer'?('Guest '+String(r.id).slice(0,8)+' '+r.room+' '+r.id):(r.guest+' '+r.email+' '+r.room+' '+r.id)).toLowerCase().includes(search));
 const paid=can(user.role,'payments.read')?Object.fromEntries(await Promise.all(selected.map(async r=>[String(r.id),await sumPaid([String(r.id)])]))):{};
 if(resource==='export'){
  // Recheck the current management grant in the same transaction as the audit.
  // Only the tiny staff read and audit write participate, never full history.
  await mutateHotel(data=>{
   const member=data.staff_access.find(r=>r.email===user.email&&r.active),role=user.email===OWNER_EMAIL?'owner':member?.role;
   const scope=staffScope(role as Parameters<typeof staffScope>[0]||null,member?.cities);
   if(!['owner','manager'].includes(String(role))||selected.some(r=>!inCity(scope,bookingCity(r)))||(city&&city!=='all'&&!inCity(scope,city)))throw new HttpError(403,'Your staff access changed. Restart the export.');
   recordActivity(data,user.email,'reservations.exported','reservations',selected.length+' rows (page)',city&&city!=='all'?city:null);
  },{staff_access:{where:fieldFilter('email',user.email)}});
  const lines=[...(!token?[['Booking','Guest','Email','Room','Arrival','Departure','Status','Booked INR','Paid INR']]:[]),...selected.map(r=>[r.id,r.guest,r.email,r.room,r.checkIn,r.checkOut,r.status,r.total,paid[String(r.id)]])];
  return new Response(lines.map(line=>line.map(csvCell).join(',')).join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="aurel-reservations.csv"','Cache-Control':'no-store',...(nextCursor?{'X-Next-Cursor':nextCursor}:{})}});
 }
 const reservations=selected.map(({owner:_owner,...r})=>({...r,city:bookingCity(r),roomName:r.roomName||rooms.find(room=>room.id===r.room)?.name||'Accommodation',image:safeImage(String(r.image||rooms.find(room=>room.id===r.room)?.image||'/images/classic.webp')),...(user.role==='viewer'?{guest:'Guest '+String(r.id).slice(0,8),email:'',phone:'',notes:''}:{})}));
 return json({reservations,paid,nextCursor,cities});
}
