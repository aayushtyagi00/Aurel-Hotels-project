import {firestoreEnabled} from '../../../lib/firestore-hotel';
import {firestoreApi} from '../../../lib/firestore-api';
import {env} from 'cloudflare:workers';
import {z} from 'zod';
import {getRooms} from '../../../lib/room-data';
import {json,failure,HttpError} from '../../../lib/access';
import {nights,today} from '../../../lib/hotel';
async function legacyGET(req:Request){try{const p=new URL(req.url).searchParams;const start=p.get('start')||today(),end=p.get('end');if(!end||!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||!Number.isFinite(nights(start,end))||nights(start,end)<1||nights(start,end)>30)throw new HttpError(400,'Select a stay of 1 to 30 nights.');const blocked=await env.DB!.prepare("SELECT DISTINCT room FROM reservations WHERE status IN ('confirmed','checked-in') AND check_in<? AND check_out>?").bind(end,start).all<{room:string}>();const rooms=await getRooms();return json({rooms:rooms.map(({cleaning,assignedTo,notes,updatedAt,operational,...r})=>({...r,available:operational==='open'&&!blocked.results.some(b=>b.room===r.id)}))});}catch(e){return failure(e);}}
export async function GET(request:Request){return firestoreEnabled()?firestoreApi(request,'rooms'):legacyGET(request);}
