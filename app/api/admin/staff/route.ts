import {firestoreEnabled} from '../../../../lib/firestore-hotel';
import {firestoreApi} from '../../../../lib/firestore-api';
import {env} from 'cloudflare:workers';
import {z} from 'zod';
import {roles} from '../../../../lib/permissions';
import {requireAccess,json,failure,readBody,HttpError,audit,OWNER_EMAIL} from '../../../../lib/access';
async function legacyGET(){try{await requireAccess('staff.write');const r=await env.DB!.prepare('SELECT email,name,role,active,updated_at AS updatedAt FROM staff_access ORDER BY active DESC,name').all();return json({staff:r.results,owner:OWNER_EMAIL});}catch(e){return failure(e);}}
const schema=z.object({email:z.string().email().max(254).transform(s=>s.trim().toLowerCase()),name:z.string().trim().min(2).max(80),role:z.enum(roles),active:z.boolean()}).strict();
async function legacyPUT(req:Request){try{const u=await requireAccess('staff.write');const b=schema.parse(await readBody(req));if(b.email===OWNER_EMAIL)throw new HttpError(400,'The owner account cannot be changed.');
 await env.DB!.batch([env.DB!.prepare('INSERT INTO staff_access (email,name,role,active,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET name=excluded.name,role=excluded.role,active=excluded.active,updated_at=excluded.updated_at').bind(b.email,b.name,b.role,b.active?1:0,new Date().toISOString()),audit(u.email,b.active?'staff.granted':'staff.revoked',b.email,b.role)]);
 return json({ok:true});}catch(e){if(e instanceof z.ZodError)return json({error:e.issues[0].message},400);return failure(e);}}
export async function GET(request:Request){return firestoreEnabled()?firestoreApi(request,'staff'):legacyGET();}

export async function PUT(request:Request){return firestoreEnabled()?firestoreApi(request,'staff'):legacyPUT(request);}
