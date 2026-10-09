export interface DeckSummary {slides:number;widthPt:number;heightPt:number}
export type SlidesRequest={id:number;op:'init'}|{id:number;op:'open';bytes:Uint8Array}|{id:number;op:'render';index:number;scale:number}|{id:number;op:'read';index:number};
export type SlidesReply={id:number;result?:true|DeckSummary|Uint8Array|{index:number;texts:string[]};error?:string};
export const MAX_PPTX_BYTES=32*1024*1024;
export function assertPptx(file:{name:string;size:number}) {
 if(!/\.pptx$/i.test(file.name))throw new Error('Choose a .pptx presentation');
 if(file.size>MAX_PPTX_BYTES)throw new Error('PPTX exceeds 32 MiB input cap');
}
