import type { CraftRequest, CraftResponse } from './protocol';
/** T1 prototype: no UI wiring, history, document IDs, cancellation, or codecs yet. */
export class CraftEngine {
  private worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: CraftResponse) => void; reject: (error: Error) => void;timer:ReturnType<typeof setTimeout> }>();
  private disposed = false;
  constructor() {
    this.worker.onmessage = ({ data }: MessageEvent<CraftResponse>) => {
      const pending = this.pending.get(data.id);
      if (!pending) return;
      clearTimeout(pending.timer);this.pending.delete(data.id);
      if (data.ok) pending.resolve(data);
      else pending.reject(new Error(data.error));
    };
    this.worker.onerror = (event) => this.dispose(new Error(event.message || 'craft worker failed'));
    this.worker.onmessageerror = () => this.dispose(new Error('craft response could not be decoded'));
  }
  private request(message: CraftRequest, transfer: Transferable[] = []) {
    return new Promise<CraftResponse>((resolve, reject) => {
      if (this.disposed) { reject(new Error('craft engine disposed')); return; }
      const timer=setTimeout(()=>this.dispose(new Error('craft worker timed out')),15000);
      this.pending.set(message.id, { resolve, reject,timer });
      try { this.worker.postMessage(message, transfer); }
      catch (error) { clearTimeout(timer);this.pending.delete(message.id); reject(error); }
    });
  }
  async init() {
    return this.request({ id: this.nextId++, kind: 'init', wasmUrl: new URL('../../../craft/pkg/somnia_craft_bg.wasm', import.meta.url).href });
  }
  /** Takes ownership of bytes. The caller's ArrayBuffer is detached on transfer. */
  async blur(bytes: ArrayBuffer, width: number, height: number, radius: number) {
    return this.request({ id: this.nextId++, kind: 'blur', bytes, width, height, radius }, [bytes]);
  }
  async selection(options:Omit<Extract<CraftRequest,{kind:'selection'}>,'id'|'kind'>){return this.request({id:this.nextId++,kind:'selection',...options},options.bytes?[options.bytes]:[]);}
  async openDocument(bytes:ArrayBuffer,width:number,height:number){return this.request({id:this.nextId++,kind:'doc-open',bytes,width,height},[bytes]);}
  async documentCommand(docId:number,command:Extract<CraftRequest,{kind:'doc-command'}>['command'],options:{index?:number;value?:number|boolean;bytes?:ArrayBuffer}={}){return this.request({id:this.nextId++,kind:'doc-command',docId,command,...options},options.bytes?[options.bytes]:[]);}
  dispose(error = new Error('craft engine disposed')) {
    this.disposed = true;
    this.worker.terminate();
    for (const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(error);}
    this.pending.clear();
  }
}
