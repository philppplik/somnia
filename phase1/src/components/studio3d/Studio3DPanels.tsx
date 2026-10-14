import {useState} from 'react';
import {patchStudio3D} from '../../lib/studio3d/session';
import type {ObjectInfo} from '../../lib/studio3d/stage';
import {executeCommand} from '../../lib/commands';
import {useT} from '../../lib/useT';
import {formatBytes} from '../../lib/media';
import {useStudio3D} from '../../lib/studio3d/session';
import {formatCount,boundsSize,GIZMO_MODES,ENV_PRESETS,ENV_ACCEPT,UNIT_IDS} from '../../lib/studio3d/model';
import type {PanelHostProps,InspectorSectionProps} from '../../lib/shell/types';
import {Input} from '../ui/input';
import {Button} from '../ui/button';
const PRIMS=['cube','sphere','plane','cylinder','cone','torus'] as const;
const LIGHTS=['directional','point','spot','area'] as const;
const Row=({k,v}:{k:string;v:string|number})=><div className="flex justify-between gap-3 text-xs"><dt className="text-ink-3">{k}</dt><dd className="m-0 truncate text-ink-2" title={String(v)}>{v}</dd></div>;
const fmt=(n:number)=>(Math.abs(n)>=100?n.toFixed(0):Math.abs(n)>=10?n.toFixed(1):n.toFixed(2));
/** Outliner: every node of the opened model, filterable, click to select. */
export function ScenePanel(_:PanelHostProps){
 const {t}=useT();const s=useStudio3D();const [filter,setFilter]=useState('');
 const rows=s.outline.filter(o=>o.name.toLowerCase().includes(filter.toLowerCase()));
 return <div className="grid gap-2 p-3" data-testid="studio3d-scene-panel">
  <div className="flex flex-wrap gap-1" role="group" aria-label={t('studio3d.insert.group')} data-testid="studio3d-insert">
   {PRIMS.map(k=><Button key={k} variant="outline" onClick={()=>void executeCommand('studio3d.insert.primitive',{kind:k})}>{t('studio3d.insert.'+k)}</Button>)}
   {LIGHTS.map(k=><Button key={k} variant="outline" onClick={()=>void executeCommand('studio3d.insert.light',{kind:k})}>{t('studio3d.insert.'+k)}</Button>)}
   <Button variant="outline" onClick={()=>void executeCommand('studio3d.insert.camera',{})}>{t('studio3d.insert.camera')}</Button>
   <Button variant="outline" onClick={()=>void executeCommand('studio3d.insert.camera',{fromView:true})}>{t('studio3d.insert.camera.view')}</Button>
  </div>
  <div className="flex flex-wrap gap-1" role="group" aria-label={t('studio3d.gizmo.group')} data-testid="studio3d-gizmo">
   {GIZMO_MODES.map(m=><Button key={m} variant="outline" aria-pressed={s.gizmo===m} className={s.gizmo===m?'bg-accent-soft text-accent':''} onClick={()=>void executeCommand('studio3d.gizmo.mode',{mode:m})}>{t('studio3d.gizmo.'+m)}</Button>)}
  </div>
  <p className="m-0 text-xs text-ink-3">{t('studio3d.nudge.hint')}</p>
  <Input value={filter} onChange={e=>setFilter(e.target.value)} placeholder={t('studio3d.scene.filter')} aria-label={t('studio3d.scene.filter')}/>
  {!s.outline.length&&<p className="text-xs text-ink-3">{t('studio3d.scene.empty')}</p>}
  <ul className="m-0 grid list-none gap-0.5 p-0" role="listbox" aria-label={t('studio3d.shell.scene')}>{rows.map(o=>
   <li key={o.id} role="option" aria-selected={s.selected===o.id} className="flex items-center gap-1"><input type="checkbox" checked={s.marked.includes(o.id)} aria-label={t('studio3d.mark.object',{name:o.name})} onChange={e=>patchStudio3D({marked:e.currentTarget.checked?[...s.marked,o.id]:s.marked.filter(x=>x!==o.id)})}/><button type="button" style={{paddingLeft:8+o.depth*12}} className={'min-w-0 flex-1 truncate rounded-sm py-1 pr-2 text-left text-xs hover:bg-hover '+(s.selected===o.id?'bg-accent-soft text-accent':'text-ink-2')}
    onClick={()=>void executeCommand('studio3d.select',{id:s.selected===o.id?null:o.id})}>{o.name}<span className="ml-1 text-ink-3">{o.kind==='group'?'':o.kind}</span></button></li>)}</ul>
 </div>;
}
export function ModelSection(_:InspectorSectionProps){
 const {t}=useT();const s=useStudio3D();
 if(s.status==='idle')return <p className="p-3 text-xs text-ink-3">{t('studio3d.start.title')}</p>;
 const size=s.bounds?boundsSize(s.bounds).map(fmt).join(' x '):'-';
 return <div className="grid gap-2"><dl className="m-0 grid gap-1 p-3" data-testid="studio3d-model-section">
  <Row k={t('studio3d.model.name')} v={s.blank?t('studio3d.model.blank'):s.name||'-'}/>
  {!s.blank&&<><Row k={t('studio3d.model.format')} v={s.format||'-'}/><Row k={t('studio3d.model.size')} v={formatBytes(s.bytes)}/>
  <Row k={t('studio3d.model.triangles')} v={formatCount(s.stats.triangles)}/><Row k={t('studio3d.model.vertices')} v={formatCount(s.stats.vertices)}/>
  <Row k={t('studio3d.model.meshes')} v={s.stats.meshes}/><Row k={t('studio3d.model.materials')} v={s.stats.materials}/><Row k={t('studio3d.model.textures')} v={s.stats.textures}/>
  <Row k={t('studio3d.model.animations')} v={s.stats.animations}/><Row k={t('studio3d.model.cameras')} v={s.stats.cameras}/><Row k={t('studio3d.model.dimensions')} v={size}/></>}
 </dl>
  {s.notice&&<p role="status" className="m-0 px-3 text-xs text-ink-2" data-testid="studio3d-notice">{s.notice}</p>}
  {s.unitHint&&<div role="status" className="grid gap-1 px-3 pb-3 text-xs text-ink-2" data-testid="studio3d-unit-hint">{t('studio3d.unit.hint')}
   <Button variant="outline" onClick={()=>{const h=s.unitHint!;patchStudio3D({unitHint:null});void executeCommand('studio3d.object.transform',{id:h.id,scale:{x:h.factor,y:h.factor,z:h.factor}});}}>{t('studio3d.unit.convert')}</Button>
   <Button variant="outline" onClick={()=>patchStudio3D({unitHint:null})}>{t('studio3d.unit.keep')}</Button></div>}
 </div>;
}
const AXES=['x','y','z'] as const;
/** Numeric transform fields. Committed on blur or Enter, one undo entry per edit. */
function VecField({id,field,label,step}:{id:number;field:'position'|'rotation'|'scale';label:string;step:number}){
 const s=useStudio3D();const v=s.selectedInfo?.[field];if(!v)return null;
 return <fieldset className="m-0 grid gap-1 border-0 p-0"><legend className="text-xs text-ink-3">{label}</legend>
  <div className="grid grid-cols-3 gap-1">{AXES.map(a=><Input key={a+':'+Number(v[a]).toFixed(4)} type="number" step={step} defaultValue={Number(v[a].toFixed(4))} aria-label={`${label} ${a.toUpperCase()}`}
   onBlur={e=>{const n=Number(e.currentTarget.value);if(e.currentTarget.value!==''&&Number.isFinite(n)&&n!==Number(v[a].toFixed(4)))void executeCommand('studio3d.object.transform',{id,[field]:{[a]:n}});}}
   onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/>)}</div></fieldset>;
}
export function ObjectSection(_:InspectorSectionProps){
 const {t}=useT();const s=useStudio3D();const o=s.selectedInfo;
 if(!o)return <p className="p-3 text-xs text-ink-3">{t('studio3d.object.none')}</p>;
 return <div className="grid gap-2 p-3" data-testid="studio3d-object-section">
  <Input key={o.id+':'+o.name} defaultValue={o.name} aria-label={t('studio3d.model.name')} onBlur={e=>{const n=e.currentTarget.value.trim();if(n&&n!==o.name)void executeCommand('studio3d.object.rename',{id:o.id,name:n});}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/>
  <VecField id={o.id} field="position" label={t('studio3d.object.position')} step={0.1}/>
  <VecField id={o.id} field="rotation" label={t('studio3d.object.rotation')} step={5}/>
  <VecField id={o.id} field="scale" label={t('studio3d.object.scale')} step={0.1}/>
  {o.camera&&<div className="grid gap-1" data-testid="studio3d-camera"><label className="grid gap-1 text-xs text-ink-2">{t('studio3d.camera.fov')}
    <Input key={o.id+':'+o.camera.fov} type="number" min={1} max={120} step={1} defaultValue={Number(o.camera.fov.toFixed(1))} aria-label={t('studio3d.camera.fov')}
     onBlur={e=>{const n=Number(e.currentTarget.value);if(e.currentTarget.value!==''&&Number.isFinite(n)&&n>=1&&n<=120&&n!==Number(o.camera!.fov.toFixed(1)))void executeCommand('studio3d.camera.set',{id:o.id,fov:n});}}
     onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/></label>
   <Button variant="outline" onClick={()=>void executeCommand('studio3d.view.fromCamera',{id:o.id})}>{t('studio3d.camera.look')}</Button>
   <Button variant="outline" onClick={()=>void executeCommand('studio3d.render.still',{camera:o.id})}>{t('studio3d.camera.render')}</Button>
   <Button variant="outline" onClick={()=>void executeCommand('studio3d.render.still',{camera:o.id,transparent:true})}>{t('studio3d.camera.renderTransparent')}</Button></div>}
  {o.light&&<LightFields id={o.id} light={o.light}/>}
  {o.material&&<fieldset className="m-0 grid gap-2 border-0 p-0" data-testid="studio3d-material"><legend className="text-xs text-ink-3">{t('studio3d.material.title')}</legend>
   <label className="flex items-center justify-between gap-2 text-xs text-ink-2">{t('studio3d.material.color')}<input type="color" key={o.material.color} defaultValue={o.material.color} onBlur={e=>{if(e.currentTarget.value!==o.material!.color)void executeCommand('studio3d.object.material',{id:o.id,color:e.currentTarget.value});}}/></label>
   {(['metalness','roughness'] as const).map(k=><label key={k} className="grid gap-1 text-xs text-ink-2">{t('studio3d.material.'+k)} <span className="text-ink-3">{o.material![k].toFixed(2)}</span>
    <input type="range" min={0} max={1} step={0.01} defaultValue={o.material![k]} key={k+o.material![k]} aria-label={t('studio3d.material.'+k)} onChange={e=>void executeCommand('studio3d.object.material',{id:o.id,[k]:Number(e.currentTarget.value)})}/></label>)}
  </fieldset>}
  <div className="flex gap-2"><Button variant="outline" onClick={()=>void executeCommand('studio3d.object.duplicate',{id:o.id})}>{t('studio3d.object.duplicate')}</Button>
   <Button variant="outline" onClick={()=>void executeCommand('studio3d.object.delete',{id:o.id})}>{t('studio3d.object.delete')}</Button></div>
 </div>;
}
export function ViewSection(_:InspectorSectionProps){
 const {t}=useT();const s=useStudio3D();const ready=s.status==='ready';
 return <div className="grid gap-2 p-3" data-testid="studio3d-view-section">
  <label className="flex items-center gap-2 text-xs text-ink-2"><input type="checkbox" checked={s.grid} onChange={e=>void executeCommand('studio3d.view.grid',{on:e.target.checked})}/>{t('studio3d.view.grid')}</label>
  <label className="flex items-center gap-2 text-xs text-ink-2"><input type="checkbox" checked={s.wireframe} disabled={!ready} onChange={e=>void executeCommand('studio3d.view.wireframe',{on:e.target.checked})}/>{t('studio3d.view.wireframe')}</label>
  <div className="flex gap-2"><Button variant="outline" disabled={!s.canUndo} onClick={()=>void executeCommand('studio3d.undo')}>{t('studio3d.undo')}</Button><Button variant="outline" disabled={!s.canRedo} onClick={()=>void executeCommand('studio3d.redo')}>{t('studio3d.redo')}</Button></div>
  <div className="flex gap-2"><Button variant="outline" disabled={!ready} onClick={()=>void executeCommand('studio3d.view.reset')}>{t('studio3d.view.reset')}</Button>
   <Button variant="outline" disabled={!ready||s.selected==null} onClick={()=>void executeCommand('studio3d.view.frame')}>{t('studio3d.view.frame')}</Button></div>
  {s.backend&&<Row k={t('studio3d.view.backend')} v={s.backend}/>}
 </div>;
}

/** Environment lighting: preset, strength, rotation, background, custom HDR or EXR map. */
export function EnvSection(_:InspectorSectionProps){
 const {t}=useT();const s=useStudio3D();const e=s.env;
 return <div className="grid gap-2 p-3" data-testid="studio3d-env-section">
  <label className="grid gap-1 text-xs text-ink-2">{t('studio3d.env.preset')}
   <select className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={e.preset} aria-label={t('studio3d.env.preset')}
    onChange={ev=>void executeCommand('studio3d.env.set',{preset:ev.currentTarget.value})}>
    {ENV_PRESETS.filter(p=>p!=='custom'||e.customName).map(p=><option key={p} value={p}>{p==='custom'?`${t('studio3d.env.custom')}: ${e.customName}`:t('studio3d.env.'+p)}</option>)}
   </select></label>
  <label className="grid gap-1 text-xs text-ink-2">{t('studio3d.env.intensity')} <span className="text-ink-3">{e.intensity.toFixed(2)}</span>
   <input type="range" min={0} max={3} step={0.05} value={e.intensity} aria-label={t('studio3d.env.intensity')} onChange={ev=>void executeCommand('studio3d.env.set',{intensity:Number(ev.currentTarget.value)})}/></label>
  <label className="grid gap-1 text-xs text-ink-2">{t('studio3d.env.rotation')} <span className="text-ink-3">{Math.round(e.rotation)}</span>
   <input type="range" min={-180} max={180} step={1} value={e.rotation} aria-label={t('studio3d.env.rotation')} onChange={ev=>void executeCommand('studio3d.env.set',{rotation:Number(ev.currentTarget.value)})}/></label>
  <label className="flex items-center gap-2 text-xs text-ink-2"><input type="checkbox" checked={e.background} disabled={e.preset==='none'} onChange={ev=>void executeCommand('studio3d.env.set',{background:ev.currentTarget.checked})}/>{t('studio3d.env.background')}</label>
  <Button variant="outline" onClick={()=>void executeCommand('studio3d.env.open')} title={ENV_ACCEPT}>{t('studio3d.env.open')}</Button>
 </div>;
}

const NumField=({label,value,min,max,step,onCommit}:{label:string;value:number;min:number;max:number;step:number;onCommit:(n:number)=>void})=>
 <label className="grid gap-1 text-xs text-ink-2">{label}
  <Input key={label+':'+value} type="number" min={min} max={max} step={step} defaultValue={Number(value.toFixed(3))} aria-label={label}
   onBlur={e=>{const n=Number(e.currentTarget.value);if(e.currentTarget.value!==''&&Number.isFinite(n)&&n>=min&&n<=max&&n!==Number(value.toFixed(3)))onCommit(n);}}
   onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/></label>;
/** Light settings. Spot lights also have a cone, area lights a size. */
function LightFields({id,light}:{id:number;light:NonNullable<ObjectInfo['light']>}){
 const {t}=useT();const set=(p:Record<string,unknown>)=>void executeCommand('studio3d.light.set',{id,...p});
 return <fieldset className="m-0 grid gap-2 border-0 p-0" data-testid="studio3d-light"><legend className="text-xs text-ink-3">{t('studio3d.light.title')}</legend>
  {light.shadow!==undefined&&<label className="flex items-center gap-2 text-xs text-ink-2"><input type="checkbox" checked={light.shadow} onChange={e=>set({shadow:e.currentTarget.checked})}/>{t('studio3d.light.shadow')}</label>}
  <NumField label={t('studio3d.light.intensity')} value={light.intensity} min={0} max={100000} step={1} onCommit={n=>set({intensity:n})}/>
  <label className="flex items-center justify-between gap-2 text-xs text-ink-2">{t('studio3d.material.color')}<input type="color" key={light.color} defaultValue={light.color} onBlur={e=>{if(e.currentTarget.value!==light.color)set({color:e.currentTarget.value});}}/></label>
  {light.angle!==undefined&&<NumField label={t('studio3d.light.angle')} value={light.angle} min={1} max={90} step={1} onCommit={n=>set({angle:n})}/>}
  {light.penumbra!==undefined&&<NumField label={t('studio3d.light.penumbra')} value={light.penumbra} min={0} max={1} step={0.05} onCommit={n=>set({penumbra:n})}/>}
  {light.width!==undefined&&<NumField label={t('studio3d.light.width')} value={light.width} min={0.01} max={1000} step={0.1} onCommit={n=>set({width:n})}/>}
  {light.height!==undefined&&<NumField label={t('studio3d.light.height')} value={light.height} min={0.01} max={1000} step={0.1} onCommit={n=>set({height:n})}/>}
 </fieldset>;
}
/** Snapping, pivot, align and distribute. Align and distribute work on the objects ticked in the scene list. */
export function ToolsSection(_:InspectorSectionProps){
 const {t}=useT();const s=useStudio3D();const sn=s.snap;const n=s.marked.filter(id=>s.outline.some(o=>o.id===id));const [frames,setFrames]=useState(36);
 const align=(axis:string,to:string)=>void executeCommand('studio3d.object.align',{ids:n,axis,to});
 return <div className="grid gap-2 p-3" data-testid="studio3d-tools-section">
  <label className="flex items-center gap-2 text-xs text-ink-2"><input type="checkbox" checked={sn.on} onChange={e=>void executeCommand('studio3d.snap.set',{on:e.currentTarget.checked})}/>{t('studio3d.snap.on')}</label>
  <div className="grid grid-cols-3 gap-1">
   <NumField label={t('studio3d.snap.move')} value={sn.move} min={0.001} max={100} step={0.05} onCommit={v=>void executeCommand('studio3d.snap.set',{move:v})}/>
   <NumField label={t('studio3d.snap.rotate')} value={sn.rotate} min={1} max={180} step={5} onCommit={v=>void executeCommand('studio3d.snap.set',{rotate:v})}/>
   <NumField label={t('studio3d.snap.scale')} value={sn.scale} min={0.001} max={10} step={0.05} onCommit={v=>void executeCommand('studio3d.snap.set',{scale:v})}/></div>
  <fieldset className="m-0 grid gap-1 border-0 p-0"><legend className="text-xs text-ink-3">{t('studio3d.pivot.title')}</legend>
   <div className="flex gap-1">{(['center','base'] as const).map(at=><Button key={at} variant="outline" disabled={s.selectedInfo?.kind!=='mesh'} onClick={()=>void executeCommand('studio3d.object.pivot',{id:s.selected,at})}>{t('studio3d.pivot.'+at)}</Button>)}</div></fieldset>
  <fieldset className="m-0 grid gap-2 border-0 p-0" data-testid="studio3d-save"><legend className="text-xs text-ink-3">{t('studio3d.save.title')}</legend>
   <div className="flex flex-wrap gap-1"><Button variant="outline" disabled={s.status!=='ready'} onClick={()=>void executeCommand('studio3d.save',{})}>{t('studio3d.save.one')}</Button>
    <Button variant="outline" disabled={s.status!=='ready'} onClick={()=>void executeCommand('studio3d.save',{sidecar:true})}>{t('studio3d.save.sidecar')}</Button>
    {s.env.preset==='custom'&&<Button variant="outline" disabled={s.status!=='ready'} onClick={()=>void executeCommand('studio3d.save',{embedEnv:true})}>{t('studio3d.save.embed')}</Button>}</div>
   <p className="m-0 text-xs text-ink-3">{t('studio3d.save.note')}</p>
   <RecentList compact/>
  </fieldset>
  <fieldset className="m-0 grid gap-2 border-0 p-0" data-testid="studio3d-export"><legend className="text-xs text-ink-3">{t('studio3d.export.title')}</legend>
   <label className="grid gap-1 text-xs text-ink-2">{t('studio3d.export.unit')}
    <select className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={s.unit} aria-label={t('studio3d.export.unit')} onChange={e=>void executeCommand('studio3d.unit.set',{unit:e.currentTarget.value})}>
     {UNIT_IDS.map(u=><option key={u} value={u}>{t('studio3d.unit.'+u)}</option>)}</select></label>
   <div className="flex flex-wrap gap-1">
    <Button variant="outline" disabled={s.status!=='ready'} onClick={()=>void executeCommand('studio3d.export.glb')}>GLB</Button>
    <Button variant="outline" disabled={s.status!=='ready'} onClick={()=>void executeCommand('studio3d.export.mesh',{format:'stl'})}>STL</Button>
    <Button variant="outline" disabled={s.status!=='ready'} onClick={()=>void executeCommand('studio3d.export.mesh',{format:'obj'})}>OBJ</Button></div>
   <p className="m-0 text-xs text-ink-3">{t('studio3d.export.unitNote')}</p>
  </fieldset>
  <fieldset className="m-0 grid gap-2 border-0 p-0" data-testid="studio3d-turntable"><legend className="text-xs text-ink-3">{t('studio3d.turntable.title')}</legend>
   <NumField label={t('studio3d.turntable.frames')} value={frames} min={2} max={360} step={1} onCommit={setFrames}/>
   {s.render?<><p role="status" className="m-0 text-xs text-ink-2">{t('studio3d.turntable.progress',{done:s.render.done,total:s.render.total})}</p>
    <Button variant="outline" onClick={()=>void executeCommand('studio3d.render.cancel')}>{t('studio3d.turntable.cancel')}</Button></>:
    <Button variant="outline" disabled={s.status!=='ready'} onClick={()=>void executeCommand('studio3d.render.turntable',{frames})}>{t('studio3d.turntable.start')}</Button>}
  </fieldset>
  <fieldset className="m-0 grid gap-1 border-0 p-0" data-testid="studio3d-align"><legend className="text-xs text-ink-3">{t('studio3d.align.title',{count:n.length})}</legend>
   <p className="m-0 text-xs text-ink-3">{t('studio3d.align.hint')}</p>
   <div className="flex flex-wrap gap-1"><Button variant="outline" disabled={n.length<2} onClick={()=>void executeCommand('studio3d.selection.duplicate',{ids:n})}>{t('studio3d.selection.duplicate')}</Button>
    <Button variant="outline" disabled={n.length<2} onClick={()=>void executeCommand('studio3d.selection.delete',{ids:n})}>{t('studio3d.selection.delete')}</Button></div>
   {(['x','y','z'] as const).map(a=><div key={a} className="flex flex-wrap items-center gap-1" role="group" aria-label={a.toUpperCase()}><span className="w-4 text-xs text-ink-3">{a.toUpperCase()}</span>
    {(['min','center','max'] as const).map(to=><Button key={to} variant="outline" disabled={n.length<2} aria-label={t('studio3d.align.aria',{axis:a.toUpperCase(),to:t('studio3d.align.'+to)})} onClick={()=>align(a,to)}>{t('studio3d.align.'+to)}</Button>)}
    <Button variant="outline" disabled={n.length<3} aria-label={t('studio3d.align.distributeAria',{axis:a.toUpperCase()})} onClick={()=>void executeCommand('studio3d.object.distribute',{ids:n,axis:a})}>{t('studio3d.align.distribute')}</Button></div>)}
  </fieldset>
 </div>;
}

/** Scenes saved or autosaved in this browser. Shown on the start screen and in the Save group. */
export function RecentList({compact=false}:{compact?:boolean}){
 const {t}=useT();const s=useStudio3D();
 if(!s.recent.length)return null;
 return <section className={compact?'grid gap-1':'mx-auto grid w-full max-w-md gap-1 p-4'} aria-label={t('studio3d.recent.title')} data-testid="studio3d-recent">
  <h3 className="m-0 text-xs font-medium text-ink-3">{t('studio3d.recent.title')}</h3>
  <ul className="m-0 grid list-none gap-1 p-0">{s.recent.map(e=><li key={e.id}>
   <button type="button" className="flex w-full items-center justify-between gap-2 rounded-[25px] border border-subtle bg-surface px-3 py-1.5 text-left text-xs text-ink hover:bg-hover" onClick={()=>void executeCommand('studio3d.recent.open',{id:e.id})} data-testid={e.auto?'studio3d-recent-autosave':'studio3d-recent-item'}>
    <span className="min-w-0 truncate">{e.auto?t('studio3d.recent.autosave',{name:e.name}):e.name}</span>
    <span className="shrink-0 text-ink-3">{new Date(e.savedAt).toLocaleString()} · {formatBytes(e.size)}</span></button></li>)}</ul>
  <Button variant="outline" onClick={()=>void executeCommand('studio3d.recent.clear',{})}>{t('studio3d.recent.clear')}</Button>
 </section>;
}
