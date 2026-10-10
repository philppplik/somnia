import {LIMITS,type InterchangeKind} from './points';
import {validateInterchange,type InterchangeModel} from './interchange';
/** Importers and exporters run in a hidden sandboxed iframe (sandbox="allow-scripts", opaque origin, CSP without network). This is the same boundary panels already use, and unlike a Blob worker it does not need worker-src or unsafe-eval in the app CSP: the iframe has its own CSP. */
export function converterSrcdoc(code:string):string{
 const bridge=`<script>(()=>{const h={};window.somnia=Object.freeze({converter:{onImport:f=>{h.i=f;},onExport:f=>{h.e=f;}}});addEventListener('message',async e=>{const m=e.data||{};if(m.type!=='convert.run')return;const r=x=>parent.postMessage({type:'convert.result',requestId:m.requestId,...x},'*');try{const f=m.mode==='import'?h.i:h.e;if(!f)throw Error('The extension did not register a converter for '+m.mode+'.');const v=await f(m.payload,m.info||{});r({ok:true,value:v});}catch(x){r({ok:false,error:String(x&&x.message||x)});}});parent.postMessage({type:'convert.ready'},'*');})();<\/script>`;
 return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'"></head><body>${bridge}<script>${code.replace(/<\/script/gi,'<\\/script')}<\/script></body></html>`;
}
export interface ConverterPort{post(message:unknown,transfer?:Transferable[]):void;listen(cb:(data:any)=>void):()=>void}
export interface ExportResult{bytes:Uint8Array;mime:string;name:string}
let seq=0;
function run(port:ConverterPort,mode:'import'|'export',payload:unknown,info:Record<string,unknown>,transfer:Transferable[],timeoutMs:number):Promise<unknown>{
 return new Promise((resolve,reject)=>{const requestId=++seq;let done=false;
  const finish=(f:()=>void)=>{if(done)return;done=true;clearTimeout(timer);off();f();};
  const timer=setTimeout(()=>finish(()=>reject(new Error('The converter did not finish in time.'))),timeoutMs);
  const off=port.listen(m=>{if(!m||m.type!=='convert.result'||m.requestId!==requestId)return;finish(()=>m.ok?resolve(m.value):reject(new Error(String(m.error).slice(0,300))));});
  port.post({type:'convert.run',requestId,mode,payload,info},transfer);});
}
/** Importer: file bytes in, validated interchange model out. The host builds the document from the model; the extension never touches the Studio state. */
export async function runImporter(port:ConverterPort,kind:InterchangeKind,file:{name:string;bytes:ArrayBuffer},timeoutMs=LIMITS.converterTimeoutMs):Promise<InterchangeModel>{
 if(file.bytes.byteLength>LIMITS.maxBytesIn)throw new Error('The file is too large for an extension importer.');
 const v=await run(port,'import',file.bytes,{name:file.name},[file.bytes],timeoutMs);const r=validateInterchange(kind,v);if(!r.ok)throw new Error(r.error);return r.model;
}
/** Exporter: a read-only snapshot in, bytes out. The host owns the save dialog and the write, so an extension cannot choose a path. */
export async function runExporter(port:ConverterPort,snapshot:InterchangeModel,name:string,mime:string,timeoutMs=LIMITS.converterTimeoutMs):Promise<ExportResult>{
 const v=await run(port,'export',snapshot,{name},[],timeoutMs);
 if(!(v instanceof Uint8Array))throw new Error('An exporter must return a Uint8Array.');if(v.byteLength>LIMITS.maxBytesOut)throw new Error('The exported file is too large.');
 return{bytes:v,mime,name:name.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,120)};
}
