import {test} from 'node:test';import assert from 'node:assert/strict';
import {applyReviewedCell,SheetsApplyError,type SheetsCellHost,type SheetsCellProposal,type SheetsCellTarget,type SheetsCellExecutor} from './sheetsCellPort';
import type {SheetsEditReceipt} from '../sheets/protocol';
const base:SheetsCellTarget={document:{documentId:'d',path:'b.xlsx',revision:1,adapter:null,studioKind:'sheets'},sheet:0,address:'B2',workerEpoch:2};
const rcpt=(o:Partial<SheetsEditReceipt>={}):SheetsEditReceipt=>({sheet:0,address:'B2',beforeRevision:1,afterRevision:2,applied:1,undoable:true,token:'t2',readback:{address:'B2',value:5,formula:null},...o});
function fx(over:{text?:string;native?:boolean;deny?:boolean}={}){let target=structuredClone(base);const calls:any[]=[];
 const host:SheetsCellHost={assertPermission:(e)=>{if(over.deny&&e==='apply')throw Error('denied');},current:()=>target,snapshot:async()=>({target:structuredClone(target),displayText:over.text??'1',formula:null,native:over.native===false?undefined:{token:'t1',value:1,formula:null}}),stage:()=>{}};
 const proposal:SheetsCellProposal={target:structuredClone(base),before:{target:structuredClone(base),displayText:'1',formula:null},input:'5',state:'review-only',executeAvailable:false};
 const exec:SheetsCellExecutor={setReviewed:async(...a)=>{calls.push(a);return rcpt();}};
 return {host,proposal,exec,calls,move:()=>{target={...target,address:'C3'};}};}
const sig=()=>new AbortController().signal;
test('applies once with token and returns receipt',async()=>{const f=fx();const r=await applyReviewedCell(f.proposal,f.host,f.exec,sig());assert.equal(r.changed,true);assert.equal(f.calls.length,1);assert.equal(f.calls[0][2],'t1');assert.equal(f.calls[0][4],'5');});
test('permission denial never calls executor',async()=>{const f=fx({deny:true});await assert.rejects(applyReviewedCell(f.proposal,f.host,f.exec,sig()),(e:any)=>e instanceof SheetsApplyError&&e.outcome==='none');assert.equal(f.calls.length,0);});
test('moved selection never calls executor',async()=>{const f=fx();f.move();await assert.rejects(applyReviewedCell(f.proposal,f.host,f.exec,sig()),(e:any)=>e.outcome==='none');assert.equal(f.calls.length,0);});
test('cell changed since review is refused',async()=>{const f=fx({text:'9'});await assert.rejects(applyReviewedCell(f.proposal,f.host,f.exec,sig()),(e:any)=>e.outcome==='none');assert.equal(f.calls.length,0);});
test('missing native token is refused',async()=>{const f=fx({native:false});await assert.rejects(applyReviewedCell(f.proposal,f.host,f.exec,sig()),(e:any)=>e.outcome==='none');assert.equal(f.calls.length,0);});
test('stale error is none, other error and mismatched receipt are unknown',async()=>{let f=fx();f.exec.setReviewed=async()=>{throw Error('stale: revision');};await assert.rejects(applyReviewedCell(f.proposal,f.host,f.exec,sig()),(e:any)=>e.outcome==='none');f=fx();f.exec.setReviewed=async()=>{throw Error('boom');};await assert.rejects(applyReviewedCell(f.proposal,f.host,f.exec,sig()),(e:any)=>e.outcome==='unknown');f=fx();f.exec.setReviewed=async()=>rcpt({address:'Z9'});await assert.rejects(applyReviewedCell(f.proposal,f.host,f.exec,sig()),(e:any)=>e.outcome==='unknown');});
