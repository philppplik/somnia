import {
  PDFArray, PDFDict, PDFName, PDFNumber, PDFRef, PDFStream,
  concatTransformationMatrix, drawObject, popGraphicsState, pushGraphicsState,
  type PDFDocument,
} from 'pdf-lib';
import { PdfExportError } from './types';
const key = PDFName.of;
function numbers(dict: PDFDict, name: string, fallback?: number[]): number[] {
  const array = dict.lookupMaybe(key(name), PDFArray);
  if (!array && fallback) return fallback;
  if (!array) throw Error(`Missing ${name}`);
  const out = array.asArray().map(v => dict.context.lookup(v, PDFNumber).asNumber());
  if (!out.every(Number.isFinite)) throw Error(`Invalid ${name}`);
  return out;
}
/** Place an appearance Form XObject exactly as a PDF viewer does. No rasterization. */
export function flattenAnnotations(doc: PDFDocument) {
  let flattened = 0, preservedLinks = 0;
  for (const [pageIndex, page] of doc.getPages().entries()) {
    const annots = page.node.Annots();
    if (!annots) continue;
    const kept = doc.context.obj([]);
    for (let i = 0; i < annots.size(); i++) {
      const raw = annots.get(i);
      try {
        const annot = annots.lookup(i, PDFDict);
        const subtype = annot.lookupMaybe(key('Subtype'), PDFName)?.decodeText();
        if (subtype === 'Link') { kept.push(raw); preservedLinks++; continue; }
        // Popups and replies hold review text, not a second page appearance.
        if (subtype === 'Popup' || annot.has(key('IRT'))) { flattened++; continue; }
        const flags = annot.lookupMaybe(key('F'), PDFNumber)?.asNumber() ?? 0;
        if (flags & (1 | 2 | 32)) { flattened++; continue; } // invisible/hidden/no-view
        if (flags & (8 | 16)) throw Error('NoZoom/NoRotate appearance needs a viewer transform');
        if (annot.has(key('OC'))) throw Error('Optional-content annotations are not supported');
        const ap = annot.lookupMaybe(key('AP'), PDFDict);
        let normal = ap?.lookup(key('N'));
        if (normal instanceof PDFDict) {
          const state = annot.lookupMaybe(key('AS'), PDFName);
          if (!state) throw Error('Appearance state is missing');
          normal = normal.lookup(state);
        }
        if (!(normal instanceof PDFStream)) throw Error('Normal appearance stream is missing');
        const rect = numbers(annot, 'Rect'), bbox = numbers(normal.dict, 'BBox');
        const matrix = numbers(normal.dict, 'Matrix', [1, 0, 0, 1, 0, 0]);
        if (rect.length !== 4 || bbox.length !== 4 || matrix.length !== 6) throw Error('Invalid geometry');
        const [a,b,c,d,e,f] = matrix;
        const corners = [[bbox[0],bbox[1]],[bbox[2],bbox[1]],[bbox[0],bbox[3]],[bbox[2],bbox[3]]]
          .map(([x,y]) => [a*x+c*y+e,b*x+d*y+f]);
        const xs = corners.map(p => p[0]), ys = corners.map(p => p[1]);
        const minX = Math.min(...xs), minY = Math.min(...ys);
        const w = Math.max(...xs)-minX, h = Math.max(...ys)-minY;
        if (w <= 0 || h <= 0 || rect[2] <= rect[0] || rect[3] <= rect[1]) throw Error('Empty appearance bounds');
        const sx = (rect[2]-rect[0])/w, sy = (rect[3]-rect[1])/h;
        const ref = doc.context.getObjectRef(normal) ?? doc.context.register(normal);
        if (!(ref instanceof PDFRef)) throw Error('Invalid appearance reference');
        const name = page.node.newXObject('Flattened', ref);
        page.pushOperators(pushGraphicsState(), concatTransformationMatrix(sx,0,0,sy,rect[0]-minX*sx,rect[1]-minY*sy),
          drawObject(name), popGraphicsState());
        flattened++;
      } catch (error) {
        throw new PdfExportError('UNSUPPORTED_ANNOTATION', `Page ${pageIndex+1}, annotation ${i+1}: ${String(error)}`);
      }
    }
    if (kept.size()) page.node.set(key('Annots'), kept);
    else page.node.delete(key('Annots'));
  }
  // Widgets are now page content. Remove interactive field tree to avoid regeneration.
  doc.catalog.delete(key('AcroForm'));
  return { flattened, preservedLinks };
}
