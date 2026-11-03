import {firestoreApi} from '../../../../../lib/firestore-api';
export const GET=(req:Request)=>firestoreApi(req,'export');
