import {firestoreEnabled} from '../../../../lib/firestore-hotel';
import {firestoreApi} from '../../../../lib/firestore-api';
import {env} from 'cloudflare:workers';import {requireAccess,json,failure} from '../../../../lib/access';
async function legacyGET(){try{await requireAccess('audit.read');const r=await env.DB!.prepare('SELECT * FROM activity ORDER BY created_at DESC LIMIT 200').all();return json({activity:r.results});}catch(e){return failure(e);}}
export async function GET(request:Request){return firestoreEnabled()?firestoreApi(request,'activity'):legacyGET();}
