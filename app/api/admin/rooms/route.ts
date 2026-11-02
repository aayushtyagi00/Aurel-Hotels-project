import {firestoreApi} from '../../../../lib/firestore-api';
export const GET=(req:Request)=>firestoreApi(req,'roomstate');
export const PUT=(req:Request)=>firestoreApi(req,'roomstate');
