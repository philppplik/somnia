import {useEffect,useRef} from 'react';
import {Check,X} from '../../lib/icons';
import {useT} from '../../lib/useT';
import type {MediaItem} from '../../lib/media';
import {ensurePhotoReady} from '../../lib/photos/batchExport';
import {getPhotoSession} from '../../lib/photos/studioSession';
import {useFlags} from '../../lib/photos/flags';
import {cullSetFlag} from '../../lib/photos/cullHistory';
import {PHOTO_LABELS,useLabels} from '../../lib/photos/labels';
import {FILMSTRIP_SORTS,type FilmstripSort} from '../../lib/photos/filmstripSort';
import {usePanelState} from '../../store/panelStateStore';
import {toggleSelect} from '../../lib/photos/selection';
import {useVisiblePhotos} from './useVisiblePhotos';
import {NativeSelect} from '../ui/native-controls';
import {RatingStars} from './RatingStars';
import {Flag} from '../../lib/icons';
import {Button} from '../ui/button';

/** Survey overlay: the developed frames of the selected photos side by side. Sessions open on demand; clicking a cell activates that photo and closes. */
export function PhotosSurvey({names,items,live=false,onPick,onClose}:{names:string[];items:readonly MediaItem[];live?:boolean;onPick:(name:string)=>void;onClose:()=>void}){
 const {t}=useT();
 const canvases=useRef(new Map<string,HTMLCanvasElement>());
 const flags=useFlags();
 const labels=useLabels();
 const vis=useVisiblePhotos();
 const [,setFilter]=usePanelState<number|string>('photos.ratingFilter',0);
 const [,setSort]=usePanelState<FilmstripSort>('photos.filmstripSort','library');
 const shown=live?vis.photos.map(p=>p.name):names; // live: the grid follows the filter and sort
 const [sel,setSel]=usePanelState<string[]>('photos.filmstripSelection',[]);
 useEffect(()=>{
  let live=true;
  void(async()=>{
   for(const n of shown){
    const item=items.find(i=>i.name===n);if(!item)continue;
    try{await ensurePhotoReady(item);}catch{continue;} // a photo that fails to open just stays blank
    if(!live)return;
    const f=getPhotoSession(n)?.frame,c=canvases.current.get(n);
    if(f&&c){
     const off=document.createElement('canvas');off.width=f.width;off.height=f.height;
     off.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(f.bytes),f.width,f.height),0,0);
     c.getContext('2d')!.drawImage(off,0,0,c.width,c.height);
    }
   }
  })();
  return()=>{live=false;};
 },[shown,items]);
 return <div className="absolute inset-0 z-20 flex flex-col gap-2 overflow-auto bg-elevated p-4" data-testid="photos-survey">
  <div className="flex items-center justify-between">
   <span className="font-medium text-ink" data-testid="photos-survey-count">{t('photos.survey.title',{count:shown.length})}</span>
   {sel.length>0&&<span className="text-ink-3" data-testid="photos-survey-selcount">{t('photos.survey.selected',{count:sel.length})}</span>}
   {live&&<span className="flex items-center gap-1.5">
    <NativeSelect value={vis.filter} aria-label={t('photos.rating.filter')} title={t('photos.rating.filter')} onChange={e=>setFilter(e.currentTarget.value)} className="h-7" data-testid="photos-survey-filter">
     <option value="0">{t('photos.rating.filter.all')}</option>
     {[1,2,3,4,5].map(n=><option key={n} value={String(n)}>{`≥ ${n}`}</option>)}
     <option value="unrated">{t('photos.rating.filter.unrated')}</option>
     <option value="pick">{t('photos.flag.filter.pick')}</option>
     <option value="reject">{t('photos.flag.filter.reject')}</option>
     {PHOTO_LABELS.map(l=><option key={l} value={`label:${l}`}>{t(`photos.label.${l}`)}</option>)}
    </NativeSelect>
    <NativeSelect value={vis.sort} aria-label={t('photos.filmstrip.sort')} title={t('photos.filmstrip.sort')} onChange={e=>setSort(e.currentTarget.value as FilmstripSort)} className="h-7" data-testid="photos-survey-sort">
     {FILMSTRIP_SORTS.map(m=><option key={m} value={m}>{t(`photos.filmstrip.sort.${m}`)}</option>)}
    </NativeSelect>
   </span>}
   <Button size="icon" variant="outline" aria-label={t('photos.survey.close')} onClick={onClose} data-testid="photos-survey-close"><X size={14}/></Button>
  </div>
  <div className="grid flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
   {shown.map(n=><div key={n} className="flex flex-col gap-1 rounded-[4px] border border-subtle p-1.5" data-testid={`photos-survey-item-${n}`}>
    <div className="relative">
     <Button variant="ghost" size="compact" className="h-auto w-full p-0" aria-label={n} onClick={()=>onPick(n)} data-testid={`photos-survey-pick-${n}`}>
      <canvas ref={c=>{if(c)canvases.current.set(n,c);else canvases.current.delete(n);}} width={320} height={200} className="h-auto w-full rounded-[2px] bg-[var(--bg-base)]" data-testid={`photos-survey-canvas-${n}`}/>
     </Button>
     <Button variant="outline" size="icon" aria-pressed={sel.includes(n)} aria-label={t('photos.survey.toggle',{name:n})} title={t('photos.survey.toggle',{name:n})} onClick={()=>setSel(toggleSelect(sel,n))} className="absolute top-1 left-1 h-6 w-6" data-testid={`photos-survey-select-${n}`}>
      <Check size={12} className={sel.includes(n)?'text-[var(--accent)]':'text-ink-3'}/>
     </Button>
    </div>
    <div className="flex items-center justify-between gap-1">
     <span className="flex min-w-0 items-center gap-1 truncate text-ink-3">{labels[n]&&<span className={`photos-label-dot photos-label-${labels[n]} shrink-0`} data-testid={`photos-survey-label-${n}`} data-label={labels[n]}/>}{n}</span>
     <RatingStars name={n} prefix={`photos-survey-${n}`}/>
     <span className="flex items-center gap-0.5">
      <Button variant="ghost" size="compact" aria-pressed={flags[n]==='pick'} aria-label={t('photos.flag.filter.pick')} title={t('photos.flag.filter.pick')} onClick={()=>cullSetFlag(n,flags[n]==='pick'?null:'pick')} className="px-1" data-testid={`photos-survey-pick-flag-${n}`}><Flag size={12} fill={flags[n]==='pick'?'currentColor':'none'} className={flags[n]==='pick'?'text-[var(--accent)]':'text-ink-3'}/></Button>
      <Button variant="ghost" size="compact" aria-pressed={flags[n]==='reject'} aria-label={t('photos.flag.filter.reject')} title={t('photos.flag.filter.reject')} onClick={()=>cullSetFlag(n,flags[n]==='reject'?null:'reject')} className="px-1" data-testid={`photos-survey-reject-flag-${n}`}><Flag size={12} fill={flags[n]==='reject'?'currentColor':'none'} className={flags[n]==='reject'?'text-[var(--danger)]':'text-ink-3'}/></Button>
     </span>
    </div>
   </div>)}
  </div>
 </div>;
}
