import {useId,useSyncExternalStore} from 'react';
import {StudioTooltip as Tooltip} from '../ui/tooltip';
import {StudioGlyph} from './StudioGlyph';
import {studioShortName} from './studioShortName';
import {Button} from '../ui/button';
import {listStudios} from '../../lib/studios';
import {splitStudios} from '../../lib/studios/visible';
import {NativeSelect} from '../ui/native-controls';
import {requestStudio,useAppStore} from '../../store/appStore';
import {useT} from '../../lib/useT';
import './studio-pill.css';
/** Only registered, runtime-ready Studios appear. This is not the document tablist. */
export function StudioPill(){
 const s=useAppStore();const {t}=useT();const all=listStudios();
 // narrow headers keep two fewer tabs; the rest stays reachable via the More select
 const mq=(q:string,cb:()=>void)=>{const m=matchMedia(q);m.addEventListener('change',cb);return()=>m.removeEventListener('change',cb);};
 const narrow=useSyncExternalStore(cb=>mq('(max-width: 1340px)',cb),()=>matchMedia('(max-width: 1340px)').matches);
 const tight=useSyncExternalStore(cb=>mq('(max-width: 1150px)',cb),()=>matchMedia('(max-width: 1150px)').matches);
 const pref=typeof s.uiPrefs.maxStudios==='number'?s.uiPrefs.maxStudios-(tight?3:narrow?2:0):s.uiPrefs.maxStudios;
 const {visible:studios,hidden}=splitStudios(all,s.activeStudio,pref);const tooltipPrefix=useId();
 return <Tooltip.Provider delay={250}><div role="radiogroup" aria-label={t('studio.switcher')} className="studio-pill relative flex shrink-0 gap-1 rounded-[var(--r-control)] bg-hover p-1" onKeyDown={e=>{
  const index=studios.findIndex(x=>x.id===s.activeStudio);
  const next=e.key==='Home'?0:e.key==='End'?studios.length-1:e.key==='ArrowRight'||e.key==='ArrowDown'?(index+1)%studios.length:e.key==='ArrowLeft'||e.key==='ArrowUp'?(index+studios.length-1)%studios.length:-1;
  if(next<0)return;e.preventDefault();requestStudio(studios[next].id);e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
 }}>
 {studios.map(studio=>{
  const active=s.activeStudio===studio.id;const label=t(studio.label);const shortName=studioShortName(studio.id,label);
  return <Tooltip.Root key={studio.id}>
   <Tooltip.Trigger render={<Button role="radio" aria-checked={active} aria-label={label} aria-describedby={`${tooltipPrefix}-${studio.id}`} title="" tabIndex={active?0:-1} size="compact" className="studio-pill-tab gap-1.5 rounded-[calc(var(--r-control)-4px)] px-3 focus-visible:ring-2 focus-visible:ring-accent" onClick={()=>requestStudio(studio.id)}/>}>
    <StudioGlyph icon={studio.icon}/>{active&&<span className="text-[12px]">{shortName}</span>}
   </Tooltip.Trigger>
   <Tooltip.Portal><Tooltip.Positioner className="z-50" side="bottom" sideOffset={8}><Tooltip.Popup id={`${tooltipPrefix}-${studio.id}`} role="tooltip" className="studio-pill-tooltip">{shortName}</Tooltip.Popup></Tooltip.Positioner></Tooltip.Portal>
  </Tooltip.Root>;
 })}
 {hidden.length>0&&<NativeSelect aria-label={t('studio.more')} value="" onChange={e=>{if(e.target.value)requestStudio(e.target.value);}} className="studio-pill-more"><option value="">{t('studio.more')}</option>{hidden.map(h=><option key={h.id} value={h.id}>{t(h.label)}</option>)}</NativeSelect>}
 <span className="sr-only" aria-live="polite" aria-atomic="true">{t('studio.announcement',{studio:t(all.find(x=>x.id===s.activeStudio)?.label??'studio.code')})}</span>
 </div></Tooltip.Provider>;
}
