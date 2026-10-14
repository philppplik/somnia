import {DocumentsSelectionPreview} from './DocumentsSelectionPreview';import {useEffect,useState} from 'react';
import type {InspectorSectionProps,PanelHostProps} from '../../lib/shell/types';
import {findDocumentMatches,documentStatistics} from '../../lib/documents/panels';
import {documentPanelReady,runDocumentPanelCommand} from '../../lib/documents/panelCommands';
import {useDocuments} from '../../lib/documents/store';
import {utf8ToUtf16Offset} from '../../lib/documents/text';
import {usePanelState} from '../../store/panelStateStore';
import {useT} from '../../lib/useT';
import {NativeButton,NativeInput,NativeSelect,Textarea} from '../ui/native-controls';
function useAction(){const [error,setError]=useState('');return {error,run:async(id:string,p:unknown={})=>{setError('');try{await runDocumentPanelCommand(id,p);return true;}catch(e){setError(e instanceof Error?e.message:String(e));return false;}}};}
function Message({error}:{error:string}){return error?<p role="alert" className="doc-panel-error">{error}</p>:null;}
function Empty(){const {t}=useT();return <p className="doc-panel-note">{t('documents.inspector.none')}</p>;}
export function DocumentsOutlinePanel({context}:PanelHostProps){
 const {t}=useT(),d=useDocuments(),a=useAction();const [filter,setFilter]=usePanelState('documents.outline.filter','');const [editableOnly,setEditableOnly]=usePanelState('documents.outline.editableOnly',false);const [headingsOnly,setHeadingsOnly]=usePanelState('documents.outline.headingsOnly',false);
 const ready=context.studio==='documents'&&documentPanelReady();
 return <section className="doc-panel" data-testid="documents-outline-panel"><Message error={a.error}/>{!ready?<Empty/>:<>
  <label>{t('documents.panels.filter')}<NativeInput value={filter} onChange={e=>setFilter(e.target.value)}/></label>
  <label className="doc-panel-check"><NativeInput type="checkbox" checked={editableOnly} onChange={e=>setEditableOnly(e.target.checked)}/>{t('documents.panels.editableOnly')}</label>
  <label className="doc-panel-check"><NativeInput type="checkbox" checked={headingsOnly} onChange={e=>setHeadingsOnly(e.target.checked)} data-testid="documents-outline-headings-only"/>{t('documents.panels.headingsOnly')}</label>
  <p className="doc-panel-note">{t('documents.panels.outlineHint')}</p>
  <ol className="doc-panel-list">{d.blocks.filter(b=>(!editableOnly||b.editable)&&(!headingsOnly||(b.outline!=null))&&(!filter||(b.text??'').toLocaleLowerCase().includes(filter.toLocaleLowerCase()))).map(b=><li key={b.index}><NativeButton disabled={!b.editable} aria-current={d.caret?.block===b.index?'true':undefined} onClick={()=>a.run('documents.focusParagraph',{block:b.index})}>
   <span className="doc-panel-meta">{b.outline!=null?t('documents.panels.headingLevel',{n:b.outline+1})+' · ':''}{t(b.kind==='table'?'documents.edit.table':'documents.edit.paragraph',{n:b.index+1})}{!b.editable&&' · '+t('documents.panels.locked')}</span>
   <span className="doc-panel-excerpt">{b.text||(b.kind==='para'&&b.editable?t('documents.panels.emptyParagraph'):'')}</span></NativeButton></li>)}</ol>
 </>}</section>;
}
export function DocumentsFindPanel({context}:PanelHostProps){
 const {t}=useT(),d=useDocuments(),a=useAction();const [query,setQuery]=usePanelState('documents.find.query',''),[matchCase,setMatchCase]=usePanelState('documents.find.matchCase',false);const [replacement,setReplacement]=useState('');
 const ready=context.studio==='documents'&&documentPanelReady();const matches=ready?findDocumentMatches(d.blocks,query,matchCase):[];
 const [choice,setChoice]=useState(0);useEffect(()=>setChoice(0),[query,matchCase,d.rev,d.name]);const selected=matches[choice];
 return <section className="doc-panel" data-testid="documents-find-panel"><Message error={a.error}/>{!ready?<Empty/>:<>
  <label>{t('documents.panels.findText')}<NativeInput type="search" value={query} onChange={e=>setQuery(e.target.value)}/></label>
  <label className="doc-panel-check"><NativeInput type="checkbox" checked={matchCase} onChange={e=>setMatchCase(e.target.checked)}/>{t('documents.panels.matchCase')}</label>
  <p className="doc-panel-note" role="status">{t(matches.length===500?'documents.panels.resultLimit':'documents.panels.results',{n:matches.length})}</p>
  <label>{t('documents.panels.replaceWith')}<NativeInput value={replacement} onChange={e=>setReplacement(e.target.value.replace(/[\r\n]+/g,' '))}/></label>
  <div className="doc-panel-actions"><NativeButton disabled={!selected||!documentPanelReady(true)} onClick={()=>selected&&a.run('documents.replaceMatch',{block:selected.block,start:selected.start,end:selected.end,expected:selected.expected,text:replacement})}>{t('documents.panels.replaceOne')}</NativeButton></div>
  <p className="doc-panel-note">{t('documents.panels.findHint')}</p>
  <ol className="doc-panel-list">{matches.map((m,i)=><li key={`${m.block}.${m.start}`}><NativeButton aria-current={choice===i?'true':undefined} onClick={()=>{setChoice(i);a.run('documents.selectMatch',{block:m.block,start:m.start,end:m.end,expected:m.expected});}}><span className="doc-panel-meta">{t('documents.edit.paragraph',{n:m.block+1})}</span><span className="doc-panel-excerpt">{m.excerpt}</span></NativeButton></li>)}</ol>
 </>}</section>;
}
export function DocumentsInfoPanel({context}:InspectorSectionProps){
 const {t}=useT(),d=useDocuments(),a=useAction();const [page,setPage]=useState(1);const stats=documentStatistics(d.blocks);const ready=context.studio==='documents'&&documentPanelReady();
 useEffect(()=>setPage(1),[d.name]);
 return <section className="doc-panel" data-testid="documents-inspector"><span data-testid="documents-info-panel"/><Message error={a.error}/>{!ready?<Empty/>:<>
  <p className="doc-panel-filename" title={d.name}>{d.name}</p>
  <dl className="doc-panel-stats">{[['pages',d.pages],['words',d.words],['characters',stats.characters],['paragraphs',stats.paragraphs],['tables',stats.tables],['editable',stats.editable]].map(([key,value])=><div key={key}><dt>{t('documents.panels.'+key)}</dt><dd data-testid={key==='pages'?'documents-info-pages':undefined}>{value}</dd></div>)}</dl>
  <label>{t('documents.panels.page')}<div className="doc-panel-actions"><NativeInput type="number" min={1} max={d.pages} value={page} onChange={e=>setPage(Number(e.target.value))}/><NativeButton disabled={!Number.isInteger(page)||page<1||page>d.pages} onClick={()=>a.run('documents.goToPage',{page})}>{t('documents.panels.go')}</NativeButton></div></label>
  <label>{t('documents.panels.zoom')}<NativeSelect value={d.zoom} onChange={e=>a.run('documents.setZoom',{zoom:Number(e.target.value)})}>{Array.from(new Set([0.5,0.75,1,1.25,1.5,2,d.zoom])).sort((a,b)=>a-b).map(z=><option key={z} value={z}>{Math.round(z*100)}%</option>)}</NativeSelect></label>
  <div className="doc-panel-actions"><NativeButton disabled={!d.canUndo||!documentPanelReady(true)} onClick={()=>a.run('documents.panelUndo')}>{t('documents.undo')}</NativeButton><NativeButton disabled={!d.canRedo||!documentPanelReady(true)} onClick={()=>a.run('documents.panelRedo')}>{t('documents.redo')}</NativeButton></div>
  <p className="doc-panel-note" role="status">{t(d.edited?'documents.panels.unsaved':'documents.panels.original')}</p>
  <h3>{t('documents.panels.pageSizes')}</h3><ul className="doc-panel-note">{d.pageSizes.map((p,i)=><li key={i}>{t('documents.page',{n:i+1})}: {Math.round(p.width*25.4/72)} × {Math.round(p.height*25.4/72)} mm</li>)}</ul>
  <h3>{t('documents.inspector.risks')}</h3>{d.risks.length?<ul className="doc-panel-note">{d.risks.map(r=><li key={r}>{t('documents.risk.'+r)}</li>)}</ul>:<p className="doc-panel-note">{t('documents.panels.noRisks')}</p>}
  <p className="doc-panel-note">{t('documents.panels.saveHint')}</p>
 </>}</section>;
}
export function DocumentsSelectionPanel({context}:InspectorSectionProps){
 const d=useDocuments();const index=typeof context.data?.block==='number'?context.data.block:Number(context.selection.ids?.[0]?.replace(/^p/,''));const block=d.blocks.find(b=>b.index===index);
 return <section className="doc-panel" data-testid="documents-selection-panel">{context.studio!=='documents'||!documentPanelReady()||!block||d.caret?.block!==index?<Empty/>:<ParagraphProperties key={`${d.name}:${index}`} index={index} text={block.text??''} editable={block.editable}/>}</section>;
}
function ParagraphProperties({index,text,editable}:{index:number;text:string;editable:boolean}){
 const {t}=useT(),d=useDocuments(),a=useAction();const [draft,setDraft]=useState(text),[base,setBase]=useState(text);const changed=text!==base;
 useEffect(()=>{if(draft===base){setDraft(text);setBase(text);}},[text,draft,base]);
 const c=d.caret;const selected=c?text.slice(utf8ToUtf16Offset(text,Math.min(c.anchor,c.head)),utf8ToUtf16Offset(text,Math.max(c.anchor,c.head))):'';
 return <><DocumentsSelectionPreview/><Message error={a.error}/><p>{t('documents.edit.paragraph',{n:index+1})}</p>
  <dl className="doc-panel-stats"><div><dt>{t('documents.panels.characters')}</dt><dd>{Array.from(text).length}</dd></div><div><dt>{t('documents.panels.selectedCharacters')}</dt><dd>{Array.from(selected).length}</dd></div></dl>
  {editable?<><label>{t('documents.panels.paragraphText')}<Textarea rows={6} value={draft} onChange={e=>setDraft(e.target.value.replace(/[\r\n]+/g,' '))} disabled={!documentPanelReady(true)}/></label>
   {changed&&<p role="alert" className="doc-panel-note">{t('documents.panels.conflict')}</p>}
   <div className="doc-panel-actions"><NativeButton disabled={changed||draft===text||!documentPanelReady(true)} onClick={()=>{void a.run('documents.commitParagraph',{block:index,before:base,text:draft}).then(ok=>{if(ok)setBase(draft);});}}>{t('documents.panels.apply')}</NativeButton><NativeButton disabled={draft===text&&!changed} onClick={()=>{setDraft(text);setBase(text);}}>{t('documents.panels.reload')}</NativeButton></div>
   <div className="doc-panel-actions"><NativeButton onClick={()=>a.run('documents.selectParagraph')}>{t('documents.panels.selectAll')}</NativeButton><NativeButton onClick={()=>a.run('documents.clearSelection')}>{t('documents.panels.clear')}</NativeButton></div>
   <p className="doc-panel-note">{t('documents.panels.editHint')}</p></>:<p className="doc-panel-note">{t('documents.caret.locked')}</p>}
  {d.editError&&<p role="alert" className="doc-panel-error">{d.editError}</p>}
 </>;
}
