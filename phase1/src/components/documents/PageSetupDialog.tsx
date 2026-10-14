import {useEffect,useState} from 'react';
import {MAX_COLUMNS,MAX_COLUMN_SPACE_PT,MAX_MARGIN_PT,PAGE_SIZE_IDS,pageSetupProblem,type PageMargins,type PageSetupPatch,type PageSetupState,type PageSizeId} from '../../lib/documents/protocol';
import {readPageSetup,setPageSetup} from '../../lib/documents/session';
import {useT} from '../../lib/useT';
import {NativeButton,NativeInput,NativeSelect} from '../ui/native-controls';
const tool='grid h-7 cursor-pointer grid-flow-col items-center gap-1 rounded-sm border-0 bg-transparent px-2 text-xs text-ink-2 hover:bg-hover disabled:cursor-default disabled:opacity-50';
const field='w-20 rounded-lg border border-subtle bg-transparent px-2 py-1.5 text-ink tabular-nums';
const PT_PER_CM=72/2.54;
export const ptToCm=(pt:number)=>(pt/PT_PER_CM).toFixed(2);
/** Centimetres typed as "2.5" or "2,5" (up to two decimals) in points, rounded to 0.1 pt; null when it is not a number inside 0..288 pt. */
export function cmToPt(v:string):number|null{
 if(!/^\d{1,2}([.,]\d{1,2})?$/.test(v))return null;const pt=Math.round(Number(v.replace(',','.'))*PT_PER_CM*10)/10;return pt>=0&&pt<=MAX_MARGIN_PT?pt:null;
}
/** Column spacing typed in centimetres as points; null when it is not a number inside 0..144 pt. */
export const spaceToPt=(v:string):number|null=>{const pt=cmToPt(v);return pt!==null&&pt<=MAX_COLUMN_SPACE_PT?pt:null;};
export interface PageSetupForm{size:PageSizeId|'custom';landscape:boolean;margins:Record<keyof PageMargins,string>;columns:{count:number;space:string;separator:boolean}}
export const formFromState=(s:PageSetupState):PageSetupForm=>({size:s.size,landscape:s.landscape,margins:{top:ptToCm(s.margins.top),bottom:ptToCm(s.margins.bottom),left:ptToCm(s.margins.left),right:ptToCm(s.margins.right)},columns:{count:s.columns.count,space:ptToCm(s.columns.space),separator:s.columns.separator}});
/** Only the settings the user changed (untouched margins keep their exact points); null when nothing changed or a margin is not valid. */
export function buildPageSetupPatch(start:PageSetupForm,f:PageSetupForm):PageSetupPatch|null{
 const p:PageSetupPatch={};
 if(f.size!==start.size&&f.size!=='custom')p.size=f.size;
 if(f.landscape!==start.landscape)p.landscape=f.landscape;
 const m:Partial<PageMargins>={};
 for(const k of ['top','bottom','left','right'] as const){if(f.margins[k]===start.margins[k])continue;const pt=cmToPt(f.margins[k]);if(pt===null)return null;m[k]=pt;}
 if(Object.keys(m).length>0)p.margins=m;
 const c:NonNullable<PageSetupPatch['columns']>={};
 if(f.columns.count!==start.columns.count)c.count=f.columns.count;
 if(f.columns.space!==start.columns.space){const pt=spaceToPt(f.columns.space);if(pt===null)return null;c.space=pt;}
 if(f.columns.separator!==start.columns.separator)c.separator=f.columns.separator;
 if(Object.keys(c).length>0)p.columns=c;
 return Object.keys(p).length>0&&pageSetupProblem(p)===null?p:null;
}
/** Paper size, orientation and margins (in centimetres) for the whole document, applied as one undo step. */
export function PageSetupDialog({onClose}:{onClose:()=>void}){
 const {t}=useT();const [start,setStart]=useState<PageSetupForm|null>(null);const [f,setF]=useState<PageSetupForm|null>(null);const [failed,setFailed]=useState(false);
 useEffect(()=>{let live=true;void readPageSetup().then(s=>{if(!live)return;if(!s){setFailed(true);return;}const x=formFromState(s);setStart(x);setF(x);}).catch(()=>{if(live)setFailed(true);});return()=>{live=false;};},[]);
 const patch=start&&f?buildPageSetupPatch(start,f):null;
 const go=()=>{if(!patch)return;onClose();void setPageSetup(patch);};
 const margin=(k:keyof PageMargins)=>f&&<label key={k} className="grid gap-1 text-xs text-ink-2">{t('documents.page.margin.'+k)}
  <NativeInput className={field} inputMode="decimal" value={f.margins[k]} aria-invalid={cmToPt(f.margins[k])===null} onChange={e=>setF({...f,margins:{...f.margins,[k]:e.currentTarget.value}})} data-testid={'documents-page-margin-'+k}/></label>;
 return <div role="dialog" aria-modal="true" aria-labelledby="documents-page-title" className="fixed inset-0 z-20 grid place-items-center bg-black/30" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}if(e.key==='Enter'&&e.target instanceof HTMLInputElement){e.preventDefault();go();}}}>
  <div className="grid max-w-md gap-3 rounded-[var(--r-popup,25px)] bg-surface p-5 shadow-xl" data-testid="documents-page-dialog">
   <h2 id="documents-page-title" className="text-sm font-medium">{t('documents.page.title')}</h2>
   {failed?<p className="text-xs text-ink-3" role="alert">{t('documents.page.unavailable')}</p>:!f?<p className="text-xs text-ink-3">{t('documents.page.loading')}</p>:<>
    <label className="grid gap-1 text-xs text-ink-2">{t('documents.page.size')}
     <NativeSelect className="h-7 rounded-sm border border-subtle bg-surface px-1 text-xs text-ink" value={f.size} onChange={e=>{const v=e.currentTarget.value;if((PAGE_SIZE_IDS as readonly string[]).includes(v))setF({...f,size:v as PageSizeId});}} data-testid="documents-page-size">
      {f.size==='custom'&&<option value="custom" disabled>{t('documents.page.custom')}</option>}{PAGE_SIZE_IDS.map(s=><option key={s} value={s}>{t('documents.page.size.'+s)}</option>)}</NativeSelect></label>
    <label className="grid gap-1 text-xs text-ink-2">{t('documents.page.orientation')}
     <NativeSelect className="h-7 rounded-sm border border-subtle bg-surface px-1 text-xs text-ink" value={f.landscape?'landscape':'portrait'} onChange={e=>setF({...f,landscape:e.currentTarget.value==='landscape'})} data-testid="documents-page-orientation">
      <option value="portrait">{t('documents.page.portrait')}</option><option value="landscape">{t('documents.page.landscape')}</option></NativeSelect></label>
    <div className="grid grid-cols-2 gap-2">{(['top','bottom','left','right'] as const).map(margin)}</div>
    <div className="flex items-end gap-2">
     <label className="grid gap-1 text-xs text-ink-2">{t('documents.page.columns')}
      <NativeSelect className="h-7 rounded-sm border border-subtle bg-surface px-1 text-xs text-ink" value={String(f.columns.count)} onChange={e=>setF({...f,columns:{...f.columns,count:Number(e.currentTarget.value)}})} data-testid="documents-page-columns">
       {Array.from({length:MAX_COLUMNS},(_,i)=><option key={i} value={i+1}>{i+1}</option>)}</NativeSelect></label>
     <label className="grid gap-1 text-xs text-ink-2">{t('documents.page.columnSpace')}
      <NativeInput className={field} inputMode="decimal" disabled={f.columns.count<2} value={f.columns.space} aria-invalid={spaceToPt(f.columns.space)===null} onChange={e=>setF({...f,columns:{...f.columns,space:e.currentTarget.value}})} data-testid="documents-page-column-space"/></label>
     <label className="flex items-center gap-1 pb-1 text-xs text-ink-2"><NativeInput type="checkbox" disabled={f.columns.count<2} checked={f.columns.separator} onChange={e=>setF({...f,columns:{...f.columns,separator:e.currentTarget.checked}})} data-testid="documents-page-column-line"/>{t('documents.page.columnLine')}</label></div>
    {f.columns.count>1&&<p className="text-xs text-ink-3">{t('documents.page.columnsApply')}</p>}
    <p className="text-xs text-ink-3">{t('documents.page.hint')}</p>
   </>}
   <div className="flex justify-end gap-2">
    <NativeButton className={tool} onClick={onClose}>{t('documents.cancel')}</NativeButton>
    <NativeButton className={tool+' border border-subtle'} disabled={!patch} onClick={go} data-testid="documents-page-ok">{t('documents.page.apply')}</NativeButton>
   </div>
  </div>
 </div>;
}
