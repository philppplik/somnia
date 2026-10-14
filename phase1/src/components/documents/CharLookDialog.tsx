import {useState} from 'react';
import {UNDERLINE_STYLES,checkFormatPatch,type FormatPatch,type FormatState} from '../../lib/documents/protocol';
import {setCharLook} from '../../lib/documents/session';
import {useDocuments} from '../../lib/documents/store';
import {useT} from '../../lib/useT';
import {NativeButton,NativeInput,NativeSelect} from '../ui/native-controls';
const tool='grid h-7 cursor-pointer grid-flow-col items-center gap-1 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink-2 hover:bg-hover disabled:cursor-default disabled:opacity-50';
const field='rounded-lg border border-subtle bg-transparent px-2 py-1.5 text-ink';
export interface CharLookForm{style:string;color:string;shading:string}
const hex=(v:string)=>v.trim().replace(/^#/,'').toUpperCase();
/** The form for the selection: '' means "mixed, leave as is". */
export const lookFromState=(f:FormatState|null):CharLookForm=>({style:f?.underlineStyle??'',color:f?.underlineColor==null||f.underlineColor==='auto'?'':f.underlineColor,shading:f?.charShading==null||f.charShading==='none'?'':f.charShading});
/** Only what changed: style none turns the underline off; empty colour is automatic; empty shading is none. Null when nothing changed or a value is not valid. */
export function buildLookPatch(f:FormatState|null,form:CharLookForm):FormatPatch|null{
 const o=lookFromState(f);const p:FormatPatch={};
 if(form.style!==o.style&&form.style!==''){if(form.style==='none')p.underline=false;else p.underlineStyle=form.style as FormatPatch['underlineStyle'];}
 if(hex(form.color)!==o.color)p.underlineColor=hex(form.color)===''?'auto':hex(form.color);
 if(hex(form.shading)!==o.shading)p.charShading=hex(form.shading)===''?'none':hex(form.shading);
 if(Object.keys(p).length===0)return null;
 try{checkFormatPatch(p);}catch{return null;}
 return p;
}
/** Underline style and colour, and a shading behind the selected characters. One undo step. */
export function CharLookDialog({onClose}:{onClose:()=>void}){
 const {t}=useT();const doc=useDocuments();const [form,setForm]=useState<CharLookForm>(lookFromState(doc.format));
 const patch=buildLookPatch(doc.format,form);const badColor=form.color!==''&&!/^#?[0-9a-fA-F]{6}$/.test(form.color.trim());const badShade=form.shading!==''&&!/^#?[0-9a-fA-F]{6}$/.test(form.shading.trim());
 return <div role="dialog" aria-modal="true" aria-labelledby="documents-charlook-title" className="fixed inset-0 z-20 grid place-items-center bg-black/30" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}}>
  <div className="grid w-80 max-w-full gap-3 rounded-[var(--r-popup,25px)] bg-surface p-5 shadow-xl" data-testid="documents-charlook-dialog">
   <h2 id="documents-charlook-title" className="text-sm font-medium">{t('documents.charlook.title')}</h2>
   <label className="grid gap-1 text-xs text-ink-2">{t('documents.charlook.underline')}
    <NativeSelect className={field} value={form.style} onChange={e=>setForm({...form,style:e.currentTarget.value})} data-testid="documents-charlook-style">
     {form.style===''&&<option value="" disabled>{t('documents.charlook.mixed')}</option>}<option value="none">{t('documents.charlook.none')}</option>{UNDERLINE_STYLES.map(s=><option key={s} value={s}>{t('documents.charlook.u.'+s)}</option>)}</NativeSelect></label>
   <label className="grid gap-1 text-xs text-ink-2">{t('documents.charlook.underlineColor')}
    <NativeInput className={field+' uppercase'} maxLength={7} value={form.color} placeholder={t('documents.charlook.auto')} aria-invalid={badColor} onChange={e=>setForm({...form,color:e.currentTarget.value})} data-testid="documents-charlook-color"/></label>
   <label className="grid gap-1 text-xs text-ink-2">{t('documents.charlook.shading')}
    <NativeInput className={field+' uppercase'} maxLength={7} value={form.shading} placeholder={t('documents.charlook.none')} aria-invalid={badShade} onChange={e=>setForm({...form,shading:e.currentTarget.value})} data-testid="documents-charlook-shading"/></label>
   <div className="flex justify-end gap-2"><NativeButton className={tool} onClick={onClose}>{t('documents.styles.close')}</NativeButton>
    <NativeButton className={tool} disabled={!patch} onClick={()=>{if(!patch)return;onClose();void setCharLook(patch);}} data-testid="documents-charlook-apply">{t('documents.para.opt.apply')}</NativeButton></div>
  </div></div>;
}
