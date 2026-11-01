import {auth,currentUser} from '@clerk/nextjs/server';
import {cache} from 'react';
// Only a primary email verified by Clerk may carry hotel privileges.
export const getHotelUser=cache(async()=>{
 const session=await auth();if(!session.userId)return null;
 const user=await currentUser();if(!user)return null;
 const address=user.emailAddresses.find(e=>e.id===user.primaryEmailAddressId&&e.verification?.status==='verified');
 if(!address)return null;
 return {userId:user.id,email:address.emailAddress.toLowerCase().trim(),fullName:user.fullName,displayName:user.fullName||address.emailAddress};
});
