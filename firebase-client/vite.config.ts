import {defineConfig} from 'vite';import react from '@vitejs/plugin-react';import path from 'node:path';
export default defineConfig({root:path.resolve('firebase-client'),publicDir:path.resolve('public'),plugins:[react()],resolve:{alias:{'@clerk/nextjs':'@clerk/react'}},build:{outDir:path.resolve('dist-firebase'),emptyOutDir:true}});
