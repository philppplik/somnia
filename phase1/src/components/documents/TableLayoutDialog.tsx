import {useEffect,useState} from 'react';
import {CELL_VALIGNS,MAX_HF_CHARS,ROW_RULES,TABLE_ALIGNS,validHfText,type CellVAlign} from '../../lib/documents/protocol';
import {buildLayoutPatch,layoutFromState,type TableLayoutForm} from '../../lib/documents/tableLayout';
import {readTableLayout,setTableLayout} from '../../lib/documents/session';
import {useT} from '../../lib/useT';
import {NativeButton,NativeInput,NativeSelect} from '../ui/native-controls';
const tool='grid h-7 cursor-pointer grid-flow-col items-center gap-1 rounded-sm border-0 bg-transparent px-2 text-xs text-ink-2 hover:bg-hover disabled:cursor-default disabled:opacity-50';
const sel='h-7 rounded-sm border border-subtle bg-surface px-1 text-xs text-ink';
const field='w-24 rounded-lg border border-subtle bg-transparent px-2 py-1.5 text-ink tabular-nums';
/** Table alignment and width, a repeating header row, rows kept whole, the cell's vertical alignment and alt text. One undo step. */
export function TableLayoutDialog({onClose}:{onClose:()=>void}){
 const {t}=useT();const [start,setStart]=useState<TableLayoutForm|null>(null);const [f,setF]=useState<TableLayoutForm|null>(null);const [failed,setFailed]=useState(false);
 useEffect(()=>{let live=true;void readTableLayout().then(s=>{if(!live)return;if(!s){setFailed(true);return;}const x=layoutFromState(s);setStart(x);setF(x);}).catch(()=>{if(live)setFailed(true);});return()=>{live=false;};},[]);
 const patch=start&&f&&validHfText(f.caption)?buildLayoutPatch(start,f):null;
 const go=()=>{if(!patch)return;onClose();void setTableLayout(patch);};
 return <div role="dialog" aria-modal="true" aria-labelledby="documents-tl-title" className="fixed inset-0 z-20 grid place-items-center bg-black/30" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}if(e.key==='Enter'&&e.target instanceof HTMLInputElement&&e.target.type!=='checkbox'){e.preventDefault();go();}}}>
  <div className="grid max-w-md gap-3 rounded-[var(--r-popup,25px)] bg-surface p-5 shadow-xl" data-testid="documents-tl-dialog">
   <h2 id="documents-tl-title" className="text-sm font-medium">{t('documents.tl.title')}</h2>
   {failed?<p className="text-xs text-ink-3" role="alert">{t('documents.tl.unavailable')}</p>:!f?<p className="text-xs text-ink-3">{t('documents.page.loading')}</p>:<>
    <div className="flex items-end gap-2">
     <label className="grid gap-1 text-xs text-ink-2">{t('documents.tl.align')}
      <NativeSelect className={sel} value={f.align} onChange={e=>{const v=e.currentTarget.value;if(v==='auto'||(TABLE_ALIGNS as readonly string[]).includes(v))setF({...f,align:v as TableLayoutForm['align']});}} data-testid="documents-tl-align">
       <option value="auto">{t('documents.tl.align.auto')}</option>{TABLE_ALIGNS.map(a=><option key={a} value={a}>{t('documents.tl.align.'+a)}</option>)}</NativeSelect></label>
     <label className="grid gap-1 text-xs text-ink-2">{t('documents.tl.width')}
      <NativeInput className={field} inputMode="numeric" placeholder={t('documents.tl.widthAuto')} value={f.width} aria-invalid={f.width!==''&&!/^\d{2,3}$/.test(f.width)} onChange={e=>setF({...f,width:e.currentTarget.value})} data-testid="documents-tl-width"/></label></div>
    <label className="flex items-center gap-2 text-xs text-ink-2"><NativeInput type="checkbox" checked={f.header} onChange={e=>setF({...f,header:e.currentTarget.checked})} data-testid="documents-tl-header"/>{t('documents.tl.header')}</label>
    <label className="flex items-center gap-2 text-xs text-ink-2"><NativeInput type="checkbox" checked={f.keep} onChange={e=>setF({...f,keep:e.currentTarget.checked})} data-testid="documents-tl-keep"/>{t('documents.tl.keep')}</label>
    <label className="grid gap-1 text-xs text-ink-2">{t('documents.tl.valign')}
     <NativeSelect className={sel} value={f.valign} onChange={e=>{const v=e.currentTarget.value;if((CELL_VALIGNS as readonly string[]).includes(v))setF({...f,valign:v as CellVAlign});}} data-testid="documents-tl-valign">
      {CELL_VALIGNS.map(a=><option key={a} value={a}>{t('documents.look.valign.'+a)}</option>)}</NativeSelect></label>
    <div className="flex items-end gap-2">
     <label className="grid gap-1 text-xs text-ink-2">{t('documents.tl.rowRule')}
      <NativeSelect className={sel} value={f.rowRule} onChange={e=>{const v=e.currentTarget.value;if((ROW_RULES as readonly string[]).includes(v))setF({...f,rowRule:v as TableLayoutForm['rowRule']});}} data-testid="documents-tl-rowrule">
       {ROW_RULES.map(r=><option key={r} value={r}>{t('documents.tl.rowRule.'+r)}</option>)}</NativeSelect></label>
     {f.rowRule!=='auto'&&<label className="grid gap-1 text-xs text-ink-2">{t('documents.tl.rowHeight')}
      <NativeInput className={field} inputMode="decimal" maxLength={7} value={f.rowHeight} aria-invalid={!/^\d{1,4}(\.\d{1,2})?$/.test(f.rowHeight)} onChange={e=>setF({...f,rowHeight:e.currentTarget.value.trim()})} data-testid="documents-tl-rowheight"/></label>}</div>
    <label className="flex items-center gap-2 text-xs text-ink-2"><NativeInput type="checkbox" checked={f.allRows} onChange={e=>setF({...f,allRows:e.currentTarget.checked})} data-testid="documents-tl-allrows"/>{t('documents.tl.allRows')}</label>
    <label className="grid gap-1 text-xs text-ink-2">{t('documents.tl.caption')}
     <NativeInput className="w-72 rounded-lg border border-subtle bg-transparent px-2 py-1.5 text-ink" maxLength={MAX_HF_CHARS} value={f.caption} aria-invalid={!validHfText(f.caption)} onChange={e=>setF({...f,caption:e.currentTarget.value})} data-testid="documents-tl-caption"/></label>
   </>}
   <div className="flex justify-end gap-2">
    <NativeButton className={tool} onClick={onClose}>{t('documents.cancel')}</NativeButton>
    <NativeButton className={tool+' border border-subtle'} disabled={!patch} onClick={go} data-testid="documents-tl-ok">{t('documents.page.apply')}</NativeButton>
   </div>
  </div>
 </div>;
}
