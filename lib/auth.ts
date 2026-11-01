import {headers} from 'next/headers';import {cache} from 'react';import {verifyHotelToken} from './firebase-token';
export const getHotelUser=cache(async()=>{const authorization=(await headers()).get('authorization');return authorization?.startsWith('Bearer ')?verifyHotelToken(authorization.slice(7)):null;});
