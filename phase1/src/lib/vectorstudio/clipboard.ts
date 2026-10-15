import {exportSvg,normalizeDoc,type VectorDocument} from '../vectorio';
import {selectedPaths} from './selectionClosure';
import {importSvgInto} from './session';

export const PASTE_OFFSET=12;
/** SVG text for the selected objects (page size, gradients and group names they use). Null when nothing is selected. Locked and hidden paths are never selected, so never copied. */
export function selectionSvg(doc:VectorDocument,ids:readonly string[]):string|null{
 const paths=selectedPaths(doc,ids);if(!paths.length)return null;
 return exportSvg(normalizeDoc({...doc,paths}));
}
/** Text that cannot be a vector document is ignored, so pasting ordinary text never raises an error or changes the document. */
export const looksLikeSvg=(text:string)=>text.length<=5_000_000&&/<svg[\s>]/i.test(text.slice(0,4096));
/** Paste SVG text as new objects, offset so they do not hide their originals. One undo step. Returns false when the text is not SVG or fails the strict import. */
export function pasteSvgText(text:string):boolean{
 if(!looksLikeSvg(text))return false;
 return importSvgInto(text,{offset:PASTE_OFFSET});
}
