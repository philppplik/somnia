import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyReviewed,undoReceipt,type DeckOwnerPort,type UndoPort,type DeckSnapshot} from './deckReceipt';

/** A faithful in-memory owner: same commit and history rules as the session, no worker. */
function owner(opts:{stageFail?:boolean;restoreFail?:boolean;renderFail?:boolean;maxHistory?:number}={}){
  const o={generation:1,revision:0,busy:false,disposed:false,working:new Uint8Array([1]),undo:[] as Uint8Array[],redo:[] as Uint8Array[],last:undefined as undefined|{token:string;before:Uint8Array;after:Uint8Array},n:0,native:new Uint8Array([1]),errors:[] as string[],beforeCommit:undefined as undefined|(()=>void)};
  const text=()=>`deck:${[...o.working].join(',')}`;
  const snapshot=():DeckSnapshot=>({generation:o.generation,identity:'file:a',revision:o.revision,busy:o.busy,disposed:o.disposed,text:text(),working:o.working});
  const common={snapshot,setBusy:(b:boolean)=>{o.busy=b;},restoreNative:async(w:Uint8Array)=>{if(opts.restoreFail)throw Error('restore failed');o.native=w;},readback:text,fail:(m:string)=>{o.errors.push(m);},render:async()=>{if(opts.renderFail)throw Error('render failed');}};
  const stage=async(b:Uint8Array)=>{if(opts.stageFail)throw Error('open failed');o.native=b;return b;};
  const apply:DeckOwnerPort<Uint8Array>={...common,edit:(_s,t)=>{if(t==='deck:bad')throw Error('Run mismatch');return new Uint8Array(t.replace('deck:','').split(',').filter(Boolean).map(Number));},stage,
    commit:(st,before,after)=>{o.beforeCommit?.();const h=[...o.undo,before].slice(Math.max(0,[...o.undo,before].length-(opts.maxHistory??10)));const kept=h.at(-1)===before;o.revision++;o.working=after;o.undo=h;o.redo=[];const token='t'+(++o.n);o.last=kept?{token,before,after}:undefined;return {revision:o.revision,token,undoable:kept};}};
  const undo:UndoPort<Uint8Array>={...common,stage,matches:(t,g)=>{const l=o.last;return l&&l.token===t&&o.generation===g&&o.working===l.after&&o.undo.at(-1)===l.before&&o.redo.length===0?l.before:null;},commitUndo:()=>{const l=o.last!;o.last=undefined;o.revision++;o.working=l.before;o.undo.pop();o.redo.push(l.after);return {revision:o.revision};}};
  return {o,apply,undo};
}
type H=ReturnType<typeof owner>;
const cur=(o:H['o'])=>`deck:${[...o.working].join(',')}`;
/** Reviewed A to B: the reviewer saw the current deck and approves `after`. */
const rv=(o:H['o'],after:string,over:Partial<{expectedText:string;revision:number;identity:string;generation:number}>={})=>({expectedText:cur(o),afterText:after,revision:o.revision,identity:'file:a',generation:o.generation,...over});
const A=(h:H,after='deck:2')=>applyReviewed(h.apply,rv(h.o,after),'agent');

test('A to B changes once: delta 1, readback of B, one history entry, exact undo',async()=>{
  const h=owner(),r=await A(h);
  assert.equal(r.status,'applied');assert.equal(r.historyDelta,1);assert.equal(r.beforeRevision,0);assert.equal(r.afterRevision,1);assert.equal(h.o.undo.length,1);assert.equal(r.readback,'deck:2');assert.equal(r.readbackMatches,true);assert.equal(r.undoable,true);
  const u=await undoReceipt(h.undo,r);assert.equal(u.status,'applied');assert.deepEqual([...h.o.working],[1]);assert.equal(h.o.undo.length,0);assert.equal(h.o.redo.length,1);
  await assert.rejects(()=>undoReceipt(h.undo,r),/Nothing to undo|changed/);
});
test('same A (after equals expected) is a true no-op and touches nothing',async()=>{
  const h=owner(),r=await A(h,'deck:1');
  assert.equal(r.status,'noop');assert.equal(r.historyDelta,0);assert.equal(h.o.undo.length,0);assert.equal(h.o.revision,0);assert.equal(h.o.busy,false);
});
test('stale A is refused: other text, revision, identity or generation',async()=>{
  const h=owner();h.o.revision=1;h.o.working=new Uint8Array([9]);
  await assert.rejects(()=>applyReviewed(h.apply,rv(h.o,'deck:2',{expectedText:'deck:1'}),'agent'),/changed since review/);
  await assert.rejects(()=>applyReviewed(h.apply,rv(h.o,'deck:2',{revision:0}),'agent'),/changed since review/);
  await assert.rejects(()=>applyReviewed(h.apply,rv(h.o,'deck:2',{identity:'file:b'}),'agent'),/changed since review/);
  await assert.rejects(()=>applyReviewed(h.apply,rv(h.o,'deck:2',{generation:2}),'agent'),/changed since review/);
  assert.equal(h.o.revision,1);assert.equal(h.o.undo.length,0);
});
test('part/run mismatch while building the edit is a proven precommit failure',async()=>{
  const h=owner(),r=await A(h,'deck:bad');
  assert.equal(r.status,'precommit');assert.equal(r.historyDelta,0);assert.match(r.error!,/Run mismatch/);assert.equal(h.o.revision,0);assert.equal(h.o.busy,false);
});
test('native open failure leaves the deck, restores native, reports precommit',async()=>{
  const h=owner({stageFail:true}),r=await A(h);
  assert.equal(r.status,'precommit');assert.equal(r.historyDelta,0);assert.deepEqual([...h.o.working],[1]);assert.deepEqual([...h.o.native],[1]);assert.equal(h.o.busy,false);
});
test('restore failure after open failure is unknown, not precommit',async()=>{
  const h=owner({stageFail:true,restoreFail:true}),r=await A(h);
  assert.equal(r.status,'unknown');assert.equal(r.historyDelta,null);
});
test('post-commit: render failure stays applied; listener throw after mutation is applied without undo claim',async()=>{
  const h=owner({renderFail:true}),r=await A(h);
  assert.equal(r.status,'applied');assert.equal(r.historyDelta,1);assert.match(r.notifyError!,/render failed/);
  const g=owner(),p={...g.apply,commit:(...a:Parameters<typeof g.apply.commit>)=>{g.apply.commit(...a);throw Error('listener boom');}};
  const r2=await applyReviewed(p,rv(g.o,'deck:2'),'agent');
  assert.equal(r2.status,'applied');assert.equal(r2.undoable,false);assert.match(r2.notifyError!,/listener boom/);assert.deepEqual([...g.o.working],[2]);
});
test('commit throws before any mutation: unknown, never claimed as zero',async()=>{
  const h=owner(),p={...h.apply,commit:()=>{throw Error('x');}};
  const r=await applyReviewed(p,rv(h.o,'deck:2'),'agent');
  assert.equal(r.status,'unknown');assert.equal(r.historyDelta,null);assert.deepEqual([...h.o.working],[1]);
});
test('full history: delta comes from the commit, not history length; exact undo still works',async()=>{
  const h=owner();for(let i=0;i<10;i++)h.o.undo.push(new Uint8Array([i+10]));
  const r=await A(h);
  assert.equal(h.o.undo.length,10);assert.equal(r.historyDelta,1);assert.equal(r.undoable,true);
  const u=await undoReceipt(h.undo,r);assert.deepEqual([...h.o.working],[1]);assert.equal(u.status,'applied');
});
test('history cannot keep the entry: applied but not undoable',async()=>{
  const h=owner({maxHistory:0}),r=await A(h);
  assert.equal(r.status,'applied');assert.equal(r.undoable,false);assert.equal(r.historyDelta,0);
  await assert.rejects(()=>undoReceipt(h.undo,r),/Nothing to undo/);
});
test('undo refuses after manual edit, newer history, reopen and ABA',async()=>{
  const mk=async()=>{const h=owner();return {h,r:await A(h)};};
  let {h,r}=await mk();h.o.revision++;h.o.working=new Uint8Array([3]);await assert.rejects(()=>undoReceipt(h.undo,r),/changed/);
  ({h,r}=await mk());h.o.undo.push(new Uint8Array([7]));await assert.rejects(()=>undoReceipt(h.undo,r),/changed/);
  ({h,r}=await mk());h.o.generation=2;await assert.rejects(()=>undoReceipt(h.undo,r),/changed/);
  ({h,r}=await mk());h.o.working=new Uint8Array([2]);h.o.revision=r.afterRevision!;await assert.rejects(()=>undoReceipt(h.undo,r),/changed/);
  ({h,r}=await mk());h.o.redo.push(new Uint8Array([4]));await assert.rejects(()=>undoReceipt(h.undo,r),/changed/);
  ({h,r}=await mk());await assert.rejects(()=>undoReceipt(h.undo,{...r,token:'t999'}),/changed|Nothing/);
});
test('concurrent change during staging aborts, restores native, writes nothing',async()=>{
  const h=owner(),p={...h.apply,stage:async(b:Uint8Array)=>{h.o.revision++;h.o.working=new Uint8Array([5]);return b;}};
  const r=await applyReviewed(p,rv(h.o,'deck:2'),'agent');
  assert.equal(r.status,'precommit');assert.deepEqual([...h.o.working],[5]);assert.equal(h.o.undo.length,0);assert.deepEqual([...h.o.native],[1]);
});
test('undo staging failure keeps deck and receipt state',async()=>{
  const h=owner(),r=await A(h);
  const bad:UndoPort<Uint8Array>={...h.undo,stage:async()=>{throw Error('open failed');}};
  const u=await undoReceipt(bad,r);assert.equal(u.status,'precommit');assert.deepEqual([...h.o.working],[2]);assert.equal(h.o.busy,false);
});

import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {readDeckDocument,serializeDeck,parseDeck,singleRunEditBytes} from './deckDocument';
test('real deck: A to B changes exactly one run; same A and multi-run edits are refused by the engine port',()=>{
  const bytes=new Uint8Array(readFileSync(fileURLToPath(new URL('../../../slides-engine/fixtures/independent.pptx',import.meta.url))));
  const summary={slides:2,widthPt:720,heightPt:405} as never,doc=readDeckDocument(bytes,summary);
  const one=structuredClone(doc);one.slides[0].texts[0].text='Edited title';
  const out=singleRunEditBytes(bytes,summary,parseDeck(serializeDeck(one)));
  assert.equal(readDeckDocument(out,summary).slides[0].texts[0].text,'Edited title');
  assert.equal(readDeckDocument(out,summary).slides[0].texts.length,doc.slides[0].texts.length);
  assert.throws(()=>singleRunEditBytes(bytes,summary,doc),/no change/);
  const two=structuredClone(one);two.slides[0].texts[1].text='Second edit';
  assert.throws(()=>singleRunEditBytes(bytes,summary,parseDeck(serializeDeck(two))),/exactly one/);
  const bad=structuredClone(one);bad.slides[0].texts.pop();
  assert.throws(()=>singleRunEditBytes(bytes,summary,parseDeck(serializeDeck(bad))),/read-only/);
});
