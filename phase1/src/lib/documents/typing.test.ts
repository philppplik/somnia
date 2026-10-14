import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyEdit,CELL_BASE,type TextEdit} from './edit';
import type {DocumentsEngine} from './engine';
import {getDocumentsState,patchDocuments} from './store';
import {insertTable,editTable,setParagraphStyle,shiftListLevel,toggleList,setAlign,setLineSpacing,setSpaceAfter,stepIndent,setFont,setFontColor,setFontSize,stepFontSize,toggleFormat,deleteAtCaret,moveCaret,MAX_INSERT_LINES,pasteText,redoEdit,resetSessionsForTest,selectAllText,selectedText,setSessionDeps,splitAtCaret,switchDocument,typeText,undoEdit,syncGeometry} from './session';
import {stepBoundary,wordBoundary} from './text';
const docx=new Uint8Array(readFileSync(new URL('../../../test/documents/sample.docx',import.meta.url)));
type Row={text:string;locked?:boolean;f?:Set<string>[];p?:Record<string,number|string>};
/** Paragraph model of the engine: replace/split/merge/snapshot/restore with the same UTF-8 offset rules. */
class Doc{
 rows:Row[];snaps=new Map<number,Row[]>();n=0;failAt=-1;calls=0;hits:(page:number,x:number,y:number)=>{block:number|null;off?:number;editable:boolean}|null=()=>null;
 constructor(rows:(string|Row)[]){this.rows=rows.map(r=>typeof r==='string'?{text:r}:r);}
 get isDisposed(){return false;}
 doc(){return{pages:1,pageSizes:[{width:600,height:800}],text:this.rows.map(r=>r.text).join('\n'),cacheHits:0,cacheMisses:0,openMs:1,layoutMs:1};}
 private tick(){if(++this.calls===this.failAt)throw new Error('engine failure');}
 async init(){return {} as never;}async open(){return this.doc();}
 async blocks(){return this.rows.map((r,i)=>r.locked?{index:i,kind:'table' as const,editable:false}:{index:i,kind:'para' as const,editable:true,text:r.text});}
 async replace(e:TextEdit){this.tick();const old=this.flags(e.block).slice();const h=e.hunks[0];this.rows[e.block]={...this.rows[e.block],text:applyEdit(this.rows[e.block].text,e)};this.rows[e.block].f=[...old.slice(0,h.start),...[...h.text].map(()=>new Set<string>()),...old.slice(h.end)];return this.doc();}
 async split(b:number,off:number){this.tick();const t=this.rows[b].text;const enc=new TextEncoder(),dec=new TextDecoder();const u=enc.encode(t);this.rows.splice(b,1,{text:dec.decode(u.slice(0,off))},{text:dec.decode(u.slice(off))});return this.doc();}
 async merge(b:number){this.tick();this.rows.splice(b-1,2,{text:this.rows[b-1].text+this.rows[b].text});return this.doc();}
 /** ASCII-only character flags (b/i/u per char) so format tests can inspect results. */
 flags(i:number){const r=this.rows[i];while((r.f??=[]).length<r.text.length)r.f.push(new Set());r.f.length=r.text.length;return r.f;}
 async format(s:{block:number;off:number},e:{block:number;off:number},patch:Record<string,boolean>){
  this.tick();const keys=Object.keys(patch);if(!keys.length)throw new Error('bad');
  for(let b=s.block;b<=e.block;b++){if(this.rows[b].locked)throw new Error('table in span');}
  for(let b=s.block;b<=e.block;b++){const f=this.flags(b);const lo=b===s.block?s.off:0,hi=b===e.block?e.off:f.length;for(let k=lo;k<hi;k++)for(const p of keys){const v=patch[p] as unknown;if(typeof v==='boolean'){v?f[k].add(p):f[k].delete(p);}else{for(const x of [...f[k]])if(x.startsWith(p+'='))f[k].delete(x);f[k].add(p+'='+v);}}}
  return this.doc();}
 async formatState(s:{block:number;off:number},e:{block:number;off:number}){
  const out:Record<string,string>={};for(const p of ['bold','italic','underline']){let on=0,off=0;for(let b=s.block;b<=e.block;b++){const f=this.flags(b);const lo=b===s.block?s.off:0,hi=b===e.block?e.off:f.length;for(let k=lo;k<hi;k++)f[k].has(p)?on++:off++;}out[p]=on&&off?'mixed':on?'on':'off';}
  const val=(p:string)=>{const seen=new Set<string>();for(let b=s.block;b<=e.block;b++){const f=this.flags(b);const lo=b===s.block?s.off:0,hi=b===e.block?e.off:f.length;for(let k=lo;k<hi;k++){seen.add([...f[k]].find(x=>x.startsWith(p+'='))?.slice(p.length+1)??'');}}return seen.size===1&&[...seen][0]!==''?[...seen][0]:null;};
  const z:Record<string,unknown>={...out,font:val('font'),size:val('size')===null?null:Number(val('size')),color:val('color')};
  return z as never;}
 async formatParagraphs(a:number,b:number,patch:Record<string,number|string>){this.tick();for(let i=a;i<=b;i++)if(this.rows[i].locked)throw new Error('not a paragraph');for(let i=a;i<=b;i++)this.rows[i]={...this.rows[i],p:{...this.rows[i].p,...patch}};return this.doc();}
 async paragraphState(a:number,b:number){const out:Record<string,unknown>={};for(const k of ['align','indentLeft','indentFirst','spaceBefore','spaceAfter','lineSpacing','style','list','listLevel']){const v=new Set<unknown>();for(let i=a;i<=b;i++)v.add(this.rows[i].p?.[k]??(k==='align'?'left':k==='lineSpacing'?1:k==='style'?'Normal':k==='list'?'none':0));out[k]=v.size===1?[...v][0]:null;}return out as never;}
 async setParagraphStyle(a:number,b:number,style:string){return this.formatParagraphs(a,b,{style});}
 async setList(a:number,b:number,list:string){return this.formatParagraphs(a,b,{list});}
 async shiftListLevel(a:number,b:number,delta:number){this.tick();let any=false;for(let i=a;i<=b;i++){if(this.rows[i].locked)throw new Error('not a paragraph');if(this.rows[i].p?.list&&this.rows[i].p?.list!=='none'){any=true;this.rows[i]={...this.rows[i],p:{...this.rows[i].p,listLevel:Math.min(8,Math.max(0,Number(this.rows[i].p?.listLevel??0)+delta))}};}}if(!any)throw new Error('not in a list');return this.doc();}
 async snapshot(){const id=++this.n;this.snaps.set(id,this.rows.map(r=>({...r,f:r.f?.map(x=>new Set(x))})));return id;}
 async restore(id:number){this.rows=this.snaps.get(id)!.map(r=>({...r,f:r.f?.map(x=>new Set(x))}));return this.doc();}
 async hit(p:number,x:number,y:number){return this.hits(p,x,y);}async caret(){return null;}async rects(b:number,a:number,z:number){return[[0,b,a,z,1]] as never;}
 async save(){return docx;}dispose(){}
 texts(){return this.rows.map(r=>r.text);}
}
let d:Doc;
async function open(rows:(string|Row)[]){resetSessionsForTest();d=new Doc(rows);setSessionDeps({createEngine:()=>d as unknown as DocumentsEngine,loadBytes:async()=>docx});await switchDocument({key:'t.docx',url:'blob:t'});patchDocuments({caret:null,caretBox:null,editError:''});}
const at=(block:number,off:number,anchor?:{block:number;off:number})=>patchDocuments({caret:anchor&&anchor.block!==block?{block,head:off,anchor:anchor.off,anchorBlock:anchor.block}:{block,head:off,anchor:anchor?anchor.off:off}});
const c=()=>getDocumentsState().caret!;
beforeEach(()=>{patchDocuments({caret:null});});
test('word boundaries: words, punctuation, CJK, emoji, edges',()=>{
 const t='Hello, wörld  😀 foo';
 assert.equal(wordBoundary(t,0,1),7);assert.equal(wordBoundary(t,7,1),14);assert.equal(wordBoundary(t,14,1),17);assert.equal(wordBoundary(t,17,1),t.length);assert.equal(wordBoundary(t,t.length,1),t.length);
 assert.equal(wordBoundary(t,t.length,-1),17);assert.equal(wordBoundary(t,17,-1),14);assert.equal(wordBoundary(t,14,-1),7);assert.equal(wordBoundary(t,7,-1),0);assert.equal(wordBoundary(t,0,-1),0);
 assert.equal(wordBoundary('',0,1),0);assert.equal(wordBoundary('   ',1,1),3);assert.equal(wordBoundary('   ',2,-1),0);
 const cjk='你好世界';assert.ok(wordBoundary(cjk,0,1)>0&&wordBoundary(cjk,0,1)<=cjk.length);
});
test('grapheme clusters: emoji, ZWJ family, flags, combining marks and dead-key accents move and delete as one',()=>{
 for(const g of ['😀','👨‍👩‍👧','🇩🇪','e\u0301','👍🏽']){const t='a'+g+'b';const j=stepBoundary(t,1,1);assert.equal(j,1+g.length,g);assert.equal(stepBoundary(t,j,-1),1,g);}
});
test('Ctrl+Right/Left move by word, Shift extends, and the edge crosses into the neighbour',async()=>{
 await open(['one two','three']);at(0,0);
 await moveCaret('wordRight',false);assert.equal(c().head,4);await moveCaret('wordRight',false);assert.equal(c().head,7);
 await moveCaret('wordRight',false);assert.deepEqual([c().block,c().head],[1,0]);
 await moveCaret('wordLeft',false);assert.deepEqual([c().block,c().head],[0,7]);await moveCaret('wordLeft',false);assert.equal(c().head,4);
 at(0,0);await moveCaret('wordRight',true);assert.equal(selectedText(),'one ');
});
test('Shift+Arrow across paragraphs builds a multi-paragraph selection; plain Arrow collapses to its edge',async()=>{
 await open(['ab','cd','ef']);at(0,1);
 await moveCaret('right',true);await moveCaret('right',true);assert.deepEqual([c().block,c().head,c().anchorBlock,c().anchor],[1,0,0,1]);
 await moveCaret('right',true);await moveCaret('right',true);await moveCaret('right',true);assert.equal(selectedText(),'b\ncd\n');
 await moveCaret('left',false);assert.deepEqual([c().block,c().head,c().anchor],[0,1,1]);
});
test('a selection never extends over a table or object paragraph',async()=>{
 await open(['ab',{text:'',locked:true},'cd']);at(0,2);await moveCaret('right',true);assert.deepEqual([c().block,c().head],[0,2]);
 at(0,0);selectAllText();assert.equal(selectedText(),'ab');
});
test('Ctrl+A selects the whole run of editable paragraphs',async()=>{
 await open(['a','b',{text:'',locked:true},'c','d']);at(3,0);selectAllText();assert.equal(selectedText(),'c\nd');
});
test('deleting a multi-paragraph selection merges it into one paragraph and is ONE undo step',async()=>{
 await open(['Hello world','middle','tail end']);at(2,4,{block:0,off:5});
 await deleteAtCaret(-1);assert.deepEqual(d.texts(),['Hello end']);assert.deepEqual([c().block,c().head],[0,5]);
 assert.equal(getDocumentsState().blocks.length,1);
 await undoEdit();assert.deepEqual(d.texts(),['Hello world','middle','tail end']);assert.equal(getDocumentsState().canUndo,false);
 await redoEdit();assert.deepEqual(d.texts(),['Hello end']);
});
test('typing over a multi-paragraph selection replaces it atomically',async()=>{
 await open(['abc','def','ghi']);at(2,1,{block:0,off:1});await typeText('X');assert.deepEqual(d.texts(),['aXhi']);await undoEdit();assert.deepEqual(d.texts(),['abc','def','ghi']);
});
test('Enter over a multi-paragraph selection deletes it and splits once',async()=>{
 await open(['abc','def','ghi']);at(2,1,{block:0,off:1});await splitAtCaret();assert.deepEqual(d.texts(),['a','hi']);assert.deepEqual([c().block,c().head],[1,0]);
 await undoEdit();assert.deepEqual(d.texts(),['abc','def','ghi']);
});
test('multi-line paste makes paragraphs, over a selection too, as one undo step; CRLF and object chars are normalised',async()=>{
 await open(['Hello world']);at(0,5);await pasteText('A\r\nB\rC\uFFFC');assert.deepEqual(d.texts(),['HelloA','B','C world']);assert.deepEqual([c().block,c().head],[2,1]);
 await undoEdit();assert.deepEqual(d.texts(),['Hello world']);assert.equal(getDocumentsState().canUndo,false);
 at(0,10,{block:0,off:6});await pasteText('x\ny');assert.deepEqual(d.texts(),['Hello x','yd']);
});
test('single-line paste and typed newlines stay in one paragraph',async()=>{
 await open(['ab']);at(0,1);await pasteText('ZZ');assert.deepEqual(d.texts(),['aZZb']);await typeText('1\n2');assert.deepEqual(d.texts(),['aZZ1 2b']);
});
test('paste limits are enforced and leave the document untouched',async()=>{
 await open(['ab']);at(0,1);await pasteText('x\n'.repeat(MAX_INSERT_LINES+1));assert.deepEqual(d.texts(),['ab']);assert.match(getDocumentsState().editError,/too large/);
 patchDocuments({editError:''});await pasteText('y'.repeat(1_000_001));assert.deepEqual(d.texts(),['ab']);assert.match(getDocumentsState().editError,/too large/);
});
test('a selection that includes a table is refused, not partly deleted',async()=>{
 await open(['ab',{text:'',locked:true},'cd']);patchDocuments({caret:{block:2,head:1,anchor:1,anchorBlock:0}});
 await deleteAtCaret(-1);assert.deepEqual(d.texts(),['ab','','cd']);assert.match(getDocumentsState().editError,/cannot be edited/);assert.equal(getDocumentsState().canUndo,false);
});
test('an engine failure half-way through a cross-paragraph delete restores the original paragraphs',async()=>{
 await open(['abc','def','ghi','jkl']);at(3,1,{block:0,off:1});d.failAt=d.calls+4;await deleteAtCaret(-1);
 assert.deepEqual(d.texts(),['abc','def','ghi','jkl']);assert.ok(getDocumentsState().editError);assert.equal(getDocumentsState().canUndo,false);
 assert.equal(getDocumentsState().blocks.length,4);
});
test('Ctrl+Backspace and Ctrl+Delete remove a word; at the edge they join paragraphs',async()=>{
 await open(['one two three','next']);at(0,7);await deleteAtCaret(-1,true);assert.deepEqual(d.texts(),['one  three','next']);
 await deleteAtCaret(1,true);assert.deepEqual(d.texts(),['one three','next']);at(0,9);await deleteAtCaret(1,true);assert.deepEqual(d.texts(),['one threenext']);
});
test('Backspace removes a whole emoji cluster or an accent with its letter; undo restores it',async()=>{
 await open(['a👨‍👩‍👧e\u0301']);const t=d.rows[0].text;const bytes=new TextEncoder().encode(t).length;at(0,bytes);
 await deleteAtCaret(-1);assert.equal(d.rows[0].text,'a👨‍👩‍👧');await deleteAtCaret(-1);assert.equal(d.rows[0].text,'a');await undoEdit();assert.ok(d.texts()[0].length>1);
});
test('IME / dead-key results (composed text, CJK, emoji) insert as one edit at the caret or over a selection',async()=>{
 await open(['ab']);at(0,1);await typeText('é');await typeText('にほんご');await typeText('😀');assert.equal(d.rows[0].text,'aéにほんご😀b');
 at(0,0,{block:0,off:2});await typeText('日本');assert.ok(d.rows[0].text.startsWith('日本'));
});
test('PageDown/PageUp and Up/Down cross pages using line geometry',async()=>{
 await open(['p1 line','p2 line']);
 patchDocuments({pageSizes:[{width:600,height:800},{width:600,height:800}]});
 d.hits=(page,_x,y)=>{if(page===0&&y>=700&&y<=722)return{block:0,off:3,editable:true};if(page===1&&y>=70&&y<=110)return{block:1,off:2,editable:true};return null;};
 patchDocuments({caret:{block:0,anchor:1,head:1},caretBox:{page:0,x:100,top:710,height:14}});
 await moveCaret('down',false);assert.deepEqual([c().block,c().head],[1,2]);
 patchDocuments({caretBox:{page:1,x:100,top:72,height:14}});await moveCaret('up',false);assert.deepEqual([c().block,c().head],[0,3]);
 patchDocuments({caret:{block:0,anchor:1,head:1},caretBox:{page:0,x:100,top:710,height:14}});await moveCaret('pageDown',false);assert.equal(c().block,1);
 patchDocuments({caretBox:{page:1,x:100,top:72,height:14}});await moveCaret('pageUp',false);assert.equal(c().block,0);
 await moveCaret('pageUp',false);assert.equal(c().block,0);
});
test('Ctrl+Home/End jump to the first and last editable paragraph; Shift extends across everything between',async()=>{
 await open(['one',{text:'',locked:true},'two','three']);at(2,1);await moveCaret('docEnd',false);assert.deepEqual([c().block,c().head],[3,5]);
 await moveCaret('docStart',false);assert.deepEqual([c().block,c().head],[0,0]);
 at(3,1);await moveCaret('docStart',true);assert.deepEqual([c().block,c().head],[3,1],'the table in between blocks the extension');
});
test('selection geometry is requested per paragraph for a multi-paragraph selection',async()=>{
 await open(['abc','def','ghi']);at(2,2,{block:0,off:1});await syncGeometry();const r=getDocumentsState().selRects;
 assert.deepEqual(r.map(x=>[x[1],x[2],x[3]]),[[0,1,3],[1,0,3],[2,0,2]]);
});

const has=(b:number,k:number,p:string)=>d.flags(b)[k].has(p);
test('Ctrl+B on a mixed selection bolds everything; on an all-bold selection it removes it; each is one undo step',async()=>{
 await open(['hello world']);d.flags(0)[0].add('bold');at(0,5,{block:0,off:0});await syncGeometry();
 assert.equal(getDocumentsState().format?.bold,'mixed');
 await toggleFormat('bold');assert.ok([0,1,2,3,4].every(k=>has(0,k,'bold')));assert.equal(has(0,5,'bold'),false);
 assert.deepEqual(getDocumentsState().caret,{block:0,anchor:0,head:5});await syncGeometry();assert.equal(getDocumentsState().format?.bold,'on');
 await toggleFormat('bold');assert.ok([0,1,2,3,4].every(k=>!has(0,k,'bold')));
 await undoEdit();assert.ok([0,1,2,3,4].every(k=>has(0,k,'bold')));await undoEdit();assert.equal(has(0,1,'bold'),false);assert.equal(has(0,0,'bold'),true);
});
test('formatting across paragraphs is atomic, and italic/underline are independent',async()=>{
 await open(['abc','def','ghi']);at(2,2,{block:0,off:1});await toggleFormat('italic');await toggleFormat('underline');
 assert.ok(has(0,1,'italic')&&has(1,1,'italic')&&has(2,1,'italic')&&!has(0,0,'italic')&&!has(2,2,'italic')&&has(1,0,'underline'));
 assert.equal(has(1,0,'bold'),false);
});
test('a table inside the span is refused and nothing is formatted',async()=>{
 await open(['ab',{text:'',locked:true},'cd']);patchDocuments({caret:{block:2,head:1,anchor:0,anchorBlock:0}});
 await toggleFormat('bold');assert.ok(getDocumentsState().editError);assert.equal(has(0,0,'bold'),false);assert.equal(getDocumentsState().canUndo,false);
});
test('an engine failure while formatting restores the paragraphs and records no undo step',async()=>{
 await open(['abc','def']);at(1,2,{block:0,off:0});d.failAt=d.calls+1;await toggleFormat('bold');
 assert.equal(getDocumentsState().canUndo,false);assert.ok(getDocumentsState().editError);assert.equal(has(0,0,'bold'),false);
});
test('a collapsed caret holds the choice for the next typed text only, in one undo step',async()=>{
 await open(['ab']);at(0,1);await toggleFormat('bold');assert.equal(getDocumentsState().pendingFormat?.patch.bold,true);assert.equal(d.texts()[0],'ab');
 await typeText('XY');assert.equal(d.texts()[0],'aXYb');assert.ok(has(0,1,'bold')&&has(0,2,'bold')&&!has(0,0,'bold')&&!has(0,3,'bold'));
 await undoEdit();assert.equal(d.texts()[0],'ab');
});
test('moving the caret drops the held format',async()=>{
 await open(['abcd']);at(0,1);await toggleFormat('italic');at(0,3);await syncGeometry();assert.equal(getDocumentsState().pendingFormat,null);
 await typeText('Z');assert.equal(has(0,3,'italic'),false);
});

test('font, size and colour apply as one undo step across paragraphs and report a shared or mixed value',async()=>{
 await open(['abc','def']);at(1,2,{block:0,off:1});
 await toggleFormat('bold');await setFont('Source Serif 4');await setFontSize(18);await setFontColor('C0392B');
 await syncGeometry();const f=getDocumentsState().format!;
 assert.equal(f.font,'Source Serif 4');assert.equal(f.size,18);assert.equal(f.color,'C0392B');
 at(1,2,{block:0,off:0});await syncGeometry();assert.equal(getDocumentsState().format?.size,null);
 at(1,2,{block:0,off:1});await undoEdit();at(1,2,{block:0,off:1});await syncGeometry();assert.equal(getDocumentsState().format?.color,null);assert.equal(getDocumentsState().format?.size,18);
});
test('invalid font, size or colour never reaches the engine and leaves the document untouched',async()=>{
 await open(['abc']);at(0,2,{block:0,off:0});const calls=d.calls;
 for(const run of [()=>setFontSize(0),()=>setFontSize(401),()=>setFontSize(Number.NaN),()=>setFont(''),()=>setFont('x'.repeat(65)),()=>setFont('a\nb'),()=>setFontColor('red'),()=>setFontColor('#C0392B')]){await run();assert.ok(getDocumentsState().editError);patchDocuments({editError:''});}
 assert.equal(d.calls,calls);assert.equal(getDocumentsState().canUndo,false);
});
test('size chosen at a collapsed caret applies to the next typed text only; Ctrl+> steps the ladder',async()=>{
 await open(['ab']);at(0,1);await setFontSize(24);await typeText('X');assert.ok(d.flags(0)[1].has('size=24')&&!d.flags(0)[0].has('size=24')&&!d.flags(0)[2].has('size=24'));
 await undoEdit();assert.equal(d.texts()[0],'ab');
 await open(['abc']);at(0,3,{block:0,off:0});await syncGeometry();await setFontSize(12);await syncGeometry();await stepFontSize(1);await syncGeometry();assert.equal(getDocumentsState().format?.size,14);
 await stepFontSize(-1);await syncGeometry();await stepFontSize(-1);await syncGeometry();assert.equal(getDocumentsState().format?.size,11);
});
test('a table in the span refuses a size change',async()=>{
 await open(['ab',{text:'',locked:true},'cd']);patchDocuments({caret:{block:2,head:1,anchor:0,anchorBlock:0}});
 await setFontSize(20);assert.ok(getDocumentsState().editError);assert.equal(getDocumentsState().canUndo,false);
});

test('alignment over several paragraphs is one undo step and the state reports shared or mixed',async()=>{
 await open(['abc','def','ghi']);at(1,1,{block:0,off:1});await setAlign('center');
 assert.deepEqual(d.rows.map(r=>r.p?.align),['center','center',undefined]);
 assert.deepEqual(getDocumentsState().caret,{block:1,anchor:1,head:1,anchorBlock:0});
 await syncGeometry();assert.equal(getDocumentsState().para?.align,'center');
 at(2,1,{block:0,off:1});await syncGeometry();assert.equal(getDocumentsState().para?.align,null);
 await undoEdit();assert.deepEqual(d.rows.map(r=>r.p?.align),[undefined,undefined,undefined]);
});
test('indent steps by 36 pt, clamps at 0, and never goes below zero',async()=>{
 await open(['abc']);at(0,1);await syncGeometry();await stepIndent(-1);assert.equal(d.rows[0].p?.indentLeft,undefined);
 await stepIndent(1);await syncGeometry();await stepIndent(1);assert.equal(d.rows[0].p?.indentLeft,72);
 await syncGeometry();await stepIndent(-1);await syncGeometry();assert.equal(d.rows[0].p?.indentLeft,36);
});
test('invalid spacing never reaches the engine; a table in the span is refused with nothing changed',async()=>{
 await open(['ab',{text:'',locked:true},'cd']);at(0,1);const calls=d.calls;
 for(const run of [()=>setLineSpacing(0),()=>setLineSpacing(11),()=>setSpaceAfter(-1),()=>setSpaceAfter(Number.NaN),()=>setAlign('middle' as never)]){await run();assert.ok(getDocumentsState().editError);patchDocuments({editError:''});}
 assert.equal(d.calls,calls);
 patchDocuments({caret:{block:2,head:1,anchor:0,anchorBlock:0}});await setAlign('right');assert.ok(getDocumentsState().editError);assert.equal(getDocumentsState().canUndo,false);assert.equal(d.rows[0].p,undefined);
});
test('an engine failure while changing paragraph formatting restores and records no undo step',async()=>{
 await open(['abc','def']);at(1,1,{block:0,off:0});d.failAt=d.calls+1;await setAlign('right');
 assert.equal(getDocumentsState().canUndo,false);assert.ok(getDocumentsState().editError);assert.equal(d.rows[0].p?.align,undefined);
});

test('heading style applies to every paragraph in the selection as one undo step; unknown styles never reach the engine',async()=>{
 await open(['abc','def','ghi']);at(1,1,{block:0,off:1});await setParagraphStyle('Heading1');
 assert.deepEqual(d.rows.map(r=>r.p?.style),['Heading1','Heading1',undefined]);await syncGeometry();assert.equal(getDocumentsState().para?.style,'Heading1');
 const calls=d.calls;await setParagraphStyle('Heading9' as never);assert.ok(getDocumentsState().editError);assert.equal(d.calls,calls);
 patchDocuments({editError:''});await undoEdit();assert.deepEqual(d.rows.map(r=>r.p?.style),[undefined,undefined,undefined]);
});
test('list button toggles: on, then off when the whole selection already has that kind; Tab levels need a list',async()=>{
 await open(['abc','def']);at(1,1,{block:0,off:0});
 await shiftListLevel(1);assert.ok(getDocumentsState().editError);patchDocuments({editError:''});
 await toggleList('bullet');assert.deepEqual(d.rows.map(r=>r.p?.list),['bullet','bullet']);await syncGeometry();assert.equal(getDocumentsState().para?.list,'bullet');
 await shiftListLevel(1);assert.equal(d.rows[0].p?.listLevel,1);await shiftListLevel(-1);await shiftListLevel(-1);assert.equal(d.rows[1].p?.listLevel,0);
 await toggleList('bullet');assert.deepEqual(d.rows.map(r=>r.p?.list),['none','none']);
 await toggleList('numbered');await syncGeometry();await toggleList('bullet');assert.deepEqual(d.rows.map(r=>r.p?.list),['bullet','bullet']);
});
test('a table in the span refuses style and list changes',async()=>{
 await open(['ab',{text:'',locked:true},'cd']);patchDocuments({caret:{block:2,head:1,anchor:0,anchorBlock:0}});
 await setParagraphStyle('Title');assert.ok(getDocumentsState().editError);patchDocuments({editError:''});await toggleList('numbered');assert.ok(getDocumentsState().editError);
 assert.equal(getDocumentsState().canUndo,false);assert.equal(d.rows[0].p,undefined);
});
/** Engine whose blocks are two top paragraphs and a 2x1 table of cell paragraphs addressed from CELL_BASE. */
class CellDoc extends Doc{
 cells=['alpha','beta'];edits:{block:number;text:string}[]=[];
 override async blocks():Promise<never>{return [{index:0,kind:'para' as const,editable:true,text:'top'},{index:1,kind:'table' as const,editable:false},...this.cells.map((t,i)=>({index:CELL_BASE+i,kind:'cell' as const,editable:true,text:t,table:1,row:i,cell:0,para:0}))] as never;}
 override async replace(e:TextEdit){const i=e.block-CELL_BASE;if(i<0||i>=this.cells.length)throw new Error('no cell paragraph');this.edits.push({block:e.block,text:applyEdit(this.cells[i],e)});this.cells[i]=applyEdit(this.cells[i],e);return this.doc();}
 override async merge(_b:number):Promise<never>{throw new Error('paragraphs inside table cells cannot be split or joined yet');}
 override async split(_b:number,_o:number):Promise<never>{throw new Error('paragraphs inside table cells cannot be split or joined yet');}
}
async function openCells(){resetSessionsForTest();const cd=new CellDoc(['top']);setSessionDeps({createEngine:()=>cd as unknown as DocumentsEngine,loadBytes:async()=>docx});await switchDocument({key:'c.docx',url:'blob:c'});return cd;}
test('typing and deleting inside a table cell paragraph edits that cell only',async()=>{
 const cd=await openCells();at(CELL_BASE,5);await typeText('!');assert.equal(cd.cells[0],'alpha!');assert.equal(cd.cells[1],'beta');
 await deleteAtCaret(-1);assert.equal(cd.cells[0],'alpha');assert.equal(getDocumentsState().editError,'');
});
test('Backspace/Delete at a cell paragraph edge is a silent no-op; Enter shows the engine refusal',async()=>{
 const cd=await openCells();at(CELL_BASE+1,0);await deleteAtCaret(-1);assert.deepEqual(cd.cells,['alpha','beta']);assert.equal(getDocumentsState().editError,'');assert.equal(getDocumentsState().caretLocked,false);
 at(CELL_BASE,5);await deleteAtCaret(1);assert.equal(getDocumentsState().editError,'');
 await splitAtCaret();assert.match(getDocumentsState().editError,/cannot be split/);assert.deepEqual(cd.cells,['alpha','beta']);
});
test('a selection across two cells is refused without changing either; Ctrl+A stays inside the cell',async()=>{
 const cd=await openCells();at(CELL_BASE+1,2,{block:CELL_BASE,off:1});await typeText('x');
 assert.match(getDocumentsState().editError,/cannot be edited as text/);assert.deepEqual(cd.cells,['alpha','beta']);
 at(CELL_BASE,2);selectAllText();assert.equal(selectedText(),'alpha');
});
test('editTable needs a caret in one table cell and surfaces engine refusals without changing the document',async()=>{
 const cd=await openCells() as CellDoc&{tableCalls?:string[]};const calls:string[]=[];
 (cd as unknown as {editTable:(b:number,o:string)=>Promise<unknown>}).editTable=async(b,o)=>{calls.push(b+o);throw new Error('the table has reached its row limit');};
 await editTable('row_below');assert.equal(calls.length,0);// no caret
 at(0,1);await editTable('row_below');assert.match(getDocumentsState().editError,/inside a table cell|table cell/);assert.equal(calls.length,0);
 at(CELL_BASE+1,2,{block:CELL_BASE,off:1});await editTable('row_below');assert.match(getDocumentsState().editError,/one table cell/);assert.equal(calls.length,0);
 at(CELL_BASE,1);await editTable('row_below');assert.deepEqual(calls,[CELL_BASE+'row_below']);assert.match(getDocumentsState().editError,/row limit/);assert.deepEqual(cd.cells,['alpha','beta']);
});
test('insertTable needs a collapsed caret and a size inside the bounds, and surfaces engine refusals unchanged',async()=>{
 const cd=await openCells();const calls:string[]=[];
 (cd as unknown as {insertTable:(b:number,r:number,c:number)=>Promise<unknown>}).insertTable=async(b,r,c)=>{calls.push(`${b}:${r}x${c}`);throw new Error('the document has too many blocks');};
 await insertTable(2,2);assert.equal(calls.length,0);// no caret
 at(0,1);for(const [r,c] of [[0,2],[21,2],[2,0],[2,11],[1.5,2]]){await insertTable(r,c);assert.match(getDocumentsState().editError,/1-20 rows/);}
 assert.equal(calls.length,0);
 at(CELL_BASE+1,2,{block:CELL_BASE,off:1});await insertTable(2,2);assert.match(getDocumentsState().editError,/one paragraph/);
 at(CELL_BASE,1);await insertTable(3,3);assert.deepEqual(calls,[CELL_BASE+':3x3']);assert.match(getDocumentsState().editError,/too many blocks/);assert.deepEqual(cd.cells,['alpha','beta']);
});
