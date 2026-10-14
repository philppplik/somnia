import type {SheetsEditReceipt,SheetsNativeState,FilterOp,SortOp,SheetOp,FormatOp,LineAxis,LineOp,RangeResult,SheetInfo,SheetLayout,SheetsRequest,SheetsResponse,ViewResult,WorkbookInfo} from './protocol';
import {MAX_INPUT_BYTES} from './protocol';
import {parseEditReceipt,parseNativeState} from './receipt';
type Req=SheetsRequest extends infer R?R extends {id:number}?Omit<R,'id'>:never:never;
/** One module Worker per open workbook. A timeout or crash discards the session: callers must keep the original bytes. */
export class SheetsEngine{
 private worker:Worker;private nextId=1;private disposed=false;
 private mutationListeners=new Set<()=>void>();
 subscribeSelectionRead(f:()=>void){this.mutationListeners.add(f);return()=>{this.mutationListeners.delete(f);};}
 private notifySelectionRead(){this.mutationListeners.forEach(f=>{try{f();}catch{/* Observers cannot block worker requests or invalidate their receipt. */}});}
 private mutationEpoch=0;private mutations=0;
 get selectionReadEpoch(){return this.mutationEpoch;}
 get hasPendingMutation(){return this.mutations>0;}
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
   const mutating=['open','set','setValues','clear','format','resize','editLines','freeze','sort','editSheet','undo','redo','close'].includes(message.op);if(mutating){this.mutationEpoch++;this.mutations++;this.notifySelectionRead();}const finish=()=>{if(mutating){this.mutations--;this.mutationEpoch++;this.notifySelectionRead();}};const done=(r:SheetsResponse)=>{finish();resolve(r);},failed=(e:Error)=>{finish();reject(e);};
   const id=this.nextId++;
   const timer=setTimeout(()=>this.dispose(new Error('Spreadsheet engine timed out. Unsaved edits in this workbook were discarded.')),this.timeoutMs);
   this.pending.set(id,{resolve:done,reject:failed,timer});
   try{this.worker.postMessage({...message,id},transfer);}catch(e){clearTimeout(timer);this.pending.delete(id);failed(e instanceof Error?e:new Error(String(e)));}
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
 /** One atomic write of a rectangular block (one undo step). All-or-nothing: any invalid cell rejects the whole block. */
 setValues(sheet:number,row:number,col:number,values:string[][]){return this.result<unknown>({op:'setValues',sheet,row,col,values});}
 /** One atomic clear of a block's contents (formats stay), one undo step. */
 clear(sheet:number,row:number,col:number,rows:number,cols:number){return this.result<unknown>({op:'clear',sheet,row,col,rows,cols});}
 /** One typed formatting operation over a block (one undo step). */
 format(sheet:number,row:number,col:number,rows:number,cols:number,format:FormatOp){return this.result<unknown>({op:'format',sheet,row,col,rows,cols,format});}
 /** Resize, autofit, hide or unhide whole rows or columns (one undo step). */
 resize(sheet:number,axis:LineAxis,first:number,count:number,line:LineOp){return this.result<unknown>({op:'resize',sheet,axis,first,count,line});}
 /** Insert or delete whole rows or columns with reference shifting (one undo step). */
 editLines(sheet:number,axis:LineAxis,first:number,count:number,kind:'insert'|'delete'){return this.result<unknown>({op:'editLines',sheet,axis,first,count,line:{kind}});}
 /** Freeze the first rows/columns (0,0 unfreezes), one undo step. */
 freeze(sheet:number,rows:number,cols:number){return this.result<unknown>({op:'freeze',sheet,rows,cols});}
 /** Current sheet list (reload after sheet edits and history). */
 sheets(){return this.result<WorkbookInfo>({op:'sheets'});}
 /** Filter rows by one column, or clear or remove the filter (one undo step). */
 filter(sheet:number,row:number,col:number,rows:number,cols:number,filter:FilterOp){return this.result<unknown>({op:'filter',sheet,row,col,rows,cols,filter});}
 /** Owner revision and identity token; pin it at review time. */
 nativeState(){return this.result<SheetsNativeState>({op:'nativeState'}).then(parseNativeState);}
 /** Atomic reviewed cell write: token and exact old cell are checked inside the worker's commit; resolves to the owner receipt. A rejected promise whose message starts with 'stale' changed nothing. */
 setReviewed(sheet:number,address:string,token:string,old:{value:unknown;formula:string|null;address:string},input:string){return this.result<SheetsEditReceipt>({op:'setReviewed',sheet,address,token,old:JSON.stringify(old),input}).then(parseEditReceipt);}
 /** Exact undo of the reviewed edit; refused (stale) once anything newer happened. */
 undoReviewed(sheet:number,address:string,token:string){return this.result<SheetsEditReceipt>({op:'undoReviewed',sheet,address,token}).then(parseEditReceipt);}
 /** Sort the rows of exactly this block (never widened), one undo step. */
 sort(sheet:number,row:number,col:number,rows:number,cols:number,sort:SortOp){return this.result<unknown>({op:'sort',sheet,row,col,rows,cols,sort});}
 /** Add, rename, duplicate, move or delete a sheet (one undo step). Resolves to the sheet to show afterwards. */
 editSheet(sheet:number,line:SheetOp){return this.result<{active:number}>({op:'editSheet',sheet,line});}
 undo(){return this.result<unknown>({op:'undo'});}
 redo(){return this.result<unknown>({op:'redo'});}
 async save():Promise<Uint8Array>{const r=await this.request({op:'save'});if(r.ok&&r.op==='bytes')return new Uint8Array(r.bytes);throw new Error('Unexpected engine response');}
 dispose(error=new Error('Spreadsheet engine closed')){
  if(this.disposed)return;this.disposed=true;this.notifySelectionRead();this.worker.terminate();
  for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();}
}
