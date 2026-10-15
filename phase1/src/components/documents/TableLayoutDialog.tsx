import {useEffect,useState} from 'react';
import {FILL_SCOPES,CELL_VALIGNS,MAX_HF_CHARS,ROW_RULES,TABLE_ALIGNS,validHfText,type CellVAlign} from '../../lib/documents/protocol';
import {FILL_SWATCH,buildLayoutPatch,layoutFromState,padFormOk,type PadForm,type TableLayoutForm} from '../../lib/documents/tableLayout';
import {readTableLayout,setTableLayout} from '../../lib/documents/session';
import {useT} from '../../lib/useT';
import {NativeButton,NativeInput,NativeSelect} from '../ui/native-controls';
const tool='grid h-7 cursor-pointer grid-flow-col items-center gap-1 rounded-sm border-0 bg-transparent px-2 text-xs text-ink-2 hover:bg-hover disabled:cursor-default disabled:opacity-50';
const sel='h-7 rounded-sm border border-subtle bg-surface px-1 text-xs text-ink';
const padField='w-16 rounded-lg border border-subtle bg-transparent px-2 py-1.5 text-ink tabular-nums';
const SIDES=['top','left','bottom','right'] as const;
const field='w-24 rounded-lg border border-subtle bg-transparent px-2 py-1.5 text-ink tabular-nums';
/** Table alignment and width, a repeating header row, rows kept whole, the cell's vertical alignment and alt text. One undo step. */
export function TableLayoutDialog({onClose}:{onClose:()=>void}){
 const {t}=useT();const [start,setStart]=useState<TableLayoutForm|null>(null);const [f,setF]=useState<TableLayoutForm|null>(null);const [failed,setFailed]=useState(false);
 useEffect(()=>{let live=true;void readTableLayout().then(s=>{if(!live)return;if(!s){setFailed(true);return;}const x=layoutFromState(s);setStart(x);setF(x);}).catch(()=>{if(live)setFailed(true);});return()=>{live=false;};},[]);
 const patch=start&&f&&validHfText(f.caption)&&padFormOk(f.pad)&&padFormOk(f.cellPad)?buildLayoutPatch(start,f):null;
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
    {(['pad','cellPad'] as const).map(key=><fieldset key={key} className="grid gap-1 border-0 p-0 text-xs text-ink-2"><legend className="mb-1">{t(key==='pad'?'documents.tl.padTable':'documents.tl.padCell')}</legend>
     <div className="flex gap-2">{SIDES.map((side,i)=><label key={side} className="grid gap-1">{t('documents.tl.pad.'+side)}
      <NativeInput className={padField} inputMode="decimal" maxLength={5} placeholder={t('documents.tl.padDefault')} value={f[key][i]} aria-invalid={!padFormOk(f[key])} onChange={e=>{const n=[...f[key]] as PadForm;n[i]=e.currentTarget.value.trim();setF({...f,[key]:n});}} data-testid={`documents-tl-${key}-${side}`}/></label>)}</div></fieldset>)}
    <div className="flex items-end gap-2">
     <label className="flex h-7 items-center gap-2 text-xs text-ink-2"><NativeInput type="checkbox" checked={f.fill!=='none'} onChange={e=>setF({...f,fill:e.currentTarget.checked?FILL_SWATCH:'none'})} data-testid="documents-tl-fill-on"/>{t('documents.tl.fill')}</label>
     <NativeInput type="color" aria-label={t('documents.tl.fill')} className="h-7 w-10 cursor-pointer rounded-sm border border-subtle bg-transparent p-0" disabled={f.fill==='none'} value={f.fill==='none'?'#'+FILL_SWATCH:'#'+f.fill} onChange={e=>{const v=e.currentTarget.value.replace('#','').toLowerCase();if(/^[0-9a-f]{6}$/.test(v))setF({...f,fill:v});}} data-testid="documents-tl-fill"/>
     <label className="grid gap-1 text-xs text-ink-2">{t('documents.tl.fillScope')}
      <NativeSelect className={sel} value={f.fillScope} onChange={e=>{const v=e.currentTarget.value;if((FILL_SCOPES as readonly string[]).includes(v))setF({...f,fillScope:v as TableLayoutForm['fillScope']});}} data-testid="documents-tl-fillscope">
       {FILL_SCOPES.map(a=><option key={a} value={a}>{t('documents.tl.fillScope.'+a)}</option>)}</NativeSelect></label></div>
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
