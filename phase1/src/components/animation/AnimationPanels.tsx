import {StudioStatus} from '../studios/StudioStatus';
import {PathLayerMorph} from './PathLayerMorph';
import {effectColor,effectBypassed} from '../../lib/animation/effects';
import {NativeInput,NativeSelect} from '../ui/native-controls';
import {DEFAULT_LAYER_COLOR,TEXT_FONTS,STROKE_JOINS,STROKE_CAPS,type StrokeJoin,type StrokeCap} from '../../lib/animation/model';
import {StudioProgress} from '../studios/StudioProgress';
import {saveAnimationSnapshot,parseAnimationSnapshot,SNAPSHOT_LIMIT} from '../../lib/animation/persistence';
import {wouldCycle} from '../../lib/animation/model';
import type {Edit} from '../../lib/animation/edit';
import {prepareAnimationAsset} from '../../lib/animation/assets';
import {prepareAudioAsset,AudioImportCancelled} from '../../lib/animation/audioImport';
import {AUDIO_IMPORT_EVENT} from '../../lib/animation/commands';
import {MasksMattes} from './MasksMattes';
import {TextAnimators} from './TextAnimators';
import {TextOnPath} from './TextOnPath';
import {MotionLibrary} from './MotionLibrary';
import {AudioInspector} from './AudioInspector';
import {animationSession} from '../../lib/animation/session';
import {newId} from '../../lib/animation/model';
import {TICKS_PER_SECOND} from '../../lib/animation/time';
import {useEffect,useRef,useState} from 'react';
import {executeCommand} from '../../lib/commands';
import {useT} from '../../lib/useT';
import {useAnimationState} from '../../lib/animation/session';
import {findComp,findLayer,TRANSFORM_KEYS,type LayerKind,type PropValue,type TransformKey} from '../../lib/animation/model';
import {evaluate} from '../../lib/animation/interpolate';
import {ticksToSeconds,timecode} from '../../lib/animation/time';
import {workAreaFrames} from '../../lib/animation/playback';
import {cancelExport,setExportTransparent,useExportState} from '../../lib/animation/exportJob';
import type {InspectorSectionProps,PanelHostProps} from '../../lib/shell/types';
import {Button} from '../ui/button';
import {InspectorNumberField} from '../studios/InspectorNumberField';
import {easePresetOf} from '../../lib/animation/graph';
import {EASE_LABEL,fmt,PROP_LABEL,renderSummary} from './format';
import {PropertyModifiers} from './PropertyModifiers';
import {ExportSettingsPanel} from './ExportSettingsPanel';
const field='h-8 w-full min-w-0 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink select-text';
const run=(id:string,params?:unknown)=>void executeCommand(id,params);
const KINDS:LayerKind[]=['solid','text','shape','null'];
/** Left panel: composition list and layer creation. The timeline owns the layer list, so it is not repeated here. */
export function CompositionsPanel(_:PanelHostProps){
 const {t}=useT();const s=useAnimationState();const doc=s.doc;const [pre,setPre]=useState('');const [preErr,setPreErr]=useState('');const input=useRef<HTMLInputElement>(null);const [importError,setImportError]=useState('');const [importing,setImporting]=useState(false);const [fileNotice,setFileNotice]=useState('');const snapshotInput=useRef<HTMLInputElement>(null);const audioInput=useRef<HTMLInputElement>(null);const audioAbort=useRef<AbortController|null>(null);const [audioJob,setAudioJob]=useState<{done:number;total:number}|null>(null);
 useEffect(()=>{const open=()=>audioInput.current?.click();window.addEventListener(AUDIO_IMPORT_EVENT,open);return()=>{window.removeEventListener(AUDIO_IMPORT_EVENT,open);audioAbort.current?.abort();};},[]);
 const openSnapshot=<><Button size="compact" variant="outline" className="h-auto min-w-0 whitespace-normal text-left" onClick={()=>{if(s.dirty&&!window.confirm(t('animation.file.replace')))return;snapshotInput.current?.click();}}>{t('animation.file.open')}</Button><NativeInput type="file" ref={snapshotInput} accept=".somnia" className="hidden" aria-label={t('animation.file.open')} onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;const current=animationSession().document;try{if(file.size>SNAPSHOT_LIMIT)throw Error('Snapshot exceeds 8 MB.');const snapshot=parseAnimationSnapshot(new Uint8Array(await file.arrayBuffer()));if(animationSession().document!==current)throw Error(t('animation.asset.changed'));animationSession().open(snapshot.doc,snapshot.view);setFileNotice(t('animation.file.opened'));setImportError('');}catch(err){setImportError((err as Error).message);}}}/></>;
 if(!doc)return <aside className="grid min-w-0 content-start gap-3 p-3 text-xs" data-testid="animation-compositions-panel">
  <Button size="compact" variant="outline" onClick={()=>run('animation.project.new')} data-testid="animation-new">{t('cmd.animation.project.new')}</Button>
  <Button size="compact" variant="outline" onClick={()=>run('animation.project.recover')}>{t('cmd.animation.project.recover')}</Button>{openSnapshot}{importError&&<StudioStatus tone="error" live="assertive" className="block">{importError}</StudioStatus>}</aside>;
 return <aside className="grid min-h-0 min-w-0 content-start gap-3 p-3 text-xs" data-testid="animation-compositions-panel">
  <div className="grid gap-1"><Button size="compact" variant="outline" className="h-auto min-w-0 whitespace-normal text-left" onClick={async()=>{try{const saved=await saveAnimationSnapshot();setFileNotice(t(saved?'animation.file.saved':'animation.file.copy'));}catch(e){setImportError((e as Error).message);}}}>{t('animation.file.save')}</Button>
  {openSnapshot}
  {fileNotice&&<StudioStatus className="block text-ink-3">{fileNotice}</StudioStatus>}</div>
  <h3 className="m-0 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{t('animation.comp.list')}</h3>
  <ul className="m-0 grid list-none gap-1 p-0" aria-label={t('animation.comp.list')}>{doc.compositions.map(c=><li key={c.id}>
   <button type="button" aria-current={c.id===doc.activeComp} className={`w-full truncate rounded-sm border px-2 py-1.5 text-left text-ink ${c.id===doc.activeComp?'border-line bg-hover':'border-subtle'}`} onClick={()=>run('animation.comp.select',{comp:c.id})}>{c.name}</button></li>)}</ul>
  <Button size="compact" variant="outline" onClick={()=>run('animation.comp.add')}>{t('animation.comp.new')}</Button>
  <h3 className="m-0 mt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{t('animation.layer.addHeading')}</h3>
  {doc.compositions.length>1&&<div className="flex gap-1" data-testid="animation-precomp">
   <NativeSelect className="h-8 min-w-0 flex-1 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink select-text" aria-label={t('animation.precomp.pick')} value={pre} onChange={e=>setPre(e.target.value)} data-testid="animation-precomp-select">
    <option value="">{t('animation.precomp.none')}</option>{doc.compositions.filter(c=>c.id!==doc.activeComp).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect>
   <Button size="compact" variant="outline" disabled={!pre} onClick={async()=>{setPreErr('');try{await executeCommand('animation.precomp.add',{comp:pre});setPre('');}catch(e){setPreErr((e as Error).message);}}} data-testid="animation-precomp-add">{t('animation.precomp.add')}</Button></div>}
  {preErr&&<StudioStatus tone="error" live="assertive" className="block m-0 text-ink">{preErr}</StudioStatus>}
  <div className="grid grid-cols-2 gap-2">{KINDS.map(k=><Button key={k} size="compact" variant="outline" onClick={()=>run('animation.layer.add',{kind:k})} data-testid={`animation-add-${k}`}>{t(`animation.layer.${k}`)}</Button>)}</div>
  <NativeInput ref={input} type="file" accept=".png,.jpg,.jpeg,.svg" className="hidden" aria-label={t('animation.asset.import')} onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;const session=animationSession(),document=session.document;setImportError('');setImporting(true);try{const asset=await prepareAnimationAsset(file);if(session.document?.id!==document?.id||session.document?.activeComp!==document?.activeComp)throw Error(t('animation.asset.changed'));session.dispatch({type:'asset.import',asset});session.setView({selectedLayer:findComp(session.document!)!.layers[0].id});}catch(err){setImportError((err as Error).message);}finally{setImporting(false);}}}/>
  <Button size="compact" variant="outline" disabled={importing} onClick={()=>input.current?.click()} data-testid="animation-import-asset">{t('animation.asset.import')}</Button>
  <p className="m-0 text-ink-3">{t('animation.asset.limits')}</p>
  <NativeInput ref={audioInput} type="file" accept=".wav,.mp3,audio/wav,audio/mpeg" className="hidden" aria-label={t('animation.audio.import')} data-testid="animation-audio-input" onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;const session=animationSession(),document=session.document;setImportError('');const ctl=new AbortController();audioAbort.current=ctl;setAudioJob({done:0,total:1});try{const asset=await prepareAudioAsset(file,setAudioJob,ctl.signal);if(session.document?.id!==document?.id||session.document?.activeComp!==document?.activeComp)throw Error(t('animation.asset.changed'));session.dispatch({type:'audio.import',asset,t:session.getState().view.playhead});session.setView({selectedLayer:findComp(session.document!)!.layers[0].id});}catch(err){setImportError(err instanceof AudioImportCancelled?t('animation.audio.cancelled'):(err as Error).message);}finally{audioAbort.current=null;setAudioJob(null);}}}/>
  <Button size="compact" variant="outline" disabled={!!audioJob} onClick={()=>audioInput.current?.click()} data-testid="animation-import-audio">{t('animation.audio.import')}</Button>
  {audioJob&&<StudioProgress label={t('animation.audio.progress',{done:audioJob.done,total:audioJob.total})} value={audioJob.done} max={audioJob.total} progressTestId="animation-audio-progress" cancelLabel={t('animation.audio.cancel')} onCancel={()=>audioAbort.current?.abort()} cancelTestId="animation-audio-cancel"/>}
  <p className="m-0 text-ink-3">{t('animation.audio.limits')}</p>
  {importError&&<StudioStatus tone="error" live="assertive" className="block m-0 text-ink">{importError}</StudioStatus>}
 </aside>;
}
function NumberField(props:Parameters<typeof InspectorNumberField>[0]){return <InspectorNumberField {...props} className={field} format={fmt}/>;}
/** Right inspector: values for the selected layer. One owner per control, numeric editing for every property. */
export function PropertiesSection(_:InspectorSectionProps){
 const {t}=useT();const [keepWorld,setKeepWorld]=useState(false);const [editError,setEditError]=useState('');const edit=(e:Edit)=>{try{animationSession().dispatch(e);setEditError('');}catch(err){setEditError((err as Error).message);}};const s=useAnimationState();const doc=s.doc;const comp=doc&&findComp(doc);const layer=comp&&s.view.selectedLayer?findLayer(comp,s.view.selectedLayer):undefined;
 if(!comp||!layer)return null;const at=s.view.playhead;
 if(layer.kind==='audio'&&layer.audio)return <AudioInspector layer={layer} comp={comp} at={at}/>;
 const setNum=(prop:TransformKey,v:PropValue)=>run('animation.prop.set',{layer:layer.id,prop,value:v});
 return <div className="grid gap-3 p-3 text-xs" data-testid="animation-properties">
  {editError&&<StudioStatus tone="error" live="assertive" className="block m-0 text-ink">{editError}</StudioStatus>}
  <label className="grid gap-1 text-ink-3">{t('animation.layer.name')}<NativeInput className={field} defaultValue={layer.name} key={layer.id+layer.name} onBlur={e=>{const v=e.currentTarget.value.trim();if(v&&v!==layer.name)run('animation.layer.update',{layer:layer.id,name:v});}}/></label>
  <div className="flex gap-3 text-ink-2">{(['visible','solo','locked','shy'] as const).map(f=><label key={f} className="flex items-center gap-1"><NativeInput type="checkbox" className="animation-checkbox" checked={!!layer[f]} onChange={e=>run('animation.layer.update',{layer:layer.id,[f]:e.target.checked})}/>{t(`animation.layer.${f}`)}</label>)}</div>
  {layer.kind==='text'&&<label className="grid gap-1 text-ink-3">{t('animation.layer.text.content')}<NativeInput className={field} disabled={layer.locked} defaultValue={layer.source.text} key={layer.id+(layer.source.text??'')} onBlur={e=>{if(e.currentTarget.value!==layer.source.text)run('animation.layer.update',{layer:layer.id,text:e.currentTarget.value});}}/></label>}
  {layer.kind!=='null'&&layer.kind!=='raster'&&layer.kind!=='comp'&&<label className="grid gap-1 text-ink-3">{t('animation.layer.color')}<NativeInput type="color" className="h-8 w-16 rounded-sm border border-subtle bg-transparent" disabled={layer.locked} value={layer.source.color??DEFAULT_LAYER_COLOR} onChange={e=>run('animation.layer.update',{layer:layer.id,color:e.target.value})}/></label>}
  {layer.kind==='comp'&&<div className="grid gap-2" data-testid="animation-precomp-time">
   <label className="grid gap-1 text-ink-3">{t('animation.precomp.speed')}<NativeInput type="number" min={10} max={1000} step={1} className={field} disabled={layer.locked} defaultValue={layer.source.speed??100} key={layer.id+'sp'+(layer.source.speed??100)} onBlur={e=>{const v=Math.max(10,Math.min(1000,Math.round(Number(e.currentTarget.value)||100)));if(v!==(layer.source.speed??100))run('animation.precomp.time',{layer:layer.id,speed:v});}} data-testid="animation-precomp-speed"/></label>
   <label className="grid gap-1 text-ink-3">{t('animation.precomp.start')}<NativeInput type="number" min={0} max={3600} step={0.1} className={field} disabled={layer.locked} defaultValue={(layer.source.timeOffset??0)/TICKS_PER_SECOND} key={layer.id+'of'+(layer.source.timeOffset??0)} onBlur={e=>{const v=Math.max(0,Math.min(3600,Number(e.currentTarget.value)||0));if(Math.round(v*TICKS_PER_SECOND)!==(layer.source.timeOffset??0))run('animation.precomp.time',{layer:layer.id,offset:v});}} data-testid="animation-precomp-start"/></label>
   <label className="flex items-center gap-1 text-ink-2"><NativeInput type="checkbox" className="animation-checkbox" disabled={layer.locked} checked={!!layer.source.loop} onChange={e=>run('animation.precomp.time',{layer:layer.id,loop:e.target.checked})} data-testid="animation-precomp-loop"/>{t('animation.precomp.loop')}</label></div>}
  {layer.kind==='text'&&<div className="grid gap-1 text-ink-3"><NumberField label={t('animation.layer.text.size')} value={layer.source.size??48} disabled={layer.locked} onCommit={size=>run('animation.layer.update',{layer:layer.id,size})}/></div>}
  {layer.kind==='text'&&<label className="grid gap-1 text-ink-3">{t('animation.layer.text.font')}<NativeSelect className={field} disabled={layer.locked} value={layer.source.font??'system'} onChange={e=>run('animation.layer.update',{layer:layer.id,font:e.target.value})} data-testid="animation-text-font">{Object.entries(TEXT_FONTS).map(([id,f])=><option key={id} value={id}>{f.name}</option>)}</NativeSelect></label>}
  {(layer.kind==='shape'||layer.kind==='solid')&&<div className="grid grid-cols-2 gap-2">{(['width','height'] as const).map(axis=><div key={axis} className="grid gap-1 text-ink-3"><NumberField label={t(`animation.comp.${axis}`)} value={layer.source[axis]??100} disabled={layer.locked} onCommit={n=>edit({type:'layer.update',layer:layer.id,source:{[axis]:n}})}/></div>)}</div>}
  {layer.kind==='shape'&&<label className="grid gap-1 text-ink-3">{t('animation.shape.type')}<NativeSelect className={field} disabled={layer.locked} value={layer.source.shape??'rect'} onChange={e=>edit({type:'layer.update',layer:layer.id,source:{shape:e.target.value as NonNullable<typeof layer.source.shape>,...(e.target.value==='path'?{path:layer.source.path??{points:[{x:0.5,y:0},{x:1,y:1},{x:0,y:1}],closed:true}}:{})}})}><option value="rect">{t('animation.shape.rect')}</option><option value="ellipse">{t('animation.shape.ellipse')}</option><option value="path">{t('animation.shape.path')}</option>{(['roundedRect','star','polygon'] as const).map(shape=><option key={shape} value={shape}>{t(`animation.shape.${shape}`)}</option>)}</NativeSelect></label>}
  {layer.kind==='shape'&&<div className="grid gap-2">
   {layer.source.shape==='roundedRect'&&<NumberField label={t('animation.shape.radius')} disabled={layer.locked} value={layer.source.radius??24} min={0} max={8192} onCommit={radius=>edit({type:'layer.update',layer:layer.id,source:{radius}})}/>}
   {(layer.source.shape==='star'||layer.source.shape==='polygon')&&<NumberField label={t('animation.shape.sides')} disabled={layer.locked} value={layer.source.sides??5} min={3} max={64} onCommit={sides=>edit({type:'layer.update',layer:layer.id,source:{sides:Math.round(sides)}})}/>}
   {layer.source.shape==='star'&&<NumberField label={t('animation.shape.inner')} disabled={layer.locked} value={layer.source.innerRatio??0.45} min={0.05} max={0.95} step={0.05} onCommit={innerRatio=>edit({type:'layer.update',layer:layer.id,source:{innerRatio}})}/>}
   <label className="flex items-center gap-1 text-ink-3"><NativeInput type="checkbox" className="animation-checkbox" checked={!!layer.source.gradient} disabled={layer.locked} onChange={e=>edit({type:'layer.update',layer:layer.id,source:{gradient:e.target.checked?{start:layer.source.color??DEFAULT_LAYER_COLOR,end:DEFAULT_LAYER_COLOR,angle:90}:undefined}})}/>{t('animation.shape.gradient')}</label>
   {layer.source.gradient&&<><NativeInput type="color" aria-label={t('animation.shape.gradientStart')} disabled={layer.locked} value={layer.source.gradient.start} onChange={e=>edit({type:'layer.update',layer:layer.id,source:{gradient:{...layer.source.gradient!,start:e.target.value}}})}/><NativeInput type="color" aria-label={t('animation.shape.gradientEnd')} disabled={layer.locked} value={layer.source.gradient.end} onChange={e=>edit({type:'layer.update',layer:layer.id,source:{gradient:{...layer.source.gradient!,end:e.target.value}}})}/><NumberField label={t('animation.shape.gradientAngle')} value={layer.source.gradient.angle} min={0} max={360} disabled={layer.locked} onCommit={angle=>edit({type:'layer.update',layer:layer.id,source:{gradient:{...layer.source.gradient!,angle}}})}/></>}
   {!layer.stroke&&<Button size="tiny" variant="outline" disabled={layer.locked} onClick={()=>edit({type:'layer.stroke',layer:layer.id,stroke:{color:DEFAULT_LAYER_COLOR,width:4}})}>{t('animation.shape.addStroke')}</Button>}
  </div>}
  {layer.kind==='shape'&&layer.source.shape==='path'&&layer.source.path&&<PathLayerMorph layer={layer} others={comp.layers.filter(o=>o.id!==layer.id&&o.kind==='shape'&&o.source.shape==='path'&&!!o.source.path)}/>}
  {layer.kind==='shape'&&layer.source.shape==='path' &&layer.source.path&&<label className="grid gap-1 text-ink-3">{t('animation.shape.points')}<NativeInput className={field} disabled={layer.locked} key={JSON.stringify(layer.source.path)} defaultValue={layer.source.path.points.map(p=>`${p.x},${p.y}`).join(' ')} onBlur={e=>{const points=e.currentTarget.value.trim().split(/\s+/).map(pair=>{const [x,y]=pair.split(',').map(Number);return {x,y};});edit({type:'layer.update',layer:layer.id,source:{path:{points,closed:layer.source.path!.closed}}});}}/></label>}
  <label className="flex items-center gap-1 text-ink-3"><NativeInput type="checkbox" className="animation-checkbox" checked={keepWorld} onChange={e=>setKeepWorld(e.target.checked)}/>{t('animation.parent.keepWorld')}</label>
  <label className="grid gap-1 text-ink-3">{t('animation.parent.title')}<NativeSelect className={field} disabled={layer.locked} value={layer.parent??''} onChange={e=>edit({type:'layer.parent',layer:layer.id,parent:e.target.value||null,keepWorld,t:at})}><option value="">{t('animation.parent.none')}</option>{comp.layers.filter(l=>l.id!==layer.id&&!wouldCycle(comp,layer.id,l.id)).map(l=><option key={l.id} value={l.id}>{l.name}{l.kind==='null'?' (Null)':''}</option>)}</NativeSelect></label>
  {layer.parent&&<Button size="tiny" variant="ghost" onClick={()=>animationSession().setView({selectedLayer:layer.parent})}>{t('animation.parent.select')}</Button>}
  <fieldset className="m-0 grid gap-1 border border-subtle p-2" disabled={layer.locked}><legend>{t('animation.presets.title')}</legend><div className="flex flex-wrap gap-1">{(['fade','slide','bounce','typewriter','trim','dash'] as const).filter(p=>p==='typewriter'?layer.kind==='text':p==='trim'||p==='dash'?layer.kind==='shape':true).map(p=><Button size="tiny" variant="outline" key={p} onClick={()=>run('animation.preset.apply',{layer:layer.id,preset:p,seconds:1})}>{t(`animation.presets.${p}`)}</Button>)}</div><p className="text-ink-3">{t('animation.presets.safe')}</p></fieldset>
    <label className="grid gap-1 text-ink-3">{t('animation.path.timing')}<NativeSelect className={field} disabled={layer.locked} value={layer.transform.position.pathMode??'parameter'} onChange={e=>edit({type:'prop.pathMode',layer:layer.id,mode:e.target.value as 'parameter'|'arcLength'})}><option value="parameter">{t('animation.path.parameter')}</option><option value="arcLength">{t('animation.path.arcLength')}</option></NativeSelect></label>
  <MotionLibrary layerId={layer.id} locked={layer.locked}/>
  {layer.kind==='text'&&<TextOnPath layer={layer} comp={comp}/>}
  {layer.kind==='text'&&<TextAnimators layer={layer} at={at}/>}
  {layer.kind!=='null'&&<MasksMattes layer={layer} comp={comp} at={at}/>}
  <fieldset className="m-0 grid gap-2 border border-subtle p-2" disabled={layer.locked}><legend className="text-ink-3">{t('animation.effects.title')}</legend>
   {(layer.effects??[]).map((effect,i)=><div key={effect.id} className="grid gap-1 border-b border-subtle pb-2">
    <div className="flex items-center gap-1"><label className="flex flex-1 items-center gap-1"><NativeInput type="checkbox" className="animation-checkbox" checked={effect.enabled} onChange={e=>edit({type:'layer.effects',layer:layer.id,effects:layer.effects!.map(x=>x.id===effect.id?{...x,enabled:e.target.checked}:x)})}/>{t(`animation.effects.${effect.kind}`)}</label>
    <Button size="tiny" variant="ghost" disabled={i===0} aria-label={t('animation.effects.up')} onClick={()=>{const effects=[...layer.effects!];[effects[i-1],effects[i]]=[effects[i],effects[i-1]];edit({type:'layer.effects',layer:layer.id,effects});}}>↑</Button>
    <Button size="tiny" variant="ghost" aria-label={t('animation.effects.remove')} onClick={()=>edit({type:'layer.effects',layer:layer.id,effects:layer.effects!.filter(x=>x.id!==effect.id)})}>×</Button></div>
    <NumberField label={t('animation.effects.amount')} step={effect.kind==='tint'?0.1:1} resetKey={`${layer.id}:${effect.id}:${at}`} value={effect.animation?evaluate(effect.animation,at) as number:effect.amount} onCommit={value=>edit({type:'effect.amount',layer:layer.id,effect:effect.id,value,t:at})}/>
    <label className="flex items-center gap-1 text-ink-3"><NativeInput type="checkbox" className="animation-checkbox" checked={!!effect.animation?.keys.length} onChange={e=>edit({type:'effect.animate',layer:layer.id,effect:effect.id,on:e.target.checked,t:at})}/>{t('animation.effects.animate')}</label>
    {effect.animation?.keys.length&&<div className="grid gap-1"><div className="flex gap-1"><Button size="tiny" variant="outline" onClick={()=>edit({type:'effect.amount',layer:layer.id,effect:effect.id,value:evaluate(effect.animation!,at) as number,t:at})}>{t('animation.key.add')}</Button><Button size="tiny" variant="ghost" disabled={!effect.animation.keys.some(k=>k.t===at)} onClick={()=>edit({type:'effect.key.remove',layer:layer.id,effect:effect.id,t:at})}>{t('animation.key.remove')}</Button></div><div className="flex flex-wrap gap-1">{effect.animation.keys.map(k=><Button key={k.t} size="tiny" variant="ghost" onClick={()=>animationSession().setView({playhead:k.t})}>{timecode(k.t,comp.fps)}</Button>)}</div></div>}
    {effect.kind==='tint'&&<NativeInput type="color" aria-label={t('animation.layer.color')} value={effectColor(effect,at)} onChange={e=>edit(effect.colorKeys?.length?{type:'effect.colorKey',layer:layer.id,effect:effect.id,color:e.target.value,t:at}:{type:'layer.effects',layer:layer.id,effects:layer.effects!.map(x=>x.id===effect.id?{...x,color:e.target.value}:x)})}/>}
    {effect.kind==='tint'&&<Button size="tiny" variant="outline" onClick={()=>edit({type:'effect.colorKey',layer:layer.id,effect:effect.id,color:effectColor(effect,at),t:at})}>{t('animation.effects.colorKey')}</Button>}
    {effect.colorKeys?.length&&<div className="flex flex-wrap gap-1">{effect.colorKeys.map(k=><Button key={k.t} size="tiny" variant="ghost" onClick={()=>animationSession().setView({playhead:k.t})}>{timecode(k.t,comp.fps)} · {k.color}</Button>)}</div>}
    <label className="flex items-center gap-1 text-ink-3"><NativeInput type="checkbox" className="animation-checkbox" checked={effectBypassed(effect,at)} onChange={e=>edit({type:'effect.bypassKey',layer:layer.id,effect:effect.id,bypass:e.target.checked,t:at})}/>{t('animation.effects.bypassKey')}</label>

   </div>)}
   <div className="flex gap-1">{(['blur','tint'] as const).map(kind=><Button key={kind} size="tiny" variant="outline" disabled={(layer.effects?.length??0)>=8} onClick={()=>edit({type:'layer.effects',layer:layer.id,effects:[...(layer.effects??[]),{id:newId('effect'),kind,enabled:true,amount:kind==='blur'?4:1,color:DEFAULT_LAYER_COLOR}]})}>{t(`animation.effects.${kind}`)} +</Button>)}</div>
  </fieldset>
  {layer.kind==='shape'&&layer.stroke&&<fieldset className="grid gap-1 border border-subtle p-2" disabled={layer.locked}><legend>{t('animation.stroke.title')}</legend><NumberField label={t('animation.stroke.width')} value={layer.stroke.width} min={0} max={256} onCommit={width=>edit({type:'layer.stroke',layer:layer.id,stroke:{...layer.stroke!,width}})}/><NativeInput type="color" aria-label={t('animation.stroke.color')} value={layer.stroke.color} onChange={e=>edit({type:'layer.stroke',layer:layer.id,stroke:{...layer.stroke!,color:e.target.value}})}/><div className="flex gap-1" data-testid="animation-stroke-style"><NativeSelect className="h-8 w-full min-w-0 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink" aria-label={t('animation.stroke.join')} value={layer.stroke.join??'miter'} onChange={e=>edit({type:'layer.stroke',layer:layer.id,stroke:{...layer.stroke!,join:e.target.value as StrokeJoin}})} data-testid="animation-stroke-join">{STROKE_JOINS.map(j=><option key={j} value={j}>{t(`animation.stroke.join.${j}`)}</option>)}</NativeSelect>
   <NativeSelect className="h-8 w-full min-w-0 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink" aria-label={t('animation.stroke.cap')} value={layer.stroke.cap??'butt'} onChange={e=>edit({type:'layer.stroke',layer:layer.id,stroke:{...layer.stroke!,cap:e.target.value as StrokeCap}})} data-testid="animation-stroke-cap">{STROKE_CAPS.map(c=><option key={c} value={c}>{t(`animation.stroke.cap.${c}`)}</option>)}</NativeSelect></div>{(['trim','dash'] as const).map(kind=>layer.stroke?.[kind]&&<div key={kind} className="flex flex-wrap gap-1 text-ink-3"><span>{t(`animation.presets.${kind}`)}</span>{layer.stroke[kind]!.keys.map(k=><Button key={k.t} size="tiny" variant="ghost" onClick={()=>animationSession().setView({playhead:k.t})}>{timecode(k.t,comp.fps)} · {k.v as number}</Button>)}</div>)}</fieldset>}
  {TRANSFORM_KEYS.map(prop=>{
   const p=layer.transform[prop];const v=evaluate(p,at);const animated=p.keys.length>0;const label=t(PROP_LABEL[prop]);const onKey=p.keys.some(k=>k.t===at);const key=p.keys.find(k=>k.t===at);
   return <fieldset key={prop} className="m-0 grid gap-1 border-0 p-0" data-testid={`animation-prop-${prop}`}>
    <legend className="mb-1 flex w-full items-center justify-between text-ink-3"><span>{label}</span>
     <span className="flex items-center gap-2">
      <label className="flex items-center gap-1"><NativeInput type="checkbox" className="animation-checkbox" checked={animated} disabled={layer.locked} aria-label={t('animation.prop.animate',{name:label})} onChange={e=>run('animation.prop.animate',{layer:layer.id,prop,on:e.target.checked})}/>{t('animation.prop.animate',{name:''}).trim()}</label>
      {animated&&<Button size="tiny" variant="outline" disabled={layer.locked} onClick={()=>run(onKey?'animation.key.remove':'animation.key.add',{layer:layer.id,prop})}>{onKey?t('animation.key.remove'):t('animation.key.add')}</Button>}
     </span></legend>
    <div className="grid grid-cols-2 gap-2">
     {typeof v==='number'?<NumberField resetKey={`${layer.id}:${prop}:${at}`} label={label} value={v} disabled={layer.locked} onCommit={n=>setNum(prop,n)}/>:<>
      <NumberField resetKey={`${layer.id}:${prop}:${at}:x`} label={`${label} ${t('animation.prop.x')}`} value={v[0]} disabled={layer.locked} onCommit={n=>setNum(prop,[n,v[1]])}/>
      <NumberField resetKey={`${layer.id}:${prop}:${at}:y`} label={`${label} ${t('animation.prop.y')}`} value={v[1]} disabled={layer.locked} onCommit={n=>setNum(prop,[v[0],n])}/></>}
    </div>
    {key&&<NativeSelect className={field} aria-label={t('animation.key.interp')} value={key.interp} disabled={layer.locked} onChange={e=>run('animation.key.interp',{layer:layer.id,prop,interp:e.target.value})}>
     {(['hold','linear','bezier'] as const).map(i=><option key={i} value={i}>{t(`animation.key.${i}`)}</option>)}</NativeSelect>}
    {key&&key.interp==='bezier'&&<NativeSelect className={field} aria-label={t('animation.ease.perKey')} value={easePresetOf(key)} disabled={layer.locked} onChange={e=>{if(e.target.value!=='custom')run('animation.key.ease',{layer:layer.id,prop,preset:e.target.value});}} data-testid="animation-key-ease">
     {(['ease','easeIn','easeOut'] as const).map(pr=><option key={pr} value={pr}>{t(EASE_LABEL[pr])}</option>)}
     <option value="custom" disabled={easePresetOf(key)!=='custom'}>{t('animation.ease.custom')}</option>
    </NativeSelect>}
   </fieldset>;})}
  <PropertyModifiers layer={layer} comp={comp}/>
 </div>;
}
export function CompositionSection(_:InspectorSectionProps){
 const {t}=useT();const s=useAnimationState();const comp=s.doc&&findComp(s.doc);if(!comp)return null;
 const fpsVal=comp.fps.num/comp.fps.den;
 return <div className="grid gap-2 p-3 text-xs" data-testid="animation-composition-settings">
  <label className="grid gap-1 text-ink-3">{t('animation.comp.name')}<NativeInput className={field} defaultValue={comp.name} key={comp.id+comp.name} onBlur={e=>{const v=e.currentTarget.value.trim();if(v&&v!==comp.name)run('animation.comp.update',{name:v});}}/></label>
  <div className="grid grid-cols-2 gap-2">
   <NumberField resetKey={comp.id} label={t('animation.comp.width')} value={comp.width} onCommit={n=>run('animation.comp.update',{width:Math.round(n)})}/>
   <NumberField resetKey={comp.id} label={t('animation.comp.height')} value={comp.height} onCommit={n=>run('animation.comp.update',{height:Math.round(n)})}/>
   <NumberField resetKey={comp.id} label={t('animation.comp.fps')} value={fpsVal} disabled={comp.fps.den!==1} onCommit={n=>run('animation.comp.update',{fps:Math.round(n)})}/>
   <NumberField resetKey={comp.id} label={t('animation.comp.duration')} step={0.5} value={ticksToSeconds(comp.duration)} onCommit={n=>run('animation.comp.update',{seconds:n})}/>
  </div>
  <label className="grid gap-1 text-ink-3">{t('animation.comp.background')}<NativeInput type="color" className="h-8 w-16 rounded-sm border border-subtle bg-transparent" value={comp.background} onChange={e=>run('animation.comp.update',{background:e.target.value})}/></label>
  <p className="m-0 text-ink-3">{timecode(comp.duration,comp.fps)}</p>
 </div>;
}
/** Output setup: real PNG frame and PNG-sequence export. The hero verb only opens this panel and never exports by itself. */
export function RenderSection(_:InspectorSectionProps){
 const {t}=useT();const s=useAnimationState();const job=useExportState();const comp=s.doc&&findComp(s.doc);if(!comp)return null;
 const plan=workAreaFrames(comp.workArea,comp.fps);const busy=job.status==='running';
 return <div className="grid gap-2 p-3 text-xs" data-testid="animation-render-setup">
  <p className="m-0 text-ink">{t('animation.render.summary',renderSummary(comp) as unknown as Record<string,string|number>)}</p>
  <p className="m-0 text-ink-3" data-testid="animation-export-range">{t('animation.export.range',{frames:plan.count,from:timecode(comp.workArea.in,comp.fps),to:timecode(comp.workArea.out,comp.fps)})}</p>
  <ExportSettingsPanel comp={comp} busy={busy}/>
  <label className="flex items-center gap-2 text-ink-2"><NativeInput type="checkbox" className="animation-checkbox" checked={job.transparent} disabled={busy} onChange={e=>setExportTransparent(e.target.checked)} data-testid="animation-export-alpha"/>{t('animation.export.transparent')}</label>
  <div className="grid gap-2">
   <Button size="compact" variant="outline" disabled={busy} onClick={()=>run('animation.export.frame')} data-testid="animation-export-frame">{t('animation.export.frame')}</Button>
   <Button size="compact" variant="outline" disabled={busy} onClick={()=>run('animation.export.sequence')} data-testid="animation-export-sequence">{t('animation.export.sequence')}</Button>
   <Button size="compact" variant="outline" disabled={busy} onClick={()=>run('animation.export.gif')} data-testid="animation-export-gif">{t('animation.export.gif')}</Button>
   <Button size="compact" variant="outline" disabled={busy} onClick={()=>run('animation.export.apng')} data-testid="animation-export-apng">{t('animation.export.apng')}</Button>
   <Button size="compact" variant="outline" disabled={busy} onClick={()=>run('animation.export.webm')} data-testid="animation-export-webm">{t('animation.export.webm')}</Button>
  </div>
  <p className="m-0 text-ink-3">{t('animation.export.videoNote')}</p>
  {busy&&<StudioProgress label={t('animation.export.progress',{done:job.done,total:job.total})} value={job.done} max={job.total} progressTestId="animation-export-progress" cancelLabel={t('animation.export.cancel')} onCancel={job.kind&&job.kind!=='frame'?cancelExport:undefined} cancelTestId="animation-export-cancel"/>}
  {job.status==='done'&&<StudioStatus className="block m-0 text-ink" data-testid="animation-export-done">{t('animation.export.done',{file:job.fileName})}</StudioStatus>}
  {job.status==='error'&&<StudioStatus tone="error" live="assertive" className="block m-0 text-ink" data-testid="animation-export-error">{t('animation.export.error',{message:job.message})}</StudioStatus>}
  <p className="m-0 text-ink-3">{t('animation.render.note')}</p>
  <Button size="compact" variant="outline" disabled={busy} onClick={()=>run('animation.render.close')}>{t('animation.render.close')}</Button>
 </div>;
}
