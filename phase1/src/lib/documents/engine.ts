import type {DocumentsRequest,DocumentsResponse,OpenedDocument} from './protocol';
import {DOCS_OP_KINDS} from '../collab/office/docsModel';
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
 /** Collab (CO4): while set, mutating calls divert through the journaler instead of the worker (strict journal order). */
 private journaler:((req:DocumentsRequest)=>Promise<DocumentsResponse>)|null=null;
 setJournaler(j:((req:DocumentsRequest)=>Promise<DocumentsResponse>)|null){this.journaler=j;}
 /** Journal tail application: send a recorded op as-is, bypassing the journaler. */
 applyJournalOp(kind:string,params:Record<string,unknown>):Promise<DocumentsResponse>{return this.queue(()=>this.send(id=>({...params,id,kind}) as unknown as DocumentsRequest));}
 private async call<K extends OkResponse['kind']>(kind:K,build:(id:number)=>DocumentsRequest,transfer:Transferable[]=[]):Promise<Ok<K>>{
  if(this.journaler){
   const req=build(-1);
   if((DOCS_OP_KINDS as readonly string[]).includes(req.kind))return this.journaler(req) as Promise<Ok<K>>;
   if(req.kind==='insertImage')throw new Error('Image insert is not available while the document is shared.');
  }
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
 async blocks():Promise<import('./edit').DocBlock[]>{return(await this.call('blocks',id=>({id,kind:'blocks'}))).blocks;}
 async replace(e:import('./edit').TextEdit):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'replace',block:e.block,hunks:e.hunks}))).document;}
 /** Replaces only while the paragraph still reads `expected` (checked inside the worker); returns the document and the paragraph text read back. */
 async replaceChecked(e:import('./edit').TextEdit,expected:string):Promise<{document:OpenedDocument;text:string}>{const r=await this.call('replaced',id=>({id,kind:'replaceChecked',block:e.block,expected,hunks:e.hunks}));return{document:r.document,text:r.text};}
 async split(block:number,off:number):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'split',block,off}))).document;}
 async merge(block:number):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'merge',block}))).document;}
 async format(start:import('./protocol').DocPos,end:import('./protocol').DocPos,patch:import('./protocol').FormatPatch):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'format',start,end,patch}))).document;}
 async formatState(start:import('./protocol').DocPos,end:import('./protocol').DocPos):Promise<import('./protocol').FormatState>{return(await this.call('formatState',id=>({id,kind:'formatState',start,end}))).state;}
 async formatParagraphs(first:number,last:number,patch:import('./protocol').ParaPatch):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'paraFormat',first,last,patch}))).document;}
 async paragraphState(first:number,last:number):Promise<import('./protocol').ParaState>{return(await this.call('paraState',id=>({id,kind:'paraState',first,last}))).state;}
 async setParagraphStyle(first:number,last:number,style:string):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'paraStyle',first,last,style}))).document;}
 async continueList(first:number,last:number):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'continueList',first,last}))).document;}
 async insertToc(block:number,o:import('./protocol').TocOptions):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'insertToc',block,levels:o.levels,title:o.title,pages:o.pages}))).document;}
 async updateToc(block:number):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'updateToc',block}))).document;}
 async removeToc(block:number):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'removeToc',block}))).document;}
 async listStyles():Promise<import('./protocol').StyleItem[]>{return(await this.call('styles',id=>({id,kind:'listStyles'}))).items;}
 async upsertStyle(patch:import('./protocol').StylePatch):Promise<{styleId:string;document:OpenedDocument}>{const r=await this.call('styleSaved',id=>({id,kind:'upsertStyle',patch}));return{styleId:r.styleId,document:r.document};}
 async deleteStyle(styleId:string):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'deleteStyle',styleId}))).document;}
 async restartList(first:number,last:number):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'restartList',first,last}))).document;}
 async setList(first:number,last:number,list:import('./protocol').ListKindId):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'setList',first,last,list}))).document;}
 async shiftListLevel(first:number,last:number,delta:number):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'listLevel',first,last,delta}))).document;}
 async tableStyle(block:number,scope:import('./protocol').TableStyleScope,style:import('./protocol').TableStyle):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'tableStyle',block,scope,style}))).document;}
 async colWidth(block:number,width:number):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'colWidth',block,width}))).document;}
 async insertImage(block:number,bytes:Uint8Array,alt:string):Promise<OpenedDocument>{const buf=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer;return(await this.call('edited',id=>({id,kind:'insertImage',block,bytes:buf,alt}),[buf])).document;}
 async imageEdit(block:number,op:import('./protocol').ImageOp):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'imageEdit',block,op}))).document;}
 async bookmarksState():Promise<import('./protocol').BookmarkItem[]>{return(await this.call('bookmarks',id=>({id,kind:'bookmarksState'}))).bookmarks;}
 async addBookmark(block:number,start:number,end:number,name:string):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'addBookmark',block,start,end,name}))).document;}
 async deleteBookmark(name:string):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'deleteBookmark',name}))).document;}
 async commentsState():Promise<import('./protocol').CommentItem[]>{return(await this.call('comments',id=>({id,kind:'commentsState'}))).comments;}
 async addComment(block:number,start:number,end:number,text:string,author:string,date:string):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'addComment',block,start,end,text,author,date}))).document;}
 async replyComment(parent:number,text:string,author:string,date:string):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'replyComment',parent,text,author,date}))).document;}
 async listOptions(block:number):Promise<import('./protocol').ListOptionsState>{return(await this.call('listOptions',id=>({id,kind:'listOptions',block}))).state;}
 async setListOptions(block:number,patch:import('./protocol').ListOptionsPatch):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'setListOptions',block,patch}))).document;}
 async propertiesState():Promise<import('./protocol').PropertiesState>{return(await this.call('properties',id=>({id,kind:'propertiesState'}))).state;}
 async setProperties(patch:import('./protocol').PropertiesPatch):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'setProperties',patch}))).document;}
 async resolveComment(commentId:number,resolved:boolean):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'resolveComment',commentId,resolved}))).document;}
 async deleteComment(commentId:number):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'deleteComment',commentId}))).document;}
 async exportFormat(ext:import('./protocol').ExportExt):Promise<Uint8Array>{return new Uint8Array((await this.call('saved',id=>({id,kind:'exportFormat',ext}))).bytes);}
 async importFormat(ext:import('./protocol').ExportExt,bytes:ArrayBuffer):Promise<Uint8Array>{return new Uint8Array((await this.call('saved',id=>({id,kind:'importFormat',ext,bytes}),[bytes])).bytes);}
 async proofCheck(words:string[]):Promise<import('./protocol').ProofIssue[]>{return(await this.call('proof',id=>({id,kind:'proofCheck',words}))).issues;}
 async proofSuggest(word:string):Promise<string[]>{return(await this.call('suggest',id=>({id,kind:'proofSuggest',word}))).words;}
 async setViewMarks(marks:boolean,markup:boolean):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'setViewMarks',marks,markup}))).document;}
 async setTrack(on:boolean,author:string,date:string):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'setTrack',on,author,date}))).document;}
 async reviewState():Promise<import('./protocol').ReviewState>{return(await this.call('review',id=>({id,kind:'reviewState'}))).state;}
 async resolveChange(block:number,start:number,end:number,accept:boolean):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'resolveChange',block,start,end,accept}))).document;}
 async resolveAll(accept:boolean):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'resolveAll',accept}))).document;}
 async setShowHidden(on:boolean):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'setShowHidden',on}))).document;}
 async setProofing(on:boolean):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'setProofing',on}))).document;}
 async pageSetupState():Promise<import('./protocol').PageSetupState>{return(await this.call('pageSetup',id=>({id,kind:'pageSetupState'}))).state;}
 async setPageSetup(setup:import('./protocol').PageSetupPatch):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'setPageSetup',setup}))).document;}
 async headerFooterState():Promise<import('./protocol').HeaderFooterState>{return(await this.call('headerFooter',id=>({id,kind:'headerFooterState'}))).state;}
 async setHeaderFooter(p:{header?:string;footer?:string;pageNumber?:boolean;headerAlign?:import('./protocol').HfAlign;footerAlign?:import('./protocol').HfAlign;pageTotal?:boolean}):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'setHeaderFooter',...p}))).document;}
 async insertSectionBreak(block:number,sectionKind:string):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'insertSectionBreak',block,sectionKind}))).document;}
 async removeSectionBreak(block:number):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'removeSectionBreak',block}))).document;}
 async tableLayoutState(block:number):Promise<import('./protocol').TableLayoutState>{return(await this.call('tableLayout',id=>({id,kind:'tableLayoutState',block}))).state;}
 async setTableLayout(block:number,patch:import('./protocol').TableLayoutPatch):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'setTableLayout',block,patch}))).document;}
 async hfVariantsState():Promise<import('./protocol').HfVariantsState>{return(await this.call('hfVariants',id=>({id,kind:'hfVariantsState'}))).state;}
 async setHfVariants(patch:import('./protocol').HfVariantsPatch):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'setHfVariants',patch}))).document;}
 async textToTable(first:number,last:number):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'textToTable',first,last}))).document;}
 async insertTable(block:number,rows:number,cols:number):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'insertTable',block,rows,cols}))).document;}
 async editTable(block:number,op:import('./protocol').TableOp):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'tableEdit',block,op}))).document;}
 async snapshot():Promise<number>{return(await this.call('snapshot',id=>({id,kind:'snapshot'}))).snap;}
 async restore(snap:number):Promise<OpenedDocument>{return(await this.call('edited',id=>({id,kind:'restore',snap}))).document;}
 async hit(page:number,x:number,y:number){return(await this.call('hit',id=>({id,kind:'hit',page,x,y}))).hit;}
 async caret(block:number,off:number){return(await this.call('caret',id=>({id,kind:'caret',block,off}))).caret;}
 async rects(block:number,a:number,b:number){return(await this.call('rects',id=>({id,kind:'rects',block,a,b}))).rects;}
 async exportPdf(options?:import('./protocol').PdfOptions,date?:string):Promise<Uint8Array>{return new Uint8Array((await this.call('saved',id=>({id,kind:'exportPdf',options,date}))).bytes);}
 /** The saved file's bytes. With `date` (UTC ISO 8601) the file's properties are stamped with the save time on a copy; the open document is unchanged. */
 async save(date?:string,author?:string):Promise<Uint8Array>{return new Uint8Array((await this.call('saved',id=>({id,kind:'save',date,author}))).bytes);}
 async close(){if(!this.disposed)await this.call('closed',id=>({id,kind:'close'}));}
 dispose(error=new Error('Documents engine was closed.')){
  if(this.disposed)return;this.disposed=true;this.worker.terminate();
  for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();
 }
}
