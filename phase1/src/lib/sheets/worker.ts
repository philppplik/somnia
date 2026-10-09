/// <reference lib="webworker" />
import init,{HeadlessWorkbook} from '../../../sheets-craft/pkg/somnia_sheets_craft.js';
import type {SheetsRequest,SheetsResponse} from './protocol';
const scope=self as unknown as DedicatedWorkerGlobalScope;
let ready:Promise<unknown>|undefined;let book:HeadlessWorkbook|undefined;
// Serial queue: one session, requests never interleave.
let queue:Promise<void>=Promise.resolve();
scope.onmessage=({data}:MessageEvent<SheetsRequest>)=>{queue=queue.then(async()=>{
 const t=performance.now();const send=(m:SheetsResponse,transfer:Transferable[]=[])=>scope.postMessage(m,transfer);
 try{
  if(data.op==='init'){ready??=init({module_or_path:data.wasmUrl});await ready;send({id:data.id,ok:true,op:'result',result:{ready:true},ms:performance.now()-t});return;}
  if(!ready)throw new Error('engine not initialized');await ready;
  const need=()=>{if(!book)throw new Error('No workbook is open');return book;};
  let result:unknown;
  switch(data.op){
   case 'open':{const next=new HeadlessWorkbook(new Uint8Array(data.bytes));book?.free();book=next;result=JSON.parse(next.sheets());break;}
   case 'info':result=JSON.parse(need().sheet_info(data.sheet));break;
   case 'range':result=JSON.parse(need().range(data.sheet,data.row,data.col,data.rows,data.cols));break;
   case 'set':result=JSON.parse(need().set_cell(data.sheet,data.address,data.input));break;
   case 'undo':result=JSON.parse(need().undo());break;
   case 'redo':result=JSON.parse(need().redo());break;
   case 'save':{const bytes=need().export_xlsx();const buffer=bytes.buffer as ArrayBuffer;send({id:data.id,ok:true,op:'bytes',bytes:buffer,ms:performance.now()-t},[buffer]);return;}
   case 'close':book?.free();book=undefined;result={closed:true};break;
   default:throw new Error('Unsupported operation');}
  send({id:data.id,ok:true,op:'result',result,ms:performance.now()-t});
 }catch(e){send({id:data.id,ok:false,error:e instanceof Error?e.message:String(e)});}
});};
