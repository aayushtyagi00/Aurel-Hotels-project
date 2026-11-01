import PublicSite from './public-site';import {identity} from '../lib/access';
export const dynamic='force-dynamic';
export default async function Page(){const u=await identity();return <PublicSite user={u?{name:u.fullName||u.email,email:u.email,role:u.role}:null}/>;}