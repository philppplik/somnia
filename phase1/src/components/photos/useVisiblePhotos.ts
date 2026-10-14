import {useMedia} from '../../lib/media';
import {developablePhotos} from '../../lib/photos/photoNav';
import {sortFilmstrip,type FilmstripSort} from '../../lib/photos/filmstripSort';
import {useRatings} from '../../lib/photos/ratings';
import {useFlags} from '../../lib/photos/flags';
import {useLabels} from '../../lib/photos/labels';
import {usePanelState} from '../../store/panelStateStore';

/** The filmstrip's visible list: developable photos after the rating/flag/label filter and the chosen sort. Shared by the filmstrip and the live library grid. */
export function useVisiblePhotos(){
 const media=useMedia();
 const ratings=useRatings();
 const flags=useFlags();
 const labels=useLabels();
 const [minRating]=usePanelState<number|string>('photos.ratingFilter',0);
 const [sort]=usePanelState<FilmstripSort>('photos.filmstripSort','library');
 const filter=String(minRating); // legacy stored numbers and 'pick'/'reject'/'unrated'/'label:*' share one select
 const all=developablePhotos(media.items);
 const photos=sortFilmstrip(all.filter(p=>filter==='pick'?flags[p.name]==='pick':filter==='reject'?flags[p.name]==='reject':filter==='unrated'?!(ratings[p.name]>=1):filter.startsWith('label:')?labels[p.name]===filter.slice(6):(ratings[p.name]??0)>=Number(filter)),sort,ratings,flags); // sorting is display-only, prev/next keeps library order
 return {photos,all,ratings,flags,labels,filter,sort};
}
