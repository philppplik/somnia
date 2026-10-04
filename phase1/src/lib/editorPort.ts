/** Structural port: import the real EditorProject in the integrator, not in this module. */
export type Origin = 'canvas' | 'code' | 'history' | 'external' | 'internal';
export interface EditorNode { id: string; tag: string; attrs: Record<string,string>; children: EditorNode[]; from:number; to:number; contentFrom:number; contentTo:number; locked:boolean; hidden:boolean }
export type Operation =
 | {type:'formatText';file:string;nodeId:string;from:number;to:number;mark:'strong'|'em'|'u'}
 | {type:'setText';file:string;nodeId:string;text:string}
 | {type:'setAttribute';file:string;nodeId:string;name:string;value:string|null}
 | {type:'setStyle';file:string;nodeId:string;properties:Record<string,string|null>;cssFile?:string;breakpoint?:number}
 | {type:'insertHTML';file:string;parentId:string;html:string;beforeId?:string}
 | {type:'remove';file:string;nodeId:string}
 | {type:'move';file:string;nodeId:string;parentId:string;beforeId?:string}
 | {type:'replaceSource';file:string;text:string}
 | {type:'createFile';file:string;text:string}
 | {type:'deleteFile';file:string}
 | {type:'renameFile';file:string;to:string}
 | {type:'setMeta';file:string;nodeId:string;locked?:boolean;hidden?:boolean};
export interface EditorProjectPort {
 readonly files:Readonly<Record<string,string>>; readonly revision:number;
 tree(file:string):EditorNode[]; node(file:string,id:string):EditorNode;
 subscribe(origin:Origin,listener:(transaction:unknown)=>void):()=>void;
 transact(input:{origin:Origin;operations:Operation[];expectedRevision?:number;group?:string}):unknown|null;
 undo():unknown|null; redo():unknown|null;
}
