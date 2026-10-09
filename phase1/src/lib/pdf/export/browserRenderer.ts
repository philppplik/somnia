import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { RasterRenderer } from './types';
import { checkAbort, PdfExportError } from './types';
/** Browser-only adapter; inject a renderer in Node tests, no DOM in the core. */
export const browserPdfRenderer: RasterRenderer = async function* (bytes, options) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  checkAbort(options.signal);
  const task = pdfjs.getDocument({ data: bytes.slice() });
  const abort = () => { void task.destroy(); };
  options.signal?.addEventListener('abort', abort, { once:true });
  try {
    const doc = await task.promise;
    for (let i=1; i<=doc.numPages; i++) {
      checkAbort(options.signal);
      const page = await doc.getPage(i), view = page.getViewport({ scale:options.dpi/72 });
      if (Math.ceil(view.width)*Math.ceil(view.height) > options.maxPixels) throw new PdfExportError('LIMIT', 'Page exceeds canvas limit; lower screen DPI');
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(view.width); canvas.height = Math.ceil(view.height);
      try {
        await page.render({ canvas, viewport:view, background:'rgb(255,255,255)' }).promise;
        checkAbort(options.signal);
        const blob = await new Promise<Blob>((resolve,reject) => canvas.toBlob(b => b ? resolve(b) : reject(Error('JPEG encoding failed')), 'image/jpeg',options.quality));
        const points = page.getViewport({ scale:1 });
        yield { jpeg:new Uint8Array(await blob.arrayBuffer()), widthPt:points.width, heightPt:points.height };
      } finally { canvas.width=canvas.height=0; page.cleanup(); }
    }
  } finally { options.signal?.removeEventListener('abort',abort); await task.destroy(); }
};
