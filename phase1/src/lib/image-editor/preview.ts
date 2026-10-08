import type {ImageEditDocument,ImageOperation} from './types';
/** Interactive proxy cap. Exports and geometry/selection edits still use source pixels. */
export const PREVIEW_PIXELS=900_000;
export function previewSize(width:number,height:number){const scale=Math.min(1,Math.sqrt(PREVIEW_PIXELS/(width*height)));return{width:Math.max(1,Math.floor(width*scale)),height:Math.max(1,Math.floor(height*scale)),scale};}
const proxySafe=new Set(['adjust','blur','sharpen','grayscale','sepia','invert','vignette']);
/** Do not guess coordinate mappings for transforms, masks or extension operations. */
export function canProxy(doc:ImageEditDocument){return doc.operations.filter(op=>op.enabled).every(op=>proxySafe.has(op.type));}
export function previewOperations(ops:readonly ImageOperation[],scale:number):ImageOperation[]{return ops.map(op=>{if((op.type==='blur'||op.type==='sharpen')&&typeof op.params.sigma==='number')return {...op,params:{...op.params,sigma:op.params.sigma*scale}};return op;});}
