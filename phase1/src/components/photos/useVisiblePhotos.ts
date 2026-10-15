import {useMedia} from '../../lib/media';
import {developablePhotos} from '../../lib/photos/photoNav';
import {sortFilmstrip,type FilmstripSort} from '../../lib/photos/filmstripSort';
import {useRatings} from '../../lib/photos/ratings';
import {useFlags} from '../../lib/photos/flags';
import {useLabels} from '../../lib/photos/labels';
import {usePhotoTags} from '../../lib/photos/tags';
import type {PhotoLabel} from '../../lib/photos/labels';
import {usePanelState} from '../../store/panelStateStore';
import {useHidden} from '../../lib/photos/hidden';

/** The smart filter's rule set: an on switch plus the AND-combined rules minimum rating, flag, color label and exact keyword tag. */
export interface SmartFilter{on:boolean;minRating:number;flag:string;label:string;tag:string}
/** The filmstrip's visible list: developable photos after the rating/flag/label filter and the chosen sort. Shared by the filmstrip and the live library grid. */
export function useVisiblePhotos(){
 const media=useMedia();
 const ratings=useRatings();
 const flags=useFlags();
 const labels=useLabels();
 const tags=usePhotoTags();
 const [minRating]=usePanelState<number|string>('photos.ratingFilter',0);
 const [sort]=usePanelState<FilmstripSort>('photos.filmstripSort','library');
 const [query]=usePanelState<string>('photos.searchQuery','');
 const [smart]=usePanelState<SmartFilter>('photos.smartFilter',{on:false,minRating:0,flag:'',label:'',tag:''});
 const filter=String(minRating); // legacy stored numbers and 'pick'/'reject'/'unrated'/'label:*' share one select
 const smartOn=smart.on&&(smart.minRating>0||smart.flag!==''||smart.label!==''||smart.tag.trim()!=='');
 const hidden=useHidden();
 const hiddenSet=new Set(hidden);
 const total=developablePhotos(media.items).length;
 const all=developablePhotos(media.items).filter(p=>!hiddenSet.has(p.name));
 const q=query.trim().toLowerCase();
 const smartTag=smart.tag.trim();
 const visible=all.filter(p=>!smartOn||((ratings[p.name]??0)>=smart.minRating&&(smart.flag===''||(smart.flag==='none'?flags[p.name]==null:flags[p.name]===smart.flag))&&(smart.label===''||(smart.label==='none'?labels[p.name]==null:labels[p.name]===smart.label))&&(smartTag===''||(tags[p.name]??[]).some(t=>t.toLowerCase()===smartTag.toLowerCase()))));
 const photos=sortFilmstrip(visible.filter(p=>q&&!(p.name.toLowerCase().includes(q)||(tags[p.name]??[]).some(t=>t.toLowerCase().includes(q)))?false:filter==='pick'?flags[p.name]==='pick':filter==='reject'?flags[p.name]==='reject':filter==='unrated'?!(ratings[p.name]>=1):filter.startsWith('label:')?labels[p.name]===filter.slice(6):filter.startsWith('tag:')?(tags[p.name]??[]).includes(filter.slice(4)):(ratings[p.name]??0)>=Number(smartOn?0:filter)),sort,ratings,flags); // sorting is display-only, prev/next keeps library order
 return {photos,all,total,ratings,flags,labels,tags,filter,sort,query,smart,smartOn,hidden};
}
