/** pdf.js adapter (Apache-2.0). Loaded lazily so it stays out of the main bundle. */
import { PdfLoadError, type PdfBackend, type PdfDocumentHandle, type PdfPageHandle } from './types.ts';
type PdfJs = typeof import('pdfjs-dist');
/**
 * `workerSrc` is the URL of pdf.js's worker module. The browser entry (pdfjsBrowser.ts) supplies the
 * bundler URL; without it (Node tests) pdf.js falls back to its own in-process fake worker.
 */
export function createPdfjsBackend(workerSrc?: string, importLib: () => Promise<PdfJs> = () => import('pdfjs-dist')): PdfBackend {
  let lib: Promise<PdfJs> | null = null;
  const loadLib = (): Promise<PdfJs> => {
    lib ??= importLib().then(m => {
      if (workerSrc) m.GlobalWorkerOptions.workerSrc = workerSrc;
      return m;
    }).catch(e => { lib = null; throw new PdfLoadError('unavailable', e instanceof Error ? e.message : 'pdf.js failed to load'); });
    return lib;
  };
  return {
  async open(data, opts) {
    const pdfjs = await loadLib();
    // pdf.js transfers the buffer to its worker: hand it a copy so the caller's bytes stay valid.
    const task = pdfjs.getDocument({
      data: data.slice(), password: opts?.password,
      stopAtErrors: false,
    });
    const onAbort = () => { void task.destroy(); };
    opts?.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const doc = await task.promise;
      return wrapDoc(pdfjs, doc, task);
    } finally { opts?.signal?.removeEventListener('abort', onAbort); }
  },
  };
}
function wrapDoc(pdfjs: PdfJs, doc: import('pdfjs-dist').PDFDocumentProxy, task: { destroy(): Promise<void> }): PdfDocumentHandle {
  return {
    pageCount: doc.numPages,
    async getPage(n) {
      const page = await doc.getPage(n);
      const v = page.getViewport({ scale: 1 });
      const handle: PdfPageHandle = {
        number: n,
        size: { width: v.width, height: v.height },
        render(canvas, scale, rotation) {
          const vp = page.getViewport({ scale, rotation: (page.rotate + rotation) % 360 });
          const t = page.render({ canvas, viewport: vp });
          return { promise: t.promise, cancel: () => t.cancel() };
        },
        async getText() {
          const tc = await page.getTextContent();
          return tc.items.map(i => ('str' in i ? i.str + (i.hasEOL ? '\n' : '') : '')).join('');
        },
        async renderTextLayer(container, scale, rotation) {
          const vp = page.getViewport({ scale, rotation: (page.rotate + rotation) % 360 });
          const layer = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container, viewport: vp });
          await layer.render();
          return () => layer.cancel();
        },
        cleanup() { page.cleanup(); },
      };
      return handle;
    },
    async destroy() { await task.destroy(); },
  };
}
