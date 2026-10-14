import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import {generateLocalGuide} from '../scripts/generate-local-guide.mjs';
generateLocalGuide();
/** Narrow production bundle proof, no native/WASM application prerequisites. */
export default defineConfig({root:fileURLToPath(new URL('../',import.meta.url)),build:{outDir:'/tmp/somnia-local-guide-z-build',emptyOutDir:true,lib:{entry:fileURLToPath(new URL('../src/lib/localAIHelp.ts',import.meta.url)),formats:['es'],fileName:'guide'},minify:false}});
