import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({root:resolve('../..'),build:{outDir:'craft/spike/dist',emptyOutDir:true,rollupOptions:{input:resolve('adapter.html')}}});
