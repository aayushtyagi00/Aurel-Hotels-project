import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ClerkProvider,SignIn,SignUp,useAuth} from '@clerk/react';
import Credits from '../app/photo-credits/page';
import PublicSite,{type PublicPage} from '../app/public-site';
import AdminPanel,{type User} from '../app/admin/panel';
import {apiFetch,configureApi} from '../lib/api-fetch';
import '../app/globals.css';
const backend=import.meta.env.VITE_API_BASE as string;
function App(){
 const {isLoaded,isSignedIn,getToken}=useAuth();
 const [user,setUser]=useState<(Omit<User,'role'>&{role:User['role']|null})|null>(null),[ready,setReady]=useState(false),[error,setError]=useState('');
 configureApi(backend,()=>getToken());
 const path=location.pathname;
 useEffect(()=>{if(!isLoaded)return;if(!isSignedIn){setUser(null);setReady(true);return;}let live=true;setReady(false);apiFetch('/api/session').then(async r=>{if(!r.ok)throw new Error('Unable to connect to hotel services.');return r.json();}).then(d=>{if(live){setUser((d as {user:(Omit<User,'role'>&{role:User['role']|null})|null}).user);setReady(true);}}).catch(e=>{if(live){setError(e.message);setReady(true);}});return()=>{live=false;};},[isLoaded,isSignedIn]);
 if(path.startsWith('/sign-in')||path.startsWith('/sign-up'))return <div className="auth-page"><a className="public-brand" href="/">AUREL<small>THE ART OF A SLOWER STAY</small></a>{path.startsWith('/sign-in')?<SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" fallbackRedirectUrl="/"/>:<SignUp routing="path" path="/sign-up" signInUrl="/sign-in" fallbackRedirectUrl="/"/>}</div>;
 if(!ready)return <div className="auth-page"><span className="public-brand">AUREL</span><p>Preparing your stay…</p></div>;
 if(error)return <div className="auth-page"><h1>We will be right back.</h1><p>{error}</p><button className="primary" onClick={()=>location.reload()}>Try again</button></div>;
 if(path==='/admin'||path==='/stays'){
  if(!user){location.replace('/sign-in?redirect_url='+encodeURIComponent(path));return null;}
  if(path==='/admin')return user.role?<AdminPanel user={{...user,role:user.role}}/>:<div className="auth-page"><h1>This space is for your hotel team.</h1><p>Your account does not have staff access.</p><a href="/" className="primary">Return home</a></div>;
 }
 if(path==='/photo-credits')return <Credits/>;
 const pages:Record<string,PublicPage>={'/':'home','/rooms':'rooms','/about':'about','/faq':'faq','/stays':'stays'};
 if(!pages[path])return <div className="auth-page"><h1>Page not found</h1><a href="/">Return home</a></div>;
 const q=new URLSearchParams(location.search),start=q.get('start'),end=q.get('end');
 return <PublicSite user={user} page={pages[path]} dates={start&&end?{start,end}:undefined}/>;
}
createRoot(document.getElementById('root')!).render(<ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY} localization={{signIn:{start:{title:'Sign in to Aurel'}},signUp:{start:{title:'Create your Aurel account'}}}} appearance={{variables:{colorPrimary:'#294e3e',borderRadius:'1.25rem'}}}><App/></ClerkProvider>);
