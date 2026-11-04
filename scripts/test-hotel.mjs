import fs from 'node:fs';import {createHash} from 'node:crypto';import path from 'node:path';import vm from 'node:vm';import assert from 'node:assert/strict';import ts from 'typescript';import {z} from 'zod';
// Isolated API tests. Authentication and Firestore transport are test fixtures;
// all validation, role checks, room allocation and lifecycle logic are real source.
let email='owner@example.test',checks=0;const docs=new Map(),context=vm.createContext({console,crypto:globalThis.crypto,Date,TextEncoder,TextDecoder,Uint8Array,btoa,atob,URL,URLSearchParams,Headers,Request,Response,structuredClone}),cache=new Map();
const env={HOTEL_OWNER_EMAIL:'owner@example.test',HOTEL_HISTORY_CURSOR_SECRET:'isolated-test-key-not-a-real-credential'};let queue=Promise.resolve();
function matches(row,filter){if(filter.compositeFilter){const {op,filters}=filter.compositeFilter;return op==='OR'?filters.some(f=>matches(row,f)):filters.every(f=>matches(row,f));}const {field,op,value}=filter.fieldFilter,actual=row[field.fieldPath],expected=value.stringValue??value.arrayValue?.values.map(v=>v.stringValue);return op==='IN'?expected.includes(actual):op==='GREATER_THAN'?actual>expected:op==='LESS_THAN'?actual<expected:actual===expected;}
const transport={documentReference:p=>'projects/test/databases/test/documents/'+p,aggregateDocuments:async(c,q={},sums=[])=>{const rows=[...docs].filter(([p,d])=>p.startsWith(c+'/')&&(!q.where||matches(d,q.where))).map(([,d])=>d);return{count:rows.length,...Object.fromEntries(sums.map(field=>[field,rows.reduce((n,r)=>n+Number(r[field]||0),0)]))};},getDocument:async p=>docs.has(p)?{data:structuredClone(docs.get(p))}:null,queryDocuments:async(c,q={})=>{let rows=[...docs].filter(([p,d])=>p.startsWith(c+'/')&&(!q.where||matches(d,q.where)));const value=(entry,field)=>field==='__name__'?entry[0]:String(entry[1][field]||'');
const orders=q.orderBy||[];rows.sort((a,b)=>{for(const order of orders){const cmp=value(a,order.field.fieldPath).localeCompare(value(b,order.field.fieldPath))*(order.direction==='DESCENDING'?-1:1);if(cmp)return cmp;}return 0;});
if(q.startAt){const cursor=q.startAt.values;rows=rows.filter(row=>{for(let i=0;i<orders.length;i++){const expected=cursor[i].stringValue??cursor[i].referenceValue.split('/documents/')[1],cmp=value(row,orders[i].field.fieldPath).localeCompare(expected)*(orders[i].direction==='DESCENDING'?-1:1);if(cmp)return cmp>0;}return false;});}
return rows.slice(0,q.limit||rows.length).map(([path,data])=>({path,data:structuredClone(data)}));},runTransaction:work=>{const operation=queue.then(async()=>{const {result,writes}=await work('isolated-test-transaction');for(const w of writes){if(w.delete)docs.delete(w.path);else docs.set(w.path,structuredClone(w.data));}return result;});queue=operation.catch(()=>{});return operation;}};
transport.queryDocumentPage=async(c,q,_transaction,readTime)=>({rows:await transport.queryDocuments(c,q),readTime:readTime||new Date().toISOString()});
function synthetic(values){return new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v]of Object.entries(values))this.setExport(k,v);},{context});}
async function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);let m;if(file.endsWith(path.join('lib','auth.ts')))m=synthetic({getHotelUser:async()=>email?{userId:'uid-'+email,email,fullName:'Test guest'}:null});else if(file.endsWith(path.join('lib','firestore-client.ts')))m=synthetic(transport);else m=new vm.SourceTextModule(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,{context,identifier:file});cache.set(file,m);await m.link(async(spec,ref)=>{if(spec==='zod'){const s=synthetic({z});await s.link(()=>{});return s;}if(spec==='cloudflare:workers'){const s=synthetic({env});await s.link(()=>{});return s;}return load(path.resolve(path.dirname(ref.identifier),spec+'.ts'));});return m;}
const h=await load('lib/hotel.ts');await h.evaluate();const m=await load('lib/firestore-api.ts');await m.evaluate();const api=m.namespace.firestoreApi;const {today,addDays}=h.namespace,day=today();
async function call(resource,method='GET',body,as='owner@example.test',query=''){email=as;const r=await api(new Request('https://hotel.test/api/'+resource+query,{method,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})}),resource);return{status:r.status,data:await r.json()};}
function equal(label,a,b){assert.deepEqual(a,b,label);checks++;console.log('PASS '+label);}
async function status(label,resource,method,body,expected,as,query){const r=await call(resource,method,body,as,query);equal(label,r.status,expected);return r;}
const seedRooms=h.namespace.rooms;
equal('inventory contains 192 rooms',seedRooms.length,192);
equal('every physical room ID is unique',new Set(seedRooms.map(r=>r.id)).size,192);
equal('every room has a distinct image path',new Set(seedRooms.map(r=>r.image)).size,192);
equal('every room has a distinct image file',new Set(seedRooms.map(r=>createHash('sha256').update(fs.readFileSync('public'+r.image)).digest('hex'))).size,192);
for(const city of h.namespace.majorCities){const inventory=seedRooms.filter(r=>r.city===city);equal(city+' has 16 rooms',inventory.length,16);equal(city+' includes all room collections',[...new Set(inventory.map(r=>r.type))].sort().join(','),'Classic,Deluxe,Suite');equal(city+' supports solo guests and groups of eight',inventory.some(r=>r.capacity===1)&&inventory.some(r=>r.capacity===8),true);}
for(const [i,id]of ['101','102','103','104','201','202','203','204','301','302','303','304'].entries())equal('legacy room '+id+' retains original city',seedRooms.find(r=>r.id===id).city,h.namespace.majorCities[i]);
const guest='guest@example.test' ,other='other@example.test',reception='reception@example.test',manager='manager@example.test',viewer='viewer@example.test';for(const [email,role]of [[reception,'receptionist'],[manager,'manager'],[viewer,'viewer']])docs.set('staff_access/'+encodeURIComponent(email),{email,role,active:1,name:role,cities:null});
const room={room:'TEST-ROOM',version:0,name:'Quiet Test Suite',city:'Test City',type:'Suite',capacity:4,floor:2,area:45,detail:'A quiet room for isolated tests.',features:['King bed','Quiet view'],image:'/images/suite.webp',rate:9000};
await status('anonymous inventory management denied','catalog','POST',room,401,null);await status('guest inventory management denied','catalog','POST',room,403,guest);await status('reception cannot change catalog','catalog','POST',room,403,reception);await status('viewer cannot change catalog','catalog','POST',room,403,viewer);await status('owner adds room','catalog','POST',room,200);await status('duplicate room rejected','catalog','POST',room,409);await status('unsafe image rejected','catalog','POST',{...room,room:'UNSAFE',image:'javascript:alert(1)'},400);await status('manager edits room photo and description','catalog','PUT',{...room,version:1,image:'/images/deluxe.webp',detail:'Updated room description.'},200,manager);await status('stale catalog edit rejected','catalog','PUT',{...room,version:1},409);
const start=addDays(day,10),end=addDays(day,12),query='?start='+start+'&end='+end+'&city=Test%20City&adults=2&children=2';let available=await call('rooms','GET',null,null,query);equal('city and family capacity filter',available.data.rooms.length,1);const category=available.data.rooms[0];equal('public category hides physical room number',category.id.startsWith('stay_'),true);equal('public inventory has no floor or internal notes','floor'in category||'notes'in category,false);equal('children consume capacity',(await call('rooms','GET',null,null,query.replace('children=2','children=3'))).data.rooms.length,0);equal('unknown city has no false availability',(await call('rooms','GET',null,null,query.replace('Test%20City','Unknown'))).data.rooms.length,0);await status('at least one adult required','rooms','GET',null,400,null,query.replace('adults=2','adults=0'));await status('invalid dates rejected','rooms','GET',null,400,null,query.replace(start,'2027-02-30'));
const draft={guest:'Test Guest',email:other,categoryId:category.id,city:'Test City',adults:2,children:2,guests:4,checkIn:start,checkOut:end};await status('guest cannot request physical number','reservations','POST',{...draft,room:room.room},400,guest);await status('counts must agree','reservations','POST',{...draft,guests:3},400,guest);const created=await status('category booking succeeds','reservations','POST',draft,201,guest),id=created.data.id;
await status('capacity reserved against overlaps','reservations','POST',draft,409,other);let own=(await call('reservations','GET',null,guest)).data.reservations.find(r=>r.id===id);equal('room hidden before arrival',own.room,'');equal('owner email enforced',own.email,guest);equal('booking priced on server',own.total,18000);equal('other guest cannot see reservation',(await call('reservations','GET',null,other)).data.reservations.length,0);await status('guest cannot request hotel booking scope','reservations','GET',null,403,guest,'?scope=hotel');const internal=(await call('reservations','GET',null,reception,'?scope=hotel')).data.reservations.find(r=>r.id===id);equal('reception sees assignment',internal.room,room.room);await status('guest cannot change staff status','reservations','PATCH',{id,action:'status',status:'checked-in',version:0},403,guest);await status('early check-in blocked','reservations','PATCH',{id,action:'status',status:'checked-in',version:0},400,reception);await status('stale inline status rejected','reservations','PATCH',{id,action:'status',status:'cancelled',version:9},409,reception);await status('occupied future inventory cannot be removed','catalog','DELETE',{room:room.room,version:2},409);await status('active booking prevents city reassignment','catalog','PUT',{...room,version:2,city:'Different City'},409);await status('active booking prevents capacity reduction','catalog','PUT',{...room,version:2,capacity:2},409);
const payment={id:crypto.randomUUID(),bookingId:id,amount:1000,method:'cash',reference:'test',kind:'payment'};await status('payment recorded','payments','POST',payment,200,reception);await status('inline cancellation respects payments','reservations','PATCH',{id,action:'status',status:'cancelled',version:0},409,reception);await status('manager records existing refund','payments','POST',{...payment,id:crypto.randomUUID(),kind:'refund'},200,manager);await status('inline cancellation succeeds','reservations','PATCH',{id,action:'status',status:'cancelled',version:0},200,reception);await status('room removal preserves history','catalog','DELETE',{room:room.room,version:2},200);equal('removed room absent from public availability',(await call('rooms','GET',null,null,query)).data.rooms.length,0);equal('cancelled reservation history retained',(await call('reservations','GET',null,guest)).data.reservations.length,1);await status('removed room identifier cannot be reused','catalog','POST',room,409);
await status('new arrival room added','catalog','POST',{...room,room:'TODAY',name:'Arrival Room',city:'Arrival City'},200);const arrivalQuery='?start='+day+'&end='+addDays(day,1)+'&city=Arrival%20City&adults=1&children=0';const arrivalCategory=(await call('rooms','GET',null,null,arrivalQuery)).data.rooms[0];const arrival=(await call('reservations','POST',{...draft,categoryId:arrivalCategory.id,city:'Arrival City',adults:1,children:0,guests:1,checkIn:day,checkOut:addDays(day,1)},guest)).data.id;await status('mark arrival room dirty','roomstate','PUT',{room:'TODAY',cleaning:'dirty'},200);await status('inline check-in requires clean room','reservations','PATCH',{id:arrival,action:'status',status:'checked-in',version:0},409,reception);await status('prepare room','roomstate','PUT',{room:'TODAY',cleaning:'clean'},200);await status('inline check-in succeeds','reservations','PATCH',{id:arrival,action:'status',status:'checked-in',version:0},200,reception);equal('room revealed only after reception check-in',(await call('reservations','GET',null,guest)).data.reservations.find(r=>r.id===arrival).room,'TODAY');await status('inline checkout succeeds','reservations','PATCH',{id:arrival,action:'status',status:'checked-out',version:1},200,reception);equal('checkout marks room dirty',docs.get('room_state/TODAY').cleaning,'dirty');await status('completed reservation cannot be reopened','reservations','PATCH',{id:arrival,action:'status',status:'confirmed',version:2},400,reception);
for(const roomNumber of ['AUTO-A','AUTO-B'])await status('add allocatable '+roomNumber,'catalog','POST',{...room,room:roomNumber,city:'Allocation City'},200);const autoQuery=query.replace('Test%20City','Allocation%20City');const auto=(await call('rooms','GET',null,null,autoQuery)).data.rooms;equal('identical rooms grouped into one accommodation',auto.length,1);equal('public category hides inventory counts','availableCount' in auto[0],false);const autoDraft={...draft,categoryId:auto[0].id,city:'Allocation City'};await status('first automatic allocation','reservations','POST',autoDraft,201,guest);await status('second automatic allocation','reservations','POST',autoDraft,201,other);await status('sold out category rejected','reservations','POST',autoDraft,409,guest);

// City isolation uses real API validation and Firestore mutation callbacks.
const delhiStaff='delhi-reception@example.test',delhiManager='delhi-manager@example.test',mumbaiStaff='mumbai-housekeeping@example.test';
await status('owner grants Delhi reception access','staff','PUT',{email:delhiStaff,name:'Delhi reception',role:'receptionist',active:true,cities:['Delhi']},200);
await status('owner grants Delhi manager access','staff','PUT',{email:delhiManager,name:'Delhi manager',role:'manager',active:true,cities:['Delhi']},200);
await status('owner grants Mumbai housekeeping access','staff','PUT',{email:mumbaiStaff,name:'Mumbai housekeeping',role:'housekeeping',active:true,cities:['Mumbai']},200);
await status('empty city grant rejected','staff','PUT',{email:other,name:'Invalid grant',role:'viewer',active:true,cities:[]},400);
await status('unknown city grant rejected','staff','PUT',{email:other,name:'Invalid grant',role:'viewer',active:true,cities:['Unknown City']},400);
await status('manager cannot grant staff access','staff','PUT',{email:other,name:'Invalid grant',role:'viewer',active:true,cities:null},403,delhiManager);
for(const [roomNumber,city] of [['D-SCOPE','Delhi'],['M-SCOPE','Mumbai']])await status('add city test room '+city,'catalog','POST',{...room,room:roomNumber,city,name:city+' Scope Suite'},200);
const scopedDraft={guest:'City Guest',email:guest,phone:'',room:'D-SCOPE',city:'Delhi',adults:2,children:0,guests:2,checkIn:addDays(day,20),checkOut:addDays(day,21),notes:'',status:'confirmed'};
const delhiBooking=(await status('Delhi receptionist books Delhi room','reservations','POST',scopedDraft,201,delhiStaff)).data.id;
await status('Delhi receptionist cannot book Mumbai room','reservations','POST',{...scopedDraft,room:'M-SCOPE',city:'Mumbai'},403,delhiStaff);
const mumbaiBooking=(await call('reservations','POST',{...scopedDraft,room:'M-SCOPE',city:'Mumbai'})).data.id;
for(const resource of ['roomstate','reservations','tasks','payments','activity']){
 const qs=resource==='reservations'?'?scope=hotel&city=Mumbai':'?city=Mumbai';
 const as=resource==='activity'?delhiManager:delhiStaff;
 await status('cross-city GET blocked '+resource,resource,'GET',null,403,as,qs);
}
const scopedRooms=await call('roomstate','GET',null,delhiStaff);
equal('reception room response contains only assigned city',scopedRooms.data.rooms.every(r=>r.city==='Delhi'),true);
equal('city selector contains only assigned city',scopedRooms.data.cities.join(','),'Delhi');
const scopedBookings=await call('reservations','GET',null,delhiStaff,'?scope=hotel');
equal('scoped booking response excludes Mumbai',scopedBookings.data.reservations.some(r=>r.id===mumbaiBooking),false);
equal('scoped booking response includes Delhi',scopedBookings.data.reservations.some(r=>r.id===delhiBooking),true);
await status('cross-city inline status change blocked','reservations','PATCH',{id:mumbaiBooking,action:'status',status:'cancelled',version:0},403,delhiStaff);
const mb=(await call('reservations','GET',null,'owner@example.test','?scope=hotel')).data.reservations.find(r=>r.id===mumbaiBooking);
await status('cannot disguise Mumbai booking as Delhi on edit','reservations','PUT',{...mb,room:'D-SCOPE',city:'Delhi'},403,delhiStaff);
await status('cross-city room maintenance blocked','roomstate','PUT',{room:'M-SCOPE',operational:'maintenance'},403,delhiManager);
await status('cross-city catalog edit blocked','catalog','PUT',{...room,room:'M-SCOPE',city:'Mumbai',name:'Mumbai Scope Suite',version:1},403,delhiManager);
await status('cannot move unauthorized room into assigned city','catalog','PUT',{...room,room:'M-SCOPE',city:'Delhi',version:1},403,delhiManager);
await status('cannot move authorized room outside scope','catalog','PUT',{...room,room:'D-SCOPE',city:'Mumbai',version:1},403,delhiManager);
await status('cannot remove another city room','catalog','DELETE',{room:'M-SCOPE',version:1},403,delhiManager);
const taskBody={title:'City scope housekeeping',room:'D-SCOPE',kind:'housekeeping',priority:'normal',status:'open',assignedTo:'',notes:''};
const delhiTask=(await status('Delhi task created','tasks','POST',taskBody,200,delhiStaff)).data.id;
await status('cross-city task creation blocked','tasks','POST',{...taskBody,room:'M-SCOPE'},403,delhiStaff);
await status('cross-city staff assignment blocked','tasks','POST',{...taskBody,assignedTo:mumbaiStaff},400,delhiStaff);
await status('cross-city room assignment blocked','roomstate','PUT',{room:'D-SCOPE',assignedTo:mumbaiStaff},400,delhiManager);
const mumbaiTask=(await call('tasks','POST',{...taskBody,room:'M-SCOPE'})).data.id;
await status('cross-city task edit cannot swap room to bypass scope','tasks','POST',{...taskBody,id:mumbaiTask},403,delhiStaff);
equal('scoped task list excludes Mumbai',(await call('tasks','GET',null,delhiStaff)).data.tasks.some(t=>t.id===mumbaiTask),false);
equal('scoped staff suggestions exclude unrelated cities',(await call('tasks','GET',null,delhiStaff)).data.staff.some(s=>s.email===mumbaiStaff),false);
const scopedPayment={id:crypto.randomUUID(),bookingId:mumbaiBooking,amount:100,method:'cash',reference:'city test',kind:'payment'};
await status('cross-city payment blocked','payments','POST',scopedPayment,403,delhiStaff);
await status('owner records Mumbai payment','payments','POST',scopedPayment,200);
equal('scoped payment reads exclude Mumbai',(await call('payments','GET',null,delhiStaff)).data.payments.some(p=>p.bookingId===mumbaiBooking),false);
await status('payment replay cannot bypass city scope','payments','POST',scopedPayment,403,delhiStaff);
const scopedActivity=(await call('activity','GET',null,delhiManager)).data.activity;
equal('scoped audit excludes unrelated city and global grants',scopedActivity.every(a=>a.city==='Delhi'),true);
equal('owner particular-city filter excludes other bookings',(await call('reservations','GET',null,'owner@example.test','?scope=hotel&city=Delhi')).data.reservations.every(r=>r.city==='Delhi'),true);
equal('owner all-cities filter sees both city bookings',(await call('reservations','GET',null,'owner@example.test','?scope=hotel&city=all')).data.reservations.some(r=>r.id===mumbaiBooking),true);
await status('owner grants all-city access','staff','PUT',{email:delhiStaff,name:'Reception',role:'receptionist',active:true,cities:null},200);
equal('all-city grant includes Mumbai',(await call('roomstate','GET',null,delhiStaff)).data.rooms.some(r=>r.city==='Mumbai'),true);
await status('owner narrows existing grant','staff','PUT',{email:delhiStaff,name:'Delhi reception',role:'receptionist',active:true,cities:['Delhi']},200);
await status('narrowed access effective on next request','roomstate','GET',null,403,delhiStaff,'?city=Mumbai');
await status('owner revokes staff','staff','PUT',{email:delhiStaff,name:'Delhi reception',role:'receptionist',active:false,cities:['Delhi']},200);
await status('revoked staff cannot read rooms','roomstate','GET',null,403,delhiStaff);
// Security audit regressions exercise the real authorization and state adapter.
const missingScope='unscoped@example.test';docs.set('staff_access/'+encodeURIComponent(missingScope),{email:missingScope,role:'viewer',active:1,name:'Unscoped'});
equal('missing city scope returns no rooms',(await call('roomstate','GET',null,missingScope)).data.rooms.length,0);
equal('missing city scope returns no hotel reservations',(await call('reservations','GET',null,missingScope,'?scope=hotel')).data.reservations.length,0);
await status('external tracking image denied','catalog','POST',{...room,room:'TRACKING',image:'https://tracker.example.test/pixel.png'},400);
const masked=(await call('reservations','GET',null,viewer,'?scope=hotel')).data.reservations;
equal('viewer receives no guest contact details',masked.length>0&&masked.every(r=>r.email===''&&r.phone===''&&r.notes===''&&r.guest.startsWith('Guest ')),true);
equal('viewer receives no payment references',(await call('payments','GET',null,viewer)).data.payments.every(p=>p.reference===''&&p.actor===''),true);
await status('viewer cannot export PII','export','GET',null,403,viewer);
await status('reception cannot export PII','export','GET',null,403,reception);
await status('guest cannot export PII','export','GET',null,403,guest);
await status('scoped manager cannot export other cities','export','GET',null,403,delhiManager,'?city=Mumbai');
const quotaGuest='quota@example.test';
for(let i=0;i<4;i++)await status('add quota test room '+i,'catalog','POST',{...room,room:'QUOTA-'+i,name:'Quota Suite',city:'Quota City'},200);
const quotaCategory=(await call('rooms','GET',null,null,query.replace('Test%20City','Quota%20City'))).data.rooms[0];
const quotaDraft={...draft,categoryId:quotaCategory.id,city:'quota city'};
const attempts=await Promise.all(Array.from({length:4},()=>call('reservations','POST',quotaDraft,quotaGuest)));
equal('concurrent guest requests respect booking cap',attempts.map(r=>r.status).sort().join(','),'201,201,201,429');
const quotaId=attempts.find(r=>r.status===201).data.id;
await status('guest cancels to free quota','reservations','PATCH',{id:quotaId,action:'cancel'},200,quotaGuest);
await status('cancelled stay no longer consumes quota','reservations','POST',quotaDraft,201,quotaGuest);
equal('global hotel revision lock no longer written',docs.has('_system/hotel_revision'),false);
equal('room allocation has a dedicated lock',docs.has('_locks/'+encodeURIComponent('room:QUOTA-0')),true);
equal('guest quota has a dedicated lock',docs.has('_locks/'+encodeURIComponent('guest:uid-'+quotaGuest)),true);
equal('payment and booking mutations share a lock',docs.has('_locks/'+encodeURIComponent('booking:'+id)),true);
const store=await load('lib/firestore-hotel.ts');
docs.set('hotel_tasks/delete-test',{id:'delete-test',title:'Temporary'});
await store.namespace.mutateHotel(s=>{s.hotel_tasks=s.hotel_tasks.filter(r=>r.id!=='delete-test');},{hotel_tasks:{}});
equal('removed rows are deleted from storage',docs.has('hotel_tasks/delete-test'),false);
const formulaBooking=[...docs.values()].find(r=>r.id===quotaId);formulaBooking.guest='  \t=HYPERLINK("https://example.test")';
email='owner@example.test';
const auditBefore=[...docs.values()].filter(r=>r.action==='reservations.exported').length;
const csv=await api(new Request('https://hotel.test/api/admin/reports/reservations.csv?city=Quota%20City'),'export');
equal('management CSV export succeeds',csv.status,200);
equal('CSV export is not cached',csv.headers.get('Cache-Control'),'no-store');
equal('CSV formula with leading whitespace is neutralized',(await csv.text()).includes('"\'  \t=HYPERLINK'),true);
equal('CSV response has a committed audit record',[...docs.values()].filter(r=>r.action==='reservations.exported').length,auditBefore+1);
// Full history must remain correct beyond both the old row limit and one page.
for(const key of [...docs.keys()])if(key.startsWith('reservations/')||key.startsWith('payments/'))docs.delete(key);
const expected={Delhi:{count:0,cancelled:0,booked:0},Mumbai:{count:0,cancelled:0,booked:0}};
for(let i=0;i<5205;i++){
 const city=i%3?'Delhi':'Mumbai',id='history-'+String(i).padStart(5,'0'),status=i%5?'checked-out':'cancelled';
 expected[city].count++;if(status==='cancelled')expected[city].cancelled++;else expected[city].booked+=100;
 docs.set('reservations/'+id,{id,guest:'History Guest '+i,email:'history'+i+'@example.test',phone:'private',notes:'private',owner:'private',city,room:city==='Delhi'?'101':'102',status,total:100,checkIn:day,checkOut:addDays(day,1),createdAt:i%2?'2024-01-01T00:00:00.000Z':'2025-01-01T00:00:00.000Z'});
}
// Imported rows may lack city; resolution must use the room just as before.
docs.get('reservations/history-00001').city=undefined;
for(let i=0;i<6001;i++)docs.set('payments/ledger-'+String(i).padStart(5,'0'),{id:'ledger-'+String(i).padStart(5,'0'),bookingId:'history-00001',amount:i===6000?-1000:1,reference:'private',actor:'private',createdAt:'2025-01-01T00:00:00.000Z'});
docs.set('payments/mumbai',{id:'mumbai',bookingId:'history-00000',amount:17,createdAt:'2025-01-01T00:00:00.000Z'});
let cursor=null,ids=[],seenCursors=new Set(),historyPaid;do{
 const result=await call('reservations','GET',null,'owner@example.test','?scope=hotel'+(cursor?'&cursor='+encodeURIComponent(cursor):''));assert.equal(result.status,200);assert.ok(result.data.reservations.length<=25);
 if('history-00001'in result.data.paid)historyPaid=result.data.paid['history-00001'];ids.push(...result.data.reservations.map(r=>r.id));cursor=result.data.nextCursor;if(cursor){assert.ok(!seenCursors.has(cursor));seenCursors.add(cursor);}
}while(cursor);
equal('all 5205 reservations traversed without truncation',ids.length,5205);
equal('timestamp ties never duplicate reservations',new Set(ids).size,5205);
const summaryModule=await load('lib/history-summary.ts');await summaryModule.evaluate();
let report=summaryModule.namespace.emptySummary();cursor=null;do{
 const result=await call('report','GET',null,delhiManager,'?city=Delhi'+(cursor?'&cursor='+encodeURIComponent(cursor):''));assert.equal(result.status,200);report=summaryModule.namespace.mergeSummary(report,result.data.summary);cursor=result.data.nextCursor;
}while(cursor);
equal('scoped report counts all matching history',report.reservations,expected.Delhi.count);
equal('scoped report cancellation aggregation is complete',report.cancelled,expected.Delhi.cancelled);
equal('scoped booked revenue includes full history',report.booked,expected.Delhi.booked);
equal('native SUM includes over 5000 payments and refunds without downloading ledger',report.collected,5000);
equal('scoped outstanding uses full aggregates',report.outstanding,expected.Delhi.booked-5000);
const first=await call('reservations','GET',null,delhiManager,'?scope=hotel&city=Delhi');
equal('history page paid totals do not use a partial payment page',historyPaid,5000);
const pageCursor=first.data.nextCursor;
await status('payment cursor cannot be reused on reservations','payments','GET',null,400,manager,'?cursor='+encodeURIComponent(pageCursor));
await status('malformed history cursor rejected','reservations','GET',null,400,manager,'?scope=hotel&cursor=garbage');
await status('report rejects unauthorized city','report','GET',null,403,delhiManager,'?city=Mumbai');
await status('guest cannot access aggregate report','report','GET',null,403,guest);
const visiblePage=await call('reservations','GET',null,viewer,'?scope=hotel');
equal('paginated viewer rows still redact contact and ownership',visiblePage.data.reservations.every(r=>!r.email&&!r.phone&&!r.notes&&!('owner'in r)),true);
docs.get('staff_access/'+encodeURIComponent(delhiManager)).active=0;
await status('revocation between pages blocks continuation','reservations','GET',null,403,delhiManager,'?scope=hotel&cursor='+encodeURIComponent(pageCursor));
docs.get('staff_access/'+encodeURIComponent(delhiManager)).active=1;
let ledgerIds=[];cursor=null;do{const result=await call('payments','GET',null,delhiManager,cursor?'?cursor='+encodeURIComponent(cursor):'');assert.equal(result.status,200);assert.ok(result.data.payments.length<=25);ledgerIds.push(...result.data.payments.map(p=>p.id));cursor=result.data.nextCursor;}while(cursor);
equal('ledger pages traverse over 5000 legacy payments within city scope',ledgerIds.length,6001);
equal('ledger cursor ties do not duplicate entries',new Set(ledgerIds).size,6001);
const cursors=await load('lib/history-cursor.ts');await cursors.evaluate();
const expired=await cursors.namespace.sealHistoryCursor({at:'2025',snapshot:'2020-01-01T00:00:00Z',path:'reservations/history-00000'},JSON.stringify(['reservations','uid-'+manager,manager,'manager',null,'all','all','']));
await status('expired snapshot asks client to restart','reservations','GET',null,400,manager,'?scope=hotel&cursor='+encodeURIComponent(expired));
await status('cursor is bound to original city filter','reservations','GET',null,400,delhiManager,'?scope=hotel&cursor='+encodeURIComponent(pageCursor));
await status('cursor is bound to original identity','reservations','GET',null,400,manager,'?scope=hotel&city=Delhi&cursor='+encodeURIComponent(pageCursor));
await status('tampering with encrypted cursor is rejected','reservations','GET',null,400,delhiManager,'?scope=hotel&city=Delhi&cursor='+encodeURIComponent((pageCursor[0]==='A'?'B':'A')+pageCursor.slice(1)));
equal('cursor does not disclose scanned booking identifiers',pageCursor.includes('history-'),false);
const privateSearch=await call('reservations','GET',null,viewer,'?scope=hotel&q='+encodeURIComponent('history5004@example.test'));
equal('viewer cannot probe redacted email through search',privateSearch.data.reservations.length,0);
const ledger=await call('payments','GET',null,viewer);
equal('paginated viewer ledger redacts payment secrets',ledger.data.payments.every(p=>!p.actor&&!p.reference&&!p.guest.includes('History')),true);
let csvRows=0;cursor=null;do{
 email=delhiManager;const response=await api(new Request('https://hotel.test/api/admin/reports/reservations.csv?city=Delhi'+(cursor?'&cursor='+encodeURIComponent(cursor):'')),'export');assert.equal(response.status,200);const text=await response.text();csvRows+=text?text.split('\r\n').length-(cursor?0:1):0;cursor=response.headers.get('X-Next-Cursor');
}while(cursor);
equal('CSV walks all authorized history without the 5000 limit',csvRows,expected.Delhi.count);
for(const [path,row]of docs)if(path.startsWith('reservations/'))Object.assign(row,{status:'confirmed',checkIn:'2020-01-01',checkOut:'2020-01-02'});
await status('room readiness ignores over 5000 expired confirmations','roomstate','GET',null,200);
const operationalPage=await call('reservations','GET',null,'owner@example.test','?scope=hotel&mode=operations');
equal('operational calendar does not load expired history',operationalPage.data.reservations.length,0);
console.log(checks+' isolated hotel API checks passed. No live data or credentials used.');
