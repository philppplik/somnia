import {useEffect,useState} from 'react';
import {MAX_DESCRIPTION_CHARS,MAX_PROPERTY_CHARS,propertiesProblem,PROPERTY_KEYS,type PropertiesPatch,type PropertiesState} from '../../lib/documents/protocol';
import {setInfoDialog,useInfoDialog} from '../../lib/documents/infoDialog';
import {readProperties,selectedText,setProperties} from '../../lib/documents/session';
import {detailedStats} from '../../lib/documents/stats';
import {useDocuments} from '../../lib/documents/store';
import {useT} from '../../lib/useT';
import {NativeButton,NativeInput,Textarea} from '../ui/native-controls';
const tool='grid h-7 cursor-pointer grid-flow-col items-center gap-1 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink-2 hover:bg-hover disabled:cursor-default disabled:opacity-50';
const field='rounded-lg border border-subtle bg-transparent px-2 py-1.5 text-ink';
const shell=(id:string,onClose:()=>void,body:React.ReactNode)=><div role="dialog" aria-modal="true" aria-labelledby={id} className="fixed inset-0 z-20 grid place-items-center bg-black/30" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}}><div className="grid w-96 max-w-full gap-3 rounded-[var(--r-popup,25px)] bg-surface p-5 shadow-xl" data-testid={id.replace('-title','-dialog')}>{body}</div></div>;
/** Only the properties that differ from what the file has; null when nothing changed or a value is not acceptable. */
export function buildPropertiesPatch(orig:PropertiesState,form:PropertiesState):PropertiesPatch|null{
 const p:PropertiesPatch={};for(const k of PROPERTY_KEYS)if(form[k].trim()!==orig[k])p[k]=form[k];
 return Object.keys(p).length>0&&propertiesProblem(p)===null?p:null;
}
/** Document properties (title, subject, author, keywords, category, description) and the word count dialog. */
export function InfoDialogs(){
 const which=useInfoDialog();const doc=useDocuments();
 if(doc.status!=='ready'||which===null)return null;
 return which==='properties'?<PropertiesDialog onClose={()=>setInfoDialog(null)}/>:<WordCountDialog onClose={()=>setInfoDialog(null)}/>;
}
function PropertiesDialog({onClose}:{onClose:()=>void}){
 const {t}=useT();const [orig,setOrig]=useState<PropertiesState|null>(null);const [form,setForm]=useState<PropertiesState|null>(null);
 useEffect(()=>{let live=true;void readProperties().then(s=>{if(live&&s){setOrig(s);setForm(s);}}).catch(()=>undefined);return()=>{live=false;};},[]);
 if(!orig||!form)return shell('documents-props-title',onClose,<h2 id="documents-props-title" className="text-sm font-medium">{t('documents.props.title')}</h2>);
 const patch=buildPropertiesPatch(orig,form);const bad=PROPERTY_KEYS.some(k=>propertiesProblem({[k]:form[k]})!==null&&form[k].trim()!==orig[k]);
 return shell('documents-props-title',onClose,<>
  <h2 id="documents-props-title" className="text-sm font-medium">{t('documents.props.title')}</h2>
  {PROPERTY_KEYS.map(k=><label key={k} className="grid gap-1 text-xs text-ink-2">{t('documents.props.field.'+k)}
   {k==='description'?<Textarea className={field} rows={3} maxLength={MAX_DESCRIPTION_CHARS} value={form[k]} onChange={e=>setForm({...form,[k]:e.currentTarget.value})} data-testid={'documents-props-'+k}/>
    :<NativeInput className={field} maxLength={MAX_PROPERTY_CHARS} value={form[k]} onChange={e=>setForm({...form,[k]:e.currentTarget.value})} data-testid={'documents-props-'+k}/>}</label>)}
  {bad&&<p role="alert" className="text-xs text-ink-3">{t('documents.props.invalid')}</p>}
  <div className="flex justify-end gap-2"><NativeButton className={tool} onClick={onClose}>{t('documents.para.opt.cancel')}</NativeButton>
   <NativeButton className={tool} disabled={!patch} onClick={()=>{if(!patch)return;onClose();void setProperties(patch);}} data-testid="documents-props-apply">{t('documents.para.opt.apply')}</NativeButton></div></>);
}
function WordCountDialog({onClose}:{onClose:()=>void}){
 const {t}=useT();const doc=useDocuments();
 const all=detailedStats(doc.blocks.filter(b=>b.text!==undefined).map(b=>b.text!).join('\n'));const sel=selectedText();const part=sel?detailedStats(sel):null;
 const rows:[string,number,number|null][]=[['pages',doc.pages,null],['words',all.words,part?part.words:null],['characters',all.chars,part?part.chars:null],['charactersNoSpaces',all.charsNoSpaces,part?part.charsNoSpaces:null],['sentences',all.sentences,part?part.sentences:null],['paragraphs',all.paragraphs,part?part.paragraphs:null],['readingMinutes',all.readingMinutes,null]];
 return shell('documents-wc-title',onClose,<>
  <h2 id="documents-wc-title" className="text-sm font-medium">{t('documents.wc.title')}</h2>
  <table className="w-full text-xs"><thead><tr className="text-ink-3"><th className="text-left font-normal"/><th className="text-right font-normal">{t('documents.wc.document')}</th><th className="text-right font-normal">{t('documents.wc.selection')}</th></tr></thead>
   <tbody>{rows.map(([k,a,b])=><tr key={k} data-testid={'documents-wc-'+k}><td className="py-0.5 text-ink-2">{t('documents.wc.'+k)}</td><td className="text-right tabular-nums text-ink">{a}</td><td className="text-right tabular-nums text-ink-3">{b??'\u2013'}</td></tr>)}</tbody></table>
  <div className="flex justify-end"><NativeButton className={tool} onClick={onClose} data-testid="documents-wc-close">{t('documents.wc.close')}</NativeButton></div></>);
}
