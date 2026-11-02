'use client';
import {useState} from 'react';
import {ArrowRight,MapPin,Users} from 'lucide-react';
import {today,addDays,nights,majorCities} from '../lib/hotel';
import {navigate} from '../lib/navigation';
export type SearchGuests={city:string;adults:number;children:number};
export function searchParams(start:string,end:string,search:SearchGuests){return new URLSearchParams({start,end,city:search.city,adults:String(search.adults),children:String(search.children)}).toString();}
export default function AvailabilitySearch({start,end,search,cities=[]}:{start:string;end:string;search:SearchGuests;cities?:string[]}){
 const [arrival,setArrival]=useState(start),[departure,setDeparture]=useState(end),[city,setCity]=useState(search.city),[adults,setAdults]=useState(search.adults),[children,setChildren]=useState(search.children),[error,setError]=useState('');
 return <><form noValidate className="availability-bar hotel-search" onSubmit={e=>{e.preventDefault();const duration=nights(arrival,departure);if(!city.trim()||!Number.isFinite(duration)||duration<1||duration>30||arrival<today()||!Number.isInteger(adults)||!Number.isInteger(children)||adults<1||children<0||adults+children>8){setError('Choose a city, a stay of 1–30 nights from today, and 1–8 guests including an adult.');return;}setError('');navigate('/rooms?'+searchParams(arrival,departure,{city,adults,children}));}}>
 <label className="city-search"><span><MapPin size={14}/>CITY</span><select aria-label="Destination city" value={city} onChange={e=>setCity(e.target.value)}>{[...new Set([...majorCities,...cities,search.city])].sort().map(c=><option value={c} key={c}>{c}</option>)}</select></label>
 <label>CHECK-IN<input aria-label="Arrival date" type="date" value={arrival} min={today()} required onChange={e=>{const value=e.target.value;setArrival(value);if(value&&departure<=value)setDeparture(addDays(value,1));}}/></label>
 <label>CHECK-OUT<input aria-label="Departure date" type="date" value={departure} min={arrival?addDays(arrival,1):today()} max={arrival?addDays(arrival,30):undefined} required onChange={e=>setDeparture(e.target.value)}/></label>
 <details className="guest-picker"><summary><span><Users size={14}/>GUESTS</span><strong>{adults+children} {adults+children===1?'guest':'guests'}</strong><small>{adults} adults · {children} children</small></summary><div className="guest-popover"><label>Adults<small>At least one adult</small><input aria-label="Number of adults" type="number" min={1} max={8-children} value={adults} onChange={e=>setAdults(Number(e.target.value))} required/></label><label>Children<small>Count towards room capacity</small><input aria-label="Number of children" type="number" min={0} max={8-adults} value={children} onChange={e=>setChildren(Number(e.target.value))} required/></label></div></details>
 <button className="primary">Check availability <ArrowRight size={17}/></button>
 </form>{error&&<p className="search-validation" role="alert">{error}</p>}</>;
}
