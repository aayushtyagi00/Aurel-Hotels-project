import {spawnSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';
try{process.loadEnvFile('.env.local');}catch(e){if(e.code!=='ENOENT')throw e;}
const npm=process.env.npm_execpath;
if(!npm)throw new Error('Run with npm run dev.');
// Use the compiled Worker: the Vite runner cannot load Clerk CommonJS modules.
for(const args of [['run','build'],['exec','--yes','--package','clerk@4.1.0','--','clerk','env','pull','--file','dist/server/.dev.vars'],['start']]){
 const result=spawnSync(process.execPath,[npm,...args],{stdio:'inherit'});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status||1);
 if(args[0]==='exec'&&process.env.HOTEL_OWNER_EMAIL)appendFileSync('dist/server/.dev.vars',String.fromCharCode(10)+'HOTEL_OWNER_EMAIL='+process.env.HOTEL_OWNER_EMAIL+String.fromCharCode(10));
}
