import type {DocumentsRequest,DocumentsResponse,OpenedDocument} from './protocol';
import {checkFormatPatch,checkParaPatch,TABLE_OPS,DOC_STYLES,MAX_DOCX_BYTES,MAX_FORMAT_BLOCKS,MAX_SCALE,MIN_SCALE} from './protocol';
const posOk=(p:{block:number;off:number})=>Number.isInteger(p.block)&&p.block>=0&&Number.isInteger(p.off)&&p.off>=0;
function checkParaRange(first:number,last:number){
 if(!Number.isInteger(first)||!Number.isInteger(last)||first<0||last<first)throw new Error('Paragraph range is not valid.');
 if(last-first>=MAX_FORMAT_BLOCKS)throw new Error('Selection spans too many paragraphs.');
}
function checkSpan(start:{block:number;off:number},end:{block:number;off:number}){
 if(!posOk(start)||!posOk(end))throw new Error('Selection is not valid.');
 if(end.block<start.block||(end.block===start.block&&end.off<start.off))throw new Error('Selection end is before its start.');
 if(end.block-start.block>=MAX_FORMAT_BLOCKS)throw new Error('Selection spans too many paragraphs.');
}
/** The slice of the wasm DocSession the host uses. Lets tests run the real engine without a Worker. */
export interface DocSessionLike{free():void;blocks():string;replace_ranges(block:number,hunksJson:string):void;format_range(sb:number,so:number,eb:number,eo:number,patchJson:string):void;format_state(sb:number,so:number,eb:number,eo:number):string;format_paragraphs(first:number,last:number,patchJson:string):void;paragraph_state(first:number,last:number):string;set_paragraph_style(first:number,last:number,style:string):void;set_list(first:number,last:number,kind:string):void;edit_table(block:number,op:string):void;shift_list_level(first:number,last:number,delta:number):void;insert(block:number,utf8Offset:number,text:string):void;page_info():string;paginate():number;render_png(page:number,scale:number):Uint8Array;save():Uint8Array;text():string;split_block(block:number,off:number):void;merge_with_previous(block:number):void;snapshot():number;restore(snap:number):void;hit_test(page:number,x:number,y:number):string;caret_at(block:number,off:number):string;selection_rects(block:number,a:number,b:number):string}
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
   if(req.kind==='format'){
    checkSpan(req.start,req.end);
    checkFormatPatch(req.patch);
    const s=this.need();const [,editMs]=this.timed(()=>s.format_range(req.start.block,req.start.off,req.end.block,req.end.off,JSON.stringify(req.patch)));const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'edited',document:this.describe(editMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='formatState'){checkSpan(req.start,req.end);return{res:{id:req.id,ok:true,kind:'formatState',state:JSON.parse(this.need().format_state(req.start.block,req.start.off,req.end.block,req.end.off))},transfer:[]};}
   if(req.kind==='paraFormat'){
    checkParaRange(req.first,req.last);checkParaPatch(req.patch);
    const s=this.need();const [,editMs]=this.timed(()=>s.format_paragraphs(req.first,req.last,JSON.stringify(req.patch)));const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'edited',document:this.describe(editMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='paraStyle'||req.kind==='setList'||req.kind==='listLevel'){
    checkParaRange(req.first,req.last);const s=this.need();
    if(req.kind==='paraStyle'&&!(DOC_STYLES as readonly string[]).includes(req.style))throw new Error('Style is not offered.');
    if(req.kind==='setList'&&req.list!=='bullet'&&req.list!=='numbered'&&req.list!=='none')throw new Error('List kind is not valid.');
    if(req.kind==='listLevel'&&(!Number.isInteger(req.delta)||req.delta<-8||req.delta>8))throw new Error('Level change is not valid.');
    const [,editMs]=this.timed(()=>req.kind==='paraStyle'?s.set_paragraph_style(req.first,req.last,req.style):req.kind==='setList'?s.set_list(req.first,req.last,req.list):s.shift_list_level(req.first,req.last,req.delta));const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'edited',document:this.describe(editMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='tableEdit'){
    if(!Number.isInteger(req.block)||req.block<0||req.block>=2**31)throw new Error('Block is not valid.');
    if(!(TABLE_OPS as readonly string[]).includes(req.op))throw new Error('Table operation is not offered.');
    const s=this.need();const [,editMs]=this.timed(()=>s.edit_table(req.block,req.op));const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'edited',document:this.describe(editMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='paraState'){checkParaRange(req.first,req.last);return{res:{id:req.id,ok:true,kind:'paraState',state:JSON.parse(this.need().paragraph_state(req.first,req.last))},transfer:[]};}
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
