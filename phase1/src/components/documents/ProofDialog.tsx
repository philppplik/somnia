import {useCallback,useEffect,useRef,useState} from 'react';
import type {ProofIssue} from '../../lib/documents/protocol';
import {addToDictionary,applyProofFix,proofCheck,proofSuggestions,setProofing,showProofIssue} from '../../lib/documents/session';
import {useDocuments} from '../../lib/documents/store';
import {useT} from '../../lib/useT';
import {NativeButton,NativeInput} from '../ui/native-controls';
const tool='grid h-7 cursor-pointer grid-flow-col items-center gap-1 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink-2 hover:bg-hover disabled:cursor-default disabled:opacity-50';
/** Issues that are not in `skip` (words ignored for this check), keeping document order. */
export const visibleIssues=(all:readonly ProofIssue[],ignored:ReadonlySet<string>):ProofIssue[]=>all.filter(i=>!ignored.has(i.word.toLowerCase()));
/** Index of the first issue at or after a position (the start of the next one when a fix just happened). */
export const firstAtOrAfter=(list:readonly ProofIssue[],block:number,off:number):number=>{const i=list.findIndex(x=>x.block>block||(x.block===block&&x.start>=off));return i<0?0:i;};
/** Walks through spelling and grammar issues one by one: change, ignore, ignore all, or add the word to the dictionary. English word list. */
export function ProofDialog({onClose}:{onClose:()=>void}){
 const {t}=useT();const doc=useDocuments();
 const [all,setAll]=useState<ProofIssue[]|null>(null);const [ignored,setIgnored]=useState<ReadonlySet<string>>(new Set());
 const [at,setAt]=useState(0);const [sugg,setSugg]=useState<string[]>([]);const [custom,setCustom]=useState('');const [failed,setFailed]=useState(false);const [stale,setStale]=useState(false);
 const live=useRef(true);useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 const list=all?visibleIssues(all,ignored):[];const cur=list[Math.min(at,Math.max(0,list.length-1))];
 const check=useCallback(async(from?:{block:number;off:number})=>{
  try{const r=await proofCheck();if(!live.current)return;setStale(false);setAll(r);setAt(from?firstAtOrAfter(r,from.block,from.off):0);}catch{if(live.current)setFailed(true);}
 },[]);
 useEffect(()=>{void check();},[check]);
 useEffect(()=>{
  setCustom('');setSugg(cur?.suggestions??[]);if(!cur)return;
  let go=true;void showProofIssue(cur).then(ok=>{if(go&&!ok)setStale(true);});
  if(cur.kind==='spelling'&&cur.suggestions.length===0)void proofSuggestions(cur.word).then(w=>{if(go)setSugg(w);}).catch(()=>undefined);
  return()=>{go=false;};
 },[cur]);
 const fix=async(text:string)=>{if(!cur)return;try{await applyProofFix(cur,text);await check({block:cur.block,off:cur.start});}catch{setStale(true);}};
 const ignoreOnce=()=>setAt(Math.min(at+1,Math.max(0,list.length-1)));
 const ignoreAll=()=>{if(!cur)return;setIgnored(new Set([...ignored,cur.word.toLowerCase()]));};
 const addWord=()=>{if(!cur)return;if(addToDictionary(cur.word))setIgnored(new Set([...ignored,cur.word.toLowerCase()]));};
 const done=all!==null&&list.length===0;
 return <div role="dialog" aria-modal="true" aria-labelledby="documents-proof-title" className="fixed inset-0 z-20 grid place-items-center bg-black/30" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}}>
  <div className="grid w-96 max-w-full gap-3 rounded-[var(--r-popup,25px)] bg-surface p-5 shadow-xl" data-testid="documents-proof-dialog">
   <h2 id="documents-proof-title" className="text-sm font-medium">{t('documents.proof.title')}</h2>
   <p className="text-xs text-ink-3">{t('documents.proof.english')}</p>
   <label className="flex items-center gap-2 text-xs text-ink-2"><NativeInput type="checkbox" checked={doc.proofing} onChange={e=>void setProofing(e.currentTarget.checked)} data-testid="documents-proof-marks"/>{t('documents.proof.marks')}</label>
   {failed?<p className="text-xs text-ink-3" role="alert">{t('documents.proof.unavailable')}</p>:all===null?<p className="text-xs text-ink-3">{t('documents.proof.checking')}</p>:done?<p className="text-xs text-ink-2" data-testid="documents-proof-done">{t('documents.proof.done')}</p>:cur&&<>
    <p className="text-xs text-ink-3" data-testid="documents-proof-count">{t('documents.proof.count',{n:Math.min(at,list.length-1)+1,total:list.length})}</p>
    <p className="text-sm" data-testid="documents-proof-word"><span className="font-medium">{cur.word}</span> <span className="text-xs text-ink-3">{cur.kind==='spelling'?t('documents.proof.spelling'):cur.message}</span></p>
    {stale&&<p className="text-xs text-ink-3" role="status">{t('documents.proof.stale')}</p>}
    <div className="flex flex-wrap gap-1" role="group" aria-label={t('documents.proof.suggestions')}>
     {sugg.length===0&&<span className="text-xs text-ink-3">{t('documents.proof.noSuggestions')}</span>}
     {sugg.map(s=><NativeButton key={s} className={tool} disabled={!cur.fixable||stale} onClick={()=>void fix(s)} data-testid="documents-proof-suggestion">{s}</NativeButton>)}</div>
    <div className="flex items-center gap-1">
     <NativeInput className="h-7 min-w-0 flex-1 rounded-sm border border-subtle bg-surface px-1 text-xs text-ink" maxLength={80} value={custom} aria-label={t('documents.proof.custom')} placeholder={t('documents.proof.custom')} disabled={!cur.fixable} onChange={e=>setCustom(e.currentTarget.value)} data-testid="documents-proof-custom"/>
     <NativeButton className={tool} disabled={!cur.fixable||stale||custom.trim()===''||/[\r\n]/.test(custom)} onClick={()=>void fix(custom.trim())} data-testid="documents-proof-change">{t('documents.proof.change')}</NativeButton></div>
    {!cur.fixable&&<p className="text-xs text-ink-3">{t('documents.proof.locked')}</p>}
    <div className="flex flex-wrap gap-1">
     <NativeButton className={tool} onClick={ignoreOnce} data-testid="documents-proof-ignore">{t('documents.proof.ignore')}</NativeButton>
     <NativeButton className={tool} onClick={ignoreAll} data-testid="documents-proof-ignoreAll">{t('documents.proof.ignoreAll')}</NativeButton>
     {cur.kind==='spelling'&&<NativeButton className={tool} onClick={addWord} data-testid="documents-proof-add">{t('documents.proof.add')}</NativeButton>}
     {stale&&<NativeButton className={tool} onClick={()=>void check()} data-testid="documents-proof-recheck">{t('documents.proof.recheck')}</NativeButton>}</div>
   </>}
   <div className="flex justify-end"><NativeButton className={tool} onClick={onClose} data-testid="documents-proof-close">{t('documents.styles.close')}</NativeButton></div>
  </div></div>;
}
