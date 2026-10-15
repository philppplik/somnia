import test from 'node:test';
import assert from 'node:assert/strict';
import {DocumentsCore,type DocSessionLike} from './core';
/** The host validates every format request before the engine sees it. */
function core(){
 const calls:string[]=[];
 const S=class{constructor(_b?:Uint8Array){}free(){}blocks(){return '[]';}format_range(...[,,,,j]:[number,number,number,number,string]){calls.push(j);}format_state(){return '{"bold":"on","italic":"off","underline":"mixed"}';}paginate(){return {};}} as unknown as new(b:Uint8Array)=>DocSessionLike;
 const k=new DocumentsCore(S);return{k,calls};
}
const rp=(k:DocumentsCore)=>{k.handle({id:1,kind:'open',bytes:new Uint8Array(4)} as never);};
test('format requests with unknown keys, non-booleans, reversed or oversize spans never reach the engine',()=>{
 const {k,calls}=core();rp(k);
 const bad=[{patch:{},s:[0,0],e:[0,1]},{patch:{bold:1},s:[0,0],e:[0,1]},{patch:{color:true},s:[0,0],e:[0,1]},{patch:{bold:true},s:[1,0],e:[0,0]},{patch:{bold:true},s:[0,-1],e:[0,1]},{patch:{bold:true},s:[0,0],e:[5000,0]},{patch:{bold:true},s:[0.5,0],e:[1,0]}];
 for(const b of bad)assert.equal(k.handle({id:2,kind:'format',start:{block:b.s[0],off:b.s[1]},end:{block:b.e[0],off:b.e[1]},patch:b.patch} as never).res.ok,false);
 assert.equal(calls.length,0);
 const good=k.handle({id:9,kind:'format',start:{block:0,off:0},end:{block:0,off:1},patch:{bold:true}} as never).res;void good;assert.deepEqual(calls,['{"bold":true}']);
});
test('formatState validates its span too',()=>{
 const {k}=core();rp(k);assert.equal(k.handle({id:2,kind:'formatState',start:{block:2,off:0},end:{block:1,off:0}} as never).res.ok,false);
 const ok=k.handle({id:3,kind:'formatState',start:{block:0,off:0},end:{block:1,off:0}} as never).res;assert.equal(ok.ok,true);
});

test('font, size and colour patches are validated before the engine',()=>{
 const {k,calls}=core();rp(k);const send=(patch:unknown)=>k.handle({id:2,kind:'format',start:{block:0,off:0},end:{block:0,off:1},patch} as never).res.ok;
 for(const bad of [{size:0},{size:401},{size:'12'},{size:Number.NaN},{font:''},{font:'x'.repeat(65)},{font:'a\u0000'},{font:3},{color:'red'},{color:'#C0392B'},{color:'12345'},{color:7}])assert.equal(send(bad),false,JSON.stringify(bad));
 assert.equal(calls.length,0);
 send({font:'Inter',size:12.5,color:'auto'});send({color:'c0392b'});assert.equal(calls.length,2);
});

test('paragraph patches and ranges are validated before the engine',()=>{
 const calls:string[]=[];
 const S=class{constructor(_b?:Uint8Array){}free(){}blocks(){return '[]';}format_paragraphs(_a:number,_b:number,j:string){calls.push(j);}paragraph_state(){return '{"align":"left","indentLeft":0,"indentFirst":0,"spaceBefore":0,"spaceAfter":8,"lineSpacing":1.15}';}paginate(){return {};}} as unknown as new(b:Uint8Array)=>DocSessionLike;
 const k=new DocumentsCore(S);k.handle({id:1,kind:'open',bytes:new Uint8Array(4)} as never);
 const send=(first:number,last:number,patch:unknown)=>k.handle({id:2,kind:'paraFormat',first,last,patch} as never).res.ok;
 for(const bad of [{},{align:'middle'},{align:1},{indentLeft:-1},{indentLeft:1441},{spaceAfter:'3'},{lineSpacing:0.4},{lineSpacing:Number.NaN},{bold:true}])assert.equal(send(0,0,bad),false,JSON.stringify(bad));
 assert.equal(send(2,1,{align:'left'}),false);assert.equal(send(-1,0,{align:'left'}),false);assert.equal(send(0,5000,{align:'left'}),false);
 assert.equal(calls.length,0);send(0,1,{align:'justify',indentFirst:-18,lineSpacing:1.5});assert.equal(calls.length,1);
 assert.equal(k.handle({id:3,kind:'paraState',first:0,last:0} as never).res.ok,true);assert.equal(k.handle({id:4,kind:'paraState',first:3,last:1} as never).res.ok,false);
});

test('style, list and level requests are validated before the engine',()=>{
 const calls:string[]=[];
 const S=class{constructor(_b?:Uint8Array){}free(){}blocks(){return '[]';}set_paragraph_style(...a:[number,number,string]){calls.push('s'+a[2]);}set_list(...a:[number,number,string]){calls.push('l'+a[2]);}shift_list_level(...a:[number,number,number]){calls.push('v'+a[2]);}restart_list(...a:[number,number]){calls.push('r'+a[0]);}continue_list(...a:[number,number]){calls.push('c'+a[0]);}paginate(){return {};}} as unknown as new(b:Uint8Array)=>DocSessionLike;
 const k=new DocumentsCore(S);k.handle({id:1,kind:'open',bytes:new Uint8Array(4)} as never);
 const go=(r:object)=>k.handle({id:2,first:0,last:0,...r} as never).res.ok;
 for(const bad of [{kind:'paraStyle',style:'a b'},{kind:'paraStyle',style:''},{kind:'paraStyle',style:'x'.repeat(81)},{kind:'paraStyle',style:'../x'},{kind:'setList',list:'roman'},{kind:'setList',list:'star'},{kind:'setList',list:'x'},{kind:'setList',list:''},{kind:'setList',list:'Bullet'},{kind:'restartList',first:3,last:1},{kind:'continueList',first:3,last:1},{kind:'continueList',last:5000},{kind:'restartList',last:5000},{kind:'listLevel',delta:9},{kind:'listLevel',delta:1.5},{kind:'listLevel',delta:Number.NaN},{kind:'paraStyle',style:'Title',first:3,last:1},{kind:'setList',list:'bullet',last:5000}])assert.equal(go(bad),false,JSON.stringify(bad));
 assert.equal(calls.length,0);go({kind:'paraStyle',style:'Heading2'});go({kind:'setList',list:'numbered'});go({kind:'listLevel',delta:-1});for(const l of ['dash','square','numberedParen','upperLetter','lowerLetter','lowerRoman','outline','legal'])go({kind:'setList',list:l});go({kind:'restartList',first:2,last:2});go({kind:'continueList',first:4,last:4});
 assert.deepEqual(calls,['sHeading2','lnumbered','v-1','ldash','lsquare','lnumberedParen','lupperLetter','llowerLetter','llowerRoman','loutline','llegal','r2','c4']);
});

test('table edits are validated before the engine',()=>{
 const calls:string[]=[];
 const S=class{constructor(_b?:Uint8Array){}free(){}blocks(){return '[]';}edit_table(b:number,op:string){calls.push(b+op);}paginate(){return {};}} as unknown as new(b:Uint8Array)=>never;
 const k=new DocumentsCore(S);k.handle({id:1,kind:'open',bytes:new Uint8Array(4)} as never);
 const go=(r:object)=>k.handle({id:2,kind:'tableEdit',...r} as never).res.ok;
 for(const bad of [{block:-1,op:'row_above'},{block:1.5,op:'row_above'},{block:2**31,op:'row_above'},{block:5,op:'drop_table'},{block:5,op:'__proto__'},{block:5}])assert.equal(go(bad),false,JSON.stringify(bad));
 assert.equal(calls.length,0);go({block:1048576,op:'delete_col'});assert.deepEqual(calls,['1048576delete_col']);
});

test('insert table requests are bounded before the engine',()=>{
 const calls:string[]=[];
 const S=class{constructor(_b?:Uint8Array){}free(){}blocks(){return '[]';}insert_table(b:number,r:number,c:number){calls.push(`${b}:${r}x${c}`);}paginate(){return {};}} as unknown as new(b:Uint8Array)=>never;
 const k=new DocumentsCore(S);k.handle({id:1,kind:'open',bytes:new Uint8Array(4)} as never);
 const go=(r:object)=>k.handle({id:2,kind:'insertTable',block:0,rows:2,cols:2,...r} as never).res.ok;
 for(const bad of [{rows:0},{rows:21},{cols:0},{cols:11},{rows:1.5},{cols:Number.NaN},{block:-1},{block:2**31}])assert.equal(go(bad),false,JSON.stringify(bad));
 assert.equal(calls.length,0);go({rows:20,cols:10});assert.deepEqual(calls,['0:20x10']);
});

test('header and footer requests are validated before the engine',()=>{
 const calls:string[]=[];
 const S=class{constructor(_b?:Uint8Array){}free(){}blocks(){return '[]';}header_footer(){return '{"header":{"text":"","editable":true},"footer":{"text":"","pageNumber":false,"editable":true}}';}set_header_footer(h:unknown,f:unknown,p:unknown){calls.push(JSON.stringify([h,f,p]));}paginate(){return {};}} as unknown as new(b:Uint8Array)=>never;
 const k=new DocumentsCore(S);k.handle({id:1,kind:'open',bytes:new Uint8Array(4)} as never);
 const go=(r:object)=>k.handle({id:2,kind:'setHeaderFooter',...r} as never).res.ok;
 for(const bad of [{},{header:'a\nb'},{header:'x'.repeat(501)},{footer:'tab\there'},{footer:'\u0007'},{header:'a\ufffcb'},{pageNumber:'yes'},{header:5},{footer:null}])assert.equal(go(bad),false,JSON.stringify(bad));
 assert.equal(calls.length,0);go({header:'Report',pageNumber:true});go({footer:'x'.repeat(500)});
 assert.deepEqual(calls,['["Report",null,true]',JSON.stringify([null,'x'.repeat(500),null])]);
 const st=k.handle({id:3,kind:'headerFooterState'} as never).res as {ok:boolean;state?:{header:{editable:boolean}}};assert.equal(st.state?.header.editable,true);
});

test('list options are validated before the engine',()=>{
 const calls:string[]=[];
 const S=class{constructor(_b?:Uint8Array){}free(){}blocks(){return '[]';}list_options(_b:number){return JSON.stringify({level:0,levels:Array.from({length:9},()=>({format:'decimal',text:'%1.',start:1}))});}set_list_options(b:number,p:string){calls.push(b+':'+p);}paginate(){return {};}} as unknown as new(b:Uint8Array)=>DocSessionLike;
 const k=new DocumentsCore(S);k.handle({id:1,kind:'open',bytes:new Uint8Array(4)} as never);
 const go=(patch:unknown,block=0)=>k.handle({id:2,kind:'setListOptions',block,patch} as never).res.ok;
 for(const bad of [null,[],{},{level:9},{level:-1},{level:1.5},{level:0},{level:0,start:10000},{level:0,start:-1},{level:0,start:1.5},{level:0,start:'2'},{level:0,format:'roman'},{level:0,text:'no number'},{level:0,text:'%2.'},{level:1,text:'%3'},{level:0,text:'%'},{level:0,text:'%1\u0007'},{level:0,text:'%1'.padEnd(40,'x')},{level:0,format:'bullet',text:'ab'},{level:0,color:'red'}])assert.equal(go(bad),false,JSON.stringify(bad));
 assert.equal(go({level:0,start:5},-1),false);assert.equal(go({level:0,start:5},1.5),false);
 assert.equal(calls.length,0);
 go({level:0,start:5,format:'upperRoman',text:'(%1)'});go({level:1,text:'%1.%2'});go({level:0,format:'bullet',text:'*'});
 assert.deepEqual(calls,['0:{"level":0,"start":5,"format":"upperRoman","text":"(%1)"}','0:{"level":1,"text":"%1.%2"}','0:{"level":0,"format":"bullet","text":"*"}']);
});
test('all caps, double strike and character spacing are validated before the engine',()=>{
 const {k,calls}=core();rp(k);const send=(patch:unknown)=>k.handle({id:2,kind:'format',start:{block:0,off:0},end:{block:0,off:1},patch} as never).res.ok;
 for(const bad of [{allCaps:1},{doubleStrike:'yes'},{spacing:31},{spacing:-5.5},{spacing:'1'},{spacing:Number.NaN}])assert.equal(send(bad),false,JSON.stringify(bad));
 assert.equal(calls.length,0);
 send({allCaps:true,doubleStrike:false,spacing:-5});send({spacing:30});assert.equal(calls.length,2);
});
test('header and footer alignment is validated and sent after the text change in one request',()=>{
 const calls:string[]=[];
 const S=class{constructor(_b?:Uint8Array){}free(){}blocks(){return '[]';}paginate(){return 1;}page_info(){return '{"pages":[],"cacheHits":0,"cacheMisses":0}';}text(){return '';}
  set_header_footer(h:string|null,f:string|null,p:boolean|null){calls.push(`text ${h}|${f}|${p}`);}set_header_footer_align(h:string|null,f:string|null){calls.push(`align ${h}|${f}`);}};
 const k=new DocumentsCore(S as unknown as new(b:Uint8Array)=>DocSessionLike);k.handle({id:1,kind:'open',bytes:new Uint8Array(4)} as never);
 const go=(r:object)=>{try{return (k.handle({id:2,kind:'setHeaderFooter',...r} as never).res as {ok:boolean}).ok;}catch{return false;}};
 for(const bad of [{headerAlign:'justify'},{footerAlign:'x'},{footerAlign:3},{}])assert.equal(go(bad),false,JSON.stringify(bad));
 assert.equal(calls.length,0);
 assert.equal(go({header:'H',footerAlign:'right'}),true);assert.deepEqual(calls,['text H|null|null','align null|right']);
 calls.length=0;assert.equal(go({headerAlign:'center'}),true);assert.deepEqual(calls,['align center|null']);
});
test('footer page total is validated and applied after the text change',()=>{
 const calls:string[]=[];
 const S=class{constructor(_b?:Uint8Array){}free(){}blocks(){return '[]';}paginate(){return 1;}page_info(){return '{"pages":[],"cacheHits":0,"cacheMisses":0}';}text(){return '';}
  set_header_footer(h:string|null,f:string|null,p:boolean|null){calls.push(`text ${h}|${f}|${p}`);}set_footer_page_total(t:boolean){calls.push(`total ${t}`);}};
 const k=new DocumentsCore(S as unknown as new(b:Uint8Array)=>DocSessionLike);k.handle({id:1,kind:'open',bytes:new Uint8Array(4)} as never);
 const go=(r:object)=>{try{return (k.handle({id:2,kind:'setHeaderFooter',...r} as never).res as {ok:boolean}).ok;}catch{return false;}};
 for(const bad of [{pageTotal:1},{pageTotal:'yes'},{pageTotal:null}])assert.equal(go(bad),false,JSON.stringify(bad));
 assert.equal(calls.length,0);
 assert.equal(go({pageNumber:true,pageTotal:true}),true);assert.deepEqual(calls,['text null|null|true','total true']);
});
test('header/footer variants: validated before the engine, one call, state read back',()=>{
 const calls:string[]=[];
 const S=class{constructor(_b?:Uint8Array){}free(){}blocks(){return '[]';}paginate(){return 1;}page_info(){return '{"pages":[],"cacheHits":0,"cacheMisses":0}';}text(){return '';}
  header_footer_variants(){return '{"titlePage":true,"evenOdd":false,"first":{"header":{"text":"C","editable":true},"footer":{"text":"","pageNumber":false,"editable":true}},"even":{"header":{"text":"","editable":true},"footer":{"text":"","pageNumber":false,"editable":true}}}';}
  set_header_footer_variants(j:string){calls.push(j);}};
 const k=new DocumentsCore(S as unknown as new(b:Uint8Array)=>DocSessionLike);k.handle({id:1,kind:'open',bytes:new Uint8Array(4)} as never);
 const go=(patch:unknown)=>{try{return (k.handle({id:2,kind:'setHfVariants',patch} as never).res as {ok:boolean}).ok;}catch{return false;}};
 for(const bad of [null,[],{},{x:1},{titlePage:1},{first:{header:5}},{first:{z:1}},{first:null},{even:{header:'a\nb'}},{first:{footer:'x'.repeat(501)}}])assert.equal(go(bad),false,JSON.stringify(bad));
 assert.equal(calls.length,0);
 assert.equal(go({titlePage:true,first:{header:'Cover'}}),true);assert.deepEqual(calls,['{"titlePage":true,"first":{"header":"Cover"}}']);
 const st=(k.handle({id:3,kind:'hfVariantsState'} as never).res as unknown as {state:{titlePage:boolean}}).state;assert.equal(st.titlePage,true);
});
test('section breaks: validated before the engine and passed through once',()=>{
 const calls:string[]=[];
 const S=class{constructor(_b?:Uint8Array){}free(){}blocks(){return '[]';}paginate(){return 1;}page_info(){return '{"pages":[],"cacheHits":0,"cacheMisses":0}';}text(){return '';}
  insert_section_break(b:number,k:string){calls.push(`ins ${b} ${k}`);}remove_section_break(b:number){calls.push(`rm ${b}`);}};
 const k=new DocumentsCore(S as unknown as new(b:Uint8Array)=>DocSessionLike);k.handle({id:1,kind:'open',bytes:new Uint8Array(4)} as never);
 const go=(r:object)=>{try{return (k.handle({id:2,...r} as never).res as {ok:boolean}).ok;}catch{return false;}};
 for(const bad of [{kind:'insertSectionBreak',block:0,sectionKind:'weird'},{kind:'insertSectionBreak',block:-1,sectionKind:'nextPage'},{kind:'insertSectionBreak',block:1.5,sectionKind:'nextPage'},{kind:'insertSectionBreak',block:0,sectionKind:'nextColumn'},{kind:'removeSectionBreak',block:2**31}])assert.equal(go(bad),false,JSON.stringify(bad));
 assert.equal(calls.length,0);
 assert.equal(go({kind:'insertSectionBreak',block:3,sectionKind:'continuous'}),true);assert.equal(go({kind:'removeSectionBreak',block:4}),true);
 assert.deepEqual(calls,['ins 3 continuous','rm 4']);
});
