import {useState} from 'react';
import {ArrowDown,ArrowUp,Copy,Download,Eye,EyeOff} from '../../lib/icons';
import {ToFrontIcon} from './icons';
import {Button} from '../ui/button';
import {useT} from '../../lib/useT';
import {VectorNodePanel,VectorToolsPanel} from './tools';
import {downloadPng} from '../../lib/vectorstudio/exportFiles';
import {openActiveProjectSvg} from '../../lib/vectorstudio/open';
import {commit,duplicateSelection,importSvgInto,renamePath,reorder,resizePage,select,selectNode,setStyle,setTool,toggleHidden,useVectorSession} from '../../lib/vectorstudio/session';
import {useAppStore} from '../../store/appStore';
const field='h-7 w-full min-w-0 rounded-sm border border-line bg-elevated px-1.5 text-[12px] text-ink';
const label='flex flex-col gap-1 text-[11px] text-ink-3';
const section='flex flex-col gap-2 border-b border-subtle p-3';
const isColor=(v:string|undefined)=>!!v&&/^#[0-9a-f]{6}$/i.test(v);
/** Right panel of the Vector Studio: style, geometry, layers, page and export. */
export function VectorInspector(){
 const {t}=useT();const s=useVectorSession();const app=useAppStore();const [busy,setBusy]=useState(false);const [note,setNote]=useState('');
 const first=s.doc.paths.find(p=>s.selection.includes(p.id));
 const nodeSelection=s.nodePath&&s.selectedNode?[{pathId:s.nodePath,nodeId:s.selectedNode}]:[];
 const fill=first?.style?.fill??'#000000',stroke=first?.style?.stroke??'none',sw=first?.style?.strokeWidth??1,op=first?.style?.opacity??1;
 const num=(v:string)=>{const n=Number(v);return Number.isFinite(n)?n:null;};
 const pngExport=async()=>{setBusy(true);setNote('');try{await downloadPng(s.name,s.doc.width,s.doc.height,2);}catch(e){setNote(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
 const importActive=/\.svg$/i.test(app.activeFile)&&app.activeFile in app.files;
 return <aside className="flex min-h-0 flex-1 flex-col overflow-auto text-[12px]" aria-label={t('vector.inspector')} data-testid="vector-inspector">
  <section className={section}><VectorToolsPanel value={s.doc} selection={s.selection} onSelectionChange={select} tool={s.tool==='node'?'node':'select'} onToolChange={setTool} exportName={s.name}
   onCommit={({after})=>commit(after)}/></section>
  {s.tool==='node'&&<section className={section}><VectorNodePanel value={s.doc} nodeSelection={nodeSelection} onNodeSelectionChange={n=>selectNode(n.length?n[n.length-1].nodeId:null)} onCommit={({after})=>commit(after)}/></section>}
  <section className={section} data-testid="vector-style-panel"><h2 className="m-0 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{t('vector.style')}</h2>
   {!first?<p className="m-0 text-ink-3">{t('vector.nothingSelected')}</p>:<>
    <div className="grid grid-cols-2 gap-2">
     <label className={label}>{t('vector.fill')}<span className="flex gap-1"><input type="color" className="h-7 w-10 shrink-0 cursor-pointer" aria-label={t('vector.fill')} value={isColor(fill)?fill:'#000000'} onChange={e=>setStyle({fill:e.target.value})} data-testid="vector-fill"/>
      <Button size="compact" onClick={()=>setStyle({fill:fill==='none'?'#6d5ef5':'none'})} data-testid="vector-fill-none">{fill==='none'?t('vector.add'):t('vector.none')}</Button></span></label>
     <label className={label}>{t('vector.stroke')}<span className="flex gap-1"><input type="color" className="h-7 w-10 shrink-0 cursor-pointer" aria-label={t('vector.stroke')} value={isColor(stroke)?stroke:'#000000'} onChange={e=>setStyle({stroke:e.target.value})} data-testid="vector-stroke"/>
      <Button size="compact" onClick={()=>setStyle({stroke:stroke==='none'?'#1f1b4d':'none'})} data-testid="vector-stroke-none">{stroke==='none'?t('vector.add'):t('vector.none')}</Button></span></label>
     <label className={label}>{t('vector.strokeWidth')}<input className={field} type="number" min={0} step={0.5} value={sw} onChange={e=>{const n=num(e.target.value);if(n!==null&&n>=0)setStyle({strokeWidth:n});}} data-testid="vector-stroke-width"/></label>
     <label className={label}>{t('vector.opacity')}<input className={field} type="number" min={0} max={1} step={0.05} value={op} onChange={e=>{const n=num(e.target.value);if(n!==null)setStyle({opacity:Math.min(1,Math.max(0,n))});}} data-testid="vector-opacity"/></label>
    </div></>}
  </section>
  <section className={section} data-testid="vector-arrange-panel"><h2 className="m-0 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{t('vector.arrange')}</h2>
   <div className="flex gap-1"><Button size="icon" disabled={!first} aria-label={t('vector.toFront')} onClick={()=>reorder('front')} data-testid="vector-to-front"><ToFrontIcon size={16}/></Button>
    <Button size="icon" disabled={!first} aria-label={t('vector.forward')} onClick={()=>reorder('forward')} data-testid="vector-forward"><ArrowUp size={16}/></Button>
    <Button size="icon" disabled={!first} aria-label={t('vector.backward')} onClick={()=>reorder('backward')} data-testid="vector-backward"><ArrowDown size={16}/></Button>
    <Button size="icon" disabled={!first} aria-label={t('vector.duplicate')} onClick={()=>duplicateSelection()} data-testid="vector-duplicate"><Copy size={16}/></Button></div></section>
  <section className={section} data-testid="vector-layers"><h2 className="m-0 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{t('vector.layers')} ({s.doc.paths.length})</h2>
   {s.doc.paths.length===0?<p className="m-0 text-ink-3">{t('vector.noLayers')}</p>:<ul className="m-0 flex list-none flex-col gap-0.5 p-0">
    {[...s.doc.paths].reverse().map(p=><li key={p.id} className={`flex items-center gap-1 rounded-sm px-1 ${s.selection.includes(p.id)?'bg-hover':''}`} data-testid="vector-layer">
     <Button size="row" aria-label={p.hidden?t('vector.show'):t('vector.hide')} onClick={()=>toggleHidden(p.id)}>{p.hidden?<EyeOff/>:<Eye/>}</Button>
     <button type="button" className="min-w-0 flex-1 truncate bg-transparent py-1 text-left text-ink" onClick={e=>select(e.shiftKey?[...new Set([...s.selection,p.id])]:[p.id])} onDoubleClick={()=>{const n=window.prompt(t('vector.rename'),p.name??'');if(n)renamePath(p.id,n);}}>{p.name??t('vector.path')}</button></li>)}</ul>}
  </section>
  <section className={section} data-testid="vector-page-panel"><h2 className="m-0 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{t('vector.page')}</h2>
   <div className="grid grid-cols-2 gap-2"><label className={label}>W<input className={field} type="number" min={1} max={16384} value={s.doc.width} onChange={e=>{const n=num(e.target.value);if(n)resizePage(n,s.doc.height);}} data-testid="vector-page-w"/></label>
    <label className={label}>H<input className={field} type="number" min={1} max={16384} value={s.doc.height} onChange={e=>{const n=num(e.target.value);if(n)resizePage(s.doc.width,n);}} data-testid="vector-page-h"/></label></div></section>
  <section className={section}><h2 className="m-0 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{t('vector.file')}</h2>
   <div className="flex flex-wrap gap-2">
    <Button variant="outline" size="compact" disabled={busy} onClick={()=>void pngExport()} data-testid="vector-export-png"><Download size={14}/>{t('vector.exportPng')}</Button>
    <Button variant="outline" size="compact" onClick={()=>{const input=document.createElement('input');input.type='file';input.accept='.svg,image/svg+xml';input.onchange=async()=>{const f=input.files?.[0];if(f)importSvgInto(await f.text());};input.click();}} data-testid="vector-append-svg">{t('vector.appendSvg')}</Button>
    {importActive&&<Button variant="outline" size="compact" onClick={()=>openActiveProjectSvg()} data-testid="vector-open-project-svg">{t('vector.openProjectSvg')}</Button>}</div>
   {note&&<p role="alert" className="m-0 text-danger">{note}</p>}
   {s.error&&<p role="alert" className="m-0 text-danger" data-testid="vector-error">{s.error}</p>}
   {s.diagnostics.length>0&&<ul className="m-0 list-disc pl-4 text-ink-2" data-testid="vector-diagnostics">{s.diagnostics.map((d,i)=><li key={i}>{d.severity}: {d.message}</li>)}</ul>}
  </section></aside>;}
