import {useEffect,useRef,useState} from 'react';
import {Star} from 'lucide-react';
import {Flag,LayoutGrid,SkipForward,Tag,Trash2} from '../../lib/icons';
import {useT} from '../../lib/useT';
import {closeMedia,getMedia,setActiveMedia,useMedia} from '../../lib/media';
import {developablePhotos} from '../../lib/photos/photoNav';
import {rangeSelect,toggleSelect} from '../../lib/photos/selection';
import {syncLookToPhotos} from '../../lib/photos/batchExport';
import {findWbPreset,WB_PRESETS} from '../../lib/photos/wbPresets';
import {applyLook,BUILT_IN_PRESETS,extractLook,isNeutralLook,parseUserPresets,type Look,type UserPreset} from '../../lib/photos/presets';
import {commitPhotoSettings,getPhotoSession} from '../../lib/photos/studioSession';
import {FILMSTRIP_SORTS,type FilmstripSort} from '../../lib/photos/filmstripSort';
import {MAX_RATING,useRatings} from '../../lib/photos/ratings';
import {useFlags} from '../../lib/photos/flags';
import {PHOTO_LABELS,setLabel,useLabels,type PhotoLabel} from '../../lib/photos/labels';
import {addTags,allTags,setTags} from '../../lib/photos/tags';
import {usePanelState} from '../../store/panelStateStore';
import {Button} from '../ui/button';
import {NativeInput,NativeSelect} from '../ui/native-controls';
import {RatingStars} from './RatingStars';
import {useVisiblePhotos} from './useVisiblePhotos';

/** Library filmstrip under the workspace: a thumbnail per developable photo in library order; clicking switches the active photo. */
export function PhotosFilmstrip({active,onSurvey}:{active:string;onSurvey?:(names:string[])=>void}){
 const {t}=useT();
 const media=useMedia();
 const {ratings,flags,labels,tags,filter,all,photos,sort}=useVisiblePhotos();
 const [,setMinRating]=usePanelState<number|string>('photos.ratingFilter',0);
 const [,setSort]=usePanelState<FilmstripSort>('photos.filmstripSort','library');
 const [sel,setSel]=usePanelState<string[]>('photos.filmstripSelection',[]);
 const [autoAdvance,setAutoAdvance]=usePanelState<boolean>('photos.autoAdvance',false);
 const [anchor,setAnchor]=usePanelState<string|null>('photos.filmstripAnchor',null);
 const [applyNote,setApplyNote]=useState<string|null>(null);
 const [armRemove,setArmRemove]=useState(false);
 const [rawPresets]=usePanelState<unknown>('photos.presets.user',[]);
 const [applying,setApplying]=useState(false);
 const [copied,setCopied]=usePanelState<Look|null>('photos.copiedLook',null);
 const strip=useRef<HTMLDivElement|null>(null);
 useEffect(()=>{strip.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({block:'nearest',inline:'nearest'});},[active]);
 const selected=photos.filter(p=>sel.includes(p.name));
 const activeSession=active?getPhotoSession(active):null;
 const neutral=!activeSession||isNeutralLook(activeSession.now); // nothing worth applying
 const userPresets:UserPreset[]=parseUserPresets(rawPresets);
 const applyLookToSelection=async(look:Parameters<typeof syncLookToPhotos>[1])=>{
  if(applying||selected.length<2)return;
  setApplying(true);setApplyNote(null);
  const out=await syncLookToPhotos(selected,look);
  setApplyNote(t('photos.filmstrip.applyDone',{applied:out.saved.length,failed:out.failed.length}));
  setApplying(false);
 };
 const applyToSelection=async()=>{
  if(applying||selected.length<2||!activeSession||neutral)return;
  await applyLookToSelection(extractLook(activeSession.now));
 };
 const rejected=all.filter(p=>flags[p.name]==='reject');
 const removeRejected=()=>{
  if(!armRemove){setArmRemove(true);return;}
  setArmRemove(false);
  const names=new Set(rejected.map(p=>p.name));
  for(const n of names)closeMedia(n); // sessions close through the media cleanup hook
  setSel(sel.filter(n=>!names.has(n)));
  const next=developablePhotos(getMedia().items)[0]; // the library is already updated
  setActiveMedia(next?next.name:null);
 };
 if(all.length<2)return null;
 return <div ref={strip} className="photos-filmstrip flex items-center gap-1.5 overflow-x-auto border-t border-subtle px-3 py-1.5" role="navigation" aria-label={t('photos.filmstrip.aria')} data-testid="photos-filmstrip">
  <NativeSelect value={filter} aria-label={t('photos.rating.filter')} title={t('photos.rating.filter')} onChange={e=>setMinRating(e.currentTarget.value)} className="h-7 shrink-0" data-testid="photos-filmstrip-rating-filter">
   <option value="0">{t('photos.rating.filter.all')}</option>
   {Array.from({length:MAX_RATING},(_,i)=>i+1).map(n=><option key={n} value={String(n)}>{`≥ ${n}`}</option>)}
   <option value="unrated">{t('photos.rating.filter.unrated')}</option>
   <option value="pick">{t('photos.flag.filter.pick')}</option>
   <option value="reject">{t('photos.flag.filter.reject')}</option>
   {PHOTO_LABELS.map(l=><option key={l} value={`label:${l}`}>{t(`photos.label.${l}`)}</option>)}
   {allTags().map(tag=><option key={tag} value={`tag:${tag}`}>{tag}</option>)}
  </NativeSelect>
  <NativeSelect value={sort} aria-label={t('photos.filmstrip.sort')} title={t('photos.filmstrip.sort')} onChange={e=>setSort(e.currentTarget.value as FilmstripSort)} className="h-7 shrink-0" data-testid="photos-filmstrip-sort">
   {FILMSTRIP_SORTS.map(m=><option key={m} value={m}>{t(`photos.filmstrip.sort.${m}`)}</option>)}
  </NativeSelect>
  <NativeSelect value="" aria-label={t('photos.filmstrip.select')} title={t('photos.filmstrip.select')} onChange={e=>{
   const v=e.currentTarget.value;e.currentTarget.value='';
   if(v==='all')setSel(photos.map(p=>p.name));
   else if(v==='unrated')setSel(photos.filter(p=>!(ratings[p.name]>=1)).map(p=>p.name));
   else if(v==='none')setSel([]);
  }} className="h-7 shrink-0" data-testid="photos-filmstrip-select">
   <option value="" disabled>{t('photos.filmstrip.select')}</option>
   <option value="all">{t('photos.filmstrip.selectAll')}</option>
   <option value="unrated">{t('photos.filmstrip.selectUnrated')}</option>
   <option value="none">{t('photos.filmstrip.selectNone')}</option>
  </NativeSelect>
  <NativeSelect value="" aria-label={t('photos.label.set')} title={t('photos.label.set')} onChange={e=>{
   const v=e.currentTarget.value;e.currentTarget.value='';
   for(const n of selected.length>1?selected.map(p=>p.name):[active])setLabel(n,v==='none'?null:v as PhotoLabel); // selection first, else the active photo
  }} className="h-7 shrink-0" data-testid="photos-filmstrip-label">
   <option value="" disabled>{t('photos.label.set')}</option>
   {PHOTO_LABELS.map(l=><option key={l} value={l}>{t(`photos.label.${l}`)}</option>)}
   <option value="none">{t('photos.label.none')}</option>
  </NativeSelect>
  <NativeInput key={active} type="text" defaultValue={(tags[active]??[]).join(', ')} aria-label={t('photos.tags.label')} title={t('photos.tags.label')} placeholder={t('photos.tags.label')} className="h-7 w-36 shrink-0" data-testid="photos-filmstrip-tags"
   onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}
   onBlur={e=>{const v=e.currentTarget.value.split(',');for(const n of selected.length>1?selected.map(p=>p.name):[active]){if(selected.length>1)addTags(n,v);else setTags(n,v);}}}/> {/* batch merges, a single photo replaces */}
  <Button variant="outline" size="compact" disabled={neutral} onClick={()=>activeSession&&setCopied(extractLook(activeSession.now))} data-testid="photos-filmstrip-copy">{t('photos.filmstrip.copy')}</Button>
  <Button variant="outline" size="compact" disabled={!copied||applying||(!active&&selected.length<2)} onClick={()=>{
   if(!copied)return;
   if(selected.length>1)void applyLookToSelection(copied); // paste onto every selected photo
   else if(active)commitPhotoSettings(active,cur=>applyLook(cur,copied));
  }} data-testid="photos-filmstrip-paste">{t('photos.filmstrip.paste')}</Button>
  {selected.length>1&&<Button variant="outline" size="compact" disabled={applying||neutral} onClick={()=>void applyToSelection()} data-testid="photos-filmstrip-apply">{t('photos.filmstrip.apply',{count:selected.length})}</Button>}
  {selected.length>1&&<NativeSelect value="" disabled={applying} aria-label={t('photos.filmstrip.applyPreset')} title={t('photos.filmstrip.applyPreset')} onChange={e=>{
   const v=e.currentTarget.value;e.currentTarget.value='';
   const wb=v.startsWith('wb:')?findWbPreset(v.slice(3)):undefined;
   const look=wb?{temp:wb.temp,tint:wb.tint}:v.startsWith('user:')?userPresets.find(p=>p.id===v.slice(5))?.look:BUILT_IN_PRESETS.find(p=>p.id===v)?.look;
   if(look)void applyLookToSelection(look);
  }} className="h-7 shrink-0" data-testid="photos-filmstrip-apply-preset">
   <option value="" disabled>{t('photos.filmstrip.applyPreset')}</option>
   {BUILT_IN_PRESETS.map(p=><option key={p.id} value={p.id}>{t(p.labelKey)}</option>)}
   {WB_PRESETS.map(p=><option key={p.id} value={`wb:${p.id}`}>{t(p.labelKey)}</option>)}
   {userPresets.map(p=><option key={p.id} value={`user:${p.id}`}>{p.name}</option>)}
  </NativeSelect>}
  {onSurvey&&<Button variant="outline" size="icon" aria-label={t('photos.filmstrip.survey')} title={t('photos.filmstrip.survey')} onClick={()=>onSurvey(selected.length>1?selected.map(p=>p.name):[])} className="h-7 w-7 shrink-0" data-testid="photos-filmstrip-survey"><LayoutGrid size={12}/></Button>} // with a selection it surveys the selection, else the whole filtered view
  {rejected.length>0&&<Button variant={armRemove?'primary':'outline'} size="compact" onClick={removeRejected} className="shrink-0" data-testid="photos-filmstrip-remove-rejects"><Trash2 size={12}/>{armRemove?t('photos.filmstrip.removeRejectsConfirm',{count:rejected.length}):t('photos.filmstrip.removeRejects',{count:rejected.length})}</Button>}
  <Button variant="outline" size="icon" aria-pressed={autoAdvance} aria-label={t('photos.filmstrip.autoAdvance')} title={t('photos.filmstrip.autoAdvance')} onClick={()=>setAutoAdvance(!autoAdvance)} className="h-7 w-7 shrink-0" data-testid="photos-filmstrip-autoadvance"><SkipForward size={12}/></Button>
  {applyNote&&<span className="shrink-0 text-ink-3" data-testid="photos-filmstrip-apply-note">{applyNote}</span>}
  <RatingStars name={active} prefix="photos-filmstrip"/>
  {photos.map(p=><Button key={p.name} variant="outline" size="compact" aria-pressed={p.name===active} aria-label={p.name} onClick={e=>{
   if(e.shiftKey){const names=photos.map(q=>q.name);setSel(rangeSelect(names,anchor,p.name));}
   else if(e.ctrlKey||e.metaKey){setSel(toggleSelect(sel,p.name));setAnchor(p.name);}
   else{setSel([p.name]);setAnchor(p.name);setApplyNote(null);setActiveMedia(p.name);}
  }} className={`relative h-14 shrink-0 overflow-hidden px-0.5${sel.includes(p.name)&&sel.length>1?' ring-2 ring-[var(--accent)]':''}`} data-selected={sel.includes(p.name)&&sel.length>1||undefined} data-testid={`photos-filmstrip-item-${p.name}`}>
   <img src={p.url} alt="" className="h-full w-auto max-w-24 rounded-[2px] object-cover"/>
   {labels[p.name]&&<span className={`photos-label-dot photos-label-${labels[p.name]} absolute top-0.5 right-0.5`} data-testid={`photos-filmstrip-label-${p.name}`} data-label={labels[p.name]}/>}
   {(tags[p.name]?.length??0)>0&&<span className="absolute top-0.5 left-0.5 flex max-w-[70%] items-center gap-0.5 truncate rounded-[2px] bg-elevated px-1 text-ink-3" title={(tags[p.name]??[]).join(', ')} data-testid={`photos-filmstrip-tags-badge-${p.name}`}><Tag size={10}/>{tags[p.name]![0]}{tags[p.name]!.length>1?` +${tags[p.name]!.length-1}`:''}</span>}
   {(ratings[p.name]??0)>0&&<span className="absolute bottom-0.5 right-0.5 flex items-center gap-0.5 rounded-[2px] bg-elevated px-1 text-ink" data-testid={`photos-filmstrip-rating-badge-${p.name}`}><Star size={10} fill="currentColor" className="text-[var(--accent)]"/>{ratings[p.name]}</span>}
   {flags[p.name]&&<span className="absolute bottom-0.5 left-0.5 flex items-center rounded-[2px] bg-elevated px-1 text-ink" data-testid={`photos-filmstrip-flag-${p.name}`} data-flag={flags[p.name]}><Flag size={10} fill="currentColor" className={flags[p.name]==='pick'?'text-[var(--accent)]':'text-[var(--danger)]'}/></span>}
  </Button>)}
 </div>;
}
