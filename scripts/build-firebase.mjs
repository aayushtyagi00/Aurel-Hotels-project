import {spawnSync} from 'node:child_process';
const backend=process.env.FIREBASE_BACKEND_URL;
if(!backend)throw new Error('Set FIREBASE_BACKEND_URL to the HTTPS API origin before building.');
const url=new URL(backend);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('FIREBASE_BACKEND_URL must be an HTTPS origin.');
const r=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--config','firebase-client/vite.config.ts'],{stdio:'inherit',env:{...process.env,VITE_API_BASE:url.origin}});if(r.error)throw r.error;process.exitCode=r.status||0;
