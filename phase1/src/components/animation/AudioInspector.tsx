import {useMemo,useState} from 'react';
import {detectBeats,estimateBpm} from '../../lib/animation/audioBeats';
import {useT} from '../../lib/useT';
import {executeCommand} from '../../lib/commands';
import {animationSession} from '../../lib/animation/session';
import {evaluate} from '../../lib/animation/interpolate';
import {ticksToSeconds,timecode} from '../../lib/animation/time';
import type {Composition,Layer} from '../../lib/animation/model';
import {Button} from '../ui/button';
import {NativeInput,NativeSelect} from '../ui/native-controls';
import {InspectorNumberField} from '../studios/InspectorNumberField';
import {REACTIVE_PROPS,type ReactiveProp} from '../../lib/animation/audioReactive';
import {AudioWaveform} from './AudioWaveform';
const run=(id:string,params?:unknown)=>void executeCommand(id,params);
const field='h-8 w-full min-w-0 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink select-text';
const sec=(n:number)=>String(Math.round(n*1000)/1000);
function N(p:{label:string;value:number;min?:number;max?:number;step?:number;resetKey:string;disabled:boolean;onCommit:(n:number)=>void}){return <InspectorNumberField {...p} className={field} format={sec}/>;}
/** Inspector for an audio layer: file info, waveform, trim, offset and volume keyframes. Every change is a validated command. */
export function AudioInspector({layer,comp,at}:{layer:Layer;comp:Composition;at:number}){
 const {t}=useT();const [sens,setSens]=useState(5);const [note,setNote]=useState('');const [bpmIn,setBpmIn]=useState(0);const doc=animationSession().document;const a=layer.audio!;const asset=doc?.audioAssets?.find(x=>x.id===a.assetId);
 const [target,setTarget]=useState('');const [rprop,setRprop]=useState<ReactiveProp>('scale');const [rmin,setRmin]=useState(100);const [rmax,setRmax]=useState(130);const [rsm,setRsm]=useState(3);const [rnote,setRnote]=useState('');
 const targets=comp.layers.filter(o=>o.kind!=='audio'&&!o.locked);const tid=targets.some(o=>o.id===target)?target:(targets[0]?.id??'');
 const tempo=useMemo(()=>asset?estimateBpm(detectBeats(asset.peaks,asset.durationTicks,{sensitivity:sens})):null,[asset,sens]);
 const vol=a.volume,animated=vol.keys.length>0,onKey=vol.keys.some(k=>k.t===at),value=evaluate(vol,at) as number;
 return <div className="grid gap-3 p-3 text-xs" data-testid="animation-properties">
  <label className="grid gap-1 text-ink-3">{t('animation.layer.name')}<NativeInput className={field} defaultValue={layer.name} key={layer.id+layer.name} onBlur={e=>{const v=e.currentTarget.value.trim();if(v&&v!==layer.name)run('animation.layer.update',{layer:layer.id,name:v});}}/></label>
  <div className="flex gap-3 text-ink-2">{(['visible','solo','locked'] as const).map(f=><label key={f} className="flex items-center gap-1"><NativeInput type="checkbox" className="animation-checkbox" checked={layer[f]} onChange={e=>run('animation.layer.update',{layer:layer.id,[f]:e.target.checked})}/>{t(`animation.layer.${f}`)}</label>)}</div>
  <p className="m-0 text-ink-3">{t('animation.audio.hint')}</p>
  {asset&&<fieldset className="m-0 grid gap-2 border border-subtle p-2" data-testid="animation-audio">
   <legend className="text-ink-3">{t('animation.audio.title')}</legend>
   <p className="m-0 truncate text-ink">{t('animation.audio.file',{name:asset.sourceName})}</p>
   <p className="m-0 text-ink-3">{t('animation.audio.info',{seconds:sec(ticksToSeconds(asset.durationTicks)),rate:asset.sampleRate,channels:t(asset.channels===1?'animation.audio.mono':'animation.audio.stereo')})}</p>
   <div className="h-12 rounded-sm border border-subtle"><AudioWaveform asset={asset} trimIn={a.trimIn} length={layer.outT-layer.inT} columns={120} label={t('animation.audio.waveform',{name:asset.sourceName})}/></div>
   <div className="grid grid-cols-2 gap-2">
    <N disabled={layer.locked} label={t('animation.audio.trimIn')} value={ticksToSeconds(a.trimIn)} min={0} step={0.01} resetKey={`${layer.id}:${a.trimIn}`} onCommit={n=>run('animation.audio.update',{layer:layer.id,trimIn:n})}/>
    <N disabled={layer.locked} label={t('animation.audio.length')} value={ticksToSeconds(layer.outT-layer.inT)} min={0.001} step={0.01} resetKey={`${layer.id}:${layer.outT}`} onCommit={n=>run('animation.audio.update',{layer:layer.id,length:n})}/>
   </div>
   <N disabled={layer.locked} label={t('animation.audio.offset')} value={ticksToSeconds(layer.offset)} step={0.01} resetKey={`${layer.id}:${layer.offset}`} onCommit={n=>run('animation.audio.update',{layer:layer.id,offset:n})}/>
   <div className="grid gap-1 border-t border-subtle pt-2" data-testid="animation-audio-reactive">
    <p className="m-0 text-ink-3">{t('animation.audio.reactive.hint')}</p>
    <NativeSelect className={field} value={tid} aria-label={t('animation.audio.reactive.target')} onChange={e=>setTarget(e.target.value)} data-testid="animation-audio-reactive-target">{targets.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</NativeSelect>
    <NativeSelect className={field} value={rprop} aria-label={t('animation.audio.reactive.prop')} onChange={e=>{const p=e.target.value as ReactiveProp;setRprop(p);setRmin(p==='scale'?100:p==='opacity'?30:-10);setRmax(p==='scale'?130:p==='opacity'?100:10);}} data-testid="animation-audio-reactive-prop">{REACTIVE_PROPS.map(p=><option key={p} value={p}>{t(`animation.audio.reactive.prop.${p}`)}</option>)}</NativeSelect>
    <div className="grid grid-cols-2 gap-2">
     <N disabled={layer.locked} label={t('animation.audio.reactive.min')} value={rmin} step={1} resetKey={`rmin:${rprop}:${rmin}`} onCommit={n=>setRmin(n)}/>
     <N disabled={layer.locked} label={t('animation.audio.reactive.max')} value={rmax} step={1} resetKey={`rmax:${rprop}:${rmax}`} onCommit={n=>setRmax(n)}/></div>
    <N disabled={layer.locked} label={t('animation.audio.reactive.smooth')} value={rsm} min={0} max={10} step={1} resetKey={`rsm:${rsm}`} onCommit={n=>setRsm(Math.min(10,Math.max(0,Math.round(n))))}/>
    <Button size="tiny" variant="outline" disabled={layer.locked||!tid} data-testid="animation-audio-reactive-bake" onClick={async()=>{setRnote('');try{await executeCommand('animation.audio.reactive',{layer:layer.id,target:tid,prop:rprop,min:rmin,max:rmax,smooth:rsm});const n=animationSession().document?.compositions.find(c=>c.id===comp.id)?.layers.find(o=>o.id===tid)?.transform[rprop].keys.length??0;setRnote(t('animation.audio.reactive.done',{count:String(n)}));}catch(e){setRnote((e as Error).message);}}}>{t('animation.audio.reactive.bake')}</Button>
    {rnote&&<p role="status" className="m-0 text-ink-3">{rnote}</p>}
   </div>
   <div className="grid gap-1 border-t border-subtle pt-2" data-testid="animation-audio-beats">
    <p className="m-0 text-ink-3">{t('animation.audio.beats.hint')}</p>
    <N disabled={layer.locked} label={t('animation.audio.beats.sensitivity')} value={sens} min={1} max={10} step={1} resetKey={`sens:${sens}`} onCommit={n=>setSens(Math.min(10,Math.max(1,Math.round(n))))}/>
    <div className="flex gap-1">
     <Button size="tiny" variant="outline" disabled={layer.locked} onClick={async()=>{setNote('');try{const count=()=>comp.markers?.length??0;const before=count();await executeCommand('animation.audio.beats',{layer:layer.id,sensitivity:sens});const after=animationSession().document?.compositions.find(c=>c.id===comp.id)?.markers?.length??before;setNote(t('animation.audio.beats.added',{count:after-before}));}catch(e){setNote((e as Error).message);}}} data-testid="animation-audio-beats-find">{t('animation.audio.beats.find')}</Button>
     <Button size="tiny" variant="ghost" onClick={async()=>{setNote('');try{await executeCommand('animation.audio.beats',{layer:layer.id,clear:true});}catch(e){setNote((e as Error).message);}}} data-testid="animation-audio-beats-clear">{t('animation.audio.beats.clear')}</Button></div>
    <p className="m-0 text-ink-3" data-testid="animation-audio-bpm">{tempo?t('animation.audio.bpm.estimate',{bpm:tempo}):t('animation.audio.bpm.none')}</p>
    <N disabled={layer.locked} label={t('animation.audio.bpm.manual')} value={bpmIn} min={0} max={300} step={0.1} resetKey={`bpm:${bpmIn}`} onCommit={n=>setBpmIn(n>=30?Math.min(300,n):0)}/>
    <Button size="tiny" variant="outline" disabled={layer.locked||(!tempo&&!bpmIn)} onClick={async()=>{setNote('');try{await executeCommand('animation.audio.grid',{layer:layer.id,sensitivity:sens,...(bpmIn?{bpm:bpmIn}:{})});}catch(e){setNote((e as Error).message);}}} data-testid="animation-audio-grid">{t('animation.audio.bpm.grid')}</Button>
    {note&&<p role="status" className="m-0 text-ink-3">{note}</p>}
   </div>
  </fieldset>}
  <fieldset className="m-0 grid gap-2 border border-subtle p-2" disabled={layer.locked} data-testid="animation-audio-volume">
   <legend className="text-ink-3">{t('animation.audio.volumeLane')}</legend>
   <N disabled={layer.locked} label={t('animation.audio.volume')} value={value} min={0} max={200} step={1} resetKey={`${layer.id}:${at}:${animated}:${value}`} onCommit={n=>run('animation.audio.volume.set',{layer:layer.id,value:n})}/>
   <label className="flex items-center gap-1 text-ink-3"><NativeInput type="checkbox" className="animation-checkbox" checked={animated} onChange={e=>run('animation.audio.volume.animate',{layer:layer.id,on:e.target.checked})}/>{t('animation.audio.volume.animate')}</label>
   <NativeSelect className={field} value="" aria-label={t('animation.audio.fade')} onChange={e=>{const m=e.target.value;if(m==='normalize')run('animation.audio.normalize',{layers:[layer.id]});else if(m==='trim')run('animation.audio.trimSilence',{layers:[layer.id]});else if(m)run('animation.layers.fade',{mode:m,layers:[layer.id]});}} data-testid="animation-audio-fade"><option value="">{t('animation.audio.fade')}</option>{(['in','out','both'] as const).filter(()=>!animated).map(m=><option key={m} value={m}>{t(`animation.audio.fade.${m}`)}</option>)}<option value="normalize">{t('animation.audio.normalize')}</option><option value="trim">{t('animation.audio.trimSilence')}</option></NativeSelect>
   {comp.layers.some(o=>o.kind==='audio'&&o.id!==layer.id)&&<NativeSelect className={field} value="" aria-label={t('animation.audio.duck')} onChange={e=>{const u=e.target.value;if(u)run('animation.audio.duck',{layer:layer.id,under:u});}} data-testid="animation-audio-duck"><option value="">{t('animation.audio.duck')}</option>{comp.layers.filter(o=>o.kind==='audio'&&o.id!==layer.id).map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</NativeSelect>}
   {animated&&<div className="flex flex-wrap gap-1">
    <Button size="tiny" variant="outline" onClick={()=>run('animation.audio.volume.set',{layer:layer.id,value})}>{t('animation.audio.volume.key')}</Button>
    <Button size="tiny" variant="outline" disabled={!onKey} onClick={()=>run('animation.audio.volume.keyRemove',{layer:layer.id})}>{t('animation.audio.volume.removeKey')}</Button></div>}
   {animated&&<div className="flex flex-wrap gap-1">{vol.keys.map(k=><Button key={k.t} size="tiny" variant="ghost" onClick={()=>animationSession().setView({playhead:k.t})}>{timecode(k.t,comp.fps)} · {sec(k.v as number)}%</Button>)}</div>}
  </fieldset>
  <p className="m-0 text-ink-3">{t('animation.audio.note')}</p>
 </div>;
}
