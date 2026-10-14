import {useEffect,useRef,useState} from 'react';
import {Star} from 'lucide-react';
import {Flag} from '../../lib/icons';
import {useT} from '../../lib/useT';
import {setActiveMedia,useMedia} from '../../lib/media';
import {developablePhotos} from '../../lib/photos/photoNav';
import {rangeSelect,toggleSelect} from '../../lib/photos/selection';
import {syncLookToPhotos} from '../../lib/photos/batchExport';
import {extractLook,isNeutralLook} from '../../lib/photos/presets';
import {getPhotoSession} from '../../lib/photos/studioSession';
import {FILMSTRIP_SORTS,sortFilmstrip,type FilmstripSort} from '../../lib/photos/filmstripSort';
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
 const [sort,setSort]=usePanelState<FilmstripSort>('photos.filmstripSort','library');
 const [sel,setSel]=usePanelState<string[]>('photos.filmstripSelection',[]);
 const [anchor,setAnchor]=usePanelState<string|null>('photos.filmstripAnchor',null);
 const [applyNote,setApplyNote]=useState<string|null>(null);
 const [applying,setApplying]=useState(false);
 const filter=String(minRating); // legacy stored numbers and 'pick'/'reject' share one select
 const all=developablePhotos(media.items);
 const photos=sortFilmstrip(all.filter(p=>filter==='pick'?flags[p.name]==='pick':filter==='reject'?flags[p.name]==='reject':(ratings[p.name]??0)>=Number(filter)),sort,ratings,flags); // the filter never hides the strip itself; sorting is display-only, prev/next keeps library order
 const strip=useRef<HTMLDivElement|null>(null);
 useEffect(()=>{strip.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({block:'nearest',inline:'nearest'});},[active]);
 const selected=photos.filter(p=>sel.includes(p.name));
 const activeSession=active?getPhotoSession(active):null;
 const neutral=!activeSession||isNeutralLook(activeSession.now); // nothing worth applying
 const applyToSelection=async()=>{
  if(applying||selected.length<2||!activeSession||neutral)return;
  setApplying(true);setApplyNote(null);
  const out=await syncLookToPhotos(selected,extractLook(activeSession.now));
  setApplyNote(t('photos.filmstrip.applyDone',{applied:out.saved.length,failed:out.failed.length}));
  setApplying(false);
 };
 if(all.length<2)return null;
 return <div ref={strip} className="photos-filmstrip flex items-center gap-1.5 overflow-x-auto border-t border-subtle px-3 py-1.5" role="navigation" aria-label={t('photos.filmstrip.aria')} data-testid="photos-filmstrip">
  <NativeSelect value={filter} aria-label={t('photos.rating.filter')} title={t('photos.rating.filter')} onChange={e=>setMinRating(e.currentTarget.value)} className="h-7 shrink-0" data-testid="photos-filmstrip-rating-filter">
   <option value="0">{t('photos.rating.filter.all')}</option>
   {Array.from({length:MAX_RATING},(_,i)=>i+1).map(n=><option key={n} value={String(n)}>{`≥ ${n}`}</option>)}
   <option value="pick">{t('photos.flag.filter.pick')}</option>
   <option value="reject">{t('photos.flag.filter.reject')}</option>
  </NativeSelect>
  <NativeSelect value={sort} aria-label={t('photos.filmstrip.sort')} title={t('photos.filmstrip.sort')} onChange={e=>setSort(e.currentTarget.value as FilmstripSort)} className="h-7 shrink-0" data-testid="photos-filmstrip-sort">
   {FILMSTRIP_SORTS.map(m=><option key={m} value={m}>{t(`photos.filmstrip.sort.${m}`)}</option>)}
  </NativeSelect>
  {selected.length>1&&<Button variant="outline" size="compact" disabled={applying||neutral} onClick={()=>void applyToSelection()} data-testid="photos-filmstrip-apply">{t('photos.filmstrip.apply',{count:selected.length})}</Button>}
  {applyNote&&<span className="shrink-0 text-ink-3" data-testid="photos-filmstrip-apply-note">{applyNote}</span>}
  <RatingStars name={active} prefix="photos-filmstrip"/>
  {photos.map(p=><Button key={p.name} variant="outline" size="compact" aria-pressed={p.name===active} aria-label={p.name} onClick={e=>{
   if(e.shiftKey){const names=photos.map(q=>q.name);setSel(rangeSelect(names,anchor,p.name));}
   else if(e.ctrlKey||e.metaKey){setSel(toggleSelect(sel,p.name));setAnchor(p.name);}
   else{setSel([p.name]);setAnchor(p.name);setApplyNote(null);setActiveMedia(p.name);}
  }} className={`relative h-14 shrink-0 overflow-hidden px-0.5${sel.includes(p.name)&&sel.length>1?' ring-2 ring-[var(--accent)]':''}`} data-selected={sel.includes(p.name)&&sel.length>1||undefined} data-testid={`photos-filmstrip-item-${p.name}`}>
   <img src={p.url} alt="" className="h-full w-auto max-w-24 rounded-[2px] object-cover"/>
   {(ratings[p.name]??0)>0&&<span className="absolute bottom-0.5 right-0.5 flex items-center gap-0.5 rounded-[2px] bg-elevated px-1 text-ink" data-testid={`photos-filmstrip-rating-badge-${p.name}`}><Star size={10} fill="currentColor" className="text-[var(--accent)]"/>{ratings[p.name]}</span>}
   {flags[p.name]&&<span className="absolute bottom-0.5 left-0.5 flex items-center rounded-[2px] bg-elevated px-1 text-ink" data-testid={`photos-filmstrip-flag-${p.name}`} data-flag={flags[p.name]}><Flag size={10} fill="currentColor" className={flags[p.name]==='pick'?'text-[var(--accent)]':'text-[var(--danger)]'}/></span>}
  </Button>)}
 </div>;
}
