import {useState} from 'react';
import {executeCommand} from '../../lib/commands';
import {useT} from '../../lib/useT';
import {formatBytes} from '../../lib/media';
import {useStudio3D} from '../../lib/studio3d/session';
import {formatCount,boundsSize} from '../../lib/studio3d/model';
import type {PanelHostProps,InspectorSectionProps} from '../../lib/shell/types';
import {Input} from '../ui/input';
import {Button} from '../ui/button';
const PRIMS=['cube','sphere','plane','cylinder','cone','torus'] as const;
const LIGHTS=['directional','point'] as const;
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
  </div>
  <Input value={filter} onChange={e=>setFilter(e.target.value)} placeholder={t('studio3d.scene.filter')} aria-label={t('studio3d.scene.filter')}/>
  {!s.outline.length&&<p className="text-xs text-ink-3">{t('studio3d.scene.empty')}</p>}
  <ul className="m-0 grid list-none gap-0.5 p-0" role="listbox" aria-label={t('studio3d.shell.scene')}>{rows.map(o=>
   <li key={o.id} role="option" aria-selected={s.selected===o.id}><button type="button" style={{paddingLeft:8+o.depth*12}} className={'w-full truncate rounded-sm py-1 pr-2 text-left text-xs hover:bg-hover '+(s.selected===o.id?'bg-accent-soft text-accent':'text-ink-2')}
    onClick={()=>void executeCommand('studio3d.select',{id:s.selected===o.id?null:o.id})}>{o.name}<span className="ml-1 text-ink-3">{o.kind==='group'?'':o.kind}</span></button></li>)}</ul>
 </div>;
}
export function ModelSection(_:InspectorSectionProps){
 const {t}=useT();const s=useStudio3D();
 if(s.status==='idle')return <p className="p-3 text-xs text-ink-3">{t('studio3d.start.title')}</p>;
 const size=s.bounds?boundsSize(s.bounds).map(fmt).join(' x '):'-';
 return <dl className="m-0 grid gap-1 p-3" data-testid="studio3d-model-section">
  <Row k={t('studio3d.model.name')} v={s.blank?t('studio3d.model.blank'):s.name||'-'}/>
  {!s.blank&&<><Row k={t('studio3d.model.format')} v={s.format||'-'}/><Row k={t('studio3d.model.size')} v={formatBytes(s.bytes)}/>
  <Row k={t('studio3d.model.triangles')} v={formatCount(s.stats.triangles)}/><Row k={t('studio3d.model.vertices')} v={formatCount(s.stats.vertices)}/>
  <Row k={t('studio3d.model.meshes')} v={s.stats.meshes}/><Row k={t('studio3d.model.materials')} v={s.stats.materials}/><Row k={t('studio3d.model.textures')} v={s.stats.textures}/>
  <Row k={t('studio3d.model.animations')} v={s.stats.animations}/><Row k={t('studio3d.model.cameras')} v={s.stats.cameras}/><Row k={t('studio3d.model.dimensions')} v={size}/></>}
 </dl>;
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
