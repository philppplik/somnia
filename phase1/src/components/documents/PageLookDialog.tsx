import {useEffect,useState} from 'react';
import {PAGE_BORDER_STYLES,PAGE_NUM_FORMATS,PAGE_VALIGNS,type PageBorderStyle,type PageNumFormat,type PageVAlign} from '../../lib/documents/protocol';
import {buildLookPatch,lookFromState,PAGE_COLOR_SWATCH,type PageLookForm} from '../../lib/documents/pageLook';
import {readPageSetup,setPageSetup} from '../../lib/documents/session';
import {useT} from '../../lib/useT';
import {NativeButton,NativeInput,NativeSelect} from '../ui/native-controls';
const tool='grid h-7 cursor-pointer grid-flow-col items-center gap-1 rounded-sm border-0 bg-transparent px-2 text-xs text-ink-2 hover:bg-hover disabled:cursor-default disabled:opacity-50';
const sel='h-7 rounded-sm border border-subtle bg-surface px-1 text-xs text-ink';
const num='w-24 rounded-lg border border-subtle bg-transparent px-2 py-1.5 text-ink tabular-nums';
/** Vertical alignment of the text on each page, page numbering (start and format) and a border round every page. One undo step. */
export function PageLookDialog({onClose}:{onClose:()=>void}){
 const {t}=useT();const [start,setStart]=useState<PageLookForm|null>(null);const [f,setF]=useState<PageLookForm|null>(null);const [failed,setFailed]=useState(false);
 useEffect(()=>{let live=true;void readPageSetup().then(s=>{if(!live)return;if(!s){setFailed(true);return;}const x=lookFromState(s);setStart(x);setF(x);}).catch(()=>{if(live)setFailed(true);});return()=>{live=false;};},[]);
 const patch=start&&f?buildLookPatch(start,f):null;
 const go=()=>{if(!patch)return;onClose();void setPageSetup(patch);};
 return <div role="dialog" aria-modal="true" aria-labelledby="documents-look-title" className="fixed inset-0 z-20 grid place-items-center bg-black/30" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}if(e.key==='Enter'&&e.target instanceof HTMLInputElement){e.preventDefault();go();}}}>
  <div className="grid max-w-md gap-3 rounded-[var(--r-popup,25px)] bg-surface p-5 shadow-xl" data-testid="documents-look-dialog">
   <h2 id="documents-look-title" className="text-sm font-medium">{t('documents.look.title')}</h2>
   {failed?<p className="text-xs text-ink-3" role="alert">{t('documents.page.unavailable')}</p>:!f?<p className="text-xs text-ink-3">{t('documents.page.loading')}</p>:<>
    <label className="grid gap-1 text-xs text-ink-2">{t('documents.look.valign')}
     <NativeSelect className={sel} value={f.valign} onChange={e=>{const v=e.currentTarget.value;if((PAGE_VALIGNS as readonly string[]).includes(v))setF({...f,valign:v as PageVAlign});}} data-testid="documents-look-valign">
      {PAGE_VALIGNS.map(v=><option key={v} value={v}>{t('documents.look.valign.'+v)}</option>)}</NativeSelect></label>
    <div className="flex items-end gap-2">
     <label className="grid gap-1 text-xs text-ink-2">{t('documents.look.numStart')}
      <NativeInput className={num} inputMode="numeric" placeholder="1" value={f.start} aria-invalid={f.start!==''&&!/^\d{1,4}$/.test(f.start)} onChange={e=>setF({...f,start:e.currentTarget.value})} data-testid="documents-look-start"/></label>
     <label className="grid gap-1 text-xs text-ink-2">{t('documents.look.numFormat')}
      <NativeSelect className={sel} value={f.format} onChange={e=>{const v=e.currentTarget.value;if((PAGE_NUM_FORMATS as readonly string[]).includes(v))setF({...f,format:v as PageNumFormat});}} data-testid="documents-look-format">
       {PAGE_NUM_FORMATS.map(v=><option key={v} value={v}>{t('documents.look.numFormat.'+v)}</option>)}</NativeSelect></label></div>
    <div className="flex items-end gap-2">
     <label className="grid gap-1 text-xs text-ink-2">{t('documents.look.pageColor')}
      <NativeInput type="color" className="h-7 w-10 cursor-pointer rounded-sm border border-subtle bg-transparent p-0" value={f.pageColor===''?PAGE_COLOR_SWATCH:f.pageColor} onChange={e=>setF({...f,pageColor:e.currentTarget.value})} data-testid="documents-look-pagecolor"/></label>
     <NativeButton className={tool+' border border-subtle'} disabled={f.pageColor===''} onClick={()=>setF({...f,pageColor:''})} data-testid="documents-look-pagecolor-clear">{t('documents.look.pageColor.none')}</NativeButton>
     <label className="grid gap-1 text-xs text-ink-2">{t('documents.look.defaultTab')}
      <NativeInput className={num} inputMode="decimal" value={f.tab} aria-invalid={!/^\d{1,3}([.,]\d{1,2})?$/.test(f.tab)} onChange={e=>setF({...f,tab:e.currentTarget.value})} data-testid="documents-look-tab"/></label></div>
    <label className="flex items-center gap-2 text-xs text-ink-2"><NativeInput type="checkbox" checked={f.border} onChange={e=>setF({...f,border:e.currentTarget.checked})} data-testid="documents-look-border"/>{t('documents.look.border')}</label>
    <div className="flex items-end gap-2">
     <label className="grid gap-1 text-xs text-ink-2">{t('documents.look.borderStyle')}
      <NativeSelect className={sel} disabled={!f.border} value={f.style} onChange={e=>{const v=e.currentTarget.value;if((PAGE_BORDER_STYLES as readonly string[]).includes(v))setF({...f,style:v as PageBorderStyle});}} data-testid="documents-look-style">
       {PAGE_BORDER_STYLES.map(v=><option key={v} value={v}>{t('documents.look.borderStyle.'+v)}</option>)}</NativeSelect></label>
     <label className="grid gap-1 text-xs text-ink-2">{t('documents.look.borderWidth')}
      <NativeInput className={num} inputMode="decimal" disabled={!f.border} value={f.width} aria-invalid={f.border&&!/^\d{1,2}([.,]\d{1,2})?$/.test(f.width)} onChange={e=>setF({...f,width:e.currentTarget.value})} data-testid="documents-look-width"/></label>
     <label className="grid gap-1 text-xs text-ink-2">{t('documents.look.borderColor')}
      <NativeInput type="color" className="h-7 w-10 cursor-pointer rounded-sm border border-subtle bg-transparent p-0" disabled={!f.border} value={f.color} onChange={e=>setF({...f,color:e.currentTarget.value})} data-testid="documents-look-color"/></label></div>
   </>}
   <div className="flex justify-end gap-2">
    <NativeButton className={tool} onClick={onClose}>{t('documents.cancel')}</NativeButton>
    <NativeButton className={tool+' border border-subtle'} disabled={!patch} onClick={go} data-testid="documents-look-ok">{t('documents.page.apply')}</NativeButton>
   </div>
  </div>
 </div>;
}
