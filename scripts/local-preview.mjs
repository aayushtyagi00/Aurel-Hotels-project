import {spawnSync} from 'node:child_process';
const npm=process.env.npm_execpath;if(!npm)throw Error('Run with npm run dev.');
for(const args of [['run','build'],['start']]){const r=spawnSync(process.execPath,[npm,...args],{stdio:'inherit'});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status||1);}
