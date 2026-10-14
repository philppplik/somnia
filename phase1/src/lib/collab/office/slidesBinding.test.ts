import assert from 'node:assert/strict';
import test from 'node:test';
import * as Y from 'yjs';
import {seedSlidesModel} from './slidesModel';
import {SlidesCollabBinding} from './slidesBinding';
const H='c'.repeat(64);
const docs:Y.Doc[]=[];const mk=()=>{const d=new Y.Doc();docs.push(d);return d;};
test.after(()=>{for(const d of docs)d.destroy();});
const flush=()=>new Promise(r=>setTimeout(r,10));
const BASE=new Uint8Array([0]);
/** Fake engine: appends the op number to the byte string; throws on args containing 'boom'. */
const fakePort=(log:string[])=>({validate:async(_fn:string,_b:Uint8Array,args:unknown[])=>{if(JSON.stringify(args).includes('boom'))throw new Error('refused');},
 apply:async(fn:string,bytes:Uint8Array,args:unknown[])=>{
 if(JSON.stringify(args).includes('boom'))throw new Error('refused');
 const n=Number(args[args.length-1]);log.push(`${fn}:${n}`);
 return new Uint8Array([...bytes,n]);}});
test('journal order converges across peers; a failing op is skipped everywhere',async()=>{
 const a=mk(),b=mk();
 a.on('update',(u:Uint8Array)=>Y.applyUpdate(b,u));b.on('update',(u:Uint8Array)=>Y.applyUpdate(a,u));
 seedSlidesModel(a,'d.pptx',H);
 const logA:string[]=[],logB:string[]=[];
 const bA=new SlidesCollabBinding(a,'d.pptx',BASE,{engine:fakePort(logA),onBytes:()=>{}});
 const bB=new SlidesCollabBinding(b,'d.pptx',BASE,{engine:fakePort(logB),onBytes:()=>{}});
 await bA.applyLocalOp('slideEdit',['duplicate',1]);
 await bB.applyLocalOp('notes',[2]);
 await flush();
 assert.deepEqual([...bA.currentBytes],[...bB.currentBytes]);      // same bytes on both sides
 assert.deepEqual(logA.sort(),logB.sort());
 assert.equal(logA.length,2);                                     // each op applied exactly once per peer
 // garbage + failing op: skipped identically, convergence holds
 openSlidesModel(a,'d.pptx').ops.push(['junk',{fn:'notes',args:['boom']},{fn:'notes',args:[3]}]);
 await flush();await flush();
 assert.deepEqual([...bA.currentBytes],[...bB.currentBytes]);
 bA.destroy();bB.destroy();});
function openSlidesModel(d:Y.Doc,p:string){return{ops:(d.getMap<unknown>(`office/${p}`).get('ops') as Y.Array<unknown>)};}
test('late joiner replays the journal from the base bytes',async()=>{
 const a=mk();
 seedSlidesModel(a,'d.pptx',H);
 const bA=new SlidesCollabBinding(a,'d.pptx',BASE,{engine:fakePort([]),onBytes:()=>{}});
 await bA.applyLocalOp('slideEdit',['duplicate',1]);
 await bA.applyLocalOp('notes',[2]);
 const late=mk();Y.applyUpdate(late,Y.encodeStateAsUpdate(a));
 const rendered:Uint8Array[]=[];
 const bL=new SlidesCollabBinding(late,'d.pptx',BASE,{engine:fakePort([]),onBytes:x=>rendered.push(x)});
 await bL.replay();
 assert.deepEqual([...bL.currentBytes],[...bA.currentBytes]);
 assert.deepEqual([...bL.currentBytes],[0,1,2]);
 assert.ok(rendered.length>=1);
 bA.destroy();bL.destroy();});
test('per-person undo: only invertible own ops revert, redo restores',async()=>{
 const a=mk(),b=mk();
 a.on('update',(u:Uint8Array)=>Y.applyUpdate(b,u));b.on('update',(u:Uint8Array)=>Y.applyUpdate(a,u));
 seedSlidesModel(a,'d.pptx',H);
 const bA=new SlidesCollabBinding(a,'d.pptx',BASE,{engine:fakePort([]),onBytes:()=>{}});
 const bB=new SlidesCollabBinding(b,'d.pptx',BASE,{engine:fakePort([]),onBytes:()=>{}});
 await bA.applyLocalOp('textEdits',[1],{fn:'textEdits',args:[11]});
 await bB.applyLocalOp('notes',[2]);
 await flush();
 assert.equal(await bB.undo(),false);              // notes carries no inverse
 assert.equal(await bA.undo(),true);
 await flush();
 assert.deepEqual([...bA.currentBytes],[...bB.currentBytes]);
 assert.deepEqual([...bA.currentBytes],[0,1,2,11]);  // journal is append-only: the inverse entry follows, B's 2 kept
 assert.equal(await bA.redo(),true);
 await flush();
 assert.deepEqual([...bA.currentBytes],[0,1,2,11,1]);
 bA.destroy();bB.destroy();});
