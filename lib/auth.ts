import {AsyncLocalStorage} from 'node:async_hooks';
import {verifyHotelToken} from './firebase-token';
type User=Awaited<ReturnType<typeof verifyHotelToken>>;
const requests=new AsyncLocalStorage<{request:Request;user?:Promise<User>}>();
export function runWithHotelRequest<T>(request:Request,run:()=>T):T{return requests.run({request},run);}
export function getHotelUser():Promise<User>{
 const context=requests.getStore();if(!context)return Promise.resolve(null);
 if(!context.user){const authorization=context.request.headers.get('authorization');context.user=authorization?.startsWith('Bearer ')?verifyHotelToken(authorization.slice(7)):Promise.resolve(null);}
 return context.user;
}
