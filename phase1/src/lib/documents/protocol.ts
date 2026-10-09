/** Typed RPC between the main thread and the Documents worker. Bytes move by transfer. */
export interface PageSize{width:number;height:number}
export interface OpenedDocument{pages:number;pageSizes:PageSize[];text:string;cacheHits:number;cacheMisses:number;openMs:number;layoutMs:number}
export interface HitResult{block:number|null;off?:number;editable:boolean}
export interface CaretBox{page:number;x:number;top:number;height:number}
export type Rect5=[number,number,number,number,number];
export type DocumentsRequest=
 |{id:number;kind:'init';wasmUrl:string}
 |{id:number;kind:'open';bytes:ArrayBuffer}
 |{id:number;kind:'render';page:number;scale:number}
 |{id:number;kind:'insert';block:number;utf8Offset:number;text:string}
 |{id:number;kind:'blocks'}
 |{id:number;kind:'replace';block:number;hunks:import('./edit').Hunk[]}
 |{id:number;kind:'hit';page:number;x:number;y:number}
 |{id:number;kind:'caret';block:number;off:number}
 |{id:number;kind:'rects';block:number;a:number;b:number}
 |{id:number;kind:'save'}
 |{id:number;kind:'close'};
export type DocumentsResponse=
 |{id:number;ok:true;kind:'ready';initMs:number}
 |{id:number;ok:true;kind:'opened';document:OpenedDocument}
 |{id:number;ok:true;kind:'rendered';png:ArrayBuffer;renderMs:number}
 |{id:number;ok:true;kind:'edited';document:OpenedDocument}
 |{id:number;ok:true;kind:'blocks';blocks:import('./edit').DocBlock[]}
 |{id:number;ok:true;kind:'hit';hit:HitResult|null}
 |{id:number;ok:true;kind:'caret';caret:CaretBox|null}
 |{id:number;ok:true;kind:'rects';rects:Rect5[]}
 |{id:number;ok:true;kind:'saved';bytes:ArrayBuffer;saveMs:number}
 |{id:number;ok:true;kind:'closed'}
 |{id:number;ok:false;error:string};
export const MAX_DOCX_BYTES=16*1024*1024;
export const MIN_SCALE=0.1,MAX_SCALE=2;
