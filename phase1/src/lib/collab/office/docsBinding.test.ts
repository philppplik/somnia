import assert from 'node:assert/strict';
import test from 'node:test';
import * as Y from 'yjs';
import {seedDocsModel} from './docsModel';
import {DocsCollabBinding,type DocsOpKind} from './docsBinding';
const H='d'.repeat(64);
const docs:Y.Doc[]=[];const mk=()=>{const d=new Y.Doc();docs.push(d);return d;};
test.after(()=>{for(const d of docs)d.destroy();});
const flush=()=>new Promise(r=>setTimeout(r,10));
/** Fake stateful engine: one string; insert/replace mutate it, 'boom' text is refused. */
const fakeEngine=()=>{let text='';const log:string[]=[];
 return{log,text:()=>text,port:{
  validate:async(_k:DocsOpKind,p:Record<string,unknown>)=>{if(JSON.stringify(p).includes('boom'))throw new Error('refused');},
  apply:async(kind:DocsOpKind,p:Record<string,unknown>)=>{
   if(JSON.stringify(p).includes('boom'))throw new Error('refused');
   if(kind==='insert'){const at=Math.min(Number(p.utf8Offset),text.length);text=text.slice(0,at)+String(p.text)+text.slice(at);log.push(`insert:${p.text}`);}
   else if(kind==='replace'){const h=(p.hunks as {start:number;end:number;text:string}[])[0];text=text.slice(0,h.start)+h.text+text.slice(h.end);log.push(`replace:${h.text}`);}
   return{text};}}};};
test('journal order converges; refused ops never enter; failing ops skip identically',async()=>{
 const a=mk(),b=mk();
 a.on('update',(u:Uint8Array)=>Y.applyUpdate(b,u));b.on('update',(u:Uint8Array)=>Y.applyUpdate(a,u));
 seedDocsModel(a,'brief.docx',H);
 const eA=fakeEngine(),eB=fakeEngine();
 const bA=new DocsCollabBinding(a,'brief.docx',{engine:eA.port});
 const bB=new DocsCollabBinding(b,'brief.docx',{engine:eB.port});
 const r=await bA.applyLocalOp('insert',{block:0,utf8Offset:0,text:'Hallo'});
 assert.deepEqual(r,{text:'Hallo'});                       // caller gets the in-order engine result
 await assert.rejects(()=>bA.applyLocalOp('insert',{block:0,utf8Offset:0,text:'boom'}));
 assert.equal(bA.journalLength,1);                          // refused input never entered the journal
 await bB.applyLocalOp('insert',{block:0,utf8Offset:5,text:' Welt'});
 await flush();
 assert.equal(eA.text(),eB.text());
 assert.equal(eB.text(),'Hallo Welt');
 assert.equal(eA.log.filter(x=>x==='insert:Hallo').length,1);   // applied exactly once per peer
 bA.destroy();bB.destroy();});
test('late joiner replays from the base; per-person undo appends the inverse',async()=>{
 const a=mk(),b=mk();
 a.on('update',(u:Uint8Array)=>Y.applyUpdate(b,u));b.on('update',(u:Uint8Array)=>Y.applyUpdate(a,u));
 seedDocsModel(a,'brief.docx',H);
 const eA=fakeEngine(),eB=fakeEngine();
 const bA=new DocsCollabBinding(a,'brief.docx',{engine:eA.port});
 const bB=new DocsCollabBinding(b,'brief.docx',{engine:eB.port});
 await bA.applyLocalOp('insert',{block:0,utf8Offset:0,text:'Hallo'},{block:0,hunks:[{start:0,end:5,text:''}]});
 await bB.applyLocalOp('insert',{block:0,utf8Offset:5,text:'!'});
 await flush();
 assert.equal(await bB.undo(),false);                        // B has no invertible op
 assert.equal(await bA.undo(),true);
 await flush();
 assert.equal(eA.text(),'!');
 assert.equal(eA.text(),eB.text());                          // converged after undo
 assert.equal(await bA.redo(),true);
 await flush();
 assert.equal(eB.text(),'Hallo!');
 bA.destroy();bB.destroy();});
