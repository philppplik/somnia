import {useEffect,useRef} from 'react';
import {Star} from 'lucide-react';
import {Flag} from '../../lib/icons';
import {useT} from '../../lib/useT';
import {setActiveMedia,useMedia} from '../../lib/media';
import {developablePhotos} from '../../lib/photos/photoNav';
import {MAX_RATING,useRatings} from '../../lib/photos/ratings';
import {useFlags} from '../../lib/photos/flags';
import {usePanelState} from '../../store/panelStateStore';
import {Button} from '../ui/button';
import {NativeSelect} from '../ui/native-controls';
import {RatingStars} from './RatingStars';

/** Library filmstrip under the workspace: a thumbnail per developable photo in library order; clicking switches the active photo. */
export function PhotosFilmstrip({active}:{active:string}){
 const {t}=useT();
 const media=useMedia();
 const ratings=useRatings();
 const flags=useFlags();
 const [minRating,setMinRating]=usePanelState<number|string>('photos.ratingFilter',0);
 const filter=String(minRating); // legacy stored numbers and 'pick'/'reject' share one select
 const all=developablePhotos(media.items);
 const photos=all.filter(p=>filter==='pick'?flags[p.name]==='pick':filter==='reject'?flags[p.name]==='reject':(ratings[p.name]??0)>=Number(filter)); // the filter never hides the strip itself
 const strip=useRef<HTMLDivElement|null>(null);
 useEffect(()=>{strip.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({block:'nearest',inline:'nearest'});},[active]);
 if(all.length<2)return null;
 return <div ref={strip} className="photos-filmstrip flex items-center gap-1.5 overflow-x-auto border-t border-subtle px-3 py-1.5" role="navigation" aria-label={t('photos.filmstrip.aria')} data-testid="photos-filmstrip">
  <NativeSelect value={filter} aria-label={t('photos.rating.filter')} title={t('photos.rating.filter')} onChange={e=>setMinRating(e.currentTarget.value)} className="h-7 shrink-0" data-testid="photos-filmstrip-rating-filter">
   <option value="0">{t('photos.rating.filter.all')}</option>
   {Array.from({length:MAX_RATING},(_,i)=>i+1).map(n=><option key={n} value={String(n)}>{`≥ ${n}`}</option>)}
   <option value="pick">{t('photos.flag.filter.pick')}</option>
   <option value="reject">{t('photos.flag.filter.reject')}</option>
  </NativeSelect>
  <RatingStars name={active} prefix="photos-filmstrip"/>
  {photos.map(p=><Button key={p.name} variant="outline" size="compact" aria-pressed={p.name===active} aria-label={p.name} onClick={()=>setActiveMedia(p.name)} className="relative h-14 shrink-0 overflow-hidden px-0.5" data-testid={`photos-filmstrip-item-${p.name}`}>
   <img src={p.url} alt="" className="h-full w-auto max-w-24 rounded-[2px] object-cover"/>
   {(ratings[p.name]??0)>0&&<span className="absolute bottom-0.5 right-0.5 flex items-center gap-0.5 rounded-[2px] bg-elevated px-1 text-ink" data-testid={`photos-filmstrip-rating-badge-${p.name}`}><Star size={10} fill="currentColor" className="text-[var(--accent)]"/>{ratings[p.name]}</span>}
   {flags[p.name]&&<span className="absolute bottom-0.5 left-0.5 flex items-center rounded-[2px] bg-elevated px-1 text-ink" data-testid={`photos-filmstrip-flag-${p.name}`} data-flag={flags[p.name]}><Flag size={10} fill="currentColor" className={flags[p.name]==='pick'?'text-[var(--accent)]':'text-[var(--danger)]'}/></span>}
  </Button>)}
 </div>;
}
