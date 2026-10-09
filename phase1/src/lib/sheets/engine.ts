import type {RangeResult,SheetInfo,SheetLayout,SheetsRequest,SheetsResponse,ViewResult,WorkbookInfo} from './protocol';
import {MAX_INPUT_BYTES} from './protocol';
type Req=SheetsRequest extends infer R?R extends {id:number}?Omit<R,'id'>:never:never;
/** One module Worker per open workbook. A timeout or crash discards the session: callers must keep the original bytes. */
export class SheetsEngine{
 private worker:Worker;private nextId=1;private disposed=false;
 private pending=new Map<number,{resolve:(r:SheetsResponse)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
 readonly timeoutMs:number;
 constructor(timeoutMs=30_000){
  this.timeoutMs=timeoutMs;
  this.worker=new Worker(new URL('./worker.ts',import.meta.url),{type:'module'});
  this.worker.onmessage=({data}:MessageEvent<SheetsResponse>)=>{const p=this.pending.get(data.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(data.id);if(data.ok)p.resolve(data);else p.reject(new Error(data.error));};
  this.worker.onerror=e=>this.dispose(new Error(e.message||'Spreadsheet engine failed'));
  this.worker.onmessageerror=()=>this.dispose(new Error('Spreadsheet engine response could not be decoded'));
 }
 get isDisposed(){return this.disposed;}
 private request(message:Req,transfer:Transferable[]=[]){
  return new Promise<SheetsResponse>((resolve,reject)=>{
   if(this.disposed){reject(new Error('Spreadsheet engine closed'));return;}
   const id=this.nextId++;
   const timer=setTimeout(()=>this.dispose(new Error('Spreadsheet engine timed out. Unsaved edits in this workbook were discarded.')),this.timeoutMs);
   this.pending.set(id,{resolve,reject,timer});
   try{this.worker.postMessage({...message,id},transfer);}catch(e){clearTimeout(timer);this.pending.delete(id);reject(e instanceof Error?e:new Error(String(e)));}
  });}
 private async result<T>(message:Req):Promise<T>{const r=await this.request(message);if(r.ok&&r.op==='result')return r.result as T;throw new Error('Unexpected engine response');}
 init(){return this.request({op:'init',wasmUrl:new URL('../../../sheets-craft/pkg/somnia_sheets_craft_bg.wasm',import.meta.url).href});}
 /** Copies the bytes: the caller keeps the original for recovery. */
 async open(bytes:Uint8Array):Promise<WorkbookInfo>{
  if(bytes.byteLength>MAX_INPUT_BYTES)throw new Error('Workbook is larger than the 32 MB limit.');
  const copy=bytes.slice().buffer;await this.init();
  return this.result<WorkbookInfo>({op:'open',bytes:copy} as Req) as Promise<WorkbookInfo>;}
 info(sheet:number){return this.result<SheetInfo>({op:'info',sheet});}
 range(sheet:number,row:number,col:number,rows:number,cols:number){return this.result<RangeResult>({op:'range',sheet,row,col,rows,cols});}
 view(sheet:number,row:number,col:number,rows:number,cols:number){return this.result<ViewResult>({op:'view',sheet,row,col,rows,cols});}
 layout(sheet:number){return this.result<SheetLayout>({op:'layout',sheet});}
 set(sheet:number,address:string,input:string){return this.result<unknown>({op:'set',sheet,address,input});}
 undo(){return this.result<unknown>({op:'undo'});}
 redo(){return this.result<unknown>({op:'redo'});}
 async save():Promise<Uint8Array>{const r=await this.request({op:'save'});if(r.ok&&r.op==='bytes')return new Uint8Array(r.bytes);throw new Error('Unexpected engine response');}
 dispose(error=new Error('Spreadsheet engine closed')){
  if(this.disposed)return;this.disposed=true;this.worker.terminate();
  for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();}
}
