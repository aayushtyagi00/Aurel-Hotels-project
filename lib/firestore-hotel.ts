import {getDocument,queryDocuments,runTransaction,type DocumentData,type Write} from './firestore-client';
import {rooms as inventory} from './hotel';
import {safeImage} from './security';
// Server-only state adapter. Read plans load only a resource's dependencies.
// Mutations serialize room allocation, guest quotas and payment balances with
// per-entity revision documents, rather than one hotel-wide revision document.
export const collections=['reservations','staff_access','room_state','hotel_tasks','payments','activity'] as const;
export type Collection=typeof collections[number];
export type RecordData=DocumentData & {id?:string;email?:string;room?:string};
export type HotelData=Record<Collection,RecordData[]>;
export const recordKey=(collection:Collection,row:RecordData)=>String(collection==='staff_access'?row.email:collection==='room_state'?row.room:row.id);
export const documentPath=(collection:Collection,row:RecordData)=>collection+'/'+encodeURIComponent(recordKey(collection,row));
export type ReadPlan=Partial<Record<Collection,Record<string,unknown>>>;
export const fieldFilter=(field:string,value:unknown,op='EQUAL')=>({fieldFilter:{field:{fieldPath:field},op,value:typeof value==='string'?{stringValue:value}:value}});
export const activeReservations={where:fieldFilter('status',{arrayValue:{values:[{stringValue:'confirmed'},{stringValue:'checked-in'}]}},'IN')};
export async function readHotel(transaction?:string,plan:ReadPlan=Object.fromEntries(collections.map(c=>[c,{}]))):Promise<HotelData>{
 const rows=await Promise.all(collections.map(async c=>{
  if(!plan[c])return [];
  const result=await queryDocuments(c,{limit:5001,...plan[c]},transaction);
  // Fail explicitly instead of silently truncating data used by invariants.
  if(result.length>5000)throw new Error('Hotel query exceeds the supported result size. Archive history or narrow the query.');
  return result.map(r=>r.data);
 }));
 return Object.fromEntries(collections.map((c,i)=>[c,rows[i]])) as HotelData;
}
export function inventoryCityFilters(base:HotelData,city:string){
 const candidates=hotelRooms(base).filter(r=>r.city.trim().toLowerCase()===city.trim().toLowerCase());
 const filters=[...new Set(candidates.map(r=>r.city))].map(value=>fieldFilter('city',value));
 // Only original imported room IDs need a fallback for records without city.
 const legacyIds=new Set(inventory.filter(r=>/^\d{3}$/.test(r.id)).map(r=>r.id));
 return [...filters,...candidates.filter(r=>legacyIds.has(r.id)).map(r=>fieldFilter('room',r.id))];
}
export async function readInventory(start:string,end:string,city:string):Promise<HotelData>{
 const base=await readHotel(undefined,{room_state:{}}),cityFilters=inventoryCityFilters(base,city);
 if(!cityFilters.length)return base;
 const reservations=await readHotel(undefined,{reservations:{where:{compositeFilter:{op:'AND',filters:[activeReservations.where,fieldFilter('checkOut',start,'GREATER_THAN'),fieldFilter('checkIn',end,'LESS_THAN'),{compositeFilter:{op:'OR',filters:cityFilters}}]}}}});
 return {...base,reservations:reservations.reservations};
}
export async function mutateHotel<T>(change:(data:HotelData)=>T|Promise<T>,plan?:ReadPlan|((base:HotelData)=>ReadPlan)):Promise<T>{
 return runTransaction(async transaction=>{
  let state:HotelData;
  if(typeof plan==='function'){
   const base=await readHotel(transaction,{staff_access:{},room_state:{}});
   const details=await readHotel(transaction,plan(base));
   state={...details,staff_access:base.staff_access,room_state:base.room_state};
  }else state=await readHotel(transaction,plan);
  const before=structuredClone(state);
  const result=await change(state),writes:Write[]=[],locks=new Set<string>();
  const lockRow=(c:Collection,row:RecordData)=>{
   if(c==='activity')return;
   locks.add(c+':'+recordKey(c,row));
   if(c==='reservations'){
    locks.add('room:'+row.room);locks.add('booking:'+row.id);if(row.owner)locks.add('guest:'+row.owner);if(row.email)locks.add('guest-email:'+String(row.email).toLowerCase());
   }
   if(c==='room_state')locks.add('room:'+row.room);
   if(c==='payments')locks.add('booking:'+row.bookingId);
  };
  for(const c of collections){
   const previous=new Map(before[c].map(r=>[recordKey(c,r),r]));
   for(const row of state[c]){
    const key=recordKey(c,row),old=previous.get(key);previous.delete(key);
    if(JSON.stringify(old)!==JSON.stringify(row)){writes.push({path:documentPath(c,row),data:row});lockRow(c,row);if(old)lockRow(c,old);}
   }
   for(const old of previous.values()){writes.push({path:documentPath(c,old),delete:true});lockRow(c,old);}
  }
  // Read every lock before committing any writes. Missing lock documents use an
  // exists:false precondition so simultaneous first-use requests also retry.
  for(const key of [...locks].sort()){
   const path='_locks/'+encodeURIComponent(key),old=await getDocument(path,transaction);
   writes.push({path,data:{revision:Number(old?.data.revision||0)+1},exists:!!old});
  }
  return{result,writes};
 });
}
export function hotelRooms(data:HotelData){
 const ids=new Set([...inventory.map(r=>r.id),...data.room_state.filter(s=>s.name).map(s=>String(s.room))]);
 return [...ids].flatMap(id=>{const seed=inventory.find(r=>r.id===id),s=data.room_state.find(s=>s.room===id);if(s?.deleted)return[];const base=seed||{id,name:'Room',type:'Classic',city:'Delhi',capacity:2,floor:1,area:30,tone:'sage',detail:'',features:[],rate:6500,image:'/images/classic.webp'};return[{...base,id,name:String(s?.name??base.name),type:String(s?.type??base.type),city:String(s?.city??base.city),capacity:Number(s?.capacity??base.capacity),area:Number(s?.area??base.area),floor:Number(s?.floor??base.floor),detail:String(s?.detail??base.detail),features:(s?.features??base.features) as string[],image:safeImage(String(s?.image??base.image)),catalogVersion:Number(s?.catalogVersion||0),rate:Number(s?.rate??base.rate),cleaning:String(s?.cleaning||'clean'),operational:String(s?.operational||'open'),assignedTo:String(s?.assignedTo||''),notes:String(s?.notes||''),updatedAt:String(s?.updatedAt||'')}];});
}
export function recordActivity(data:HotelData,actor:string,action:string,entity:string,detail='',city:string|null=null){data.activity.push({id:crypto.randomUUID(),actor,action,entity,detail,city,created_at:new Date().toISOString()});}
