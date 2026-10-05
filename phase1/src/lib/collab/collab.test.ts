import test from 'node:test';import assert from 'node:assert/strict';
import * as Y from 'yjs';
import {minimalEdit,applyTextToYText} from './textSync';
import {isSafeProjectPath,isCollabFile} from './paths';
import {CollabDoc} from './collabDoc';
const sync=(a:Y.Doc,b:Y.Doc)=>{Y.applyUpdate(b,Y.encodeStateAsUpdate(a,Y.encodeStateVector(b)));Y.applyUpdate(a,Y.encodeStateAsUpdate(b,Y.encodeStateVector(a)));};
test('minimalEdit keeps prefix and suffix',()=>{assert.deepEqual(minimalEdit('<p>a</p>','<p>abc</p>'),{from:4,remove:0,insert:'bc'});assert.equal(minimalEdit('x','x'),null);});
test('minimalEdit never splits emoji',()=>{const e=minimalEdit('a😀b','a😁b')!;assert.equal('a😀b'.slice(0,e.from)+e.insert+'a😀b'.slice(e.from+e.remove),'a😁b');});
test('minimalEdit random round trip',()=>{const al='ab<>/ \n😀';let seed=7;const r=(n:number)=>(seed=(seed*1103515245+12345)&0x7fffffff)%n;
 for(let i=0;i<300;i++){const g=()=>Array.from({length:r(12)},()=>[...al][r([...al].length)]).join('');const a=g(),b=g();const e=minimalEdit(a,b);const out=e?a.slice(0,e.from)+e.insert+a.slice(e.from+e.remove):a;assert.equal(out,b);}});
test('design edit keeps a concurrent edit elsewhere',()=>{
 const A=new CollabDoc(),B=new CollabDoc();const base='<h1>Hi</h1>\n<p>text</p>';A.text('index.html',base);sync(A.doc,B.doc);
 // design view on A changes the heading; B types in the paragraph at the same time
 A.setText('index.html','<h1>Hello</h1>\n<p>text</p>');
 const tb=B.text('index.html');tb.insert(tb.toString().indexOf('</p>'),' more');
 sync(A.doc,B.doc);
 assert.equal(A.snapshot()['index.html'],'<h1>Hello</h1>\n<p>text more</p>');assert.equal(B.snapshot()['index.html'],A.snapshot()['index.html']);});
test('setText with same content makes no update',()=>{const A=new CollabDoc();A.text('a.html','x');let n=0;A.doc.on('update',()=>n++);assert.equal(A.setText('a.html','x'),false);assert.equal(n,0);});
test('unsafe paths are refused and skipped in snapshot',()=>{
 for(const p of ['../x','/etc/passwd','a//b','a/./b','C:\\x','a\\b','','a/..'])assert.equal(isSafeProjectPath(p),false,p);
 assert.equal(isSafeProjectPath('pages/about.html'),true);
 const A=new CollabDoc();assert.throws(()=>A.text('../escape.html'));
 A.files.set('../escape.html',new Y.Text('evil'));A.text('ok.html','fine');assert.deepEqual(Object.keys(A.snapshot()),['ok.html']);});
test('only html files are bound in this slice',()=>{assert.equal(isCollabFile('a.HTML'),true);assert.equal(isCollabFile('a.css'),false);});
test('broken structure from concurrent edits stays visible text, not dropped',()=>{
 const A=new CollabDoc(),B=new CollabDoc();A.text('i.html','<div><b>x</b></div>');sync(A.doc,B.doc);
 const ta=A.text('i.html'),tb=B.text('i.html');ta.delete(ta.toString().indexOf('</div>'),6);tb.insert(3,'<i>');sync(A.doc,B.doc);
 assert.equal(A.snapshot()['i.html'],B.snapshot()['i.html']);assert.ok(A.snapshot()['i.html'].includes('<i>'));});
