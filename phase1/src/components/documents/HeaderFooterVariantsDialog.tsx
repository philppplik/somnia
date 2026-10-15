import {useEffect,useState} from 'react';
import {MAX_HF_CHARS,validHfText,type HfVariant,type HfVariantPatch,type HfVariantsPatch,type HfVariantsState} from '../../lib/documents/protocol';
import {readHfVariants,setHfVariants} from '../../lib/documents/session';
import {useT} from '../../lib/useT';
import {NativeButton,NativeInput} from '../ui/native-controls';
const tool='grid h-7 cursor-pointer grid-flow-col items-center gap-1 rounded-sm border-0 bg-transparent px-2 text-xs text-ink-2 hover:bg-hover disabled:cursor-default disabled:opacity-50';
const field='w-72 rounded-lg border border-subtle bg-transparent px-2 py-1.5 text-ink disabled:opacity-50';
interface Draft{header:string;footer:string;page:boolean}
const draftOf=(v:HfVariant):Draft=>({header:v.header.text,footer:v.footer.text,page:v.footer.pageNumber});
/** The patch for one variant: only the parts that changed and can be edited. */
export function variantPatch(old:HfVariant,d:Draft):HfVariantPatch{
 const p:HfVariantPatch={};
 if(old.header.editable&&d.header!==old.header.text)p.header=d.header;
 if(old.footer.editable&&d.footer!==old.footer.text)p.footer=d.footer;
 if(old.footer.editable&&d.page!==old.footer.pageNumber)p.pageNumber=d.page;
 return p;
}
/** Different first page and different odd/even pages: switches plus the first-page and even-page header and footer text. */
export function HeaderFooterVariantsDialog({onClose}:{onClose:()=>void}){
 const {t}=useT();const [st,setSt]=useState<HfVariantsState|null>(null);const [failed,setFailed]=useState(false);
 const [title,setTitle]=useState(false),[evenOdd,setEvenOdd]=useState(false);
 const [first,setFirst]=useState<Draft>({header:'',footer:'',page:false}),[even,setEven]=useState<Draft>({header:'',footer:'',page:false});
 useEffect(()=>{let live=true;void readHfVariants().then(s=>{if(!live)return;if(!s){setFailed(true);return;}setSt(s);setTitle(s.titlePage);setEvenOdd(s.evenOdd);setFirst(draftOf(s.first));setEven(draftOf(s.even));}).catch(()=>{if(live)setFailed(true);});return()=>{live=false;};},[]);
 const ok=(d:Draft,on:boolean)=>!on||(validHfText(d.header)&&validHfText(d.footer));
 const valid=ok(first,title)&&ok(even,evenOdd);
 const apply=()=>{
  if(!st||!valid)return;
  const patch:HfVariantsPatch={};
  if(title!==st.titlePage)patch.titlePage=title;
  if(evenOdd!==st.evenOdd)patch.evenOdd=evenOdd;
  if(title){const p=variantPatch(st.first,first);if(Object.keys(p).length)patch.first=p;}
  if(evenOdd){const p=variantPatch(st.even,even);if(Object.keys(p).length)patch.even=p;}
  onClose();if(Object.keys(patch).length>0)void setHfVariants(patch);
 };
 const section=(label:string,v:HfVariant,d:Draft,set:(d:Draft)=>void,id:string)=><fieldset className="grid gap-2 border-0 p-0" data-testid={'documents-hfv-'+id}>
  <legend className="text-xs font-medium text-ink-2">{label}</legend>
  <label className="grid gap-1 text-xs text-ink-2">{t('documents.hf.header')}<NativeInput className={field} maxLength={MAX_HF_CHARS} value={d.header} disabled={!v.header.editable} aria-invalid={!validHfText(d.header)} onChange={e=>set({...d,header:e.currentTarget.value})} data-testid={'documents-hfv-'+id+'-header'}/></label>
  <label className="grid gap-1 text-xs text-ink-2">{t('documents.hf.footer')}<NativeInput className={field} maxLength={MAX_HF_CHARS} value={d.footer} disabled={!v.footer.editable} aria-invalid={!validHfText(d.footer)} onChange={e=>set({...d,footer:e.currentTarget.value})} data-testid={'documents-hfv-'+id+'-footer'}/></label>
  <label className="flex items-center gap-2 text-xs text-ink-2"><NativeInput type="checkbox" checked={d.page} disabled={!v.footer.editable} onChange={e=>set({...d,page:e.currentTarget.checked})} data-testid={'documents-hfv-'+id+'-page'}/>{t('documents.hf.pageNumber')}</label>
 </fieldset>;
 return <div role="dialog" aria-modal="true" aria-labelledby="documents-hfv-title" className="fixed inset-0 z-20 grid place-items-center bg-black/30" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}}>
  <div className="grid max-h-[85vh] max-w-md gap-3 overflow-auto rounded-[var(--r-popup,25px)] bg-surface p-5 shadow-xl" data-testid="documents-hfv-dialog">
   <h2 id="documents-hfv-title" className="text-sm font-medium">{t('documents.hfv.title')}</h2>
   {failed?<p className="text-xs text-ink-3" role="alert">{t('documents.hf.unavailable')}</p>:!st?<p className="text-xs text-ink-3">{t('documents.hf.loading')}</p>:<>
    <label className="flex items-center gap-2 text-xs text-ink-2"><NativeInput type="checkbox" checked={title} onChange={e=>setTitle(e.currentTarget.checked)} data-testid="documents-hfv-title-page"/>{t('documents.hfv.firstPage')}</label>
    {title&&section(t('documents.hfv.firstLegend'),st.first,first,setFirst,'first')}
    <label className="flex items-center gap-2 text-xs text-ink-2"><NativeInput type="checkbox" checked={evenOdd} onChange={e=>setEvenOdd(e.currentTarget.checked)} data-testid="documents-hfv-even-odd"/>{t('documents.hfv.evenOdd')}</label>
    {evenOdd&&section(t('documents.hfv.evenLegend'),st.even,even,setEven,'even')}
    <p className="text-xs text-ink-3">{t('documents.hfv.hint')}</p>
   </>}
   <div className="flex justify-end gap-2">
    <NativeButton className={tool} onClick={onClose}>{t('documents.cancel')}</NativeButton>
    <NativeButton className={tool+' border border-subtle'} disabled={!st||!valid} onClick={apply} data-testid="documents-hfv-apply">{t('documents.hf.apply')}</NativeButton>
   </div>
  </div>
 </div>;
}
