import {spawnSync} from 'node:child_process';
const r=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','deploy','--config','wrangler.jsonc','--dry-run','--outdir','dist-worker'],{stdio:'inherit',env:{...process.env,WRANGLER_LOG_PATH:'.wrangler/logs',WRANGLER_SEND_METRICS:'false'}});if(r.error)throw r.error;process.exitCode=r.status??1;
