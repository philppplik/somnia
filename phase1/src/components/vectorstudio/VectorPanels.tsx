import {useState} from 'react';
import {Button} from '../ui/button';
import {useT} from '../../lib/useT';
import {executeCommand} from '../../lib/commands';
import {usePanelState} from '../../store/panelStateStore';
import {getVectorSession,useVectorSession} from '../../lib/vectorstudio/session';
import {boxOf} from '../../lib/vectorstudio/geometry';
import {VECTOR_TOOLS} from '../../lib/studios/vector';
import type {PanelHostProps} from '../../lib/shell/types';
const field='h-8 w-full min-w-0 rounded-sm border border-line bg-elevated px-2 text-[12px] text-ink';
const row='grid gap-1 text-[11px] text-ink-3';
const run=(id:string,p?:unknown)=>void executeCommand('vector.'+id,p);
/** Persist filtering, not engine data. Hidden paths stay visible in this list so users can restore them. */
export function VectorLayersPanel({panelId,context}:PanelHostProps){
 const {t}=useT(),s=useVectorSession();const [filter,setFilter]=usePanelState(`${context.studio}.${panelId}.filter`,'');
 const paths=[...s.doc.paths].reverse().filter(p=>(p.name??t('vector.path')).toLocaleLowerCase().includes(filter.toLocaleLowerCase()));
 return <div className="grid gap-2 p-2 text-[12px]" data-testid="vector-shell-layers">
  <input className={field} value={filter} onChange={e=>setFilter(e.target.value)} placeholder={t('vector.shell.filter')} aria-label={t('vector.shell.filter')}/>
  {!s.open?<p>{t('vector.shell.empty')}</p>:paths.length===0?<p className="text-ink-3">{t('vector.noLayers')}</p>:<ul className="m-0 grid list-none gap-1 p-0">{paths.map(p=><li key={p.id} className={'grid grid-cols-[1fr_auto] items-center gap-1 rounded-sm p-1 '+(s.selection.includes(p.id)?'bg-accent-soft':'')}>
   <button type="button" className="truncate rounded-sm bg-transparent p-1 text-left hover:bg-hover" disabled={!!p.hidden} aria-pressed={s.selection.includes(p.id)} onClick={e=>run('select',{ids:e.shiftKey?(s.selection.includes(p.id)?s.selection.filter(id=>id!==p.id):[...s.selection,p.id]):[p.id]})}>{p.name??t('vector.path')}</button>
   <Button size="compact" aria-label={p.hidden?t('vector.show'):t('vector.hide')} onClick={()=>run('toggleHidden',{id:p.id})}>{p.hidden?t('vector.show'):t('vector.hide')}</Button>
   <input className={field+' col-span-2'} key={p.id+':'+p.name} defaultValue={p.name??''} aria-label={t('vector.rename')} onBlur={e=>{if(e.target.value!==p.name)run('renamePath',{id:p.id,name:e.target.value});}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/>
  </li>)}</ul>}
 </div>;
}
export function VectorToolsPanel(){const {t}=useT(),s=useVectorSession();return <div role="toolbar" aria-label={t('vector.toolbar')} className="grid grid-cols-2 gap-1 p-2" data-testid="vector-shell-tools">{VECTOR_TOOLS.map(tool=><Button key={tool} size="compact" disabled={!s.open} aria-pressed={s.tool===tool} className={s.tool===tool?'bg-accent-soft text-accent':''} onClick={()=>run('setTool',{tool})}>{t('vector.tool.'+tool)}</Button>)}</div>;}
export function VectorPageSection(){const {t}=useT(),s=useVectorSession();return <div className="grid grid-cols-2 gap-2" data-testid="vector-shell-page">{(['width','height'] as const).map(axis=><label className={row} key={axis}>{t('vector.shell.'+axis)}<input className={field} key={axis+s.doc[axis]} type="number" min={1} max={16384} defaultValue={s.doc[axis]} onBlur={e=>{const n=Number(e.target.value);if(Number.isInteger(n)&&n>0&&n<=16384&&n!==s.doc[axis])run('resizePage',{width:s.doc.width,height:s.doc.height,[axis]:n});else e.target.value=String(s.doc[axis]);}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/></label>)}</div>;}
export function VectorTransformSection(){const {t}=useT(),s=useVectorSession(),b=boxOf(s.doc.paths.filter(p=>s.selection.includes(p.id)));if(!b)return null;
 const values={x:b.minX,y:b.minY,w:b.maxX-b.minX,h:b.maxY-b.minY};return <div className="grid gap-2" data-testid="vector-shell-transform">
  <div className="grid grid-cols-2 gap-2">{(['x','y','w','h'] as const).map(axis=><label className={row} key={axis}>{axis==='w'?t('vector.shell.width'):axis==='h'?t('vector.shell.height'):axis.toUpperCase()}<input className={field} key={axis+values[axis]} type="number" step="any" min={axis==='w'||axis==='h'?0.001:undefined} defaultValue={+values[axis].toFixed(3)} onBlur={e=>{const n=Number(e.target.value);if(e.target.value!==''&&Number.isFinite(n)&&n!==values[axis]&&((axis==='x'||axis==='y')||n>0))run('setSelectionBounds',{[axis]:n});else e.target.value=String(values[axis]);}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/></label>)}</div>
  <label className={row}>{t('vector.shell.rotate')}<input className={field} type="number" defaultValue={0} onBlur={e=>{const n=Number(e.target.value);if(Number.isFinite(n)&&n)run('rotateSelection',{degrees:n});e.target.value='0';}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/></label>
  <div className="flex flex-wrap gap-1">{(['horizontal','vertical'] as const).map(axis=><Button key={axis} size="compact" onClick={()=>run('flipSelection',{axis})}>{t('vector.shell.flip.'+axis)}</Button>)}</div>
  <div className="grid grid-cols-2 gap-1">{(['front','back','forward','backward'] as const).map(mode=><Button key={mode} size="compact" onClick={()=>run('reorder',{mode})}>{t(mode==='front'?'vector.toFront':mode==='back'?'vector.shell.toBack':'vector.'+mode)}</Button>)}
   <Button size="compact" onClick={()=>run('duplicateSelection')}>{t('vector.duplicate')}</Button><Button size="compact" onClick={()=>run('deleteSelection')}>{t('vector.shell.delete')}</Button></div>
 </div>;
}
export function VectorStyleSection(){const {t}=useT(),s=useVectorSession();const first=s.doc.paths.find(p=>s.selection.includes(p.id));if(!first)return null;const style=first.style??{};
 return <div className="grid gap-2" data-testid="vector-shell-style"><p className="m-0 text-[11px] text-ink-3">{t('vector.shell.styleHint')}</p>
  {(['fill','stroke'] as const).map(key=><label key={key} className={row}>{t('vector.'+key)}<div className="flex gap-1"><input className={field} key={key+style[key]} defaultValue={style[key]??(key==='fill'?'#000000':'none')} aria-label={t('vector.'+key)} onBlur={e=>{const v=e.target.value.trim();if(v==='none'||/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v))run('setStyle',{patch:{[key]:v}});else e.target.value=style[key]??'none';}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/><Button size="compact" onClick={()=>run('setStyle',{patch:{[key]:'none'}})}>{t('vector.none')}</Button></div></label>)}
  <div className="grid grid-cols-2 gap-2">{(['strokeWidth','opacity'] as const).map(key=><label className={row} key={key}>{t('vector.'+key)}<input className={field} key={key+style[key]} type="number" min={0} max={key==='opacity'?1:undefined} step={key==='opacity'?0.05:0.5} defaultValue={style[key]??1} onBlur={e=>{const n=Number(e.target.value);if(e.target.value!==''&&Number.isFinite(n)&&n>=0&&(key!=='opacity'||n<=1))run('setStyle',{patch:{[key]:n}});else e.target.value=String(style[key]??1);}}/></label>)}</div>
  {(['lineCap','lineJoin','fillRule'] as const).map(key=><label className={row} key={key}>{t('vector.shell.'+key)}<select className={field} value={style[key]??(key==='lineCap'?'butt':key==='lineJoin'?'miter':'nonzero')} onChange={e=>run('setStyle',{patch:{[key]:e.target.value}})}>{(key==='lineCap'?['butt','round','square']:key==='lineJoin'?['miter','round','bevel']:['nonzero','evenodd']).map(v=><option key={v} value={v}>{t('vector.shell.option.'+v)}</option>)}</select></label>)}
 </div>;
}
export function VectorNodeSection(){const {t}=useT(),s=useVectorSession(),path=s.doc.paths.find(p=>p.id===s.nodePath),node=path?.nodes.find(n=>n.id===s.selectedNode);if(!path||!node)return null;return <div className="grid gap-2" data-testid="vector-shell-node">
 <div className="grid grid-cols-2 gap-2">{(['x','y'] as const).map(axis=><label className={row} key={axis}>{axis.toUpperCase()}<input className={field} key={node.id+axis+node[axis]} type="number" step="any" defaultValue={node[axis]} onBlur={e=>{const n=Number(e.target.value);if(e.target.value!==''&&Number.isFinite(n)&&n!==node[axis])run('moveNode',{pathId:path.id,nodeId:node.id,to:{x:node.x,y:node.y,[axis]:n}});}}/></label>)}</div>
 <div className="flex flex-wrap gap-1">{(['corner','smooth','symmetric'] as const).map(kind=><Button size="compact" key={kind} aria-pressed={node.kind===kind} onClick={()=>run('setNodeKind',{pathId:path.id,nodeId:node.id,kind})}>{t('vector.shell.'+kind)}</Button>)}
 <Button size="compact" onClick={()=>run('toggleClosed',{pathId:path.id})}>{t(path.closed?'vector.shell.openPath':'vector.shell.closePath')}</Button><Button size="compact" onClick={()=>run('deleteNode',{pathId:path.id,nodeId:node.id})}>{t('vector.shell.delete')}</Button></div>
 </div>;}
export function VectorExportPanel(){const {t}=useT(),s=useVectorSession();const [scale,setScale]=useState(1),[busy,setBusy]=useState(false),[note,setNote]=useState('');
 return <div className="grid gap-2 p-2 text-[12px]" data-testid="vector-shell-export"><label className={row}>{t('vector.shell.pngScale')}<select className={field} value={scale} onChange={e=>setScale(Number(e.target.value))}>{[1,2,4].map(n=><option key={n} value={n}>{n}x</option>)}</select></label>
 <Button size="compact" disabled={!s.open||busy} onClick={()=>run('exportSvg')}>{t('vector.shell.exportSvg')}</Button>
 <Button size="compact" disabled={!s.open||busy} onClick={async()=>{setBusy(true);try{await executeCommand('vector.exportPng',{scale});}finally{setBusy(false);}}}>{t('vector.exportPng')}</Button>
 <p className="m-0 text-ink-3">{t('vector.shell.pngLimit')}</p>
 <label className={row}>{t('vector.appendSvg')}<input type="file" accept=".svg,image/svg+xml" disabled={!s.open||busy} className="w-full text-[11px]" onChange={async e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;setBusy(true);setNote('');try{const before=getVectorSession().doc;const source=await f.text();if(getVectorSession().doc===before)await executeCommand('vector.importSvg',{source});else setNote(t('vector.shell.importChanged'));}catch{setNote(t('vector.shell.importFailed'));}finally{setBusy(false);}}}/></label>
 {note&&<p role="status" className="text-ink-3">{note}</p>}{s.error&&<p role="alert" className="text-danger">{s.error}</p>}{s.diagnostics.length>0&&<ul className="m-0 list-disc pl-4">{s.diagnostics.map((d,i)=><li key={i}>{d.message}</li>)}</ul>}
 {(s.error||s.diagnostics.length>0)&&<Button size="compact" onClick={()=>run('clearError')}>{t('vector.shell.clear')}</Button>}
 </div>;}
