import {roomPhotos} from './room-photos';
export const majorCities = ['Delhi','Mumbai','Kolkata','Bengaluru','Chennai','Hyderabad','Pune','Jaipur','Ahmedabad','Lucknow','Chandigarh','Kochi'];
const legacyRooms = [
{id:'101',name:'Garden Classic',type:'Classic',rate:6500,capacity:2,floor:1,area:32,tone:'sage',detail:'A peaceful retreat overlooking the courtyard.',features:['King bed','Garden view','Rain shower']},
{id:'102',name:'Garden Classic',type:'Classic',rate:6500,capacity:2,floor:1,area:32,tone:'sage',detail:'A peaceful retreat overlooking the courtyard.',features:['King bed','Garden view','Rain shower']},
{id:'103',name:'Courtyard Twin',type:'Classic',rate:7000,capacity:2,floor:1,area:36,tone:'sand',detail:'A light-filled space made for shared adventures.',features:['Twin beds','Courtyard view','Work desk']},
{id:'104',name:'Courtyard Twin',type:'Classic',rate:7000,capacity:2,floor:1,area:36,tone:'sand',detail:'A light-filled space made for shared adventures.',features:['Twin beds','Courtyard view','Work desk']},
{id:'201',name:'Terrace Deluxe',type:'Deluxe',rate:9500,capacity:3,floor:2,area:46,tone:'clay',detail:'Slow mornings, a private terrace, and room to unwind.',features:['King bed','Private terrace','Soaking tub']},
{id:'202',name:'Terrace Deluxe',type:'Deluxe',rate:9500,capacity:3,floor:2,area:46,tone:'clay',detail:'Slow mornings, a private terrace, and room to unwind.',features:['King bed','Private terrace','Soaking tub']},
{id:'203',name:'Panorama Deluxe',type:'Deluxe',rate:11000,capacity:3,floor:2,area:52,tone:'sage',detail:'Expansive views meet understated luxury.',features:['King bed','Panoramic view','Lounge area']},
{id:'204',name:'Panorama Deluxe',type:'Deluxe',rate:11000,capacity:3,floor:2,area:52,tone:'sage',detail:'Expansive views meet understated luxury.',features:['King bed','Panoramic view','Lounge area']},
{id:'301',name:'The Aurel Suite',type:'Suite',rate:18000,capacity:4,floor:3,area:78,tone:'sand',detail:'Your own elevated sanctuary, above it all.',features:['King + sofa bed','Living room','Private balcony']},
{id:'302',name:'The Aurel Suite',type:'Suite',rate:18000,capacity:4,floor:3,area:78,tone:'sand',detail:'Your own elevated sanctuary, above it all.',features:['King + sofa bed','Living room','Private balcony']},
{id:'303',name:'Skyline Penthouse',type:'Suite',rate:26000,capacity:4,floor:3,area:110,tone:'clay',detail:'A remarkable stay with the city at your feet.',features:['Two bedrooms','Rooftop deck','Dining area']},
{id:'304',name:'Skyline Penthouse',type:'Suite',rate:26000,capacity:4,floor:3,area:110,tone:'clay',detail:'A remarkable stay with the city at your feet.',features:['Two bedrooms','Rooftop deck','Dining area']}
].map((room,index)=>({...room,city:majorCities[index],image:'/images/'+(room.type==='Classic'?'classic':room.type==='Deluxe'?'deluxe':'suite')+'.webp'}));
// Six Classic, six Deluxe and four Suite rooms per city. Legacy IDs retain
// their city, capacity, price and booking identity; new IDs are city-prefixed.
const variants=[
 {name:'Essential Single',type:'Classic',capacity:1,rate:2800,area:20,detail:'A calm, compact room for solo guests and short city visits.',features:['Single bed','Work desk','Wi-Fi']},
 {name:'Classic Queen',type:'Classic',capacity:2,rate:4200,area:26,detail:'A comfortable queen room for couples, with space to settle in.',features:['Queen bed','Air conditioning','Wi-Fi']},
 {name:'Classic Twin',type:'Classic',capacity:2,rate:4600,area:28,detail:'An easy shared stay with twin sleeping arrangements and a work corner.',features:['Twin beds','Work desk','Wi-Fi']},
 {name:'Courtyard Classic',type:'Classic',capacity:2,rate:5000,area:30,detail:'An inviting room with quiet tones and thoughtful everyday comforts.',features:['Double bed','Reading corner','Wi-Fi']},
 {name:'Workday Classic',type:'Classic',capacity:2,rate:5200,area:30,detail:'A practical retreat for business travel, with room to work and unwind.',features:['Queen bed','Work desk','Tea and coffee']},
 {name:'Family Classic',type:'Classic',capacity:3,rate:5800,area:34,detail:'A flexible, comfortable base for a small family or three friends.',features:['Family sleeping area','Air conditioning','Wi-Fi']},
 {name:'Deluxe King',type:'Deluxe',capacity:2,rate:7800,area:40,detail:'A generous king room with soft finishes and an unhurried atmosphere.',features:['King bed','Lounge chair','Tea and coffee']},
 {name:'Deluxe Twin',type:'Deluxe',capacity:2,rate:8200,area:42,detail:'Spacious shared accommodation with separate beds and a sitting corner.',features:['Twin beds','Sitting area','Work desk']},
 {name:'Executive Deluxe',type:'Deluxe',capacity:3,rate:9200,area:46,detail:'More space for longer stays, with a comfortable place to work or relax.',features:['King bed','Additional sleeping space','Work desk']},
 {name:'Family Deluxe',type:'Deluxe',capacity:4,rate:10500,area:52,detail:'An open, welcoming family room with flexible sleeping arrangements.',features:['Family sleeping area','Sitting area','Tea and coffee']},
 {name:'Grand Deluxe',type:'Deluxe',capacity:4,rate:12000,area:58,detail:'A roomy retreat for families and friends who appreciate a little more space.',features:['Flexible sleeping area','Lounge space','Work desk']},
 {name:'Deluxe Studio',type:'Deluxe',capacity:3,rate:9800,area:48,detail:'A relaxed studio-style stay for a small family or an extended city visit.',features:['King bed','Additional sleeping space','Sitting area']},
 {name:'Junior Suite',type:'Suite',capacity:3,rate:14500,area:65,detail:'A considered suite with generous space to settle in and switch off.',features:['King bed','Additional sleeping space','Lounge area']},
 {name:'Family Suite',type:'Suite',capacity:6,rate:18500,area:88,detail:'A spacious family suite designed for up to six guests travelling together.',features:['Family sleeping areas','Living area','Dining space']},
 {name:'Grand Family Suite',type:'Suite',capacity:8,rate:22500,area:110,detail:'Our largest family option, with flexible sleeping and gathering space for eight.',features:['Family sleeping areas','Large living area','Dining space']},
 {name:'Aurel Signature Suite',type:'Suite',capacity:4,rate:26000,area:95,detail:'An expansive signature stay with refined details and room for a slower pace.',features:['King sleeping area','Additional sleeping space','Living and dining area']},
];
const codes=['DEL','MUM','KOL','BLR','CHE','HYD','PUN','JAI','AMD','LKO','IXC','COK'];
const photoOffsets:Record<string,number>={Classic:0,Deluxe:0,Suite:0};
function nextPhoto(type:string){const choices=roomPhotos.filter(p=>p.type===type),photo=choices[photoOffsets[type]++];if(!photo)throw Error('Missing distinct room photograph for '+type);return photo.image;}
export const rooms=majorCities.flatMap((city,cityIndex)=>{
 const retained=legacyRooms[cityIndex],slot=retained.type==='Classic'?3:retained.type==='Deluxe'?8:12;
 return variants.map((variant,index)=>index===slot?{...retained,image:nextPhoto(retained.type)}:{...variant,id:codes[cityIndex]+'-'+variant.type[0]+String(index+1).padStart(2,'0'),city,floor:variant.type==='Classic'?1:variant.type==='Deluxe'?2:3,tone:variant.type==='Suite'?'sand':'sage',image:nextPhoto(variant.type)});
});
export type Reservation={version:number;id:string;guest:string;email:string;phone:string;room:string;checkIn:string;checkOut:string;guests:number;status:string;total:number;notes:string;createdAt:string;adults?:number;children?:number;city?:string;roomName?:string;image?:string};
export const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n);
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const addDays=(s:string,n:number)=>new Date(Date.parse(s+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
export const nights=(a:string,b:string)=>Math.round((Date.parse(b)-Date.parse(a))/86400000);
export const active=(r:Reservation)=>['confirmed','checked-in'].includes(r.status);