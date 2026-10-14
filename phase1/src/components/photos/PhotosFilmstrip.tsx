import {useEffect,useRef} from 'react';
import {useT} from '../../lib/useT';
import {setActiveMedia,useMedia} from '../../lib/media';
import {developablePhotos} from '../../lib/photos/photoNav';
import {Button} from '../ui/button';

/** Library filmstrip under the workspace: a thumbnail per developable photo in library order; clicking switches the active photo. */
export function PhotosFilmstrip({active}:{active:string}){
 const {t}=useT();
 const media=useMedia();
 const photos=developablePhotos(media.items);
 const strip=useRef<HTMLDivElement|null>(null);
 useEffect(()=>{strip.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({block:'nearest',inline:'nearest'});},[active]);
 if(photos.length<2)return null;
 return <div ref={strip} className="photos-filmstrip flex items-center gap-1.5 overflow-x-auto border-t border-subtle px-3 py-1.5" role="navigation" aria-label={t('photos.filmstrip.aria')} data-testid="photos-filmstrip">
  {photos.map(p=><Button key={p.name} variant="outline" size="compact" aria-pressed={p.name===active} aria-label={p.name} onClick={()=>setActiveMedia(p.name)} className="h-14 shrink-0 overflow-hidden px-0.5" data-testid={`photos-filmstrip-item-${p.name}`}>
   <img src={p.url} alt="" className="h-full w-auto max-w-24 rounded-[2px] object-cover"/>
  </Button>)}
 </div>;
}
