import {VectorImportControls} from './VectorImportControls';
import {pngDimensions} from '../../lib/vectorstudio/exportFiles';
import {commandDispatcher} from '../../lib/commandDispatcher';
import {useState} from 'react';
import {Button} from '../ui/button';
import {Menu,MenuTrigger,MenuContent,MenuItem,MenuGroup,MenuGroupLabel,MenuSeparator} from '../ui/menu';
import {ALIGN_MODES,ALIGN_TARGETS} from '../../lib/vectorstudio/transforms';
import {BOOL_OPS} from '../../lib/vectorstudio/booleanOps';
import {layerRows} from '../../lib/vectorstudio/layerRows';
import {RADIUS_LIMITS} from '../../lib/vectorstudio/roundCorners';
import {exportAreaDoc,EXPORT_AREAS,PADDING_LIMITS,type ExportArea} from '../../lib/vectorstudio/exportArea';
import {SIMPLIFY_LIMITS} from '../../lib/vectorstudio/simplify';
import {OFFSET_LIMITS} from '../../lib/vectorstudio/offsetOps';
import {GRADIENT_KINDS,angleOf,hexOr} from '../../lib/vectorstudio/gradients';
import {gradientIdOf,BLEND_MODES} from '../../lib/vectorio';
import {DASH_PRESETS,dashArrayFor,dashPresetOf} from '../../lib/vectorstudio/strokeStyle';
import {useT} from '../../lib/useT';
import {executeCommand} from '../../lib/commands';
import {usePanelState} from '../../store/panelStateStore';
import {getVectorSession,useVectorSession} from '../../lib/vectorstudio/session';
import {boxOf} from '../../lib/vectorstudio/geometry';
import {VECTOR_TOOLS} from '../../lib/studios/vector';
import type {PanelHostProps} from '../../lib/shell/types';
import {NativeButton,NativeInput,NativeSelect} from '../ui/native-controls';
const field='h-8 w-full min-w-0 rounded-sm border border-line bg-elevated px-2 text-[12px] text-ink';
const row='grid gap-1 text-[11px] text-ink-3';
const run=(id:string,p?:unknown)=>void executeCommand('vector.'+id,p);
/** Persist filtering, not engine data. Hidden paths stay visible in this list so users can restore them. */
export function VectorLayersPanel({panelId,context}:PanelHostProps){
 const {t}=useT(),s=useVectorSession();const [filter,setFilter]=usePanelState(`${context.studio}.${panelId}.filter`,'');
 const [folded,setFolded]=usePanelState(`${context.studio}.${panelId}.folded`,'');const collapsed=new Set(folded.split(',').filter(Boolean));
 const rows=layerRows(s.doc.paths,p=>(p.name??t('vector.path')).toLocaleLowerCase().includes(filter.toLocaleLowerCase()),collapsed);
 return <div className="grid gap-2 p-2 text-[12px]" data-testid="vector-shell-layers">
  <NativeInput className={field} value={filter} onChange={e=>setFilter(e.target.value)} placeholder={t('vector.shell.filter')} aria-label={t('vector.shell.filter')}/>
  {!s.open?<p>{t('vector.shell.empty')}</p>:rows.length===0?<p className="text-ink-3">{t('vector.noLayers')}</p>:<ul className="m-0 grid list-none gap-1 p-0">{rows.map(row=>{if(row.kind==='group'){const open=!collapsed.has(row.group),all=row.ids.every(id=>s.selection.includes(id));return <li key={'g:'+row.group} data-testid="vector-layer-group" className={'flex flex-wrap items-center gap-1 rounded-sm p-1 '+(all?'bg-accent-soft':'')}>
   <Button size="compact" aria-expanded={open} aria-label={open?t('vector.shell.layers.collapse'):t('vector.shell.layers.expand')} onClick={()=>{const next=new Set(collapsed);if(open)next.add(row.group);else next.delete(row.group);setFolded([...next].join(','));}}>{open?'▾':'▸'}</Button>
   <NativeButton type="button" className="flex-1 whitespace-nowrap rounded-sm bg-transparent p-1 text-left font-medium hover:bg-hover" aria-pressed={all} onClick={()=>run('select',{ids:row.ids})}>{s.doc.groupNames?.[row.group]??t('vector.shell.layers.group')} ({row.ids.length}){row.clipped?' · '+t('vector.shell.layers.clipped'):''}</NativeButton>
   <Button size="compact" aria-pressed={row.locked} onClick={()=>run('toggleLocked',{id:row.ids[0]})}>{row.locked?t('vector.shell.unlock'):t('vector.shell.lock')}</Button>
   <Button size="compact" onClick={()=>run('ungroup',{ids:row.ids})}>{t('vector.shell.layers.ungroup')}</Button>
   <NativeInput className={field+' w-full'} key={row.group+':'+s.doc.groupNames?.[row.group]} defaultValue={s.doc.groupNames?.[row.group]??''} placeholder={t('vector.shell.layers.group')} aria-label={t('vector.shell.layers.renameGroup')} onBlur={e=>{if(e.target.value!==(s.doc.groupNames?.[row.group]??''))run('renameGroup',{group:row.group,name:e.target.value});}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/></li>;}
  const p=row.path;return <li key={p.id} className={'grid grid-cols-[1fr_auto] items-center gap-1 rounded-sm p-1 '+(row.indent?'ml-4 ':'')+(s.selection.includes(p.id)?'bg-accent-soft':'')}>
   <NativeButton type="button" className="truncate rounded-sm bg-transparent p-1 text-left hover:bg-hover" disabled={!!p.hidden||!!p.locked} aria-pressed={s.selection.includes(p.id)} onClick={e=>run('select',{ids:e.shiftKey?(s.selection.includes(p.id)?s.selection.filter(id=>id!==p.id):[...s.selection,p.id]):[p.id]})}>{p.name??t('vector.path')}</NativeButton>
   <span className="flex gap-1"><Button size="compact" aria-pressed={!!p.locked} onClick={()=>run('toggleLocked',{id:p.id})}>{p.locked?t('vector.shell.unlock'):t('vector.shell.lock')}</Button><Button size="compact" aria-label={p.hidden?t('vector.show'):t('vector.hide')} onClick={()=>run('toggleHidden',{id:p.id})}>{p.hidden?t('vector.show'):t('vector.hide')}</Button></span>
   <NativeInput className={field+' col-span-2'} key={p.id+':'+p.name} defaultValue={p.name??''} aria-label={t('vector.rename')} onBlur={e=>{if(e.target.value!==p.name)run('renamePath',{id:p.id,name:e.target.value});}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/>
  </li>;})}</ul>}
 </div>;
}
export function VectorToolsPanel(){const {t}=useT(),s=useVectorSession();return <div role="toolbar" aria-label={t('vector.toolbar')} className="grid grid-cols-2 gap-1 p-2" data-testid="vector-shell-tools">{VECTOR_TOOLS.map(tool=><Button key={tool} size="compact" disabled={!s.open} aria-pressed={s.tool===tool} className={s.tool===tool?'bg-accent-soft text-accent':''} onClick={()=>run('setTool',{tool})}>{t('vector.tool.'+tool)}</Button>)}</div>;}
export function VectorPageSection(){const {t}=useT(),s=useVectorSession();return <div className="grid grid-cols-2 gap-2" data-testid="vector-shell-page">{(['width','height'] as const).map(axis=><label className={row} key={axis}>{t('vector.shell.'+axis)}<NativeInput className={field} key={axis+s.doc[axis]} type="number" min={1} max={16384} defaultValue={s.doc[axis]} onBlur={e=>{const n=Number(e.target.value);if(Number.isInteger(n)&&n>0&&n<=16384&&n!==s.doc[axis])run('resizePage',{width:s.doc.width,height:s.doc.height,[axis]:n});else e.target.value=String(s.doc[axis]);}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/></label>)}<VectorImportControls/>{s.doc.guides&&<Button size="compact" className="col-span-2" onClick={()=>run('clearGuides')}>{t('vector.shell.clearGuides')}</Button>}</div>;}
export function VectorTransformSection(){const {t}=useT(),s=useVectorSession(),b=boxOf(s.doc.paths.filter(p=>s.selection.includes(p.id)));if(!b)return null;
 const values={x:b.minX,y:b.minY,w:b.maxX-b.minX,h:b.maxY-b.minY};return <div className="grid gap-2" data-testid="vector-shell-transform">
  <div className="grid grid-cols-2 gap-2">{(['x','y','w','h'] as const).map(axis=><label className={row} key={axis}>{axis==='w'?t('vector.shell.width'):axis==='h'?t('vector.shell.height'):axis.toUpperCase()}<NativeInput className={field} key={axis+values[axis]} type="number" step="any" min={axis==='w'||axis==='h'?0.001:undefined} defaultValue={+values[axis].toFixed(3)} onBlur={e=>{const n=Number(e.target.value);if(e.target.value!==''&&Number.isFinite(n)&&n!==values[axis]&&((axis==='x'||axis==='y')||n>0))run('setSelectionBounds',{[axis]:n});else e.target.value=String(values[axis]);}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/></label>)}</div>
  <label className={row}>{t('vector.shell.rotate')}<NativeInput className={field} type="number" defaultValue={0} onBlur={e=>{const n=Number(e.target.value);if(Number.isFinite(n)&&n)run('rotateSelection',{degrees:n});e.target.value='0';}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/></label>
  <div className="flex flex-wrap gap-1">{(['horizontal','vertical'] as const).map(axis=><Button key={axis} size="compact" onClick={()=>run('flipSelection',{axis})}>{t('vector.shell.flip.'+axis)}</Button>)}</div>
  <Menu><MenuTrigger render={<Button size="compact" variant="outline" data-testid="vector-align-menu">{t('vector.shell.align')}</Button>}/>
   <MenuContent>{ALIGN_TARGETS.map(to=><MenuGroup key={to}><MenuGroupLabel>{t('vector.shell.align.'+to)}</MenuGroupLabel>{ALIGN_MODES.map(mode=><MenuItem key={mode} onClick={()=>run('alignSelection',{mode,to})}>{t('vector.shell.align.'+mode)}</MenuItem>)}<MenuSeparator/></MenuGroup>)}
    <MenuGroup><MenuGroupLabel>{t('vector.shell.distribute')}</MenuGroupLabel>{(['horizontal','vertical'] as const).map(axis=><MenuItem key={axis} onClick={()=>run('distributeSelection',{axis})}>{t('vector.shell.distribute.'+axis)}</MenuItem>)}</MenuGroup></MenuContent></Menu>
  <div className="grid grid-cols-2 gap-1"><Button size="compact" data-testid="vector-join" onClick={()=>run('joinPaths')}>{t('vector.shell.join')}</Button><Button size="compact" data-testid="vector-reverse" onClick={()=>run('reversePath')}>{t('vector.shell.reverse')}</Button></div>
  <RoundControls/>
  <SimplifyControls/>
  <OffsetControls/>
  <Menu><MenuTrigger render={<Button size="compact" variant="outline" data-testid="vector-combine-menu">{t('vector.shell.combine')}</Button>}/>
   <MenuContent>{BOOL_OPS.map(o=><MenuItem key={o} onClick={()=>run('booleanOp',{op:o})}>{t('vector.shell.combine.'+o)}</MenuItem>)}</MenuContent></Menu>
  <div className="grid grid-cols-2 gap-1"><Button size="compact" data-testid="vector-group" onClick={()=>run('group')}>{t('vector.shell.group')}</Button><Button size="compact" data-testid="vector-ungroup" onClick={()=>run('ungroup')}>{t('vector.shell.ungroup')}</Button></div>
  <div className="grid grid-cols-2 gap-1" data-testid="vector-copystyle"><Button size="compact" onClick={()=>run('copyStyle')}>{t('vector.shell.copyStyle')}</Button><Button size="compact" onClick={()=>run('pasteStyle')}>{t('vector.shell.pasteStyle')}</Button></div>
  <div className="grid grid-cols-2 gap-1" data-testid="vector-clip"><Button size="compact" onClick={()=>run('makeClip')}>{t('vector.shell.makeClip')}</Button><Button size="compact" onClick={()=>run('releaseClip')}>{t('vector.shell.releaseClip')}</Button></div>
  <div className="grid grid-cols-2 gap-1">{(['front','back','forward','backward'] as const).map(mode=><Button key={mode} size="compact" onClick={()=>run('reorder',{mode})}>{t(mode==='front'?'vector.toFront':mode==='back'?'vector.shell.toBack':'vector.'+mode)}</Button>)}
   <Button size="compact" onClick={()=>run('duplicateSelection')}>{t('vector.duplicate')}</Button><Button size="compact" onClick={()=>run('deleteSelection')}>{t('vector.shell.delete')}</Button></div>
 </div>;
}
function SimplifyControls(){
 const {t}=useT();const [amount,setAmount]=useState('1');const n=Number(amount),ok=amount.trim()!==''&&Number.isFinite(n)&&n>=SIMPLIFY_LIMITS.min&&n<=SIMPLIFY_LIMITS.max;
 return <div className="grid grid-cols-[1fr_auto] items-end gap-1" data-testid="vector-simplify"><label className={row}>{t('vector.shell.tolerance')}<NativeInput className={field} type="number" min={SIMPLIFY_LIMITS.min} step="any" value={amount} aria-invalid={!ok} onChange={e=>setAmount(e.target.value)}/></label>
  <Button size="compact" disabled={!ok} onClick={()=>run('simplifyPath',{tolerance:n})}>{t('vector.shell.simplify')}</Button></div>;
}
function RoundControls(){
 const {t}=useT();const [amount,setAmount]=useState('8');const n=Number(amount),ok=amount.trim()!==''&&Number.isFinite(n)&&n>=RADIUS_LIMITS.min&&n<=RADIUS_LIMITS.max;
 return <div className="grid grid-cols-[1fr_auto] items-end gap-1" data-testid="vector-round"><label className={row}>{t('vector.shell.radius')}<NativeInput className={field} type="number" min={RADIUS_LIMITS.min} step="any" value={amount} aria-invalid={!ok} onChange={e=>setAmount(e.target.value)}/></label>
  <Button size="compact" disabled={!ok} onClick={()=>run('roundCorners',{radius:n})}>{t('vector.shell.roundCorners')}</Button></div>;
}
function OffsetControls(){
 const {t}=useT();const [amount,setAmount]=useState('4');const n=Number(amount),ok=amount.trim()!==''&&Number.isFinite(n)&&Math.abs(n)>=OFFSET_LIMITS.min&&Math.abs(n)<=OFFSET_LIMITS.max;
 return <div className="grid gap-1" data-testid="vector-offset"><label className={row}>{t('vector.shell.offset')}<NativeInput className={field} type="number" step="any" value={amount} aria-invalid={!ok} onChange={e=>setAmount(e.target.value)}/></label>
  <div className="grid grid-cols-2 gap-1"><Button size="compact" disabled={!ok} onClick={()=>run('offsetPath',{distance:n})}>{t('vector.shell.offset.apply')}</Button><Button size="compact" onClick={()=>run('outlineStroke')}>{t('vector.shell.outlineStroke')}</Button></div></div>;
}
function GradientControls(){
 const {t}=useT(),s=useVectorSession(),first=s.doc.paths.find(p=>s.selection.includes(p.id));if(!first)return null;
 const gid=gradientIdOf(first.style?.fill),g=gid?s.doc.gradients?.find(x=>x.id===gid):undefined,kind=g?g.kind:'none';
 const hex=hexOr;
 return <div className="grid gap-2" data-testid="vector-gradient">
  <label className={row}>{t('vector.shell.gradient')}<NativeSelect className={field} value={kind} data-testid="vector-gradient-kind" onChange={e=>run('setGradient',{kind:e.target.value})}>{GRADIENT_KINDS.map(k=><option key={k} value={k}>{t('vector.shell.gradient.kind.'+k)}</option>)}</NativeSelect></label>
  {g&&<div className="grid grid-cols-3 gap-2">
   <label className={row}>{t('vector.shell.gradient.start')}<NativeInput className={field} type="color" key={'a'+g.id+g.stops[0].color} defaultValue={hex(g.stops[0].color)} onBlur={e=>{if(e.target.value.toLowerCase()!==hex(g.stops[0].color).toLowerCase())run('setGradient',{startColor:e.target.value});}}/></label>
   <label className={row}>{t('vector.shell.gradient.end')}<NativeInput className={field} type="color" key={'b'+g.id+g.stops[g.stops.length-1].color} defaultValue={hex(g.stops[g.stops.length-1].color)} onBlur={e=>{if(e.target.value.toLowerCase()!==hex(g.stops[g.stops.length-1].color).toLowerCase())run('setGradient',{endColor:e.target.value});}}/></label>
   {g.kind==='linear'&&<label className={row}>{t('vector.shell.gradient.angle')}<NativeInput className={field} type="number" min={0} max={360} step={15} key={'c'+g.id} defaultValue={angleOf(g)} onBlur={e=>{const n=Number(e.target.value);if(e.target.value!==''&&Number.isFinite(n)&&n>=0&&n<=360)run('setGradient',{angle:n});else e.target.value=String(angleOf(g));}}/></label>}
  </div>}
 </div>;
}
export function VectorStyleSection(){const {t}=useT(),s=useVectorSession();const first=s.doc.paths.find(p=>s.selection.includes(p.id));if(!first)return null;const style=first.style??{};
 return <div className="grid gap-2" data-testid="vector-shell-style"><p className="m-0 text-[11px] text-ink-3">{t('vector.shell.styleHint')}</p>
  {(['fill','stroke'] as const).map(key=><label key={key} className={row}>{t('vector.'+key)}<div className="flex gap-1"><NativeInput className={field} key={key+style[key]} defaultValue={key==='fill'&&gradientIdOf(style.fill)?t('vector.shell.gradient.kind.gradient'):style[key]??(key==='fill'?'#000000':'none')} aria-label={t('vector.'+key)} onBlur={e=>{const v=e.target.value.trim();if(v==='none'||/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v))run('setStyle',{patch:{[key]:v}});else e.target.value=style[key]??'none';}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/><Button size="compact" onClick={()=>run('setStyle',{patch:{[key]:'none'}})}>{t('vector.none')}</Button></div></label>)}
  <GradientControls/>
  <div className="grid grid-cols-2 gap-2">{(['strokeWidth','opacity'] as const).map(key=><label className={row} key={key}>{t('vector.'+key)}<NativeInput className={field} key={key+style[key]} type="number" min={0} max={key==='opacity'?1:undefined} step={key==='opacity'?0.05:0.5} defaultValue={style[key]??1} onBlur={e=>{const n=Number(e.target.value);if(e.target.value!==''&&Number.isFinite(n)&&n>=0&&(key!=='opacity'||n<=1))run('setStyle',{patch:{[key]:n}});else e.target.value=String(style[key]??1);}}/></label>)}</div>
  {(['lineCap','lineJoin','fillRule'] as const).map(key=><label className={row} key={key}>{t('vector.shell.'+key)}<NativeSelect className={field} value={style[key]??(key==='lineCap'?'butt':key==='lineJoin'?'miter':'nonzero')} onChange={e=>run('setStyle',{patch:{[key]:e.target.value}})}>{(key==='lineCap'?['butt','round','square']:key==='lineJoin'?['miter','round','bevel']:['nonzero','evenodd']).map(v=><option key={v} value={v}>{t('vector.shell.option.'+v)}</option>)}</NativeSelect></label>)}
  <label className={row}>{t('vector.shell.blendMode')}<NativeSelect className={field} value={style.blendMode??'normal'} onChange={e=>run('setStyle',{patch:{blendMode:e.target.value}})}>{BLEND_MODES.map(v=><option key={v} value={v}>{t('vector.shell.blend.'+v)}</option>)}</NativeSelect></label>
  <label className={row}>{t('vector.shell.dash')}<NativeSelect className={field} value={dashPresetOf(style.dashArray,style.strokeWidth??1)} onChange={e=>{if(e.target.value!=='custom')run('setStyle',{patch:{dashArray:dashArrayFor(e.target.value as never,style.strokeWidth??1)}});}}>{[...DASH_PRESETS,...(dashPresetOf(style.dashArray,style.strokeWidth??1)==='custom'?['custom' as const]:[])].map(v=><option key={v} value={v}>{t('vector.shell.dash.'+v)}</option>)}</NativeSelect></label>
  <div className="grid grid-cols-2 gap-2">{([['dashOffset',0,undefined,0.5,0],['miterLimit',1,undefined,0.5,4],['fillOpacity',0,1,0.05,1],['strokeOpacity',0,1,0.05,1]] as const).map(([key,min,max,step,dflt])=><label className={row} key={key}>{t('vector.shell.'+key)}<NativeInput className={field} key={key+style[key]} type="number" min={key==='dashOffset'?undefined:min} max={max} step={step} defaultValue={style[key]??dflt} onBlur={e=>{const n=Number(e.target.value);if(e.target.value!==''&&Number.isFinite(n)&&(key==='dashOffset'||n>=min)&&(max===undefined||n<=max))run('setStyle',{patch:{[key]:n}});else e.target.value=String(style[key]??dflt);}}/></label>)}</div>
 </div>;
}
export function VectorNodeSection(){const {t}=useT(),s=useVectorSession(),path=s.doc.paths.find(p=>p.id===s.nodePath),node=path?.nodes.find(n=>n.id===s.selectedNode);if(!path||!node)return null;return <div className="grid gap-2" data-testid="vector-shell-node">
 <div className="grid grid-cols-2 gap-2">{(['x','y'] as const).map(axis=><label className={row} key={axis}>{axis.toUpperCase()}<NativeInput className={field} key={node.id+axis+node[axis]} type="number" step="any" defaultValue={node[axis]} onBlur={e=>{const n=Number(e.target.value);if(e.target.value!==''&&Number.isFinite(n)&&n!==node[axis])run('moveNode',{pathId:path.id,nodeId:node.id,to:{x:node.x,y:node.y,[axis]:n}});}}/></label>)}</div>
 <div className="flex flex-wrap gap-1">{(['corner','smooth','symmetric'] as const).map(kind=><Button size="compact" key={kind} aria-pressed={node.kind===kind} onClick={()=>run('setNodeKind',{pathId:path.id,nodeId:node.id,kind})}>{t('vector.shell.'+kind)}</Button>)}
 <Button size="compact" onClick={()=>run('toggleClosed',{pathId:path.id})}>{t(path.closed?'vector.shell.openPath':'vector.shell.closePath')}</Button><Button size="compact" data-testid="vector-split" onClick={()=>run('splitPath',{pathId:path.id,nodeId:node.id})}>{t('vector.shell.split')}</Button><Button size="compact" onClick={()=>run('deleteNode',{pathId:path.id,nodeId:node.id})}>{t('vector.shell.delete')}</Button></div>
 </div>;}
export function VectorExportPanel(){const {t}=useT(),s=useVectorSession();const [scale,setScale]=useState(1),[format,setFormat]=useState('svg'),[busy,setBusy]=useState(false),[note,setNote]=useState('');
 const [area,setArea]=useState<ExportArea>('page'),[pad,setPad]=useState('0'),[bg,setBg]=useState<'transparent'|'white'>('transparent');
 const padN=Number(pad),padOk=pad.trim()!==''&&Number.isFinite(padN)&&padN>=PADDING_LIMITS.min&&padN<=PADDING_LIMITS.max;
 const areaDoc=(()=>{try{return padOk?exportAreaDoc(s.doc,s.selection,area,padN):null;}catch{return null;}})();
 const dimensions=areaDoc?pngDimensions(areaDoc.width,areaDoc.height,scale):null;
 const submit=async()=>{setBusy(true);setNote('');try{await commandDispatcher.runCommand(format==='svg'?'vector.exportSvg':'vector.exportPng',format==='png'?{scale,area,padding:padN,background:bg}:{area,padding:padN},{origin:'ui'});}catch(e){setNote(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
 return <div className="grid gap-2 p-2 text-[12px]" data-testid="vector-shell-export">
 <p className="m-0 text-ink-3">{t('vector.hero.page')}</p>
 <label className={row}>{t('vector.hero.format')}<NativeSelect className={field} value={format} disabled={busy} onChange={e=>setFormat(e.target.value)}><option value="svg">SVG</option><option value="png">PNG</option></NativeSelect></label>
 <label className={row}>{t('vector.shell.exportArea')}<NativeSelect className={field} value={area} disabled={busy} onChange={e=>setArea(e.target.value as ExportArea)}>{EXPORT_AREAS.map(a=><option key={a} value={a}>{t('vector.shell.area.'+a)}</option>)}</NativeSelect></label>
 {area!=='page'&&<label className={row}>{t('vector.shell.padding')}<NativeInput className={field} type="number" min={PADDING_LIMITS.min} max={PADDING_LIMITS.max} step="any" value={pad} disabled={busy} aria-invalid={!padOk} onChange={e=>setPad(e.target.value)}/></label>}
 {format==='png'&&<><label className={row}>{t('vector.shell.pngBackground')}<NativeSelect className={field} value={bg} disabled={busy} onChange={e=>setBg(e.target.value as 'transparent'|'white')}><option value="transparent">{t('vector.shell.bg.transparent')}</option><option value="white">{t('vector.shell.bg.white')}</option></NativeSelect></label><label className={row}>{t('vector.shell.pngScale')}<NativeSelect className={field} value={scale} disabled={busy} onChange={e=>setScale(Number(e.target.value))}>{[1,2,4].map(n=><option key={n} value={n}>{n}x</option>)}</NativeSelect></label>
 <p className="m-0 text-ink-3" data-testid="vector-export-dimensions">{dimensions?`${dimensions.width} × ${dimensions.height} px`:t('vector.shell.exportEmpty')}</p><p className="m-0 text-ink-3">{t('vector.shell.pngLimit')}</p></>}
 <Button size="compact" disabled={!s.open||busy||!areaDoc} onClick={()=>void submit()}>{format==='svg'?t('vector.shell.exportSvg'):t('vector.exportPng')}</Button>
 <hr className="w-full border-line"/>
 <label className={row}>{t('vector.appendSvg')}<NativeInput type="file" accept=".svg,image/svg+xml" disabled={!s.open||busy} className="w-full text-[11px]" onChange={async e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;setBusy(true);setNote('');try{const before=getVectorSession().doc;const source=await f.text();if(getVectorSession().doc===before)await executeCommand('vector.importSvg',{source});else setNote(t('vector.shell.importChanged'));}catch{setNote(t('vector.shell.importFailed'));}finally{setBusy(false);}}}/></label>
 {note&&<p role="status" className="text-ink-3">{note}</p>}{s.error&&<p role="alert" className="text-danger">{s.error}</p>}{s.diagnostics.length>0&&<ul className="m-0 list-disc pl-4">{s.diagnostics.map((d,i)=><li key={i}>{d.message}</li>)}</ul>}
 {(s.error||s.diagnostics.length>0)&&<Button size="compact" onClick={()=>run('clearError')}>{t('vector.shell.clear')}</Button>}
 </div>;}
