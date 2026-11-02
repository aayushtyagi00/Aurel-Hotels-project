import React,{lazy,Suspense,useEffect,useState,type FormEvent} from 'react';
import {initializeApp,getApps} from 'firebase/app';
import {getAuth,onIdTokenChanged,signOut,updateProfile,type User as FirebaseUser} from 'firebase/auth';
import config from './firebase-config.json';import {apiFetch,configureApi} from '../lib/api-fetch';import {navigate} from '../lib/navigation';import {setAccountActions} from '../lib/account-actions';import {AuthScreen,ForgotPasswordScreen,EmailActionScreen} from './auth-screens';import type {User} from '../app/admin/panel';
export type SessionUser=Omit<User,'role'>&{role:User['role']|null};
const app=getApps()[0]||initializeApp(config),auth=getAuth(app),AdminPanel=lazy(()=>import('../app/admin/panel'));
configureApi(import.meta.env.VITE_API_BASE,()=>auth.currentUser?.getIdToken()||Promise.resolve(null));
export default function AuthRuntime({path,onUser,onReady}:{path:string;onUser:(u:SessionUser|null)=>void;onReady:(ready:boolean)=>void}){
 const [firebaseUser,setFirebaseUser]=useState<FirebaseUser|null>(null),[user,setUser]=useState<SessionUser|null>(null),[ready,setReady]=useState(false),[error,setError]=useState('');
 useEffect(()=>setAccountActions({manage:()=>navigate('/account'),signOut:()=>{void signOut(auth).then(()=>navigate('/')).catch(()=>setError('Unable to sign out. Please retry.'));}}),[]);
 useEffect(()=>{let live=true,run=0;const unsubscribe=onIdTokenChanged(auth,async current=>{if(!live)return;const version=++run;setFirebaseUser(current);setError('');setReady(false);onReady(false);setUser(null);onUser(null);if(!current||!current.emailVerified){setReady(true);onReady(true);return;}try{const r=await apiFetch('/api/session');const data=await r.json() as {user:SessionUser|null;error?:string};if(!r.ok||!data.user)throw Error(data.error||'Account services are temporarily unavailable.');if(live&&version===run){setUser(data.user);onUser(data.user);setError('');}}catch(e){if(live&&version===run)setError((e as Error).message);}finally{if(live&&version===run){setReady(true);onReady(true);}}});return()=>{live=false;run++;unsubscribe();};},[onUser,onReady]);
 useEffect(()=>{if(ready&&!error&&['/admin','/stays','/account'].includes(path)&&(!firebaseUser||!firebaseUser.emailVerified))navigate('/sign-in?redirect_url='+encodeURIComponent(path));},[path,ready,error,firebaseUser]);
 if(path==='/forgot-password')return <ForgotPasswordScreen auth={auth}/>;
 if(path==='/reset-password'||path==='/auth/action')return <EmailActionScreen key={location.search} auth={auth}/>;
 const authPage=path.startsWith('/sign-in')||path.startsWith('/sign-up');
 if(authPage)return <AuthScreen key={path} auth={auth} signup={path.startsWith('/sign-up')} current={firebaseUser} session={user} ready={ready} serviceError={error}/>;
 if(!['/admin','/stays','/account'].includes(path))return null;
 if(!ready)return <div className="auth-page"><p>Loading your secure account…</p></div>;
 if(error)return <div className="auth-page"><h1>Unable to load your account</h1><p>{error}</p><button className="primary" onClick={()=>location.reload()}>Retry</button></div>;
 if(!firebaseUser||!firebaseUser.emailVerified)return null;
 if(path==='/account')return <AccountScreen current={firebaseUser}/>;
 if(path==='/stays')return null;
 return user?.role?<Suspense fallback={<div className="auth-page">Loading hotel operations…</div>}><AdminPanel user={{...user,role:user.role}}/></Suspense>:<div className="auth-page"><h1>This space is for your hotel team.</h1><p>Your account does not have staff access.</p><a href="/">Return home</a></div>;
}
function AccountScreen({current}:{current:FirebaseUser}){const [name,setName]=useState(current.displayName||''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);async function save(e:FormEvent){e.preventDefault();setBusy(true);try{if(name.trim().length<2)throw Error('Enter at least 2 characters.');await updateProfile(current,{displayName:name.trim()});await current.getIdToken(true);setNotice('Your name has been updated.');}catch{setNotice('Unable to update your name. Please retry.');}finally{setBusy(false);}}return <div className="auth-page"><section className="auth-card"><h1>Your account</h1><p>{current.email}</p><form onSubmit={save}><label className="auth-field">Display name<input required minLength={2} maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label><button className="primary" disabled={busy}>Save name</button></form>{notice&&<p role="status" className="notice">{notice}</p>}<div className="auth-links"><a href="/stays">My stays</a><button onClick={()=>{void signOut(auth).then(()=>navigate('/')).catch(()=>setNotice('Unable to sign out. Please retry.'));}}>Sign out</button></div></section><a href="/">Back to the hotel</a></div>;}
