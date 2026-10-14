import {useEffect,useState} from 'react';
import {HF_ALIGNS,MAX_HF_CHARS,validHfText,type HfAlign,type HeaderFooterState} from '../../lib/documents/protocol';
import {readHeaderFooter,setHeaderFooter} from '../../lib/documents/session';
import {useT} from '../../lib/useT';
import {NativeButton,NativeInput,NativeSelect} from '../ui/native-controls';
const tool='grid h-7 cursor-pointer grid-flow-col items-center gap-1 rounded-sm border-0 bg-transparent px-2 text-xs text-ink-2 hover:bg-hover disabled:cursor-default disabled:opacity-50';
const field='w-72 rounded-lg border border-subtle bg-transparent px-2 py-1.5 text-ink disabled:opacity-50';
/** Header and footer text for every section, plus a page number in the footer. Parts with richer content stay read-only. */
export function HeaderFooterDialog({onClose}:{onClose:()=>void}){
 const {t}=useT();const [st,setSt]=useState<HeaderFooterState|null>(null);const [failed,setFailed]=useState(false);
 const [header,setHeader]=useState(''),[footer,setFooter]=useState(''),[page,setPage]=useState(false);
 const [hAlign,setHAlign]=useState<HfAlign>('left'),[fAlign,setFAlign]=useState<HfAlign>('center');
 useEffect(()=>{let live=true;void readHeaderFooter().then(s=>{if(!live)return;if(!s){setFailed(true);return;}setSt(s);setHeader(s.header.text);setFooter(s.footer.text);setPage(s.footer.pageNumber);setHAlign(s.header.align??'left');setFAlign(s.footer.align??'center');}).catch(()=>{if(live)setFailed(true);});return()=>{live=false;};},[]);
 const hOk=!st||!st.header.editable||validHfText(header),fOk=!st||!st.footer.editable||validHfText(footer);
 const apply=()=>{
  if(!st||!hOk||!fOk)return;
  const patch:{header?:string;footer?:string;pageNumber?:boolean;headerAlign?:HfAlign;footerAlign?:HfAlign}={};
  if(st.header.editable&&header!==st.header.text)patch.header=header;
  if(st.footer.editable&&footer!==st.footer.text)patch.footer=footer;
  if(st.footer.editable&&page!==st.footer.pageNumber)patch.pageNumber=page;
  if(st.header.editable&&hAlign!==(st.header.align??'left')&&(header!==''||st.header.text!==''))patch.headerAlign=hAlign;
  if(st.footer.editable&&fAlign!==(st.footer.align??'center')&&(footer!==''||page||st.footer.text!==''))patch.footerAlign=fAlign;
  onClose();if(Object.keys(patch).length>0)void setHeaderFooter(patch);
 };
 return <div role="dialog" aria-modal="true" aria-labelledby="documents-hf-title" className="fixed inset-0 z-20 grid place-items-center bg-black/30" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}}>
  <div className="grid max-w-md gap-3 rounded-[var(--r-popup,25px)] bg-surface p-5 shadow-xl" data-testid="documents-hf-dialog">
   <h2 id="documents-hf-title" className="text-sm font-medium">{t('documents.hf.title')}</h2>
   {failed?<p className="text-xs text-ink-3" role="alert">{t('documents.hf.unavailable')}</p>:!st?<p className="text-xs text-ink-3">{t('documents.hf.loading')}</p>:<>
    <div className="flex items-end gap-2"><label className="grid gap-1 text-xs text-ink-2">{t('documents.hf.header')}
     <NativeInput className={field} maxLength={MAX_HF_CHARS} value={header} disabled={!st.header.editable} aria-invalid={!hOk} onChange={e=>setHeader(e.currentTarget.value)} data-testid="documents-hf-header"/></label><NativeSelect className="rounded-lg border border-subtle bg-transparent px-2 py-1.5 text-ink" aria-label={t('documents.hf.align')} value={hAlign} disabled={!st.header.editable} onChange={e=>{const x=e.currentTarget.value;if((HF_ALIGNS as readonly string[]).includes(x))setHAlign(x as HfAlign);}} data-testid="documents-hf-header-align">{HF_ALIGNS.map(a=><option key={a} value={a}>{t('documents.hf.align.'+a)}</option>)}</NativeSelect></div>
    <div className="flex items-end gap-2"><label className="grid gap-1 text-xs text-ink-2">{t('documents.hf.footer')}
     <NativeInput className={field} maxLength={MAX_HF_CHARS} value={footer} disabled={!st.footer.editable} aria-invalid={!fOk} onChange={e=>setFooter(e.currentTarget.value)} data-testid="documents-hf-footer"/></label><NativeSelect className="rounded-lg border border-subtle bg-transparent px-2 py-1.5 text-ink" aria-label={t('documents.hf.align')} value={fAlign} disabled={!st.footer.editable} onChange={e=>{const x=e.currentTarget.value;if((HF_ALIGNS as readonly string[]).includes(x))setFAlign(x as HfAlign);}} data-testid="documents-hf-footer-align">{HF_ALIGNS.map(a=><option key={a} value={a}>{t('documents.hf.align.'+a)}</option>)}</NativeSelect></div>
    <label className="flex items-center gap-2 text-xs text-ink-2"><NativeInput type="checkbox" checked={page} disabled={!st.footer.editable} onChange={e=>setPage(e.currentTarget.checked)} data-testid="documents-hf-page"/>{t('documents.hf.pageNumber')}</label>
    {(!st.header.editable||!st.footer.editable)&&<p className="text-xs text-ink-3" data-testid="documents-hf-locked">{t('documents.hf.locked')}</p>}
   </>}
   <div className="flex justify-end gap-2">
    <NativeButton className={tool} onClick={onClose}>{t('documents.cancel')}</NativeButton>
    <NativeButton className={tool+' border border-subtle'} disabled={!st||!hOk||!fOk} onClick={apply} data-testid="documents-hf-apply">{t('documents.hf.apply')}</NativeButton>
   </div>
  </div>
 </div>;
}
