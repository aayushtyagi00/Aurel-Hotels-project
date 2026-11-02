import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
let calls=[],failure={},policy={isValid:true},checks=0;
const user={uid:'qa-user'},auth={};
const sdk={
 validatePassword:async()=>policy,
 createUserWithEmailAndPassword:async(...args)=>{calls.push(['create',...args]);if(failure.create)throw failure.create;return {user};},
 updateProfile:async(...args)=>{calls.push(['profile',...args]);if(failure.profile)throw failure.profile;},
 sendEmailVerification:async(...args)=>{calls.push(['verify',...args]);if(failure.verify)throw failure.verify;},
 sendPasswordResetEmail:async(...args)=>{calls.push(['reset',...args]);if(failure.reset)throw failure.reset;},
};
const context=vm.createContext({URL,URLSearchParams,console});
const m=new vm.SourceTextModule(ts.transpileModule(fs.readFileSync('firebase-client/auth-flows.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,{context});
await m.link(async spec=>{assert.equal(spec,'firebase/auth');const s=new vm.SyntheticModule(Object.keys(sdk),function(){for(const [k,v]of Object.entries(sdk))this.setExport(k,v);},{context});await s.link(()=>{});return s;});await m.evaluate();
const {safeReturnTo,authLink,registerAccount,requestPasswordReset,checkPassword,authMessage}=m.namespace;
async function test(name,work){calls=[];failure={};policy={isValid:true};await work();checks++;console.log('PASS '+name);}
const continueUrl='https://aurel-hotels.web.app/sign-in';
await test('signup normalizes email and display name',async()=>{const result=await registerAccount(auth,' guest@example.com ','Password1!',' Guest Name ',continueUrl);assert.equal(result.verificationSent,true);assert.equal(calls[0][2],'guest@example.com');assert.equal(calls[1][2].displayName,'Guest Name');assert.equal(calls[2][2].url,continueUrl);});
await test('verification delivery failure preserves successful signup',async()=>{failure.verify={code:'auth/too-many-requests'};const r=await registerAccount(auth,'guest@example.com','Password1!','Guest',continueUrl);assert.equal(r.verificationSent,false);assert.match(r.verificationError,/Too many/);assert.equal(calls.filter(c=>c[0]==='create').length,1);});
await test('profile failure still sends verification email',async()=>{failure.profile=Error('offline');const r=await registerAccount(auth,'guest@example.com','Password1!','Guest',continueUrl);assert.equal(r.profileSaved,false);assert.equal(r.verificationSent,true);});
await test('existing email does not write profile or send verification',async()=>{failure.create={code:'auth/email-already-in-use'};await assert.rejects(registerAccount(auth,'guest@example.com','Password1!','Guest',continueUrl),e=>e.code==='auth/email-already-in-use');assert.equal(calls.length,1);assert.match(authMessage(failure.create),/already uses/);});
await test('blank display name rejected before account creation',async()=>{await assert.rejects(registerAccount(auth,'guest@example.com','Password1!','   ',continueUrl),/name/);assert.equal(calls.length,0);});
await test('short password rejected before account creation',async()=>{await assert.rejects(registerAccount(auth,'guest@example.com','short','Guest',continueUrl),/8 characters/);assert.equal(calls.length,0);});
await test('project password policy checked before creating account',async()=>{policy={isValid:false,containsUppercaseLetter:false,containsNumericCharacter:false};await assert.rejects(checkPassword(auth,'longpassword'),/uppercase letter, a number/);assert.equal(calls.length,0);});
await test('reset normalizes email and sets correct return URL',async()=>{const message=await requestPasswordReset(auth,' guest@example.com ',continueUrl);assert.equal(calls[0][2],'guest@example.com');assert.equal(calls[0][3].url,continueUrl);assert.match(message,/If an account exists/);});
await test('reset rejects malformed email before sending',async()=>{await assert.rejects(requestPasswordReset(auth,'invalid-address',continueUrl),/valid email/);assert.equal(calls.length,0);});
await test('reset does not reveal whether an account exists',async()=>{const success=await requestPasswordReset(auth,'guest@example.com',continueUrl);failure.reset={code:'auth/user-not-found'};assert.equal(await requestPasswordReset(auth,'missing@example.com',continueUrl),success);});
await test('reset reports network errors without claiming email was sent',async()=>{failure.reset={code:'auth/network-request-failed'};await assert.rejects(requestPasswordReset(auth,'guest@example.com',continueUrl),e=>e.code==='auth/network-request-failed');assert.match(authMessage(failure.reset),/connection/);});
await test('expired and reused links have actionable messages',async()=>{assert.match(authMessage({code:'auth/expired-action-code'}),/expired.*new email/);assert.match(authMessage({code:'auth/invalid-action-code'}),/already been used.*new email/);});
await test('booking destination survives all authentication links',async()=>{const target='/rooms?city=Mumbai&adults=2',search='?'+new URLSearchParams({redirect_url:target});for(const page of ['/sign-in','/sign-up','/forgot-password'])assert.equal(safeReturnTo(new URL(authLink(page,search),'https://hotel.test').search),target);});
await test('external and authentication-loop redirects are rejected',async()=>{for(const target of ['https://evil.test','//evil.test','/\\evil.test','/sign-in','/sign-up/nested','/forgot-password','/auth/action?mode=resetPassword'])assert.equal(safeReturnTo('?'+new URLSearchParams({redirect_url:target})),'/',target);});
console.log(checks+' authentication regression checks passed. Firebase SDK transport is mocked; no real emails sent.');
