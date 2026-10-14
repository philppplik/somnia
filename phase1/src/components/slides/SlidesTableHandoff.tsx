import {useState,useSyncExternalStore} from 'react';
import {Button} from '../ui/button';
import {useT} from '../../lib/useT';
import {pendingReturnsFor,clearPendingReturn,subscribeHandoff,handoffVersion} from '../../lib/handoff/registry';
import {openSlidesTableInSheets} from '../../lib/handoff/open';
import {diffTableCells} from '../../lib/handoff/slidesTable';
import {applyTableDiff} from '../../lib/handoff/applySlidesTableReturn';
/** CA1: quiet cross-studio row above the table editor — "Edit in Sheets studio", plus explicit apply/discard of a pending round trip. */
export function SlidesTableHandoff({source,slideIndex,slideId,shapeId,cells,ready,isBusy,commit,editCell,onError}:{
 source:string;slideIndex:number;slideId:number;shapeId:number;cells:readonly (readonly string[])[];
 ready:boolean;isBusy():boolean;commit():void;editCell(row:number,col:number,text:string):Promise<{ok:boolean;message?:string}>;onError(message:string):void;
}){
 const {t}=useT();
 const [note,setNote]=useState(''),[applying,setApplying]=useState(false),[tick,setTick]=useState(0);
 useSyncExternalStore(subscribeHandoff,handoffVersion,handoffVersion);
 const pending=tick>=0?pendingReturnsFor(`slides:table:${slideId}:${shapeId}`).find(p=>p.origin.file===source):undefined;
 const diff=pending?diffTableCells(cells,pending.rows):null;
 const openInSheets=async()=>{
  const r=await openSlidesTableInSheets({source,slideIndex,slideId,shapeId,cells});
  if(!r.ok)onError(r.message);
 };
 const applyReturn=async()=>{
  if(!pending||!diff)return;
  setApplying(true);setNote('');commit();
  const res=await applyTableDiff({busy:isBusy,editCell},diff);
  setApplying(false);setTick(x=>x+1);
  if(res.failed){setNote(t('handoff.applyFailed',{applied:res.applied,total:res.total,message:res.failed}));return;}
  clearPendingReturn(pending.file);
  setNote(t('handoff.applied',{count:res.applied})+(diff.skippedRows||diff.skippedCols?' '+t('handoff.skipped',{rows:diff.skippedRows,cols:diff.skippedCols}):''));
 };
 return <div className="flex flex-wrap items-center gap-2" data-testid="slides-table-handoff">
  <Button size="compact" variant="ghost" disabled={!ready||applying} onClick={()=>void openInSheets()}>{t('handoff.editInSheets')}</Button>
  {pending&&diff&&<>
   <span className="text-xs text-ink-3">{t('handoff.pendingCells',{count:diff.edits.length})}</span>
   <Button size="compact" variant="ghost" disabled={applying||!ready||diff.edits.length===0} onClick={()=>void applyReturn()}>{t('handoff.apply')}</Button>
   <Button size="compact" variant="ghost" disabled={applying} onClick={()=>{clearPendingReturn(pending.file);setNote('');setTick(x=>x+1);}}>{t('handoff.discard')}</Button>
  </>}
  {note&&<span role="status" className="text-xs text-ink-3">{note}</span>}
 </div>;
}
