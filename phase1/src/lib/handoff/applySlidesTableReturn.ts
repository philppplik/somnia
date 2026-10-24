import type {TableDiff} from './slidesTable';
/** CA1: applies a Sheets round-trip diff onto a Slides table through one-command-per-cell, waiting for an idle session first. */
export interface TableEditTarget{busy():boolean;editCell(row:number,col:number,text:string):Promise<{ok:boolean;message?:string}>}
const sleep=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
export async function applyTableDiff(target:TableEditTarget,diff:TableDiff,maxWaitMs=5000):Promise<{applied:number;total:number;failed?:string}>{
 const waitIdle=async()=>{const until=Date.now()+maxWaitMs;while(target.busy()){if(Date.now()>until)return false;await sleep(50);}return true;};
 if(!await waitIdle())return{applied:0,total:diff.edits.length,failed:'busy'};
 let applied=0;
 for(const e of diff.edits){
  if(!await waitIdle())return{applied,total:diff.edits.length,failed:'busy'};
  const r=await target.editCell(e.row,e.col,e.text);
  if(!r.ok)return{applied,total:diff.edits.length,failed:r.message??'edit failed'};
  applied++;
 }
 return{applied,total:diff.edits.length};
}
