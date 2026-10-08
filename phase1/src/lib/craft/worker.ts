/// <reference lib="webworker" />
import init, { gaussian_blur_rgba,CraftDocument,selection_wand_rgba,selection_polygon } from '../../../craft/pkg/somnia_craft.js';
import type { CraftRequest, CraftResponse } from './protocol';
const scope = self as unknown as DedicatedWorkerGlobalScope;
const documents=new Map<number,CraftDocument>();let nextDoc=1;
let ready: Promise<unknown> | undefined;
scope.onmessage = async ({ data }: MessageEvent<CraftRequest>) => {
  const send = (message: CraftResponse, transfer: Transferable[] = []) => scope.postMessage(message, transfer);
  try {
    if (data.kind === 'init') {
      const start = performance.now();
      ready ??= init({ module_or_path: data.wasmUrl });
      await ready;
      send({ id: data.id, ok: true, kind: 'ready', initMs: performance.now() - start });
      return;
    }
    if (!ready) throw new Error('engine not initialized');
    await ready;
    if(data.kind==='selection'){const start=performance.now();const pixels=data.tool==='wand'?selection_wand_rgba(new Uint8Array(data.bytes??new ArrayBuffer(0)),data.width,data.height,data.x??-1,data.y??-1,data.tolerance??24):selection_polygon(data.width,data.height,new Float32Array(data.points??[]));const bytes=pixels.buffer as ArrayBuffer;send({id:data.id,ok:true,kind:'result',bytes,jobMs:performance.now()-start},[bytes]);return;}
    if(data.kind==='doc-open'){
      if(documents.size>=4)throw Error('Document budget exceeded');
      const doc=new CraftDocument(new Uint8Array(data.bytes),data.width,data.height);const docId=nextDoc++;documents.set(docId,doc);send({id:data.id,ok:true,kind:'document',docId,query:doc.query()});return;
    }
    if(data.kind==='doc-command'){
      const doc=documents.get(data.docId);if(!doc)throw Error('Unknown document');const index=data.index??0;
      switch(data.command){
        case 'duplicate':doc.duplicate_layer(index);break;
        case 'visible':if(typeof data.value!=='boolean')throw Error('Expected visibility');doc.set_visible(index,data.value);break;
        case 'opacity':if(typeof data.value!=='number')throw Error('Expected opacity');doc.set_opacity(index,data.value);break;
        case 'mask':if(!data.bytes)throw Error('Expected mask');doc.set_mask(index,new Uint8Array(data.bytes));break;
        case 'clear-mask':doc.clear_mask(index);break;
        case 'undo':doc.undo();break;case 'redo':doc.redo();break;
        case 'close':doc.free();documents.delete(data.docId);send({id:data.id,ok:true,kind:'document',docId:data.docId,query:'null'});return;
        case 'query':break;
        case 'render':{const pixels=doc.render();const bytes=pixels.buffer as ArrayBuffer;send({id:data.id,ok:true,kind:'document',docId:data.docId,query:doc.query(),bytes},[bytes]);return;}
      }
      send({id:data.id,ok:true,kind:'document',docId:data.docId,query:doc.query()});return;
    }
    const start = performance.now();
    const result = gaussian_blur_rgba(new Uint8Array(data.bytes), data.width, data.height, data.radius);
    const jobMs = performance.now() - start;
    // wasm-bindgen returns owned JS bytes, not a view into growing WASM memory.
    const bytes = result.buffer as ArrayBuffer;
    send({ id: data.id, ok: true, kind: 'result', bytes, jobMs }, [bytes]);
  } catch (error) {
    send({ id: data.id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
