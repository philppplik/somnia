import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {readFileSync} from 'node:fs';
const pkgJson=JSON.parse(readFileSync('./package.json','utf8'));const version=pkgJson.version;
export default defineConfig({plugins:[react(),tailwindcss()],server:{port:1420,strictPort:true},clearScreen:false,build:{// Fonts must stay real files: the desktop CSP allows font-src 'self' only, no data: URLs.
assetsInlineLimit:(file:string)=>/\.(woff2?|ttf)$/.test(file)?false:undefined},define:{__APP_VERSION__:JSON.stringify(version),__APP_RELEASE__:JSON.stringify(pkgJson.somniaRelease)},envPrefix:['VITE_','TAURI_ENV_']});
