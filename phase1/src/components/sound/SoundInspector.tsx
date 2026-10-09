import {Button} from '../ui/button';
import {useT} from '../../lib/useT';
import {useMedia} from '../../lib/media';
import {LIMITS,isNeutral} from '../../lib/sound/recipe';
import {applySoundRegion,clearSoundRegion,resetSoundSettings,setSoundSelection,updateSoundSettings,useSoundSession} from '../../lib/sound/session';
const row='grid gap-1.5 border-b border-subtle px-3 py-3 text-xs text-ink-2';
const check='!size-4 !w-4 shrink-0 accent-[var(--accent)]';
const input='w-full accent-[var(--accent)]';
const field='h-7 w-full rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink select-text';
const signed=(n:number)=>`${n>0?'+':''}${n}`;
/** The edit steps, in the fixed order the engine applies them: trim, reverse, pitch, effect, fades, normalize. */
export function SoundControls({name}:{name:string}){
 const {t}=useT();const s=useSoundSession(name);
 if(!s)return <p className="p-3 text-xs text-ink-3">{t('sound.loading')}</p>;
 const c=s.settings,set=(f:(x:typeof c)=>typeof c)=>updateSoundSettings(name,f),ready=!!s.original;
 const sel=s.selection,reg=c.region,dur=s.original?.report.input.duration_s??0;
 return <fieldset disabled={!ready} className="m-0 min-w-0 border-0 p-0" data-testid="sound-controls">
  <div className={row} data-testid="sound-selection">
   <span className="text-ink">{t('sound.selection')}</span>
   {reg?<><span className="text-ink-3" data-testid="sound-region-chip">{t('sound.region.'+reg.mode,{start:reg.start.toFixed(2),end:reg.end.toFixed(2)})}</span><Button size="compact" className="justify-self-start" onClick={()=>clearSoundRegion(name)} data-testid="sound-region-clear">{t('sound.region.clear')}</Button></>:<>
    <div className="grid grid-cols-2 gap-2">
     <label>{t('sound.selStart')}<input type="number" className={`${field} mt-1`} min={0} max={dur} step={0.01} value={sel?sel.start:''} onChange={e=>setSoundSelection(name,{start:Number(e.target.value),end:sel?.end??dur})} data-testid="sound-sel-start"/></label>
     <label>{t('sound.selEnd')}<input type="number" className={`${field} mt-1`} min={0} max={dur} step={0.01} value={sel?sel.end:''} onChange={e=>setSoundSelection(name,{start:sel?.start??0,end:Number(e.target.value)})} data-testid="sound-sel-end"/></label>
    </div>
    <p className="m-0 text-ink-3">{sel?t('sound.selLength',{seconds:(sel.end-sel.start).toFixed(2)}):t('sound.selHint')}</p>
    <div className="flex flex-wrap gap-1">
     <Button size="compact" disabled={!sel} onClick={()=>applySoundRegion(name,'crop')} data-testid="sound-crop">{t('sound.crop')}</Button>
     <Button size="compact" disabled={!sel} onClick={()=>applySoundRegion(name,'cut')} data-testid="sound-cut">{t('sound.cut')}</Button>
     <Button size="compact" disabled={!sel} onClick={()=>applySoundRegion(name,'only')} data-testid="sound-only">{t('sound.only')}</Button>
     <Button size="compact" disabled={!sel} onClick={()=>setSoundSelection(name,null)}>{t('sound.selClear')}</Button>
    </div></>}
  </div>
  <div className={row}>
   <label className="flex items-center gap-2 text-ink"><input type="checkbox" className={check} checked={c.trim.on} onChange={e=>set(x=>({...x,trim:{...x.trim,on:e.target.checked}}))} data-testid="sound-trim"/>{t('sound.trim')}</label>
   <input type="range" className={input} min={LIMITS.trimDb[0]} max={LIMITS.trimDb[1]} step={1} value={c.trim.db} disabled={!c.trim.on} aria-label={t('sound.trimDb',{db:c.trim.db})} onChange={e=>set(x=>({...x,trim:{...x.trim,db:Number(e.target.value)}}))}/>
   <span className="text-ink-3">{t('sound.trimDb',{db:c.trim.db})}</span>
  </div>
  <div className={row}><label className="flex items-center gap-2 text-ink"><input type="checkbox" className={check} checked={c.reverse} onChange={e=>set(x=>({...x,reverse:e.target.checked}))} data-testid="sound-reverse"/>{t('sound.reverse')}</label></div>
  <div className={row}>
   <label className="text-ink" htmlFor="sound-pitch">{t('sound.pitch')}</label>
   <input id="sound-pitch" type="range" className={input} min={LIMITS.pitch[0]} max={LIMITS.pitch[1]} step={1} value={c.pitch} onChange={e=>set(x=>({...x,pitch:Number(e.target.value)}))} data-testid="sound-pitch"/>
   <span className="text-ink-3">{t('sound.pitchValue',{st:signed(c.pitch)})}</span>
  </div>
  <div className={row}>
   <label className="text-ink" htmlFor="sound-effect">{t('sound.effect')}</label>
   <select id="sound-effect" className={field} value={c.effect.id} onChange={e=>set(x=>({...x,effect:{...x.effect,id:e.target.value}}))} data-testid="sound-effect"><option value="">{t('sound.effect.none')}</option>{s.plugins.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
   <label className="flex items-center gap-2"><input type="checkbox" className={check} checked={c.effect.keepTail} disabled={!c.effect.id} onChange={e=>set(x=>({...x,effect:{...x.effect,keepTail:e.target.checked}}))}/>{t('sound.effect.tail')}</label>
  </div>
  <div className={`${row} grid-cols-2`}>
   <label>{t('sound.fadeIn')}<input type="number" className={`${field} mt-1`} min={LIMITS.fadeMs[0]} max={LIMITS.fadeMs[1]} step={10} value={c.fadeInMs} onChange={e=>set(x=>({...x,fadeInMs:Number(e.target.value)}))} data-testid="sound-fade-in"/></label>
   <label>{t('sound.fadeOut')}<input type="number" className={`${field} mt-1`} min={LIMITS.fadeMs[0]} max={LIMITS.fadeMs[1]} step={10} value={c.fadeOutMs} onChange={e=>set(x=>({...x,fadeOutMs:Number(e.target.value)}))} data-testid="sound-fade-out"/></label>
  </div>
  <div className={row}>
   <label className="flex items-center gap-2 text-ink"><input type="checkbox" className={check} checked={c.normalize.on} onChange={e=>set(x=>({...x,normalize:{...x.normalize,on:e.target.checked}}))} data-testid="sound-normalize"/>{t('sound.normalize')}</label>
   <input type="range" className={input} min={LIMITS.normalizeDb[0]} max={LIMITS.normalizeDb[1]} step={0.5} value={c.normalize.db} disabled={!c.normalize.on} aria-label={t('sound.normalizeDb',{db:c.normalize.db})} onChange={e=>set(x=>({...x,normalize:{...x.normalize,db:Number(e.target.value)}}))}/>
   <span className="text-ink-3">{t('sound.normalizeDb',{db:c.normalize.db})}</span>
  </div>
  <div className="grid gap-2 px-3 py-3 text-xs text-ink-3">
   <p className="m-0">{isNeutral(c)?t('sound.untouched'):(s.processed?.report.steps??[]).join(' · ')}</p>
   <p className="m-0">{t('sound.note')}</p>
   <Button size="compact" className="justify-self-start" disabled={isNeutral(c)} onClick={()=>resetSoundSettings(name)} data-testid="sound-reset">{t('sound.reset')}</Button>
  </div>
 </fieldset>;
}
/** Right-hand panel of the Sound Studio. */
export function SoundInspector(){
 const {t}=useT();const media=useMedia();const item=media.items.find(i=>i.name===media.active&&i.kind==='audio');
 return <aside className="panel flex h-full min-h-0 flex-col overflow-hidden bg-panel" aria-label={t('sound.panel')}>
  <div className="shrink-0 border-b border-subtle px-3 py-2 text-[12px] font-medium text-ink">{t('sound.panel')}</div>
  <div className="min-h-0 flex-1 overflow-auto">{item?<SoundControls name={item.name}/>:<p className="p-3 text-xs text-ink-3">{t('sound.start.title')}</p>}</div>
 </aside>;
}
