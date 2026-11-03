import {defineConfig} from 'vite';import react from '@vitejs/plugin-react';import path from 'node:path';
const backend=process.env.FIREBASE_BACKEND_URL||'http://127.0.0.1:8787';
const proxy={'/api':{target:process.env.DEV_API_TARGET||backend,changeOrigin:true,headers:{Origin:'https://aurel-hotels.web.app'}}};
export default defineConfig(({command})=>({root:path.resolve('firebase-client'),publicDir:path.resolve('public'),plugins:[react()],define:command==='serve'?{'import.meta.env.VITE_API_BASE':JSON.stringify('')}:{},server:{proxy},preview:{proxy},build:{outDir:path.resolve('dist-firebase'),emptyOutDir:true}}));
