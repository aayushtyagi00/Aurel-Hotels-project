import {spawnSync} from 'node:child_process';
try{process.loadEnvFile('.env.local');}catch(e){if(e.code!=='ENOENT')throw e;}
if(!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)throw new Error('Configure Clerk with its CLI before building.');
const result=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--config','firebase-client/vite.config.ts'],{stdio:'inherit',env:{...process.env,VITE_CLERK_PUBLISHABLE_KEY:process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,VITE_API_BASE:process.env.FIREBASE_BACKEND_URL||'https://aurel-hotel-reservations-tyagi.tyagiaayush3030.chatgpt.site'}});
if(result.error)throw result.error;process.exitCode=result.status||0;
