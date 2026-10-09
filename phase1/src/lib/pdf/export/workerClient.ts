import { checkAbort, PdfExportError, type ExportOptions, type ExportResult } from './types';
export type PrintExportOptions = Omit<ExportOptions, 'renderer' | 'preset'>;
/** Bounded vector-flatten job. Cancellation terminates parser even during a synchronous loop. */
export function exportPrintInWorker(bytes:Uint8Array, options:PrintExportOptions = {}):Promise<ExportResult> {
  checkAbort(options.signal);
  const {signal,...serializable}=options;
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./worker.ts',import.meta.url),{type:'module'});
    let done=false;
    const finish=(error?:Error,result?:ExportResult)=>{
      if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);worker.terminate();
      if(error)reject(error);else resolve(result!);
    };
    const abort=()=>finish(new DOMException('Export cancelled','AbortError'));
    const timer=setTimeout(()=>finish(Error('PDF export exceeded 20 seconds. No copy was saved.')),20_000);
    signal?.addEventListener('abort',abort,{once:true});
    worker.onerror=e=>finish(Error(e.message||'PDF export worker failed'));
    worker.onmessage=({data})=>{
      if(data.id!==1)return;
      if(data.error)finish(data.error.code ? new PdfExportError(data.error.code,data.error.message) : Error(data.error.message));
      else if(!(data.result?.bytes instanceof Uint8Array))finish(Error('Invalid export worker response'));
      else finish(undefined,data.result);
    };
    try {worker.postMessage({id:1,kind:'pdf.export.flatten',bytes:bytes.slice(),options:serializable});}
    catch(e){finish(e instanceof Error?e:Error(String(e)));}
  });
}
