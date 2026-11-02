import {getDocument,queryDocuments,runTransaction,type DocumentData,type Write} from './firestore-client';
import {rooms as inventory} from './hotel';
// A small single-property hotel. All writes acquire the same revision document
// inside a Firestore transaction, preserving room and payment invariants across
// separate documents. Collections are server-only; no hotel data is downloaded
// wholesale by a browser. Large hotels should use per-room/per-booking locks.
export const collections=['reservations','staff_access','room_state','hotel_tasks','payments','activity'] as const;
export type Collection=typeof collections[number];
export type RecordData=DocumentData & {id?:string;email?:string;room?:string};
export type HotelData=Record<Collection,RecordData[]>;
export const recordKey=(collection:Collection,row:RecordData)=>String(collection==='staff_access'?row.email:collection==='room_state'?row.room:row.id);
export const documentPath=(collection:Collection,row:RecordData)=>collection+'/'+encodeURIComponent(recordKey(collection,row));
export async function readHotel(transaction?:string):Promise<HotelData>{const rows=await Promise.all(collections.map(c=>queryDocuments(c,{},transaction)));return Object.fromEntries(collections.map((c,i)=>[c,rows[i].map(r=>r.data)])) as HotelData;}
export async function readInventory():Promise<HotelData>{const [reservations,states]=await Promise.all([queryDocuments('reservations'),queryDocuments('room_state')]);return{reservations:reservations.map(r=>r.data),room_state:states.map(r=>r.data),staff_access:[],hotel_tasks:[],payments:[],activity:[]};}
export async function mutateHotel<T>(change:(data:HotelData)=>T|Promise<T>):Promise<T>{
 return runTransaction(async transaction=>{
  const revision=await getDocument('_system/hotel_revision',transaction);
  const state=await readHotel(transaction),before=structuredClone(state);
  const result=await change(state),writes:Write[]=[];
  for(const c of collections){const previous=new Map(before[c].map(r=>[recordKey(c,r),JSON.stringify(r)]));for(const row of state[c]){if(previous.get(recordKey(c,row))!==JSON.stringify(row))writes.push({path:documentPath(c,row),data:row});}}
  if(writes.length)writes.push({path:'_system/hotel_revision',data:{revision:Number(revision?.data.revision||0)+1},exists:!!revision});
  return{result,writes};
 });
}
export function hotelRooms(data:HotelData){
 const ids=new Set([...inventory.map(r=>r.id),...data.room_state.filter(s=>s.name).map(s=>String(s.room))]);
 return [...ids].flatMap(id=>{const seed=inventory.find(r=>r.id===id),s=data.room_state.find(s=>s.room===id);if(s?.deleted)return[];const base=seed||{id,name:'Room',type:'Classic',city:'Delhi',capacity:2,floor:1,area:30,tone:'sage',detail:'',features:[],rate:6500,image:'/images/classic.webp'};return[{...base,id,name:String(s?.name??base.name),type:String(s?.type??base.type),city:String(s?.city??base.city),capacity:Number(s?.capacity??base.capacity),area:Number(s?.area??base.area),floor:Number(s?.floor??base.floor),detail:String(s?.detail??base.detail),features:(s?.features??base.features) as string[],image:String(s?.image??base.image),catalogVersion:Number(s?.catalogVersion||0),rate:Number(s?.rate??base.rate),cleaning:String(s?.cleaning||'clean'),operational:String(s?.operational||'open'),assignedTo:String(s?.assignedTo||''),notes:String(s?.notes||''),updatedAt:String(s?.updatedAt||'')}];});
}
export function recordActivity(data:HotelData,actor:string,action:string,entity:string,detail='',city:string|null=null){data.activity.push({id:crypto.randomUUID(),actor,action,entity,detail,city,created_at:new Date().toISOString()});}
