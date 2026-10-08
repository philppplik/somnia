export type CraftRequest =
  | { id: number; kind: 'init'; wasmUrl: string }
  | {id:number;kind:'selection';tool:'wand'|'polygon';width:number;height:number;bytes?:ArrayBuffer;x?:number;y?:number;tolerance?:number;points?:number[]}
  | {id:number;kind:'doc-open';bytes:ArrayBuffer;width:number;height:number}
  | {id:number;kind:'doc-command';docId:number;command:'duplicate'|'visible'|'opacity'|'mask'|'clear-mask'|'undo'|'redo'|'query'|'render'|'close';index?:number;value?:number|boolean;bytes?:ArrayBuffer}
  | { id: number; kind: 'blur'; bytes: ArrayBuffer; width: number; height: number; radius: number };
export type CraftResponse =
  | {id:number;ok:true;kind:'document';docId:number;query:string;bytes?:ArrayBuffer}
  | { id: number; ok: true; kind: 'ready'; initMs: number }
  | { id: number; ok: true; kind: 'result'; bytes: ArrayBuffer; jobMs: number }
  | { id: number; ok: false; error: string };
