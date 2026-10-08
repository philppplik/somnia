import {Code2} from '../../lib/icons';
import {Button} from '../ui/button';
import {listStudios} from '../../lib/studios';
import {requestStudio,useAppStore} from '../../store/appStore';
import {useT} from '../../lib/useT';
/** Only registered, runtime-ready Studios appear. This is not the document tablist. */
export function StudioPill(){
 const s=useAppStore();const {t}=useT();const studios=listStudios();
 return <div role="radiogroup" aria-label={t('studio.switcher')} className="absolute left-1/2 -translate-x-1/2 flex gap-1 rounded-[var(--r-control)] bg-hover p-1" onKeyDown={e=>{
  const index=studios.findIndex(x=>x.id===s.activeStudio);
  const next=e.key==='Home'?0:e.key==='End'?studios.length-1:e.key==='ArrowRight'||e.key==='ArrowDown'?(index+1)%studios.length:e.key==='ArrowLeft'||e.key==='ArrowUp'?(index+studios.length-1)%studios.length:-1;
  if(next<0)return;e.preventDefault();requestStudio(studios[next].id);e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
 }}>
 {studios.map(studio=><Button key={studio.id} role="radio" aria-checked={s.activeStudio===studio.id} aria-label={t(studio.label)} title={t(studio.label)} tabIndex={s.activeStudio===studio.id?0:-1} size="compact" className="gap-1.5 rounded-[calc(var(--r-control)-4px)] px-3 focus-visible:ring-2 focus-visible:ring-accent" onClick={()=>requestStudio(studio.id)}><Code2 aria-hidden="true"/>{s.activeStudio===studio.id&&<span className="text-[12px]">{t(studio.label)}</span>}</Button>)}
 <span className="sr-only" aria-live="polite" aria-atomic="true">{t('studio.announcement',{studio:t(studios.find(x=>x.id===s.activeStudio)?.label??'studio.code')})}</span>
 </div>;
}
