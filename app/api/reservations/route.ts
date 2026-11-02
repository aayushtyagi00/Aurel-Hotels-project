import {firestoreApi} from '../../../lib/firestore-api';
export const GET=(req:Request)=>firestoreApi(req,'reservations');
export const POST=(req:Request)=>firestoreApi(req,'reservations');
export const PUT=(req:Request)=>firestoreApi(req,'reservations');
export const PATCH=(req:Request)=>firestoreApi(req,'reservations');
