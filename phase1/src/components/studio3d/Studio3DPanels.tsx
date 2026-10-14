import {StudioStatus} from '../studios/StudioStatus';
import {StudioRecentList} from '../studios/StudioRecentList';
import {StudioProgress} from '../studios/StudioProgress';
import {useEffect,useMemo,useRef,useState} from 'react';
import {patchStudio3D} from '../../lib/studio3d/session';
import type {ObjectInfo} from '../../lib/studio3d/stage';
import {TEXGEN_DEFAULT_COLORS} from '../../lib/studio3d/texgen';
import {executeCommand} from '../../lib/commands';
import {dropTextureFile} from '../../lib/studio3d/commands';
import {useT} from '../../lib/useT';
import {formatBytes} from '../../lib/media';
import {useStudio3D} from '../../lib/studio3d/session';
import {formatCount,boundsSize,GIZMO_MODES,ENV_PRESETS,ENV_ACCEPT,UNIT_IDS,BG_MODES,SHADOW_QUALITIES,SHADOW_TYPES,toggleSelection,transformExpr,outlineVisible,type BgMode} from '../../lib/studio3d/model';
import {ChevronDown,ChevronRight,Crosshair,Eye,EyeOff,Lock,LockOpen,Redo2,Undo2} from 'lucide-react';
import type {PanelHostProps,InspectorSectionProps} from '../../lib/shell/types';
import {Input} from '../ui/input';
import {Button} from '../ui/button';
import {NativeInput,NativeSelect} from '../ui/native-controls';
import {InspectorNumberField} from '../studios/InspectorNumberField';
import {Checkbox} from '../ui/checkbox';
import {RangeField} from '../ui/range-field';
import {PARAM_SPECS,MATERIAL_PRESETS} from '../../lib/studio3d/primitives';
import {ALPHA_MODES,TEXTURE_SLOTS,MAX_EMISSIVE_INTENSITY,materialSwatch,type TextureSlot} from '../../lib/studio3d/materials';
import {validateScene,sceneHints,toMB} from '../../lib/studio3d/validate';
import {ClipTimeline} from './ClipTimeline';
import {SPEEDS,formatClock} from '../../lib/studio3d/animation';
import {VIEW_PRESETS,RENDER_SIZES,fovToFocal} from '../../lib/studio3d/viewPresets';
const PRIMS=['cube','sphere','plane','cylinder','cone','torus'] as const;
const LIGHTS=['directional','point','spot','area','ambient'] as const;
const Row=({k,v}:{k:string;v:string|number})=><div className="flex justify-between gap-3 text-xs"><dt className="text-ink-3">{k}</dt><dd className="m-0 truncate text-ink-2" title={String(v)}>{v}</dd></div>;
const fmt=(n:number)=>(Math.abs(n)>=100?n.toFixed(0):Math.abs(n)>=10?n.toFixed(1):n.toFixed(2));
/** Outliner: every node of the opened model, filterable, click to select. */
const NODE_MIME='application/x-somnia3d-node';
import {ASSET_MIME,assetDragData} from '../../lib/studio3d/assetDrag';
const parseNodeDrag=(raw:string):number[]|null=>{if(!raw)return null;try{const v=JSON.parse(raw) as unknown;return Array.isArray(v)&&v.length&&v.every(x=>Number.isInteger(x)&&x>=0)?v as number[]:null;}catch{return null;}};
export function ScenePanel(_:PanelHostProps){
 const {t}=useT();const s=useStudio3D();const [filter,setFilter]=useState('');const [renaming,setRenaming]=useState<number|null>(null);
 // Drop target while dragging outline rows: groups accept drops into the middle, every row reorders at its top/bottom edge.
 const [dropAt,setDropAt]=useState<{id:number;where:'before'|'after'|'into'}|null>(null);
 const currentSet=s.marked.length?[...s.marked]:s.selected!=null?[s.selected]:[];
 const collapsed=s.collapsed;
 // A name filter searches the whole tree; without one, folded groups hide their children.
 const vis=filter?null:outlineVisible(s.outline,collapsed);
 const rows=s.outline.filter((o,i)=>filter?o.name.toLowerCase().includes(filter.toLowerCase()):vis![i]);
 const fold=(id:number)=>patchStudio3D({collapsed:collapsed.includes(id)?collapsed.filter(x=>x!==id):[...collapsed,id]});
 return <div className="grid gap-2 p-3" data-testid="studio3d-scene-panel">
  <div className="flex flex-wrap gap-1" role="group" aria-label={t('studio3d.insert.group')} data-testid="studio3d-insert">
   {PRIMS.map(k=><Button key={k} variant="outline" draggable onDragStart={e=>{e.dataTransfer.setData(ASSET_MIME,assetDragData({kind:'primitive',primitive:k}));e.dataTransfer.effectAllowed='copy';}} onClick={()=>void executeCommand('studio3d.insert.primitive',{kind:k})}>{t('studio3d.insert.'+k)}</Button>)}
   {LIGHTS.map(k=><Button key={k} variant="outline" onClick={()=>void executeCommand('studio3d.insert.light',{kind:k})}>{t('studio3d.insert.'+k)}</Button>)}
   {(['three-point','studio','sunset','outdoor'] as const).map(preset=><Button key={preset} variant="outline" onClick={()=>void executeCommand('studio3d.light.rig',{preset})}>{t('studio3d.light.rig.'+preset)}</Button>)}
   <Button variant="outline" onClick={()=>void executeCommand('studio3d.insert.camera',{})}>{t('studio3d.insert.camera')}</Button>
   <Button variant="outline" onClick={()=>void executeCommand('studio3d.insert.pin',{})}>{t('studio3d.insert.pin')}</Button>
   <Button variant="outline" onClick={()=>void executeCommand('studio3d.insert.camera',{fromView:true})}>{t('studio3d.insert.camera.view')}</Button>
   <Button variant="outline" onClick={()=>void executeCommand('studio3d.insert.camera',{kind:'orthographic'})}>{t('studio3d.insert.camera.ortho')}</Button>
  </div>
  <div className="flex flex-wrap gap-1" role="group" aria-label={t('studio3d.gizmo.group')} data-testid="studio3d-gizmo">
   {GIZMO_MODES.map(m=><Button key={m} variant="outline" aria-pressed={s.gizmo===m} className={s.gizmo===m?'bg-accent-soft text-accent':''} onClick={()=>void executeCommand('studio3d.gizmo.mode',{mode:m})}>{t('studio3d.gizmo.'+m)}</Button>)}
  </div>
  <p className="m-0 text-xs text-ink-3">{t('studio3d.nudge.hint')}</p>
  <Input value={filter} onChange={e=>setFilter(e.target.value)} placeholder={t('studio3d.scene.filter')} aria-label={t('studio3d.scene.filter')}/>
  <div className="flex gap-1" role="group" aria-label={t('studio3d.outline.groups')} data-testid="studio3d-outline-groups">
   <Button variant="outline" disabled={currentSet.length<2} onClick={()=>void executeCommand('studio3d.group',{ids:currentSet})}>{t('studio3d.outline.group')}</Button>
   <Button variant="outline" disabled={s.selected==null||s.outline.find(o=>o.id===s.selected)?.kind!=='group'} onClick={()=>s.selected!=null&&void executeCommand('studio3d.ungroup',{id:s.selected})}>{t('studio3d.outline.ungroup')}</Button></div>
  <div className="flex gap-1" role="group" aria-label={t('studio3d.outline.selection')} data-testid="studio3d-outline-selection">
   <Button variant="outline" disabled={!currentSet.length} onClick={()=>void executeCommand('studio3d.selection.duplicate',{ids:currentSet})}>{t('studio3d.selection.duplicate')}</Button>
   <Button variant="outline" disabled={!currentSet.length} onClick={()=>void executeCommand('studio3d.selection.delete',{ids:currentSet})}>{t('studio3d.selection.delete')}</Button>
  </div>
  {!s.outline.length&&<StudioStatus live="off" className="block text-xs text-ink-3">{t('studio3d.scene.empty')}</StudioStatus>}
  <ul className="m-0 grid list-none gap-0.5 p-0" role="listbox" aria-label={t('studio3d.shell.scene')}
   onDragOver={e=>{if(e.dataTransfer.types.includes(NODE_MIME)){e.preventDefault();e.dataTransfer.dropEffect='move';}}}
   onDrop={e=>{const ids=parseNodeDrag(e.dataTransfer.getData(NODE_MIME));setDropAt(null);if(!ids)return;e.preventDefault();void executeCommand('studio3d.object.reparent',{ids,parent:null});}}>{rows.map(o=>
   <li key={o.id} role="option" aria-selected={s.selected===o.id} className="flex items-center gap-1" draggable={renaming!==o.id}
    onDragStart={e=>{const ids=s.marked.includes(o.id)&&s.marked.length>1?[...s.marked]:[o.id];e.dataTransfer.setData(NODE_MIME,JSON.stringify(ids));e.dataTransfer.effectAllowed='move';}}
    onDragEnd={()=>setDropAt(null)}
    onDragOver={e=>{if(!e.dataTransfer.types.includes(NODE_MIME))return;e.preventDefault();e.dataTransfer.dropEffect='move';e.stopPropagation();
     const r=e.currentTarget.getBoundingClientRect();const ratio=(e.clientY-r.top)/Math.max(r.height,1);
     const where=o.kind==='group'?ratio<0.25?'before':ratio>0.75?'after':'into':ratio<0.5?'before':'after';
     if(dropAt?.id!==o.id||dropAt.where!==where)setDropAt({id:o.id,where});}}
    onDragLeave={()=>{if(dropAt?.id===o.id)setDropAt(null);}}
    onDrop={e=>{const ids=parseNodeDrag(e.dataTransfer.getData(NODE_MIME));const at=dropAt?.id===o.id?dropAt.where:o.kind==='group'?'into':'after';setDropAt(null);
     if(!ids||ids.includes(o.id))return;e.preventDefault();e.stopPropagation();
     if(at==='into')void executeCommand('studio3d.object.reparent',{ids,parent:o.id});
     else void executeCommand('studio3d.object.reorder',{ids,target:o.id,where:at});}}>
    {o.kind==='group'&&<Button variant="outline" className="px-1" aria-expanded={!collapsed.includes(o.id)} aria-label={t(collapsed.includes(o.id)?'studio3d.outline.expand':'studio3d.outline.collapse',{name:o.name})} onClick={()=>fold(o.id)}>{collapsed.includes(o.id)?<ChevronRight size={13} aria-hidden/>:<ChevronDown size={13} aria-hidden/>}</Button>}
    <input type="checkbox" checked={s.marked.includes(o.id)} aria-label={t('studio3d.mark.object',{name:o.name})} onChange={e=>patchStudio3D({marked:e.currentTarget.checked?[...s.marked,o.id]:s.marked.filter(x=>x!==o.id)})}/>
    <Button variant="outline" className="px-1" aria-pressed={!o.hidden} aria-label={t(o.hidden?'studio3d.outline.show':'studio3d.outline.hide',{name:o.name})} onClick={()=>void executeCommand('studio3d.object.visible',{id:o.id,on:o.hidden})}>{o.hidden?<EyeOff size={13} aria-hidden/>:<Eye size={13} aria-hidden/>}</Button>
    <Button variant="outline" className="px-1" aria-pressed={o.locked} aria-label={t(o.locked?'studio3d.outline.unlock':'studio3d.outline.lock',{name:o.name})} onClick={()=>void executeCommand('studio3d.object.locked',{id:o.id,on:!o.locked})}>{o.locked?<Lock size={13} aria-hidden/>:<LockOpen size={13} aria-hidden/>}</Button>
    <Button variant="outline" className="px-1" aria-label={t('studio3d.focus',{name:o.name})} title={t('studio3d.focus',{name:o.name})} onClick={()=>{void executeCommand('studio3d.select',{id:o.id});void executeCommand('studio3d.view.frame');}}><Crosshair size={13} aria-hidden/></Button>
    {renaming===o.id?
     <Input autoFocus defaultValue={o.name} aria-label={t('studio3d.outline.rename',{name:o.name})} className="min-w-0 flex-1"
      onBlur={e=>{const n=e.currentTarget.value.trim();setRenaming(null);if(n&&n!==o.name)void executeCommand('studio3d.object.rename',{id:o.id,name:n});}}
      onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){e.currentTarget.value=o.name;e.currentTarget.blur();}}}/>:
     <button type="button" data-outline-name="" style={{paddingLeft:8+o.depth*12}} data-testid={'studio3d-outline-row-'+o.id} className={'min-w-0 flex-1 truncate rounded-sm py-1 pr-2 text-left text-xs hover:bg-hover '+(s.selected===o.id?'bg-accent-soft text-accent':'text-ink-2')+(o.hidden?' opacity-50':'')+(dropAt?.id===o.id?dropAt.where==='before'?' border-t-2 border-accent':dropAt.where==='after'?' border-b-2 border-accent':' bg-accent-soft':'')}
      onClick={e=>{
       if(e.shiftKey&&s.selected!=null&&s.selected!==o.id){
        const order=s.outline.map(x=>x.id);const a=order.indexOf(s.selected),b=order.indexOf(o.id);
        if(a>=0&&b>=0){const range=order.slice(Math.min(a,b),Math.max(a,b)+1);patchStudio3D({marked:range,selected:o.id});return;}
       }
       if(e.ctrlKey||e.metaKey){const r=toggleSelection(s.marked,s.selected,o.id);patchStudio3D({marked:r.marked,selected:r.selected});return;}
       void executeCommand('studio3d.select',{id:s.selected===o.id?null:o.id});
      }}
      onDoubleClick={()=>setRenaming(o.id)}
      onKeyDown={e=>{
       if(e.key==='F2'){setRenaming(o.id);e.preventDefault();return;}
       if(e.key==='ArrowRight'&&o.kind==='group'&&collapsed.includes(o.id)){fold(o.id);e.preventDefault();return;}
       if(e.key==='ArrowLeft'&&o.kind==='group'&&!collapsed.includes(o.id)){fold(o.id);e.preventDefault();return;}
       const list=e.currentTarget.closest('ul')?.querySelectorAll<HTMLButtonElement>('[data-outline-name]');if(!list)return;
       const i=[...list].indexOf(e.currentTarget);
       if(e.key==='ArrowDown'&&i<list.length-1){list[i+1].focus();e.preventDefault();}
       else if(e.key==='ArrowUp'&&i>0){list[i-1].focus();e.preventDefault();}
       else if(e.key==='Home'){list[0]?.focus();e.preventDefault();}
       else if(e.key==='End'){list[list.length-1]?.focus();e.preventDefault();}
      }}>{o.name}<span className="ml-1 text-ink-3">{o.kind==='group'?'':o.kind}</span></button>}
   </li>)}</ul>
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
  <Row k={t('studio3d.model.meshes')} v={s.stats.meshes}/><Row k={t('studio3d.model.materials')} v={s.stats.materials}/><Row k={t('studio3d.model.textures')} v={s.stats.textures}/><Row k={t('studio3d.model.textureMemory')} v={s.stats.textures?`${toMB(s.stats.textureBytes)} MB`:'-'}/><Row k={t('studio3d.model.draws')} v={formatCount(s.stats.draws)}/>{s.stats.instancingCandidates>0&&<Row k={t('studio3d.model.instancing')} v={formatCount(s.stats.instancingCandidates)}/>}
  {s.stats.bones>0&&<Row k={t('studio3d.model.bones')} v={formatCount(s.stats.bones)}/>}<Row k={t('studio3d.model.memory')} v={`${toMB(s.stats.geometryBytes+s.stats.textureBytes)} MB`}/><Row k={t('studio3d.model.animations')} v={s.stats.animations}/><Row k={t('studio3d.model.cameras')} v={s.stats.cameras}/><Row k={t('studio3d.model.dimensions')} v={size}/></>}
 </dl>
  {s.materialList.length>0&&<div className="grid gap-1 px-3" data-testid="studio3d-material-list">
   <p className="m-0 text-xs text-ink-3">{t('studio3d.material.list')}</p>
   <ul className="m-0 grid list-none gap-0.5 p-0">{s.materialList.map(m=><li key={m.key}>
    <Button variant="ghost" className="flex w-full items-center justify-start gap-2 px-1 py-0.5 text-left text-xs text-ink-2 hover:bg-hover" aria-label={t('studio3d.material.selectUsers',{name:m.name})}
     draggable onDragStart={e=>{e.dataTransfer.setData(ASSET_MIME,assetDragData({kind:'material',key:m.key}));e.dataTransfer.effectAllowed='copy';}}
     onClick={()=>void executeCommand('studio3d.select',{id:m.ids[0]}).then(()=>patchStudio3D({marked:m.ids}))}>
     <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0 rounded-full border border-subtle" role="img" aria-label={m.color}><rect width="12" height="12" fill={m.color}/></svg>
     <span className="min-w-0 flex-1 truncate">{m.name}</span><span className="text-ink-3">{t('studio3d.material.users',{count:m.count})}</span></Button></li>)}</ul></div>}
  {!s.blank&&<SceneChecks/>}
  {<AnimationControls/>}
  {s.imported&&<StudioStatus className="block m-0 px-3 text-xs text-ink-2" data-testid="studio3d-import-summary">{t('studio3d.import.summary',{tris:formatCount(s.imported.triangles),materials:formatCount(s.imported.materials),animations:formatCount(s.imported.animations)})}</StudioStatus>}
  {s.notice&&<StudioStatus className="block m-0 px-3 text-xs text-ink-2" data-testid="studio3d-notice">{s.notice}</StudioStatus>}
  {s.unitHint&&<div role="status" className="grid gap-1 px-3 pb-3 text-xs text-ink-2" data-testid="studio3d-unit-hint">{t('studio3d.unit.hint')}
   <Button variant="outline" onClick={()=>{const h=s.unitHint!;patchStudio3D({unitHint:null});void executeCommand('studio3d.object.transform',{id:h.id,scale:{x:h.factor,y:h.factor,z:h.factor}});}}>{t('studio3d.unit.convert')}</Button>
   <Button variant="outline" onClick={()=>patchStudio3D({unitHint:null})}>{t('studio3d.unit.keep')}</Button></div>}
 </div>;
}
const AXES=['x','y','z'] as const;
/** Numeric transform fields. Committed on blur or Enter, one undo entry per edit. */
function VecField({id,field,label,step}:{id:number;field:'position'|'rotation'|'scale';label:string;step:number}){
 const {t}=useT();const s=useStudio3D();const v=s.selectedInfo?.[field];if(!v)return null;
 return <fieldset className="m-0 grid gap-1 border-0 p-0"><legend className="text-xs text-ink-3">{label}</legend>
  <div className="grid grid-cols-3 gap-1">{AXES.map(a=>{const lab=`${label} ${a.toUpperCase()}`;
   return <InspectorNumberField key={a} resetKey={id} label={lab} value={Number(v[a].toFixed(4))} step={step}
   parse={draft=>{const n=transformExpr(draft,v[a]);return n===null?{ok:false,error:t('schemaForm.invalid',{name:lab})}:{ok:true,value:n};}}
   onCommit={n=>void executeCommand('studio3d.object.transform',{id,[field]:{[a]:n}})}/>;})}</div></fieldset>;
}
/** 64px preview of an occupied texture slot, fetched from the live viewport texture. */
function TextureThumb({id,slot,name}:{id:number;slot:TextureSlot;name:string}){
 const {t}=useT();const [url,setUrl]=useState<string|null>(null);
 useEffect(()=>{let live=true;setUrl(null);
  void executeCommand('studio3d.texture.preview',{id,slot}).then(u=>{if(live)setUrl(typeof u==='string'?u:null);}).catch(()=>{if(live)setUrl(null);});
  return()=>{live=false;};},[id,slot,name]);
 return url?<img src={url} alt={t('studio3d.texture.previewAlt',{slot:t('studio3d.texture.'+slot)})} className="h-8 w-8 shrink-0 rounded-sm border border-subtle object-cover" data-testid={'studio3d-texture-thumb-'+slot}/>:null;
}
/** User-saved local material presets: apply, remove, and save the mesh's current material under a name. */
function MaterialUserPresets({id}:{id:number}){
 const {t}=useT();const s=useStudio3D();const [presetName,setPresetName]=useState('');
 const trimmed=presetName.trim();
 return <div className="grid gap-1" data-testid="studio3d-material-user-presets">
  {s.materialPresets.length>0&&<div className="flex flex-wrap gap-1" role="group" aria-label={t('studio3d.material.presetsUser')}>{s.materialPresets.map(p=><span key={p.name} className="inline-flex items-center gap-0.5">
   <Button variant="outline" draggable onDragStart={e=>{e.dataTransfer.setData(ASSET_MIME,assetDragData({kind:'userPreset',name:p.name}));e.dataTransfer.effectAllowed='copy';}} onClick={()=>void executeCommand('studio3d.material.preset.apply',{id,name:p.name})}>{p.name}</Button>
   <Button variant="outline" aria-label={t('studio3d.material.removePreset',{name:p.name})} onClick={()=>void executeCommand('studio3d.material.preset.remove',{name:p.name})}>×</Button></span>)}</div>}
  <div className="flex gap-1">
   <NativeInput value={presetName} maxLength={60} placeholder={t('studio3d.material.presetName')} aria-label={t('studio3d.material.presetName')} onChange={e=>setPresetName(e.currentTarget.value)}/>
   <Button variant="outline" disabled={!trimmed} onClick={()=>{void executeCommand('studio3d.material.preset.save',{id,name:trimmed});setPresetName('');}}>{t('studio3d.material.savePreset')}</Button></div></div>;
}
export function ObjectSection(_:InspectorSectionProps){
 const {t}=useT();const s=useStudio3D();const o=s.selectedInfo;
 const [tgKind,setTgKind]=useState<'checker'|'grid'|'stripes'|'noise'>('checker');
 const [tgScale,setTgScale]=useState(8);
 const [tgA,setTgA]=useState<string>(TEXGEN_DEFAULT_COLORS.a);
 const [tgB,setTgB]=useState<string>(TEXGEN_DEFAULT_COLORS.b);
 if(!o)return <p className="p-3 text-xs text-ink-3">{t('studio3d.object.none')}</p>;
 return <div className="grid gap-2 p-3" data-testid="studio3d-object-section">
  <Input key={o.id+':'+o.name} defaultValue={o.name} aria-label={t('studio3d.model.name')} onBlur={e=>{const n=e.currentTarget.value.trim();if(n&&n!==o.name)void executeCommand('studio3d.object.rename',{id:o.id,name:n});}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/>
  <VecField id={o.id} field="position" label={t('studio3d.object.position')} step={0.1}/>
  <VecField id={o.id} field="rotation" label={t('studio3d.object.rotation')} step={5}/>
  <VecField id={o.id} field="scale" label={t('studio3d.object.scale')} step={0.1}/>
  {o.camera&&<div className="grid gap-1" data-testid="studio3d-camera">{o.camera.kind==='perspective'?
    <InspectorNumberField resetKey={o.id} label={t('studio3d.camera.fov')} value={Number(o.camera.fov.toFixed(1))} min={1} max={120} step={1}
     onCommit={fov=>void executeCommand('studio3d.camera.set',{id:o.id,fov})}/>:
    <InspectorNumberField resetKey={o.id} label={t('studio3d.camera.zoom')} value={Number(o.camera.zoom.toFixed(2))} min={0.01} max={100} step={0.1}
     onCommit={zoom=>void executeCommand('studio3d.camera.set',{id:o.id,zoom})}/>}
   <Button variant="outline" onClick={()=>void executeCommand('studio3d.view.fromCamera',{id:o.id})}>{t('studio3d.camera.look')}</Button>
   <Button variant="outline" onClick={()=>void executeCommand('studio3d.render.still',{camera:o.id})}>{t('studio3d.camera.render')}</Button>
   <Button variant="outline" onClick={()=>void executeCommand('studio3d.render.still',{camera:o.id,transparent:true})}>{t('studio3d.camera.renderTransparent')}</Button></div>}
  {o.light&&<LightFields id={o.id} light={o.light}/>}
  {o.primitive&&<fieldset className="m-0 grid gap-2 border-0 p-0" data-testid="studio3d-primitive"><legend className="text-xs text-ink-3">{t('studio3d.shape.title',{kind:t('studio3d.insert.'+o.primitive.kind)})}</legend>
   <div className="grid grid-cols-2 gap-2">{PARAM_SPECS[o.primitive.kind].map(sp=><NumField key={sp.id} label={t('studio3d.shape.'+sp.id)} value={o.primitive!.params[sp.id]} min={sp.min} max={sp.max} step={sp.step}
    onCommit={v=>void executeCommand('studio3d.object.primitive',{id:o.id,[sp.id]:sp.integer?Math.round(v):v})}/>)}</div></fieldset>}
  {o.material&&<fieldset className="m-0 grid gap-2 border-0 p-0" data-testid="studio3d-material"><legend className="text-xs text-ink-3">{t('studio3d.material.title')}</legend>
   <svg data-testid="studio3d-material-swatch" role="img" aria-label={t('studio3d.material.swatch')} width="32" height="32" viewBox="0 0 32 32" className="rounded-full border border-subtle">
    {(()=>{const sw=materialSwatch(o.material!);return <>
     <circle cx="16" cy="16" r="15" fill={sw.base}/>
     {sw.glow&&<circle cx="16" cy="16" r="15" fill={sw.glow.color} opacity={sw.glow.opacity}/>}
     <circle cx="11" cy="10" r={sw.highlight.r} fill={sw.highlight.color} opacity={sw.highlight.opacity}/>
    </>;})()}
   </svg>
   <div className="flex flex-wrap gap-1" role="group" aria-label={t('studio3d.material.presets')} data-testid="studio3d-material-presets">{MATERIAL_PRESETS.map(p=><Button key={p.id} variant="outline" draggable onDragStart={e=>{e.dataTransfer.setData(ASSET_MIME,assetDragData({kind:'preset',preset:p.id}));e.dataTransfer.effectAllowed='copy';}} onClick={()=>void executeCommand('studio3d.object.material',{id:o.id,preset:p.id})}>{t('studio3d.material.preset.'+p.id)}</Button>)}</div>
   <MaterialUserPresets id={o.id}/>
   <div className="flex gap-1" data-testid="studio3d-material-copy-paste">
    <Button variant="outline" onClick={()=>void executeCommand('studio3d.material.copy',{id:o.id})}>{t('studio3d.material.copy')}</Button>
    <Button variant="outline" onClick={()=>void executeCommand('studio3d.material.paste',{id:o.id})}>{t('studio3d.material.paste')}</Button></div>
   <label className="flex items-center justify-between gap-2 text-xs text-ink-2">{t('studio3d.material.color')}<input type="color" key={o.material.color} defaultValue={o.material.color} onBlur={e=>{if(e.currentTarget.value!==o.material!.color)void executeCommand('studio3d.object.material',{id:o.id,color:e.currentTarget.value});}}/></label>
   {(['metalness','roughness'] as const).map(k=><label key={k} className="grid gap-1 text-xs text-ink-2">{t('studio3d.material.'+k)} <span className="text-ink-3">{o.material![k].toFixed(2)}</span>
    <input type="range" min={0} max={1} step={0.01} defaultValue={o.material![k]} key={k+o.material![k]} aria-label={t('studio3d.material.'+k)} onChange={e=>void executeCommand('studio3d.object.material',{id:o.id,[k]:Number(e.currentTarget.value)})}/></label>)}
   <div className="grid gap-2" data-testid="studio3d-pbr-extras">
    <label className="flex items-center justify-between gap-2 text-xs text-ink-2">{t('studio3d.material.emissive')}<NativeInput type="color" key={'e'+o.material.emissive} defaultValue={o.material.emissive} onBlur={e=>{if(e.currentTarget.value!==o.material!.emissive)void executeCommand('studio3d.object.material',{id:o.id,emissive:e.currentTarget.value});}}/></label>
    <NumField resetKey={o.id} label={t('studio3d.material.emissiveIntensity')} value={o.material.emissiveIntensity??1} min={0} max={MAX_EMISSIVE_INTENSITY} step={0.1} onCommit={v=>void executeCommand('studio3d.object.material',{id:o.id,emissiveIntensity:v})}/>
    <label className="grid gap-1 text-xs text-ink-2">{t('studio3d.material.opacity')} <span className="text-ink-3">{(o.material.opacity??1).toFixed(2)}</span>
     <NativeInput type="range" min={0} max={1} step={0.01} defaultValue={o.material.opacity??1} key={'o'+o.material.opacity} aria-label={t('studio3d.material.opacity')} onChange={e=>void executeCommand('studio3d.object.material',{id:o.id,opacity:Number(e.currentTarget.value)})}/></label>
    <label className="grid gap-1 text-xs text-ink-2">{t('studio3d.material.alphaMode')}
     <NativeSelect className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={o.material.alphaMode??'opaque'} aria-label={t('studio3d.material.alphaMode')} onChange={e=>void executeCommand('studio3d.object.material',{id:o.id,alphaMode:e.currentTarget.value})}>
      {ALPHA_MODES.map(m=><option key={m} value={m}>{t('studio3d.material.alpha.'+m)}</option>)}</NativeSelect></label>
    {o.material.alphaMode==='mask'&&<NumField resetKey={o.id} label={t('studio3d.material.alphaCutoff')} value={o.material.alphaCutoff??0.5} min={0} max={1} step={0.05} onCommit={v=>void executeCommand('studio3d.object.material',{id:o.id,alphaCutoff:v})}/>}
    <label className="flex items-center gap-2 text-xs text-ink-2"><NativeInput type="checkbox" checked={!!o.material.doubleSided} onChange={e=>void executeCommand('studio3d.object.material',{id:o.id,doubleSided:e.currentTarget.checked})}/>{t('studio3d.material.doubleSided')}</label>
   </div>
   <fieldset className="m-0 grid gap-1 border-0 p-0" data-testid="studio3d-textures"><legend className="text-xs text-ink-3">{t('studio3d.texture.title')}</legend>
    {TEXTURE_SLOTS.map(slot=>{const name=o.material!.textures?.[slot]??null;return <div key={slot} className="flex items-center gap-1 text-xs text-ink-2" data-testid={'studio3d-texture-'+slot}
     onDragOver={e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();e.dataTransfer.dropEffect='copy';}}}
     onDrop={e=>{const f=e.dataTransfer.files?.[0];if(!f)return;e.preventDefault();dropTextureFile(slot,f);}}>
     {name&&<TextureThumb id={o.id} slot={slot} name={name}/>}
     <span className="w-20 shrink-0">{t('studio3d.texture.'+slot)}</span><span className="min-w-0 flex-1 truncate text-ink-3" title={name??''}>{name??t('studio3d.texture.none')}</span>
     <Button variant="outline" onClick={()=>void executeCommand('studio3d.texture.open',{slot})}>{t('studio3d.texture.choose')}</Button>
     <Button variant="outline" disabled={!name} onClick={()=>void executeCommand('studio3d.texture.clear',{id:o.id,slot})}>{t('studio3d.texture.clear')}</Button></div>;})}
   <div className="flex flex-wrap items-center gap-1"><NativeSelect className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={tgKind} aria-label={t('studio3d.texture.generateKind')} onChange={e=>setTgKind(e.currentTarget.value as 'checker'|'grid'|'stripes'|'noise')}>
    {(['checker','grid','stripes','noise'] as const).map(k=><option key={k} value={k}>{t('studio3d.texture.kind.'+k)}</option>)}</NativeSelect>
   <NativeInput type="number" min={1} max={64} step={1} value={tgScale} aria-label={t('studio3d.texture.generateScale')} className="w-16" onChange={e=>setTgScale(Math.min(64,Math.max(1,Number(e.currentTarget.value)||8)))}/>
   <NativeInput type="color" value={tgA} aria-label={t('studio3d.texture.generateColorA')} className="h-7 w-9" onChange={e=>setTgA(e.currentTarget.value)}/>
   <NativeInput type="color" value={tgB} aria-label={t('studio3d.texture.generateColorB')} className="h-7 w-9" onChange={e=>setTgB(e.currentTarget.value)}/>
   <Button variant="outline" onClick={()=>void executeCommand('studio3d.texture.generate',{kind:tgKind,slot:'color',scale:tgScale,colorA:tgA,colorB:tgB})}>{t('studio3d.texture.generate')}</Button></div>
    {TEXTURE_SLOTS.map(slot=>{const tr=o.material!.transforms?.[slot];if(!tr)return null;const set=(p:Record<string,number>)=>void executeCommand('studio3d.texture.transform',{id:o.id,slot,...p});
     return <details key={slot} className="text-xs text-ink-2" data-testid={'studio3d-uv-'+slot}><summary className="cursor-pointer">{t('studio3d.uv.title',{slot:t('studio3d.texture.'+slot)})}</summary>
      <div className="grid grid-cols-2 gap-2 pt-1">
       <NumField resetKey={o.id+slot+tr.offsetX} label={t('studio3d.uv.offsetX')} value={tr.offsetX} min={-100} max={100} step={0.05} onCommit={v=>set({offsetX:v})}/>
       <NumField resetKey={o.id+slot+tr.offsetY} label={t('studio3d.uv.offsetY')} value={tr.offsetY} min={-100} max={100} step={0.05} onCommit={v=>set({offsetY:v})}/>
       <NumField resetKey={o.id+slot+tr.scaleX} label={t('studio3d.uv.scaleX')} value={tr.scaleX} min={-1000} max={1000} step={0.1} onCommit={v=>set({scaleX:v})}/>
       <NumField resetKey={o.id+slot+tr.scaleY} label={t('studio3d.uv.scaleY')} value={tr.scaleY} min={-1000} max={1000} step={0.1} onCommit={v=>set({scaleY:v})}/>
       <NumField resetKey={o.id+slot+tr.rotation} label={t('studio3d.uv.rotation')} value={tr.rotation} min={-360} max={360} step={5} onCommit={v=>set({rotation:v})}/>
       <Button variant="outline" onClick={()=>set({reset:true} as never)}>{t('studio3d.uv.reset')}</Button></div></details>;})}
    <p className="m-0 text-xs text-ink-3">{t('studio3d.texture.note')}</p></fieldset>
  </fieldset>}
  {s.bones.length>0&&o.kind==='mesh'&&<SkinningFields id={o.id} skinned={o.skinned}/>}
  {o.kind==='mesh'&&!o.skinned&&<EditSculptFields id={o.id}/>}
  {o.kind==='mesh'&&<UvFields id={o.id}/>}
  {s.bones.length>0&&(o.kind==='bone'||o.skinned)&&<PoseFields id={o.id}/>}
  {o.kind==='bone'&&<IkFields id={o.id}/>}
  {o.kind==='pin'&&<div className="grid gap-1" data-testid="studio3d-pin-fields">
   <label className="grid gap-1 text-xs text-ink-2">{t('studio3d.pin.text')}
    <Input key={o.id+':pin'} defaultValue={o.pin??''} aria-label={t('studio3d.pin.text')} onBlur={e=>{const v=e.currentTarget.value;if(v!==(o.pin??''))void executeCommand('studio3d.pin.set',{id:o.id,text:v});}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/></label></div>}
  {o.kind==='bone'&&<FabrikFields/>}
  {o.kind==='bone'&&<LimitFields id={o.id}/>}
  <div className="flex gap-2"><Button variant="outline" onClick={()=>void executeCommand('studio3d.object.duplicate',{id:o.id})}>{t('studio3d.object.duplicate')}</Button>
   <Button variant="outline" onClick={()=>void executeCommand('studio3d.object.delete',{id:o.id})}>{t('studio3d.object.delete')}</Button></div>
 </div>;
}
/** UV tools: seam marking in edit mode, box unwrap and planar projection, checker preview and a read-only island view. */
function UvFields({id}:{id:number}){
 const {t}=useT();const s=useStudio3D();const o=s.selectedInfo;
 const [axis,setAxis]=useState<'x'|'y'|'z'>('z');
 const [method,setMethod]=useState<'box'|'angle'>('box');const [pack,setPack]=useState(true);const [padding,setPadding]=useState(0.02);
 const layout=s.uvView;
 const sig=`${id}:${layout?layout.islands.length:0}:${o?.uv?.seams??0}:${layout?layout.uv[0]:''}:${layout?layout.uv[layout.uv.length-1]:''}`;
 const polys=useMemo(()=>{
  if(!layout)return null;
  const isl=layout.islands;const uv=layout.uv;
  const out:{points:string;island:number}[]=[];
  for(let f=0;f<isl.length;f++)out.push({points:`${uv[f*3][0]},${-uv[f*3][1]} ${uv[f*3+1][0]},${-uv[f*3+1][1]} ${uv[f*3+2][0]},${-uv[f*3+2][1]}`,island:isl[f]});
  return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- sig captures what the polygons depend on
 },[sig]);
 if(!o||o.kind!=='mesh'||!o.uv)return null;
 const ed=s.edit;const on=ed!=null&&ed.id===id;
 return <fieldset className="m-0 grid gap-2 border-0 p-0" data-testid="studio3d-uvtools"><legend className="text-xs text-ink-3">{t('studio3d.uvtools.title')}</legend>
  <p className="m-0 text-xs text-ink-3">{t('studio3d.uvtools.counts',{islands:o.uv.islands,seams:o.uv.seams})}</p>
  {on&&ed.mode==='edge'&&<div className="flex flex-wrap gap-1">
   <Button variant="outline" onClick={()=>void executeCommand('studio3d.uv.seam',{mark:true})}>{t('studio3d.uvtools.mark')}</Button>
   <Button variant="outline" onClick={()=>void executeCommand('studio3d.uv.seam',{mark:false})}>{t('studio3d.uvtools.unmark')}</Button>
  </div>}
  {on&&ed.mode!=='edge'&&<p className="m-0 text-xs text-ink-3">{t('studio3d.uvtools.edgeHint')}</p>}
  {!on&&<>
   <div className="flex flex-wrap items-center gap-1">
    <NativeSelect className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={method} aria-label={t('studio3d.uvtools.method')} onChange={e=>setMethod(e.currentTarget.value as 'box'|'angle')}>
     {(['box','angle'] as const).map(mm=><option key={mm} value={mm}>{t('studio3d.uvtools.method.'+mm)}</option>)}</NativeSelect>
    <Button variant="outline" onClick={()=>void executeCommand('studio3d.uv.unwrap',{id,method,pack,padding})}>{t('studio3d.uvtools.unwrap')}</Button>
   </div>
   <label className="flex items-center gap-2 text-xs text-ink-2"><NativeInput type="checkbox" checked={pack} onChange={e=>setPack(e.currentTarget.checked)}/>{t('studio3d.uvtools.pack')}</label>
   {pack&&<NumField label={t('studio3d.uvtools.padding')} value={padding} min={0} max={0.2} step={0.005} onCommit={setPadding}/>}
   <div className="flex gap-1">
    <NativeSelect className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={axis} aria-label={t('studio3d.uvtools.axis')} onChange={e=>setAxis(e.currentTarget.value as 'x'|'y'|'z')}>
     {(['x','y','z'] as const).map(a=><option key={a} value={a}>{t('studio3d.sculpt.symmetry.'+a)}</option>)}</NativeSelect>
    <Button variant="outline" onClick={()=>void executeCommand('studio3d.uv.planar',{id,axis})}>{t('studio3d.uvtools.planar')}</Button>
   </div></>}
  <label className="flex items-center gap-2 text-xs text-ink-2"><NativeInput type="checkbox" checked={s.uvChecker} onChange={e=>void executeCommand('studio3d.uv.preview',{on:e.currentTarget.checked})}/>{t('studio3d.uvtools.preview')}</label>
  {o.uv.hasUv&&polys&&<svg viewBox="0 -1 1 1" className="h-32 w-full rounded-sm border border-subtle bg-surface" role="img" aria-label={t('studio3d.uvtools.islands')} data-testid="studio3d-uv-islands">
   {polys.map((p,f)=><polygon key={f} points={p.points} fill="none" stroke={`hsl(${(p.island*67)%360} 70% 55%)`} strokeWidth={1} vectorEffect="non-scaling-stroke"/>)}
  </svg>}
  {o.uv.hasUv&&!polys&&<p className="m-0 text-xs text-ink-3">{t('studio3d.uvtools.tooLarge')}</p>}
  {!o.uv.hasUv&&<p className="m-0 text-xs text-ink-3">{t('studio3d.uvtools.noUv')}</p>}
 </fieldset>;
}

/** Bind a plain mesh to a bone chain, recompute weights of a skinned one, and preview a bone's influence. */
function EditSculptFields({id}:{id:number}){
 const {t}=useT();const s=useStudio3D();const o=s.selectedInfo;
 const [extrude,setExtrude]=useState(0.5);const [inset,setInset]=useState(0.2);const [bevel,setBevel]=useState(0.1);const [slide,setSlide]=useState(0.5);const [merge,setMerge]=useState(0.01);const [mirrorAxis,setMirrorAxis]=useState<'x'|'y'|'z'>('x');const [segments,setSegments]=useState(1);const [bisect,setBisect]=useState(false);const [fattenAmt,setFattenAmt]=useState(0.1);const [relaxIt,setRelaxIt]=useState(1);const [relaxF,setRelaxF]=useState(0.5);const [sphereF,setSphereF]=useState(1);const [randAmt,setRandAmt]=useState(0.1);const [randSeed,setRandSeed]=useState(1);const [moveX,setMoveX]=useState(0);const [moveY,setMoveY]=useState(0.25);const [moveZ,setMoveZ]=useState(0);const [rotDeg,setRotDeg]=useState(90);const [scaleX,setScaleX]=useState(1);const [scaleY,setScaleY]=useState(1);const [scaleZ,setScaleZ]=useState(1);const [mergeDist,setMergeDist]=useState(0.001);const [shearAlong,setShearAlong]=useState<'x'|'y'|'z'>('x');const [shearBy,setShearBy]=useState<'x'|'y'|'z'>('y');const [shearAmt,setShearAmt]=useState(0.5);
 const ed=s.edit;const on=ed!=null&&ed.id===id;const sc=s.sculpt;
 if(!o||o.kind!=='mesh')return null;
 const modeBtn=(m:'vertex'|'edge'|'face')=><Button key={m} variant={ed?.mode===m?'primary':'outline'} aria-pressed={ed?.mode===m} onClick={()=>void executeCommand('studio3d.edit.mode',{mode:m})}>{t('studio3d.edit.mode.'+m)}</Button>;
 return <>
  <fieldset className="m-0 grid gap-2 border-0 p-0" data-testid="studio3d-edit"><legend className="text-xs text-ink-3">{t('studio3d.edit.title')}</legend>
   {!on&&<Button variant="outline" onClick={()=>void executeCommand('studio3d.edit.start',{id,mode:'face'})}>{t('studio3d.edit.start')}</Button>}
   {on&&<>
    <div className="flex flex-wrap gap-1" role="group" aria-label={t('studio3d.edit.modes')}>{modeBtn('vertex')}{modeBtn('edge')}{modeBtn('face')}</div>
    <p className="m-0 text-xs text-ink-3">{t('studio3d.edit.counts',{v:ed.verts,e:ed.edges,f:ed.faces})}</p>
    <div className="flex flex-wrap gap-1" role="group" aria-label={t('studio3d.edit.selTools')}>
     <Button variant="outline" onClick={()=>void executeCommand('studio3d.edit.selectAll',{op:'all'})}>{t('studio3d.edit.selAll')}</Button>
     <Button variant="outline" onClick={()=>void executeCommand('studio3d.edit.selectAll',{op:'none'})}>{t('studio3d.edit.selNone')}</Button>
     <Button variant="outline" onClick={()=>void executeCommand('studio3d.edit.selectAll',{op:'invert'})}>{t('studio3d.edit.selInvert')}</Button>
     <Button variant="outline" onClick={()=>void executeCommand('studio3d.edit.selectGrow',{})}>{t('studio3d.edit.selGrow')}</Button>
     <Button variant="outline" onClick={()=>void executeCommand('studio3d.edit.selectGrow',{shrink:true})}>{t('studio3d.edit.selShrink')}</Button>
     <Button variant="outline" onClick={()=>void executeCommand('studio3d.edit.selectBoundary',{kind:'edge'})}>{t('studio3d.edit.selBoundary')}</Button>
     <Button variant="outline" onClick={()=>void executeCommand('studio3d.edit.selectLinked',{})}>{t('studio3d.edit.selLinked')}</Button>
     <Button variant="outline" onClick={()=>void executeCommand('studio3d.edit.selectSharp',{})}>{t('studio3d.edit.selSharp')}</Button>
     <Button variant="outline" onClick={()=>void executeCommand('studio3d.edit.selectSimilar',{})}>{t('studio3d.edit.selSimilar')}</Button>
    </div>
    <div className="grid grid-cols-2 gap-2">
     <NumField label={t('studio3d.edit.extrude')} value={extrude} min={-10} max={10} step={0.1} onCommit={setExtrude}/>
     <NumField label={t('studio3d.edit.inset')} value={inset} min={0} max={0.95} step={0.05} onCommit={setInset}/>
     <NumField label={t('studio3d.edit.bevel')} value={bevel} min={0.01} max={2} step={0.05} onCommit={setBevel}/>
     <NumField label={t('studio3d.edit.loopSlide')} value={slide} min={-1.5} max={1.5} step={0.1} onCommit={setSlide}/>
     <NumField label={t('studio3d.edit.segments')} value={segments} min={1} max={8} step={1} onCommit={v=>setSegments(Math.round(v))}/>
     <NumField label={t('studio3d.edit.fatten')} value={fattenAmt} min={-10} max={10} step={0.05} onCommit={setFattenAmt}/>
     <NumField label={t('studio3d.edit.relaxIt')} value={relaxIt} min={1} max={50} step={1} onCommit={v=>setRelaxIt(Math.round(v))}/>
     <NumField label={t('studio3d.edit.relaxFactor')} value={relaxF} min={0.01} max={1} step={0.05} onCommit={setRelaxF}/>
     <NumField label={t('studio3d.edit.toSphere')} value={sphereF} min={-10} max={10} step={0.05} onCommit={setSphereF}/>
     <NumField label={t('studio3d.edit.randomize')} value={randAmt} min={-10} max={10} step={0.05} onCommit={setRandAmt}/>
     <NumField label={t('studio3d.edit.randomSeed')} value={randSeed} min={1} max={1000000000} step={1} onCommit={v=>setRandSeed(Math.round(v))}/>
     <NumField label={t('studio3d.edit.moveX')} value={moveX} min={-100} max={100} step={0.05} onCommit={setMoveX}/>
     <NumField label={t('studio3d.edit.moveY')} value={moveY} min={-100} max={100} step={0.05} onCommit={setMoveY}/>
     <NumField label={t('studio3d.edit.moveZ')} value={moveZ} min={-100} max={100} step={0.05} onCommit={setMoveZ}/>
     <NumField label={t('studio3d.edit.rotateDeg')} value={rotDeg} min={-3600} max={3600} step={5} onCommit={setRotDeg}/>
     <NumField label={t('studio3d.edit.scaleX')} value={scaleX} min={-100} max={100} step={0.05} onCommit={setScaleX}/>
     <NumField label={t('studio3d.edit.scaleY')} value={scaleY} min={-100} max={100} step={0.05} onCommit={setScaleY}/>
     <NumField label={t('studio3d.edit.scaleZ')} value={scaleZ} min={-100} max={100} step={0.05} onCommit={setScaleZ}/>
     <NumField label={t('studio3d.edit.shearAmt')} value={shearAmt} min={-10} max={10} step={0.05} onCommit={setShearAmt}/>
     <NumField label={t('studio3d.edit.mergeDist')} value={mergeDist} min={0.00001} max={10} step={0.001} onCommit={setMergeDist}/>
    </div>
    <div className="flex flex-wrap gap-1">
     <Button variant="outline" onClick={()=>void executeCommand('studio3d.edit.extrude',{offset:extrude})}>{t('studio3d.edit.extrude')}</Button>
     <Button variant="outline" onClick={()=>void executeCommand('studio3d.edit.inset',{amount:inset})}>{t('studio3d.edit.inset')}</Button>
     <Button variant="outline" onClick={()=>void executeCommand('studio3d.edit.bevel',{width:bevel})}>{t('studio3d.edit.bevel')}</Button>
     <Button variant="outline" onClick={()=>void executeCommand('studio3d.edit.bevelEdge',{width:bevel,segments})}>{t('studio3d.edit.bevelEdge')}</Button>
     <Button variant="outline" onClick={()=>void executeCommand('studio3d.edit.loopCut')}>{t('studio3d.edit.loopCut')}</Button>
     <Button variant="outline" onClick={()=>void executeCommand('studio3d.edit.loopSlide',{factor:slide})}>{t('studio3d.edit.loopSlide')}</Button>
     <Button variant="outline" onClick={()=>void executeCommand('studio3d.edit.delete',{})}>{t('studio3d.edit.delete')}</Button>
     <Button variant="outline" onClick={()=>void executeCommand('studio3d.edit.weld',{})}>{t('studio3d.edit.weld')}</Button>
     <Button variant="outline" onClick={()=>void executeCommand('studio3d.edit.subdivide',{})}>{t('studio3d.edit.subdivide')}</Button>
     <Button variant="outline" onClick={()=>void executeCommand('studio3d.edit.poke',{})}>{t('studio3d.edit.poke')}</Button>
     <Button variant="outline" onClick={()=>void executeCommand('studio3d.edit.duplicate',{})}>{t('studio3d.edit.duplicate')}</Button>
     <Button variant="outline" onClick={()=>void executeCommand('studio3d.edit.fatten',{amount:fattenAmt})}>{t('studio3d.edit.fatten')}</Button>
     <Button variant="outline" onClick={()=>void executeCommand('studio3d.edit.relax',{iterations:relaxIt,factor:relaxF})}>{t('studio3d.edit.relax')}</Button>
     <Button variant="outline" onClick={()=>void executeCommand('studio3d.edit.flip',{})}>{t('studio3d.edit.flip')}</Button>
     <Button variant="outline" onClick={()=>void executeCommand('studio3d.edit.dissolve',{})}>{t('studio3d.edit.dissolve')}</Button>
     <Button variant="outline" onClick={()=>void executeCommand('studio3d.edit.fill',{})}>{t('studio3d.edit.fill')}</Button>
     <Button variant="outline" onClick={()=>void executeCommand('studio3d.edit.collapse',{})}>{t('studio3d.edit.collapse')}</Button>
     <Button variant="outline" onClick={()=>void executeCommand('studio3d.edit.toSphere',{factor:sphereF})}>{t('studio3d.edit.toSphere')}</Button>
     <Button variant="outline" onClick={()=>void executeCommand('studio3d.edit.randomize',{amount:randAmt,seed:randSeed})}>{t('studio3d.edit.randomize')}</Button>
     <Button variant="outline" onClick={()=>void executeCommand('studio3d.edit.move',{x:moveX,y:moveY,z:moveZ})}>{t('studio3d.edit.move')}</Button>
     <Button variant="outline" onClick={()=>void executeCommand('studio3d.edit.rotate',{axis:'x',degrees:rotDeg})}>{t('studio3d.edit.rotateX')}</Button>
     <Button variant="outline" onClick={()=>void executeCommand('studio3d.edit.rotate',{axis:'y',degrees:rotDeg})}>{t('studio3d.edit.rotateY')}</Button>
     <Button variant="outline" onClick={()=>void executeCommand('studio3d.edit.rotate',{axis:'z',degrees:rotDeg})}>{t('studio3d.edit.rotateZ')}</Button>
     <Button variant="outline" onClick={()=>void executeCommand('studio3d.edit.scale',{x:scaleX,y:scaleY,z:scaleZ})}>{t('studio3d.edit.scale')}</Button>
     <NativeSelect className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={shearAlong} aria-label={t('studio3d.edit.shearAlong')} onChange={e=>setShearAlong(e.currentTarget.value as 'x'|'y'|'z')}>
      {(['x','y','z'] as const).map(a=><option key={a} value={a}>{t('studio3d.sculpt.symmetry.'+a)}</option>)}</NativeSelect>
     <NativeSelect className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={shearBy} aria-label={t('studio3d.edit.shearBy')} onChange={e=>setShearBy(e.currentTarget.value as 'x'|'y'|'z')}>
      {(['x','y','z'] as const).map(a=><option key={a} value={a}>{t('studio3d.sculpt.symmetry.'+a)}</option>)}</NativeSelect>
     <Button variant="outline" onClick={()=>void executeCommand('studio3d.edit.shear',{along:shearAlong,by:shearBy,factor:shearAmt})}>{t('studio3d.edit.shear')}</Button>
     <Button variant="outline" onClick={()=>void executeCommand('studio3d.edit.flipEdge',{})}>{t('studio3d.edit.flipEdge')}</Button>
     <Button variant="outline" onClick={()=>void executeCommand('studio3d.edit.mergeByDistance',{distance:mergeDist})}>{t('studio3d.edit.mergeByDistance')}</Button>
     <Button variant="outline" onClick={()=>void executeCommand('studio3d.edit.rip',{})}>{t('studio3d.edit.rip')}</Button>
     <Button variant="outline" onClick={()=>void executeCommand('studio3d.edit.separate',{})}>{t('studio3d.edit.separate')}</Button>
     <Button variant="outline" onClick={()=>void executeCommand('studio3d.edit.end')}>{t('studio3d.edit.end')}</Button>
    </div></>}
  </fieldset>
  <fieldset className="m-0 grid gap-2 border-0 p-0" data-testid="studio3d-sculpt"><legend className="text-xs text-ink-3">{t('studio3d.sculpt.title')}</legend>
   <label className="flex items-center gap-2 text-xs text-ink-2"><NativeInput type="checkbox" checked={sc.on} onChange={e=>void executeCommand('studio3d.sculpt.brush',{on:e.currentTarget.checked})}/>{t('studio3d.sculpt.on')}</label>
   {sc.on&&<>
    <NativeSelect className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={sc.brush} aria-label={t('studio3d.sculpt.brush')} onChange={e=>void executeCommand('studio3d.sculpt.brush',{brush:e.currentTarget.value})}>
     {(['grab','smooth','inflate','crease','pinch','flatten','mask'] as const).map(b=><option key={b} value={b}>{t('studio3d.sculpt.brush.'+b)}</option>)}</NativeSelect>
    <div className="grid grid-cols-2 gap-2">
     <NumField label={t('studio3d.sculpt.radius')} value={sc.radius} min={0.05} max={10} step={0.05} onCommit={v=>void executeCommand('studio3d.sculpt.brush',{radius:v})}/>
     <NumField label={t('studio3d.sculpt.strength')} value={sc.strength} min={0.05} max={1} step={0.05} onCommit={v=>void executeCommand('studio3d.sculpt.brush',{strength:v})}/>
    </div>
    <NativeSelect className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={sc.symmetry} aria-label={t('studio3d.sculpt.symmetry')} onChange={e=>void executeCommand('studio3d.sculpt.brush',{symmetry:e.currentTarget.value})}>
     {(['none','x','y','z'] as const).map(m=><option key={m} value={m}>{t('studio3d.sculpt.symmetry.'+m)}</option>)}</NativeSelect>
    <p className="m-0 text-xs text-ink-3">{t(sc.brush==='mask'?'studio3d.sculpt.maskHint':'studio3d.sculpt.hint')}</p>
    {sc.brush==='mask'&&<Button variant="outline" onClick={()=>void executeCommand('studio3d.sculpt.maskClear',{id})}>{t('studio3d.sculpt.maskClear')}</Button>}
   </>}
  </fieldset>
  <fieldset className="m-0 grid gap-2 border-0 p-0" data-testid="studio3d-mirror"><legend className="text-xs text-ink-3">{t('studio3d.mirror.title')}</legend>
   {!o.mirror&&<>
    <NativeSelect className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={mirrorAxis} aria-label={t('studio3d.mirror.axis')} onChange={e=>setMirrorAxis(e.currentTarget.value as 'x'|'y'|'z')}>
     {(['x','y','z'] as const).map(a=><option key={a} value={a}>{t('studio3d.sculpt.symmetry.'+a)}</option>)}</NativeSelect>
    <NumField label={t('studio3d.mirror.merge')} value={merge} min={0} max={1} step={0.005} onCommit={setMerge}/>
    <label className="flex items-center gap-2 text-xs text-ink-2"><NativeInput type="checkbox" checked={bisect} onChange={e=>setBisect(e.currentTarget.checked)}/>{t('studio3d.mirror.bisect')}</label>
    <Button variant="outline" onClick={()=>void executeCommand('studio3d.mesh.mirrorMod',{id,axis:mirrorAxis,merge,on:true,bisect})}>{t('studio3d.mirror.on')}</Button></>}
   {o.mirror&&<>
    <p className="m-0 text-xs text-ink-3">{t('studio3d.mirror.active',{axis:o.mirror.axis.toUpperCase()})}</p>
    <Button variant="outline" onClick={()=>void executeCommand('studio3d.mesh.mirrorMod',{id,axis:o.mirror!.axis,merge:o.mirror!.merge,on:false})}>{t('studio3d.mirror.off')}</Button></>}
  </fieldset></>;
}

function SkinningFields({id,skinned}:{id:number;skinned:boolean}){
 const {t}=useT();const s=useStudio3D();
 const roots=s.bones.filter(b=>b.depth===0);const [bone,setBone]=useState(roots[0]?.id??s.bones[0]?.id??0);
 const indent=(name:string,depth:number)=>'\u00a0\u00a0'.repeat(depth)+name;
 return <fieldset className="m-0 grid gap-2 border-0 p-0" data-testid="studio3d-skinning"><legend className="text-xs text-ink-3">{t('studio3d.skinning.title')}</legend>
  {!skinned&&<>
   <NativeSelect className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={bone} aria-label={t('studio3d.skeleton.bone')} onChange={e=>setBone(Number(e.currentTarget.value))}>
    {roots.map(b=><option key={b.id} value={b.id}>{indent(b.name,b.depth)}</option>)}</NativeSelect>
   <div className="flex flex-wrap gap-1">
    <Button variant="outline" onClick={()=>void executeCommand('studio3d.skin.bind',{id,bone,mode:'smooth'})}>{t('studio3d.skinning.bindSmooth')}</Button>
    <Button variant="outline" onClick={()=>void executeCommand('studio3d.skin.bind',{id,bone,mode:'rigid'})}>{t('studio3d.skinning.bindRigid')}</Button></div></>}
  {skinned&&<>
   <div className="flex flex-wrap gap-1">
    <Button variant="outline" onClick={()=>void executeCommand('studio3d.skin.reweight',{id,mode:'smooth'})}>{t('studio3d.skinning.reSmooth')}</Button>
    <Button variant="outline" onClick={()=>void executeCommand('studio3d.skin.reweight',{id,mode:'rigid'})}>{t('studio3d.skinning.reRigid')}</Button></div>
   <NativeSelect className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={s.weightPreview??''} aria-label={t('studio3d.skinning.preview')} onChange={e=>void executeCommand('studio3d.skin.preview',{bone:e.currentTarget.value===''?null:Number(e.currentTarget.value)})}>
    <option value="">{t('studio3d.skinning.off')}</option>
    {s.bones.map(b=><option key={b.id} value={b.id}>{indent(b.name,b.depth)}</option>)}</NativeSelect>
   <label className="flex items-center gap-2 text-xs text-ink-2"><NativeInput type="checkbox" checked={s.weightBrush.on} onChange={e=>void executeCommand('studio3d.skin.brush',{on:e.currentTarget.checked})}/>{t('studio3d.skinning.paint')}</label>
   {s.weightBrush.on&&<>
    <NativeSelect className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={s.weightBrush.mode} aria-label={t('studio3d.skinning.mode')} onChange={e=>void executeCommand('studio3d.skin.brush',{mode:e.currentTarget.value})}>
     {(['add','subtract','smooth'] as const).map(m=><option key={m} value={m}>{t('studio3d.skinning.mode.'+m)}</option>)}</NativeSelect>
    <label className="grid gap-1 text-xs text-ink-2">{t('studio3d.skinning.radius')} <span className="text-ink-3">{s.weightBrush.radius.toFixed(2)}</span>
     <NativeInput type="range" min={0.01} max={2} step={0.01} value={s.weightBrush.radius} aria-label={t('studio3d.skinning.radius')} onChange={e=>void executeCommand('studio3d.skin.brush',{radius:Number(e.currentTarget.value)})}/></label>
    <label className="grid gap-1 text-xs text-ink-2">{t('studio3d.skinning.strength')} <span className="text-ink-3">{s.weightBrush.strength.toFixed(2)}</span>
     <NativeInput type="range" min={0.01} max={1} step={0.01} value={s.weightBrush.strength} aria-label={t('studio3d.skinning.strength')} onChange={e=>void executeCommand('studio3d.skin.brush',{strength:Number(e.currentTarget.value)})}/></label>
    <NativeSelect className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={s.weightBrush.falloff} aria-label={t('studio3d.skinning.falloff')} onChange={e=>void executeCommand('studio3d.skin.brush',{falloff:e.currentTarget.value})}>
     {(['smooth','linear','constant'] as const).map(f=><option key={f} value={f}>{t('studio3d.skinning.falloff.'+f)}</option>)}</NativeSelect></>}</>}
 </fieldset>;
}
/** FK/IK switch for the chain the selected bone belongs to; the target and pole gizmos live in the viewport. */
function IkFields({id}:{id:number}){
 const {t}=useT();const s=useStudio3D();
 if(!s.ik)return null;
 return <fieldset className="m-0 grid gap-2 border-0 p-0" data-testid="studio3d-ik"><legend className="text-xs text-ink-3">{t('studio3d.ik.title')}</legend>
  <label className="flex items-center gap-2 text-xs text-ink-2"><NativeInput type="checkbox" checked={s.ik.on} onChange={e=>void executeCommand('studio3d.ik.toggle',{id,on:e.currentTarget.checked})}/>{t('studio3d.ik.on')}</label>
  {s.ik.on&&<p className="m-0 text-xs text-ink-3">{t('studio3d.ik.hint')}</p>}
 </fieldset>;
}
/** Retarget review: pick a source rig to preview its clip pose on the selected rig, or bake it as a new clip. */
function RetargetFields({targetId}:{targetId:number}){
 const {t}=useT();const s=useStudio3D();
 const[src,setSrc]=useState<number|null>(null);
 const rigs=s.rigs.filter(r=>r.id!==targetId);
 if(rigs.length===0)return null;
 return <div className="flex flex-wrap items-center gap-2" data-testid="studio3d-retarget">
  <span className="text-xs text-ink-3">{t('studio3d.retarget.title')}</span>
  <NativeSelect className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={src??''} aria-label={t('studio3d.retarget.source')} onChange={e=>{const v=e.currentTarget.value;const id=v?Number(v):null;setSrc(id);if(id!=null)void executeCommand('studio3d.retarget.preview',{source:id});}}>
   <option value="">{t('studio3d.retarget.source')}</option>
   {rigs.map(r=><option key={r.id} value={r.id}>{r.name||'Rig'}</option>)}</NativeSelect>
  {src!=null&&<Button variant="outline" onClick={()=>void executeCommand('studio3d.retarget.apply',{source:src})}>{t('studio3d.retarget.apply')}</Button>}
 </div>;
}
/** FABRIK switch and look-at for the 3+ segment chain the selected bone belongs to; the target and look gizmos live in the viewport. */
function FabrikFields(){
 const {t}=useT();const s=useStudio3D();
 if(!s.fabrik)return null;
 const id=s.fabrik.root;
 return <fieldset className="m-0 grid gap-2 border-0 p-0" data-testid="studio3d-fabrik"><legend className="text-xs text-ink-3">{t('studio3d.fabrik.title')}</legend>
  <label className="flex items-center gap-2 text-xs text-ink-2"><NativeInput type="checkbox" checked={s.fabrik.on} onChange={e=>void executeCommand('studio3d.fabrik.toggle',{id,on:e.currentTarget.checked})}/>{t('studio3d.fabrik.on')}</label>
  {s.fabrik.on&&<label className="flex items-center gap-2 text-xs text-ink-2"><NativeInput type="checkbox" checked={s.fabrik.look.on} onChange={e=>void executeCommand('studio3d.fabrik.lookat',{id,on:e.currentTarget.checked})}/>{t('studio3d.fabrik.lookat')}</label>}
  {s.fabrik.on&&<p className="m-0 text-xs text-ink-3">{t('studio3d.fabrik.hint')}</p>}
 </fieldset>;
}
/** Joint limits of the selected bone in degrees; an empty field leaves the axis open. */
function LimitFields({id}:{id:number}){
 const {t}=useT();const s=useStudio3D();
 const lim=s.boneLimits;
 const refs=useRef<Partial<Record<string,HTMLInputElement|null>>>({});
 const num=(v:number)=>Number.isNaN(v)?'':String(Math.round(v*10)/10);
 const commit=()=>{
  const grab=(side:'min'|'max'):(number|null)[]=>[0,1,2].map(i=>{
   const raw=refs.current[`${side}-${i}`]?.value.trim()??'';
   return raw===''?null:Number(raw);
  });
  const min=grab('min'),max=grab('max');
  if(min.some(v=>v!=null&&!Number.isFinite(v))||max.some(v=>v!=null&&!Number.isFinite(v)))return;
  void executeCommand('studio3d.bone.limits',{id,min,max});
 };
 // The key resets the drafts when the limits change from outside (undo, another bone).
 const limKey=`${id}-${lim?JSON.stringify(lim):'none'}`;
 return <fieldset className="m-0 grid gap-2 border-0 p-0" data-testid="studio3d-limits"><legend className="text-xs text-ink-3">{t('studio3d.limits.title')}</legend>
  {(['min','max'] as const).map(side=><div key={side} className="flex items-center gap-1"><span className="w-8 text-xs text-ink-3">{t('studio3d.limits.'+side)}</span>
   {[0,1,2].map(i=><NativeInput key={`${limKey}-${side}-${i}`} ref={el=>{refs.current[`${side}-${i}`]=el;}} type="number" step={1} className="min-w-0 flex-1 rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" data-testid={`studio3d-limit-${side}-${i}`} defaultValue={num(lim?.[side][i]??Number.NaN)} aria-label={`${t('studio3d.limits.'+side)} ${'XYZ'[i]}`} onBlur={commit}/>)}
  </div>)}
  {lim&&<Button variant="outline" onClick={()=>void executeCommand('studio3d.bone.limits',{id,min:null,max:null})}>{t('studio3d.limits.clear')}</Button>}
 </fieldset>;
}
/** Pose library of the selected rig: save, apply, mirror, remove and blend poses. */
function PoseFields({id}:{id:number}){
 const {t}=useT();const s=useStudio3D();
 const [name,setName]=useState('');const [a,setA]=useState('');const [b,setB]=useState('');const [k,setK]=useState(0.5);
 const poseOptions=(value:string,set:(v:string)=>void,label:string)=><NativeSelect className="min-w-0 flex-1 rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={value} aria-label={label} onChange={e=>set(e.currentTarget.value)}>
  <option value="">{t('studio3d.pose.pick')}</option>{s.poses.map(p=><option key={p.name} value={p.name}>{p.name}</option>)}</NativeSelect>;
 return <fieldset className="m-0 grid gap-2 border-0 p-0" data-testid="studio3d-poses"><legend className="text-xs text-ink-3">{t('studio3d.pose.title')}</legend>
  <div className="flex gap-1"><NativeInput className="min-w-0 flex-1 rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={name} maxLength={80} placeholder={t('studio3d.pose.name')} aria-label={t('studio3d.pose.name')} onChange={e=>setName(e.currentTarget.value)}/>
   <Button variant="outline" disabled={!name.trim()} onClick={()=>{void executeCommand('studio3d.pose.save',{id,name});setName('');}}>{t('studio3d.pose.save')}</Button></div>
  {s.poses.length===0?<p className="m-0 text-xs text-ink-3">{t('studio3d.pose.empty')}</p>:
   <ul className="m-0 grid list-none gap-1 p-0">{s.poses.map(p=><li key={p.name} className="flex flex-wrap items-center gap-1 text-xs text-ink-2"><span className="min-w-0 flex-1 truncate">{p.name}</span>
    <Button variant="outline" onClick={()=>void executeCommand('studio3d.pose.apply',{id,name:p.name})}>{t('studio3d.pose.apply')}</Button>
    <Button variant="outline" onClick={()=>void executeCommand('studio3d.pose.mirror',{id,name:p.name})}>{t('studio3d.pose.mirror')}</Button>
    <Button variant="outline" aria-label={`${t('studio3d.pose.remove')} ${p.name}`} onClick={()=>void executeCommand('studio3d.pose.remove',{id,name:p.name})}>{t('studio3d.pose.remove')}</Button></li>)}</ul>}
  {s.poses.length>=2&&<>
   <div className="flex gap-1">{poseOptions(a,setA,t('studio3d.pose.blendA'))}{poseOptions(b,setB,t('studio3d.pose.blendB'))}</div>
   <label className="grid gap-1 text-xs text-ink-2">{t('studio3d.pose.mix')} <span className="text-ink-3">{k.toFixed(2)}</span>
    <NativeInput type="range" min={0} max={1} step={0.05} value={k} aria-label={t('studio3d.pose.mix')} onChange={e=>setK(Number(e.currentTarget.value))}/></label>
   <Button variant="outline" disabled={!a||!b||a===b} onClick={()=>void executeCommand('studio3d.pose.blend',{id,a,b,t:k})}>{t('studio3d.pose.blend')}</Button></>}
 </fieldset>;
}
export function ViewSection(_:InspectorSectionProps){
 const {t}=useT();const s=useStudio3D();const ready=s.status==='ready';
 const [renamingView,setRenamingView]=useState<string|null>(null);
 return <div className="grid gap-2 p-3" data-testid="studio3d-view-section">
  <label className="flex items-center gap-2 text-xs text-ink-2"><input type="checkbox" checked={s.grid} onChange={e=>void executeCommand('studio3d.view.grid',{on:e.target.checked})}/>{t('studio3d.view.grid')}</label>
  <label className="flex items-center gap-2 text-xs text-ink-2"><input type="checkbox" checked={s.wireframe} disabled={!ready} onChange={e=>void executeCommand('studio3d.view.wireframe',{on:e.target.checked})}/>{t('studio3d.view.wireframe')}</label>
  <Checkbox label={t('studio3d.light.helpers')} checked={s.lightHelpers} onChange={e=>void executeCommand('studio3d.light.helpers',{on:e.currentTarget.checked})}/>
  <Checkbox label={t('studio3d.ao.toggle')} checked={s.ao.on} disabled={!ready} onChange={e=>void executeCommand('studio3d.view.ao',{on:e.currentTarget.checked})}/>
  <Checkbox label={t('studio3d.view.perf')} checked={!!s.perf} disabled={!ready} onChange={e=>void executeCommand('studio3d.view.perf',{on:e.currentTarget.checked})}/>
  {s.ao.on&&<RangeField label={t('studio3d.ao.strength')} min={0} max={1} step={0.05} value={s.ao.strength} readout={s.ao.strength.toFixed(2)} onPreview={v=>void executeCommand('studio3d.view.ao',{strength:v})} onCommit={v=>void executeCommand('studio3d.view.ao',{strength:v})} onCancel={()=>{}}/>}
  <div className="flex gap-2"><Button variant="outline" disabled={!s.canUndo} onClick={()=>void executeCommand('studio3d.undo')}>{t('studio3d.undo')}</Button><Button variant="outline" disabled={!s.canRedo} onClick={()=>void executeCommand('studio3d.redo')}>{t('studio3d.redo')}</Button></div>
  <div className="flex gap-2"><Button variant="outline" disabled={!ready} onClick={()=>void executeCommand('studio3d.view.reset')}>{t('studio3d.view.reset')}</Button>
   <Button variant="outline" disabled={!ready||s.selected==null} onClick={()=>void executeCommand('studio3d.view.frame')}>{t('studio3d.view.frame')}</Button></div>
  <div className="grid gap-1" data-testid="studio3d-view-camera">
   <label className="grid gap-1 text-xs text-ink-2">{t('studio3d.view.projection')}
    <NativeSelect className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={s.viewKind} aria-label={t('studio3d.view.projection')} onChange={e=>void executeCommand('studio3d.view.projection',{kind:e.currentTarget.value as 'perspective'|'orthographic'})}>
     <option value="perspective">{t('studio3d.view.projection.perspective')}</option><option value="orthographic">{t('studio3d.view.projection.orthographic')}</option></NativeSelect></label>
   {s.viewKind==='perspective'&&<div className="grid grid-cols-2 gap-2">
    <NumField resetKey="viewport-fov" label={t('studio3d.view.fov')} value={Number(s.viewFov.toFixed(1))} min={1} max={120} step={1} onCommit={v=>void executeCommand('studio3d.view.fov',{fov:v})}/>
    <NumField resetKey="viewport-mm" label={t('studio3d.view.focal')} value={Number(fovToFocal(s.viewFov).toFixed(0))} min={3} max={1400} step={1} onCommit={v=>void executeCommand('studio3d.view.fov',{mm:v})}/></div>}
   <Button variant="outline" disabled={!ready} aria-pressed={s.turntable} className={s.turntable?'bg-accent-soft text-accent':''} onClick={()=>void executeCommand('studio3d.view.turntable',{})}>{t('studio3d.view.turntable')}</Button>
  </div>
  <div className="flex flex-wrap gap-1" role="group" aria-label={t('studio3d.view.presets')} data-testid="studio3d-view-presets">{VIEW_PRESETS.map(p=><Button key={p} variant="outline" disabled={!ready} onClick={()=>void executeCommand('studio3d.view.preset',{preset:p})}>{t('studio3d.view.preset.'+p)}</Button>)}</div>
  <div className="grid gap-1" data-testid="studio3d-views"><Button variant="outline" disabled={!ready} onClick={()=>void executeCommand('studio3d.view.save',{})}>{t('studio3d.views.save')}</Button>
   {s.views.length>0&&<ul className="m-0 grid list-none gap-1 p-0">{s.views.map(v=><li key={v.name} className="flex flex-wrap items-center gap-1 text-xs text-ink-2">
    {renamingView===v.name?
     <Input autoFocus defaultValue={v.name} aria-label={t('studio3d.views.rename')} className="min-w-0 flex-1"
      onBlur={e=>{const n=e.currentTarget.value.trim();setRenamingView(null);if(n&&n!==v.name)void executeCommand('studio3d.view.rename',{name:v.name,to:n});}}
      onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){e.currentTarget.value=v.name;e.currentTarget.blur();}}}/>:
     <span className="min-w-0 flex-1 truncate">{v.name}</span>}
    <Button variant="outline" disabled={!ready} onClick={()=>void executeCommand('studio3d.view.apply',{name:v.name})}>{t('studio3d.views.apply')}</Button>
    <Button variant="outline" disabled={!ready} aria-label={`${t('studio3d.views.update')} ${v.name}`} onClick={()=>void executeCommand('studio3d.view.update',{name:v.name})}>{t('studio3d.views.update')}</Button>
    <Button variant="outline" disabled={!ready} aria-label={`${t('studio3d.views.rename')} ${v.name}`} onClick={()=>setRenamingView(v.name)}>{t('studio3d.views.rename')}</Button>
    <Button variant="outline" disabled={!ready} aria-label={`${t('studio3d.views.remove')} ${v.name}`} onClick={()=>void executeCommand('studio3d.view.remove',{name:v.name})}>{t('studio3d.views.remove')}</Button></li>)}</ul>}</div>
  <RenderPng/>
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
  <label className="grid gap-1 text-xs text-ink-2">{t('studio3d.env.bgMode')}
   <NativeSelect className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={e.bg} aria-label={t('studio3d.env.bgMode')}
    onChange={ev=>void executeCommand('studio3d.env.set',{bg:ev.currentTarget.value as BgMode})}>
    {BG_MODES.map(m=><option key={m} value={m}>{t('studio3d.env.bg.'+m)}</option>)}</NativeSelect></label>
  {(e.bg==='color'||e.bg==='gradient')&&<label className="flex items-center justify-between gap-2 text-xs text-ink-2">{t(e.bg==='color'?'studio3d.env.bgColor':'studio3d.env.bgTop')}<NativeInput type="color" value={e.bgColor} aria-label={t(e.bg==='color'?'studio3d.env.bgColor':'studio3d.env.bgTop')} onChange={ev=>void executeCommand('studio3d.env.set',{bgColor:ev.currentTarget.value})}/></label>}
  {e.bg==='gradient'&&<label className="flex items-center justify-between gap-2 text-xs text-ink-2">{t('studio3d.env.bgBottom')}<NativeInput type="color" value={e.bgColor2} aria-label={t('studio3d.env.bgBottom')} onChange={ev=>void executeCommand('studio3d.env.set',{bgColor2:ev.currentTarget.value})}/></label>}
  <Button variant="outline" onClick={()=>void executeCommand('studio3d.env.open')} title={ENV_ACCEPT}>{t('studio3d.env.open')}</Button>
  <fieldset className="m-0 grid gap-1 border-0 p-0" data-testid="studio3d-shadow-settings"><legend className="text-xs text-ink-3">{t('studio3d.shadow.title')}</legend>
   <label className="grid gap-1 text-xs text-ink-2">{t('studio3d.shadow.quality')}
    <NativeSelect className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={s.shadows.quality} aria-label={t('studio3d.shadow.quality')} onChange={ev=>void executeCommand('studio3d.shadow.set',{quality:ev.currentTarget.value})}>
     {SHADOW_QUALITIES.map(q=><option key={q} value={q}>{t('studio3d.shadow.quality.'+q)}</option>)}</NativeSelect></label>
   <label className="grid gap-1 text-xs text-ink-2">{t('studio3d.shadow.type')}
    <NativeSelect className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={s.shadows.type} aria-label={t('studio3d.shadow.type')} onChange={ev=>void executeCommand('studio3d.shadow.set',{type:ev.currentTarget.value})}>
     {SHADOW_TYPES.map(ty=><option key={ty} value={ty}>{t('studio3d.shadow.type.'+ty)}</option>)}</NativeSelect></label></fieldset>
 </div>;
}

const NumField=(props:Parameters<typeof InspectorNumberField>[0])=><InspectorNumberField {...props} format={value=>String(Number(value.toFixed(3)))}/>;
/** Light settings. Spot lights also have a cone, area lights a size. */
function LightFields({id,light}:{id:number;light:NonNullable<ObjectInfo['light']>}){
 const {t}=useT();const set=(p:Record<string,unknown>)=>void executeCommand('studio3d.light.set',{id,...p});
 return <fieldset className="m-0 grid gap-2 border-0 p-0" data-testid="studio3d-light"><legend className="text-xs text-ink-3">{t('studio3d.light.title')}</legend>
  {light.shadow!==undefined&&<label className="flex items-center gap-2 text-xs text-ink-2"><input type="checkbox" checked={light.shadow} onChange={e=>set({shadow:e.currentTarget.checked})}/>{t('studio3d.light.shadow')}</label>}
  {light.shadow&&light.radius!==undefined&&<NumField resetKey={id} label={t('studio3d.light.softness')} value={light.radius} min={0} max={50} step={0.5} onCommit={v=>set({radius:v})}/>}
  <NumField resetKey={id} label={t('studio3d.light.intensity')} value={light.intensity} min={0} max={100000} step={1} onCommit={n=>set({intensity:n})}/>
  <label className="flex items-center justify-between gap-2 text-xs text-ink-2">{t('studio3d.material.color')}<input type="color" key={light.color} defaultValue={light.color} onBlur={e=>{if(e.currentTarget.value!==light.color)set({color:e.currentTarget.value});}}/></label>
  {light.angle!==undefined&&<NumField resetKey={id} label={t('studio3d.light.angle')} value={light.angle} min={1} max={90} step={1} onCommit={n=>set({angle:n})}/>}
  {light.penumbra!==undefined&&<NumField resetKey={id} label={t('studio3d.light.penumbra')} value={light.penumbra} min={0} max={1} step={0.05} onCommit={n=>set({penumbra:n})}/>}
  {light.width!==undefined&&<NumField resetKey={id} label={t('studio3d.light.width')} value={light.width} min={0.01} max={1000} step={0.1} onCommit={n=>set({width:n})}/>}
  {light.height!==undefined&&<NumField resetKey={id} label={t('studio3d.light.height')} value={light.height} min={0.01} max={1000} step={0.1} onCommit={n=>set({height:n})}/>}
 </fieldset>;
}
/** Linear or radial duplication of the ticked objects. */
function ArrayTools({ids}:{ids:number[]}){
 const {t}=useT();
 const [mode,setMode]=useState<'linear'|'radial'>('linear');const [count,setCount]=useState(4);
 const [dx,setDx]=useState(1.5);const [dy,setDy]=useState(0);const [dz,setDz]=useState(0);
 const [axis,setAxis]=useState<'x'|'y'|'z'>('y');const [angle,setAngle]=useState(60);
 const [cx,setCx]=useState(0);const [cy,setCy]=useState(0);const [cz,setCz]=useState(0);
 const ready=ids.length>0;
 return <fieldset className="m-0 grid gap-1 border-0 p-0" data-testid="studio3d-array"><legend className="text-xs text-ink-3">{t('studio3d.array.title')}</legend>
  <div className="grid grid-cols-2 gap-1">
   <NativeSelect className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={mode} aria-label={t('studio3d.array.mode')} onChange={e=>setMode(e.currentTarget.value as 'linear'|'radial')}>
    <option value="linear">{t('studio3d.array.linear')}</option><option value="radial">{t('studio3d.array.radial')}</option></NativeSelect>
   <NumField label={t('studio3d.array.count')} value={count} min={2} max={100} step={1} onCommit={v=>setCount(Math.round(v))}/></div>
  {mode==='linear'?<div className="grid grid-cols-3 gap-1">
    <NumField label={t('studio3d.array.dx')} value={dx} step={0.1} onCommit={setDx}/>
    <NumField label={t('studio3d.array.dy')} value={dy} step={0.1} onCommit={setDy}/>
    <NumField label={t('studio3d.array.dz')} value={dz} step={0.1} onCommit={setDz}/></div>:
   <><div className="grid grid-cols-2 gap-1">
    <NativeSelect className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={axis} aria-label={t('studio3d.array.axis')} onChange={e=>setAxis(e.currentTarget.value as 'x'|'y'|'z')}>
     {(['x','y','z'] as const).map(a=><option key={a} value={a}>{a.toUpperCase()}</option>)}</NativeSelect>
    <NumField label={t('studio3d.array.angle')} value={angle} min={-360} max={360} step={5} onCommit={setAngle}/></div>
   <div className="grid grid-cols-3 gap-1">
    <NumField label={t('studio3d.array.cx')} value={cx} step={0.1} onCommit={setCx}/>
    <NumField label={t('studio3d.array.cy')} value={cy} step={0.1} onCommit={setCy}/>
    <NumField label={t('studio3d.array.cz')} value={cz} step={0.1} onCommit={setCz}/></div></>}
  <Button variant="outline" disabled={!ready} onClick={()=>void executeCommand('studio3d.object.array',mode==='linear'?{ids,mode,count,dx,dy,dz}:{ids,mode,count,axis,angle,cx,cy,cz})}>{t('studio3d.array.apply')}</Button>
 </fieldset>;
}
/** Snapping, pivot, align and distribute. Align and distribute work on the objects ticked in the scene list. */
export function ToolsSection(_:InspectorSectionProps){
 const {t}=useT();const s=useStudio3D();const sn=s.snap;const n=s.marked.filter(id=>s.outline.some(o=>o.id===id));const [frames,setFrames]=useState(36);const [out,setOut]=useState<'zip'|'folder'|'webm'>('zip');const [fps,setFps]=useState(30);
 const align=(axis:string,to:string)=>void executeCommand('studio3d.object.align',{ids:n,axis,to});
 return <div className="grid gap-2 p-3" data-testid="studio3d-tools-section">
  <label className="flex items-center gap-2 text-xs text-ink-2"><input type="checkbox" checked={sn.on} onChange={e=>void executeCommand('studio3d.snap.set',{on:e.currentTarget.checked})}/>{t('studio3d.snap.on')}</label>
  <div className="grid grid-cols-3 gap-1">
   <NumField label={t('studio3d.snap.move')} value={sn.move} min={0.001} max={100} step={0.05} onCommit={v=>void executeCommand('studio3d.snap.set',{move:v})}/>
   <NumField label={t('studio3d.snap.rotate')} value={sn.rotate} min={1} max={180} step={5} onCommit={v=>void executeCommand('studio3d.snap.set',{rotate:v})}/>
   <NumField label={t('studio3d.snap.scale')} value={sn.scale} min={0.001} max={10} step={0.05} onCommit={v=>void executeCommand('studio3d.snap.set',{scale:v})}/></div>
  <label className="grid gap-1 text-xs text-ink-2">{t('studio3d.snap.mode')}
   <NativeSelect className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={sn.mode} aria-label={t('studio3d.snap.mode')} onChange={e=>void executeCommand('studio3d.snap.set',{mode:e.currentTarget.value})}>
    {(['grid','vertex','surface','midpoint'] as const).map(m=><option key={m} value={m}>{t('studio3d.snap.mode.'+m)}</option>)}</NativeSelect></label>
  <fieldset className="m-0 grid gap-1 border-0 p-0"><legend className="text-xs text-ink-3">{t('studio3d.pivot.title')}</legend>
   <div className="flex gap-1">{(['center','base'] as const).map(at=><Button key={at} variant="outline" disabled={s.selectedInfo?.kind!=='mesh'} onClick={()=>void executeCommand('studio3d.object.pivot',{id:s.selected,at})}>{t('studio3d.pivot.'+at)}</Button>)}</div></fieldset>
  <label className="grid gap-1 text-xs text-ink-2">{t('studio3d.pivot.mode')}
   <NativeSelect className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={s.pivot} aria-label={t('studio3d.pivot.mode')} onChange={e=>void executeCommand('studio3d.pivot.set',{mode:e.currentTarget.value})}>
    {(['center','origin','cursor'] as const).map(m=><option key={m} value={m}>{t('studio3d.pivot.mode.'+m)}</option>)}</NativeSelect></label>
  {s.pivot==='cursor'&&<div className="grid grid-cols-3 gap-1" data-testid="studio3d-cursor">{AXES.map(a=><NumField key={a} label={`${t('studio3d.cursor.title')} ${a.toUpperCase()}`} value={s.cursor[a]} step={0.1}
   onCommit={n=>void executeCommand('studio3d.cursor.set',{...s.cursor,[a]:n})}/>)}</div>}
  <label className="flex items-center gap-2 text-xs text-ink-2"><NativeInput type="checkbox" checked={s.measure!==null} aria-label={t('studio3d.measure.on')} onChange={e=>void executeCommand('studio3d.measure.set',{on:e.currentTarget.checked})}/>{t('studio3d.measure.on')}</label>
  <fieldset className="m-0 grid gap-2 border-0 p-0" data-testid="studio3d-history"><legend className="text-xs text-ink-3">{t('studio3d.history.title')}</legend>
   {s.history.undo.length===0&&s.history.redo.length===0?<p className="m-0 text-xs text-ink-3">{t('studio3d.history.empty')}</p>:<>
    {s.history.redo.length>0&&<ul className="m-0 grid max-h-32 list-none gap-1 overflow-auto p-0" aria-label={t('studio3d.history.redo')} data-testid="studio3d-history-redo">{s.history.redo.map((label,i)=><li key={i}>
     <Button variant="outline" className="w-full justify-start truncate text-left" aria-label={`${t('studio3d.history.redoTo')} ${t(label.key,label.params)}`} onClick={()=>void executeCommand('studio3d.redo',{count:i+1})}><Redo2 size={13} aria-hidden/>{t(label.key,label.params)}</Button></li>)}</ul>}
    {s.history.undo.length>0&&<ul className="m-0 grid max-h-32 list-none gap-1 overflow-auto p-0" aria-label={t('studio3d.history.undo')} data-testid="studio3d-history-undo">{s.history.undo.map((label,i)=><li key={i}>
     <Button variant="outline" className="w-full justify-start truncate text-left" aria-label={`${t('studio3d.history.undoTo')} ${t(label.key,label.params)}`} onClick={()=>void executeCommand('studio3d.undo',{count:i+1})}><Undo2 size={13} aria-hidden/>{t(label.key,label.params)}</Button></li>)}</ul>}
   </>}
  </fieldset>
  <fieldset className="m-0 grid gap-2 border-0 p-0" data-testid="studio3d-save"><legend className="text-xs text-ink-3">{t('studio3d.save.title')}</legend>
   <div className="flex flex-wrap gap-1"><Button variant="outline" disabled={s.status!=='ready'} onClick={()=>void executeCommand('studio3d.save',{})}>{t('studio3d.save.one')}</Button>
    <Button variant="outline" disabled={s.status!=='ready'} onClick={()=>void executeCommand('studio3d.save',{sidecar:true})}>{t('studio3d.save.sidecar')}</Button>
    {s.env.preset==='custom'&&<Button variant="outline" disabled={s.status!=='ready'} onClick={()=>void executeCommand('studio3d.save',{embedEnv:true})}>{t('studio3d.save.embed')}</Button>}</div>
   <p className="m-0 text-xs text-ink-3">{t('studio3d.save.note')}</p>
   <RecentList compact/>
  </fieldset>
  <fieldset className="m-0 grid gap-2 border-0 p-0" data-testid="studio3d-import"><legend className="text-xs text-ink-3">{t('studio3d.import.title')}</legend>
   <label className="grid gap-1 text-xs text-ink-2">{t('studio3d.import.unit')}
    <NativeSelect className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={s.importUnit} aria-label={t('studio3d.import.unit')} onChange={e=>void executeCommand('studio3d.import.options',{unit:e.currentTarget.value})}>
     {UNIT_IDS.map(u=><option key={u} value={u}>{t('studio3d.unit.'+u)}</option>)}</NativeSelect></label>
   <label className="grid gap-1 text-xs text-ink-2">{t('studio3d.import.axis')}
    <NativeSelect className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={s.importUpAxis} aria-label={t('studio3d.import.axis')} onChange={e=>void executeCommand('studio3d.import.options',{upAxis:e.currentTarget.value})}>
     {(['y','z'] as const).map(a=><option key={a} value={a}>{t('studio3d.import.axis.'+a)}</option>)}</NativeSelect></label>
   <p className="m-0 text-xs text-ink-3">{t('studio3d.import.note')}</p>
  </fieldset>
  <fieldset className="m-0 grid gap-2 border-0 p-0" data-testid="studio3d-export"><legend className="text-xs text-ink-3">{t('studio3d.export.title')}</legend>
   <label className="grid gap-1 text-xs text-ink-2">{t('studio3d.export.unit')}
    <select className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={s.unit} aria-label={t('studio3d.export.unit')} onChange={e=>void executeCommand('studio3d.unit.set',{unit:e.currentTarget.value})}>
     {UNIT_IDS.map(u=><option key={u} value={u}>{t('studio3d.unit.'+u)}</option>)}</select></label>
   <NativeSelect className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={s.exportTextures} aria-label={t('studio3d.export.textures')} onChange={e=>void executeCommand('studio3d.export.options',{textures:e.currentTarget.value})}>
    {(['embed','external'] as const).map(m=><option key={m} value={m}>{t('studio3d.export.textures.'+m)}</option>)}</NativeSelect>
   {s.clips.length>0&&<div className="grid gap-1" role="group" aria-label={t('studio3d.export.clips')}>{s.clips.map(c=>{
    const on=s.exportClips===null||s.exportClips.includes(c.name);
    const toggle=(checked:boolean)=>{
     const cur=s.exportClips??s.clips.map(x=>x.name);
     const next=checked?[...cur,c.name]:cur.filter(x=>x!==c.name);
     void executeCommand('studio3d.export.options',{clips:next.length===s.clips.length?null:next});
    };
    return <label key={c.name} className="flex items-center gap-2 text-xs text-ink-2"><NativeInput type="checkbox" checked={on} aria-label={c.name} onChange={e=>toggle(e.currentTarget.checked)}/>{c.name}</label>;})}</div>}
   <label className="flex items-center gap-2 text-xs text-ink-2"><NativeInput type="checkbox" checked={s.exportSelection} aria-label={t('studio3d.export.selection')} onChange={e=>void executeCommand('studio3d.export.options',{selection:e.currentTarget.checked})}/>{t('studio3d.export.selection')}</label>
   <div className="flex flex-wrap gap-1">
    <Button variant="outline" disabled={s.status!=='ready'} onClick={()=>void executeCommand('studio3d.export.glb')}>GLB</Button>
    <Button variant="outline" disabled={s.status!=='ready'} onClick={()=>void executeCommand('studio3d.export.gltf')}>glTF</Button>
    <Button variant="outline" disabled={s.status!=='ready'} onClick={()=>void executeCommand('studio3d.export.mesh',{format:'stl'})}>STL</Button>
    <Button variant="outline" disabled={s.status!=='ready'} onClick={()=>void executeCommand('studio3d.export.mesh',{format:'obj'})}>OBJ</Button></div>
   <p className="m-0 text-xs text-ink-3">{t('studio3d.export.unitNote')}</p>
  </fieldset>
  <fieldset className="m-0 grid gap-2 border-0 p-0" data-testid="studio3d-turntable"><legend className="text-xs text-ink-3">{t('studio3d.turntable.title')}</legend>
   <NumField label={t('studio3d.turntable.frames')} value={frames} min={2} max={360} step={1} onCommit={setFrames}/>
   <label className="grid gap-1 text-xs text-ink-2">{t('studio3d.turntable.out')}
    <NativeSelect className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={out} aria-label={t('studio3d.turntable.out')} onChange={e=>setOut(e.currentTarget.value as 'zip'|'folder'|'webm')}>
     <option value="zip">{t('studio3d.turntable.outZip')}</option><option value="folder">{t('studio3d.turntable.outFolder')}</option><option value="webm">{t('studio3d.turntable.outWebm')}</option></NativeSelect></label>
   {out==='webm'&&<NumField label={t('studio3d.turntable.fps')} value={fps} min={1} max={60} step={1} onCommit={setFps}/>}
   {s.render?<StudioProgress label={t('studio3d.turntable.progress',{done:s.render.done,total:s.render.total})} value={s.render.done} max={s.render.total} cancelLabel={t('studio3d.turntable.cancel')} onCancel={()=>void executeCommand('studio3d.render.cancel')}/>:
    <Button variant="outline" disabled={s.status!=='ready'} onClick={()=>void executeCommand('studio3d.render.turntable',{frames,out,fps})}>{t('studio3d.turntable.start')}</Button>}
  </fieldset>
  <MeshTools/>
  <fieldset className="m-0 grid gap-1 border-0 p-0" data-testid="studio3d-align"><legend className="text-xs text-ink-3">{t('studio3d.align.title',{count:n.length})}</legend>
   <p className="m-0 text-xs text-ink-3">{t('studio3d.align.hint')}</p>
   <div className="flex flex-wrap gap-1"><Button variant="outline" disabled={n.length<2} onClick={()=>void executeCommand('studio3d.selection.duplicate',{ids:n})}>{t('studio3d.selection.duplicate')}</Button>
    <Button variant="outline" disabled={n.length<2} onClick={()=>void executeCommand('studio3d.selection.delete',{ids:n})}>{t('studio3d.selection.delete')}</Button>
    <Button variant="outline" disabled={n.length<2} data-testid="studio3d-group" onClick={()=>void executeCommand('studio3d.group',{ids:n})}>{t('studio3d.group')}</Button>
    <Button variant="outline" disabled={s.selectedInfo?.kind!=='group'} data-testid="studio3d-ungroup" onClick={()=>void executeCommand('studio3d.ungroup',{id:s.selected})}>{t('studio3d.ungroup')}</Button></div>
   <ArrayTools ids={n}/>
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
 return <StudioRecentList title={t('studio3d.recent.title')} compact={compact} testId="studio3d-recent" entries={s.recent.map(e=>({id:e.id,label:e.auto?t('studio3d.recent.autosave',{name:e.name}):e.name,metadata:`${new Date(e.savedAt).toLocaleString()} · ${formatBytes(e.size)}`,testId:e.auto?'studio3d-recent-autosave':'studio3d-recent-item'}))} onOpen={id=>void executeCommand('studio3d.recent.open',{id})} footer={<Button variant="outline" onClick={()=>void executeCommand('studio3d.recent.clear',{})}>{t('studio3d.recent.clear')}</Button>}/>;
}

/** Render the current view to a PNG at a chosen size. The size presets fill the fields; the fields can be changed freely. */
function RenderPng(){
 const {t}=useT();const s=useStudio3D();const ready=s.status==='ready';
 const [w,setW]=useState(1920);const [h,setH]=useState(1080);const [alpha,setAlpha]=useState(false);
 return <fieldset className="m-0 grid gap-2 border-0 p-0" data-testid="studio3d-render-png"><legend className="text-xs text-ink-3">{t('studio3d.renderPng.title')}</legend>
  <label className="grid gap-1 text-xs text-ink-2">{t('studio3d.renderPng.size')}
   <NativeSelect className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={RENDER_SIZES.find(r=>r.width===w&&r.height===h)?.id??'custom'} aria-label={t('studio3d.renderPng.size')}
    onChange={e=>{const r=RENDER_SIZES.find(x=>x.id===e.currentTarget.value);if(r){setW(r.width);setH(r.height);}}}>
    {RENDER_SIZES.map(r=><option key={r.id} value={r.id}>{t('studio3d.renderPng.'+r.id)} ({r.width} x {r.height})</option>)}<option value="custom">{t('studio3d.renderPng.custom')}</option></NativeSelect></label>
  <div className="grid grid-cols-2 gap-2"><NumField resetKey={w} label={t('studio3d.renderPng.width')} value={w} min={1} max={16384} step={1} onCommit={v=>setW(Math.round(v))}/>
   <NumField resetKey={h} label={t('studio3d.renderPng.height')} value={h} min={1} max={16384} step={1} onCommit={v=>setH(Math.round(v))}/></div>
  <label className="flex items-center gap-2 text-xs text-ink-2"><NativeInput type="checkbox" checked={alpha} onChange={e=>setAlpha(e.currentTarget.checked)}/>{t('studio3d.renderPng.transparent')}</label>
  <Button variant="outline" disabled={!ready} onClick={()=>void executeCommand('studio3d.render.still',{width:w,height:h,transparent:alpha})}>{t('studio3d.renderPng.go')}</Button>
  <p className="m-0 text-xs text-ink-3">{t('studio3d.renderPng.note')}</p></fieldset>;
}

/** Mirror, apply scale and merge act on the ticked objects, or on the selected one. Origin to centre is the Pivot group above. */
function MeshTools(){
 const {t}=useT();const s=useStudio3D();const [copy,setCopy]=useState(true);const [keepPct,setKeepPct]=useState(50);const [symAxis,setSymAxis]=useState<'x'|'y'|'z'>('x');const [symSide,setSymSide]=useState<'positive'|'negative'>('positive');const [subTimes,setSubTimes]=useState(2);const [weldDist,setWeldDist]=useState(0.0001);const [nOp,setNOp]=useState<'flip'|'outside'|'smooth'|'flat'|'angle'>('smooth');const [nAngle,setNAngle]=useState(30);
 const [soThick,setSoThick]=useState(0.1);
 const [rxTimes,setRxTimes]=useState(1);
 const [fatAmt,setFatAmt]=useState(0.1);
 const [biAxis,setBiAxis]=useState<'x'|'y'|'z'>('x');
 const [biOff,setBiOff]=useState(0);
 const [biFill,setBiFill]=useState(true);
 const [twAxis,setTwAxis]=useState<'x'|'y'|'z'>('z');
 const [twDeg,setTwDeg]=useState(90);
 const [tpAxis,setTpAxis]=useState<'x'|'y'|'z'>('z');
 const [tpFactor,setTpFactor]=useState(2);
 const [spAxis,setSpAxis]=useState<'x'|'y'|'z'>('y');
 const [spDeg,setSpDeg]=useState(360);
 const [spSteps,setSpSteps]=useState(24);
 const [brTwist,setBrTwist]=useState(0);
 const [boolOp,setBoolOp]=useState<'union'|'subtract'|'intersect'>('union');
 const [rmRes,setRmRes]=useState(32);
 const [rxFactor,setRxFactor]=useState(0.5);
 const [soOff,setSoOff]=useState(0);
 const set=s.marked.length?s.marked:s.selected!=null?[s.selected]:[];const ready=s.status==='ready'&&set.length>0;
 return <fieldset className="m-0 grid gap-2 border-0 p-0" data-testid="studio3d-meshtools"><legend className="text-xs text-ink-3">{t('studio3d.mesh.title')}</legend>
  <div className="flex flex-wrap items-center gap-1">{(['x','y','z'] as const).map(a=><Button key={a} variant="outline" disabled={!ready} onClick={()=>void executeCommand('studio3d.mesh.mirror',{axis:a,copy})}>{t('studio3d.mesh.mirror',{axis:a.toUpperCase()})}</Button>)}</div>
  <label className="flex items-center gap-2 text-xs text-ink-2"><NativeInput type="checkbox" checked={copy} onChange={e=>setCopy(e.currentTarget.checked)}/>{t('studio3d.mesh.copy')}</label>
  <div className="flex flex-wrap gap-1"><Button variant="outline" disabled={!ready} onClick={()=>void executeCommand('studio3d.mesh.applyScale',{})}>{t('studio3d.mesh.applyScale')}</Button>
   <Button variant="outline" disabled={s.status!=='ready'||set.length<2} onClick={()=>void executeCommand('studio3d.mesh.merge',{})}>{t('studio3d.mesh.merge')}</Button></div>
  <div className="flex flex-wrap items-center gap-1"><NativeInput type="number" min={5} max={95} step={5} value={keepPct} aria-label={t('studio3d.mesh.simplifyKeep')} className="w-20" onChange={e=>setKeepPct(Math.min(95,Math.max(5,Number(e.currentTarget.value)||50)))}/>
   <Button variant="outline" disabled={!ready} onClick={()=>void executeCommand('studio3d.mesh.simplify',{keep:keepPct/100})}>{t('studio3d.mesh.simplify')}</Button></div>
  <div className="flex flex-wrap items-center gap-1"><NativeSelect className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={symAxis} aria-label={t('studio3d.mirror.axis')} onChange={e=>setSymAxis(e.currentTarget.value as 'x'|'y'|'z')}>
    {(['x','y','z'] as const).map(a=><option key={a} value={a}>{t('studio3d.sculpt.symmetry.'+a)}</option>)}</NativeSelect>
   <NativeSelect className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={symSide} aria-label={t('studio3d.mesh.symmetrizeSide')} onChange={e=>setSymSide(e.currentTarget.value as 'positive'|'negative')}>
    {(['positive','negative'] as const).map(v=><option key={v} value={v}>{t(`studio3d.mesh.symmetrizeSide.${v}`)}</option>)}</NativeSelect>
   <Button variant="outline" disabled={!ready} onClick={()=>void executeCommand('studio3d.mesh.symmetrize',{axis:symAxis,side:symSide})}>{t('studio3d.mesh.symmetrize')}</Button></div>
  <div className="flex flex-wrap items-center gap-1"><NativeSelect className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={subTimes} aria-label={t('studio3d.mesh.subdivideTimes')} onChange={e=>setSubTimes(Number(e.currentTarget.value))}>
    {[1,2,3].map(n=><option key={n} value={n}>{n}</option>)}</NativeSelect>
   <Button variant="outline" disabled={!ready} onClick={()=>void executeCommand('studio3d.mesh.subdivide',{iterations:subTimes})}>{t('studio3d.mesh.subdivide')}</Button></div>
  <div className="flex flex-wrap items-center gap-1"><NativeInput type="number" min={0} step={0.001} value={weldDist} aria-label={t('studio3d.mesh.cleanupWeld')} className="w-20" onChange={e=>setWeldDist(Math.min(1000,Math.max(0,Number(e.currentTarget.value)||0)))}/>
   <Button variant="outline" disabled={!ready} onClick={()=>void executeCommand('studio3d.mesh.cleanup',{weld:weldDist})}>{t('studio3d.mesh.cleanup')}</Button></div>
  <div className="flex flex-wrap items-center gap-1"><NativeSelect className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={nOp} aria-label={t('studio3d.mesh.normals')} onChange={e=>setNOp(e.currentTarget.value as typeof nOp)}>
    {(['flip','outside','smooth','flat','angle'] as const).map(v=><option key={v} value={v}>{t(`studio3d.mesh.normalsOp.${v}`)}</option>)}</NativeSelect>
   <NativeInput type="number" min={0} max={180} step={5} value={nAngle} disabled={nOp!=='angle'} aria-label={t('studio3d.mesh.normalsAngle')} className="w-20" onChange={e=>setNAngle(Math.min(180,Math.max(0,Number(e.currentTarget.value)||0)))}/>
   <Button variant="outline" disabled={!ready} onClick={()=>void executeCommand('studio3d.mesh.normals',{op:nOp,angle:nAngle})}>{t('studio3d.mesh.normals')}</Button></div>
  <div className="flex flex-wrap gap-1"><Button variant="outline" disabled={!ready} onClick={()=>void executeCommand('studio3d.mesh.separate',{})}>{t('studio3d.mesh.separate')}</Button></div>
  <div className="flex flex-wrap items-center gap-1"><NativeInput type="number" min={0.001} step={0.05} value={soThick} aria-label={t('studio3d.mesh.solidifyThickness')} className="w-20" onChange={e=>setSoThick(Math.min(1000,Math.max(0.001,Number(e.currentTarget.value)||0.1)))}/>
   <NativeInput type="number" min={-1} max={1} step={0.5} value={soOff} aria-label={t('studio3d.mesh.solidifyOffset')} className="w-20" onChange={e=>setSoOff(Math.min(1,Math.max(-1,Number(e.currentTarget.value)||0)))}/>
   <Button variant="outline" disabled={!ready} onClick={()=>void executeCommand('studio3d.mesh.solidify',{thickness:soThick,offset:soOff})}>{t('studio3d.mesh.solidify')}</Button></div>
  <div className="flex flex-wrap gap-1"><Button variant="outline" disabled={!ready} onClick={()=>void executeCommand('studio3d.mesh.fillHoles',{})}>{t('studio3d.mesh.fillHoles')}</Button></div>
  <div className="flex flex-wrap items-center gap-1"><NativeSelect className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={rxTimes} aria-label={t('studio3d.mesh.relaxTimes')} onChange={e=>setRxTimes(Number(e.currentTarget.value))}>
    {[1,2,5,10].map(n=><option key={n} value={n}>{n}</option>)}</NativeSelect>
   <NativeInput type="number" min={0.05} max={1} step={0.05} value={rxFactor} aria-label={t('studio3d.mesh.relaxFactor')} className="w-20" onChange={e=>setRxFactor(Math.min(1,Math.max(0.05,Number(e.currentTarget.value)||0.5)))}/>
   <Button variant="outline" disabled={!ready} onClick={()=>void executeCommand('studio3d.mesh.relax',{iterations:rxTimes,factor:rxFactor})}>{t('studio3d.mesh.relax')}</Button></div>
  <div className="flex flex-wrap items-center gap-1"><NativeInput type="number" step={0.05} value={fatAmt} aria-label={t('studio3d.mesh.fattenAmount')} className="w-20" onChange={e=>setFatAmt(Math.min(1000,Math.max(-1000,Number(e.currentTarget.value)||0)))}/>
   <Button variant="outline" disabled={!ready} onClick={()=>void executeCommand('studio3d.mesh.fatten',{amount:fatAmt})}>{t('studio3d.mesh.fatten')}</Button></div>
  <div className="flex flex-wrap items-center gap-1"><NativeSelect className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={biAxis} aria-label={t('studio3d.mesh.bisectAxis')} onChange={e=>setBiAxis(e.currentTarget.value as 'x'|'y'|'z')}>
    {(['x','y','z'] as const).map(a=><option key={a} value={a}>{a.toUpperCase()}</option>)}</NativeSelect>
   <NativeInput type="number" step={0.1} value={biOff} aria-label={t('studio3d.mesh.bisectOffset')} className="w-20" onChange={e=>setBiOff(Math.min(1000,Math.max(-1000,Number(e.currentTarget.value)||0)))}/>
   <label className="flex items-center gap-1 text-xs text-ink-2"><NativeInput type="checkbox" checked={biFill} onChange={e=>setBiFill(e.currentTarget.checked)}/>{t('studio3d.mesh.bisectFill')}</label>
   <Button variant="outline" disabled={!ready} onClick={()=>void executeCommand('studio3d.mesh.bisect',{axis:biAxis,offset:biOff,fill:biFill})}>{t('studio3d.mesh.bisect')}</Button></div>
  <div className="flex flex-wrap items-center gap-1"><NativeSelect className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={twAxis} aria-label={t('studio3d.mesh.twistAxis')} onChange={e=>setTwAxis(e.currentTarget.value as 'x'|'y'|'z')}>
    {(['x','y','z'] as const).map(a=><option key={a} value={a}>{a.toUpperCase()}</option>)}</NativeSelect>
   <NativeInput type="number" step={15} value={twDeg} aria-label={t('studio3d.mesh.twistAngle')} className="w-20" onChange={e=>setTwDeg(Math.min(720,Math.max(-720,Number(e.currentTarget.value)||0)))}/>
   <Button variant="outline" disabled={!ready} onClick={()=>void executeCommand('studio3d.mesh.twist',{axis:twAxis,degrees:twDeg})}>{t('studio3d.mesh.twist')}</Button></div>
  <div className="flex flex-wrap items-center gap-1"><NativeSelect className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={tpAxis} aria-label={t('studio3d.mesh.taperAxis')} onChange={e=>setTpAxis(e.currentTarget.value as 'x'|'y'|'z')}>
    {(['x','y','z'] as const).map(a=><option key={a} value={a}>{a.toUpperCase()}</option>)}</NativeSelect>
   <NativeInput type="number" step={0.1} value={tpFactor} aria-label={t('studio3d.mesh.taperFactor')} className="w-20" onChange={e=>setTpFactor(Math.min(10,Math.max(-10,Number(e.currentTarget.value)||0)))}/>
   <Button variant="outline" disabled={!ready} onClick={()=>void executeCommand('studio3d.mesh.taper',{axis:tpAxis,factor:tpFactor})}>{t('studio3d.mesh.taper')}</Button></div>
  <div className="flex flex-wrap items-center gap-1"><NativeSelect className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={spAxis} aria-label={t('studio3d.mesh.spinAxis')} onChange={e=>setSpAxis(e.currentTarget.value as 'x'|'y'|'z')}>
    {(['x','y','z'] as const).map(a=><option key={a} value={a}>{a.toUpperCase()}</option>)}</NativeSelect>
   <NativeInput type="number" step={30} value={spDeg} aria-label={t('studio3d.mesh.spinAngle')} className="w-20" onChange={e=>setSpDeg(Math.min(360,Math.max(-360,Number(e.currentTarget.value)||0)))}/>
   <NativeInput type="number" min={1} max={128} step={1} value={spSteps} aria-label={t('studio3d.mesh.spinSteps')} className="w-16" onChange={e=>setSpSteps(Math.min(128,Math.max(1,Math.round(Number(e.currentTarget.value)||1))))}/>
   <Button variant="outline" disabled={!ready} onClick={()=>void executeCommand('studio3d.mesh.spin',{axis:spAxis,degrees:spDeg,steps:spSteps})}>{t('studio3d.mesh.spin')}</Button></div>
  <div className="flex flex-wrap items-center gap-1"><NativeInput type="number" min={-64} max={64} step={1} value={brTwist} aria-label={t('studio3d.mesh.bridgeTwist')} className="w-16" onChange={e=>setBrTwist(Math.min(64,Math.max(-64,Math.round(Number(e.currentTarget.value)||0))))}/>
   <Button variant="outline" disabled={!ready} onClick={()=>void executeCommand('studio3d.mesh.bridge',{twist:brTwist})}>{t('studio3d.mesh.bridge')}</Button></div>
  <div className="flex flex-wrap items-center gap-1"><NativeSelect className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={boolOp} aria-label={t('studio3d.mesh.booleanOp')} onChange={e=>setBoolOp(e.currentTarget.value as 'union'|'subtract'|'intersect')}>
   {(['union','subtract','intersect'] as const).map(k=><option key={k} value={k}>{t('studio3d.mesh.boolean.'+k)}</option>)}</NativeSelect>
   <Button variant="outline" disabled={!ready} onClick={()=>void executeCommand('studio3d.mesh.boolean',{op:boolOp})}>{t('studio3d.mesh.boolean')}</Button></div>
  <div className="flex flex-wrap items-center gap-1"><NativeInput type="number" min={8} max={128} step={1} value={rmRes} aria-label={t('studio3d.mesh.remeshRes')} className="w-16" onChange={e=>setRmRes(Math.min(128,Math.max(8,Math.round(Number(e.currentTarget.value)||32))))}/>
   <Button variant="outline" disabled={!ready} onClick={()=>void executeCommand('studio3d.mesh.remesh',{resolution:rmRes})}>{t('studio3d.mesh.remesh')}</Button></div>
 </fieldset>;
}

/** Size and quality checks of the scene: counts, texture memory and things that usually cause trouble. */
function SceneChecks(){
 const {t}=useT();const s=useStudio3D();const warnings=[...validateScene(s.stats),...sceneHints(s.stats)];
 return <section className="grid gap-1 px-3" data-testid="studio3d-checks" aria-label={t('studio3d.checks.title')}>
  <h3 className="m-0 text-xs font-medium text-ink-3">{t('studio3d.checks.title')}</h3>
  {warnings.length===0?<StudioStatus className="block m-0 text-xs text-ink-2">{t('studio3d.checks.ok')}</StudioStatus>
   :<ul className="m-0 grid list-none gap-1 p-0 text-xs text-ink-2">{warnings.map(w=><li key={w.code} data-testid={'studio3d-warn-'+w.code} data-level={w.level}>{w.level==='warn'?t('studio3d.checks.warn'):t('studio3d.checks.info')}: {t('studio3d.warn.'+w.code,w.values)}</li>)}</ul>}
 </section>;
}
/** Play, scrub and edit animation clips: record position, rotation and scale keys of the selected object at the current time. */
function AnimationControls(){
 const {t}=useT();const s=useStudio3D();const a=s.anim;const clip=s.clips[a.clip];const sel=s.selectedInfo;
 return <fieldset className="m-0 mx-3 mb-3 grid gap-2 border-0 p-0" data-testid="studio3d-animation"><legend className="text-xs text-ink-3">{t('studio3d.anim.title')}</legend>
  <div className="flex flex-wrap items-center gap-2">
   {s.clips.length>1&&<NativeSelect className="min-w-0 flex-1 rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={a.clip} aria-label={t('studio3d.anim.clip')} onChange={e=>void executeCommand('studio3d.anim.play',{clip:Number(e.currentTarget.value)})}>
    {s.clips.map((c,i)=><option key={i} value={i}>{c.name}</option>)}</NativeSelect>}
   <Button variant="outline" onClick={()=>void executeCommand('studio3d.clip.add',{})}>{t('studio3d.clip.add')}</Button>
   {clip&&<Button variant="outline" onClick={()=>void executeCommand('studio3d.clip.duplicate',{})}>{t('studio3d.clip.duplicate')}</Button>}
   {clip&&<Button variant="outline" onClick={()=>void executeCommand('studio3d.clip.remove',{})}>{t('studio3d.clip.remove')}</Button>}</div>
  {!clip&&<p className="m-0 text-xs text-ink-3">{t('studio3d.clip.none')}</p>}
  {clip&&<>
   <div className="grid grid-cols-2 gap-2">
    <Input key={a.clip+':'+clip.name} defaultValue={clip.name} aria-label={t('studio3d.clip.name')} onBlur={e=>{const n=e.currentTarget.value.trim();if(n&&n!==clip.name)void executeCommand('studio3d.clip.rename',{name:n});}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/>
    <NumField resetKey={a.clip+':'+clip.duration} label={t('studio3d.clip.duration')} value={clip.duration} min={0.001} max={3600} step={0.1} onCommit={v=>void executeCommand('studio3d.clip.duration',{duration:v})}/></div>
   <div className="flex items-center gap-2">
    <Button variant="outline" aria-pressed={a.playing} onClick={()=>void executeCommand(a.playing?'studio3d.anim.pause':'studio3d.anim.play',a.playing?undefined:{})}>{a.playing?t('studio3d.anim.pause'):t('studio3d.anim.play')}</Button>
    <span className="text-xs text-ink-3" aria-live="off">{formatClock(a.time)} / {formatClock(clip.duration)}</span></div>
   <NativeInput type="range" min={0} max={clip.duration} step={clip.duration/500} value={a.time} aria-label={t('studio3d.anim.scrub')} aria-valuetext={formatClock(a.time)} onChange={e=>void executeCommand('studio3d.anim.seek',{time:Number(e.currentTarget.value)})}/>
   <div className="flex items-center gap-3">
    <label className="flex items-center gap-2 text-xs text-ink-2"><NativeInput type="checkbox" checked={a.loop} onChange={e=>void executeCommand('studio3d.anim.loop',{loop:e.currentTarget.checked})}/>{t('studio3d.anim.loop')}</label>
    <label className="flex items-center gap-2 text-xs text-ink-2">{t('studio3d.anim.speed')}<NativeSelect className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={a.speed} onChange={e=>void executeCommand('studio3d.anim.speed',{speed:Number(e.currentTarget.value)})}>
     {SPEEDS.map(v=><option key={v} value={v}>{v}x</option>)}</NativeSelect></label></div>
   <label className="flex items-center gap-2 text-xs text-ink-2"><NativeInput type="checkbox" checked={s.autoKey} onChange={e=>void executeCommand('studio3d.anim.autokey',{on:e.currentTarget.checked})}/>{t('studio3d.anim.autokey')}</label>
   {s.bones.length>0&&<div className="flex flex-wrap items-center gap-2" data-testid="studio3d-record">
    <Button variant="outline" onClick={()=>void executeCommand('studio3d.clip.record',{})}>{t('studio3d.clip.record')}</Button>
    <Button variant="outline" onClick={()=>void executeCommand('studio3d.clip.record',{all:true})}>{t('studio3d.clip.recordAll')}</Button></div>}
   <div className="flex flex-wrap items-center gap-3" data-testid="studio3d-onion">
    <label className="flex items-center gap-2 text-xs text-ink-2"><NativeInput type="checkbox" checked={s.onion.on} onChange={e=>void executeCommand('studio3d.onion.skin',{on:e.currentTarget.checked})}/>{t('studio3d.onion.on')}</label>
    {s.onion.on&&<><NumField resetKey={`onion-b${s.onion.before}`} label={t('studio3d.onion.before')} value={s.onion.before} min={0} max={4} step={1} onCommit={v=>void executeCommand('studio3d.onion.skin',{on:true,before:v})}/>
    <NumField resetKey={`onion-a${s.onion.after}`} label={t('studio3d.onion.after')} value={s.onion.after} min={0} max={4} step={1} onCommit={v=>void executeCommand('studio3d.onion.skin',{on:true,after:v})}/></>}
    {s.bones.length>0&&<label className="flex items-center gap-2 text-xs text-ink-2"><NativeInput type="checkbox" checked={s.motionPath} onChange={e=>void executeCommand('studio3d.motionpath',{on:e.currentTarget.checked})}/>{t('studio3d.motionpath.on')}</label>}
   </div>
   {s.rigs.length>1&&sel?.kind==='bone'&&<RetargetFields targetId={sel.id}/>}
   {s.bones.length>0&&<div className="flex flex-wrap items-center gap-3" data-testid="studio3d-skeleton">
    <label className="flex items-center gap-2 text-xs text-ink-2">{t('studio3d.skeleton.bone')}
     <NativeSelect className="rounded-sm border border-subtle bg-surface p-1 text-xs text-ink" value={sel?.kind==='bone'?String(sel.id):''} onChange={e=>{const v=e.currentTarget.value;if(v==='')void executeCommand('studio3d.select',{id:null});else void executeCommand('studio3d.skeleton.select',{id:Number(v)});}}>
      <option value="">{t('studio3d.skeleton.none')}</option>
      {s.bones.map(b=><option key={b.id} value={b.id}>{'  '.repeat(b.depth)+b.name}</option>)}</NativeSelect></label>
    <label className="flex items-center gap-2 text-xs text-ink-2"><NativeInput type="checkbox" checked={s.skeleton} onChange={e=>void executeCommand('studio3d.skeleton.show',{on:e.currentTarget.checked})}/>{t('studio3d.skeleton.show')}</label>
   </div>}
   {sel?<div className="grid gap-1" data-testid="studio3d-keys" role="group" aria-label={t('studio3d.key.title',{name:sel!.name})}>
    <p className="m-0 text-xs text-ink-3">{t('studio3d.key.title',{name:sel!.name})}</p>
    <ClipTimeline/>
    <p className="m-0 text-xs text-ink-3">{t('studio3d.anim.note')}</p></div>:<p className="m-0 text-xs text-ink-3">{t('studio3d.key.select')}</p>}</>}
 </fieldset>;
}
