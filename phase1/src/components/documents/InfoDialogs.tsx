import {useEffect,useState} from 'react';
import {MAX_TAB_STOPS,TAB_ALIGNS,TAB_LEADERS,tabsProblem,type TabStopSpec,MAX_DESCRIPTION_CHARS,MAX_PROPERTY_CHARS,propertiesProblem,PROPERTY_KEYS,type PropertiesPatch,type PropertiesState} from '../../lib/documents/protocol';
import {setInfoDialog,useInfoDialog} from '../../lib/documents/infoDialog';
import {authorProblem,MAX_AUTHOR_CHARS,savedAuthor,setAuthor} from '../../lib/documents/author';
import {readProperties,selectedText,setProperties,setTabStops} from '../../lib/documents/session';
import {detailedStats} from '../../lib/documents/stats';
import {useDocuments} from '../../lib/documents/store';
import {useT} from '../../lib/useT';
import {NativeButton,NativeInput,NativeSelect,Textarea} from '../ui/native-controls';
const tool='grid h-7 cursor-pointer grid-flow-col items-center gap-1 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink-2 hover:bg-hover disabled:cursor-default disabled:opacity-50';
const field='rounded-lg border border-subtle bg-transparent px-2 py-1.5 text-ink';
const shell=(id:string,onClose:()=>void,body:React.ReactNode,wide=false)=><div role="dialog" aria-modal="true" aria-labelledby={id} className="fixed inset-0 z-20 grid place-items-center bg-black/30" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}}><div className={(wide?'doc-info-wide ':'w-96 ')+'grid max-w-full gap-3 rounded-[var(--r-popup,25px)] bg-surface p-5 shadow-xl'} data-testid={id.replace('-title','-dialog')}>{body}</div></div>;
/** Only the properties that differ from what the file has; null when nothing changed or a value is not acceptable. */
export function buildPropertiesPatch(orig:PropertiesState,form:PropertiesState):PropertiesPatch|null{
 const p:PropertiesPatch={};for(const k of PROPERTY_KEYS)if(form[k].trim()!==orig[k])p[k]=form[k];
 return Object.keys(p).length>0&&propertiesProblem(p)===null?p:null;
}
/** Document properties (title, subject, author, keywords, category, description) and the word count dialog. */
export function InfoDialogs(){
 const which=useInfoDialog();const doc=useDocuments();
 if(doc.status!=='ready'||which===null)return null;
 const close=()=>setInfoDialog(null);
 return which==='properties'?<PropertiesDialog onClose={close}/>:which==='tabs'?<TabsDialog onClose={close}/>:<WordCountDialog onClose={close}/>;
}
function PropertiesDialog({onClose}:{onClose:()=>void}){
 const {t}=useT();const [orig,setOrig]=useState<PropertiesState|null>(null);const [form,setForm]=useState<PropertiesState|null>(null);
 useEffect(()=>{let live=true;void readProperties().then(s=>{if(live&&s){setOrig(s);setForm(s);}}).catch(()=>undefined);return()=>{live=false;};},[]);
 if(!orig||!form)return shell('documents-props-title',onClose,<h2 id="documents-props-title" className="text-sm font-medium">{t('documents.props.title')}</h2>);
 const [author,setAuthorText]=useState(savedAuthor);const authorBad=authorProblem(author)!==null;const authorChanged=author.trim()!==savedAuthor();
 const patch=buildPropertiesPatch(orig,form);const bad=PROPERTY_KEYS.some(k=>propertiesProblem({[k]:form[k]})!==null&&form[k].trim()!==orig[k]);
 return shell('documents-props-title',onClose,<>
  <h2 id="documents-props-title" className="text-sm font-medium">{t('documents.props.title')}</h2>
  {PROPERTY_KEYS.map(k=><label key={k} className="grid gap-1 text-xs text-ink-2">{t('documents.props.field.'+k)}
   {k==='description'?<Textarea className={field} rows={3} maxLength={MAX_DESCRIPTION_CHARS} value={form[k]} onChange={e=>setForm({...form,[k]:e.currentTarget.value})} data-testid={'documents-props-'+k}/>
    :<NativeInput className={field} maxLength={MAX_PROPERTY_CHARS} value={form[k]} onChange={e=>setForm({...form,[k]:e.currentTarget.value})} data-testid={'documents-props-'+k}/>}</label>)}
  <label className="grid gap-1 text-xs text-ink-2">{t('documents.props.author')}
   <NativeInput className={field} maxLength={MAX_AUTHOR_CHARS} value={author} aria-invalid={authorBad} placeholder={t('documents.props.authorDefault')} onChange={e=>setAuthorText(e.currentTarget.value)} data-testid="documents-props-author"/></label>
  <p className="text-xs text-ink-3">{t('documents.props.authorNote')}</p>
  {(bad||authorBad)&&<p role="alert" className="text-xs text-ink-3">{t('documents.props.invalid')}</p>}
  <div className="flex justify-end gap-2"><NativeButton className={tool} onClick={onClose}>{t('documents.para.opt.cancel')}</NativeButton>
   <NativeButton className={tool} disabled={authorBad||(!patch&&!authorChanged)} onClick={()=>{if(authorChanged&&!setAuthor(author))return;onClose();if(patch)void setProperties(patch);}} data-testid="documents-props-apply">{t('documents.para.opt.apply')}</NativeButton></div></>);
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

interface TabRow{pos:string;align:TabStopSpec['align'];leader:TabStopSpec['leader']}
/** Tab stop positions typed as points ("72", "72,5"); null while empty or out of range. */
export const parseTabPos=(v:string):number|null=>{if(!/^\d{1,4}([.,]\d{1,2})?$/.test(v))return null;const n=Number(v.replace(',','.'));return n>=0&&n<=1440?n:null;};
/** The tab stop list for the engine, or null while any row is not a valid stop. */
export function buildTabs(rows:readonly TabRow[]):TabStopSpec[]|null{
 const out:TabStopSpec[]=[];for(const r of rows){const pos=parseTabPos(r.pos);if(pos===null)return null;out.push({pos,align:r.align,leader:r.leader});}
 return tabsProblem(out)===null?out:null;
}
function TabsDialog({onClose}:{onClose:()=>void}){
 const {t}=useT();const doc=useDocuments();const shared=doc.para?.tabs;
 const [rows,setRows]=useState<TabRow[]>(()=>(shared??[]).map(s=>({pos:String(s.pos),align:s.align,leader:s.leader})));
 const tabs=buildTabs(rows);const set=(i:number,p:Partial<TabRow>)=>setRows(rows.map((r,j)=>j===i?{...r,...p}:r));
 return shell('documents-tabs-title',onClose,<>
  <h2 id="documents-tabs-title" className="text-sm font-medium">{t('documents.tabs.title')}</h2>
  {shared===null&&<p className="text-xs text-ink-3" data-testid="documents-tabs-mixed">{t('documents.tabs.mixed')}</p>}
  {rows.length===0&&<p className="text-xs text-ink-3">{t('documents.tabs.none')}</p>}
  {rows.map((r,i)=><div key={i} className="doc-tabs-row flex items-center gap-1" data-testid="documents-tabs-row">
   <NativeInput className={field+' w-16 tabular-nums'} inputMode="decimal" aria-label={t('documents.tabs.position')} aria-invalid={parseTabPos(r.pos)===null} value={r.pos} onChange={e=>set(i,{pos:e.currentTarget.value.trim()})}/>
   <NativeSelect className={field} aria-label={t('documents.tabs.align')} value={r.align} onChange={e=>set(i,{align:e.currentTarget.value as TabRow['align']})}>{TAB_ALIGNS.map(a=><option key={a} value={a}>{t('documents.tabs.align.'+a)}</option>)}</NativeSelect>
   <NativeSelect className={field} aria-label={t('documents.tabs.leader')} value={r.leader} onChange={e=>set(i,{leader:e.currentTarget.value as TabRow['leader']})}>{TAB_LEADERS.map(a=><option key={a} value={a}>{t('documents.tabs.leader.'+a)}</option>)}</NativeSelect>
   <NativeButton className={tool} aria-label={t('documents.tabs.remove')} title={t('documents.tabs.remove')} onClick={()=>setRows(rows.filter((_,j)=>j!==i))}>{'\u00d7'}</NativeButton></div>)}
  {rows.length>0&&tabs===null&&<p role="alert" className="text-xs text-ink-3">{t('documents.tabs.invalid')}</p>}
  <div className="flex justify-between gap-2"><NativeButton className={tool} disabled={rows.length>=MAX_TAB_STOPS} onClick={()=>setRows([...rows,{pos:'',align:'left',leader:'none'}])} data-testid="documents-tabs-add">{t('documents.tabs.add')}</NativeButton>
   <div className="flex gap-2"><NativeButton className={tool} onClick={onClose}>{t('documents.para.opt.cancel')}</NativeButton>
    <NativeButton className={tool} disabled={tabs===null} onClick={()=>{if(!tabs)return;onClose();void setTabStops(tabs);}} data-testid="documents-tabs-apply">{t('documents.para.opt.apply')}</NativeButton></div></div></>,true);
}
