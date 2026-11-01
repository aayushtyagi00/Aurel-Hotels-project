import {env} from 'cloudflare:workers';
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
export function firestoreEnabled(){return(env as typeof env & {FIRESTORE_ENABLED?:string}).FIRESTORE_ENABLED==='true';}
export const recordKey=(collection:Collection,row:RecordData)=>String(collection==='staff_access'?row.email:collection==='room_state'?row.room:row.id);
export const documentPath=(collection:Collection,row:RecordData)=>collection+'/'+encodeURIComponent(recordKey(collection,row));
export async function readHotel(transaction?:string):Promise<HotelData>{const rows=await Promise.all(collections.map(c=>queryDocuments(c,{},transaction)));return Object.fromEntries(collections.map((c,i)=>[c,rows[i].map(r=>r.data)])) as HotelData;}
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
export function hotelRooms(data:HotelData){return inventory.map(r=>{const s=data.room_state.find(s=>s.room===r.id);return{...r,rate:Number(s?.rate??r.rate),cleaning:String(s?.cleaning||'clean'),operational:String(s?.operational||'open'),assignedTo:String(s?.assignedTo||''),notes:String(s?.notes||''),updatedAt:String(s?.updatedAt||''),image:'/images/'+(r.type==='Classic'?'classic':r.type==='Deluxe'?'deluxe':'suite')+'.jpg'};});}
export function recordActivity(data:HotelData,actor:string,action:string,entity:string,detail=''){data.activity.push({id:crypto.randomUUID(),actor,action,entity,detail,created_at:new Date().toISOString()});}
