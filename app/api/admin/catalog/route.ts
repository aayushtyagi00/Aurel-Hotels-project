import {firestoreApi} from '../../../../lib/firestore-api';
export const POST=(req:Request)=>firestoreApi(req,'catalog');
export const PUT=(req:Request)=>firestoreApi(req,'catalog');
export const DELETE=(req:Request)=>firestoreApi(req,'catalog');
