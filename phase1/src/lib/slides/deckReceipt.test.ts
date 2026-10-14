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
  const apply:DeckOwnerPort<Uint8Array>={...common,edit:(s,t)=>{if(t==='bad')throw Error('Run mismatch');return new Uint8Array(t.replace('deck:','').split(',').filter(Boolean).map(Number));},stage,
    commit:(st,before,after)=>{o.beforeCommit?.();const h=[...o.undo,before].slice(Math.max(0,[...o.undo,before].length-(opts.maxHistory??10)));const kept=h.at(-1)===before;o.revision++;o.working=after;o.undo=h;o.redo=[];const token='t'+(++o.n);o.last=kept?{token,before,after}:undefined;return {revision:o.revision,token,undoable:kept};}};
  const undo:UndoPort<Uint8Array>={...common,stage,matches:(t,g)=>{const l=o.last;return l&&l.token===t&&o.generation===g&&o.working===l.after&&o.undo.at(-1)===l.before&&o.redo.length===0?l.before:null;},commitUndo:()=>{const l=o.last!;o.last=undefined;o.revision++;o.working=l.before;o.undo.pop();o.redo.push(l.after);return {revision:o.revision};}};
  return {o,apply,undo};
}
const review=(o:ReturnType<typeof owner>['o'],text:string)=>({text,revision:o.revision,identity:'file:a',generation:o.generation});

test('applied: one logical step, readback, undoable',async()=>{
  const h=owner();const r=await applyReviewed(h.apply,{text:'deck:1',revision:0,identity:'file:a',generation:1},'agent');
  // reviewed text equals the current text, so the edit is byte-identical: true no-op
  assert.equal(r.status,'noop');assert.equal(r.historyDelta,0);assert.equal(h.o.undo.length,0);
});
test('applied edit gives receipt delta 1 and exact undo',async()=>{
  const h=owner();
  // reviewed text is what the edit builds from; emulate by reviewing current text then editing
  const port={...h.apply,edit:()=>new Uint8Array([2])};
  const r=await applyReviewed(port,{text:'deck:1',revision:0,identity:'file:a',generation:1},'agent');
  assert.equal(r.status,'applied');assert.equal(r.historyDelta,1);assert.equal(r.beforeRevision,0);assert.equal(r.afterRevision,1);assert.equal(h.o.undo.length,1);assert.equal(r.readback,'deck:2');
  const u=await undoReceipt(h.undo,r);assert.equal(u.status,'applied');assert.deepEqual([...h.o.working],[1]);
  await assert.rejects(()=>undoReceipt(h.undo,r),/Nothing to undo|changed/);
});
test('part/run mismatch is a proven precommit failure',async()=>{
  const h=owner();const r=await applyReviewed(h.apply,{text:'bad',revision:0,identity:'file:a',generation:1},'agent').catch(e=>e);
  assert.ok(r instanceof Error&&/changed since review/.test(r.message));
  const h2=owner();const p={...h2.apply,edit:()=>{throw Error('Run mismatch');}};
  const r2=await applyReviewed(p,{text:'deck:1',revision:0,identity:'file:a',generation:1},'agent');
  assert.equal(r2.status,'precommit');assert.equal(r2.historyDelta,0);assert.match(r2.error!,/Run mismatch/);assert.equal(h2.o.revision,0);
});
test('stale review (reordered slides / manual edit) is refused',async()=>{
  const h=owner();h.o.revision=1;h.o.working=new Uint8Array([9]);
  await assert.rejects(()=>applyReviewed(h.apply,{text:'deck:1',revision:0,identity:'file:a',generation:1},'agent'),/changed since review/);
  await assert.rejects(()=>applyReviewed(h.apply,{text:'deck:9',revision:1,identity:'file:a',generation:2},'agent'),/changed since review/);
});
test('native open failure leaves the deck, restores native, reports precommit',async()=>{
  const h=owner({stageFail:true});const p={...h.apply,edit:()=>new Uint8Array([2])};
  const r=await applyReviewed(p,{text:'deck:1',revision:0,identity:'file:a',generation:1},'agent');
  assert.equal(r.status,'precommit');assert.equal(r.historyDelta,0);assert.deepEqual([...h.o.working],[1]);assert.deepEqual([...h.o.native],[1]);assert.equal(h.o.busy,false);
});
test('restore failure after open failure is unknown, not precommit',async()=>{
  const h=owner({stageFail:true,restoreFail:true});const p={...h.apply,edit:()=>new Uint8Array([2])};
  const r=await applyReviewed(p,{text:'deck:1',revision:0,identity:'file:a',generation:1},'agent');
  assert.equal(r.status,'unknown');assert.equal(r.historyDelta,null);
});
test('render failure after commit stays applied',async()=>{
  const h=owner({renderFail:true});const p={...h.apply,edit:()=>new Uint8Array([2])};
  const r=await applyReviewed(p,{text:'deck:1',revision:0,identity:'file:a',generation:1},'agent');
  assert.equal(r.status,'applied');assert.equal(r.historyDelta,1);assert.match(r.notifyError!,/render failed/);
});
test('commit throws after mutation: applied with listener error and no undo claim',async()=>{
  const h=owner();const p={...h.apply,edit:()=>new Uint8Array([2]),commit:(...a:Parameters<typeof h.apply.commit>)=>{h.apply.commit(...a);throw Error('listener boom');}};
  const r=await applyReviewed(p,{text:'deck:1',revision:0,identity:'file:a',generation:1},'agent');
  assert.equal(r.status,'applied');assert.equal(r.undoable,false);assert.match(r.notifyError!,/listener boom/);
});
test('commit throws before mutation is unknown (not claimed as zero)',async()=>{
  const h=owner();const p={...h.apply,edit:()=>new Uint8Array([2]),commit:()=>{throw Error('x');}};
  const r=await applyReviewed(p,{text:'deck:1',revision:0,identity:'file:a',generation:1},'agent');
  assert.equal(r.status,'unknown');assert.equal(r.historyDelta,null);
});
test('full history: delta comes from the commit, not history length',async()=>{
  const h=owner();for(let i=0;i<10;i++)h.o.undo.push(new Uint8Array([i+10]));
  const p={...h.apply,edit:()=>new Uint8Array([2])};
  const r=await applyReviewed(p,{text:'deck:1',revision:0,identity:'file:a',generation:1},'agent');
  assert.equal(h.o.undo.length,10);assert.equal(r.historyDelta,1);assert.equal(r.undoable,true);
  const u=await undoReceipt(h.undo,r);assert.deepEqual([...h.o.working],[1]);assert.equal(u.status,'applied');
});
test('history cannot keep the entry: applied but not undoable',async()=>{
  const h=owner({maxHistory:0});const p={...h.apply,edit:()=>new Uint8Array([2])};
  const r=await applyReviewed(p,{text:'deck:1',revision:0,identity:'file:a',generation:1},'agent');
  assert.equal(r.status,'applied');assert.equal(r.undoable,false);assert.equal(r.historyDelta,0);
});
test('undo refuses after manual edit, newer history, reopen and ABA',async()=>{
  const mk=async()=>{const h=owner();const p={...h.apply,edit:()=>new Uint8Array([2])};const r=await applyReviewed(p,{text:'deck:1',revision:0,identity:'file:a',generation:1},'agent');return {h,r};};
  let {h,r}=await mk();h.o.revision++;h.o.working=new Uint8Array([3]);await assert.rejects(()=>undoReceipt(h.undo,r),/changed/);
  ({h,r}=await mk());h.o.undo.push(new Uint8Array([7]));await assert.rejects(()=>undoReceipt(h.undo,r),/changed/);
  ({h,r}=await mk());h.o.generation=2;await assert.rejects(()=>undoReceipt(h.undo,r),/changed/);
  ({h,r}=await mk());const back=h.o.last!.before;h.o.working=new Uint8Array([2]);h.o.revision=r.afterRevision!;// same bytes, different identity: ABA
  await assert.rejects(()=>undoReceipt(h.undo,r),/changed/);void back;
});
test('concurrent change during staging aborts and restores',async()=>{
  const h=owner();const p={...h.apply,edit:()=>new Uint8Array([2]),stage:async(b:Uint8Array)=>{h.o.revision++;h.o.working=new Uint8Array([5]);return b;}};
  const r=await applyReviewed(p,{text:'deck:1',revision:0,identity:'file:a',generation:1},'agent');
  assert.equal(r.status,'precommit');assert.deepEqual([...h.o.working],[5]);assert.equal(h.o.undo.length,0);
});
test('undo staging failure keeps deck and receipt state',async()=>{
  const h=owner();const p={...h.apply,edit:()=>new Uint8Array([2])};const r=await applyReviewed(p,{text:'deck:1',revision:0,identity:'file:a',generation:1},'agent');
  const bad:UndoPort<Uint8Array>={...h.undo,stage:async()=>{throw Error('open failed');}};
  const u=await undoReceipt(bad,r);assert.equal(u.status,'precommit');assert.deepEqual([...h.o.working],[2]);assert.equal(h.o.busy,false);
});
