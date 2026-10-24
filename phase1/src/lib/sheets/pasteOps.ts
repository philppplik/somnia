import type {PasteOp} from './protocol';
/** Paste special: validation of untrusted command input. The Rust bridge re-validates. */
export const PASTE_WHATS=['all','formulas','values','formats','allExceptBorders','columnWidths','formulasAndNumberFormats','valuesAndNumberFormats'] as const;
export const PASTE_OPERATIONS=['none','add','subtract','multiply','divide'] as const;
export function parsePasteCommand(input:unknown):PasteOp{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Paste must be an object.');
 const o=input as Record<string,unknown>;
 if(Object.keys(o).some(k=>!['what','operation','skipBlanks','transpose'].includes(k)))throw Error('Unknown paste field.');
 const out:PasteOp={what:'all'};
 if(o.what!==undefined){if(!(PASTE_WHATS as readonly unknown[]).includes(o.what))throw Error('Unsupported paste kind.');out.what=o.what as PasteOp['what'];}
 if(o.operation!==undefined){if(!(PASTE_OPERATIONS as readonly unknown[]).includes(o.operation))throw Error('Unsupported paste operation.');if(o.operation!=='none')out.operation=o.operation as NonNullable<PasteOp['operation']>;}
 for(const k of ['skipBlanks','transpose'] as const)if(o[k]!==undefined){if(typeof o[k]!=='boolean')throw Error('`'+k+'` must be true or false.');if(o[k])out[k]=true;}
 if(out.operation&&!['all','formulas','values','valuesAndNumberFormats'].includes(out.what))throw Error('Calculating while pasting needs values or formulas.');
 return out;
}
