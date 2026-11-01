const fs=require('fs'),path=require('path'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
const root=process.cwd();let buffer='';process.stdin.setRawMode(true);process.stdin.resume();console.log('Ready for private test configuration on stdin (input hidden).');process.stdin.on('data',async chunk=>{buffer+=chunk.toString();let parsed;try{parsed=JSON.parse(buffer.trim());}catch{return;}process.stdin.pause();buffer='';try{console.log('Private test configuration received.');await run(parsed);process.exitCode=0;}catch(e){console.error(e.stack);process.exitCode=1;}process.stdin.setRawMode(false);process.stdin.destroy();});
async function run(secret){
const suffix=Date.now().toString(36),owner='owner-'+suffix+'@test.invalid',guest='guest-'+suffix+'@test.invalid',other='other-'+suffix+'@test.invalid',house='house-'+suffix+'@test.invalid',reception='reception-'+suffix+'@test.invalid',manager='manager-'+suffix+'@test.invalid';let email=owner,token='',checks=0;
const env={FIRESTORE_ENABLED:'true',FIRESTORE_PROJECT_ID:'aurel-hotels',FIRESTORE_DATABASE_ID:'aurel-hotel',HOTEL_OWNER_EMAIL:owner,FIRESTORE_SERVICE_ACCOUNT_JSON:JSON.stringify(secret)};
const context=vm.createContext({console,crypto:globalThis.crypto,TextEncoder,TextDecoder,btoa,atob,URL,URLSearchParams,Headers,Request,Response,AbortSignal,structuredClone,setTimeout,clearTimeout,fetch:async(url,options)=>{if(String(url).startsWith('https://firestore.googleapis.com/'))token=options.headers.Authorization;return fetch(url,options);}});
const cache=new Map();async function load(filename){filename=path.resolve(root,filename);if(cache.has(filename))return cache.get(filename);let module;
if(filename.endsWith(path.join('lib','auth.ts'))){module=new vm.SyntheticModule(['getHotelUser'],function(){this.setExport('getHotelUser',async()=>email?{email,userId:'firestore-smoke-'+email,fullName:'Firestore smoke test',displayName:'Firestore smoke test'}:null);},{context});}
else if(filename.endsWith(path.join('app','chatgpt-auth.ts'))){module=new vm.SyntheticModule(['getChatGPTUser'],function(){this.setExport('getChatGPTUser',async()=>null);},{context});}
else{const source=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;module=new vm.SourceTextModule(source,{context,identifier:filename});}cache.set(filename,module);
await module.link(async(spec,ref)=>{if(spec==='cloudflare:workers'){const m=new vm.SyntheticModule(['env'],function(){this.setExport('env',env);},{context});await m.link(()=>{});return m;}if(spec==='zod'){const m=new vm.SyntheticModule(['z'],function(){this.setExport('z',require('zod').z);},{context});await m.link(()=>{});return m;}if(!spec.startsWith('.'))throw Error('Unexpected module '+spec);let target=path.resolve(path.dirname(ref.identifier),spec);if(!path.extname(target))target+='.ts';return load(target);});return module;}
console.log('Loading test modules.');const mod=await load('lib/firestore-api.ts');console.log('Evaluating test modules.');await mod.evaluate();const storage=await load('lib/firestore-client.ts');if(storage.status!=='evaluated')await storage.evaluate();
const api=mod.namespace.firestoreApi,client=storage.namespace,base='https://firestore.googleapis.com/v1/projects/aurel-hotels/databases/aurel-hotel/documents';
const original=await client.getDocument('room_state/304');const generated=[];
function ok(name,actual,expected){assert.deepEqual(actual,expected,name);checks++;console.log('PASS '+name);}
async function call(resource,method='GET',body,as=owner,query=''){email=as;const r=await api(new Request('https://hotel.test/api/'+resource+query,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),resource);return{status:r.status,data:await r.json()};}
const day=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10),dates='?start='+day(20)+'&end='+day(22),room={room:'304',notes:'firestore-smoke-'+suffix,rate:26000,cleaning:'clean',operational:'open'};
try{
ok('Firestore public inventory',(await call('rooms','GET',null,null,dates)).status,200);
ok('Anonymous admin denied',(await call('staff','GET',null,null)).status,401);
ok('Guest admin denied',(await call('staff','GET',null,guest)).status,403);
for(const [address,role]of [[house,'housekeeping'],[reception,'receptionist'],[manager,'manager']])ok('Grant '+role,(await call('staff','PUT',{email:address,name:'Firestore smoke '+role,role,active:true})).status,200);
ok('Permanent owner protected',(await call('staff','PUT',{email:owner,name:'Owner',role:'viewer',active:false})).status,400);
ok('Prepare test room',(await call('roomstate','PUT',room)).status,200);
ok('Housekeeping cannot alter rate',(await call('roomstate','PUT',{room:'304',rate:1000},house)).status,403);
const draft={guest:'Firestore smoke test',email:owner,phone:'',room:'304',checkIn:day(20),checkOut:day(22),guests:2,notes:suffix,status:'confirmed'};
let created=await call('reservations','POST',draft,guest);ok('Firestore reservation saved',created.status,201);const id=created.data.id;generated.push(id);
let booking=(await call('reservations','GET',null,guest)).data.reservations.find(r=>r.id===id);
ok('Guest email bound to session',booking.email,guest);ok('Server price preserved',booking.total,52000);
ok('Other guest privacy',(await call('reservations','GET',null,other)).data.reservations.some(r=>r.id===id),false);
ok('Cross-user room conflict',(await call('reservations','POST',draft,other)).status,409);
ok('Reception edits booking',(await call('reservations','PUT',{...booking,notes:'Updated smoke test'},reception)).status,200);
ok('Stale update rejected',(await call('reservations','PUT',booking,reception)).status,409);
const payment={id:crypto.randomUUID(),bookingId:id,amount:1000,method:'cash',reference:suffix,kind:'payment'};
ok('Reception records payment',(await call('payments','POST',payment,reception)).status,200);
ok('Payment idempotency',(await call('payments','POST',payment,reception)).status,200);
ok('Overpayment rejected',(await call('payments','POST',{...payment,id:crypto.randomUUID(),amount:52000})).status,409);
ok('Paid cancellation rejected',(await call('reservations','PATCH',{id,action:'cancel'},guest)).status,409);
ok('Reception refund denied',(await call('payments','POST',{...payment,id:crypto.randomUUID(),kind:'refund'},reception)).status,403);
ok('Manager refunds',(await call('payments','POST',{...payment,id:crypto.randomUUID(),kind:'refund'},manager)).status,200);
ok('Unpaid cancellation succeeds',(await call('reservations','PATCH',{id,action:'cancel'},guest)).status,200);
email=guest;const req=()=>new Request('https://hotel.test/api/reservations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(draft)});
const concurrent=await Promise.all([api(req(),'reservations'),api(req(),'reservations')]);ok('Concurrent booking serialized',concurrent.map(r=>r.status).sort(),[201,409]);for(const r of concurrent){const d=await r.json();if(d.id)generated.push(d.id);}
for(const id of generated.slice(1))await call('reservations','PATCH',{id,action:'cancel'},guest);
ok('Mark room dirty',(await call('roomstate','PUT',{room:'304',cleaning:'dirty'},house)).status,200);
created=await call('reservations','POST',{...draft,checkIn:day(0),checkOut:day(1)},guest);ok('Today booking saved',created.status,201);generated.push(created.data.id);
booking=(await call('reservations','GET',null,guest)).data.reservations.find(r=>r.id===created.data.id);
ok('Dirty check-in blocked',(await call('reservations','PUT',{...booking,status:'checked-in'},reception)).status,409);
await call('roomstate','PUT',{room:'304',cleaning:'clean'},house);
ok('Clean check-in allowed',(await call('reservations','PUT',{...booking,status:'checked-in'},reception)).status,200);
booking=(await call('reservations','GET',null,guest)).data.reservations.find(r=>r.id===created.data.id);
ok('Checkout allowed',(await call('reservations','PUT',{...booking,status:'checked-out'},reception)).status,200);
ok('Checkout dirties room',(await call('roomstate')).data.rooms.find(r=>r.id==='304').cleaning,'dirty');
ok('Revoke manager',(await call('staff','PUT',{email:manager,name:'Revoked smoke manager',role:'manager',active:false})).status,200);
ok('Revocation immediately enforced',(await call('payments','GET',null,manager)).status,403);
console.log(checks+' Firestore transaction/authorization checks passed.');
}finally{
const paths=[];for(const collection of ['reservations','staff_access','payments','activity','room_state']){const rows=await client.queryDocuments(collection);for(const r of rows){const d=r.data;if(collection==='reservations'&&String(d.owner||'').includes(suffix)||collection==='staff_access'&&String(d.email||'').includes(suffix)||collection==='payments'&&d.reference===suffix||collection==='activity'&&String(d.actor||'').includes(suffix)||collection==='room_state'&&d.notes==='firestore-smoke-'+suffix){paths.push({delete:base.replace('https://firestore.googleapis.com/v1/','')+'/'+r.path,currentDocument:{updateTime:r.updateTime}});}}}
const current=await client.getDocument('room_state/304');if(original&&current?.data.notes==='firestore-smoke-'+suffix){const index=paths.findIndex(p=>p.delete.endsWith('/room_state/304'));if(index>=0)paths.splice(index,1);await client.commitDocuments([{path:'room_state/304',data:original.data,updateTime:current.updateTime}]);}
if(paths.length){const r=await fetch(base+':commit',{method:'POST',headers:{Authorization:token,'Content-Type':'application/json'},body:JSON.stringify({writes:paths})});if(!r.ok)throw Error('Test cleanup failed: '+r.status);}console.log('Isolated Firestore test records cleaned up.');}
}
