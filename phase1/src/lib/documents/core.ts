import type {DocumentsRequest,DocumentsResponse,OpenedDocument} from './protocol';
import {MAX_COMPARE_CHARS,MAX_SORT_PARAGRAPHS,coverProblem,bookmarkProblem,PARAGRAPH_SPACINGS,MAX_TEXT_TABLE_ROWS,parseReviewState,EXPORT_EXTS,MAX_EXPORT_BYTES,parseProofIssues,proofWordOk,MAX_USER_WORDS,imageCropProblem,imageWrapProblem,tableLayoutProblem,SECTION_BREAKS,hfVariantsProblem,HF_ALIGNS,stylePatchProblem,STYLE_ID_RE,tocProblem,listOptionsProblem,isListKind,SAVE_DATE,pdfOptionsProblem,MAX_PDF_BYTES,propertiesProblem,commentProblem,validHfText,checkFormatPatch,checkParaPatch,MAX_NEW_TABLE_COLS,MAX_NEW_TABLE_ROWS,TABLE_OPS,DOC_STYLES,MAX_DOCX_BYTES,MAX_FORMAT_BLOCKS,MAX_SCALE,MIN_SCALE,imageProblem,tableStyleProblem,pageSetupProblem,MIN_COL_PT,MAX_COL_PT,IMAGE_WIDTH_PERCENTS,MIN_IMAGE_PT,MAX_IMAGE_PT} from './protocol';
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
export interface DocSessionLike{free():void;sort_paragraphs?(first:number,last:number,descending:boolean):void;move_paragraphs?(first:number,last:number,delta:number):void;compare_text?(text:string):void;section_setup?(block:number):string;set_section_setup?(block:number,setup:string):void;insert_cover_page?(title:string,subtitle:string,author:string,date:string):void;paragraph_spacing?():string;set_paragraph_spacing?(value:string):void;bookmarks?():string;add_bookmark?(block:number,start:number,end:number,name:string):void;delete_bookmark?(name:string):void;table_layout?(block:number):string;set_table_layout?(block:number,patchJson:string):void;insert_section_break?(block:number,kind:string):void;text_to_table?(first:number,last:number):void;set_view_marks?(marks:boolean,markup:boolean):void;remove_section_break?(block:number):void;header_footer_variants?():string;set_header_footer_variants?(patchJson:string):void;set_footer_page_total?(total:boolean):void;set_header_footer_align?(header:string|null,footer:string|null):void;replace_checked?(block:number,expected:string,hunks_json:string):string;styles_list():string;upsert_style(json:string):string;delete_style(id:string):void;insert_toc(block:number,levels:number,title:string,pages:boolean):void;update_toc(block:number):void;remove_toc(block:number):void;continue_list(first:number,last:number):void;list_options(block:number):string;set_list_options(block:number,patchJson:string):void;restart_list(first:number,last:number):void;blocks():string;replace_ranges(block:number,hunksJson:string):void;format_range(sb:number,so:number,eb:number,eo:number,patchJson:string):void;format_state(sb:number,so:number,eb:number,eo:number):string;format_paragraphs(first:number,last:number,patchJson:string):void;paragraph_state(first:number,last:number):string;set_paragraph_style(first:number,last:number,style:string):void;set_list(first:number,last:number,kind:string):void;edit_table(block:number,op:string):void;insert_table(block:number,rows:number,cols:number):void;header_footer():string;set_header_footer(header?:string|null,footer?:string|null,pageNumber?:boolean|null):void;insert_image(block:number,bytes:Uint8Array,alt:string):void;resize_image(block:number,width:number):void;fit_image(block:number,percent:number):void;set_col_width(block:number,width:number):void;page_setup():string;set_page_setup(setupJson:string):void;style_table(block:number,scope:string,styleJson:string):void;set_image_alt(block:number,alt:string):void;set_image_wrap?(block:number,wrap:string,align:string):void;export_format?(ext:string):Uint8Array;set_proofing?(on:boolean):void;set_track_changes?(on:boolean,author:string,date:string):void;set_track_date?(date:string):void;review_state?():string;resolve_change?(block:number,start:number,end:number,accept:boolean):void;resolve_all_changes?(accept:boolean):number;set_show_hidden?(on:boolean):void;proof_check?(words:string):string;proof_suggest?(word:string):string;set_image_crop?(block:number,l:number,t:number,r:number,b:number):void;remove_image(block:number):void;shift_list_level(first:number,last:number,delta:number):void;insert(block:number,utf8Offset:number,text:string):void;page_info():string;paginate():number;render_png(page:number,scale:number):Uint8Array;save():Uint8Array;save_at(date:string):Uint8Array;save_at_by(date:string,author:string):Uint8Array;export_pdf_at(optsJson:string,date:string):Uint8Array;export_pdf():Uint8Array;export_pdf_opts(optsJson:string):Uint8Array;text():string;split_block(block:number,off:number):void;merge_with_previous(block:number):void;snapshot():number;restore(snap:number):void;hit_test(page:number,x:number,y:number):string;caret_at(block:number,off:number):string;selection_rects(block:number,a:number,b:number):string;comments():string;properties():string;set_properties(patchJson:string):void;add_comment(block:number,start:number,end:number,text:string,author:string,date:string):void;reply_comment(parent:number,text:string,author:string,date:string):void;resolve_comment(id:number,resolved:boolean):void;delete_comment(id:number):void}
export interface DocSessionCtor{new(bytes:Uint8Array):DocSessionLike}
const ab=(u:Uint8Array):ArrayBuffer=>u.byteOffset===0&&u.byteLength===u.buffer.byteLength?u.buffer as ArrayBuffer:u.slice().buffer as ArrayBuffer;
/** Owns one open session. Every failure leaves the previous state usable and never keeps a freed pointer. */
export class DocumentsCore{
 private session:DocSessionLike|null=null;
 /** Tracking is on: each edit is stamped with the current time first. */
 private track=false;
 private stampTrack(s:DocSessionLike){if(this.track&&s.set_track_date)s.set_track_date(new Date().toISOString().replace(/\.\d+Z$/,'Z'));}
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
    this.session?.free();this.session=null;this.track=false;
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
    const s=this.need();this.stampTrack(s);const [,editMs]=this.timed(()=>s.replace_ranges(req.block,JSON.stringify(req.hunks.map(h=>[h.start,h.end,h.text]))));const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'edited',document:this.describe(editMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='replaceChecked'){
    if(!Number.isInteger(req.block)||req.block<0||typeof req.expected!=='string'||req.expected.length>1_000_000||!Array.isArray(req.hunks)||req.hunks.length===0||req.hunks.length>10_000)throw new Error('The edit is not valid.');
    for(const h of req.hunks)if(!h||!Number.isInteger(h.start)||!Number.isInteger(h.end)||h.start<0||h.end<h.start||typeof h.text!=='string'||h.text.length>1_000_000)throw new Error('The edit is not valid.');
    const s=this.need();this.stampTrack(s);if(!s.replace_checked)throw new Error('This engine cannot check an edit before applying it.');
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
     else if(o.op==='crop'){const bad=imageCropProblem(o.crop);if(bad)throw new Error(bad);if(!s.set_image_crop)throw new Error('This engine cannot crop pictures.');s.set_image_crop(req.block,o.crop[0],o.crop[1],o.crop[2],o.crop[3]);}
     else if(o.op==='wrap'){const bad=imageWrapProblem(o.wrap,o.align);if(bad)throw new Error(bad);if(!s.set_image_wrap)throw new Error('This engine cannot wrap pictures.');s.set_image_wrap(req.block,o.wrap,o.align);}
     else if(o.op==='remove')s.remove_image(req.block);
     else throw new Error('The image change is not valid.');
    });
    const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'edited',document:this.describe(editMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='proofCheck'){
    if(!Array.isArray(req.words)||req.words.length>MAX_USER_WORDS||!req.words.every(proofWordOk))throw new Error('The word list is not valid.');
    const s=this.need();if(!s.proof_check)throw new Error('This engine cannot check spelling.');
    return{res:{id:req.id,ok:true,kind:'proof',issues:parseProofIssues(s.proof_check(JSON.stringify(req.words)))},transfer:[]};
   }
   if(req.kind==='proofSuggest'){
    if(!proofWordOk(req.word))throw new Error('The word is not valid.');
    const s=this.need();if(!s.proof_suggest)throw new Error('This engine cannot suggest spellings.');
    let w:unknown;try{w=JSON.parse(s.proof_suggest(req.word));}catch{w=[];}
    return{res:{id:req.id,ok:true,kind:'suggest',words:Array.isArray(w)?w.filter(proofWordOk).slice(0,5):[]},transfer:[]};
   }
   if(req.kind==='setViewMarks'){
    if(typeof req.marks!=='boolean'||typeof req.markup!=='boolean')throw new Error('The view setting is not valid.');
    const s=this.need();if(!s.set_view_marks)throw new Error('This engine cannot show formatting marks.');
    const [,editMs]=this.timed(()=>s.set_view_marks!(req.marks,req.markup));const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'edited',document:this.describe(editMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='setTrack'){
    if(typeof req.on!=='boolean')throw new Error('The tracking setting is not valid.');
    if(typeof req.author!=='string'||req.author.trim()===''||req.author.length>60||/[\u0000-\u001f\u007f-\u009f]/.test(req.author))throw new Error('The author name is not valid.');
    if(typeof req.date!=='string'||!SAVE_DATE.test(req.date))throw new Error('The tracking date is not valid.');
    const s=this.need();if(!s.set_track_changes)throw new Error('This engine cannot track changes.');
    const [,editMs]=this.timed(()=>s.set_track_changes!(req.on,req.author,req.date));this.track=req.on;const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'edited',document:this.describe(editMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='reviewState'){
    const s=this.need();if(!s.review_state)throw new Error('This engine cannot list changes.');
    return{res:{id:req.id,ok:true,kind:'review',state:parseReviewState(s.review_state())},transfer:[]};
   }
   if(req.kind==='resolveChange'){
    const int=(n:unknown):n is number=>typeof n==='number'&&Number.isInteger(n)&&n>=0&&n<2**31;
    if(!int(req.block)||!int(req.start)||!int(req.end)||req.end<=req.start||typeof req.accept!=='boolean')throw new Error('The change is not valid.');
    const s=this.need();if(!s.resolve_change)throw new Error('This engine cannot resolve changes.');
    const [,editMs]=this.timed(()=>s.resolve_change!(req.block,req.start,req.end,req.accept));const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'edited',document:this.describe(editMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='resolveAll'){
    if(typeof req.accept!=='boolean')throw new Error('The choice is not valid.');
    const s=this.need();if(!s.resolve_all_changes)throw new Error('This engine cannot resolve changes.');
    const [,editMs]=this.timed(()=>s.resolve_all_changes!(req.accept));const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'edited',document:this.describe(editMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='setShowHidden'){
    if(typeof req.on!=='boolean')throw new Error('The hidden text setting is not valid.');
    const s=this.need();if(!s.set_show_hidden)throw new Error('This engine cannot show hidden text.');
    const [,editMs]=this.timed(()=>s.set_show_hidden!(req.on));const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'edited',document:this.describe(editMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='setProofing'){
    if(typeof req.on!=='boolean')throw new Error('The proofing setting is not valid.');
    const s=this.need();if(!s.set_proofing)throw new Error('This engine cannot mark spelling.');
    const [,editMs]=this.timed(()=>s.set_proofing!(req.on));const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'edited',document:this.describe(editMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='pageSetupState'){
    if(req.block!==undefined){
     if(!Number.isInteger(req.block)||req.block<0)throw new Error('The paragraph is not valid.');
     const s=this.need();if(!s.section_setup)throw new Error('This engine cannot read a section.');
     return{res:{id:req.id,ok:true,kind:'pageSetup',state:JSON.parse(s.section_setup(req.block))},transfer:[]};
    }
    return{res:{id:req.id,ok:true,kind:'pageSetup',state:JSON.parse(this.need().page_setup())},transfer:[]};
   }
   if(req.kind==='setPageSetup'){
    const bad=pageSetupProblem(req.setup);if(bad)throw new Error(bad);
    if(req.block!==undefined){
     if(!Number.isInteger(req.block)||req.block<0)throw new Error('The paragraph is not valid.');
     if('pageColor' in req.setup||'defaultTab' in req.setup)throw new Error('The page colour and the default tab stop belong to the whole document.');
    }
    const s=this.need();if(req.block!==undefined&&!s.set_section_setup)throw new Error('This engine cannot change a section.');
    const [,editMs]=this.timed(()=>req.block===undefined?s.set_page_setup(JSON.stringify(req.setup)):s.set_section_setup!(req.block,JSON.stringify(req.setup)));const [pages,layoutMs]=this.timed(()=>s.paginate());
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
   if(req.kind==='compareText'){
    if(typeof req.text!=='string'||req.text.length===0||req.text.length>MAX_COMPARE_CHARS)throw new Error('The text to compare with is empty or too long.');
    const s=this.need();if(!s.compare_text)throw new Error('This engine cannot compare documents.');
    const [,editMs]=this.timed(()=>s.compare_text!(req.text));const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'edited',document:this.describe(editMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='moveParagraphs'){
    const ok=(n:unknown):n is number=>typeof n==='number'&&Number.isInteger(n)&&n>=0&&n<2**31;
    if(!ok(req.first)||!ok(req.last)||req.last<req.first||req.last-req.first+1>MAX_SORT_PARAGRAPHS||(req.delta!==-1&&req.delta!==1))throw new Error(`Choose up to ${MAX_SORT_PARAGRAPHS} paragraphs to move one place up or down.`);
    const s=this.need();if(!s.move_paragraphs)throw new Error('This engine cannot move paragraphs.');
    const [,editMs]=this.timed(()=>s.move_paragraphs!(req.first,req.last,req.delta));const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'edited',document:this.describe(editMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='sortParagraphs'){
    const ok=(n:unknown):n is number=>typeof n==='number'&&Number.isInteger(n)&&n>=0&&n<2**31;
    if(!ok(req.first)||!ok(req.last)||req.last<=req.first||req.last-req.first+1>MAX_SORT_PARAGRAPHS||typeof req.descending!=='boolean')throw new Error(`Choose 2 to ${MAX_SORT_PARAGRAPHS} paragraphs to sort.`);
    const s=this.need();if(!s.sort_paragraphs)throw new Error('This engine cannot sort paragraphs.');
    const [,editMs]=this.timed(()=>s.sort_paragraphs!(req.first,req.last,req.descending));const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'edited',document:this.describe(editMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='insertCoverPage'){
    const bad=coverProblem(req);if(bad)throw new Error(bad);
    const s=this.need();if(!s.insert_cover_page)throw new Error('This engine has no cover page.');
    const [,editMs]=this.timed(()=>s.insert_cover_page!(req.title,req.subtitle,req.author,req.date));const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'edited',document:this.describe(editMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='paragraphSpacingState'){const s=this.need();if(!s.paragraph_spacing)throw new Error('This engine has no document spacing.');return{res:{id:req.id,ok:true,kind:'paragraphSpacing',value:s.paragraph_spacing()},transfer:[]};}
   if(req.kind==='setParagraphSpacing'){
    if(typeof req.value!=='string'||!(PARAGRAPH_SPACINGS as readonly string[]).includes(req.value))throw new Error('The paragraph spacing is not valid.');
    const s=this.need();if(!s.set_paragraph_spacing)throw new Error('This engine has no document spacing.');
    const [,editMs]=this.timed(()=>s.set_paragraph_spacing!(req.value));const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'edited',document:this.describe(editMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='bookmarksState'){const s=this.need();if(!s.bookmarks)throw new Error('This engine has no bookmarks.');return{res:{id:req.id,ok:true,kind:'bookmarks',bookmarks:JSON.parse(s.bookmarks())},transfer:[]};}
   if(req.kind==='addBookmark'||req.kind==='deleteBookmark'){
    if(typeof req.name!=='string'||bookmarkProblem(req.name)!==null)throw new Error(bookmarkProblem(req.name)??'The bookmark name is not valid.');
    const s=this.need();if(!s.add_bookmark||!s.delete_bookmark)throw new Error('This engine has no bookmarks.');
    if(req.kind==='addBookmark'&&(![req.block,req.start,req.end].every(n=>Number.isInteger(n)&&n>=0&&n<2**31)||req.start>req.end))throw new Error('The bookmark range is not valid.');
    const [,editMs]=this.timed(()=>{if(req.kind==='addBookmark')s.add_bookmark!(req.block,req.start,req.end,req.name);else s.delete_bookmark!(req.name);});const [pages,layoutMs]=this.timed(()=>s.paginate());
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
   if(req.kind==='insertSectionBreak'||req.kind==='removeSectionBreak'){
    if(!Number.isInteger(req.block)||req.block<0||req.block>=2**31)throw new Error('Block is not valid.');
    if(req.kind==='insertSectionBreak'&&!(SECTION_BREAKS as readonly unknown[]).includes(req.sectionKind))throw new Error('The section break type is not valid.');
    const s=this.need();if(!s.insert_section_break||!s.remove_section_break)throw new Error('This engine has no section breaks.');
    const [,editMs]=this.timed(()=>{if(req.kind==='insertSectionBreak')s.insert_section_break!(req.block,req.sectionKind);else s.remove_section_break!(req.block);});const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'edited',document:this.describe(editMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='tableLayoutState'||req.kind==='setTableLayout'){
    if(!Number.isInteger(req.block)||req.block<0||req.block>=2**31)throw new Error('Block is not valid.');
    const s=this.need();if(!s.table_layout||!s.set_table_layout)throw new Error('This engine has no table layout.');
    if(req.kind==='tableLayoutState')return{res:{id:req.id,ok:true,kind:'tableLayout',state:JSON.parse(s.table_layout(req.block))},transfer:[]};
    const bad=tableLayoutProblem(req.patch);if(bad)throw new Error(bad);
    const [,editMs]=this.timed(()=>s.set_table_layout!(req.block,JSON.stringify(req.patch)));const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'edited',document:this.describe(editMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='hfVariantsState'){const s=this.need();if(!s.header_footer_variants)throw new Error('This engine has no header and footer options.');return{res:{id:req.id,ok:true,kind:'hfVariants',state:JSON.parse(s.header_footer_variants())},transfer:[]};}
   if(req.kind==='setHfVariants'){
    const bad=hfVariantsProblem(req.patch);if(bad)throw new Error(bad);
    const s=this.need();if(!s.set_header_footer_variants)throw new Error('This engine has no header and footer options.');
    const [,editMs]=this.timed(()=>s.set_header_footer_variants!(JSON.stringify(req.patch)));const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'edited',document:this.describe(editMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='setHeaderFooter'){
    if(req.header!==undefined&&!validHfText(req.header))throw new Error('The header text is not valid.');
    if(req.footer!==undefined&&!validHfText(req.footer))throw new Error('The footer text is not valid.');
    if(req.pageNumber!==undefined&&typeof req.pageNumber!=='boolean')throw new Error('The page number choice is not valid.');
    for(const v of [req.headerAlign,req.footerAlign])if(v!==undefined&&!(HF_ALIGNS as readonly unknown[]).includes(v))throw new Error('The alignment is not valid.');
    if(req.pageTotal!==undefined&&typeof req.pageTotal!=='boolean')throw new Error('The page total choice is not valid.');
    const hasText=req.header!==undefined||req.footer!==undefined||req.pageNumber!==undefined,hasAlign=req.headerAlign!==undefined||req.footerAlign!==undefined,hasTotal=req.pageTotal!==undefined;
    if(!hasText&&!hasAlign&&!hasTotal)throw new Error('Nothing to change.');
    const s=this.need();if(hasAlign&&!s.set_header_footer_align)throw new Error('This engine cannot align headers and footers.');
    if(hasTotal&&!s.set_footer_page_total)throw new Error('This engine cannot count pages in the footer.');
    const [,editMs]=this.timed(()=>{if(hasText)s.set_header_footer(req.header??null,req.footer??null,req.pageNumber??null);if(hasTotal)s.set_footer_page_total!(req.pageTotal!);if(hasAlign)s.set_header_footer_align!(req.headerAlign??null,req.footerAlign??null);});const [pages,layoutMs]=this.timed(()=>s.paginate());
    return{res:{id:req.id,ok:true,kind:'edited',document:this.describe(editMs,layoutMs,pages)},transfer:[]};
   }
   if(req.kind==='textToTable'){
    const ok=(n:unknown):n is number=>typeof n==='number'&&Number.isInteger(n)&&n>=0&&n<2**31;
    if(!ok(req.first)||!ok(req.last)||req.last<req.first||req.last-req.first+1>MAX_TEXT_TABLE_ROWS)throw new Error(`Choose 1 to ${MAX_TEXT_TABLE_ROWS} paragraphs.`);
    const s=this.need();if(!s.text_to_table)throw new Error('This engine cannot turn text into a table.');
    const [,editMs]=this.timed(()=>s.text_to_table!(req.first,req.last));const [pages,layoutMs]=this.timed(()=>s.paginate());
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
   if(req.kind==='importFormat'){
    if(!(EXPORT_EXTS as readonly unknown[]).includes(req.ext))throw new Error('Choose a Markdown, HTML, text, RTF or ODT file.');
    if(!(req.bytes instanceof ArrayBuffer)||req.bytes.byteLength===0)throw new Error('The file is empty.');
    if(req.bytes.byteLength>MAX_DOCX_BYTES)throw new Error('The file is larger than 16 MB.');
    const conv=(this.Session as unknown as {import_format?:(e:string,b:Uint8Array)=>Uint8Array}).import_format;
    if(!conv)throw new Error('This engine cannot import that format.');
    const [bytes,saveMs]=this.timed(()=>conv.call(this.Session,req.ext,new Uint8Array(req.bytes)));
    if(!(bytes instanceof Uint8Array)||bytes.length===0||bytes.length>MAX_DOCX_BYTES)throw new Error('The file could not be converted.');
    const buf=ab(bytes);return{res:{id:req.id,ok:true,kind:'saved',bytes:buf,saveMs},transfer:[buf]};
   }
   if(req.kind==='exportFormat'){
    if(!(EXPORT_EXTS as readonly unknown[]).includes(req.ext))throw new Error('Choose Markdown, HTML, plain text, RTF or ODT.');
    const s=this.need();if(!s.export_format)throw new Error('This engine cannot export that format.');
    const [bytes,saveMs]=this.timed(()=>s.export_format!(req.ext));
    if(!(bytes instanceof Uint8Array)||bytes.length===0||bytes.length>MAX_EXPORT_BYTES)throw new Error('The file could not be written.');
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
