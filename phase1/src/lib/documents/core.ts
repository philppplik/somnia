import type {DocumentsRequest,DocumentsResponse,OpenedDocument} from './protocol';
import {stylePatchProblem,STYLE_ID_RE,tocProblem,listOptionsProblem,isListKind,SAVE_DATE,pdfOptionsProblem,MAX_PDF_BYTES,propertiesProblem,commentProblem,validHfText,checkFormatPatch,checkParaPatch,MAX_NEW_TABLE_COLS,MAX_NEW_TABLE_ROWS,TABLE_OPS,DOC_STYLES,MAX_DOCX_BYTES,MAX_FORMAT_BLOCKS,MAX_SCALE,MIN_SCALE,imageProblem,tableStyleProblem,pageSetupProblem,MIN_COL_PT,MAX_COL_PT,IMAGE_WIDTH_PERCENTS,MIN_IMAGE_PT,MAX_IMAGE_PT} from './protocol';
const IMAGE_ERRORS={empty:'The image is empty.',size:'An image is limited to 5 MB.',type:'Only PNG and JPEG images can be inserted.',dimensions:'An image is limited to 8000 pixels a side and 25 megapixels.'} as const;
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
export interface DocSessionLike{free():void;replace_checked?(block:number,expected:string,hunks_json:string):string;styles_list():string;upsert_style(json:string):string;delete_style(id:string):void;insert_toc(block:number,levels:number,title:string,pages:boolean):void;update_toc(block:number):void;remove_toc(block:number):void;continue_list(first:number,last:number):void;list_options(block:number):string;set_list_options(block:number,patchJson:string):void;restart_list(first:number,last:number):void;blocks():string;replace_ranges(block:number,hunksJson:string):void;format_range(sb:number,so:number,eb:number,eo:number,patchJson:string):void;format_state(sb:number,so:number,eb:number,eo:number):string;format_paragraphs(first:number,last:number,patchJson:string):void;paragraph_state(first:number,last:number):string;set_paragraph_style(first:number,last:number,style:string):void;set_list(first:number,last:number,kind:string):void;edit_table(block:number,op:string):void;insert_table(block:number,rows:number,cols:number):void;header_footer():string;set_header_footer(header?:string|null,footer?:string|null,pageNumber?:boolean|null):void;insert_image(block:number,bytes:Uint8Array,alt:string):void;resize_image(block:number,width:number):void;fit_image(block:number,percent:number):void;set_col_width(block:number,width:number):void;page_setup():string;set_page_setup(setupJson:string):void;style_table(block:number,scope:string,styleJson:string):void;set_image_alt(block:number,alt:string):void;remove_image(block:number):void;shift_list_level(first:number,last:number,delta:number):void;insert(block:number,utf8Offset:number,text:string):void;page_info():string;paginate():number;render_png(page:number,scale:number):Uint8Array;save():Uint8Array;save_at(date:string):Uint8Array;save_at_by(date:string,author:string):Uint8Array;export_pdf_at(optsJson:string,date:string):Uint8Array;export_pdf():Uint8Array;export_pdf_opts(optsJson:string):Uint8Array;text():string;split_block(block:number,off:number):void;merge_with_previous(block:number):void;snapshot():number;restore(snap:number):void;hit_test(page:number,x:number,y:number):string;caret_at(block:number,off:number):string;selection_rects(block:number,a:number,b:number):string;comments():string;properties():string;set_properties(patchJson:string):void;add_comment(block:number,start:number,end:number,text:string,author:string,date:string):void;reply_comment(parent:number,text:string,author:string,date:string):void;resolve_comment(id:number,resolved:boolean):void;delete_comment(id:number):void}
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
   if(req.kind==='replaceChecked'){
    if(!Number.isInteger(req.block)||req.block<0||typeof req.expected!=='string'||req.expected.length>1_000_000||!Array.isArray(req.hunks)||req.hunks.length===0||req.hunks.length>10_000)throw new Error('The edit is not valid.');
    for(const h of req.hunks)if(!h||!Number.isInteger(h.start)||!Number.isInteger(h.end)||h.start<0||h.end<h.start||typeof h.text!=='string'||h.text.length>1_000_000)throw new Error('The edit is not valid.');
    const s=this.need();if(!s.replace_checked)throw new Error('This engine cannot check an edit before applying it.');
    const [text,editMs]=this.timed(()=>s.replace_checked!(req.block,req.expected,JSON.stringify(req.hunks.map(h=>[h.start,h.end,h.text]))));const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'replaced',document:this.describe(editMs,layoutMs,pages),text},transfer:[]};
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
   if(req.kind==='continueList'){
    checkParaRange(req.first,req.last);const s=this.need();
    const [,editMs]=this.timed(()=>s.continue_list(req.first,req.last));const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'edited',document:this.describe(editMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='insertToc'||req.kind==='updateToc'||req.kind==='removeToc'){
    if(!Number.isInteger(req.block)||req.block<0||req.block>=2**31)throw new Error('The paragraph is not valid.');
    if(req.kind==='insertToc'){const bad=tocProblem({levels:req.levels,title:req.title,pages:req.pages});if(bad)throw new Error(bad);}
    const s=this.need();const [,editMs]=this.timed(()=>req.kind==='insertToc'?s.insert_toc(req.block,req.levels,req.title,req.pages):req.kind==='updateToc'?s.update_toc(req.block):s.remove_toc(req.block));const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'edited',document:this.describe(editMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='listStyles')return{res:{id:req.id,ok:true,kind:'styles',items:JSON.parse(this.need().styles_list())},transfer:[]};
   if(req.kind==='upsertStyle'){
    const bad=stylePatchProblem(req.patch);if(bad)throw new Error(bad);
    const s=this.need();let styleId='';const [,editMs]=this.timed(()=>{styleId=s.upsert_style(JSON.stringify(req.patch));});const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'styleSaved',styleId,document:this.describe(editMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='deleteStyle'){
    if(typeof req.styleId!=='string'||!STYLE_ID_RE.test(req.styleId))throw new Error('The style is not valid.');
    const s=this.need();const [,editMs]=this.timed(()=>s.delete_style(req.styleId));const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'edited',document:this.describe(editMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='restartList'){
    checkParaRange(req.first,req.last);const s=this.need();
    const [,editMs]=this.timed(()=>s.restart_list(req.first,req.last));const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'edited',document:this.describe(editMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='paraStyle'||req.kind==='setList'||req.kind==='listLevel'){
    checkParaRange(req.first,req.last);const s=this.need();
    if(req.kind==='paraStyle'&&!(DOC_STYLES as readonly string[]).includes(req.style)&&!(typeof req.style==='string'&&STYLE_ID_RE.test(req.style)))throw new Error('Style is not offered.');
    if(req.kind==='setList'&&!isListKind(req.list))throw new Error('List kind is not valid.');
    if(req.kind==='listLevel'&&(!Number.isInteger(req.delta)||req.delta<-8||req.delta>8))throw new Error('Level change is not valid.');
    const [,editMs]=this.timed(()=>req.kind==='paraStyle'?s.set_paragraph_style(req.first,req.last,req.style):req.kind==='setList'?s.set_list(req.first,req.last,req.list):s.shift_list_level(req.first,req.last,req.delta));const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'edited',document:this.describe(editMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='tableStyle'){
    if(!Number.isInteger(req.block)||req.block<0||req.block>=2**31)throw new Error('Block is not valid.');
    if(req.scope!=='cell'&&req.scope!=='table')throw new Error('The table style scope is not valid.');
    const bad=tableStyleProblem(req.style);if(bad)throw new Error(bad);
    const s=this.need();const [,editMs]=this.timed(()=>s.style_table(req.block,req.scope,JSON.stringify(req.style)));const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'edited',document:this.describe(editMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='colWidth'){
    if(!Number.isInteger(req.block)||req.block<0||req.block>=2**31)throw new Error('Block is not valid.');
    if(typeof req.width!=='number'||!Number.isFinite(req.width)||req.width<MIN_COL_PT||req.width>MAX_COL_PT)throw new Error(`A column is ${MIN_COL_PT} to ${MAX_COL_PT} points wide.`);
    const s=this.need();const [,editMs]=this.timed(()=>s.set_col_width(req.block,req.width));const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'edited',document:this.describe(editMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='insertImage'){
    if(!Number.isInteger(req.block)||req.block<0||req.block>=2**31)throw new Error('Block is not valid.');
    if(!(req.bytes instanceof ArrayBuffer))throw new Error('The image is not valid.');
    const bytes=new Uint8Array(req.bytes);const bad=imageProblem(bytes);if(bad)throw new Error(IMAGE_ERRORS[bad]);
    if(typeof req.alt!=='string'||!validHfText(req.alt))throw new Error('The alt text is not valid.');
    const s=this.need();const [,editMs]=this.timed(()=>s.insert_image(req.block,bytes,req.alt));const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'edited',document:this.describe(editMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='imageEdit'){
    if(!Number.isInteger(req.block)||req.block<0||req.block>=2**31)throw new Error('Block is not valid.');
    const o=req.op;if(!o||typeof o!=='object')throw new Error('The image change is not valid.');
    const s=this.need();
    const [,editMs]=this.timed(()=>{
     if(o.op==='resize'){if(typeof o.width!=='number'||!Number.isFinite(o.width)||o.width<MIN_IMAGE_PT||o.width>MAX_IMAGE_PT)throw new Error('An image is 10 to 2000 points wide.');s.resize_image(req.block,o.width);}
     else if(o.op==='fit'){if(!(IMAGE_WIDTH_PERCENTS as readonly number[]).includes(o.percent))throw new Error('Choose 25, 50, 75 or 100 percent.');s.fit_image(req.block,o.percent);}
     else if(o.op==='alt'){if(typeof o.alt!=='string'||!validHfText(o.alt))throw new Error('The alt text is not valid.');s.set_image_alt(req.block,o.alt);}
     else if(o.op==='remove')s.remove_image(req.block);
     else throw new Error('The image change is not valid.');
    });
    const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'edited',document:this.describe(editMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='pageSetupState')return{res:{id:req.id,ok:true,kind:'pageSetup',state:JSON.parse(this.need().page_setup())},transfer:[]};
   if(req.kind==='setPageSetup'){
    const bad=pageSetupProblem(req.setup);if(bad)throw new Error(bad);
    const s=this.need();const [,editMs]=this.timed(()=>s.set_page_setup(JSON.stringify(req.setup)));const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'edited',document:this.describe(editMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='listOptions'){
    if(!Number.isInteger(req.block)||req.block<0)throw new Error('The paragraph is not valid.');
    return{res:{id:req.id,ok:true,kind:'listOptions',state:JSON.parse(this.need().list_options(req.block))},transfer:[]};
   }
   if(req.kind==='setListOptions'){
    if(!Number.isInteger(req.block)||req.block<0)throw new Error('The paragraph is not valid.');
    const s=this.need();const lv=req.patch&&typeof req.patch.level==='number'?(JSON.parse(s.list_options(req.block)) as {levels?:{format?:string;indent:number;hanging:number}[]}).levels?.[req.patch.level]:undefined;
    const bad=listOptionsProblem(req.patch,lv?.format as never,lv);if(bad)throw new Error(bad);
    const [,editMs]=this.timed(()=>s.set_list_options(req.block,JSON.stringify(req.patch)));const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'edited',document:this.describe(editMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='propertiesState')return{res:{id:req.id,ok:true,kind:'properties',state:JSON.parse(this.need().properties())},transfer:[]};
   if(req.kind==='setProperties'){
    const bad=propertiesProblem(req.patch);if(bad)throw new Error(bad);
    const s=this.need();const [,editMs]=this.timed(()=>s.set_properties(JSON.stringify(req.patch)));const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'edited',document:this.describe(editMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='commentsState')return{res:{id:req.id,ok:true,kind:'comments',comments:JSON.parse(this.need().comments())},transfer:[]};
   if(req.kind==='addComment'){
    const int=(n:unknown)=>typeof n==='number'&&Number.isInteger(n)&&n>=0&&n<2**31;
    if(!int(req.block)||!int(req.start)||!int(req.end)||req.start>=req.end)throw new Error('The comment needs a selection inside one paragraph.');
    const bad=commentProblem(req.text);if(bad)throw new Error(bad);
    if(typeof req.author!=='string'||req.author.length>60||/[\u0000-\u001f\u007f]/.test(req.author)||typeof req.date!=='string'||!/^[0-9TZ:.+-]{1,40}$/.test(req.date))throw new Error('The comment author or date is not valid.');
    const s=this.need();const [,editMs]=this.timed(()=>s.add_comment(req.block,req.start,req.end,req.text.trim(),req.author,req.date));const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'edited',document:this.describe(editMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='replyComment'){
    if(typeof req.parent!=='number'||!Number.isInteger(req.parent)||req.parent<0||req.parent>=2**31)throw new Error('The comment is not valid.');
    const bad=commentProblem(req.text);if(bad)throw new Error(bad);
    if(typeof req.author!=='string'||req.author.length>60||/[\u0000-\u001f\u007f]/.test(req.author)||typeof req.date!=='string'||!/^[0-9TZ:.+-]{1,40}$/.test(req.date))throw new Error('The comment author or date is not valid.');
    const s=this.need();const [,editMs]=this.timed(()=>s.reply_comment(req.parent,req.text.trim(),req.author,req.date));const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'edited',document:this.describe(editMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='resolveComment'||req.kind==='deleteComment'){
    if(typeof req.commentId!=='number'||!Number.isInteger(req.commentId)||req.commentId<0||req.commentId>=2**31)throw new Error('The comment is not valid.');
    if(req.kind==='resolveComment'&&typeof req.resolved!=='boolean')throw new Error('The comment change is not valid.');
    const s=this.need();const [,editMs]=this.timed(()=>{if(req.kind==='resolveComment')s.resolve_comment(req.commentId,req.resolved);else s.delete_comment(req.commentId);});const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'edited',document:this.describe(editMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='headerFooterState')return{res:{id:req.id,ok:true,kind:'headerFooter',state:JSON.parse(this.need().header_footer())},transfer:[]};
   if(req.kind==='setHeaderFooter'){
    if(req.header!==undefined&&!validHfText(req.header))throw new Error('The header text is not valid.');
    if(req.footer!==undefined&&!validHfText(req.footer))throw new Error('The footer text is not valid.');
    if(req.pageNumber!==undefined&&typeof req.pageNumber!=='boolean')throw new Error('The page number choice is not valid.');
    if(req.header===undefined&&req.footer===undefined&&req.pageNumber===undefined)throw new Error('Nothing to change.');
    const s=this.need();const [,editMs]=this.timed(()=>s.set_header_footer(req.header??null,req.footer??null,req.pageNumber??null));const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'edited',document:this.describe(editMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='insertTable'){
    if(!Number.isInteger(req.block)||req.block<0||req.block>=2**31)throw new Error('Block is not valid.');
    if(!Number.isInteger(req.rows)||!Number.isInteger(req.cols)||req.rows<1||req.rows>MAX_NEW_TABLE_ROWS||req.cols<1||req.cols>MAX_NEW_TABLE_COLS)throw new Error('A new table has 1-20 rows and 1-10 columns.');
    const s=this.need();const [,editMs]=this.timed(()=>s.insert_table(req.block,req.rows,req.cols));const [pages,layoutMs]=this.timed(()=>s.paginate());
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
   if(req.kind==='exportPdf'){
    const bad=pdfOptionsProblem(req.options);if(bad)throw new Error(bad);
    if(req.date!==undefined&&(typeof req.date!=='string'||!SAVE_DATE.test(req.date)))throw new Error('The save date is not valid.');
    const opts=req.options&&Object.keys(req.options).length>0?JSON.stringify(req.options):'{}';
    const [bytes,saveMs]=this.timed(()=>req.date!==undefined?this.need().export_pdf_at(opts,req.date):opts!=='{}'?this.need().export_pdf_opts(opts):this.need().export_pdf());
    if(!(bytes instanceof Uint8Array)||bytes.length<5||bytes.length>MAX_PDF_BYTES||String.fromCharCode(bytes[0],bytes[1],bytes[2],bytes[3],bytes[4])!=='%PDF-')throw new Error('The PDF could not be written.');
    const buf=ab(bytes);return{res:{id:req.id,ok:true,kind:'saved',bytes:buf,saveMs},transfer:[buf]};
   }
   if(req.kind==='save'){
    if(req.date!==undefined&&(typeof req.date!=='string'||!SAVE_DATE.test(req.date)))throw new Error('The save date is not valid.');
    if(req.author!==undefined&&(typeof req.author!=='string'||req.author.length>60||/[\u0000-\u001f\u007f-\u009f]/.test(req.author)))throw new Error('The author name is not valid.');
    const author=req.author?.trim()??'';
    const [bytes,saveMs]=this.timed(()=>req.date!==undefined?(author?this.need().save_at_by(req.date,author):this.need().save_at(req.date)):this.need().save());const buf=ab(bytes);
    return{res:{id:req.id,ok:true,kind:'saved',bytes:buf,saveMs},transfer:[buf]};
   }
   this.session?.free();this.session=null;
   return{res:{id:req.id,ok:true,kind:'closed'},transfer:[]};
  }catch(error){return{res:{id:req.id,ok:false,error:error instanceof Error?error.message:String(error)},transfer:[]};}
 }
}
