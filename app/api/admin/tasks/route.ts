import {firestoreApi} from '../../../../lib/firestore-api';
export const GET=(req:Request)=>firestoreApi(req,'tasks');
export const POST=(req:Request)=>firestoreApi(req,'tasks');
