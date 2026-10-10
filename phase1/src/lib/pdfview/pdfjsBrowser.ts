import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { createPdfjsBackend } from './pdfjsBackend.ts';
/** pdf.js asset directories are copied to public/pdfjs by scripts/copy-pdfjs-assets.mjs (predev/prebuild).
 * Absolute-from-origin URLs: the worker resolves relative URLs against its own bundle path, not the page. */
const asset = (dir: string) => `${location.origin}/pdfjs/${dir}/`;
/** Default backend for the app: pdf.js with the Vite-bundled worker and the bundled font/CMap/wasm/ICC assets. */
export const pdfjsBackend = createPdfjsBackend(workerUrl, undefined, {
  standardFontDataUrl: asset('standard_fonts'),
  cMapUrl: asset('cmaps'),
  wasmUrl: asset('wasm'),
  iccUrl: asset('iccs'),
});
