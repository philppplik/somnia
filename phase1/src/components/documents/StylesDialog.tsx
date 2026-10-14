import {useEffect,useState} from 'react';
import {MAX_FONT_NAME,MAX_STYLE_NAME,stylePatchProblem,type FormatState,type ParaAlign,type StyleItem,type StylePatch} from '../../lib/documents/protocol';
import {deleteStyle,refreshStyles,saveStyle,setCharStyle,setParagraphStyle} from '../../lib/documents/session';
import {useDocuments} from '../../lib/documents/store';
import {useStyleList} from '../../lib/documents/styles';
import {useT} from '../../lib/useT';
import {NativeButton,NativeInput,NativeSelect} from '../ui/native-controls';
const tool='grid h-7 cursor-pointer grid-flow-col items-center gap-1 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink-2 hover:bg-hover disabled:cursor-default disabled:opacity-50';
const field='rounded-lg border border-subtle bg-transparent px-2 py-1.5 text-ink';
const ALIGNS:ParaAlign[]=['left','center','right','justify'];
/** The editor form as typed text; empty means "inherit" for every optional field. */
export interface StyleForm{name:string;kind:'paragraph'|'character';basedOn:string;font:string;size:string;bold:string;italic:string;color:string;align:string;spaceBefore:string;spaceAfter:string;lineSpacing:string}
export const EMPTY_STYLE_FORM:StyleForm={name:'',kind:'paragraph',basedOn:'Normal',font:'',size:'',bold:'',italic:'',color:'',align:'',spaceBefore:'',spaceAfter:'',lineSpacing:''};
const text=(n:number|null)=>n===null?'':String(n);
const tri=(b:boolean|null)=>b===null?'':b?'on':'off';
export const formFromStyle=(s:StyleItem):StyleForm=>({name:s.name,kind:s.kind,basedOn:s.basedOn??'',font:s.font??'',size:text(s.size),bold:tri(s.bold),italic:tri(s.italic),color:s.color??'',align:s.align??'',spaceBefore:text(s.spaceBefore),spaceAfter:text(s.spaceAfter),lineSpacing:text(s.lineSpacing)});
/** Copies the selection's shared character formatting (bold, italic, font, size, colour) into the form; mixed or automatic values stay as they were. */
export function formFromSelection(f:StyleForm,fmt:FormatState|null):StyleForm{
 if(!fmt)return f;const o={...f};
 if(fmt.bold==='on'||fmt.bold==='off')o.bold=fmt.bold;
 if(fmt.italic==='on'||fmt.italic==='off')o.italic=fmt.italic;
 if(typeof fmt.font==='string'&&fmt.font!=='')o.font=fmt.font;
 if(typeof fmt.size==='number'&&Number.isFinite(fmt.size))o.size=String(Math.round(fmt.size*100)/100);
 if(typeof fmt.color==='string'&&/^[0-9a-fA-F]{6}$/.test(fmt.color))o.color=fmt.color.toUpperCase();
 return o;
}
/** A number typed with a dot or comma and up to two decimals; '' is "inherit" (null); undefined when the text is not a number. */
export function parseStyleNum(v:string):number|null|undefined{
 const t=v.trim();if(t==='')return null;if(!/^\d{1,4}([.,]\d{1,2})?$/.test(t))return undefined;return Number(t.replace(',','.'));
}
/**
 * The style change for the form: for a new style every filled field, for an existing one only what differs from `orig`.
 * Null while a value is not acceptable or nothing changed.
 */
export function buildStylePatch(orig:StyleItem|null,f:StyleForm):StylePatch|null{
 const o=orig?formFromStyle(orig):null;const p:StylePatch=orig?{id:orig.id}:{name:f.name.trim(),kind:f.kind};
 const para=(orig?orig.kind:f.kind)==='paragraph';
 const set=<K extends keyof StylePatch>(k:K,v:StylePatch[K],same:boolean)=>{if(orig?!same:v!==null&&v!==undefined)p[k]=v;};
 if(orig&&f.name.trim()!==o!.name)p.name=f.name.trim();
 set('basedOn',f.basedOn===''?null:f.basedOn,f.basedOn===o?.basedOn);
 set('font',f.font.trim()===''?null:f.font.trim(),f.font.trim()===o?.font);
 const num=(k:'size'|'spaceBefore'|'spaceAfter'|'lineSpacing',v:string)=>{const n=parseStyleNum(v);if(n===undefined)return false;set(k,n,v.trim()===o?.[k]);return true;};
 if(!num('size',f.size))return null;
 if(para&&(!num('spaceBefore',f.spaceBefore)||!num('spaceAfter',f.spaceAfter)||!num('lineSpacing',f.lineSpacing)))return null;
 set('bold',f.bold===''?null:f.bold==='on',f.bold===o?.bold);set('italic',f.italic===''?null:f.italic==='on',f.italic===o?.italic);
 const c=f.color.trim().replace(/^#/,'').toUpperCase();set('color',c===''?null:c,c===(o?.color??''));
 if(para)set('align',f.align===''?null:f.align as ParaAlign,f.align===o?.align);
 if(!orig&&f.name.trim()==='')return null;
 if(orig?Object.keys(p).length<2:false)return null;
 return stylePatchProblem(p)===null?p:null;
}
/** Create, change, delete and apply paragraph and character styles. */
export function StylesDialog({onClose}:{onClose:()=>void}){
 const {t}=useT();const list=useStyleList();const fmt=useDocuments().format;const [sel,setSel]=useState<string>('');const [f,setF]=useState<StyleForm>(EMPTY_STYLE_FORM);const [failed,setFailed]=useState('');
 useEffect(()=>{void refreshStyles();},[]);
 const cur=list.find(s=>s.id===sel)??null;
 const pick=(id:string)=>{setSel(id);setFailed('');const s=list.find(x=>x.id===id);setF(s?formFromStyle(s):EMPTY_STYLE_FORM);};
 const patch=buildStylePatch(cur,f);const para=(cur?cur.kind:f.kind)==='paragraph';
 const bases=list.filter(s=>s.kind===(cur?cur.kind:f.kind)&&s.id!==cur?.id);
 const save=()=>{if(!patch)return;setFailed('');void saveStyle(patch).then(id=>{if(id)setSel(id);}).catch(e=>setFailed(e instanceof Error?e.message:String(e)));};
 const set=(p:Partial<StyleForm>)=>setF({...f,...p});
 const triSel=(k:'bold'|'italic')=><label className="grid gap-1 text-xs text-ink-2">{t('documents.styles.'+k)}
  <NativeSelect className={field} value={f[k]} onChange={e=>set({[k]:e.currentTarget.value})} data-testid={'documents-styles-'+k}><option value="">{t('documents.styles.inherit')}</option><option value="on">{t('documents.styles.on')}</option><option value="off">{t('documents.styles.off')}</option></NativeSelect></label>;
 const bad=(v:string)=>parseStyleNum(v)===undefined;
 return <div role="dialog" aria-modal="true" aria-labelledby="documents-styles-title" className="fixed inset-0 z-20 grid place-items-center bg-black/30" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}}>
  <div className="grid max-h-[90vh] w-[32rem] max-w-full gap-3 overflow-y-auto rounded-[var(--r-popup,25px)] bg-surface p-5 shadow-xl" data-testid="documents-styles-dialog">
   <h2 id="documents-styles-title" className="text-sm font-medium">{t('documents.styles.title')}</h2>
   <label className="grid gap-1 text-xs text-ink-2">{t('documents.styles.pick')}
    <NativeSelect className={field} value={sel} onChange={e=>pick(e.currentTarget.value)} data-testid="documents-styles-pick">
     <option value="">{t('documents.styles.new')}</option>{list.map(s=><option key={s.id} value={s.id}>{s.name+(s.kind==='character'?' ('+t('documents.styles.kind.character')+')':'')}</option>)}</NativeSelect></label>
   <div className="grid grid-cols-2 gap-2">
    <label className="grid gap-1 text-xs text-ink-2">{t('documents.styles.name')}
     <NativeInput className={field} maxLength={MAX_STYLE_NAME} disabled={cur?.builtin===true} value={f.name} onChange={e=>set({name:e.currentTarget.value})} data-testid="documents-styles-name"/></label>
    <label className="grid gap-1 text-xs text-ink-2">{t('documents.styles.kind')}
     <NativeSelect className={field} disabled={cur!==null} value={cur?cur.kind:f.kind} onChange={e=>set({kind:e.currentTarget.value as StyleForm['kind'],basedOn:e.currentTarget.value==='paragraph'?'Normal':'',align:'',spaceBefore:'',spaceAfter:'',lineSpacing:''})} data-testid="documents-styles-kind">
      <option value="paragraph">{t('documents.styles.kind.paragraph')}</option><option value="character">{t('documents.styles.kind.character')}</option></NativeSelect></label>
    <label className="grid gap-1 text-xs text-ink-2">{t('documents.styles.basedOn')}
     <NativeSelect className={field} value={f.basedOn} onChange={e=>set({basedOn:e.currentTarget.value})} data-testid="documents-styles-basedOn">
      <option value="">{t('documents.styles.noBase')}</option>{bases.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect></label>
    <label className="grid gap-1 text-xs text-ink-2">{t('documents.styles.font')}
     <NativeInput className={field} maxLength={MAX_FONT_NAME} value={f.font} placeholder={t('documents.styles.inherit')} onChange={e=>set({font:e.currentTarget.value})} data-testid="documents-styles-font"/></label>
    <label className="grid gap-1 text-xs text-ink-2">{t('documents.styles.size')}
     <NativeInput className={field+' tabular-nums'} inputMode="decimal" aria-invalid={bad(f.size)} value={f.size} placeholder={t('documents.styles.inherit')} onChange={e=>set({size:e.currentTarget.value})} data-testid="documents-styles-size"/></label>
    <label className="grid gap-1 text-xs text-ink-2">{t('documents.styles.color')}
     <NativeInput className={field+' uppercase'} maxLength={7} aria-invalid={f.color.trim()!==''&&!/^#?[0-9a-fA-F]{6}$/.test(f.color.trim())} value={f.color} placeholder={t('documents.styles.inherit')} onChange={e=>set({color:e.currentTarget.value})} data-testid="documents-styles-color"/></label>
    {triSel('bold')}{triSel('italic')}
    {para&&<>
     <label className="grid gap-1 text-xs text-ink-2">{t('documents.styles.align')}
      <NativeSelect className={field} value={f.align} onChange={e=>set({align:e.currentTarget.value})} data-testid="documents-styles-align"><option value="">{t('documents.styles.inherit')}</option>{ALIGNS.map(a=><option key={a} value={a}>{t('documents.styles.align.'+a)}</option>)}</NativeSelect></label>
     <label className="grid gap-1 text-xs text-ink-2">{t('documents.styles.lineSpacing')}
      <NativeInput className={field+' tabular-nums'} inputMode="decimal" aria-invalid={bad(f.lineSpacing)} value={f.lineSpacing} placeholder={t('documents.styles.inherit')} onChange={e=>set({lineSpacing:e.currentTarget.value})} data-testid="documents-styles-lineSpacing"/></label>
     <label className="grid gap-1 text-xs text-ink-2">{t('documents.styles.spaceBefore')}
      <NativeInput className={field+' tabular-nums'} inputMode="decimal" aria-invalid={bad(f.spaceBefore)} value={f.spaceBefore} placeholder={t('documents.styles.inherit')} onChange={e=>set({spaceBefore:e.currentTarget.value})} data-testid="documents-styles-spaceBefore"/></label>
     <label className="grid gap-1 text-xs text-ink-2">{t('documents.styles.spaceAfter')}
      <NativeInput className={field+' tabular-nums'} inputMode="decimal" aria-invalid={bad(f.spaceAfter)} value={f.spaceAfter} placeholder={t('documents.styles.inherit')} onChange={e=>set({spaceAfter:e.currentTarget.value})} data-testid="documents-styles-spaceAfter"/></label></>}
   </div>
   {failed&&<p role="alert" className="text-xs text-ink-3" data-testid="documents-styles-error">{failed}</p>}
   <div className="flex flex-wrap justify-between gap-2">
    <div className="flex gap-2">
     <NativeButton className={tool} disabled={!cur||cur.builtin} onClick={()=>{if(!cur)return;const id=cur.id;setSel('');setF(EMPTY_STYLE_FORM);void deleteStyle(id).catch(e=>setFailed(e instanceof Error?e.message:String(e)));}} data-testid="documents-styles-delete">{t('documents.styles.delete')}</NativeButton>
     <NativeButton className={tool} disabled={!cur} onClick={()=>{if(!cur)return;onClose();void (cur.kind==='paragraph'?setParagraphStyle(cur.id):setCharStyle(cur.id));}} data-testid="documents-styles-apply">{t('documents.styles.apply')}</NativeButton>
     <NativeButton className={tool} disabled={!fmt} onClick={()=>setF(formFromSelection(f,fmt))} data-testid="documents-styles-fromsel">{t('documents.styles.fromSelection')}</NativeButton>
     <NativeButton className={tool} disabled={cur?.kind!=='character'} onClick={()=>{onClose();void setCharStyle('');}} data-testid="documents-styles-clearchar">{t('documents.styles.clearChar')}</NativeButton></div>
    <div className="flex gap-2"><NativeButton className={tool} onClick={onClose}>{t('documents.styles.close')}</NativeButton>
     <NativeButton className={tool} disabled={!patch} onClick={save} data-testid="documents-styles-save">{cur?t('documents.styles.save'):t('documents.styles.create')}</NativeButton></div></div>
  </div></div>;
}
