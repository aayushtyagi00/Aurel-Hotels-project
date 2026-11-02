import React,{lazy,Suspense,useEffect,useState} from 'react';import {createRoot} from 'react-dom/client';
import PublicSite,{type PublicPage} from '../app/public-site';import Credits from '../app/photo-credits/page';
import {configureApi} from '../lib/api-fetch';import {setNavigator} from '../lib/navigation';
import {readSearch} from '../lib/search-input';
import type {SessionUser} from './auth-runtime';import '../app/globals.css';
const AuthRuntime=lazy(()=>import('./auth-runtime'));
configureApi(import.meta.env.VITE_API_BASE,async()=>null);
function App(){
 const [route,setRoute]=useState(location.pathname+location.search),[authWanted,setAuthWanted]=useState(false),[authReady,setAuthReady]=useState(false),[user,setUser]=useState<SessionUser|null>(null);
 const path=route.split('?')[0],privatePage=['/admin','/stays','/account'].includes(path),authPage=path.startsWith('/sign-in')||path.startsWith('/sign-up')||['/forgot-password','/reset-password','/auth/action'].includes(path);
 useEffect(()=>{function update(){setRoute(location.pathname+location.search);window.scrollTo(0,0);}const go=(url:string)=>{if(url!==location.pathname+location.search)history.pushState({},'',url);update();};const clear=setNavigator(go);function click(e:MouseEvent){if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.defaultPrevented)return;const a=(e.target as Element).closest?.('a');if(!a||a.target||a.hasAttribute('download'))return;const url=new URL(a.href);if(url.origin!==location.origin||url.hash)return;e.preventDefault();go(url.pathname+url.search);}document.addEventListener('click',click);window.addEventListener('popstate',update);return()=>{clear();document.removeEventListener('click',click);window.removeEventListener('popstate',update);};},[]);
 useEffect(()=>{const id=setTimeout(()=>setAuthWanted(true),1200);const intent=()=>setAuthWanted(true);document.addEventListener('pointerdown',intent,{once:true});return()=>{clearTimeout(id);document.removeEventListener('pointerdown',intent);};},[]);
 useEffect(()=>{if(path==='/faq'){history.replaceState({},'','/about');setRoute('/about');}},[path]);
 const needsAuth=authWanted||privatePage||authPage,pages:Record<string,PublicPage>={'/':'home','/rooms':'rooms','/amenities':'amenities','/offers':'offers','/about':'about','/faq':'about','/stays':'stays'};
 const q=new URLSearchParams(route.includes('?')?route.slice(route.indexOf('?')+1):''),selection=readSearch(q);
 return <>{!authPage&&path!=='/admin'&&path!=='/account'&&(path==='/photo-credits'?<Credits/>:pages[path]?path==='/stays'&&(!authReady||!user)?null:<PublicSite key={route} user={user} page={pages[path]} dates={selection.dates} search={selection.search}/>:<div className="auth-page"><h1>Page not found</h1><a href="/">Return home</a></div>)}<Suspense fallback={authPage||privatePage?<div className="auth-page">Loading secure sign-in…</div>:null}>{needsAuth&&<AuthRuntime key="auth-runtime" path={path} onUser={setUser} onReady={setAuthReady}/>}</Suspense></>;
}
createRoot(document.getElementById('root')!).render(<App/>);
