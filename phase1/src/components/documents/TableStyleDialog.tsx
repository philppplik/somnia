import {useState} from 'react';
import {MAX_PAD_PT,MAX_ROW_PT,tableStyleProblem,type TableStyle,type TableStyleScope} from '../../lib/documents/protocol';
import {DOC_COLORS,FILL_COLORS} from '../../lib/documents/palette';
import {styleTable} from '../../lib/documents/session';
import {useT} from '../../lib/useT';
import {NativeButton,NativeInput,NativeSelect} from '../ui/native-controls';
const tool='grid h-7 cursor-pointer grid-flow-col items-center gap-1 rounded-sm border-0 bg-transparent px-2 text-xs text-ink-2 hover:bg-hover disabled:cursor-default disabled:opacity-50';
const field='w-24 rounded-lg border border-subtle bg-transparent px-2 py-1.5 text-ink tabular-nums';
export const BORDER_WIDTHS={thin:0.5,medium:1.5,thick:3} as const;
export interface TableStyleForm{fill:'keep'|'none'|string;border:'keep'|'none'|keyof typeof BORDER_WIDTHS;borderColor:'auto'|string;rowHeight:string;padding:string}
export const INITIAL_FORM:TableStyleForm={fill:'keep',border:'keep',borderColor:'auto',rowHeight:'',padding:''};
const NUM=/^\d{1,3}(\.\d{1,2})?$/;
/** The style the form asks for, or null when a field is not a valid number or nothing is chosen. Empty number fields leave that setting alone. */
export function buildTableStyle(f:TableStyleForm):TableStyle|null{
 const s:TableStyle={};
 if(f.fill!=='keep')s.fill=f.fill;
 if(f.border==='none')s.border='none';else if(f.border!=='keep')s.border={width:BORDER_WIDTHS[f.border],color:f.borderColor};
 if(f.rowHeight!==''){if(!NUM.test(f.rowHeight))return null;s.rowHeight=Number(f.rowHeight);}
 if(f.padding!==''){if(!NUM.test(f.padding))return null;s.padding=Number(f.padding);}
 return tableStyleProblem(s)===null?s:null;
}
/** Fill, border, minimum row height and padding for the caret's cell or the whole table, applied as one undo step. */
export function TableStyleDialog({onClose}:{onClose:()=>void}){
 const {t}=useT();const [scope,setScope]=useState<TableStyleScope>('cell');const [f,setF]=useState<TableStyleForm>(INITIAL_FORM);
 const style=buildTableStyle(f);const set=(p:Partial<TableStyleForm>)=>setF({...f,...p});
 const go=()=>{if(!style)return;onClose();void styleTable(scope,style);};
 const sw=(h:string,cls:string,on:boolean,pick:()=>void,id:string)=><NativeButton key={h} className={'h-5 w-5 cursor-pointer rounded-sm border '+cls+' '+(on?'border-ink':'border-subtle')} aria-label={'#'+h} title={'#'+h} aria-pressed={on} onClick={pick} data-testid={id+h}/>;
 return <div role="dialog" aria-modal="true" aria-labelledby="documents-table-style-title" className="fixed inset-0 z-20 grid place-items-center bg-black/30" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}}>
  <div className="grid max-w-md gap-3 rounded-[var(--r-popup,25px)] bg-surface p-5 shadow-xl" data-testid="documents-table-style-dialog">
   <h2 id="documents-table-style-title" className="text-sm font-medium">{t('documents.tableStyle.title')}</h2>
   <label className="grid gap-1 text-xs text-ink-2">{t('documents.tableStyle.scope')}
    <NativeSelect className="h-7 rounded-sm border border-subtle bg-surface px-1 text-xs text-ink" value={scope} onChange={e=>setScope(e.currentTarget.value==='table'?'table':'cell')} data-testid="documents-table-style-scope">
     <option value="cell">{t('documents.tableStyle.cell')}</option><option value="table">{t('documents.tableStyle.table')}</option></NativeSelect></label>
   <div className="grid gap-1 text-xs text-ink-2" role="group" aria-label={t('documents.tableStyle.fill')}>{t('documents.tableStyle.fill')}
    <div className="flex flex-wrap items-center gap-1">
     <NativeButton className={tool+' border border-subtle'} aria-pressed={f.fill==='keep'} onClick={()=>set({fill:'keep'})} data-testid="documents-table-style-fill-keep">{t('documents.tableStyle.fillKeep')}</NativeButton>
     <NativeButton className={tool+' border border-subtle'} aria-pressed={f.fill==='none'} onClick={()=>set({fill:'none'})} data-testid="documents-table-style-fill-none">{t('documents.tableStyle.fillNone')}</NativeButton>
     {FILL_COLORS.map(([h,cls])=>sw(h,cls,f.fill===h,()=>set({fill:h}),'documents-table-style-fill-'))}</div></div>
   <div className="grid gap-1 text-xs text-ink-2" role="group" aria-label={t('documents.tableStyle.border')}>{t('documents.tableStyle.border')}
    <NativeSelect className="h-7 rounded-sm border border-subtle bg-surface px-1 text-xs text-ink" value={f.border} onChange={e=>{const v=e.currentTarget.value;if(v==='keep'||v==='none'||v==='thin'||v==='medium'||v==='thick')set({border:v});}} data-testid="documents-table-style-border">
     <option value="keep">{t('documents.tableStyle.borderKeep')}</option><option value="none">{t('documents.tableStyle.borderNone')}</option>
     <option value="thin">{t('documents.tableStyle.borderThin')}</option><option value="medium">{t('documents.tableStyle.borderMedium')}</option><option value="thick">{t('documents.tableStyle.borderThick')}</option></NativeSelect>
    {(f.border==='thin'||f.border==='medium'||f.border==='thick')&&<div className="flex flex-wrap items-center gap-1">{DOC_COLORS.map(([h,cls])=>sw(h,cls,f.borderColor===h,()=>set({borderColor:h}),'documents-table-style-border-'))}</div>}</div>
   <label className="grid gap-1 text-xs text-ink-2">{t('documents.tableStyle.rowHeight')}
    <NativeInput className={field} inputMode="decimal" placeholder={'0-'+MAX_ROW_PT} value={f.rowHeight} aria-invalid={f.rowHeight!==''&&!NUM.test(f.rowHeight)} onChange={e=>set({rowHeight:e.currentTarget.value})} data-testid="documents-table-style-height"/></label>
   <label className="grid gap-1 text-xs text-ink-2">{t('documents.tableStyle.padding')}
    <NativeInput className={field} inputMode="decimal" placeholder={'0-'+MAX_PAD_PT} value={f.padding} aria-invalid={f.padding!==''&&!NUM.test(f.padding)} onChange={e=>set({padding:e.currentTarget.value})} data-testid="documents-table-style-padding"/></label>
   <div className="flex justify-end gap-2">
    <NativeButton className={tool} onClick={onClose}>{t('documents.tableStyle.cancel')}</NativeButton>
    <NativeButton className={tool+' border border-subtle'} disabled={!style} onClick={go} data-testid="documents-table-style-ok">{t('documents.tableStyle.apply')}</NativeButton>
   </div>
  </div>
 </div>;
}
