/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope;
import { exportPdf } from './pipeline';
import type { ExportOptions } from './types';
self.onmessage = async ({data}:MessageEvent<{id:number;kind:string;bytes:Uint8Array;options:ExportOptions}>) => {
  try {
    if (data.kind !== 'pdf.export.flatten' || !Number.isSafeInteger(data.id) || data.options?.preset === 'screen')
      throw Error('Invalid export worker request');
    const result = await exportPdf(data.bytes, { ...data.options, preset:'print' });
    if (result.bytes.byteLength > 100_000_000) throw Error('Export exceeds 100 MB');
    self.postMessage({id:data.id,result},[result.bytes.buffer as ArrayBuffer]);
  } catch(error) {
    self.postMessage({id:data?.id,error:{message:error instanceof Error ? error.message : String(error),
      code:typeof error === 'object' && error && 'code' in error ? error.code : undefined}});
  }
};
