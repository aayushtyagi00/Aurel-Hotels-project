import {z} from 'zod';
import {categoryId,publicAvailability,roomAvailable} from './availability';
import {requireAccess,json,failure,readBody,HttpError,OWNER_EMAIL} from './access';
import {can,roles,type Permission,type Role} from './permissions';
import {today,nights} from './hotel';
import {readHotel,readInventory,mutateHotel,hotelRooms,recordActivity,type HotelData} from './firestore-hotel';
// Schemas validate all browser input; this internal row type spans six existing
// domain collections imported from D1, whose optional fields differ by entity.
type Row=Record<string,any>;
type State=Record<keyof HotelData,Row[]>;
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s,'Invalid date');
const bookingSchema=z.object({id:z.string().optional(),version:z.number().int().optional(),guest:z.string().trim().min(2).max(100),email:z.string().email().max(254),phone:z.string().max(30).default(''),room:z.string().optional(),categoryId:z.string().optional(),city:z.string().trim().min(2).max(80).optional(),adults:z.number().int().min(1).max(8).optional(),children:z.number().int().min(0).max(7).optional(),checkIn:date,checkOut:date,guests:z.number().int().min(1).max(8),notes:z.string().max(1000).default(''),status:z.enum(['confirmed','checked-in','checked-out','cancelled']).default('confirmed')});
const image=z.string().max(2048).refine(v=>/^\/images\/[a-zA-Z0-9_.-]+\.(webp|png|jpe?g)$/.test(v)||(()=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}})(),'Use a local image or HTTPS image URL.');
const catalogSchema=z.object({room:z.string().regex(/^[A-Za-z0-9_-]{1,30}$/),version:z.number().int().min(0).default(0),name:z.string().trim().min(2).max(80),city:z.string().trim().min(2).max(80),type:z.enum(['Classic','Deluxe','Suite']),capacity:z.number().int().min(1).max(8),floor:z.number().int().min(0).max(100),area:z.number().int().min(8).max(1000),detail:z.string().trim().min(5).max(600),features:z.array(z.string().trim().min(1).max(80)).min(1).max(10),image,rate:z.number().int().min(500).max(200000)}).strict();
const staffSchema=z.object({email:z.string().email().max(254).transform(s=>s.trim().toLowerCase()),name:z.string().trim().min(2).max(80),role:z.enum(roles),active:z.boolean()}).strict();
const roomSchema=z.object({room:z.string(),cleaning:z.enum(['clean','dirty','cleaning','inspection']).optional(),operational:z.enum(['open','maintenance']).optional(),rate:z.number().int().min(500).max(200000).optional(),assignedTo:z.union([z.string().email(),z.literal('')]).optional(),notes:z.string().max(1000).optional()}).strict();
const taskSchema=z.object({id:z.string().optional(),title:z.string().trim().min(3).max(150),room:z.string(),kind:z.enum(['housekeeping','maintenance']),priority:z.enum(['normal','high','urgent']),status:z.enum(['open','in-progress','done']),assignedTo:z.union([z.string().email(),z.literal('')]),notes:z.string().max(1000)}).strict();
const paymentSchema=z.object({kind:z.enum(['payment','refund']).default('payment'),bookingId:z.string(),amount:z.number().int().min(1).max(6000000),method:z.enum(['cash','card','bank-transfer','upi']),reference:z.string().max(120),id:z.string().uuid()}).strict();
function fail(status:number,message:string):never{throw new HttpError(status,message);}
function publicBooking(row:Row,rooms:ReturnType<typeof hotelRooms>,reveal=false){const {owner,...r}=row,room=rooms.find(x=>x.id===r.room);return{...r,room:reveal||['checked-in','checked-out'].includes(r.status)?r.room:'',roomName:r.roomName||room?.name||'Accommodation',city:r.city||room?.city||'',image:r.image||room?.image||'/images/classic.webp'};}
function ownedBy(r:Row,user:{userId:string;email:string}){return r.owner===user.userId||(typeof r.owner==='string'&&r.owner.startsWith('user_')&&String(r.email).toLowerCase()===user.email);}
const net=(s:State,id:string)=>s.payments.filter(p=>p.bookingId===id).reduce((n,p)=>n+Number(p.amount),0);
const live=(r:Row)=>['confirmed','checked-in'].includes(r.status);
const sorted=(rows:Row[],field='createdAt')=>[...rows].sort((a,b)=>String(b[field]||'').localeCompare(String(a[field]||'')));
function currentRole(s:State,email:string):Role|null{return email===OWNER_EMAIL?'owner':s.staff_access.find(r=>r.email===email&&r.active)?.role||null;}
function demand(s:State,email:string,permission:Permission){if(!can(currentRole(s,email),permission))fail(403,'Your role no longer has access to this action.');}
function checkRoom(s:State,b:Row,id?:string){if(s.reservations.some(r=>r.id!==id&&r.room===b.room&&live(r)&&r.checkIn<b.checkOut&&r.checkOut>b.checkIn))throw new Error('room_unavailable');}
export async function firestoreApi(req:Request,resource:string){try{
 const url=new URL(req.url),method=req.method;
 if(resource==='rooms'&&method==='GET'){
  const start=url.searchParams.get('start')||today(),end=url.searchParams.get('end')||'';date.parse(start);date.parse(end);if(start<today()||nights(start,end)<1||nights(start,end)>30)fail(400,'Select a stay of 1 to 30 nights.');
  const city=z.string().trim().min(2).max(80).parse(url.searchParams.get('city')||'Delhi'),adults=z.coerce.number().int().min(1).max(8).parse(url.searchParams.get('adults')||2),children=z.coerce.number().int().min(0).max(7).parse(url.searchParams.get('children')||0);if(adults+children>8)fail(400,'A room supports up to 8 guests.');
  const d=await readInventory(),rooms=hotelRooms(d);return json({rooms:publicAvailability(rooms,d.reservations,start,end,city,adults,children),cities:[...new Set(rooms.map(r=>r.city))].sort()});
 }
 const permissions:Record<string,Permission>={catalog:'rooms.write',staff:'staff.write',roomstate:'rooms.read',tasks:'tasks.read',payments:'payments.read',activity:'audit.read'};
 const user=await requireAccess(resource==='reservations'?undefined:permissions[resource]);
 if(method==='GET'){
  const d=await readHotel(),s=d as State;
  if(resource==='reservations'){const all=url.searchParams.get('scope')==='hotel';if(all&&!can(user.role,'bookings.read'))fail(403,'Booking access is restricted.');return json({reservations:sorted(s.reservations.filter(r=>all||ownedBy(r,user))).map(r=>publicBooking(r,hotelRooms(d),all))});}
  if(resource==='roomstate')return json({rooms:hotelRooms(d).map(r=>({...r,available:roomAvailable(r,s.reservations,url.searchParams.get('start')||today(),url.searchParams.get('end')||today()),occupied:s.reservations.some(b=>b.room===r.id&&b.status==='checked-in')}))});
  if(resource==='staff')return json({staff:[...s.staff_access].sort((a,b)=>b.active-a.active||a.name.localeCompare(b.name)),owner:OWNER_EMAIL});
  if(resource==='tasks')return json({tasks:sorted(s.hotel_tasks.filter(t=>!['housekeeping','maintenance'].includes(user.role||'')||t.kind===user.role)),staff:s.staff_access.filter(r=>r.active).map(({email,name,role})=>({email,name,role}))});
  if(resource==='payments')return json({payments:sorted(s.payments)});
  if(resource==='activity')return json({activity:sorted(s.activity,'created_at').slice(0,200)});
 }
 const raw=await readBody(req),now=new Date().toISOString();
 const payload=resource==='catalog'?(method==='DELETE'?z.object({room:z.string(),version:z.number().int().min(0)}).strict().parse(raw):catalogSchema.parse(raw)):resource==='staff'?staffSchema.parse(raw):resource==='roomstate'?roomSchema.parse(raw):resource==='tasks'?taskSchema.parse(raw):resource==='payments'?paymentSchema.parse(raw):method==='PATCH'?z.union([z.object({id:z.string(),action:z.literal('cancel')}).strict(),z.object({id:z.string(),action:z.literal('status'),status:z.enum(['confirmed','checked-in','checked-out','cancelled']),version:z.number().int()}).strict()]).parse(raw):bookingSchema.parse(raw);
 const result=await mutateHotel(data=>{
  const s=data as State,b=payload as Row,role=currentRole(s,user.email),audit=(action:string,entity:string,detail='')=>recordActivity(data,user.email,action,entity,detail);
  if(resource==='catalog'){
   demand(s,user.email,'rooms.write');const oldRoom=hotelRooms(data).find(r=>r.id===b.room),old=s.room_state.find(r=>r.room===b.room),activeBookings=s.reservations.filter(r=>r.room===b.room&&live(r)&&(r.status==='checked-in'||r.checkOut>today()));
   if(method==='POST'){if(oldRoom||old)fail(409,'This internal room number already exists. Choose a different number.');if(hotelRooms(data).length>=200)fail(400,'The hotel supports up to 200 active rooms.');}
   else{if(!oldRoom)fail(404,'Room not found.');if(b.version!==oldRoom.catalogVersion)fail(409,'Room details changed. Refresh before editing.');}
   if(method==='DELETE'){if(activeBookings.length)fail(409,'Reassign or cancel active reservations before removing this room.');if(s.hotel_tasks.some(t=>t.room===b.room&&t.status!=='done'))fail(409,'Complete open room tasks before removing this room.');const row={...(old||{room:b.room}),deleted:true,catalogVersion:b.version+1,updatedAt:now};if(old)Object.assign(old,row);else s.room_state.push(row);audit('room.removed',b.room);return{ok:true};}
   if(!['POST','PUT'].includes(method))fail(405,'Method not allowed.');if(oldRoom&&activeBookings.length&&(b.city.toLowerCase()!==oldRoom.city.toLowerCase()||activeBookings.some(r=>r.guests>b.capacity)))fail(409,'Existing reservations prevent changing the city or reducing guest capacity.');
   const {version,...details}=b,row={...(old||{cleaning:'clean',operational:'open',assignedTo:'',notes:''}),...details,deleted:false,catalogVersion:method==='POST'?1:version+1,updatedAt:now};if(old)Object.assign(old,row);else s.room_state.push(row);audit(method==='POST'?'room.created':'room.details_updated',b.room,b.name);return{ok:true};
  }
  if(resource==='staff'&&method==='PUT'){
   demand(s,user.email,'staff.write');if(b.email===OWNER_EMAIL)fail(400,'The owner account cannot be changed.');const row={...b,active:b.active?1:0,updatedAt:now},old=s.staff_access.find(r=>r.email===b.email);if(old)Object.assign(old,row);else s.staff_access.push(row);audit(b.active?'staff.granted':'staff.revoked',b.email,b.role);return{ok:true};
  }
  if(resource==='roomstate'&&method==='PUT'){
   demand(s,user.email,'rooms.read');const room=hotelRooms(data).find(r=>r.id===b.room);if(!room)fail(404,'Room not found.');
   if(!can(role,'rooms.write')){if(b.rate!==undefined||b.assignedTo!==undefined||b.notes!==undefined)fail(403,'Only management can change room details.');if(b.cleaning!==undefined&&!can(role,'cleaning.write'))fail(403,'Cleaning access required.');if(b.operational!==undefined&&!can(role,'maintenance.write'))fail(403,'Maintenance access required.');if(b.cleaning===undefined&&b.operational===undefined)fail(403,'No permitted changes.');}
   if(b.assignedTo&&!s.staff_access.some(r=>r.email===b.assignedTo.toLowerCase()&&r.active))fail(400,'Choose an active staff member.');
   const row={room:b.room,catalogVersion:b.rate!==undefined?room.catalogVersion+1:room.catalogVersion,cleaning:b.cleaning??room.cleaning,operational:b.operational??room.operational,rate:b.rate??room.rate,assignedTo:b.assignedTo?.toLowerCase()??room.assignedTo,notes:b.notes??room.notes,updatedAt:now};const old=s.room_state.find(r=>r.room===b.room);if(old)Object.assign(old,row);else s.room_state.push(row);audit('room.updated',b.room);return{ok:true};
  }
  if(resource==='tasks'&&method==='POST'){
   demand(s,user.email,'tasks.write');if(!hotelRooms(data).some(r=>r.id===b.room))fail(400,'Select a valid room.');const restricted=['housekeeping','maintenance'].includes(role||''),old=b.id?s.hotel_tasks.find(t=>t.id===b.id):null;
   if(b.id&&!old)fail(404,'Task not found.');if(restricted&&(b.kind!==role||old&&old.kind!==role))fail(403,'You can manage only your department tasks.');if(b.assignedTo&&!s.staff_access.some(r=>r.email===b.assignedTo.toLowerCase()&&r.active&&[b.kind,'manager','receptionist'].includes(r.role)))fail(400,'Choose an active staff member in the appropriate department.');
   const id=b.id||crypto.randomUUID();if(old)Object.assign(old,b,{assignedTo:b.assignedTo.toLowerCase()});else s.hotel_tasks.push({...b,id,assignedTo:b.assignedTo.toLowerCase(),createdAt:now});audit(old?'task.updated':'task.created',id,b.title);return{id};
  }
  if(resource==='payments'&&method==='POST'){
   demand(s,user.email,'payments.write');if(b.kind==='refund'&&!can(role,'rooms.write'))fail(403,'Only management can record refunds.');const old=s.payments.find(p=>p.id===b.id);if(old){if(old.bookingId!==b.bookingId||old.amount!==(b.kind==='refund'?-b.amount:b.amount))fail(409,'Transaction ID already used.');return{ok:true};}
   const booking=s.reservations.find(r=>r.id===b.bookingId);if(!booking)fail(404,'Booking not found.');if(booking.status==='cancelled'&&b.kind==='payment')fail(400,'Cannot record payments on a cancelled booking.');const amount=b.kind==='refund'?-b.amount:b.amount,total=net(s,b.bookingId)+amount;if(total<0)throw new Error('refund_exceeds_paid');if(total>booking.total)throw new Error('payment_exceeds_balance');s.payments.push({id:b.id,bookingId:b.bookingId,amount,method:b.method,reference:b.reference,actor:user.email,createdAt:now});audit(b.kind==='refund'?'refund.recorded':'payment.recorded',b.bookingId,String(b.amount)+' INR');return{ok:true};
  }
  if(resource==='reservations'){
   if(method==='PATCH'&&b.action==='status'){demand(s,user.email,'bookings.write');const old=s.reservations.find(r=>r.id===b.id);if(!old)fail(404,'Reservation not found.');const version=b.version,status=b.status;Object.assign(b,old,{version,status});}
   if(method==='PATCH'&&b.action==='cancel'){const old=s.reservations.find(r=>r.id===b.id&&ownedBy(r,user));if(!old)fail(404,'Reservation not found.');if(old.status!=='confirmed'||old.checkIn<today())fail(400,'Only upcoming confirmed bookings can be cancelled.');if(net(s,b.id)>0)fail(409,'This booking has recorded payments.');old.status='cancelled';old.version++;audit('reservation.cancelled',b.id);return{ok:true};}
   if(!['POST','PUT','PATCH'].includes(method))fail(405,'Method not allowed.');const update=method!=='POST';if(update)demand(s,user.email,'bookings.write');const staff=can(role,'bookings.write');if(!staff)b.email=user.email;
   const duration=nights(b.checkIn,b.checkOut),catalog=hotelRooms(data);if(!staff&&!update){if(b.room)fail(400,'Choose accommodation rather than a specific room number.');if(!b.categoryId||!b.city||b.adults===undefined||b.children===undefined)fail(400,'Select city, accommodation, adults and children.');if(b.guests!==b.adults+b.children)fail(400,'Guest counts do not match.');const selected=catalog.find(r=>categoryId(r)===b.categoryId&&r.city.toLowerCase()===b.city.toLowerCase()&&r.capacity>=b.guests&&roomAvailable(r,s.reservations,b.checkIn,b.checkOut));if(!selected)throw new Error('room_unavailable');b.room=selected.id;}
   if(b.adults!==undefined||b.children!==undefined){if(b.adults===undefined||b.children===undefined||b.guests!==b.adults+b.children)fail(400,'Adults and children must match the total guests.');}const room=catalog.find(r=>r.id===b.room);if(!room||b.guests>room.capacity)fail(400,'Choose a room with enough guest capacity.');if(duration<1||duration>30)fail(400,'A stay must be between 1 and 30 nights.');
   if(!update){if(b.status!=='confirmed')fail(400,'New bookings must be confirmed.');if(b.checkIn<today())fail(400,'Check-in cannot be in the past.');if(room.operational!=='open')throw new Error('room_maintenance');checkRoom(s,b);const id=crypto.randomUUID();const {categoryId:category,action,...details}=b;s.reservations.push({...details,city:room.city,roomName:room.name,image:room.image,id,owner:user.userId,status:'confirmed',version:0,total:room.rate*duration,createdAt:now});audit('reservation.created',id,'Room '+b.room);return{id};}
   const old=s.reservations.find(r=>r.id===b.id);if(!old)fail(404,'Reservation not found.');if(b.version===undefined||b.version!==old.version)fail(409,'Reservation changed. Refresh before editing.');if(['cancelled','checked-out'].includes(old.status))fail(400,'Completed reservations are read-only.');const transitions:Record<string,string[]>={confirmed:['confirmed','checked-in','cancelled'],'checked-in':['checked-in','checked-out']};if(!transitions[old.status]?.includes(b.status))fail(400,'Invalid reservation status change.');
   if(b.checkIn<today()&&b.checkIn!==old.checkIn)fail(400,'Check-in cannot be moved into the past.');if(b.status==='checked-in'&&(b.checkIn>today()||b.checkOut<=today()))fail(400,'Check-in is only available during the booked stay.');if(old.status==='checked-in'&&(b.room!==old.room||b.checkIn!==old.checkIn))fail(400,'Checked-in guests cannot change room or arrival.');
   const changed=b.room!==old.room||b.checkIn!==old.checkIn||b.checkOut!==old.checkOut,total=changed?room.rate*duration:old.total,paid=net(s,b.id);if(paid>total||b.status==='cancelled'&&paid>0)fail(409,'Resolve recorded payments before cancelling or reducing this booking.');
   if(live(b)){checkRoom(s,b,b.id);if(changed&&room.operational!=='open')throw new Error('room_maintenance');if(b.status==='checked-in'&&old.status!=='checked-in'&&(room.cleaning!=='clean'||room.operational!=='open'))throw new Error('room_not_ready');}
   const checkout=old.status==='checked-in'&&b.status==='checked-out';const {action,...changes}=b;Object.assign(old,changes,{city:room.city,roomName:room.name,image:room.image,total,version:old.version+1});if(checkout){const state=s.room_state.find(r=>r.room===b.room);if(state)Object.assign(state,{cleaning:'dirty',updatedAt:now});else s.room_state.push({room:b.room,rate:room.rate,cleaning:'dirty',operational:'open',assignedTo:'',notes:'',updatedAt:now});}audit('reservation.updated',b.id,b.status);return{id:b.id};
  }
  return fail(405,'Method not allowed.');
 });
 return json(result,resource==='reservations'&&method==='POST'?201:200);
 }catch(e){if(e instanceof z.ZodError)return json({error:e.issues[0].message},400);return failure(e);}}
