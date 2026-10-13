import {useEffect,useState} from 'react';
import {Button} from '../ui/button';
import {useT} from '../../lib/useT';
import {executeCommand} from '../../lib/commands';
import type {InspectorSectionProps,PanelHostProps} from '../../lib/shell/types';
import {usePanelState} from '../../store/panelStateStore';
import {useDesignState,selectArtboard,selectDesignNode} from '../../lib/design/session';
import {deleteDesignNodes,designRows,duplicateDesignNodes,patchDesignNodes,reorderDesignNode} from '../../lib/design/panelAdapter';
import {alignPatches,distributePatches,parseNumberField} from '../../lib/design/inspectorModel';
import {ARTBOARD_PRESETS,documentPalette,documentStats,presetFor} from '../../lib/design/artboards';
import {DesignLayersPanel} from './DesignLayersPanel';
import {DesignInspectorPanel} from './DesignInspectorPanel';
const run=(id:string,payload?:unknown)=>{void executeCommand(id,payload);};
const field='h-7 w-full rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink select-text aria-[invalid=true]:border-red-500';
const box='grid gap-2 p-3 text-xs text-ink-2';
const label=(key:string,fallback:string,t:(k:string)=>string)=>{const v=t(key);return v===key?fallback:v;};

/** Left panel: layer outline of the active artboard. */
export function LayersPanel(_:PanelHostProps){
 const s=useDesignState();const board=s.document?.artboards.find(a=>a.id===s.artboardId);const rows=designRows();
 return <aside className="panel sidebar min-h-0 overflow-auto" data-testid="design-shell-layers" aria-label="Layers">
  <DesignLayersPanel rows={rows} selectedIds={s.selectedIds} disabled={!board} onSelect={selectDesignNode}
   onRename={(id,name)=>patchDesignNodes(new Map([[id,{name}]]))} onToggleVisible={(id,visible)=>patchDesignNodes(new Map([[id,{visible}]]),true)}
   onToggleLocked={(id,locked)=>patchDesignNodes(new Map([[id,{locked}]]),true)} onReorder={reorderDesignNode} onDelete={deleteDesignNodes} onDuplicate={duplicateDesignNodes}/>
 </aside>;
}

function BoardName({id,name}:{id:string;name:string}){
 const {t}=useT();const [draft,setDraft]=useState<string|null>(null);
 const done=(save:boolean)=>{const n=(draft??'').trim();if(save&&n&&n!==name){selectArtboard(id);run('design.artboard.rename',{name:n});}setDraft(null);};
 if(draft===null)return <button type="button" className="min-w-0 flex-1 cursor-pointer truncate bg-transparent text-left text-xs text-ink" data-testid="design-board-name" title={t('design.artboards.rename')}
  onClick={()=>selectArtboard(id)} onDoubleClick={()=>setDraft(name)} onKeyDown={e=>{if(e.key==='F2'){e.preventDefault();setDraft(name);}}}>{name}</button>;
 return <input autoFocus value={draft} maxLength={200} aria-label={t('design.artboards.rename')} data-testid="design-board-name-input" className={field}
  onChange={e=>setDraft(e.currentTarget.value)} onBlur={()=>done(true)} onKeyDown={e=>{if(e.key==='Enter')done(true);else if(e.key==='Escape')done(false);}}/>;
}

/** Left panel: artboard list with add (blank or from a size preset), duplicate, delete and reorder. */
export function ArtboardsPanel(_:PanelHostProps){
 const {t}=useT();const s=useDesignState();const boards=s.document?.artboards??[];const idx=boards.findIndex(a=>a.id===s.artboardId);
 const [preset,setPreset]=useState('');
 return <aside className="panel sidebar min-h-0 overflow-auto" data-testid="design-artboards-panel" aria-label={t('design.rail.artboards')}>
  <section className={box}>
   <div className="flex items-center justify-end gap-2">
    <div className="flex gap-1">
     <Button size="compact" variant="ghost" disabled={!boards.length||boards.length>=100} data-testid="design-board-add" onClick={()=>run('design.artboard.add',preset?{preset}:undefined)}>{t('design.artboards.add')}</Button>
     <Button size="compact" variant="ghost" disabled={!boards.length||boards.length>=100} data-testid="design-board-duplicate" onClick={()=>run('design.artboard.duplicate')}>{t('design.artboards.duplicate')}</Button>
     <Button size="compact" variant="ghost" disabled={boards.length<2} data-testid="design-board-delete" onClick={()=>run('design.artboard.delete')}>{t('design.artboards.delete')}</Button>
    </div></div>
   <label className="grid gap-1">{t('design.artboards.newSize')}
    <select className={field} value={preset} aria-label={t('design.artboards.newSize')} data-testid="design-board-preset-new" onChange={e=>setPreset(e.currentTarget.value)}>
     <option value="">{t('design.artboards.blank')}</option>{ARTBOARD_PRESETS.map(p=><option key={p.id} value={p.id}>{label(`design.preset.${p.id}`,p.label,t)} ({p.width}x{p.height})</option>)}
    </select></label>
   {!boards.length?<p className="m-0 text-ink-3" data-testid="design-boards-empty">{t('design.artboards.empty')}</p>
    :<ul role="listbox" aria-label={t('design.rail.artboards')} className="m-0 grid list-none gap-0.5 p-0">
     {boards.map((a,i)=><li key={a.id} role="option" aria-selected={a.id===s.artboardId} data-testid="design-board-row" data-board-id={a.id} className={`flex items-center gap-1 rounded-sm px-1 py-0.5 ${a.id===s.artboardId?'bg-accent-soft':''}`}>
      <BoardName id={a.id} name={a.name}/>
      <span className="shrink-0 text-ink-3" data-testid="design-board-size">{a.width}x{a.height}</span>
      <span className="shrink-0 text-ink-3" title={t('design.artboards.layers')}>{a.nodes.length}</span>
      <Button size="row" variant="ghost" disabled={i===0} aria-label={`${t('design.artboards.moveUp')}: ${a.name}`} data-testid="design-board-up" onClick={()=>{selectArtboard(a.id);run('design.artboard.moveUp');}}>↑</Button>
      <Button size="row" variant="ghost" disabled={i===boards.length-1} aria-label={`${t('design.artboards.moveDown')}: ${a.name}`} data-testid="design-board-down" onClick={()=>{selectArtboard(a.id);run('design.artboard.moveDown');}}>↓</Button>
     </li>)}
    </ul>}
   {idx>=0&&<p className="m-0 text-ink-3">{t('design.artboards.position',{n:idx+1,total:boards.length})}</p>}
  </section>
 </aside>;
}

type Target='fill'|'stroke'|'background';
/** Left panel: colours used on the active artboard. A click applies a colour to the selection (fill or stroke) or the artboard background. */
export function ColorsPanel(_:PanelHostProps){
 const {t}=useT();const s=useDesignState();const board=s.document?.artboards.find(a=>a.id===s.artboardId);
 const [target,setTarget]=usePanelState<Target>('design.colors.target','fill');const [custom,setCustom]=useState('#7756e8');
 const palette=board?documentPalette(board):[];const noSel=target!=='background'&&!s.selectedIds.length;
 const targets:Target[]=['fill','stroke','background'];
 return <aside className="panel sidebar min-h-0 overflow-auto" data-testid="design-colors-panel" aria-label={t('design.rail.colors')}>
  <section className={box}>
   <div role="radiogroup" aria-label={t('design.colors.apply')} className="flex gap-1">
    {targets.map(x=><Button key={x} size="compact" variant={target===x?'outline':'ghost'} role="radio" aria-checked={target===x} data-testid={`design-colors-target-${x}`} onClick={()=>setTarget(x)}>{t(`design.colors.${x}`)}</Button>)}
   </div>
   {noSel&&<p className="m-0 text-ink-3" data-testid="design-colors-hint">{t('design.colors.selectFirst')}</p>}
   {!palette.length?<p className="m-0 text-ink-3">{t('design.colors.empty')}</p>
    :<ul className="m-0 grid list-none grid-cols-6 gap-1.5 p-0" aria-label={t('design.colors.used')}>
     {palette.map(p=><li key={p.color}><button type="button" data-testid="design-swatch" data-color={p.color} disabled={noSel} className="size-7 cursor-pointer rounded-sm border border-subtle disabled:cursor-not-allowed disabled:opacity-50" style={{background:p.color}}
      aria-label={`${t('design.colors.applyTo',{target:t(`design.colors.${target}`)})} ${p.color}`} title={`${p.color} (${p.uses})`} onClick={()=>run('design.color.apply',{target,color:p.color})}/></li>)}
    </ul>}
   <div className="flex items-center gap-2">
    <input type="color" style={{width:32,height:28,padding:0,flex:"none"}} value={custom} aria-label={t('design.colors.custom')} data-testid="design-colors-custom" className="h-7 w-8 shrink-0 cursor-pointer rounded-sm border border-subtle bg-transparent p-0" onChange={e=>setCustom(e.currentTarget.value)}/>
    <Button size="compact" variant="outline" disabled={noSel} data-testid="design-colors-apply" onClick={()=>run('design.color.apply',{target,color:custom})}>{t('design.colors.applyTo',{target:t(`design.colors.${target}`)})}</Button>
    {target!=='background'&&<Button size="compact" variant="ghost" disabled={noSel} data-testid="design-colors-clear" onClick={()=>run('design.color.apply',{target,color:null})}>{t('design.colors.none')}</Button>}
   </div>
  </section>
 </aside>;
}

/** Inspector: properties of the selected layers. */
export function SelectionSection(_:InspectorSectionProps){
 const s=useDesignState();const rows=designRows().filter(n=>s.selectedIds.includes(n.id));
 return <DesignInspectorPanel selection={rows} onChange={patch=>patchDesignNodes(new Map(s.selectedIds.map(id=>[id,patch])))}
  onAlign={kind=>patchDesignNodes(alignPatches(rows,kind))} onDistribute={axis=>patchDesignNodes(distributePatches(rows,axis))}/>;
}

/** Inspector: stacking order and nudge for the selection. */
export function ArrangeSection(_:InspectorSectionProps){
 const {t}=useT();const s=useDesignState();const [step,setStep]=useState('1');
 const rows=designRows().filter(n=>s.selectedIds.includes(n.id));const free=rows.some(r=>!r.locked);
 const n=parseNumberField(step,{min:0.01,max:1000});const d=n.ok?n.value:1;
 const stack=[['front','design.layer.front'],['forward','design.layer.forward'],['backward','design.layer.backward'],['back','design.layer.back']] as const;
 const arrows=[['←',-d,0,'left'],['→',d,0,'right'],['↑',0,-d,'up'],['↓',0,d,'down']] as const;
 return <section className={box} data-testid="design-section-arrange" aria-label={t('design.section.arrange')}>
  <div className="grid grid-cols-2 gap-1">{stack.map(([k,cmd])=><Button key={k} size="compact" variant="outline" disabled={!free} data-testid={`design-stack-${k}`} onClick={()=>run(cmd)}>{t(`design.arrange.${k}`)}</Button>)}</div>
  <div className="flex items-end gap-2">
   <label className="grid w-16 gap-1">{t('design.arrange.step')}<input className={field} inputMode="decimal" value={step} aria-invalid={n.ok?undefined:'true'} data-testid="design-nudge-step" onChange={e=>setStep(e.currentTarget.value)}/></label>
   <div className="flex gap-1">{arrows.map(([g,dx,dy,name])=><Button key={name} size="compact" variant="outline" disabled={!free||!n.ok} aria-label={t(`design.arrange.nudge.${name}`)} data-testid={`design-nudge-${name}`} onClick={()=>run('design.nudge',{dx,dy})}>{g}</Button>)}</div>
  </div>
  <div className="flex gap-1">
   <Button size="compact" variant="ghost" data-testid="design-toggle-visible" onClick={()=>run('design.layer.toggleVisible')}>{t('design.arrange.toggleVisible')}</Button>
   <Button size="compact" variant="ghost" data-testid="design-toggle-locked" onClick={()=>run('design.layer.toggleLocked')}>{t('design.arrange.toggleLocked')}</Button>
  </div>
 </section>;
}

function SizeField({id,label:text,value,onCommit}:{id:string;label:string;value:number;onCommit(v:number):void}){
 const {t}=useT();const shown=String(Math.round(value*100)/100);const [draft,setDraft]=useState(shown);const [bad,setBad]=useState<string|null>(null);
 useEffect(()=>{setDraft(shown);setBad(null);},[shown]);
 const commit=()=>{if(draft===shown){setBad(null);return;}const r=parseNumberField(draft,{min:1,max:16384});if(!r.ok){setBad(t(`design.inspector.invalid.${r.reason}`));return;}setBad(null);onCommit(r.value);};
 return <label className="grid gap-1">{text}
  <input className={field} inputMode="decimal" value={draft} aria-invalid={bad?'true':undefined} data-testid={`design-board-${id}`} onChange={e=>setDraft(e.currentTarget.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')commit();else if(e.key==='Escape'){setDraft(shown);setBad(null);}}}/>
  {bad&&<span role="alert" className="text-red-600" data-testid={`design-board-${id}-error`}>{bad}</span>}</label>;
}
/** Inspector: active artboard name, size, preset, orientation and background. */
export function ArtboardSection(_:InspectorSectionProps){
 const {t}=useT();const s=useDesignState();const board=s.document?.artboards.find(a=>a.id===s.artboardId);
 const [name,setName]=useState(board?.name??'');useEffect(()=>setName(board?.name??''),[board?.id,board?.name]);
 if(!board||!s.document)return null;
 const current=presetFor(board.width,board.height)??'';
 return <section className={box} data-testid="design-section-artboard" aria-label={t('design.section.artboard')}>
  <label className="grid gap-1">{t('design.artboards.active')}
   <select className={field} aria-label="Active artboard" value={board.id} data-testid="design-board-switch" onChange={e=>selectArtboard(e.currentTarget.value)}>{s.document.artboards.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
  <label className="grid gap-1">{t('design.artboards.name')}
   <input className={field} maxLength={200} value={name} aria-label="Artboard name" data-testid="design-board-name-field" onChange={e=>setName(e.currentTarget.value)} onBlur={()=>{const n=name.trim();if(n&&n!==board.name)run('design.artboard.rename',{name:n});else setName(board.name);}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/></label>
  <div className="grid grid-cols-2 gap-2">
   <SizeField id="width" label={t('design.inspector.width')} value={board.width} onCommit={width=>run('design.artboard.resize',{width,height:board.height})}/>
   <SizeField id="height" label={t('design.inspector.height')} value={board.height} onCommit={height=>run('design.artboard.resize',{width:board.width,height})}/>
  </div>
  <div className="flex items-end gap-2">
   <label className="grid min-w-0 flex-1 gap-1">{t('design.artboards.preset')}
    <select className={field} value={current} data-testid="design-board-preset" onChange={e=>{if(e.currentTarget.value)run('design.artboard.preset',{preset:e.currentTarget.value});}}>
     <option value="">{t('design.artboards.custom')}</option>{ARTBOARD_PRESETS.map(p=><option key={p.id} value={p.id}>{label(`design.preset.${p.id}`,p.label,t)}</option>)}</select></label>
   <Button size="compact" variant="outline" data-testid="design-board-rotate" onClick={()=>run('design.artboard.rotate')}>{t('design.artboards.rotate')}</Button>
  </div>
  <label className="flex items-center justify-between gap-2">{t('design.artboards.background')}
   <input type="color" style={{width:32,height:28,padding:0,flex:"none"}} aria-label="Artboard background" data-testid="design-board-background" value={board.background} onChange={e=>run('design.color.apply',{target:'background',color:e.currentTarget.value})}/></label>
 </section>;
}

/** Inspector: project name, counts and exports. */
export function ProjectSection(_:InspectorSectionProps){
 const {t}=useT();const s=useDesignState();const doc=s.document;
 const [name,setName]=useState(doc?.name??'');useEffect(()=>setName(doc?.name??''),[doc?.name]);
 if(!doc)return null;const st=documentStats(doc);
 return <section className={box} data-testid="design-section-project" aria-label={t('design.section.project')}>
  <label className="grid gap-1">{t('design.project.name')}
   <input className={field} maxLength={200} value={name} aria-label="Project name" data-testid="design-project-name" onChange={e=>setName(e.currentTarget.value)} onBlur={()=>{const n=name.trim();if(n&&n!==doc.name)run('design.rename',{name:n});else setName(doc.name);}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/></label>
  <p className="m-0 text-ink-3" data-testid="design-project-stats">{t('design.project.stats',{artboards:st.artboards,layers:st.layers,hidden:st.hidden,locked:st.locked})}</p>
  <div className="flex gap-1">
   <Button size="compact" variant="outline" data-testid="design-shell-export-project" onClick={()=>run('design.exportProject')}>{t('design.project.exportProject')}</Button>
   <Button size="compact" variant="outline" data-testid="design-shell-export-svg" onClick={()=>run('design.exportSvg')}>{t('design.project.exportSvg')}</Button>
  </div>
  <p className="m-0 text-ink-3">{t('design.project.note')}</p>
 </section>;
}
