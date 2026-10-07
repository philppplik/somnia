import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { createPdfjsBackend } from './pdfjsBackend.ts';
/** Default backend for the app: pdf.js with the Vite-bundled worker. */
export const pdfjsBackend = createPdfjsBackend(workerUrl);
