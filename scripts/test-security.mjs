import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {AsyncLocalStorage} from 'node:async_hooks';
let checks=0,fetcher;
const env={FIRESTORE_USE_METADATA:'true'};
const context=vm.createContext({console,crypto:globalThis.crypto,TextEncoder,Uint8Array,Date,URL,Headers,Request,Response,AbortSignal,btoa,atob,fetch:(...args)=>fetcher(...args)}),cache=new Map();
function synthetic(values){return new vm.SyntheticModule(Object.keys(values),function(){for(const [key,value]of Object.entries(values))this.setExport(key,value);},{context});}
async function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const m=new vm.SourceTextModule(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,{context,identifier:file,initializeImportMeta:meta=>{meta.env={DEV:false};}});cache.set(file,m);await m.link(async(spec,ref)=>{let stub;if(spec==='cloudflare:workers')stub=synthetic({env});else if(spec==='node:async_hooks')stub=synthetic({AsyncLocalStorage});else if(spec.endsWith('/firestore-api'))stub=synthetic({firestoreApi:async()=>Response.json({rooms:[]})});else if(spec.endsWith('/session/route'))stub=synthetic({GET:async()=>Response.json({user:null})});else if(spec==='../lib/auth')stub=synthetic({runWithHotelRequest:(_,run)=>run()});else if(spec==='./firebase-token')stub=synthetic({verifyHotelToken:async token=>({userId:token,email:token+'@example.test'})});if(stub){await stub.link(()=>{});return stub;}return load(path.resolve(path.dirname(ref.identifier),spec+'.ts'));});return m;}
async function module(file){const m=await load(file);await m.evaluate();return m.namespace;}
function test(name,work){return Promise.resolve().then(work).then(()=>{checks++;console.log('PASS '+name);});}
const {csvCell,securityHeaders}=await module('lib/security.ts');
await test('spreadsheet formulas are neutralized across whitespace and controls',()=>{for(const value of ['=1+1',' +SUM(A1)','\t@SUM(A1)','\r-1','\n=1','\u0000=1'])assert.ok(csvCell(value).startsWith('"\''),JSON.stringify(value));assert.equal(csvCell('Guest "Name"'),'"Guest ""Name"""');});
const {firebaseSessionActive}=await module('lib/firebase-session.ts');
const account={localId:'uid',email:'guest@example.test',emailVerified:true,validSince:'100'};
await test('current verified Firebase account accepts a valid session',async()=>{fetcher=async()=>Response.json({users:[account]});assert.equal(await firebaseSessionActive('token','uid',account.email,100,'public-key'),true);});
await test('revoked session is rejected by auth_time even after token refresh',async()=>{fetcher=async()=>Response.json({users:[{...account,validSince:'101'}]});assert.equal(await firebaseSessionActive('token','uid',account.email,100,'public-key'),false);});
await test('disabled deleted unverified or changed-email accounts are rejected',async()=>{for(const user of [{...account,disabled:true},{...account,emailVerified:false},{...account,email:'new@example.test'},null]){fetcher=async()=>Response.json({users:user?[user]:[]});assert.equal(await firebaseSessionActive('token','uid',account.email,100,'public-key'),false);}});
await test('Firebase lookup failure cannot allow an authenticated session',async()=>{fetcher=async()=>new Response(null,{status:403});assert.equal(await firebaseSessionActive('token','uid',account.email,100,'public-key'),false);});
const {commitDocuments}=await module('lib/firestore-client.ts');let commits=[];
fetcher=async(url,options)=>{if(String(url).startsWith('http://metadata.'))return Response.json({access_token:'fixture',expires_in:3600});commits.push(JSON.parse(options.body));return Response.json({});};
await test('Firestore deletion is sent as a native delete write',async()=>{await commitDocuments([{path:'hotel_tasks/deleted',delete:true}]);assert.ok(commits[0].writes[0].delete.endsWith('/hotel_tasks/deleted'));assert.equal('update'in commits[0].writes[0],false);});
await test('new lock documents retain exists false preconditions',async()=>{await commitDocuments([{path:'_locks/room',data:{revision:1},exists:false}]);assert.equal(commits[1].writes[0].currentDocument.exists,false);});
const worker=(await module('worker/index.ts')).default,ctx={props:{}};
const blocked={PUBLIC_API_LIMITER:{limit:async()=>({success:false})}};
await test('public rate limit rejects requests before app work with CORS and security policy',async()=>{const r=await worker.fetch(new Request('https://hotel.test/api/rooms',{headers:{Origin:'https://aurel-hotels.web.app','CF-Connecting-IP':'192.0.2.1'}}),blocked,ctx);assert.equal(r.status,429);assert.equal(r.headers.get('Retry-After'),'60');assert.equal(r.headers.get('Access-Control-Allow-Origin'),'https://aurel-hotels.web.app');for(const [key,value]of Object.entries(securityHeaders))assert.equal(r.headers.get(key),value);});
await test('durable limiter failure fails closed',async()=>{fetcher=async()=>new Response(null,{status:503});const r=await worker.fetch(new Request('https://hotel.test/api/rooms'),{},ctx);assert.equal(r.status,503);});
await test('limiter service failure returns a protected service error',async()=>{const r=await worker.fetch(new Request('https://hotel.test/api/rooms'),{PUBLIC_API_LIMITER:{limit:async()=>{throw Error('unavailable');}}},ctx);assert.equal(r.status,503);assert.equal(r.headers.get('X-Frame-Options'),'DENY');});
await test('booking requests have a separate limiter',async()=>{const r=await worker.fetch(new Request('https://hotel.test/api/reservations',{method:'POST'}),{BOOKING_LIMITER:{limit:async()=>({success:false})}},ctx);assert.equal(r.status,429);});
await test('preflight is not charged to the public limiter',async()=>{const r=await worker.fetch(new Request('https://hotel.test/api/rooms',{method:'OPTIONS',headers:{Origin:'https://aurel-hotels.web.app'}}),{},ctx);assert.equal(r.status,204);assert.equal(r.headers.get('X-Frame-Options'),'DENY');});
await test('normal Worker responses receive defensive headers',async()=>{const r=await worker.fetch(new Request('https://hotel.test/'),{},ctx);assert.equal(r.status,302);assert.equal(r.headers.get('X-Content-Type-Options'),'nosniff');});
await test('Firebase Hosting uses the same defensive header policy',()=>{const config=JSON.parse(fs.readFileSync('firebase.json','utf8'));const policy=Object.fromEntries(config.hosting.headers.find(h=>h.regex).headers.map(h=>[h.key,h.value]));assert.deepEqual(policy,JSON.parse(JSON.stringify(securityHeaders)));});
await test('Hosting frame policy excludes Firebase-managed auth helper frames',()=>{const config=JSON.parse(fs.readFileSync('firebase.json','utf8')),rule=config.hosting.headers.find(h=>h.regex),pattern=new RegExp(rule.regex);for(const path of ['/','/admin','/account','/auth/action','/assets/main.js'])assert.equal(pattern.test(path),true,path);for(const path of ['/__/auth/iframe','/__/auth/handler','/__/firebase/init.json'])assert.equal(pattern.test(path),false,path);});
// Native-binding-free hosts use real transport encoding and shared counters.
const {durableRequestAllowed}=await module('lib/request-rate.ts'),counterDocs=new Map();
fetcher=async(url,options)=>{
 if(String(url).includes(':beginTransaction'))return Response.json({transaction:'fixture-transaction'});
 if(String(url).includes(':commit')){for(const w of JSON.parse(options.body).writes||[])if(w.update)counterDocs.set(w.update.name,w.update.fields);return Response.json({});}
 if(String(url).includes(':rollback'))return Response.json({});
 const name=String(url).replace('https://firestore.googleapis.com/v1/','').split('?')[0];
 return counterDocs.has(name)?Response.json({name,fields:counterDocs.get(name)}):Response.json({error:{status:'NOT_FOUND'}},{status:404});
};
await test('durable fallback enforces booking quota and resets its window',async()=>{for(let i=0;i<10;i++)assert.equal(await durableRequestAllowed('booking','192.0.2.10',60000),true);assert.equal(await durableRequestAllowed('booking','192.0.2.10',60000),false);assert.equal(await durableRequestAllowed('booking','192.0.2.10',120000),true);assert.equal(await durableRequestAllowed('booking','192.0.2.11',60000),true);});
await test('request counters store no raw IP and use native TTL timestamps',()=>{for(const [name,fields]of counterDocs){assert.equal(name.includes('192.0.2.'),false);assert.equal(JSON.stringify(fields).includes('192.0.2.'),false);assert.ok(fields.expiresAt.timestampValue.endsWith('Z'));}});
await test('public endpoint works through the durable fallback without native bindings',async()=>{const r=await worker.fetch(new Request('https://hotel.test/api/rooms',{headers:{'CF-Connecting-IP':'192.0.2.12'}}),{},ctx);assert.equal(r.status,200);});
const authContext=await module('lib/auth.ts');
await test('parallel requests keep Firebase identities isolated',async()=>{const identities=await Promise.all(['first','second'].map(token=>authContext.runWithHotelRequest(new Request('https://hotel.test/api/session',{headers:{Authorization:'Bearer '+token}}),async()=>{await Promise.resolve();return (await authContext.getHotelUser()).userId;})));assert.deepEqual(identities,['first','second']);assert.equal(await authContext.getHotelUser(),null);});
await test('platform identity headers cannot impersonate a Firebase user',async()=>{const user=await authContext.runWithHotelRequest(new Request('https://hotel.test/api/session',{headers:{'oai-authenticated-user-email':'owner@example.test'}}),()=>authContext.getHotelUser());assert.equal(user,null);});
await test('unknown routes and unsupported methods never reach the API',async()=>{assert.equal((await worker.fetch(new Request('https://hotel.test/unknown'),{})).status,404);const r=await worker.fetch(new Request('https://hotel.test/api/rooms',{method:'DELETE'}),{});assert.equal(r.status,405);assert.equal(r.headers.get('Allow'),'GET');});
await test('read-only mode prevents mutations in the standalone Worker',async()=>{const r=await worker.fetch(new Request('https://hotel.test/api/admin/rooms',{method:'PUT'}),{HOTEL_READ_ONLY:'true'});assert.equal(r.status,503);});
console.log(checks+' security regression checks passed. Firebase and Cloudflare network services are fixtures.');
