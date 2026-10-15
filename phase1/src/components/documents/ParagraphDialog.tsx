import {useState} from 'react';
import {MAX_DROP_CAP,BORDER_STYLES,PARA_FLAG_KEYS,LINE_RULES,lineRuleProblem,type LineRule,paraLookProblem,type ParaPatch,type ParaState} from '../../lib/documents/protocol';
import {setParagraphOptionsOpen,useParagraphOptionsOpen} from '../../lib/documents/paragraphOptions';
import {setParagraphOptions} from '../../lib/documents/session';
import {useDocuments} from '../../lib/documents/store';
import {useT} from '../../lib/useT';
import {NativeButton,NativeInput,NativeSelect} from '../ui/native-controls';
const tool='grid h-7 cursor-pointer grid-flow-col items-center gap-1 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink-2 hover:bg-hover disabled:cursor-default disabled:opacity-50';
/** Right indent in points typed as "12" or "12.5"; null when it is not a number inside 0..1440. */
export const parseIndentPt=(v:string):number|null=>{if(!/^\d{1,4}([.,]\d{1,2})?$/.test(v))return null;const n=Number(v.replace(',','.'));return n>=0&&n<=1440?n:null;};
/** Only what the user changed: flags that differ from the shared state, and a right indent that differs. Null when nothing changed or the indent is not valid. */
export interface ParaLook{dropCap:string;shading:string;border:string;width:string;color:string}
export const EMPTY_LOOK:ParaLook={dropCap:'',shading:'',border:'',width:'1',color:'000000'};
export const initialLook=(para:ParaState|null):ParaLook=>({...EMPTY_LOOK,dropCap:para?.dropCap==null?'':String(para.dropCap),shading:para?.shading&&para.shading!=='none'?para.shading:''});
const hex=(v:string)=>v.trim().replace(/^#/,'').toUpperCase();
export function buildParagraphPatch(para:ParaState|null,flags:Partial<Record<typeof PARA_FLAG_KEYS[number],boolean>>,indent:string,look?:ParaLook,rule?:{rule:string;value:string}):ParaPatch|null{
 const p:ParaPatch={};
 if(rule&&rule.rule!==''){
  const o=para?.lineRule;const v=Number(rule.value.trim().replace(',','.'));
  if(rule.value.trim()===''||!Number.isFinite(v))return null;
  if(!o||o.rule!==rule.rule||o.value!==v){const r={rule:rule.rule,value:v};if(lineRuleProblem(r))return null;p.lineRule=r as LineRule;}
 }
 if(look){
  if(look.dropCap!==initialLook(para).dropCap&&look.dropCap!==''){const n=Number(look.dropCap);if(!/^\d{1,2}$/.test(look.dropCap)||n>MAX_DROP_CAP)return null;p.dropCap=n;}
  const s=hex(look.shading);
  if(s!==initialLook(para).shading){const v=s===''?'none':s;if(paraLookProblem('shading',v))return null;p.shading=v;}
  if(look.border==='none')p.border='none';
  else if(look.border!==''){
   const w=look.width.trim().replace(',','.');const b={style:look.border,width:/^\d{1,2}(\.\d{1,2})?$/.test(w)?Number(w):Number.NaN,color:hex(look.color)};
   if(paraLookProblem('border',b))return null;p.border=b as ParaPatch['border'];
  }
 }
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
 const [rule,setRule]=useState({rule:para?.lineRule?.rule??'',value:para?.lineRule==null?'':String(para.lineRule.value)});
 const [look,setLook]=useState<ParaLook>(initialLook(para));const borderOn=look.border!==''&&look.border!=='none';
 const patch=buildParagraphPatch(para,flags,indent,look,rule);const bad=indent!==''&&parseIndentPt(indent)===null;const badLook=buildParagraphPatch(para,{},'',look)===null&&(hex(look.shading)!==initialLook(para).shading||look.border!==''||look.dropCap!==initialLook(para).dropCap);
 const apply=()=>{if(!patch)return;onClose();void setParagraphOptions(patch);};
 return <div role="dialog" aria-modal="true" aria-labelledby="documents-paraopt-title" className="fixed inset-0 z-20 grid place-items-center bg-black/30" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}}>
  <div className="grid w-96 max-w-full gap-3 rounded-[var(--r-popup,25px)] bg-surface p-5 shadow-xl" data-testid="documents-paraopt-dialog">
   <h2 id="documents-paraopt-title" className="text-sm font-medium">{t('documents.para.opt.title')}</h2>
   {PARA_FLAG_KEYS.map(k=><label key={k} className="doc-paraopt-check text-xs text-ink-2">
    <NativeInput type="checkbox" checked={flags[k]??para?.[k]??false} onChange={e=>setFlags({...flags,[k]:e.currentTarget.checked})} data-testid={'documents-paraopt-'+k}/>{t('documents.para.opt.'+k)}</label>)}
   <div className="grid grid-cols-2 gap-2">
    <label className="grid gap-1 text-xs text-ink-2">{t('documents.para.lineRule')}
     <NativeSelect className="rounded-lg border border-subtle bg-transparent px-2 py-1.5 text-ink" value={rule.rule} onChange={e=>setRule({rule:e.currentTarget.value,value:rule.rule===''||rule.value===''?(e.currentTarget.value==='multiple'?'1':'12'):rule.value})} data-testid="documents-para-linerule">
      {rule.rule===''&&<option value="" disabled>{t('documents.charlook.mixed')}</option>}{LINE_RULES.map(r=><option key={r} value={r}>{t('documents.para.lineRule.'+r)}</option>)}</NativeSelect></label>
    <label className="grid gap-1 text-xs text-ink-2">{t('documents.para.lineRule.value')}
     <NativeInput className="rounded-lg border border-subtle bg-transparent px-2 py-1.5 text-ink tabular-nums" disabled={rule.rule===''} inputMode="decimal" value={rule.value} aria-invalid={rule.rule!==''&&lineRuleProblem({rule:rule.rule,value:Number(rule.value.replace(',','.'))})!==null} onChange={e=>setRule({...rule,value:e.currentTarget.value})} data-testid="documents-para-linerule-value"/></label></div>
   <label className="grid gap-1 text-xs text-ink-2">{t('documents.para.opt.indentRight')}
    <NativeInput className="w-24 rounded-lg border border-subtle bg-transparent px-2 py-1.5 text-ink tabular-nums" inputMode="decimal" value={indent} aria-invalid={bad} onChange={e=>setIndent(e.currentTarget.value.trim())} data-testid="documents-paraopt-indent"/></label>
   <label className="grid gap-1 text-xs text-ink-2">{t('documents.para.dropCap')}
    <NativeSelect className="w-28 rounded-lg border border-subtle bg-transparent px-2 py-1.5 text-ink" value={look.dropCap} onChange={e=>setLook({...look,dropCap:e.currentTarget.value})} data-testid="documents-para-dropcap">
     {look.dropCap===''&&<option value="">{t('documents.para.border.keep')}</option>}<option value="0">{t('documents.para.dropCap.off')}</option>{[2,3,4,5].map(n=><option key={n} value={String(n)}>{t('documents.para.dropCap.lines',{n})}</option>)}</NativeSelect></label>
   <label className="grid gap-1 text-xs text-ink-2">{t('documents.para.shading')}
    <NativeInput className="w-28 rounded-lg border border-subtle bg-transparent px-2 py-1.5 text-ink uppercase" maxLength={7} value={look.shading} placeholder={t('documents.para.shading.none')} aria-invalid={look.shading!==''&&!/^#?[0-9a-fA-F]{6}$/.test(look.shading.trim())} onChange={e=>setLook({...look,shading:e.currentTarget.value})} data-testid="documents-para-shading"/></label>
   <div className="grid grid-cols-3 gap-2">
    <label className="grid gap-1 text-xs text-ink-2">{t('documents.para.border')}
     <NativeSelect className="rounded-lg border border-subtle bg-transparent px-2 py-1.5 text-ink" value={look.border} onChange={e=>setLook({...look,border:e.currentTarget.value})} data-testid="documents-para-border">
      <option value="">{t('documents.para.border.keep')}</option><option value="none">{t('documents.para.border.none')}</option>{BORDER_STYLES.map(b=><option key={b} value={b}>{t('documents.para.border.'+b)}</option>)}</NativeSelect></label>
    <label className="grid gap-1 text-xs text-ink-2">{t('documents.para.border.width')}
     <NativeInput className="rounded-lg border border-subtle bg-transparent px-2 py-1.5 text-ink tabular-nums" disabled={!borderOn} inputMode="decimal" value={look.width} onChange={e=>setLook({...look,width:e.currentTarget.value})} data-testid="documents-para-border-width"/></label>
    <label className="grid gap-1 text-xs text-ink-2">{t('documents.para.border.color')}
     <NativeInput className="rounded-lg border border-subtle bg-transparent px-2 py-1.5 text-ink uppercase" disabled={!borderOn} maxLength={7} value={look.color} onChange={e=>setLook({...look,color:e.currentTarget.value})} data-testid="documents-para-border-color"/></label></div>
   {(bad||badLook)&&<p role="alert" className="text-xs text-ink-3">{t('documents.para.opt.invalid')}</p>}
   <div className="flex justify-end gap-2"><NativeButton className={tool} onClick={onClose}>{t('documents.para.opt.cancel')}</NativeButton>
    <NativeButton className={tool} disabled={!patch} onClick={apply} data-testid="documents-paraopt-apply">{t('documents.para.opt.apply')}</NativeButton></div>
  </div>
 </div>;
}
