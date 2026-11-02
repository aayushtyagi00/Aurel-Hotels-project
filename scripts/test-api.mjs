import assert from 'node:assert/strict';
const base=process.env.TEST_URL||'http://127.0.0.1:5173';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Local checks only');
let count=0;
async function check(path,expected,headers={}){const r=await fetch(base+path,{headers,redirect:'manual',signal:AbortSignal.timeout(20000)});assert.equal(r.status,expected,path);count++;console.log('PASS '+path+' '+r.status);return r;}
const day=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
await check('/api/rooms?start='+day(1)+'&end='+day(2),200);
const session=await check('/api/session',200);assert.equal((await session.json()).user,null);count++;
for(const path of ['/api/reservations','/api/admin/staff','/api/admin/tasks','/api/admin/rooms','/api/admin/payments','/api/admin/activity'])await check(path,401);
await check('/api/admin/staff',401,{'oai-authenticated-user-id':'forged','oai-authenticated-user-email':'owner@example.test'});
await check('/api/admin/staff',401,{Authorization:'Bearer invalid'});
const admin=await fetch(base+'/admin',{redirect:'manual'});assert.ok([302,303,307,308].includes(admin.status));assert.ok(admin.headers.get('location')?.includes('/sign-in'));count++;
console.log(count+' Firebase Authentication route checks passed. Signed-in role flows require a real Firebase Authentication session.');
