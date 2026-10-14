import type {SlidesDiagnostics} from './diagnostics';
import type {TextRun,TextEdit} from './editCopy';
import type {DeckModel,LayoutInfo} from './deckPackage';
export interface DeckSummary {slides:number;widthPt:number;heightPt:number}
export type SlidesRequest={id:number;op:'init'}|{id:number;op:'open';bytes:Uint8Array}|{id:number;op:'render';index:number;scale:number}|{id:number;op:'read';index:number}|{id:number;op:'memory'}|{id:number;op:'diagnostics';bytes:Uint8Array}|{id:number;op:'runs';bytes:Uint8Array}|{id:number;op:'copy';bytes:Uint8Array;edits:TextEdit[]}|{id:number;op:'model';bytes:Uint8Array}|{id:number;op:'layouts';bytes:Uint8Array}|{id:number;op:'reorder';bytes:Uint8Array;slideId:number;toIndex:number}|{id:number;op:'slideEdit';bytes:Uint8Array;kind:'duplicate'|'delete';slideId:number}|{id:number;op:'newSlide';bytes:Uint8Array;layoutPart:string;afterSlideId:number|null};
export type SlidesReply={id:number;result?:true|{wasmBytes:number}|SlidesDiagnostics|DeckSummary|Uint8Array|TextRun[]|DeckModel|LayoutInfo[]|{index:number;texts:string[]};error?:string};
export const MAX_PPTX_BYTES=32*1024*1024;
export function assertPptx(file:{name:string;size:number}) {
 if(!/\.pptx$/i.test(file.name))throw new Error('Choose a .pptx presentation');
 if(file.size>MAX_PPTX_BYTES)throw new Error('PPTX exceeds 32 MiB input cap');
}
