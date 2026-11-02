import {today,addDays,nights} from './hotel';
export function validDate(value:string|null|undefined):value is string{
 return !!value&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
}
// Links can be edited or shared long after their original stay dates.
export function readSearch(params:URLSearchParams){
 const arrival=params.get('start'),departure=params.get('end');
 const start=validDate(arrival)&&arrival>=today()?arrival:today();
 const end=validDate(departure)&&nights(start,departure)>=1&&nights(start,departure)<=30?departure:addDays(start,1);
 const count=(key:string,fallback:number,min:number,max:number)=>{const raw=params.get(key);const value=raw===null||raw.trim()===''?fallback:Number(raw);return Number.isInteger(value)&&value>=min&&value<=max?value:fallback;};
 const adults=count('adults',2,1,8),children=count('children',0,0,8-adults);
 return {dates:{start,end},search:{city:params.get('city')?.trim().slice(0,80)||'Delhi',adults,children}};
}
