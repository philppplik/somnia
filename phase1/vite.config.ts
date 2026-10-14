import {generateLocalGuide} from './scripts/generate-local-guide.mjs';
generateLocalGuide();
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const pkgJson=JSON.parse(readFileSync('./package.json','utf8'));const version=pkgJson.version;
/** `--mode mobile` (Android build): the native desktop command surface does not exist there, so isTauri() reports false and the app runs its browser-mode paths. */
const mobileCoreShim=fileURLToPath(new URL('./src/mobile/tauriCoreShim.ts',import.meta.url));
export default defineConfig(({mode})=>({resolve:{alias:mode==='mobile'?[{find:/^@tauri-apps\/api\/core$/,replacement:mobileCoreShim}]:[]},plugins:[react(),tailwindcss()],server:{port:1420,strictPort:true},optimizeDeps:{include:['mediabunny']},clearScreen:false,build:{// Fonts must stay real files: the desktop CSP allows font-src 'self' only, no data: URLs.
assetsInlineLimit:(file:string)=>/\.(woff2?|ttf)$/.test(file)?false:undefined},define:{__APP_VERSION__:JSON.stringify(version),__APP_RELEASE__:JSON.stringify(pkgJson.somniaRelease)},envPrefix:['VITE_','TAURI_ENV_']}));
