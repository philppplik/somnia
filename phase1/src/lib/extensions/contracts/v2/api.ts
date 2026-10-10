import type {Permission} from '../../types';
export const SDK_VERSION = '2.0.0';
export const PROTOCOL_VERSION = 1;
export type ErrorCode = 'E_PERMISSION_DENIED'|'E_WORKSPACE_UNTRUSTED'|'E_INVALID_ARGUMENT'|'E_INCOMPATIBLE_API'|'E_STALE_REVISION'|'E_CANCELLED'|'E_TIMEOUT'|'E_RESOURCE_LIMIT'|'E_HANDLER_MISSING'|'E_EXTENSION_FAULTED';
export class ExtensionError extends Error {
  constructor(readonly code:ErrorCode, message:string, readonly pointer?:string) {super(message); this.name='ExtensionError';}
}
export interface Disposable {dispose():void}
export type Json = null|boolean|number|string|Json[]|{[key:string]:Json};
export interface ProjectFile {path:string; language:string; revision:string}
export interface SelectionSnapshot {nodeId:string; tag:string; documentPath:string; revision:string}
export interface ProjectChange {paths:string[]; revisions:Record<string,string>}
export type EditorOperation =
 | {type:'formatText';file:string;nodeId:string;from:number;to:number;mark:'strong'|'em'|'u'}
 | {type:'setText';file:string;nodeId:string;text:string}
 | {type:'setAttribute';file:string;nodeId:string;name:string;value:string|null}
 | {type:'setStyle';file:string;nodeId:string;properties:Record<string,string|null>;cssFile?:string;breakpoint?:number}
 | {type:'insertHTML';file:string;parentId:string;html:string;beforeId?:string}
 | {type:'remove';file:string;nodeId:string}
 | {type:'move';file:string;nodeId:string;parentId:string;beforeId?:string};
export interface EditRequest {baseRevisions:Record<string,string>; operations:EditorOperation[]}
export interface EditResult {transactionId:string; revisions:Record<string,string>}
/** Plain-data wire contract. Callbacks live exclusively in guest SDK maps. */
export interface ApiMethods {
 'commands.register':{params:{id:string;callbackId:number};result:null};
 'project.listFiles':{params:Record<string,never>;result:ProjectFile[]};
 'project.readFile':{params:{path:string};result:{text:string;revision:string}};
 'project.onDidChange':{params:{callbackId:number};result:number};
 'selection.get':{params:Record<string,never>;result:SelectionSnapshot|null};
 'selection.onDidChange':{params:{callbackId:number};result:number};
 'editor.applyOperations':{params:EditRequest;result:EditResult};
 'storage.get':{params:{key:string};result:string|null};
 'storage.set':{params:{key:string;value:string};result:null};
 'storage.delete':{params:{key:string};result:null};
 'ui.notify':{params:{text:string};result:null};
 'panels.onMessage':{params:{panelId:string;callbackId:number};result:number};
 'panels.postMessage':{params:{panelId:string;message:Json};result:null};
 'subscriptions.dispose':{params:{subscriptionId:number};result:null};
}
export type ApiMethod=keyof ApiMethods;
export const API_PERMISSIONS:Record<ApiMethod,Permission|null> = {
 'commands.register':'commands','project.listFiles':'project.read','project.readFile':'project.read','project.onDidChange':'project.read',
 'selection.get':'selection','selection.onDidChange':'selection','editor.applyOperations':'project.write',
 'storage.get':'storage','storage.set':'storage','storage.delete':'storage','ui.notify':'ui.notify',
 'panels.onMessage':null,'panels.postMessage':null,'subscriptions.dispose':null,
};
export interface SomniaV2 {
 commands:{register(id:string,handler:(args:Json)=>Json|Promise<Json>):Promise<Disposable>};
 project:{listFiles():Promise<ProjectFile[]>;readFile(path:string):Promise<{text:string;revision:string}>;onDidChange(callback:(event:ProjectChange)=>void):Promise<Disposable>};
 selection:{get():Promise<SelectionSnapshot|null>;onDidChange(callback:(event:SelectionSnapshot|null)=>void):Promise<Disposable>};
 editor:{applyOperations(request:EditRequest):Promise<EditResult>};
 storage:{get(key:string):Promise<string|null>;set(key:string,value:string):Promise<void>;delete(key:string):Promise<void>};
 ui:{notify(text:string):Promise<void>};
 panels:{onMessage(panelId:string,callback:(message:Json)=>void):Promise<Disposable>;postMessage(panelId:string,message:Json):Promise<void>};
}
