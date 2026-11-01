import {spawnSync} from 'node:child_process';
const r=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--config','firebase-client/vite.config.ts'],{stdio:'inherit',env:{...process.env,VITE_API_BASE:process.env.FIREBASE_BACKEND_URL||'https://aurel-hotel-reservations-tyagi.tyagiaayush3030.chatgpt.site'}});if(r.error)throw r.error;process.exitCode=r.status||0;
