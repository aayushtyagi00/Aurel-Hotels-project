export const frontendOrigins=['https://aurel-hotels.web.app','https://aurel-hotels.firebaseapp.com'];
export function allowedOrigin(origin:string){return frontendOrigins.includes(origin);}
