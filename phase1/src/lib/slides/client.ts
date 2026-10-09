import type {TextRun,TextEdit} from './editCopy';
import type {DeckSummary,SlidesReply,SlidesRequest} from './protocol';
type Request=SlidesRequest extends infer R?R extends SlidesRequest?Omit<R,'id'>:never:never;
export class SlidesClient {
 private worker=new Worker(new URL('./worker.ts',import.meta.url),{type:'module'});
 private next=0;private closed=false;
 private pending=new Map<number,{resolve:(r:SlidesReply['result'])=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
 constructor(){this.worker.onmessage=({data}:{data:SlidesReply})=>{const p=this.pending.get(data.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(data.id);if(data.error)p.reject(new Error(data.error));else p.resolve(data.result);};this.worker.onerror=()=>this.dispose(new Error('Slides worker failed. Close and reopen the presentation.'));}
 private request(data:Request):Promise<SlidesReply['result']>{if(this.closed)return Promise.reject(new Error('Slides worker closed'));return new Promise((resolve,reject)=>{const id=++this.next;const timer=setTimeout(()=>this.dispose(new Error('Slides operation exceeded 30 seconds')),30_000);this.pending.set(id,{resolve,reject,timer});this.worker.postMessage({...data,id});});}
 async open(bytes:Uint8Array):Promise<DeckSummary>{await this.request({op:'init'});return await this.request({op:'open',bytes}) as DeckSummary;}
 async render(index:number,scale:number):Promise<Uint8Array>{return await this.request({op:'render',index,scale}) as Uint8Array;}
 async read(index:number):Promise<{index:number;texts:string[]}>{return await this.request({op:'read',index}) as {index:number;texts:string[]};}
 async runs(bytes:Uint8Array){return await this.request({op:'runs',bytes}) as TextRun[];}
 async copy(bytes:Uint8Array,edits:TextEdit[]){return await this.request({op:'copy',bytes,edits}) as Uint8Array;}
 dispose(error=new Error('Slides operation cancelled')){if(this.closed)return;this.closed=true;this.worker.terminate();for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();}
}
