import PublicSite from '../public-site';
import {identity} from '../../lib/access';

export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{start?:string;end?:string;city?:string;adults?:string;children?:string}>}){
 const u=await identity();
 const q=await searchParams;
 const valid=(s?:string)=>!!s&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s));
 return <PublicSite page="rooms" user={u?{name:u.fullName||u.email,email:u.email,role:u.role}:null} dates={valid(q.start)&&valid(q.end)?{start:q.start!,end:q.end!}:undefined} search={{city:q.city||'Delhi',adults:Number(q.adults||2),children:Number(q.children||0)}}/>;
}
