import {useEffect,useRef,useState} from 'react';
import {Input} from '../ui/input';
import {getEngine} from '../../lib/documents/session';
import {useDocuments} from '../../lib/documents/store';
import {executeCommand} from '../../lib/commands';
import type {InspectorSectionProps,PanelHostProps} from '../../lib/shell/types';
import {useT} from '../../lib/useT';
import {usePanelState} from '../../store/panelStateStore';
import {ParagraphEditor,ParagraphField} from './DocumentsCanvas';
import {NativeButton} from '../ui/native-controls';
const THUMB=148;
/** One lazily rendered page thumbnail. Only thumbnails near the viewport hold an image. */
function Thumb({index,width,height,rev,current}:{index:number;width:number;height:number;rev:number;current:boolean}){
 const {t}=useT();const ref=useRef<HTMLButtonElement>(null);const [src,setSrc]=useState('');const [near,setNear]=useState(index<3);
 useEffect(()=>{const el=ref.current;if(!el)return;const io=new IntersectionObserver(([e])=>setNear(e.isIntersecting),{rootMargin:'300px 0px'});io.observe(el);return()=>io.disconnect();},[]);
 useEffect(()=>{
  const engine=getEngine();if(!near||!engine){setSrc('');return;}
  let live=true,url='';engine.render(index,Math.min(0.5,THUMB/width)).then(b=>{if(!live)return;url=URL.createObjectURL(b);setSrc(url);}).catch(()=>{if(live)setSrc('');});
  return()=>{live=false;if(url)URL.revokeObjectURL(url);};
 },[near,index,width,rev]);
 return <NativeButton ref={ref} type="button" data-testid="documents-thumb" data-page={index+1} aria-current={current?'page':undefined} aria-label={t('documents.pages.goto',{n:index+1})} title={t('documents.pages.goto',{n:index+1})}
  className={'grid cursor-pointer justify-items-center gap-1 rounded-sm border bg-transparent p-1.5 text-[11px] text-ink-3 hover:bg-hover '+(current?'border-accent':'border-transparent')}
  onClick={()=>void executeCommand('documents.pages.goto',{page:index})}>
  <span className="block bg-white shadow-sm ring-1 ring-black/10" style={{width:THUMB,height:Math.round(THUMB*height/width)}}>{src&&<img src={src} alt="" draggable={false} className="h-full w-full"/>}</span>{index+1}</NativeButton>;
}
/** Left panel: page thumbnails. A click scrolls the canvas to that page. */
export function PagesPanel(_:PanelHostProps){
 const {t}=useT();const doc=useDocuments();
 return <aside className="panel sidebar grid min-h-0 content-start overflow-auto p-2" aria-label={t('documents.rail.pages')} data-testid="documents-pages-panel">
  {doc.status!=='ready'?<p className="p-1 text-[12px] text-ink-3">{t('documents.inspector.none')}</p>
   :<div className="grid justify-items-center gap-1">{doc.pageSizes.map((p,i)=><Thumb key={i} index={i} width={p.width} height={p.height} rev={doc.rev} current={doc.caretBox?.page===i}/>)}</div>}
 </aside>;
}
/** Left panel: every paragraph and table of the document, filterable. A click puts the caret there and scrolls to it. */
export function OutlinePanel({panelId,context}:PanelHostProps){
 const {t}=useT();const doc=useDocuments();const [filter,setFilter]=usePanelState<string>(`${context.studio}.${panelId}.filter`,'');
 const q=filter.trim().toLowerCase();
 const rows=doc.blocks.map(b=>({b,label:b.kind==='table'?t('documents.outline.table',{n:b.index+1}):(b.text??'').trim()||t('documents.outline.emptyPara')})).filter(r=>!q||r.label.toLowerCase().includes(q));
 return <aside className="panel sidebar grid min-h-0 grid-rows-[auto_1fr] gap-2 p-2" aria-label={t('documents.rail.outline')} data-testid="documents-outline">
  <Input value={filter} onChange={e=>setFilter(e.target.value)} placeholder={t('documents.outline.filter')} aria-label={t('documents.outline.filter')}/>
  {doc.status!=='ready'?<p className="text-[12px] text-ink-3">{t('documents.inspector.none')}</p>
   :rows.length===0?<p className="text-[12px] text-ink-3">{t('documents.outline.empty')}</p>
   :<ul className="m-0 grid min-h-0 list-none content-start gap-0.5 overflow-auto p-0">{rows.map(({b,label})=><li key={b.index}>
    <NativeButton type="button" data-testid={'documents-outline-'+b.index} aria-current={doc.caret?.block===b.index?'true':undefined} disabled={!b.editable}
     className={'w-full cursor-pointer truncate rounded-sm border-0 bg-transparent px-2 py-1 text-left text-[12px] hover:bg-hover disabled:cursor-default disabled:text-ink-3 '+(doc.caret?.block===b.index?'bg-accent-soft text-accent':'text-ink-2')}
     onClick={()=>void executeCommand('documents.outline.goto',{block:b.index})}>{label}</NativeButton></li>)}</ul>}
 </aside>;
}
/* ---- Inspector sections ---- */
export function DocumentSection(_:InspectorSectionProps){
 const {t}=useT();const doc=useDocuments();
 return <div data-testid="documents-inspector" className="grid gap-2 text-[12px]">
  {doc.status!=='ready'?<p className="text-ink-3">{t('documents.inspector.none')}</p>:<dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
   <dt className="text-ink-3">{t('documents.inspector.pages')}</dt><dd className="m-0" data-testid="documents-info-pages">{doc.pages}</dd>
   <dt className="text-ink-3">{t('documents.inspector.words')}</dt><dd className="m-0">{doc.words}</dd>
   <dt className="text-ink-3">{t('documents.inspector.engine')}</dt><dd className="m-0">{doc.engineMs} ms</dd></dl>}
  <p className="m-0 text-ink-3">{t('documents.inspector.readonly')}</p></div>;
}
export function SelectionSection({context}:InspectorSectionProps){
 const doc=useDocuments();const block=doc.blocks.find(b=>b.index===(context.data?.block as number|undefined));
 if(!block||block.kind!=='para'||block.text===undefined)return null;
 return <ParagraphField index={block.index} text={block.text}/>;
}
export function TextSection(_:InspectorSectionProps){const doc=useDocuments();return doc.status==='ready'?<ParagraphEditor/>:null;}
export function RisksSection(_:InspectorSectionProps){
 const {t}=useT();const doc=useDocuments();
 return <div role="note" className="text-[12px]"><p className="m-0 text-ink-2">{t('documents.inspector.risks')}</p><ul className="list-disc pl-5 text-ink-3">{doc.risks.map(r=><li key={r}>{t('documents.risk.'+r)}</li>)}</ul></div>;
}
