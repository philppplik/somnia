import type {DocumentsRequest,DocumentsResponse,OpenedDocument} from './protocol';
export interface WorkerLike{postMessage(message:unknown,transfer?:Transferable[]):void;terminate():void;onmessage:((e:MessageEvent<DocumentsResponse>)=>void)|null;onerror:((e:ErrorEvent)=>void)|null;onmessageerror:((e:MessageEvent)=>void)|null}
type OkResponse=Extract<DocumentsResponse,{ok:true}>;
type Ok<K extends OkResponse['kind']>=Extract<OkResponse,{kind:K}>;
export const DEFAULT_TIMEOUT_MS=20_000;
/** Client side of the Documents worker. One operation at a time per document (serial queue). A stalled worker is terminated, never waited on. */
export class DocumentsEngine{
 private worker:WorkerLike;private nextId=1;private disposed=false;private chain:Promise<unknown>=Promise.resolve();
 private pending=new Map<number,{resolve:(r:DocumentsResponse)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
 constructor(private readonly create:()=>WorkerLike=()=>new Worker(new URL('./worker.ts',import.meta.url),{type:'module'}) as unknown as WorkerLike,private readonly wasmUrl:string=new URL('../../../documents/pkg/wordcraft_somnia_worker_bg.wasm',import.meta.url).href,private readonly timeoutMs:number=DEFAULT_TIMEOUT_MS){this.worker=this.attach();}
 get isDisposed(){return this.disposed;}
 private attach():WorkerLike{
  const w=this.create();
  w.onmessage=({data})=>{const p=this.pending.get(data.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(data.id);p.resolve(data);};
  w.onerror=e=>this.dispose(new Error(e.message||'Documents worker failed.'));
  w.onmessageerror=()=>this.dispose(new Error('Documents worker sent an unreadable response.'));
  return w;
 }
 private send(build:(id:number)=>DocumentsRequest,transfer:Transferable[]=[]):Promise<DocumentsResponse>{
  return new Promise((resolve,reject)=>{
   if(this.disposed){reject(new Error('Documents engine was closed.'));return;}
   const id=this.nextId++;const timer=setTimeout(()=>this.dispose(new Error('The document engine did not answer in time and was stopped.')),this.timeoutMs);
   this.pending.set(id,{resolve,reject,timer});
   try{this.worker.postMessage(build(id),transfer);}catch(error){clearTimeout(timer);this.pending.delete(id);reject(error instanceof Error?error:new Error(String(error)));}
  });
 }
 private queue<T>(run:()=>Promise<T>):Promise<T>{const next=this.chain.then(run,run);this.chain=next.catch(()=>undefined);return next;}
 private async call<K extends OkResponse['kind']>(kind:K,build:(id:number)=>DocumentsRequest,transfer:Transferable[]=[]):Promise<Ok<K>>{
  const res=await this.queue(()=>this.send(build,transfer));
  if(!res.ok)throw new Error(res.error);
  if((res as OkResponse).kind!==kind)throw new Error('Unexpected response from the document engine.');
  return res as Ok<K>;
 }
 init(){return this.call('ready',id=>({id,kind:'init',wasmUrl:this.wasmUrl}));}
 /** Takes ownership: the buffer is transferred and detached. Pass a copy to keep the original. */
 async open(bytes:ArrayBuffer):Promise<OpenedDocument>{return(await this.call('opened',id=>({id,kind:'open',bytes}),[bytes])).document;}
 async render(page:number,scale:number):Promise<Blob>{const r=await this.call('rendered',id=>({id,kind:'render',page,scale}));return new Blob([r.png],{type:'image/png'});}
 async insert(block:number,utf8Offset:number,text:string):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'insert',block,utf8Offset,text}))).document;}
 async save():Promise<Uint8Array>{return new Uint8Array((await this.call('saved',id=>({id,kind:'save'}))).bytes);}
 async close(){if(!this.disposed)await this.call('closed',id=>({id,kind:'close'}));}
 dispose(error=new Error('Documents engine was closed.')){
  if(this.disposed)return;this.disposed=true;this.worker.terminate();
  for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();
 }
}
