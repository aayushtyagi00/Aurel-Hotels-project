import type {Role} from './permissions';
export type CityScope=string[]|null;
export function cityKey(city:unknown){return typeof city==='string'?city.trim().toLowerCase():'';}
// Existing grants predate city scoping and retain their previous all-city access.
// New grants must explicitly choose all cities (null) or one or more cities.
export function staffScope(role:Role|null,cities:unknown):CityScope{
 if(role==='owner')return null;
 if(!role)return [];
 if(cities===null||cities===undefined)return null;
 return Array.isArray(cities)?cities.filter((c):c is string=>typeof c==='string'&&!!c.trim()):[];
}
export function inCity(scope:CityScope,city:unknown){return scope===null||!!cityKey(city)&&scope.some(c=>cityKey(c)===cityKey(city));}
export function scopesOverlap(a:CityScope,b:CityScope){return a===null?b===null||b.length>0:b===null?a.length>0:a.some(c=>inCity(b,c));}
