export const rooms = [
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
];
export type Reservation={version:number;id:string;guest:string;email:string;phone:string;room:string;checkIn:string;checkOut:string;guests:number;status:string;total:number;notes:string;createdAt:string};
export const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n);
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const addDays=(s:string,n:number)=>new Date(Date.parse(s+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
export const nights=(a:string,b:string)=>Math.round((Date.parse(b)-Date.parse(a))/86400000);
export const active=(r:Reservation)=>['confirmed','checked-in'].includes(r.status);