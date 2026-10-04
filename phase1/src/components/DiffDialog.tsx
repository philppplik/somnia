import {useMemo,useRef,useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {Button} from './ui/button';
import {getSavedFile,patchState,useAppStore} from '../store/appStore';
import {sourceDiff} from '../lib/sourceDiff';
import {changeStarts,sideBySide,diffStats} from '../lib/diffView';
/** Diff viewer: compare the last saved version or any project file with another. Display only, never changes files. */
export function DiffDialog(){
 const s=useAppStore();const [left,setLeft]=useState('');const [right,setRight]=useState('');const [mode,setMode]=useState<'side'|'inline'>('side');const [cur,setCur]=useState(-1);const box=useRef<HTMLDivElement>(null);
 const names=Object.keys(s.files);const active=s.activeFile;
 const opts=[...names.map(n=>({v:`saved:${n}`,label:`Last saved: ${n}`})),...names.map(n=>({v:`file:${n}`,label:`Current: ${n}`}))];
 const L=left||`saved:${active}`,R=right||`file:${active}`;
 const text=(v:string)=>v.startsWith('saved:')?getSavedFile(v.slice(6)):(s.files[v.slice(5)]??'');
 const diff=useMemo(()=>sourceDiff(text(L),text(R)),[L,R,s.files,s.lastSavedAt]);// eslint-disable-line react-hooks/exhaustive-deps
 const starts=useMemo(()=>changeStarts(diff.lines),[diff]);const stats=diffStats(diff.lines);
 const go=(d:1|-1)=>{if(!starts.length)return;const n=((cur<0?(d===1?-1:0):cur)+d+starts.length)%starts.length;setCur(n);box.current?.querySelector(`[data-line="${starts[n]}"]`)?.scrollIntoView({block:'center'});};
 const cls=(k?:string)=>k==='added'?'bg-green-500/15':k==='removed'?'bg-red-500/15':'';
 const cell=(l?:{kind:string;text:string;diskLine?:number;editorLine?:number},side?:'l'|'r')=><div className={`min-w-0 whitespace-pre-wrap break-all px-2 ${l?cls(l.kind):'bg-subtle/30'}`}>{l?<><span className="mr-2 inline-block w-8 select-none text-right text-ink-3">{side==='l'?l.diskLine??'':l.editorLine??''}</span>{l.text||' '}</>:null}</div>;
 const sel=(label:string,v:string,set:(x:string)=>void)=><label className="flex items-center gap-2 text-[12px]">{label}<select aria-label={label} value={v} onChange={e=>{set(e.target.value);setCur(-1);}} className="h-7 min-w-0 flex-1 rounded-sm border border-subtle bg-panel px-2 text-ink">{opts.map(o=><option key={o.v} value={o.v}>{o.label}</option>)}</select></label>;
 return <Dialog open={s.diffDialog} onOpenChange={o=>{if(!o)patchState({diffDialog:false});}}><DialogContent className="confirm-dialog !max-w-[980px] w-[92vw]" aria-label="Diff viewer">
  <DialogTitle>Compare</DialogTitle>
  <DialogDescription>Shows what differs between two versions. Display only: no file is changed.</DialogDescription>
  <div className="mt-3 grid grid-cols-2 gap-3">{sel('Left',L,setLeft)}{sel('Right',R,setRight)}</div>
  <div className="mt-3 flex items-center gap-2 text-[12px]"><span role="status" aria-label="Diff summary">{stats.added+stats.removed===0?'No differences.':`${stats.added} added, ${stats.removed} removed, ${starts.length} change${starts.length===1?'':'s'}`}</span><span className="flex-1"/><Button onClick={()=>go(-1)} disabled={!starts.length} aria-label="Previous change">Previous</Button><Button onClick={()=>go(1)} disabled={!starts.length} aria-label="Next change">Next</Button><Button onClick={()=>setMode(mode==='side'?'inline':'side')} aria-label="Toggle view">{mode==='side'?'Inline':'Side by side'}</Button></div>
  <div ref={box} className="mt-2 max-h-[52vh] overflow-auto rounded-md border border-line font-mono text-[12px] leading-5" aria-label="Diff lines">
   {diff.limited?<p role="status" className="p-3">These files are too large to compare here.</p>:mode==='inline'?diff.lines.map((l,i)=><div key={i} data-line={i} className={`whitespace-pre-wrap break-all px-2 ${cls(l.kind)}`}><span className="mr-2 inline-block w-4 select-none text-ink-3">{l.kind==='added'?'+':l.kind==='removed'?'-':' '}</span>{l.text||' '}</div>)
   :sideBySide(diff.lines).map((r,i)=><div key={i} data-line={r.index>=0?r.index:undefined} className="grid grid-cols-2">{cell(r.left&&r.left.kind!=='added'?r.left:undefined,'l')}{cell(r.right&&r.right.kind!=='removed'?r.right:undefined,'r')}</div>)}
  </div>
  <div className="mt-4 flex justify-end"><Button autoFocus onClick={()=>patchState({diffDialog:false})}>Close</Button></div>
 </DialogContent></Dialog>;}
