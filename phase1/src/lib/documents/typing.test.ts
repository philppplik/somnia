import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyEdit,type TextEdit} from './edit';
import type {DocumentsEngine} from './engine';
import {getDocumentsState,patchDocuments} from './store';
import {deleteAtCaret,moveCaret,MAX_INSERT_LINES,pasteText,redoEdit,resetSessionsForTest,selectAllText,selectedText,setSessionDeps,splitAtCaret,switchDocument,typeText,undoEdit,syncGeometry} from './session';
import {stepBoundary,wordBoundary} from './text';
const docx=new Uint8Array(readFileSync(new URL('../../../test/documents/sample.docx',import.meta.url)));
type Row={text:string;locked?:boolean};
/** Paragraph model of the engine: replace/split/merge/snapshot/restore with the same UTF-8 offset rules. */
class Doc{
 rows:Row[];snaps=new Map<number,Row[]>();n=0;failAt=-1;calls=0;hits:(page:number,x:number,y:number)=>{block:number|null;off?:number;editable:boolean}|null=()=>null;
 constructor(rows:(string|Row)[]){this.rows=rows.map(r=>typeof r==='string'?{text:r}:r);}
 get isDisposed(){return false;}
 doc(){return{pages:1,pageSizes:[{width:600,height:800}],text:this.rows.map(r=>r.text).join('\n'),cacheHits:0,cacheMisses:0,openMs:1,layoutMs:1};}
 private tick(){if(++this.calls===this.failAt)throw new Error('engine failure');}
 async init(){return {} as never;}async open(){return this.doc();}
 async blocks(){return this.rows.map((r,i)=>r.locked?{index:i,kind:'table' as const,editable:false}:{index:i,kind:'para' as const,editable:true,text:r.text});}
 async replace(e:TextEdit){this.tick();this.rows[e.block]={...this.rows[e.block],text:applyEdit(this.rows[e.block].text,e)};return this.doc();}
 async split(b:number,off:number){this.tick();const t=this.rows[b].text;const enc=new TextEncoder(),dec=new TextDecoder();const u=enc.encode(t);this.rows.splice(b,1,{text:dec.decode(u.slice(0,off))},{text:dec.decode(u.slice(off))});return this.doc();}
 async merge(b:number){this.tick();this.rows.splice(b-1,2,{text:this.rows[b-1].text+this.rows[b].text});return this.doc();}
 async snapshot(){const id=++this.n;this.snaps.set(id,this.rows.map(r=>({...r})));return id;}
 async restore(id:number){this.rows=this.snaps.get(id)!.map(r=>({...r}));return this.doc();}
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
