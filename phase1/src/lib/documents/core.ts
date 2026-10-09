import type {DocumentsRequest,DocumentsResponse,OpenedDocument} from './protocol';
import {MAX_DOCX_BYTES,MAX_SCALE,MIN_SCALE} from './protocol';
/** The slice of the wasm DocSession the host uses. Lets tests run the real engine without a Worker. */
export interface DocSessionLike{free():void;blocks():string;replace_ranges(block:number,hunksJson:string):void;insert(block:number,utf8Offset:number,text:string):void;page_info():string;paginate():number;render_png(page:number,scale:number):Uint8Array;save():Uint8Array;text():string;split_block(block:number,off:number):void;merge_with_previous(block:number):void;snapshot():number;restore(snap:number):void;hit_test(page:number,x:number,y:number):string;caret_at(block:number,off:number):string;selection_rects(block:number,a:number,b:number):string}
export interface DocSessionCtor{new(bytes:Uint8Array):DocSessionLike}
const ab=(u:Uint8Array):ArrayBuffer=>u.byteOffset===0&&u.byteLength===u.buffer.byteLength?u.buffer as ArrayBuffer:u.slice().buffer as ArrayBuffer;
/** Owns one open session. Every failure leaves the previous state usable and never keeps a freed pointer. */
export class DocumentsCore{
 private session:DocSessionLike|null=null;
 constructor(private readonly Session:DocSessionCtor,private readonly now:()=>number=()=>performance.now()){}
 private timed<T>(fn:()=>T):[T,number]{const t=this.now();const v=fn();return[v,this.now()-t];}
 private describe(openMs:number,layoutMs:number,pages:number):OpenedDocument{
  const s=this.need();const info=JSON.parse(s.page_info()) as {pages:{width:number;height:number}[];cacheHits:number;cacheMisses:number};
  return{pages,pageSizes:info.pages,text:s.text(),cacheHits:info.cacheHits,cacheMisses:info.cacheMisses,openMs,layoutMs};
 }
 private need():DocSessionLike{if(!this.session)throw new Error('No document is open.');return this.session;}
 handle(req:Exclude<DocumentsRequest,{kind:'init'}>):{res:DocumentsResponse;transfer:Transferable[]}{
  try{
   if(req.kind==='open'){
    if(req.bytes.byteLength>MAX_DOCX_BYTES)throw new Error('DOCX is larger than 16 MB.');
    this.session?.free();this.session=null;
    const [opened,openMs]=this.timed(()=>new this.Session(new Uint8Array(req.bytes)));this.session=opened;
    const [pages,layoutMs]=this.timed(()=>opened.paginate());
    return{res:{id:req.id,ok:true,kind:'opened',document:this.describe(openMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='render'){
    if(!Number.isFinite(req.scale)||req.scale<MIN_SCALE||req.scale>MAX_SCALE)throw new Error('Zoom must be between 10% and 200%.');
    const [png,renderMs]=this.timed(()=>this.need().render_png(req.page,req.scale));const buf=ab(png);
    return{res:{id:req.id,ok:true,kind:'rendered',png:buf,renderMs},transfer:[buf]};
   }
   if(req.kind==='insert'){
    const s=this.need();const [,editMs]=this.timed(()=>s.insert(req.block,req.utf8Offset,req.text));const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'edited',document:this.describe(editMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='blocks'){
    return{res:{id:req.id,ok:true,kind:'blocks',blocks:JSON.parse(this.need().blocks())},transfer:[]};
   }
   if(req.kind==='replace'){
    const s=this.need();const [,editMs]=this.timed(()=>s.replace_ranges(req.block,JSON.stringify(req.hunks.map(h=>[h.start,h.end,h.text]))));const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'edited',document:this.describe(editMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='split'||req.kind==='merge'||req.kind==='restore'){
    const s=this.need();const [,editMs]=this.timed(()=>req.kind==='split'?s.split_block(req.block,req.off):req.kind==='merge'?s.merge_with_previous(req.block):s.restore(req.snap));const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'edited',document:this.describe(editMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='snapshot')return{res:{id:req.id,ok:true,kind:'snapshot',snap:this.need().snapshot()},transfer:[]};
   if(req.kind==='hit')return{res:{id:req.id,ok:true,kind:'hit',hit:JSON.parse(this.need().hit_test(req.page,req.x,req.y))},transfer:[]};
   if(req.kind==='caret')return{res:{id:req.id,ok:true,kind:'caret',caret:JSON.parse(this.need().caret_at(req.block,req.off))},transfer:[]};
   if(req.kind==='rects')return{res:{id:req.id,ok:true,kind:'rects',rects:JSON.parse(this.need().selection_rects(req.block,req.a,req.b))},transfer:[]};
   if(req.kind==='save'){
    const [bytes,saveMs]=this.timed(()=>this.need().save());const buf=ab(bytes);
    return{res:{id:req.id,ok:true,kind:'saved',bytes:buf,saveMs},transfer:[buf]};
   }
   this.session?.free();this.session=null;
   return{res:{id:req.id,ok:true,kind:'closed'},transfer:[]};
  }catch(error){return{res:{id:req.id,ok:false,error:error instanceof Error?error.message:String(error)},transfer:[]};}
 }
}
