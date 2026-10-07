import type { PdfDocumentHandle, PdfPageHandle } from './types.ts';
export interface PageCache { get(n: number): Promise<PdfPageHandle>; clear(): void }
/** Small LRU of page handles; evicted pages release their pdf.js resources. Concurrent gets share one load. */
export function createPageCache(doc: PdfDocumentHandle, max = 4): PageCache {
  const map = new Map<number, Promise<PdfPageHandle>>();
  return {
    get(n) {
      const hit = map.get(n);
      if (hit) { map.delete(n); map.set(n, hit); return hit; }
      const p = doc.getPage(n);
      map.set(n, p);
      p.catch(() => map.delete(n));
      while (map.size > max) {
        const oldest = map.keys().next().value as number;
        const ev = map.get(oldest)!; map.delete(oldest);
        void ev.then(h => h.cleanup(), () => {});
      }
      return p;
    },
    clear() { for (const p of map.values()) void p.then(h => h.cleanup(), () => {}); map.clear(); },
  };
}
