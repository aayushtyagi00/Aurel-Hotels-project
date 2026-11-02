import {createUserWithEmailAndPassword,sendEmailVerification,sendPasswordResetEmail,updateProfile,validatePassword,type Auth} from 'firebase/auth';

export function safeReturnTo(search:string){
 const value=new URLSearchParams(search).get('redirect_url')||'/';
 try{const url=new URL(value,'https://hotel.invalid');return value.startsWith('/')&&url.origin==='https://hotel.invalid'&&!/^\/(sign-in|sign-up|forgot-password|reset-password|auth\/action)(\/|\?|$)/.test(url.pathname)?url.pathname+url.search+url.hash:'/';}catch{return '/';}
}
export function authLink(path:string,search:string){const target=safeReturnTo(search);return path+(target==='/'?'':'?'+new URLSearchParams({redirect_url:target}));}
export function authMessage(error:unknown){
 const code=(error as {code?:string})?.code;
 const messages:Record<string,string>={
  'auth/email-already-in-use':'An account already uses this email. Sign in or reset your password.',
  'auth/invalid-email':'Enter a valid email address.',
  'auth/invalid-credential':'The email or password is incorrect. Try again or reset your password.',
  'auth/wrong-password':'The email or password is incorrect. Try again or reset your password.',
  'auth/user-not-found':'The email or password is incorrect. Try again or reset your password.',
  'auth/user-disabled':'This account is disabled. Contact the hotel team.',
  'auth/operation-not-allowed':'Email/password sign-in is unavailable. Contact the hotel team or use Google.',
  'auth/popup-closed-by-user':'Sign-in was closed. Please try again.',
  'auth/popup-blocked':'Allow the Google sign-in popup, or sign in with email.',
  'auth/too-many-requests':'Too many attempts. Please wait before trying again.',
  'auth/quota-exceeded':'The email sending limit has been reached. Please try again later.',
  'auth/network-request-failed':'Check your connection and try again.',
  'auth/weak-password':'Choose a stronger password with at least 8 characters.',
  'auth/password-does-not-meet-requirements':'Your password does not meet the account security requirements.',
  'auth/unauthorized-domain':'This website is not authorized for sign-in. Contact the hotel team.',
  'auth/unauthorized-continue-uri':'The email return address is not authorized. Contact the hotel team.',
  'auth/invalid-action-code':'This link is invalid or has already been used. Request a new email.',
  'auth/expired-action-code':'This link has expired. Request a new email.',
 };
 return code&&messages[code]||'Unable to complete this request. Please try again.';
}
export async function checkPassword(auth:Auth,password:string){
 if(password.length<8)throw Error('Use at least 8 characters for your password.');
 const policy=await validatePassword(auth,password);
 if(policy.isValid)return;
 const missing=[policy.containsLowercaseLetter===false?'a lowercase letter':'',policy.containsUppercaseLetter===false?'an uppercase letter':'',policy.containsNumericCharacter===false?'a number':'',policy.containsNonAlphanumericCharacter===false?'a special character':'',policy.meetsMinPasswordLength===false?'at least '+policy.passwordPolicy.customStrengthOptions.minPasswordLength+' characters':'',policy.meetsMaxPasswordLength===false?'a shorter password':''].filter(Boolean);
 throw Error('Your password needs '+(missing.join(', ')||'to meet the account security requirements')+'.');
}
export async function registerAccount(auth:Auth,email:string,password:string,name:string,continueUrl:string){
 const displayName=name.trim();if(displayName.length<2)throw Error('Enter your name using at least 2 characters.');
 await checkPassword(auth,password);
 const {user}=await createUserWithEmailAndPassword(auth,email.trim(),password);
 // Account creation succeeds independently of the optional profile and email writes.
 const results=await Promise.allSettled([updateProfile(user,{displayName}),sendEmailVerification(user,{url:continueUrl})]);
 return {profileSaved:results[0].status==='fulfilled',verificationSent:results[1].status==='fulfilled',verificationError:results[1].status==='rejected'?authMessage(results[1].reason):''};
}
export async function requestPasswordReset(auth:Auth,email:string,continueUrl:string){
 const address=email.trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))throw Error('Enter a valid email address.');
 try{await sendPasswordResetEmail(auth,address,{url:continueUrl});}catch(error){if((error as {code?:string}).code!=='auth/user-not-found')throw error;}
 return 'If an account exists for that email, a password reset link has been sent. Check your inbox and spam folder.';
}
export function formError(error:unknown){return (error as {code?:string})?.code?authMessage(error):error instanceof Error?error.message:'Unable to complete this request. Please try again.';}
