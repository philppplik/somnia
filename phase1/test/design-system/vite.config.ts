import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
/** Intentionally independent of app startup and generated engine prerequisites. */
export default defineConfig({root:fileURLToPath(new URL('../../',import.meta.url)),plugins:[react(),tailwind()],build:{rollupOptions:{input:fileURLToPath(new URL('./index.html',import.meta.url))}},server:{host:'127.0.0.1',port:1431,strictPort:true},clearScreen:false});
