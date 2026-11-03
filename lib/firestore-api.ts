import {z} from 'zod';
import {csvCell,trustedImage,safeImage} from './security';
import {categoryId,publicAvailability,roomAvailable} from './availability';
import {requireAccess,json,failure,readBody,HttpError,OWNER_EMAIL} from './access';
import {can,roles,type Permission,type Role} from './permissions';
import {staffScope,inCity,scopesOverlap,cityKey} from './city-access';
import {today,nights} from './hotel';
import {readHotel,readInventory,mutateHotel,hotelRooms,recordActivity,fieldFilter,activeReservations,inventoryCityFilters,type ReadPlan,type HotelData} from './firestore-hotel';
// Schemas validate all browser input; this internal row type spans six existing
// domain collections imported from D1, whose optional fields differ by entity.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Legacy Firestore collections have heterogeneous fields; boundary schemas validate writes.
type Row=Record<string,any>;
type State=Record<keyof HotelData,Row[]>;
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s,'Invalid date');
const bookingSchema=z.object({id:z.string().optional(),version:z.number().int().optional(),guest:z.string().trim().min(2).max(100),email:z.string().email().max(254),phone:z.string().max(30).default(''),room:z.string().optional(),categoryId:z.string().optional(),city:z.string().trim().min(2).max(80).optional(),adults:z.number().int().min(1).max(8).optional(),children:z.number().int().min(0).max(7).optional(),checkIn:date,checkOut:date,guests:z.number().int().min(1).max(8),notes:z.string().max(1000).default(''),status:z.enum(['confirmed','checked-in','checked-out','cancelled']).default('confirmed')});
const image=z.string().max(2048).refine(trustedImage,'Choose an image from the local /images/ library.');
const catalogSchema=z.object({room:z.string().regex(/^[A-Za-z0-9_-]{1,30}$/),version:z.number().int().min(0).default(0),name:z.string().trim().min(2).max(80),city:z.string().trim().min(2).max(80),type:z.enum(['Classic','Deluxe','Suite']),capacity:z.number().int().min(1).max(8),floor:z.number().int().min(0).max(100),area:z.number().int().min(8).max(1000),detail:z.string().trim().min(5).max(600),features:z.array(z.string().trim().min(1).max(80)).min(1).max(10),image,rate:z.number().int().min(500).max(200000)}).strict();
const staffSchema=z.object({email:z.string().email().max(254).transform(s=>s.trim().toLowerCase()),name:z.string().trim().min(2).max(80),role:z.enum(roles),active:z.boolean(),cities:z.union([z.null(),z.array(z.string().trim().min(2).max(80)).min(1).max(100)])}).strict();
const roomSchema=z.object({room:z.string(),cleaning:z.enum(['clean','dirty','cleaning','inspection']).optional(),operational:z.enum(['open','maintenance']).optional(),rate:z.number().int().min(500).max(200000).optional(),assignedTo:z.union([z.string().email(),z.literal('')]).optional(),notes:z.string().max(1000).optional()}).strict();
const taskSchema=z.object({id:z.string().optional(),title:z.string().trim().min(3).max(150),room:z.string(),kind:z.enum(['housekeeping','maintenance']),priority:z.enum(['normal','high','urgent']),status:z.enum(['open','in-progress','done']),assignedTo:z.union([z.string().email(),z.literal('')]),notes:z.string().max(1000)}).strict();
const paymentSchema=z.object({kind:z.enum(['payment','refund']).default('payment'),bookingId:z.string(),amount:z.number().int().min(1).max(6000000),method:z.enum(['cash','card','bank-transfer','upi']),reference:z.string().max(120),id:z.string().uuid()}).strict();
function fail(status:number,message:string):never{throw new HttpError(status,message);}
function publicBooking(row:Row,rooms:ReturnType<typeof hotelRooms>,reveal=false){const {owner,...r}=row,room=rooms.find(x=>x.id===r.room);return{...r,room:reveal||['checked-in','checked-out'].includes(r.status)?r.room:'',roomName:r.roomName||room?.name||'Accommodation',city:r.city||room?.city||'',image:safeImage(String(r.image||room?.image||'/images/classic.webp'))};}
function ownedBy(r:Row,user:{userId:string;email:string}){return r.owner===user.userId||(typeof r.owner==='string'&&r.owner.startsWith('user_')&&String(r.email).toLowerCase()===user.email);}
const net=(s:State,id:string)=>s.payments.filter(p=>p.bookingId===id).reduce((n,p)=>n+Number(p.amount),0);
const live=(r:Row)=>['confirmed','checked-in'].includes(r.status);
const sorted=(rows:Row[],field='createdAt')=>[...rows].sort((a,b)=>String(b[field]||'').localeCompare(String(a[field]||'')));
function currentRole(s:State,email:string):Role|null{return email===OWNER_EMAIL?'owner':s.staff_access.find(r=>r.email===email&&r.active)?.role||null;}
function demand(s:State,email:string,permission:Permission){if(!can(currentRole(s,email),permission))fail(403,'Your role no longer has access to this action.');}
function currentScope(s:State,email:string){return staffScope(currentRole(s,email),s.staff_access.find(r=>r.email===email&&r.active)?.cities);}
function bookingCity(s:State,b:Row){return b.city||hotelRooms(s).find(r=>r.id===b.room)?.city||'';}
function roomCity(s:State,id:string){return hotelRooms(s).find(r=>r.id===id)?.city||s.reservations.find(r=>r.room===id&&r.city)?.city||'';}
function demandCity(s:State,email:string,city:unknown){if(!inCity(currentScope(s,email),city))fail(403,'Your staff access does not include this city.');}
function staffCanWork(s:State,email:string,city:string){const member=s.staff_access.find(r=>r.email===email.toLowerCase()&&r.active);return member&&inCity(staffScope(member.role,member.cities),city);}
function activityCity(s:State,event:Row){return event.city||s.reservations.find(r=>r.id===event.entity)?.city||roomCity(s,event.entity)||'';}
function checkRoom(s:State,b:Row,id?:string){if(s.reservations.some(r=>r.id!==id&&r.room===b.room&&live(r)&&r.checkIn<b.checkOut&&r.checkOut>b.checkIn))throw new Error('room_unavailable');}
export async function firestoreApi(req:Request,resource:string){try{
 const url=new URL(req.url),method=req.method;
 if(resource==='rooms'&&method==='GET'){
  const start=url.searchParams.get('start')||today(),end=url.searchParams.get('end')||'';date.parse(start);date.parse(end);if(start<today()||nights(start,end)<1||nights(start,end)>30)fail(400,'Select a stay of 1 to 30 nights.');
  const city=z.string().trim().min(2).max(80).parse(url.searchParams.get('city')||'Delhi'),adults=z.coerce.number().int().min(1).max(8).parse(url.searchParams.get('adults')||2),children=z.coerce.number().int().min(0).max(7).parse(url.searchParams.get('children')||0);if(adults+children>8)fail(400,'A room supports up to 8 guests.');
  const d=await readInventory(start,end,city),rooms=hotelRooms(d);return json({rooms:publicAvailability(rooms,d.reservations,start,end,city,adults,children),cities:[...new Set(rooms.map(r=>r.city))].sort()});
 }
 const permissions:Record<string,Permission>={catalog:'rooms.write',staff:'staff.write',roomstate:'rooms.read',tasks:'tasks.read',payments:'payments.read',activity:'audit.read',export:'bookings.read'};
 const user=await requireAccess(resource==='reservations'?undefined:permissions[resource]);
 if(resource==='export'&&method==='GET'){
  // Export only a fresh server-authorized snapshot; commit the audit record
  // before releasing any CSV bytes. Downloaded files remain sensitive.
  const csv=await mutateHotel(data=>{
   const s=data as State;demand(s,user.email,'bookings.read');const role=currentRole(s,user.email);
   if(!['owner','manager'].includes(role||''))fail(403,'Only management can export guest reports.');
   const city=url.searchParams.get('city'),scope=currentScope(s,user.email),status=url.searchParams.get('status')||'all',search=(url.searchParams.get('q')||'').slice(0,254).toLowerCase();
   if(city&&city!=='all'&&!inCity(scope,city))fail(403,'Your staff access does not include this city.');
   const rows=sorted(s.reservations.filter(r=>inCity(scope,bookingCity(s,r))&&(!city||city==='all'||cityKey(bookingCity(s,r))===cityKey(city))&&(status==='all'||r.status===status)&&(r.guest+' '+r.email+' '+r.room+' '+r.id).toLowerCase().includes(search)));
   recordActivity(data,user.email,'reservations.exported','reservations',String(rows.length)+' rows',city&&city!=='all'?city:null);
   const lines=[['Booking','Guest','Email','Room','Arrival','Departure','Status','Booked INR','Paid INR'],...rows.map(r=>[r.id,r.guest,r.email,r.room,r.checkIn,r.checkOut,r.status,r.total,net(s,r.id)])];
   return lines.map(row=>row.map(csvCell).join(',')).join('\r\n');
  },{reservations:{},payments:{},staff_access:{},room_state:{}});
  return new Response(csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="aurel-reservations.csv"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(method==='GET'){
  const plans:Record<string,ReadPlan>={reservations:{reservations:{},room_state:{},staff_access:{}},roomstate:{reservations:activeReservations,room_state:{},staff_access:{}},staff:{staff_access:{},room_state:{}},tasks:{hotel_tasks:{},staff_access:{},room_state:{}},payments:{payments:{},reservations:{},room_state:{},staff_access:{}},activity:{activity:{orderBy:[{field:{fieldPath:'created_at'},direction:'DESCENDING'}],limit:200},reservations:{},room_state:{},staff_access:{}}};
  if(resource==='reservations'&&url.searchParams.get('scope')!=='hotel')plans.reservations.reservations={where:{compositeFilter:{op:'OR',filters:[fieldFilter('owner',user.userId),fieldFilter('email',user.email)]}}};
  const d=await readHotel(undefined,plans[resource]||{}),s=d as State,role=currentRole(s,user.email),scope=currentScope(s,user.email),requested=url.searchParams.get('city');
  const permission=resource==='reservations'?(url.searchParams.get('scope')==='hotel'?'bookings.read':undefined):permissions[resource];
  if(permission&&!can(role,permission))fail(403,'Your role no longer has access to this action.');
  const city=requested&&requested!=='all'?requested:null;
  if(city&&!inCity(scope,city))fail(403,'Your staff access does not include this city.');
  const visible=(value:unknown)=>inCity(scope,value)&&(!city||cityKey(value)===cityKey(city));
  const cities=[...new Set(hotelRooms(d).map(r=>r.city).filter(c=>inCity(scope,c)))].sort();
  if(resource==='reservations'){const all=url.searchParams.get('scope')==='hotel';return json({reservations:sorted(s.reservations.filter(r=>all?visible(bookingCity(s,r)):ownedBy(r,user))).map(r=>{const booking=publicBooking(r,hotelRooms(d),all);return all&&role==='viewer'?{...booking,guest:'Guest '+String(r.id).slice(0,8),email:'',phone:'',notes:''}:booking;}),cities});}
  if(resource==='roomstate')return json({rooms:hotelRooms(d).filter(r=>visible(r.city)).map(r=>({...r,available:roomAvailable(r,s.reservations,url.searchParams.get('start')||today(),url.searchParams.get('end')||today()),occupied:s.reservations.some(b=>b.room===r.id&&b.status==='checked-in')})),cities});
  if(resource==='staff')return json({staff:sorted(s.staff_access.filter(r=>!city||inCity(staffScope(r.role,r.cities),city)),'name').map(r=>({...r,cities:staffScope(r.role,r.cities)})),cities});
  if(resource==='tasks')return json({tasks:sorted(s.hotel_tasks.filter(t=>visible(t.city||roomCity(s,t.room))&&(!['housekeeping','maintenance'].includes(role||'')||t.kind===role))),staff:s.staff_access.filter(r=>r.active&&scopesOverlap(scope,staffScope(r.role,r.cities))&&(!city||inCity(staffScope(r.role,r.cities),city))).filter(r=>!['housekeeping','maintenance'].includes(role||'')||r.role===role).map(({email,name,role,cities})=>({email,name,role,cities:staffScope(role,cities)})),cities});
  if(resource==='payments')return json({payments:sorted(s.payments.filter(p=>{const b=s.reservations.find(r=>r.id===p.bookingId);return b&&visible(bookingCity(s,b));})).map(p=>role==='viewer'?{...p,reference:'',actor:''}:p),cities});
  if(resource==='activity')return json({activity:sorted(s.activity.filter(a=>{const c=activityCity(s,a);return c?visible(c):scope===null&&!city;}),'created_at').slice(0,200),cities});
 }
 const raw=await readBody(req),now=new Date().toISOString();
 const payload=resource==='catalog'?(method==='DELETE'?z.object({room:z.string(),version:z.number().int().min(0)}).strict().parse(raw):catalogSchema.parse(raw)):resource==='staff'?staffSchema.parse(raw):resource==='roomstate'?roomSchema.parse(raw):resource==='tasks'?taskSchema.parse(raw):resource==='payments'?paymentSchema.parse(raw):method==='PATCH'?z.union([z.object({id:z.string(),action:z.literal('cancel')}).strict(),z.object({id:z.string(),action:z.literal('status'),status:z.enum(['confirmed','checked-in','checked-out','cancelled']),version:z.number().int()}).strict()]).parse(raw):bookingSchema.parse(raw);
 const b=payload as Row,by=(field:string,value:unknown)=>({where:fieldFilter(field,value)});
 const plan=(base:HotelData):ReadPlan=>{
  // Use the catalog from this transaction to resolve case-insensitive city
  // input. A concurrent room move must not hide a competing reservation.
  const or=(filters:unknown[])=>({compositeFilter:{op:'OR',filters}});
  const competing=b.room?[fieldFilter('room',b.room)]:b.city?inventoryCityFilters(base,b.city):[];
  const reservationQuery={where:or([...competing,fieldFilter('owner',user.userId),fieldFilter('email',user.email),fieldFilter('id',b.id||'')])};
  const plans:Record<string,ReadPlan>={catalog:{reservations:by('room',b.room),hotel_tasks:by('room',b.room)},staff:{},roomstate:{},tasks:{hotel_tasks:b.id?by('id',b.id):undefined},payments:{reservations:by('id',b.bookingId),payments:by('bookingId',b.bookingId)},reservations:{reservations:reservationQuery,payments:b.id?by('bookingId',b.id):undefined}};
  return plans[resource]||{};
 };
 const result=await mutateHotel(data=>{
  const s=data as State,b=payload as Row,role=currentRole(s,user.email),audit=(action:string,entity:string,detail='',city:string|null=null)=>recordActivity(data,user.email,action,entity,detail,city||activityCity(s,{entity})||null);
  if(resource==='catalog'){
   demand(s,user.email,'rooms.write');const oldRoom=hotelRooms(data).find(r=>r.id===b.room),old=s.room_state.find(r=>r.room===b.room),activeBookings=s.reservations.filter(r=>r.room===b.room&&live(r)&&(r.status==='checked-in'||r.checkOut>today()));
   if(oldRoom)demandCity(s,user.email,oldRoom.city);if(method!=='DELETE')demandCity(s,user.email,b.city);
   if(method==='POST'){if(oldRoom||old)fail(409,'This internal room number already exists. Choose a different number.');if(hotelRooms(data).length>=1000)fail(400,'The hotel supports up to 1,000 active rooms.');}
   else{if(!oldRoom)fail(404,'Room not found.');if(b.version!==oldRoom.catalogVersion)fail(409,'Room details changed. Refresh before editing.');}
   if(method==='DELETE'){if(activeBookings.length)fail(409,'Reassign or cancel active reservations before removing this room.');if(s.hotel_tasks.some(t=>t.room===b.room&&t.status!=='done'))fail(409,'Complete open room tasks before removing this room.');const row={...(old||{room:b.room}),deleted:true,catalogVersion:b.version+1,updatedAt:now};if(old)Object.assign(old,row);else s.room_state.push(row);audit('room.removed',b.room,'',oldRoom!.city);return{ok:true};}
   if(!['POST','PUT'].includes(method))fail(405,'Method not allowed.');if(oldRoom&&cityKey(b.city)!==cityKey(oldRoom.city)&&s.hotel_tasks.some(t=>t.room===b.room&&t.status!=='done'))fail(409,'Complete open room tasks before changing this room’s city.');if(oldRoom&&activeBookings.length&&(b.city.toLowerCase()!==oldRoom.city.toLowerCase()||activeBookings.some(r=>r.guests>b.capacity)))fail(409,'Existing reservations prevent changing the city or reducing guest capacity.');
   const {version,...details}=b,row={...(old||{cleaning:'clean',operational:'open',assignedTo:'',notes:''}),...details,deleted:false,catalogVersion:method==='POST'?1:version+1,updatedAt:now};if(old)Object.assign(old,row);else s.room_state.push(row);audit(method==='POST'?'room.created':'room.details_updated',b.room,b.name);return{ok:true};
  }
  if(resource==='staff'&&method==='PUT'){
   demand(s,user.email,'staff.write');if(b.email===OWNER_EMAIL)fail(400,'The owner account cannot be changed.');const cityNames=[...new Set(hotelRooms(data).map(r=>r.city))];if(b.cities!==null){b.cities=[...new Set(b.cities.map((c:string)=>cityNames.find(n=>cityKey(n)===cityKey(c))||''))];if(b.cities.some((c:string)=>!c))fail(400,'Select cities from the hotel catalog.');}const row={...b,active:b.active?1:0,updatedAt:now},old=s.staff_access.find(r=>r.email===b.email);if(old)Object.assign(old,row);else s.staff_access.push(row);audit(b.active?'staff.granted':'staff.revoked',b.email,b.role+' · '+(b.cities===null?'All cities':b.cities.join(', ')));return{ok:true};
  }
  if(resource==='roomstate'&&method==='PUT'){
   demand(s,user.email,'rooms.read');const room=hotelRooms(data).find(r=>r.id===b.room);if(!room)fail(404,'Room not found.');demandCity(s,user.email,room.city);
   if(!can(role,'rooms.write')){if(b.rate!==undefined||b.assignedTo!==undefined||b.notes!==undefined)fail(403,'Only management can change room details.');if(b.cleaning!==undefined&&!can(role,'cleaning.write'))fail(403,'Cleaning access required.');if(b.operational!==undefined&&!can(role,'maintenance.write'))fail(403,'Maintenance access required.');if(b.cleaning===undefined&&b.operational===undefined)fail(403,'No permitted changes.');}
   if(b.assignedTo&&!staffCanWork(s,b.assignedTo,room.city))fail(400,'Choose an active staff member with access to this city.');
   const row={room:b.room,catalogVersion:b.rate!==undefined?room.catalogVersion+1:room.catalogVersion,cleaning:b.cleaning??room.cleaning,operational:b.operational??room.operational,rate:b.rate??room.rate,assignedTo:b.assignedTo?.toLowerCase()??room.assignedTo,notes:b.notes??room.notes,updatedAt:now};const old=s.room_state.find(r=>r.room===b.room);if(old)Object.assign(old,row);else s.room_state.push(row);audit('room.updated',b.room);return{ok:true};
  }
  if(resource==='tasks'&&method==='POST'){
   demand(s,user.email,'tasks.write');const taskRoom=hotelRooms(data).find(r=>r.id===b.room);if(!taskRoom)fail(400,'Select a valid room.');demandCity(s,user.email,taskRoom.city);const restricted=['housekeeping','maintenance'].includes(role||''),old=b.id?s.hotel_tasks.find(t=>t.id===b.id):null;
   if(b.id&&!old)fail(404,'Task not found.');if(old)demandCity(s,user.email,old.city||roomCity(s,old.room));if(restricted&&(b.kind!==role||old&&old.kind!==role))fail(403,'You can manage only your department tasks.');if(b.assignedTo&&!s.staff_access.some(r=>r.email===b.assignedTo.toLowerCase()&&r.active&&inCity(staffScope(r.role,r.cities),taskRoom.city)&&[b.kind,'manager','receptionist'].includes(r.role)))fail(400,'Choose an active staff member in the appropriate department.');
   const id=b.id||crypto.randomUUID();if(old)Object.assign(old,b,{city:taskRoom.city,assignedTo:b.assignedTo.toLowerCase()});else s.hotel_tasks.push({...b,id,city:taskRoom.city,assignedTo:b.assignedTo.toLowerCase(),createdAt:now});audit(old?'task.updated':'task.created',id,b.title,taskRoom.city);return{id};
  }
  if(resource==='payments'&&method==='POST'){
   demand(s,user.email,'payments.write');if(b.kind==='refund'&&!can(role,'rooms.write'))fail(403,'Only management can record refunds.');const booking=s.reservations.find(r=>r.id===b.bookingId);if(!booking)fail(404,'Booking not found.');demandCity(s,user.email,bookingCity(s,booking));const old=s.payments.find(p=>p.id===b.id);if(old){if(old.bookingId!==b.bookingId||old.amount!==(b.kind==='refund'?-b.amount:b.amount))fail(409,'Transaction ID already used.');return{ok:true};}
   if(booking.status==='cancelled'&&b.kind==='payment')fail(400,'Cannot record payments on a cancelled booking.');const amount=b.kind==='refund'?-b.amount:b.amount,total=net(s,b.bookingId)+amount;if(total<0)throw new Error('refund_exceeds_paid');if(total>booking.total)throw new Error('payment_exceeds_balance');s.payments.push({id:b.id,bookingId:b.bookingId,amount,method:b.method,reference:b.reference,actor:user.email,createdAt:now});audit(b.kind==='refund'?'refund.recorded':'payment.recorded',b.bookingId,String(b.amount)+' INR');return{ok:true};
  }
  if(resource==='reservations'){
   if(method==='PATCH'&&b.action==='status'){demand(s,user.email,'bookings.write');const old=s.reservations.find(r=>r.id===b.id);if(!old)fail(404,'Reservation not found.');demandCity(s,user.email,bookingCity(s,old));const version=b.version,status=b.status;Object.assign(b,old,{version,status});}
   if(method==='PATCH'&&b.action==='cancel'){const old=s.reservations.find(r=>r.id===b.id&&ownedBy(r,user));if(!old)fail(404,'Reservation not found.');if(old.status!=='confirmed'||old.checkIn<today())fail(400,'Only upcoming confirmed bookings can be cancelled.');if(net(s,b.id)>0)fail(409,'This booking has recorded payments.');old.status='cancelled';old.version++;audit('reservation.cancelled',b.id);return{ok:true};}
   if(!['POST','PUT','PATCH'].includes(method))fail(405,'Method not allowed.');const update=method!=='POST';if(update)demand(s,user.email,'bookings.write');const staff=can(role,'bookings.write')&&!!b.room;if(!staff)b.email=user.email;
   if(!staff&&!update&&b.room)fail(400,'Choose accommodation rather than a specific room number.');
   const duration=nights(b.checkIn,b.checkOut),catalog=hotelRooms(data);if(!update&&!b.room){if(b.room)fail(400,'Choose accommodation rather than a specific room number.');if(!b.categoryId||!b.city||b.adults===undefined||b.children===undefined)fail(400,'Select city, accommodation, adults and children.');if(b.guests!==b.adults+b.children)fail(400,'Guest counts do not match.');const selected=catalog.find(r=>categoryId(r)===b.categoryId&&r.city.toLowerCase()===b.city.toLowerCase()&&r.capacity>=b.guests&&roomAvailable(r,s.reservations,b.checkIn,b.checkOut));if(!selected)throw new Error('room_unavailable');b.room=selected.id;}
   if(b.adults!==undefined||b.children!==undefined){if(b.adults===undefined||b.children===undefined||b.guests!==b.adults+b.children)fail(400,'Adults and children must match the total guests.');}const room=catalog.find(r=>r.id===b.room);if(!room||b.guests>room.capacity)fail(400,'Choose a room with enough guest capacity.');if(staff)demandCity(s,user.email,room.city);if(update){const original=s.reservations.find(r=>r.id===b.id);if(original)demandCity(s,user.email,bookingCity(s,original));}if(duration<1||duration>30)fail(400,'A stay must be between 1 and 30 nights.');
   if(!update){if(!staff&&s.reservations.filter(r=>ownedBy(r,user)&&live(r)&&(r.status==='checked-in'||r.checkOut>today())).length>=3)fail(429,'You have reached the limit of 3 active bookings. Contact the hotel for additional stays.');if(b.status!=='confirmed')fail(400,'New bookings must be confirmed.');if(b.checkIn<today())fail(400,'Check-in cannot be in the past.');if(room.operational!=='open')throw new Error('room_maintenance');checkRoom(s,b);const id=crypto.randomUUID();const {categoryId:category,action,...details}=b;s.reservations.push({...details,city:room.city,roomName:room.name,image:room.image,id,owner:user.userId,status:'confirmed',version:0,total:room.rate*duration,createdAt:now});audit('reservation.created',id,'Room '+b.room);return{id};}
   const old=s.reservations.find(r=>r.id===b.id);if(!old)fail(404,'Reservation not found.');if(b.version===undefined||b.version!==old.version)fail(409,'Reservation changed. Refresh before editing.');if(['cancelled','checked-out'].includes(old.status))fail(400,'Completed reservations are read-only.');const transitions:Record<string,string[]>={confirmed:['confirmed','checked-in','cancelled'],'checked-in':['checked-in','checked-out']};if(!transitions[old.status]?.includes(b.status))fail(400,'Invalid reservation status change.');
   if(b.checkIn<today()&&b.checkIn!==old.checkIn)fail(400,'Check-in cannot be moved into the past.');if(b.status==='checked-in'&&(b.checkIn>today()||b.checkOut<=today()))fail(400,'Check-in is only available during the booked stay.');if(old.status==='checked-in'&&(b.room!==old.room||b.checkIn!==old.checkIn))fail(400,'Checked-in guests cannot change room or arrival.');
   const changed=b.room!==old.room||b.checkIn!==old.checkIn||b.checkOut!==old.checkOut,total=changed?room.rate*duration:old.total,paid=net(s,b.id);if(paid>total||b.status==='cancelled'&&paid>0)fail(409,'Resolve recorded payments before cancelling or reducing this booking.');
   if(live(b)){checkRoom(s,b,b.id);if(changed&&room.operational!=='open')throw new Error('room_maintenance');if(b.status==='checked-in'&&old.status!=='checked-in'&&(room.cleaning!=='clean'||room.operational!=='open'))throw new Error('room_not_ready');}
   const checkout=old.status==='checked-in'&&b.status==='checked-out';const {action,...changes}=b;Object.assign(old,changes,{city:room.city,roomName:room.name,image:room.image,total,version:old.version+1});if(checkout){const state=s.room_state.find(r=>r.room===b.room);if(state)Object.assign(state,{cleaning:'dirty',updatedAt:now});else s.room_state.push({room:b.room,rate:room.rate,cleaning:'dirty',operational:'open',assignedTo:'',notes:'',updatedAt:now});}audit('reservation.updated',b.id,b.status);return{id:b.id};
  }
  return fail(405,'Method not allowed.');
 },plan);
 return json(result,resource==='reservations'&&method==='POST'?201:200);
 }catch(e){if(e instanceof z.ZodError)return json({error:e.issues[0].message},400);return failure(e);}}
