import {env} from 'cloudflare:workers';
import {z} from 'zod';
import {getRooms} from '../../../../lib/room-data';
import {rooms} from '../../../../lib/hotel';
import {can} from '../../../../lib/permissions';
import {requireAccess,json,failure,readBody,HttpError,audit} from '../../../../lib/access';
export async function GET(){try{await requireAccess('rooms.read');const data=await getRooms();const busy=await env.DB!.prepare("SELECT DISTINCT room FROM reservations WHERE status='checked-in'").all<{room:string}>();return json({rooms:data.map(r=>({...r,occupied:busy.results.some(b=>b.room===r.id)}))});}catch(e){return failure(e);}}
const schema=z.object({room:z.string(),cleaning:z.enum(['clean','dirty','cleaning','inspection']).optional(),operational:z.enum(['open','maintenance']).optional(),rate:z.number().int().min(500).max(200000).optional(),assignedTo:z.union([z.string().email(),z.literal('')]).optional(),notes:z.string().max(1000).optional()}).strict();
export async function PUT(req:Request){try{const u=await requireAccess('rooms.read');const b=schema.parse(await readBody(req));if(!rooms.some(r=>r.id===b.room))throw new HttpError(404,'Room not found.');
 if(!can(u.role,'rooms.write')){
 if(b.rate!==undefined||b.assignedTo!==undefined||b.notes!==undefined)throw new HttpError(403,'Only management can change room details.');
 if(b.cleaning!==undefined&&!can(u.role,'cleaning.write'))throw new HttpError(403,'Cleaning access required.');
 if(b.operational!==undefined&&!can(u.role,'maintenance.write'))throw new HttpError(403,'Maintenance access required.');
 if(b.cleaning===undefined&&b.operational===undefined)throw new HttpError(403,'No permitted changes.');
 }
 if(b.assignedTo){const assignee=await env.DB!.prepare('SELECT email FROM staff_access WHERE email=? AND active=1').bind(b.assignedTo.toLowerCase()).first();if(!assignee)throw new HttpError(400,'Choose an active staff member.');}
 const current=(await getRooms()).find(r=>r.id===b.room)!;
 await env.DB!.batch([env.DB!.prepare('INSERT INTO room_state (room,cleaning,operational,rate,assigned_to,notes,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(room) DO UPDATE SET cleaning=excluded.cleaning,operational=excluded.operational,rate=excluded.rate,assigned_to=excluded.assigned_to,notes=excluded.notes,updated_at=excluded.updated_at').bind(b.room,b.cleaning??current.cleaning,b.operational??current.operational,b.rate??current.rate,b.assignedTo?.toLowerCase()??current.assignedTo,b.notes??current.notes,new Date().toISOString()),audit(u.email,'room.updated',b.room,JSON.stringify(b))]);return json({ok:true});
 }catch(e){if(e instanceof z.ZodError)return json({error:e.issues[0].message},400);return failure(e);}}