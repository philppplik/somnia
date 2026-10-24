import {test} from 'node:test';import assert from 'node:assert/strict';
import {SheetsEngine} from '../sheets/engine';
import {SheetsRangeTransactions,snapshotNativeRange} from './sheetsRangeTransactions';
import {createSheetsRangePort,type SheetsRangeProposal} from './sheetsRangePort';
/** Real JS owner protocol. Synthetic worker, not Rust/WASM coverage. */
class SyntheticRangeWorker {
 static latest:SyntheticRangeWorker;onmessage:any;onerror:any;onmessageerror:any;
 requests:any[]=[];revision=0;token='t0';history=0;hold=false;queued:any;bad=false;
 cells=[{address:'A1',value:1,formula:null},{address:'B1',value:2,formula:null}];before=structuredClone(this.cells);
 constructor(){SyntheticRangeWorker.latest=this;}
 terminate(){}
 postMessage(m:any){this.requests.push(structuredClone(m));if(m.op==='setRangeReviewed'&&this.hold){this.queued=m;return;}queueMicrotask(()=>this.reply(m));}
 reply(m:any){let result:any;try{switch(m.op){
  case 'nativeState':result={token:this.token,revision:this.revision};break;
  case 'layout':result={sheet:0,rows:[],cols:[],merges:[]};break;
  case 'view':result={sheet:0,row:0,col:0,rows:1,cols:2,cells:this.cells.map(c=>({...c,text:String(c.value)}))};break;
  case 'range':result={sheet:0,row:0,col:0,rows:1,cols:2,cells:structuredClone(this.cells)};break;
  case 'setRangeReviewed':
   if(m.token!==this.token||JSON.stringify(JSON.parse(m.old))!==JSON.stringify(this.cells))throw Error('stale: owner changed');
   this.before=structuredClone(this.cells);this.cells=JSON.parse(m.inputs).map((v:string,i:number)=>({address:i?'B1':'A1',value:Number(v),formula:null}));this.history++;this.revision++;this.token='t1';result=this.receipt(true);if(this.bad)result.col=7;break;
  case 'undoRangeReviewed':if(m.token!==this.token)throw Error('stale: newer change');this.cells=structuredClone(this.before);this.history--;this.revision++;this.token='t2';result=this.receipt(false);break;
  default:throw Error('Unexpected '+m.op);
 }this.onmessage({data:{id:m.id,ok:true,op:'result',result}});}catch(e){this.onmessage({data:{id:m.id,ok:false,error:String((e as Error).message)}});}}
 receipt(undoable:boolean){return {sheet:0,row:0,col:0,rows:1,cols:2,beforeRevision:this.revision-1,afterRevision:this.revision,applied:1,undoable,token:this.token,readback:structuredClone(this.cells)};}
}
const signal=()=>new AbortController().signal;
async function fixture(){const original=globalThis.Worker;globalThis.Worker=SyntheticRangeWorker as any;const engine=new SheetsEngine(5000),worker=SyntheticRangeWorker.latest,tx=new SheetsRangeTransactions();const current=()=>({document:{documentId:'d',path:'x.xlsx',studioKind:'sheets' as const,adapter:'sheets',revision:0},sheet:0,range:{r0:0,c0:0,r1:0,c1:1},workerEpoch:engine.selectionReadEpoch});let native:any,staged:SheetsRangeProposal|undefined;const snapshot=async(s:AbortSignal)=>{const r=await snapshotNativeRange(engine,current(),current,s);native=r.native;return r;};const host={current,permission:()=>{},snapshot,stage:(p:SheetsRangeProposal)=>{staged=p;tx.stage('id',{proposal:p,native,host,engine,snapshot});}};const port=createSheetsRangePort(host);return {engine,worker,tx,port,staged:()=>staged,cleanup:()=>{engine.dispose();globalThis.Worker=original;}};}
test('real SheetsEngine JS selected-range inspect -> preview -> reviewed set -> fresh readback -> exact undo',async()=>{const f=await fixture();try{const ctx={files:()=>({}),propose:async()=>{}};const inspected=await f.port.run('sheets_inspect_range',{},ctx,signal());assert.ok(!inspected.includes('token'));await f.port.run('sheets_propose_range',{values:[['3','4']]},ctx,signal());assert.equal(f.worker.history,0);assert.deepEqual(f.staged()?.before,[{address:'A1',text:'1'},{address:'B1',text:'2'}]);await f.tx.accept('id',signal());assert.equal(f.worker.history,1);assert.equal(f.engine.selectionReadEpoch,2);assert.equal(f.engine.hasPendingMutation,false);await f.tx.undo('id',signal(),()=>{});assert.equal(f.worker.history,0);assert.deepEqual(f.worker.cells,f.worker.before);assert.equal(f.engine.selectionReadEpoch,4);assert.equal(f.worker.requests.filter(m=>m.op==='setRangeReviewed').length,1);assert.equal(f.worker.requests.filter(m=>m.op==='undoRangeReviewed').length,1);assert.ok(f.worker.requests.some(m=>m.op==='range'));assert.equal(f.worker.requests.some(m=>m.op==='setValues'),false);}finally{f.cleanup();}});
test('real owner wrapper mutation epoch and busy stay active until synthetic worker receipt',async()=>{const f=await fixture();try{await f.port.run('sheets_propose_range',{values:[['3','4']]},{files:()=>({}),propose:async()=>{}},signal());f.worker.hold=true;const job=f.tx.accept('id',signal());await new Promise(r=>setTimeout(r,10));assert.equal(f.tx.busy,true);assert.equal(f.engine.hasPendingMutation,true);assert.equal(f.engine.selectionReadEpoch,1);f.worker.reply(f.worker.queued);await job;assert.equal(f.tx.busy,false);assert.equal(f.engine.hasPendingMutation,false);assert.equal(f.engine.selectionReadEpoch,2);}finally{f.cleanup();}});
test('real wrapper bad post-entry receipt is unknown and cannot be replayed',async()=>{const f=await fixture();try{await f.port.run('sheets_propose_range',{values:[['3','4']]},{files:()=>({}),propose:async()=>{}},signal());f.worker.bad=true;await assert.rejects(f.tx.accept('id',signal()),(e:any)=>e.outcome==='unknown');assert.equal(f.worker.history,1);await assert.rejects(f.tx.accept('id',signal()));await assert.rejects(f.tx.undo('id',signal(),()=>{}));assert.equal(f.worker.requests.filter(m=>m.op==='setRangeReviewed').length,1);}finally{f.cleanup();}});
test('full Rust/WASM/desktop selected-range apply and exact undo',{skip:'CI-only: local synthetic protocol proof does not run native owner'},()=>{});
