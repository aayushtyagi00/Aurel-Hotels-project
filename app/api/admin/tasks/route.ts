import {firestoreEnabled} from '../../../../lib/firestore-hotel';
import {firestoreApi} from '../../../../lib/firestore-api';
import {env} from 'cloudflare:workers';import {z} from 'zod';
import {requireAccess,json,failure,readBody,HttpError,audit} from '../../../../lib/access';
import {rooms} from '../../../../lib/hotel';
const schema=z.object({id:z.string().optional(),title:z.string().trim().min(3).max(150),room:z.string(),kind:z.enum(['housekeeping','maintenance']),priority:z.enum(['normal','high','urgent']),status:z.enum(['open','in-progress','done']),assignedTo:z.union([z.string().email(),z.literal('')]),notes:z.string().max(1000)}).strict();
async function legacyGET(){try{const u=await requireAccess('tasks.read');const restricted=['housekeeping','maintenance'].includes(u.role||'');const rows=await env.DB!.prepare('SELECT id,title,room,kind,priority,status,assigned_to AS assignedTo,notes,created_at AS createdAt FROM hotel_tasks'+(restricted?' WHERE kind=?':'')+' ORDER BY created_at DESC').bind(...(restricted?[u.role]:[])).all();const staff=await env.DB!.prepare('SELECT email,name,role FROM staff_access WHERE active=1').all();return json({tasks:rows.results,staff:staff.results});}catch(e){return failure(e);}}
async function legacyPOST(req:Request){try{const u=await requireAccess('tasks.write');const b=schema.parse(await readBody(req));if(!rooms.some(r=>r.id===b.room))throw new HttpError(400,'Select a valid room.');if(['housekeeping','maintenance'].includes(u.role||'')&&b.kind!==u.role)throw new HttpError(403,'You can manage tasks only in your department.');
 const id=b.id||crypto.randomUUID();
 if(b.id){const old=await env.DB!.prepare('SELECT kind FROM hotel_tasks WHERE id=?').bind(id).first<{kind:string}>();if(!old)throw new HttpError(404,'Task not found.');if(['housekeeping','maintenance'].includes(u.role||'')&&old.kind!==u.role)throw new HttpError(403,'Task access denied.');}
 if(b.assignedTo){const target=await env.DB!.prepare('SELECT email FROM staff_access WHERE email=? AND active=1 AND role IN (?,?,?)').bind(b.assignedTo.toLowerCase(),b.kind,'manager','receptionist').first();if(!target)throw new HttpError(400,'Assign this task to an active staff member in the appropriate department.');}
 const statement=b.id?env.DB!.prepare('UPDATE hotel_tasks SET title=?,room=?,kind=?,priority=?,status=?,assigned_to=?,notes=? WHERE id=?').bind(b.title,b.room,b.kind,b.priority,b.status,b.assignedTo.toLowerCase(),b.notes,id):env.DB!.prepare('INSERT INTO hotel_tasks (id,title,room,kind,priority,status,assigned_to,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,b.title,b.room,b.kind,b.priority,b.status,b.assignedTo.toLowerCase(),b.notes,new Date().toISOString());
 await env.DB!.batch([statement,audit(u.email,b.id?'task.updated':'task.created',id,b.title)]);return json({id});}catch(e){if(e instanceof z.ZodError)return json({error:e.issues[0].message},400);return failure(e);}}
export async function GET(request:Request){return firestoreEnabled()?firestoreApi(request,'tasks'):legacyGET();}

export async function POST(request:Request){return firestoreEnabled()?firestoreApi(request,'tasks'):legacyPOST(request);}
