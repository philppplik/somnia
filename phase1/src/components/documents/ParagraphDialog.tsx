import {useState} from 'react';
import {PARA_FLAG_KEYS,type ParaPatch,type ParaState} from '../../lib/documents/protocol';
import {setParagraphOptionsOpen,useParagraphOptionsOpen} from '../../lib/documents/paragraphOptions';
import {setParagraphOptions} from '../../lib/documents/session';
import {useDocuments} from '../../lib/documents/store';
import {useT} from '../../lib/useT';
import {NativeButton,NativeInput} from '../ui/native-controls';
const tool='grid h-7 cursor-pointer grid-flow-col items-center gap-1 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink-2 hover:bg-hover disabled:cursor-default disabled:opacity-50';
/** Right indent in points typed as "12" or "12.5"; null when it is not a number inside 0..1440. */
export const parseIndentPt=(v:string):number|null=>{if(!/^\d{1,4}([.,]\d{1,2})?$/.test(v))return null;const n=Number(v.replace(',','.'));return n>=0&&n<=1440?n:null;};
/** Only what the user changed: flags that differ from the shared state, and a right indent that differs. Null when nothing changed or the indent is not valid. */
export function buildParagraphPatch(para:ParaState|null,flags:Partial<Record<typeof PARA_FLAG_KEYS[number],boolean>>,indent:string):ParaPatch|null{
 const p:ParaPatch={};
 for(const k of PARA_FLAG_KEYS){const v=flags[k];if(v!==undefined&&v!==para?.[k])p[k]=v;}
 const start=para?.indentRight==null?'':String(para.indentRight);
 if(indent!==start){const n=parseIndentPt(indent);if(n===null)return null;p.indentRight=n;}
 return Object.keys(p).length>0?p:null;
}
/** Page break before, keep with next, keep lines together, widow control and right indent for the selected paragraphs. One undo step. */
export function ParagraphDialog(){
 const open=useParagraphOptionsOpen();const doc=useDocuments();
 if(!open||doc.status!=='ready')return null;
 return <ParagraphForm para={doc.para??null} onClose={()=>setParagraphOptionsOpen(false)}/>;
}
export function ParagraphForm({para,onClose}:{para:ParaState|null;onClose:()=>void}){
 const {t}=useT();const [flags,setFlags]=useState<Partial<Record<typeof PARA_FLAG_KEYS[number],boolean>>>({});
 const [indent,setIndent]=useState(para?.indentRight==null?'':String(para.indentRight));
 const patch=buildParagraphPatch(para,flags,indent);const bad=indent!==''&&parseIndentPt(indent)===null;
 const apply=()=>{if(!patch)return;onClose();void setParagraphOptions(patch);};
 return <div role="dialog" aria-modal="true" aria-labelledby="documents-paraopt-title" className="fixed inset-0 z-20 grid place-items-center bg-black/30" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}}>
  <div className="grid w-96 max-w-full gap-3 rounded-[var(--r-popup,25px)] bg-surface p-5 shadow-xl" data-testid="documents-paraopt-dialog">
   <h2 id="documents-paraopt-title" className="text-sm font-medium">{t('documents.para.opt.title')}</h2>
   {PARA_FLAG_KEYS.map(k=><label key={k} className="doc-paraopt-check text-xs text-ink-2">
    <NativeInput type="checkbox" checked={flags[k]??para?.[k]??false} onChange={e=>setFlags({...flags,[k]:e.currentTarget.checked})} data-testid={'documents-paraopt-'+k}/>{t('documents.para.opt.'+k)}</label>)}
   <label className="grid gap-1 text-xs text-ink-2">{t('documents.para.opt.indentRight')}
    <NativeInput className="w-24 rounded-lg border border-subtle bg-transparent px-2 py-1.5 text-ink tabular-nums" inputMode="decimal" value={indent} aria-invalid={bad} onChange={e=>setIndent(e.currentTarget.value.trim())} data-testid="documents-paraopt-indent"/></label>
   {bad&&<p role="alert" className="text-xs text-ink-3">{t('documents.para.opt.invalid')}</p>}
   <div className="flex justify-end gap-2"><NativeButton className={tool} onClick={onClose}>{t('documents.para.opt.cancel')}</NativeButton>
    <NativeButton className={tool} disabled={!patch} onClick={apply} data-testid="documents-paraopt-apply">{t('documents.para.opt.apply')}</NativeButton></div>
  </div>
 </div>;
}
